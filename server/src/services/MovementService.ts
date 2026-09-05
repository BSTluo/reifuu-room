import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import VehicleService from './VehicleService.js';

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

/** Chunk terrain type: continents are quadrant-based, ocean separates them along the axes. */
export type ChunkTerrainType = 'land' | 'ocean';

/**
 * 海洋区块宽度（GDD 2.8: 大洲间由 5-10 个连续海洋区块分隔）。
 * 区块 ID 形如 "chunkX_chunkY"；大洲按象限划分（PigeonMailService.getContinentOfChunk），
 * 海洋区块位于 |chunkX| 或 |chunkY| 小于 OCEAN_CHUNK_WIDTH 的轴带。
 */
export const OCEAN_CHUNK_WIDTH = 5;

/**
 * 判断区块是否为海洋区块（服务端权威，客户端 world.ts 用相同算法保持一致）。
 */
export function isOceanChunk(chunkX: number, chunkY: number): boolean {
  return Math.abs(chunkX) < OCEAN_CHUNK_WIDTH || Math.abs(chunkY) < OCEAN_CHUNK_WIDTH;
}

export class MovementService {
  // Maximum allowed movement distance per update (to prevent teleporting)
  private readonly MAX_MOVE_DISTANCE = 10;

  /**
   * 按目标区块地形返回移动上限倍率：
   * - 船只在海洋区块用 water_speed_multiplier（180%），陆地区块用 speed_multiplier（120%）
   * - 飞艇全地形 200%
   * - 徒步/马/车不分地形
   */
  async getTerrainSpeedMultiplier(characterId: string, chunkId: string): Promise<number> {
    const rows: any = await query(
      'SELECT speed_multiplier, water_speed_multiplier, terrain_capability FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1',
      [characterId]
    );
    if (!rows.length) return 1;
    const baseMultiplier = Number(rows[0].speed_multiplier);
    const capability = rows[0].terrain_capability;
    if (capability !== 'water') return baseMultiplier;
    const [cx, cy] = (chunkId || '0_0').split('_').map(Number);
    if (!isOceanChunk(cx || 0, cy || 0)) return baseMultiplier;
    return rows[0].water_speed_multiplier !== null && rows[0].water_speed_multiplier !== undefined
      ? Number(rows[0].water_speed_multiplier)
      : baseMultiplier;
  }

  async getMaxMoveDistance(characterId: string, chunkId?: string): Promise<number> {
    if (chunkId) return this.MAX_MOVE_DISTANCE * (await this.getTerrainSpeedMultiplier(characterId, chunkId));
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
    equippedVehicle: { id: number; vehicleType: string; speedMultiplier: number; terrainCapability: string } | null;
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

        // Validate movement distance (terrain-aware: ship gets water_speed_multiplier on ocean)
        const maxDistance = await this.getMaxMoveDistance(characterId, oldChunkId ?? undefined);
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

        const maxDistance = await this.getMaxMoveDistance(characterId, oldChunkId ?? undefined);
        if (oldPosition && this.calculateDistance(oldPosition, newPosition) > maxDistance) {
          logger.warn(`Invalid movement detected for user ${userId}: distance too large`);
          throw new AppError('Invalid movement: distance too large', 400);
        }
      }

      // Calculate new chunk
      const newChunkId = this.getChunkId(newPosition.x, newPosition.y);
      const chunkChanged = oldChunkId !== newChunkId;

      // GDD 2.8 terrain validation: ocean chunks require ship/airship
      const [newCX, newCY] = newChunkId.split('_').map(Number);
      if (isOceanChunk(newCX || 0, newCY || 0)) {
        const capability = await VehicleService.getEquippedTerrainCapability(characterId);
        if (capability !== 'water' && capability !== 'all') {
          throw new AppError('需要船只才能通行海洋区块', 403);
        }
      }

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
            'SELECT id, vehicle_type AS vehicleType, speed_multiplier AS speedMultiplier, terrain_capability AS terrainCapability FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1',
            [characterId]
          );
          return rows.length ? { id: Number(rows[0].id), vehicleType: rows[0].vehicleType, speedMultiplier: Number(rows[0].speedMultiplier), terrainCapability: rows[0].terrainCapability } : null;
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

  /**
   * Update a player's position after a teleport (bypasses MAX_MOVE_DISTANCE).
   * Synchronously updates both the database and the Redis cache so the new
   * position is immediately visible to other players in the target chunk.
   * Also invalidates the character cache (`character:user:{userId}`) so
   * /character/me returns the fresh position instead of a stale cached copy.
   */
  async updatePositionAfterTeleport(
    characterId: string,
    x: number,
    y: number,
    chunkId: string
  ): Promise<void> {
    // Update database synchronously (teleport must be durable)
    await query(
      'UPDATE characters SET grid_x = ?, grid_y = ?, current_chunk_id = ? WHERE id = ?',
      [x, y, chunkId, characterId]
    );

    const position = await this.getPlayerPosition(characterId);
    if (position) {
      position.position = { x, y };
      position.chunkId = chunkId;
      position.timestamp = Date.now();
      const cacheKey = prefixKey(`player:${characterId}:position`);
      await redisClient.setEx(cacheKey, 300, JSON.stringify(position));

      // Invalidate the character cache so /character/me reflects the new position
      const characterCacheKey = `character:user:${position.userId}`;
      try {
        await redisClient.del(characterCacheKey);
      } catch (error) {
        logger.warn('Failed to invalidate character cache after teleport', error);
      }
    }
  }
}

export default new MovementService();
