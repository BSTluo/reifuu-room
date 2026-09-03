/**
 * 等距(3/4视角)坐标转换与深度排序工具。
 * Phase 0 阶段仅预留接口，具体 tile 宽高需在接入正式 Tilemap 时按美术资源确定。
 */

export const TILE_WIDTH = 64
export const TILE_HEIGHT = 32

/** 将区块网格坐标 (gridX, gridY) 转换为等距屏幕坐标 */
export function gridToIso(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: (gridX - gridY) * (TILE_WIDTH / 2),
    y: (gridX + gridY) * (TILE_HEIGHT / 2),
  }
}

/** 将等距屏幕坐标还原为区块网格坐标 */
export function isoToGrid(isoX: number, isoY: number): { gridX: number; gridY: number } {
  const gridX = isoY / TILE_HEIGHT + isoX / TILE_WIDTH
  const gridY = isoY / TILE_HEIGHT - isoX / TILE_WIDTH
  return { gridX, gridY }
}

/**
 * 等距场景的前后遮挡关系依赖 y 坐标：y 越大越靠"前"，depth 应随之递增。
 * 后续 WorldScene 中的可移动实体（角色/建筑）在每帧或位置变化后调用本函数刷新 depth。
 */
export function applyIsoDepth(gameObject: { y: number; setDepth: (depth: number) => void }): void {
  gameObject.setDepth(gameObject.y)
}
