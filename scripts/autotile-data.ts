/**
 * Autotile 数据定义（RPG Maker 2003 风格过渡贴图集）
 *
 * 每个地形对（如 grass-water）生成一张 4×5 网格的贴图集：
 * - 每个网格单元 = 48×48 像素子块（与游戏地块同尺寸）
 * - 总尺寸 192×240 像素
 * - 16 种 4 向位掩码变体（象限合成 + 有机锯齿边界）
 *
 * Overlay 约定（关键！）：
 * 子块内容 = pair.high（高地形）向低地形"侵入"的形状，带轮廓描边与崖面阴影，
 * 其余区域透明（运行时叠画在低地形地块上，低地形底图从透明区透出）。
 *
 * 位掩码定义（从低地形 tile 的视角）：
 *   bit0 (0x1): 上邻居是高地形
 *   bit1 (0x2): 右邻居是高地形
 *   bit2 (0x4): 下邻居是高地形
 *   bit3 (0x8): 左邻居是高地形
 *
 * 运行时：对每个低地形 tile，按地形对分别计算掩码（邻居 === pair.high），
 * 掩码非零时把对应子块叠画在该 tile 上。
 */

// =====================================================
// 常量
// =====================================================

/** 子块像素尺寸（与游戏 TILE_WIDTH/TILE_HEIGHT 一致） */
export const SUB_TILE = 48
/** 贴图集网格列数 */
export const GRID_COLS = 4
/** 贴图集网格行数（16 种掩码 = 4×4，第 5 行预留） */
export const GRID_ROWS = 5
/** 贴图集总宽（像素） */
export const TILESET_W = GRID_COLS * SUB_TILE // 192
/** 贴图集总高（像素） */
export const TILESET_H = GRID_ROWS * SUB_TILE // 240

// =====================================================
// 地形调色板（与生成的 48×48 AI 贴图色调一致）
// =====================================================

export interface TerrainPalette {
  /** 基色（主表面） */
  base: [number, number, number]
  /** 暗部（噪点/阴影） */
  dark: [number, number, number]
  /** 亮部（高光/噪点） */
  light: [number, number, number]
  /** 轮廓色（与其他地形交界处的描边） */
  outline: [number, number, number]
}

export const TERRAIN_COLORS: Record<string, TerrainPalette> = {
  grass: {
    base: [64, 132, 62],
    dark: [46, 104, 44],
    light: [92, 158, 84],
    outline: [34, 78, 34],
  },
  dirt: {
    base: [148, 106, 62],
    dark: [126, 86, 48],
    light: [172, 132, 86],
    outline: [98, 64, 36],
  },
  sand: {
    base: [226, 205, 156],
    dark: [204, 178, 128],
    light: [240, 226, 184],
    outline: [178, 150, 100],
  },
  water: {
    base: [58, 122, 190],
    dark: [42, 96, 160],
    light: [86, 152, 214],
    outline: [30, 68, 124],
  },
}

// =====================================================
// 6 个地形对（overlay = high 侵入 low 的形状）
// =====================================================

export interface AutotilePair {
  /** 高地形（overlay 绘制的"本体"颜色，如 grass） */
  high: string
  /** 低地形（overlay 叠画在它上面） */
  low: string
  /** 输出文件名 */
  filename: string
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
 * 按地形对查找贴图集文件名。
 * 返回的贴图集用于叠画在 low 地形上；不存在该对时返回 undefined
 * （如 grass-dirt：grass 作为 low 时有 dirt-grass 贴图集可用，方向相反）。
 */
export function findAutotileFile(high: string, low: string): string | undefined {
  return AUTOTILE_PAIRS.find((p) => p.high === high && p.low === low)?.filename
}

// =====================================================
// 位掩码计算（运行时与生成脚本共用同一语义）
// =====================================================

/** 四方向位定义 */
export const DIR_BITS = { up: 0x1, right: 0x2, down: 0x4, left: 0x8 } as const
export type DirKey = keyof typeof DIR_BITS

/**
 * 从低地形 tile 的视角计算位掩码：哪些邻居是高地形。
 * @param highType 高地形类型名
 * @param getNeighbor 读取邻居类型的函数 (dx, dy) => type
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

// =====================================================
// 象限合成（生成脚本使用）
// =====================================================
/**
 * 每个子块（48×48）由 4 个 24×24 象限组成。
 * 每个象限根据位掩码中朝外的两条边判断属于高地形还是低地形：
 * - 两条边都为"高"→ 该象限 = 高地形不透明（外角）
 * - 否则 → 该象限 = 透明（低地形底图透出）
 * 只有一条边为"高"时，该象限仍透明，但边缘会画有机锯齿过渡。
 */

/**
 * 计算某个象限在 overlay 中是否属于高地形（不透明）。
 * @param mask 位掩码（低地形 tile 视角：哪些邻居是高地形）
 * @param qx 象限列（0=左半，1=右半）
 * @param qy 象限行（0=上半，1=下半）
 */
export function quadrantIsHigh(mask: number, qx: number, qy: number): boolean {
  const topDiff = (mask & DIR_BITS.up) !== 0
  const rightDiff = (mask & DIR_BITS.right) !== 0
  const bottomDiff = (mask & DIR_BITS.down) !== 0
  const leftDiff = (mask & DIR_BITS.left) !== 0

  // 当象限朝外的两条边都指向高地形时，该象限属于高地形（外角，不透明）
  if (qx === 0 && qy === 0) return topDiff && leftDiff
  if (qx === 1 && qy === 0) return topDiff && rightDiff
  if (qx === 0 && qy === 1) return bottomDiff && leftDiff
  return bottomDiff && rightDiff
}

// =====================================================
// 运行时使用：由掩码直接定位子块在贴图集中的位置
// =====================================================

/**
 * 将位掩码映射到贴图集网格坐标。
 * 返回的子块区域为 [col*48, row*48, 48, 48]，运行时通过 Phaser 纹理帧裁切使用。
 * 映射规则：col = mask % 4, row = ⌊mask / 4⌋（16 种掩码 → 4×4 网格，第 5 行预留）
 */
export function maskToGridPos(mask: number): { col: number; row: number } {
  return { col: mask % 4, row: Math.floor(mask / 4) }
}