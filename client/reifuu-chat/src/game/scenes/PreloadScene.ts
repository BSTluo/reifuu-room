import Phaser from 'phaser'
import { TILE_HEIGHT, TILE_WIDTH } from '../utils/isometric'

const TILE_COLORS: Record<string, number> = {
  grass: 0x4caf6b,
  dirt: 0xa0703f,
  water: 0x4a90d9,
}
/**
 * 资源加载骨架：Phase 1 阶段用 Graphics 生成临时的等距 tile 与角色占位贴图，
 * 后续接入正式美术资源（Tiled Tilemap / sprite sheet）时替换本文件内容即可，
 * 下游（WorldScene/PlayerSprite）只依赖贴图 key，不受影响。
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene')
  }

  preload(): void {
    this.generateTileTextures()
    this.generatePlayerTexture()
  }

  create(): void {
    this.scene.start('WorldScene')
  }

  private generateTileTextures(): void {
    for (const [type, color] of Object.entries(TILE_COLORS)) {
      const key = `tile-${type}`
      if (this.textures.exists(key)) continue

      const g = this.add.graphics()
      g.fillStyle(color, 1)
      g.lineStyle(1, 0x000000, 0.15)
      g.beginPath()
      g.moveTo(TILE_WIDTH / 2, 0)
      g.lineTo(TILE_WIDTH, TILE_HEIGHT / 2)
      g.lineTo(TILE_WIDTH / 2, TILE_HEIGHT)
      g.lineTo(0, TILE_HEIGHT / 2)
      g.closePath()
      g.fillPath()
      g.strokePath()
      g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT)
      g.destroy()
    }
  }

  private generatePlayerTexture(): void {
    const key = 'player-placeholder'
    if (this.textures.exists(key)) return

    const width = 32
    const height = 48
    const g = this.add.graphics()
    g.fillStyle(0x8fd3ff, 1)
    g.fillRoundedRect(4, 10, width - 8, height - 14, 4)
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(width / 2, 9, 7)
    g.generateTexture(key, width, height)
    g.destroy()
  }
}
