import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

interface Position {
  x: number;
  y: number;
}

interface PlayerPosition {
  userId: string;
  characterId: string;
  nickname: string;
  chunkId: string;
  position: Position;
  timestamp: number;
}

export class MovementService {
  // Maximum allowed movement distance per update (to prevent teleporting)
  private readonly MAX_MOVE_DISTANCE = 10;

  async getMaxMoveDistance(characterId: string): Promise<number> {
    const rows: any = await query(
      'SELECT speed_multiplier FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1',
      [characterId]
    );
    return this.MAX_MOVE_DISTANCE * (rows.length ? Number(rows[0].speed_multiplier) : 1);
  }

  /**
   * Calculate chunk ID from grid coordinates
   */
  getChunkId(x: number, y: number): string {
    const chunkX = Math.floor(x / 32); // Assuming 32x32 grid per chunk
    const chunkY = Math.floor(y / 32);
    return `${chunkX}_${chunkY}`;
  }

  /**
   * Calculate distance between two positions
   */
  calculateDistance(pos1: Position, pos2: Position): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Validate movement is within acceptable range
   */
  validateMovement(oldPos: Position, newPos: Position): boolean {
    const distance = this.calculateDistance(oldPos, newPos);
    return distance <= this.MAX_MOVE_DISTANCE;
  }

