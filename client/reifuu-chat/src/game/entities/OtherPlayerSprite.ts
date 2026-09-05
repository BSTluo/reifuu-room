import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { applyIsoDepth } from '../utils/isometric'

/**
 * 其他玩家精灵：渲染同区块内的其他玩家，显示昵称，支持平滑插值移动。
 * 可点击：点击后通过 EventBus 发出 ui:show-player-info（用于加好友等）。
 */
export class OtherPlayerSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite
  private nameText: Phaser.GameObjects.Text
  private targetX: number
  private targetY: number
  readonly characterId: string
  private readonly moveSpeed = 160 // 像素/秒

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    nickname: string,
    characterId: string
  ) {
    super(scene, x, y)
    this.characterId = characterId

    // 角色精灵（使用与本地玩家相同的占位贴图）
    this.sprite = scene.add.sprite(0, 0, 'player-placeholder')
    this.sprite.setOrigin(0.5, 0.9)
    this.sprite.setTint(0xaaaaaa) // 灰色tint区分其他玩家

    // 昵称文本（浮在角色上方）
    this.nameText = scene.add.text(0, -50, nickname, {
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 },
    })
    this.nameText.setOrigin(0.5, 1)

    this.add([this.sprite, this.nameText])
    scene.add.existing(this)

    this.targetX = x
    this.targetY = y

    // 点击查看玩家信息（加好友等交互）
    this.setInteractive(
      new Phaser.Geom.Rectangle(-16, -56, 32, 64),
      Phaser.Geom.Rectangle.Contains
    )
    this.on('pointerdown', () => {
      EventBus.emit('ui:show-player-info', {
        characterId: this.characterId,
        nickname,
      })
    })

    applyIsoDepth(this)
  }

  moveToPosition(x: number, y: number): void {
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
