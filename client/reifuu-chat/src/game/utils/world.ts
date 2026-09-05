import { hashStringToSeed, createSeededRandom } from './rng'

/**
 * 世界坐标与区块工具。
 * 服务端采用世界坐标：worldX = chunkX * CHUNK_SIZE + gridX。
 * 每个区块为 CHUNK_SIZE x CHUNK_SIZE 个 tile，区块 ID 格式 "chunkX_chunkY"。
 */

export const CHUNK_SIZE = 32

// =====================================================
// 值噪声 / FBM（用于生成连续的地形斑块）
// =====================================================

/** 基于世界坐标的确定性 hash 噪声 [0,1) */
function valueNoise(x: number, y: number): number {
  // 使用更大的坐标空间和更好的混合避免相邻坐标产生相近的值
  const h1 = hashStringToSeed(`n_${x & 0xffff}_${y & 0xffff}`)
  const h2 = hashStringToSeed(`m_${(x * 73) & 0xffff}_${(y * 37) & 0xffff}`)
  // 将两个独立 hash 混合，取高位以获得更大的随机性
  const mixed = ((h1 ^ (h2 << 13)) ^ (h1 >>> 17)) >>> 0
  return (mixed & 0xffffff) / 0x1000000
}

/** 平滑插值值噪声 */
function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = valueNoise(ix, iy)
  const b = valueNoise(ix + 1, iy)
  const c = valueNoise(ix, iy + 1)
  const d = valueNoise(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

/** 分形布朗运动（多倍频叠加）*/
function fbm(x: number, y: number, octaves = 3): number {
  let val = 0
  let amp = 0.5
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq) * amp
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return val / max
}

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
 *
 * 地形层级（从低到高）：water < sand < grass < dirt
 * 使用 FBM 噪声生成连续的生物群落斑块，并在陆海交界处生成沙滩过渡带。
 * 小岛区块：中心陆地 + 沙滩边缘 + 海水。
 */
export function getChunkTerrain(chunkId: string): string[][] {
  const cached = terrainCache.get(chunkId)
  if (cached) return cached

  const { chunkX, chunkY } = chunkIdToOrigin(chunkId)
  const terrain: string[][] = []
  const worldOriginX = chunkX * CHUNK_SIZE
  const worldOriginY = chunkY * CHUNK_SIZE

  if (isIslandChunk(chunkX, chunkY)) {
    // 小岛区块：中央圆形陆地区域 + 沙滩 + 海水
    const random = createSeededRandom(hashStringToSeed(chunkId))
    const center = CHUNK_SIZE / 2
    const islandRadius = ISLAND_RADIUS + Math.floor(random() * 3) - 1
    const beachOuter = islandRadius + ISLAND_BEACH_WIDTH
    for (let y = 0; y < CHUNK_SIZE; y++) {
      terrain[y] = []
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2)
        // 加噪点让海岸线不规则
        const noise = fbm((worldOriginX + x) * 0.3, (worldOriginY + y) * 0.3, 2)
        const noisyDist = dist + (noise - 0.5) * 3
        if (noisyDist <= islandRadius) {
          // 岛屿内部：使用噪声决定草地/泥土
          const biomeNoise = fbm((worldOriginX + x) * 0.1, (worldOriginY + y) * 0.1, 3)
          terrain[y][x] = biomeNoise > 0.65 ? 'dirt' : 'grass'
        } else if (noisyDist <= beachOuter) {
          terrain[y][x] = 'sand'
        } else {
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
    // 陆地区块：FBM 噪声驱动生物群落 + 海岸过渡带
    const isCoastal = isCoastalChunk(chunkX, chunkY)
    for (let y = 0; y < CHUNK_SIZE; y++) {
      terrain[y] = []
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = worldOriginX + x
        const wy = worldOriginY + y
        terrain[y][x] = getLandTileType(wx, wy, chunkX, chunkY, x, y, isCoastal)
      }
    }
    smoothHighlandEdges(terrain)
  }
  terrainCache.set(chunkId, terrain)
  return terrain
}

