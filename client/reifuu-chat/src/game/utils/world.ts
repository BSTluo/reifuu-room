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
 * 生成（并缓存）某区块的确定性地形。
 * 海洋区块（洲际轴带）整体为 'water'；陆地区块每个 tile 为
 * 'grass' 或 'dirt'（10% 概率）。
 */
export function getChunkTerrain(chunkId: string): string[][] {
  const cached = terrainCache.get(chunkId)
  if (cached) return cached

  const { chunkX, chunkY } = chunkIdToOrigin(chunkId)
  const terrain: string[][] = []
  if (isOceanChunk(chunkX, chunkY)) {
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
