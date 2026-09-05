import Phaser from 'phaser'
import { TILE_HEIGHT, TILE_WIDTH } from '../utils/isometric'

const TILE_COLORS: Record<string, number> = {
  grass: 0x4caf6b,
  dirt: 0xa0703f,
  water: 0x4a90d9,
}

/** 资源节点颜色（像素中世纪占位画风，后续替换正式美术） */
const RESOURCE_COLORS: Record<string, number> = {
  wood: 0x8b5a2b,
  stone: 0x9e9e9e,
  mineral: 0x64b5f6,
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
    this.generateResourceTextures()
    this.generateHouseTextures()
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
      g.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT)
      // 轻微网格线，便于辨识 tile 边界
      g.lineStyle(1, 0x000000, 0.12)
      g.strokeRect(0, 0, TILE_WIDTH, TILE_HEIGHT)
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
    // 身体（略窄于 tile，2.5D 纵深感）
    g.fillStyle(0x8fd3ff, 1)
    g.fillRoundedRect(4, 14, width - 8, height - 18, 4)
    // 头部（俯视圆形）
    g.fillStyle(0xffe0b2, 1)
    g.fillCircle(width / 2, 10, 8)
    // 阴影底座
    g.fillStyle(0x000000, 0.15)
    g.fillEllipse(width / 2, height - 2, 28, 10)
    g.generateTexture(key, width, height)
    g.destroy()
  }

  /** 生成资源节点占位贴图（正常 / 已耗尽两态） */
  private generateResourceTextures(): void {
    const width = 24
    const height = 28

    for (const [type, color] of Object.entries(RESOURCE_COLORS)) {
      const key = `resource-${type}`
      if (!this.textures.exists(key)) {
        const g = this.add.graphics()
        // 底座
        g.fillStyle(0x5d4037, 1)
        g.fillEllipse(width / 2, height - 6, 20, 10)
        // 主体（矿石为晶体簇造型）
        g.fillStyle(color, 1)
        if (type === 'mineral') {
          g.fillTriangle(width / 2, 4, width - 5, height - 10, 5, height - 10)
          g.fillTriangle(width / 2 - 4, 10, width / 2 + 2, height - 12, width / 2 - 6, height - 10)
        } else {
          g.fillRoundedRect(5, 8, width - 10, height - 14, 4)
          // 高光
          g.fillStyle(0xffffff, 0.25)
          g.fillRoundedRect(7, 10, 5, height - 18, 2)
        }
        g.generateTexture(key, width, height)
        g.destroy()
      }

      const depletedKey = `resource-${type}-depleted`
      if (!this.textures.exists(depletedKey)) {
        const g = this.add.graphics()
        // 耗尽态：仅剩灰暗底座
        g.fillStyle(0x37474f, 1)
        g.fillEllipse(width / 2, height - 8, 18, 8)
        g.fillStyle(0x263238, 1)
        g.fillEllipse(width / 2, height - 6, 12, 6)
        g.generateTexture(depletedKey, width, height)
        g.destroy()
      }
    }
  }

  /** 生成聊天室房屋占位贴图（三种模板，像素中世纪画风占位） */
  private generateHouseTextures(): void {
    const HOUSE_COLORS: Record<string, { wall: number; roof: number }> = {
      wooden_house: { wall: 0x8b5a2b, roof: 0x5d4037 },
      stone_house: { wall: 0x9e9e9e, roof: 0x616161 },
      advanced_house: { wall: 0x7e57c2, roof: 0x4527a0 },
    }

    const width = 48
    const height = 56

    for (const [template, colors] of Object.entries(HOUSE_COLORS)) {
      const key = `house-${template}`
      if (this.textures.exists(key)) continue

      const g = this.add.graphics()
      // 底座阴影
      g.fillStyle(0x000000, 0.2)
      g.fillEllipse(width / 2, height - 6, 40, 12)
      // 墙体（等距立方体正面）
      g.fillStyle(colors.wall, 1)
      g.fillRoundedRect(8, 22, width - 16, height - 30, 3)
      // 屋顶（三角形）
      g.fillStyle(colors.roof, 1)
      g.fillTriangle(width / 2, 2, width - 4, 24, 4, 24)
      // 门
      g.fillStyle(0x3e2723, 1)
      g.fillRoundedRect(width / 2 - 6, height - 22, 12, 16, 2)
      // 窗户
      g.fillStyle(0xfff8e1, 1)
      g.fillRoundedRect(12, 28, 8, 8, 1)
      g.fillRoundedRect(width - 20, 28, 8, 8, 1)

      g.generateTexture(key, width, height)
      g.destroy()
    }
  }
}