/**
 * 清除孤立的高地 tile，避免单个 dirt tile 在画面中显示为突兀方块。
 * 只处理 dirt，不触碰海岸 sand 和水域；区块边界由世界坐标噪声保持连续。
 */
function smoothHighlandEdges(terrain: string[][]): void {
  const changes: Array<[number, number]> = []
  for (let y = 1; y < CHUNK_SIZE - 1; y++) {
    for (let x = 1; x < CHUNK_SIZE - 1; x++) {
      if (terrain[y][x] !== 'dirt') continue
      const cardinalDirtCount = (
        (terrain[y - 1][x] === 'dirt' ? 1 : 0) +
        (terrain[y + 1][x] === 'dirt' ? 1 : 0) +
        (terrain[y][x - 1] === 'dirt' ? 1 : 0) +
        (terrain[y][x + 1] === 'dirt' ? 1 : 0)
      )
      if (cardinalDirtCount < 2) changes.push([x, y])
    }
  }
  for (const [x, y] of changes) terrain[y][x] = 'grass'
}

/**
 * 判断区块是否与海洋区块相邻（海岸区块）。
 * 海岸区块在面向海洋的边缘生成沙滩过渡带。
 */
function isCoastalChunk(chunkX: number, chunkY: number): boolean {
  // 检查四个相邻方向是否有海洋区块
  return isOceanChunk(chunkX + 1, chunkY) ||
    isOceanChunk(chunkX - 1, chunkY) ||
    isOceanChunk(chunkX, chunkY + 1) ||
    isOceanChunk(chunkX, chunkY - 1)
}

/**
 * 计算某 tile 到最近海洋区块的过渡距离。
 * 返回值：0 = 紧贴海洋，>0 = 离海洋越远
 * 只考虑同一区块内的边缘距离（不跨区块计算）。
 */
function coastDistance(
  chunkX: number, chunkY: number,
  lx: number, ly: number,
): number {
  let minDist = Infinity
  // 左侧海洋
  if (isOceanChunk(chunkX - 1, chunkY)) minDist = Math.min(minDist, lx)
  // 右侧海洋
  if (isOceanChunk(chunkX + 1, chunkY)) minDist = Math.min(minDist, CHUNK_SIZE - 1 - lx)
  // 上方海洋
  if (isOceanChunk(chunkX, chunkY - 1)) minDist = Math.min(minDist, ly)
  // 下方海洋
  if (isOceanChunk(chunkX, chunkY + 1)) minDist = Math.min(minDist, CHUNK_SIZE - 1 - ly)
  return minDist === Infinity ? -1 : minDist
}

/** 海岸过渡带宽度（tile 数）*/
const COAST_BAND = 3

/** 河流主槽宽度与弯曲幅度（世界坐标，跨区块连续） */
const RIVER_HALF_WIDTH = 1.7
const RIVER_MEANDER = 14

/** 连续的世界河道中心线，使用低频噪声产生自然弯曲。 */
function riverCenterX(wy: number): number {
  return 326 + Math.sin(wy * 0.026) * RIVER_MEANDER +
    (fbm(0.8, wy * 0.018, 3) - 0.5) * 14
}

/** 判断陆地区块中的河流水域，河流在区块边界处保持连续。 */
export function isRiverTile(wx: number, wy: number): boolean {
  const distance = Math.abs(wx - riverCenterX(wy))
  const bankNoise = fbm(wx * 0.16, wy * 0.16, 2)
  return distance < RIVER_HALF_WIDTH + (bankNoise - 0.5) * 0.7
}

/** 森林群系判定：低频噪声形成连续森林斑块，而非散落单格。 */
export function isForestTile(wx: number, wy: number): boolean {
  const forestNoise = fbm(wx * 0.028 + 83, wy * 0.028 - 41, 4)
  return forestNoise > 0.42
}

/** 低频荒漠群系，沙地只在成片区域出现。 */
export function isDesertTile(wx: number, wy: number): boolean {
  return fbm(wx * 0.024 - 127, wy * 0.024 + 67, 4) > 0.66
}

