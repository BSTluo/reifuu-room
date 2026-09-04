import { query } from '../db/mysql.js';
import { getRedis, prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * 出生点选择服务（GDD §2.1）
 * 两种互斥的出生方式：
 *  1. random_unowned  随机无主地块：未被任何玩家占领（ownerId = NULL）的空地区块
 *  2. random_public   随机公开地块：已被玩家拥有且 isPublic = true 的聊天室区块
 *
 * 地块池缓存到 Redis，避免每次创角都全表扫描；地图数据变化时（建造/公开状态切换）主动失效。
 */

export type SpawnMethod = 'random_unowned' | 'random_public';

export interface SpawnPointCandidate {
  chunkId: string;
  chunkX: number;
  chunkY: number;
  gridX: number;
  gridY: number;
}

export interface SpawnOptionDTO {
  method: SpawnMethod;
  label: string;
  description: string;
  available: boolean;
  poolSize: number;
}

const SELECTED_CACHE_TTL = 300; // 选中的出生地块缓存 5 分钟，防止并发创角挤进同一地块
const POOL_CACHE_TTL = 10;
const PUBLIC_POOL_TOP_N = 20;
// 候选无主区块范围：以经典出生中心 (10,10) 为中心的 21×21 网格
const UNOWNED_RANGE_MIN = 0;
const UNOWNED_RANGE_MAX = 20;

// 出生点固定在地块内的 (5,5)，避免落在区块边缘
const SPAWN_GRID_X = 5;
const SPAWN_GRID_Y = 5;

const UNOWNED_POOL_KEY = prefixKey('spawn:pool:unowned');
const PUBLIC_POOL_KEY = prefixKey('spawn:pool:public');
const SELECTED_KEY = prefixKey('spawn:selected');

export class SpawnPointService {
  /**
   * 获取无主地块池。
   * map_chunks 行仅在建造时创建，空地区块大多不在表中，
   * 因此在候选网格内排除所有已占用（有主或有建筑）的区块。
   * 返回前始终过滤"最近已分配"的区块（缓存命中路径同样过滤）。
   */
  async getUnownedPool(): Promise<SpawnPointCandidate[]> {
    const candidates = await this.loadUnownedCandidates();
    return this.filterRecentlySelected(candidates);
  }

  /** 加载（或从缓存读取）原始无主候选列表，不做近期分配过滤 */
  private async loadUnownedCandidates(): Promise<SpawnPointCandidate[]> {
    const redis = getRedis();
    const cached = await redis.get(UNOWNED_POOL_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        logger.warn('Unowned pool cache corrupt, rebuilding');
      }
    }

    const candidates: SpawnPointCandidate[] = [];
    for (let cx = UNOWNED_RANGE_MIN; cx <= UNOWNED_RANGE_MAX; cx++) {
      for (let cy = UNOWNED_RANGE_MIN; cy <= UNOWNED_RANGE_MAX; cy++) {
        candidates.push({
          chunkId: `${cx}_${cy}`,
          chunkX: cx,
          chunkY: cy,
          gridX: SPAWN_GRID_X,
          gridY: SPAWN_GRID_Y,
        });
      }
    }

    // 已占用区块 = 有主或有建筑（`owner_id IS NOT NULL` 或 `chunk_type='chatroom'`）
    const occupied: any = await query(
      `SELECT chunk_id FROM map_chunks
       WHERE owner_id IS NOT NULL OR chunk_type = 'chatroom'`
    );
    const occupiedSet = new Set(
      Array.isArray(occupied) ? occupied.map((r: any) => r.chunk_id) : []
    );

    const pool = candidates.filter((c) => !occupiedSet.has(c.chunkId));
    await redis.set(UNOWNED_POOL_KEY, JSON.stringify(pool), { EX: POOL_CACHE_TTL });
    return pool;
  }

  /**
   * 获取公开地块池：已有玩家拥有且 isPublic = true 的区块。
   * 按人口密度（停驻角色数）与活跃度排序，取前 N 个再随机分配，
   * 避免所有新手涌入同一公开地块，也避免选中冷门地块。
   */
  async getPublicPool(): Promise<SpawnPointCandidate[]> {
    const candidates = await this.loadPublicCandidates();
    return this.filterRecentlySelected(candidates);
  }

  /** 加载（或从缓存读取）公开候选列表，不做近期分配过滤 */
  private async loadPublicCandidates(): Promise<SpawnPointCandidate[]> {
    const redis = getRedis();
    const cached = await redis.get(PUBLIC_POOL_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        logger.warn('Public pool cache corrupt, rebuilding');
      }
    }

    // 人口密度 = 停驻在该区块的角色数；活跃度 = 区块最近变更时间
    const publicChunks: any = await query(
      `SELECT mc.chunk_id, mc.chunk_x, mc.chunk_y,
              (SELECT COUNT(*) FROM characters c
               WHERE c.current_chunk_id = mc.chunk_id) AS population
       FROM map_chunks mc
       WHERE mc.owner_id IS NOT NULL AND mc.is_public = true
       ORDER BY population DESC, mc.updated_at DESC
       LIMIT ${PUBLIC_POOL_TOP_N}`
    );

    const pool: SpawnPointCandidate[] = (Array.isArray(publicChunks) ? publicChunks : []).map(
      (chunk: any) => ({
        chunkId: chunk.chunk_id,
        chunkX: chunk.chunk_x,
        chunkY: chunk.chunk_y,
        gridX: SPAWN_GRID_X,
        gridY: SPAWN_GRID_Y,
      })
    );

    await redis.set(PUBLIC_POOL_KEY, JSON.stringify(pool), { EX: POOL_CACHE_TTL });
    return pool;
  }

  /** 过滤掉最近 5 分钟内已被分配为出生点的区块 */
  private async filterRecentlySelected(
    candidates: SpawnPointCandidate[]
  ): Promise<SpawnPointCandidate[]> {
    const redis = getRedis();
    const recentlySelected = await redis.sMembers(SELECTED_KEY);
    if (!Array.isArray(recentlySelected) || recentlySelected.length === 0) {
      return candidates;
    }
    const recentSet = new Set(recentlySelected);
    return candidates.filter((c) => !recentSet.has(c.chunkId));
  }

  /**
   * 根据出生方式随机选择一个出生点。
   * 选中的区块会加入 Redis 集合，TTL 5 分钟内不会被再次分配。
   */
  async selectSpawnPoint(method: SpawnMethod): Promise<SpawnPointCandidate> {
    let pool: SpawnPointCandidate[];
    if (method === 'random_unowned') {
      pool = await this.getUnownedPool();
    } else if (method === 'random_public') {
      pool = await this.getPublicPool();
    } else {
      throw new AppError(`Invalid spawn method: ${method}`, 400);
    }

    if (pool.length === 0) {
      if (method === 'random_public') {
        throw new AppError('当前没有可用的公开地块，请选择"随机无主地块"', 404);
      }
      throw new AppError('没有可用的出生地块，请稍后重试', 404);
    }

    // 随机抽取
    const idx = Math.floor(Math.random() * pool.length);
    const selected = pool[idx]!;

    // 记录到 Redis 集合，防止短期内重复分配
    const redis = getRedis();
    await redis.sAdd(SELECTED_KEY, selected.chunkId);
    await redis.expire(SELECTED_KEY, SELECTED_CACHE_TTL);

    logger.info(`Spawn point selected: ${selected.chunkId} via ${method}`);
    return selected;
  }

  /**
   * 返回前端预览用的出生选项信息。
   */
  async getSpawnOptions(): Promise<SpawnOptionDTO[]> {
    const [unownedPool, publicPool] = await Promise.all([
      this.getUnownedPool(),
      this.getPublicPool(),
    ]);

    return [
      {
        method: 'random_unowned',
        label: '随机无主地块',
        description: '完全独享的起始区域，资源不与他人竞争，适合喜欢独立发展的玩家。周边可能较为荒凉，缺少社交氛围。',
        available: unownedPool.length > 0,
        poolSize: unownedPool.length,
      },
      {
        method: 'random_public',
        label: '随机公开地块',
        description: '出生点周边可能已有其他玩家的聊天室/城镇雏形，更容易遇见其他玩家并快速融入社交。资源可能已部分被采集。',
        available: publicPool.length > 0,
        poolSize: publicPool.length,
      },
    ];
  }

  /**
   * 地图数据变化时（建造/公开状态切换/放弃地块）调用，使地块池缓存失效。
   */
  async invalidatePools(): Promise<void> {
    const redis = getRedis();
    await redis.del(UNOWNED_POOL_KEY);
    await redis.del(PUBLIC_POOL_KEY);
    logger.debug('Spawn point pools invalidated');
  }
}

export default new SpawnPointService();
