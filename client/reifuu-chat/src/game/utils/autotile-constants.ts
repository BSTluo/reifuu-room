/**
 * Autotile 运行时常量（客户端使用）
 *
 * 与 scripts/autotile-data.ts 保持同步。
 * 此文件存在于 client/src/ 下以便 Vite 打包。
 */

/** 子块像素尺寸（与游戏 TILE_WIDTH/TILE_HEIGHT 一致） */
export const SUB_TILE = 48
/** 贴图集网格列数 */
export const GRID_COLS = 4
/** 贴图集网格行数 */
export const GRID_ROWS = 5
/** 贴图集总宽（像素） */
export const TILESET_W = GRID_COLS * SUB_TILE // 192
/** 贴图集总高（像素） */
export const TILESET_H = GRID_ROWS * SUB_TILE // 240

/** 四方向位定义 */
export const DIR_BITS = { up: 0x1, right: 0x2, down: 0x4, left: 0x8 } as const
export type DirKey = keyof typeof DIR_BITS

export interface AutotilePair {
  high: string
  low: string
  filename: string
}

/** 贴图集纹理 key：autotile-{high}-{low} */
export function autotileTextureKey(high: string, low: string): string {
  return `autotile-${high}-${low}`
}

export const AUTOTILE_PAIRS: AutotilePair[] = [
  { high: 'grass', low: 'water', filename: 'autotile-grass-water.png' },
  { high: 'grass', low: 'sand', filename: 'autotile-grass-sand.png' },
  { high: 'sand', low: 'water', filename: 'autotile-sand-water.png' },
  { high: 'dirt', low: 'grass', filename: 'autotile-dirt-grass.png' },
  { high: 'dirt', low: 'sand', filename: 'autotile-dirt-sand.png' },
  { high: 'dirt', low: 'water', filename: 'autotile-dirt-water.png' },
]

/**
 * 按地形对查找贴图集纹理 key。
 * 返回的贴图集用于叠画在 low 地形上。
 */
export function findAutotileTextureKey(high: string, low: string): string | undefined {
  const pair = AUTOTILE_PAIRS.find((p) => p.high === high && p.low === low)
  return pair ? autotileTextureKey(pair.high, pair.low) : undefined
}

/**
 * 从低地形 tile 的视角计算位掩码：哪些邻居是高地形。
 */
export function calculateBitmask(
  highType: string,
  getNeighbor: (dx: number, dy: number) => string,
): number {
  let mask = 0
  if (getNeighbor(0, -1) === highType) mask |= DIR_BITS.up
  if (getNeighbor(1, 0) === highType) mask |= DIR_BITS.right
  if (getNeighbor(0, 1) === highType) mask |= DIR_BITS.down
  if (getNeighbor(-1, 0) === highType) mask |= DIR_BITS.left
  return mask
}

/**
 * 将位掩码映射到贴图集网格坐标。
 * 映射规则：col = mask % 4, row = ⌊mask / 4⌋
 */
export function maskToGridPos(mask: number): { col: number; row: number } {
  return { col: mask % 4, row: Math.floor(mask / 4) }
}