/** 湿地群系，沿河流形成浅水洼与芦苇带。 */
export function isMarshTile(wx: number, wy: number): boolean {
  return fbm(wx * 0.032 + 211, wy * 0.032 - 93, 4) > 0.62
}

/** 高地群系，用于石块装饰和更密集的土坡。 */
export function isHighlandTile(wx: number, wy: number): boolean {
  return fbm(wx * 0.021 - 57, wy * 0.021 + 119, 4) > 0.69
}

/**
 * 陆地区块的 tile 类型判定：
 * 1. 海岸过渡：靠近海洋区块的边缘生成沙滩带
 * 2. 生物群落：FBM 噪声决定草地/泥土/沙地斑块
 */
function getLandTileType(
  wx: number, wy: number,
  chunkX: number, chunkY: number,
  lx: number, ly: number,
  isCoastal: boolean,
): string {
  // 海岸过渡带
  if (isCoastal) {
    const dist = coastDistance(chunkX, chunkY, lx, ly)
    if (dist >= 0) {
      // 海岸噪声扰动让沙滩边缘不规则
      const coastNoise = fbm(wx * 0.5, wy * 0.5, 2)
      const noisyDist = dist + (coastNoise - 0.5) * 2

      if (noisyDist < 1.5) return 'sand' // 紧贴海洋的沙滩
      if (noisyDist < COAST_BAND) {
        // 过渡带：近端沙地，远端草地，用噪声混合
        const t = (noisyDist - 1.5) / (COAST_BAND - 1.5)
        const sandGrassNoise = fbm(wx * 0.7, wy * 0.7, 2)
        if (sandGrassNoise > 0.35 + t * 0.35) return 'grass'
        return 'sand'
      }
    }
  }

  // 河流优先于内陆地表，但不覆盖紧贴海洋的沙滩带。
  if (isRiverTile(wx, wy)) return 'water'
  if (isMarshTile(wx, wy) && fbm(wx * 0.12, wy * 0.12, 2) > 0.68) return 'water'
  if (isDesertTile(wx, wy)) return 'sand'

  // 生物群落噪声：大尺度草地/泥土区域 + 小尺度沙地斑块。
  // elevationNoise 负责生成连续的高地，而不是散落的随机泥土地块。
  const biomeNoise = fbm(wx * 0.04, wy * 0.04, 4)
  const elevationScale = 0.022
  const elevationNoise = fbm(wx * elevationScale + 41, wy * elevationScale - 17, 4)
  const ridgeNoise = 1 - Math.abs(fbm(wx * 0.075 - 13, wy * 0.075 + 29, 3) * 2 - 1)

  // 只让有邻域支撑的高程成为台地，过滤掉 1~2 tile 的孤立土块。
  // 这样 dirt-grass autotile 的边缘会围绕连续高地生成，而不是形成方形小岛。
  const cardinalHighCount = [
    [0, -1], [-1, 0], [1, 0], [0, 1],
  ].filter(([dx, dy]) => (
    fbm((wx + dx) * elevationScale + 41, (wy + dy) * elevationScale - 17, 4) > 0.60
  )).length
  const highNeighborCount = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],            [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ].filter(([dx, dy]) => (
    fbm((wx + dx) * elevationScale + 41, (wy + dy) * elevationScale - 17, 4) > 0.60
  )).length
  // 只有接近噪声峰值且被完整邻域包围时才形成台地，避免孤立 dirt 方块。
  const plateau = elevationNoise > 0.82 && cardinalHighCount >= 4 && highNeighborCount >= 8
  const slope = elevationNoise > 0.76 && ridgeNoise > 0.70 && cardinalHighCount >= 4 && highNeighborCount >= 8
  if (plateau || (slope && biomeNoise > 0.48)) return 'dirt'

  // 沙地斑块：中等频率噪声在特定范围内 → 小片沙地
  // 沙地仅由海岸过渡带生成；避免内陆孤立沙斑被 grass-sand overlay 放大成方块。

  // 草地为主体
  return 'grass'
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
