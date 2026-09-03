import { query } from '../db/mysql.js';
import { getRedis } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

interface Appearance {
  gender: string;
  hair: string;
  skin: string;
  outfit: string;
}

interface ContinentSpawnPoint {
  chunkX: number;
  chunkY: number;
  gridX: number;
  gridY: number;
}

const SPAWN_POINTS: Record<string, ContinentSpawnPoint> = {
  east: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  south: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  west: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  north: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
};

export class CharacterService {
  async createCharacter(
    userId: string,
    nickname: string,
    appearance: Appearance,
    startContinent: string
  ) {
    try {
      // Validate continent
      if (!['east', 'south', 'west', 'north'].includes(startContinent)) {
        throw new AppError('Invalid start continent', 400);
      }

      // Validate appearance fields
      if (!appearance.gender || !appearance.hair || !appearance.skin || !appearance.outfit) {
        throw new AppError('Incomplete appearance data', 400);
      }

      // Check if user already has a character (MVP: one character per user)
      const existing: any = await query(
        'SELECT id FROM characters WHERE user_id = ?',
        [userId]
      );

      if (Array.isArray(existing) && existing.length > 0) {
        throw new AppError('User already has a character', 400);
      }

      // Check nickname uniqueness
      const nicknameCheck: any = await query(
        'SELECT id FROM characters WHERE nickname = ?',
        [nickname]
      );

      if (Array.isArray(nicknameCheck) && nicknameCheck.length > 0) {
        throw new AppError('Nickname already taken', 400);
      }

      // Get spawn point for continent
      const spawnPoint = SPAWN_POINTS[startContinent];
      if (!spawnPoint) {
        throw new AppError('No spawn point configured for continent', 500);
      }
      const chunkId = `${spawnPoint.chunkX}_${spawnPoint.chunkY}`;

      // Convert chunk coordinates to world grid coordinates
      // World coordinate = chunkX * 32 + gridX (assuming 32x32 grid per chunk)
      const worldX = spawnPoint.chunkX * 32 + spawnPoint.gridX;
      const worldY = spawnPoint.chunkY * 32 + spawnPoint.gridY;

      // Insert character
      const result: any = await query(
        `INSERT INTO characters
        (user_id, nickname, appearance, start_continent, current_chunk_id, grid_x, grid_y)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          nickname,
          JSON.stringify(appearance),
          startContinent,
          chunkId,
          worldX,
          worldY,
        ]
      );

      const characterId = result.insertId;

      // 清除用户角色缓存
      const redis = getRedis();
      const cacheKey = `character:user:${userId}`;
      await redis.del(cacheKey);

      logger.info(`Character created: ${nickname} for user ${userId}`);

      return {
        id: characterId,
        userId: parseInt(userId),
        nickname,
        appearance,
        startContinent,
        currentChunkId: chunkId,
        position: {
          x: worldX,
          y: worldY,
        },
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Character creation error', error);
      throw new AppError('Character creation failed', 500);
    }
  }

  async getCharacterByUserId(userId: string) {
    try {
      // 尝试从Redis缓存获取
      const redis = getRedis();
      const cacheKey = `character:user:${userId}`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug(`Character cache hit for user ${userId}`);
        return JSON.parse(cached);
      }

      // 缓存未命中，查询数据库
      const rows: any = await query(
        `SELECT id, user_id, nickname, appearance, start_continent,
         current_chunk_id, grid_x, grid_y, created_at
         FROM characters WHERE user_id = ? LIMIT 1`,
        [userId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        // 缓存"用户无角色"状态，避免重复查询
        await redis.set(cacheKey, JSON.stringify(null), { EX: 60 });
        return null;
      }

      const char = rows[0];

      const result = {
        id: char.id,
        userId: char.user_id,
        nickname: char.nickname,
        appearance: typeof char.appearance === 'string'
          ? JSON.parse(char.appearance)
          : char.appearance,
        continent: char.start_continent,
        currentChunkId: char.current_chunk_id,
        position: {
          x: char.grid_x,
          y: char.grid_y,
        },
        createdAt: char.created_at,
      };

      // 缓存结果5分钟
      await redis.set(cacheKey, JSON.stringify(result), { EX: 300 });

      return result;
    } catch (error: any) {
      logger.error('Get character error', error);
      throw new AppError('Failed to retrieve character', 500);
    }
  }
}

export default new CharacterService();
