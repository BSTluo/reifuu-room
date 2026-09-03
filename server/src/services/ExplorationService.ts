import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';

/**
 * 视野与探索系统（GDD 2.6）
 * 玩家进入某区块时，该区块及其相邻 8 格（3x3 范围）从迷雾变为"已探索"。
 * 已探索状态持久化在 explored_chunks 表，永久可见。
 */
export class ExplorationService {
  /**
   * 探索以 (chunkX, chunkY) 为中心的正方形区块范围（半径 radius，默认 1 即 3x3）。
   * 使用 INSERT IGNORE 保证重复探索不会报错，返回实际新解锁的区块 ID 列表。
   */
  async exploreArea(characterId: string, chunkId: string, radius: number = 1): Promise<string[]> {
    try {
      const parts = chunkId.split('_').map(Number);
      const cx = parts[0] ?? 0;
      const cy = parts[1] ?? 0;

      // (2*radius+1)² 范围内所有区块 ID
      const areaChunkIds: string[] = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          areaChunkIds.push(`${cx + dx}_${cy + dy}`);
        }
      }

      // 先查询已探索集合，用于区分"新解锁"与"已存在"
      const existing: any = await query(
        `SELECT chunk_id FROM explored_chunks WHERE character_id = ?`,
        [characterId]
      );
      const existingSet = new Set(
        (Array.isArray(existing) ? existing : []).map((r: any) => r.chunk_id)
      );

      // INSERT IGNORE 批量插入（跳过已存在的行）
      const values = areaChunkIds.map(() => '(?, ?)').join(', ');
      const params = areaChunkIds.flatMap((cid) => [characterId, cid]);
      await query(
        `INSERT IGNORE INTO explored_chunks (character_id, chunk_id) VALUES ${values}`,
        params
      );

      const newlyExplored = areaChunkIds.filter((cid) => !existingSet.has(cid));
      if (newlyExplored.length > 0) {
        logger.info(
          `Character ${characterId} explored ${newlyExplored.length} new chunks: ${newlyExplored.join(', ')}`
        );
      }
      return newlyExplored;
    } catch (error) {
      logger.error('Explore area failed', error);
      return [];
    }
  }

  /**
   * 获取玩家所有已探索的区块 ID 列表
   */
  async getExploredChunks(characterId: string): Promise<string[]> {
    try {
      const rows: any = await query(
        `SELECT chunk_id FROM explored_chunks WHERE character_id = ?`,
        [characterId]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => r.chunk_id);
    } catch (error) {
      logger.error('Get explored chunks failed', error);
      return [];
    }
  }
}

export default new ExplorationService();