  /**
   * Handle player movement
   */
  async handlePlayerMove(
    userId: string,
    characterId: string,
    nickname: string,
    newPosition: Position
  ): Promise<{
    position: Position;
    chunkId: string;
    chunkChanged: boolean;
    oldChunkId?: string;
    equippedVehicle: { id: number; vehicleType: string; speedMultiplier: number } | null;
  }> {
    try {
      // Get current position from Redis cache
      const cacheKey = prefixKey(`player:${characterId}:position`);
      const cachedData = await redisClient.get(cacheKey);

      let oldPosition: Position | null = null;
      let oldChunkId: string | null = null;

      if (cachedData) {
        const cached = JSON.parse(cachedData);
        oldPosition = cached.position;
        oldChunkId = cached.chunkId;

        // Validate movement distance
        const maxDistance = await this.getMaxMoveDistance(characterId);
        if (oldPosition && this.calculateDistance(oldPosition, newPosition) > maxDistance) {
          logger.warn(`Invalid movement detected for user ${userId}: distance too large`);
          throw new AppError('Invalid movement: distance too large', 400);
        }

      } else {
        // First movement, fetch from database
        const rows: any = await query(
          'SELECT grid_x, grid_y, current_chunk_id FROM characters WHERE id = ?',
          [characterId]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
          throw new AppError('Character not found', 404);
        }

        oldPosition = { x: rows[0].grid_x, y: rows[0].grid_y };
        oldChunkId = rows[0].current_chunk_id;

        const maxDistance = await this.getMaxMoveDistance(characterId);
        if (oldPosition && this.calculateDistance(oldPosition, newPosition) > maxDistance) {
          logger.warn(`Invalid movement detected for user ${userId}: distance too large`);
          throw new AppError('Invalid movement: distance too large', 400);
        }
      }

      // Calculate new chunk
      const newChunkId = this.getChunkId(newPosition.x, newPosition.y);
      const chunkChanged = oldChunkId !== newChunkId;

      // Update position in Redis cache
      const playerData: PlayerPosition = {
        userId,
        characterId,
        nickname,
        chunkId: newChunkId,
        position: newPosition,
        timestamp: Date.now(),
      };

      await redisClient.setEx(
        cacheKey,
        300, // 5 minutes TTL
        JSON.stringify(playerData)
      );

      // Update database asynchronously (don't wait)
      this.updatePositionInDatabase(characterId, newPosition, newChunkId).catch((err) => {
        logger.error('Failed to update position in database', err);
      });

      logger.debug(`Player ${nickname} moved to (${newPosition.x}, ${newPosition.y})`);

      return {
        position: newPosition,
        chunkId: newChunkId,
        chunkChanged,
        equippedVehicle: await (async () => {
          const rows: any = await query(
            'SELECT id, vehicle_type AS vehicleType, speed_multiplier AS speedMultiplier FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1',
            [characterId]
          );
          return rows.length ? { id: Number(rows[0].id), vehicleType: rows[0].vehicleType, speedMultiplier: Number(rows[0].speedMultiplier) } : null;
        })(),
        ...(oldChunkId ? { oldChunkId } : {}),
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Movement handling error', error);
      throw new AppError('Movement failed', 500);
    }
  }

  /** Authoritative non-walk teleport used by portals and social travel. */
  async teleportPlayer(
    userId: string, characterId: string, nickname: string,
    position: Position, chunkId: string
  ): Promise<void> {
    const playerData: PlayerPosition = {
      userId, characterId, nickname, chunkId, position, timestamp: Date.now(),
    };
    await redisClient.setEx(
      prefixKey(`player:${characterId}:position`),
      300,
      JSON.stringify(playerData)
    );
    await this.updatePositionInDatabase(characterId, position, chunkId);
  }

  /**
   * Update position in database (async, non-blocking)
   */
  private async updatePositionInDatabase(
    characterId: string,
    position: Position,
    chunkId: string
  ): Promise<void> {
    try {
      await query(
        'UPDATE characters SET grid_x = ?, grid_y = ?, current_chunk_id = ? WHERE id = ?',
        [position.x, position.y, chunkId, characterId]
      );
    } catch (error) {
      logger.error('Database position update failed', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get all players in a chunk
   */
  async getPlayersInChunk(chunkId: string): Promise<PlayerPosition[]> {
    try {
      // Scan Redis for all players (in production, use a Set per chunk)
      const pattern = prefixKey('player:*:position');
      const keys: string[] = [];

      // Using SCAN to avoid blocking
      let cursor = '0';
      do {
        const result = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = result.cursor.toString();
        keys.push(...result.keys);
      } while (cursor !== '0');

      // Fetch all player data
      const players: PlayerPosition[] = [];
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          const player: PlayerPosition = JSON.parse(data);
          if (player.chunkId === chunkId) {
            players.push(player);
          }
        }
      }

      return players;
    } catch (error) {
      logger.error('Failed to get players in chunk', error);
      return [];
    }
  }

  /**
   * Get player current position
   */
  async getPlayerPosition(characterId: string): Promise<PlayerPosition | null> {
    try {
      const cacheKey = prefixKey(`player:${characterId}:position`);
      const data = await redisClient.get(cacheKey);

      if (data) {
        return JSON.parse(data);
      }

      // Fallback to database
      const rows: any = await query(
        `SELECT c.id as characterId, c.user_id as userId, c.nickname,
         c.grid_x, c.grid_y, c.current_chunk_id
         FROM characters c WHERE c.id = ?`,
        [characterId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const char = rows[0];
      return {
        userId: char.userId.toString(),
        characterId: char.characterId.toString(),
        nickname: char.nickname,
        chunkId: char.current_chunk_id,
        position: { x: char.grid_x, y: char.grid_y },
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to get player position', error);
      return null;
    }
  }

  /**
   * Load a player's position (from Redis or DB) and write it back to Redis so
   * that `getPlayersInChunk` can discover them. Called on socket connect, since
   * a player who has never moved has no Redis entry and would otherwise be
   * invisible to other players joining the same chunk.
   */
  async ensurePlayerCached(characterId: string): Promise<PlayerPosition | null> {
    const position = await this.getPlayerPosition(characterId);
    if (!position) return null;

    try {
      const cacheKey = prefixKey(`player:${characterId}:position`);
      await redisClient.setEx(cacheKey, 300, JSON.stringify(position));
    } catch (error) {
      logger.error('Failed to cache player position', error);
    }

    return position;
  }
}

export default new MovementService();
