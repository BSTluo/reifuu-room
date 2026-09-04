import { query } from '../db/mysql.js';
import { getRedis, prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import MovementService from './MovementService.js';
import ExplorationService from './ExplorationService.js';
import config from '../config.js';

/**
 * 城镇系统 + 传送门（GDD §2.3）
 *
 * 城镇 = 聊天室密度达标自动形成的聚落：
 * - 某区块 3x3 范围内聊天室数量 ≥ 5 时，该区块自动被认定为城镇中心
 * - 城镇中心同时是传送门锚点，玩家必须亲自到访过城镇才能解锁传送
 * - 传送有冷却时间（config.town.portalCooldownSeconds，默认 5 分钟）
 *
 * 已访问城镇记录在 town_visits 表（UNIQUE(character_id, town_id)），
 * 解锁状态 = 该表存在对应记录。
 */
export class TownService {
  /** 聊天室密度阈值：3x3 范围内 ≥5 个聊天室即认定为城镇 */
  static readonly TOWN_DENSITY_THRESHOLD = 5;

  /**
   * 建造聊天室后调用：检测 3x3 范围内聊天室密度是否达到城镇标准。
   * 达标则以该区块为中心创建城镇（幂等：中心区块已存在城镇则跳过）。
   */
  async detectTownAfterBuild(chunkId: string, builderCharacterId: string): Promise<void> {
    try {
      const parts = chunkId.split('_').map(Number);
      const cx = parts[0] ?? 0;
      const cy = parts[1] ?? 0;

      // 3x3 范围内所有区块 ID
      const areaChunkIds: string[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          areaChunkIds.push(`${cx + dx}_${cy + dy}`);
        }
      }

      // 统计范围内的聊天室数量（map_chunks.chunk_type = 'chatroom'）
      const placeholders = areaChunkIds.map(() => '?').join(', ');
      const roomCountRows: any = await query(
        `SELECT COUNT(*) as count FROM map_chunks WHERE chunk_type = 'chatroom' AND chunk_id IN (${placeholders})`,
        areaChunkIds
      );

      const roomCount = roomCountRows[0]?.count ?? 0;
      if (roomCount < TownService.TOWN_DENSITY_THRESHOLD) {
        return;
      }

      // 幂等：中心区块已是某城镇的中心则跳过
      const existingTown: any = await query(
        'SELECT id FROM towns WHERE center_chunk_id = ?',
        [chunkId]
      );
      if (existingTown.length > 0) {
        return;
      }

      // 创建城镇（命名规则 MVP：自动编号）
      const insertResult: any = await query(
        `INSERT INTO towns (name, level, center_chunk_id, founded_by)
         VALUES (?, ?, ?, ?)`,
        [`城镇#${Date.now()}`, 1, chunkId, builderCharacterId]
      );

      logger.info(
        `Town created: chunk ${chunkId} reached density threshold ${roomCount}/${TownService.TOWN_DENSITY_THRESHOLD}, town id ${insertResult.insertId}`
      );
    } catch (error) {
      logger.error(`Town detection failed for chunk ${chunkId}`, error);
    }
  }

  /**
   * 获取城镇列表（含当前角色是否已到访过 = 传送门是否解锁）
   */
  async listTowns(characterId: string): Promise<
    Array<{
      id: number;
      name: string;
      level: number;
      centerChunkId: string;
      visited: boolean;
    }>
  > {
    try {
      const rows: any = await query(
        `SELECT t.id, t.name, t.level, t.center_chunk_id, t.created_at,
                (SELECT COUNT(*) FROM town_visits tv WHERE tv.town_id = t.id AND tv.character_id = ?) as visited
         FROM towns t
         ORDER BY t.created_at ASC`,
        [characterId]
      );

      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        centerChunkId: row.center_chunk_id,
        visited: Number(row.visited) > 0,
      }));
    } catch (error) {
      logger.error('Failed to list towns', error);
      return [];
    }
  }

  /**
   * 获取角色到访过的城镇列表（已解锁的传送门）
   */
  async getVisitedTowns(characterId: string): Promise<
    Array<{ id: number; name: string; level: number; centerChunkId: string; visitedAt: Date }>
  > {
    try {
      const rows: any = await query(
        `SELECT t.id, t.name, t.level, t.center_chunk_id, tv.visited_at
         FROM town_visits tv
         JOIN towns t ON t.id = tv.town_id
         WHERE tv.character_id = ? ORDER BY tv.visited_at DESC`,
        [characterId]
      );

      return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        centerChunkId: row.center_chunk_id,
        visitedAt: row.visited_at,
      }));
    } catch (error) {
      logger.error('Failed to get visited towns', error);
      return [];
    }
  }

  /**
   * 记录到访（INSERT IGNORE 幂等）。
   * 玩家进入城镇中心区块时由 socket 位置更新逻辑调用。
   */
  async recordVisit(characterId: string, townId: number): Promise<void> {
    try {
      await query(
        `INSERT IGNORE INTO town_visits (character_id, town_id) VALUES (?, ?)`,
        [characterId, townId]
      );
    } catch (error) {
      logger.error(`Failed to record town visit: character ${characterId} town ${townId}`, error);
    }
  }

  /**
   * 传送门传送（GDD §2.3：须先亲自到访过城镇才能传送）。
   * 返回新位置与区块（socket 层负责房间切换与广播）。
   */
  async teleportToTown(
    characterId: string,
    townId: number
  ): Promise<{
    position: { x: number; y: number };
    chunkId: string;
    townName: string;
    cooldownRemaining: number;
  }> {
    // 城镇必须存在
    const townRows: any = await query('SELECT id, name, center_chunk_id FROM towns WHERE id = ?', [
      townId,
    ]);
    if (townRows.length === 0) {
      throw new AppError('城镇不存在', 404);
    }
    const town = townRows[0];

    // 必须到访过该城镇（解锁传送门）
    const visitRows: any = await query(
      'SELECT 1 FROM town_visits WHERE character_id = ? AND town_id = ?',
      [characterId, townId]
    );
    if (visitRows.length === 0) {
      throw new AppError('尚未到访过该城镇，传送门未解锁', 403);
    }

    // 冷却校验（与好友传送共用冷却键，避免双系统叠加传送刷屏）
    const redis = await getRedis();
    const cooldownKey = prefixKey(`teleport:cooldown:${characterId}`);
    const remaining = await redis.ttl(cooldownKey);
    if (remaining > 0) {
      throw new AppError(
        `传送冷却中，请 ${Math.ceil(remaining / 60)} 分钟后再试`,
        429
      );
    }

    // 计算落点：城镇中心区块中心附近随机偏移 1-2 格（仍在中心区块内）
    const parts = String(town.center_chunk_id).split('_').map(Number);
    const centerX = (parts[0] ?? 0) * 32 + 16;
    const centerY = (parts[1] ?? 0) * 32 + 16;
    const magnitude = 1 + Math.floor(Math.random() * 2);
    const angle = Math.random() * Math.PI * 2;
    const targetX = centerX + Math.round(Math.cos(angle) * magnitude);
    const targetY = centerY + Math.round(Math.sin(angle) * magnitude);

    const targetChunkId = MovementService.getChunkId(targetX, targetY);

    // 写入位置（DB + Redis 缓存）
    await MovementService.updatePositionAfterTeleport(characterId, targetX, targetY, targetChunkId);

    // 自动探索城镇周边（GDD §2.6：传送落点自动探索）
    await ExplorationService.exploreArea(characterId, targetChunkId, 1);

    // 写入冷却
    await redis.setEx(cooldownKey, config.town.portalCooldownSeconds, String(Date.now()));

    logger.info(
      `Town teleport: character ${characterId} -> town ${townId} at (${targetX}, ${targetY}) chunk ${targetChunkId}`
    );

    return {
      position: { x: targetX, y: targetY },
      chunkId: targetChunkId,
      townName: town.name,
      cooldownRemaining: config.town.portalCooldownSeconds,
    };
  }
}

export default new TownService();