/**
 * 俯视 2.5D 坐标转换与深度排序工具。
 *
 * 采用俯视（top-down）投影替代原 3/4 等距视角：tile 为正方形，
 * 屏幕坐标 = 网格坐标 × tile 尺寸。实体（角色/建筑/资源）通过
 * "高度"（贴图向上延伸）与 y 轴深度排序营造 2.5D 立体感，更适合大世界探索。
 */

export const TILE_WIDTH = 48
export const TILE_HEIGHT = 48

/**
 * 将世界网格坐标 (gridX, gridY) 转换为屏幕坐标（tile 中心点）。
 * 实体（角色/建筑/资源）以该中心点为"立足点"放置。
 */
export function gridToIso(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: (gridX + 0.5) * TILE_WIDTH,
    y: (gridY + 0.5) * TILE_HEIGHT,
  }
}

/** 将屏幕坐标还原为世界网格坐标 */
export function isoToGrid(isoX: number, isoY: number): { gridX: number; gridY: number } {
  return {
    gridX: isoX / TILE_WIDTH - 0.5,
    gridY: isoY / TILE_HEIGHT - 0.5,
  }
}

/**
 * 俯视场景的前后遮挡关系依赖 y 坐标：y 越大越靠"前"（屏幕下方），depth 随之递增。
 * 可移动实体（角色/建筑）在每帧或位置变化后调用本函数刷新 depth。
 */
export function applyIsoDepth(gameObject: { y: number; setDepth: (depth: number) => void }): void {
  gameObject.setDepth(gameObject.y)
}
