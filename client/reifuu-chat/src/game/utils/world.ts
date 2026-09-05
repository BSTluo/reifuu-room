import { hashStringToSeed, createSeededRandom } from './rng'

/**
 * 世界坐标与区块工具。
 * 服务端采用世界坐标：worldX = chunkX * CHUNK_SIZE + gridX。
 * 每个区块为 CHUNK_SIZE x CHUNK_SIZE 个 tile，区块 ID 格式 "chunkX_chunkY"。
 */

export const CHUNK_SIZE = 32

/** 世界网格坐标 -> 区块 ID（负数坐标由 Math.floor 正确处理） */
export function worldToChunkId(wx: number, wy: number): string {
  const chunkX = Math.floor(wx / CHUNK_SIZE)
  const chunkY = Math.floor(wy / CHUNK_SIZE)
  return `${chunkX}_${chunkY}`
}

/** 区块 ID -> 区块原点（chunkX, chunkY） */
export function chunkIdToOrigin(chunkId: string): { chunkX: number; chunkY: number } {
  const [cx, cy] = chunkId.split('_').map(Number)
  return { chunkX: cx, chunkY: cy }
}

/** 区块 ID -> 该区块左上角 tile 的世界坐标 */
export function chunkIdToWorldOrigin(chunkId: string): { wx: number; wy: number } {
  const { chunkX, chunkY } = chunkIdToOrigin(chunkId)
  return { wx: chunkX * CHUNK_SIZE, wy: chunkY * CHUNK_SIZE }
}

// 区块地形缓存：同一 chunkId 在所有客户端生成完全一致的地形
const terrainCache = new Map<string, string[][]>()

/**
 * 海洋区块宽度（与服务端 MovementService.isOceanChunk 保持一致）。
 * GDD 2.2/2.8: 四大洲按象限分布，洲际由 |chunkX| 或 |chunkY| 小于
 * OCEAN_CHUNK_WIDTH 的连续海洋区块分隔（5-10 个区块）。
 */
export const OCEAN_CHUNK_WIDTH = 5

/** 判断区块是否为海洋区块（客户端本地预判，服务端最终校验） */
export function isOceanChunk(chunkX: number, chunkY: number): boolean {
  return Math.abs(chunkX) < OCEAN_CHUNK_WIDTH || Math.abs(chunkY) < OCEAN_CHUNK_WIDTH
}

/**
 * 小岛区块检测（GDD §2.8 line 358）。
 * 约 10% 的海洋区块被确定性地标记为小岛区块。
 * 服务端与客户端使用相同哈希函数，确保结果一致。
 */
export function isIslandChunk(chunkX: number, chunkY: number): boolean {
  if (!isOceanChunk(chunkX, chunkY)) return false
  // 排除原点区块 (0,0) — 出生点附近不应有岛屿
  if (chunkX === 0 && chunkY === 0) return false
  const seed = hashStringToSeed(`island_${chunkX}_${chunkY}`)
  // seed < 2^32 * 0.1 → 约 10% 概率
  return seed < 0x1999999A
}

/** 岛屿中心半径（tile 数），岛屿主体陆地的半径 */
export const ISLAND_RADIUS = 6
/** 岛屿海滩宽度（tile 数），从陆地边缘向外的沙地宽度 */
export const ISLAND_BEACH_WIDTH = 2

/**
 * 生成（并缓存）某区块的确定性地形。
 * 海洋区块（洲际轴带）整体为 'water'；陆地区块每个 tile 为
 * 'grass' 或 'dirt'（10% 概率）。
 * 小岛区块：中心陆地 + 沙滩边缘 + 周围水域。
 */
export function getChunkTerrain(chunkId: string): string[][] {
  const cached = terrainCache.get(chunkId)
  if (cached) return cached

  const { chunkX, chunkY } = chunkIdToOrigin(chunkId)
  const terrain: string[][] = []
  if (isIslandChunk(chunkX, chunkY)) {
    // 小岛区块：中央圆形陆地区域 + 沙滩 + 海水
    const random = createSeededRandom(hashStringToSeed(chunkId))
    const center = CHUNK_SIZE / 2
    // 岛屿半径随机微调 (±2) 以增加多样性
    const islandRadius = ISLAND_RADIUS + Math.floor(random() * 3) - 1
    const beachOuter = islandRadius + ISLAND_BEACH_WIDTH
    for (let y = 0; y < CHUNK_SIZE; y++) {
      terrain[y] = []
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2)
        if (dist <= islandRadius) {
          // 岛屿内部：草地或泥土（10%）
          terrain[y][x] = random() < 0.1 ? 'dirt' : 'grass'
        } else if (dist <= beachOuter) {
          // 沙滩
          terrain[y][x] = 'sand'
        } else {
          // 海水
          terrain[y][x] = 'water'
        }
      }
    }
  } else if (isOceanChunk(chunkX, chunkY)) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      terrain[y] = []
      for (let x = 0; x < CHUNK_SIZE; x++) {
        terrain[y][x] = 'water'
      }
    }
  } else {
    const random = createSeededRandom(hashStringToSeed(chunkId))
    for (let y = 0; y < CHUNK_SIZE; y++) {
      terrain[y] = []
      for (let x = 0; x < CHUNK_SIZE; x++) {
        terrain[y][x] = random() < 0.1 ? 'dirt' : 'grass'
      }
    }
  }
  terrainCache.set(chunkId, terrain)
  return terrain
}

/** 世界网格坐标 -> tile 类型（按需生成对应区块地形） */
export function getTileType(wx: number, wy: number): string {
  const chunkId = worldToChunkId(wx, wy)
  const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(chunkId)
  const terrain = getChunkTerrain(chunkId)
  const lx = wx - originWX
  const ly = wy - originWY
  return terrain[ly]?.[lx] ?? 'grass'
}
