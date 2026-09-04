import { query } from '../db/mysql.js';
import { getRedis } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import SpawnPointService, { SpawnMethod } from './SpawnPointService.js';

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

// 兼容旧客户端 / 未传 spawnMethod 的默认出生点（保持既有角色行为）
const DEFAULT_SPAWN_POINTS: Record<string, ContinentSpawnPoint> = {
  east: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  south: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  west: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
  north: { chunkX: 10, chunkY: 10, gridX: 5, gridY: 5 },
};

const CHUNK_SIZE = 32;
const VALID_SPAWN_METHODS: SpawnMethod[] = ['random_unowned', 'random_public'];

export class CharacterService {
  async createCharacter(
    userId: string,
    nickname: string,
    appearance: Appearance,
    startContinent: string,
    spawnMethod?: string
  ) {
    try {
      // Validate continent
      if (!['east', 'south', 'west', 'north'].includes(startContinent)) {
        throw new AppError('Invalid start continent', 400);
      }

      // Validate spawn method (undefined falls back to legacy default spawn)
      if (spawnMethod !== undefined && !VALID_SPAWN_METHODS.includes(spawnMethod as SpawnMethod)) {
        throw new AppError('Invalid spawn method', 400);
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

      // 计算出生点：
      // - 传入了 spawnMethod 时，调用 SpawnPointService 从对应地块池随机分配
      // - 未传入 spawnMethod（旧客户端）时，回退到默认出生点，保持既有行为
      let chunkId: string;
      let worldX: number;
      let worldY: number;
      let spawnMethodStored: string;

      if (spawnMethod !== undefined) {
        const selected = await SpawnPointService.selectSpawnPoint(spawnMethod as SpawnMethod);
        chunkId = selected.chunkId;
        worldX = selected.chunkX * CHUNK_SIZE + selected.gridX;
        worldY = selected.chunkY * CHUNK_SIZE + selected.gridY;
        spawnMethodStored = spawnMethod;
      } else {
        const spawnPoint = DEFAULT_SPAWN_POINTS[startContinent];
        if (!spawnPoint) {
          throw new AppError('No spawn point configured for continent', 500);
        }
        chunkId = `${spawnPoint.chunkX}_${spawnPoint.chunkY}`;
        // World coordinate = chunkX * 32 + gridX (assuming 32x32 grid per chunk)
        worldX = spawnPoint.chunkX * CHUNK_SIZE + spawnPoint.gridX;
        worldY = spawnPoint.chunkY * CHUNK_SIZE + spawnPoint.gridY;
        spawnMethodStored = 'default';
      }

      // Insert character
      const result: any = await query(
        `INSERT INTO characters
        (user_id, nickname, appearance, start_continent, spawn_method, current_chunk_id, grid_x, grid_y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          nickname,
          JSON.stringify(appearance),
          startContinent,
          spawnMethodStored,
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
        spawnMethod: spawnMethodStored,
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
        `SELECT id, user_id, nickname, appearance, start_continent, spawn_method,
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
        spawnMethod: char.spawn_method ?? 'default',
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
