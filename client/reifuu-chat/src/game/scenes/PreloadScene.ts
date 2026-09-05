import Phaser from 'phaser'
import { TILE_HEIGHT, TILE_WIDTH } from '../utils/isometric'
import { hashStringToSeed, createSeededRandom } from '../utils/rng'

/** 每种地形的变体数量（用于纹理丰富度） */
const TILE_VARIANTS = 3

/** 地形基础色板：每种类型有基色 + 1-2 个变体色（微调亮度/色相） */
const TILE_PALETTES: Record<string, number[]> = {
  grass: [0x4caf6b, 0x5cb877, 0x3da05e],
  dirt: [0xa0703f, 0xb07d4a, 0x94663a],
  water: [0x4a90d9, 0x5a9fe0, 0x3a80c8],
  sand: [0xe6d5a8, 0xeadab0, 0xe0d0a0],
}

/** 资源节点颜色（像素中世纪占位画风，后续替换正式美术） */
const RESOURCE_COLORS: Record<string, number> = {
  wood: 0x8b5a2b,
  stone: 0x9e9e9e,
  mineral: 0x64b5f6,
  coral: 0xff6b9d,
  deep_mineral: 0x7e57c2,
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
    this.generateEdgeTextures()
    this.generateWaterAnimTextures()
    this.generatePlayerTexture()
    this.generateResourceTextures()
    this.generateHouseTextures()
  }

  create(): void {
    this.scene.start('WorldScene')
  }

  /**
   * 生成地形 tile 贴图（每种类型 TILE_VARIANTS 个变体）。
   * 贴图 key：`tile-{type}`（变体0，兼容旧引用）与 `tile-{type}-{n}`（0..VARIANTS-1）。
   * 每个变体带轻微噪点纹理 + 内斜面边缘，增强 2.5D 纵深感。
   */
  private generateTileTextures(): void {
    for (const [type, colors] of Object.entries(TILE_PALETTES)) {
      for (let v = 0; v < TILE_VARIANTS; v++) {
        // 变体 0 同时注册为 `tile-{type}` 和 `tile-{type}-0`（兼容旧引用）
        const keys = v === 0 ? [`tile-${type}`, `tile-${type}-0`] : [`tile-${type}-${v}`]

        for (const key of keys) {
          if (this.textures.exists(key)) continue

          const baseColor = colors[v % colors.length]
          const random = createSeededRandom(hashStringToSeed(`${type}_${v}`))
          const g = this.add.graphics()

          // 底色
          g.fillStyle(baseColor, 1)
          g.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT)

          // 噪点斑块（像素画质感）：随机小方块，颜色从同色板取
          const speckleCount = 10 + Math.floor(random() * 8)
          for (let i = 0; i < speckleCount; i++) {
            const sx = Math.floor(random() * (TILE_WIDTH - 6)) + 2
            const sy = Math.floor(random() * (TILE_HEIGHT - 6)) + 2
            const size = 2 + Math.floor(random() * 3)
            const speckleColor = colors[Math.floor(random() * colors.length)]
            // 只在与基色不同时绘制，避免同色斑块
            if (speckleColor !== baseColor) {
              g.fillStyle(speckleColor, 0.55)
              g.fillRect(sx, sy, size, size)
            }
          }

          // 不再绘制网格线和斜面高光，让同类地形 tile 无缝衔接；
          // 地形边界由 Edge 贴图系统（generateEdgeTextures）平滑过渡。
          g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT)
          g.destroy()
        }
      }
    }
  }

  /**
   * 生成地形边界过渡贴图。
   *
   * 每种地形类型 × 4 个方向（上/下/左/右）各一张：从该地形颜色渐变到透明的条带，
   * 叠加在相邻"低优先级"地形 tile 的对应边缘上，实现 grass→water 等边界的柔和过渡。
   * 贴图 key：`edge-{type}-{dir}`（dir: top/bottom/left/right）。
   */
  private generateEdgeTextures(): void {
    // 过渡条带宽度（像素）
    const EDGE_WIDTH = 10
    const dirs = ['top', 'bottom', 'left', 'right'] as const

    for (const [type, colors] of Object.entries(TILE_PALETTES)) {
      const baseColor = colors[0]
      for (const dir of dirs) {
        const key = `edge-${type}-${dir}`
        if (this.textures.exists(key)) continue

        const g = this.add.graphics()
        // 4 条渐变条纹：由该地形色逐渐变透明（阶梯渐变，像素风）
        for (let step = 0; step < 4; step++) {
          const alpha = 0.85 - step * 0.2
          const band = EDGE_WIDTH / 4
          g.fillStyle(baseColor, alpha)
          if (dir === 'top') g.fillRect(0, step * band, TILE_WIDTH, band)
          else if (dir === 'bottom') g.fillRect(0, TILE_HEIGHT - EDGE_WIDTH + step * band, TILE_WIDTH, band)
          else if (dir === 'left') g.fillRect(step * band, 0, band, TILE_HEIGHT)
          else g.fillRect(TILE_WIDTH - EDGE_WIDTH + step * band, 0, band, TILE_HEIGHT)
        }
        g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT)
        g.destroy()
      }
    }
  }

  /**
   * 生成水面波纹动画帧（4 帧循环），用于 water tile 上层叠加。
   * 贴图 key：`water-anim-0` .. `water-anim-3`。
   */
  private generateWaterAnimTextures(): void {
    const frames = 4
    for (let f = 0; f < frames; f++) {
      const key = `water-anim-${f}`
      if (this.textures.exists(key)) continue

      const g = this.add.graphics()
      const random = createSeededRandom(hashStringToSeed(`water_anim_${f}`))
      const waveCount = 3 + f

      for (let i = 0; i < waveCount; i++) {
        const x = Math.floor(random() * TILE_WIDTH)
        const y = Math.floor(random() * TILE_HEIGHT)
        const w = 6 + Math.floor(random() * 12)
        const h = 2 + Math.floor(random() * 3)
        // 白色波纹线条，半透明
        g.fillStyle(0xffffff, 0.08 + random() * 0.06)
        g.fillEllipse(x + w / 2, y, w, h)
      }
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
      island_hut: { wall: 0xd4a373, roof: 0x8b6f47 },
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
