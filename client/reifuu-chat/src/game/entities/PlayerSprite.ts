import Phaser from 'phaser'
import { applyIsoDepth } from '../utils/isometric'

/**
 * 本地玩家精灵：Phase 1 阶段仅承载占位贴图 + 平滑插值移动，
 * 后续接入正式美术资源后在此扩展方向动画（东南/西南/东北/西北）。
 */
export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private targetX: number
  private targetY: number
  private readonly moveSpeed = 160 // 像素/秒

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-placeholder')
    this.targetX = x
    this.targetY = y
    this.setOrigin(0.5, 0.9)
    scene.add.existing(this)
    applyIsoDepth(this)
  }

  /** 设置移动目标点（等距屏幕坐标），update() 中平滑插值靠近 */
  moveTo(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
  }

  get isMoving(): boolean {
    return Math.abs(this.targetX - this.x) > 0.5 || Math.abs(this.targetY - this.y) > 0.5
  }

  update(deltaMs: number): void {
    if (!this.isMoving) return

    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    const distance = Math.hypot(dx, dy)
    const step = this.moveSpeed * (deltaMs / 1000)

    if (step >= distance) {
      this.x = this.targetX
      this.y = this.targetY
    } else {
      this.x += (dx / distance) * step
      this.y += (dy / distance) * step
    }

    applyIsoDepth(this)
  }
}
