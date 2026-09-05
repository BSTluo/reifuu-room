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

/** 室内地板色板（与 InteriorScene FLOOR_COLORS 对应） */
const FLOOR_COLORS: Record<string, number> = {
  wooden_house: 0x8b6e4a,
  stone_house: 0x9e9e8e,
  advanced_house: 0x7e57c2,
}

/** 室内墙色板 */
const WALL_COLOR = 0x5d4037

/** 家具占位色板（与 InteriorScene FURNITURE_VISUALS 对应） */
const FURNITURE_VISUALS: Record<string, { color: number; w: number; h: number; icon: string }> = {
  card_table: { color: 0x2e7d32, w: 2, h: 2, icon: '🃏' },
  radio: { color: 0x42a5f5, w: 1, h: 1, icon: '📻' },
  jukebox: { color: 0xab47bc, w: 1, h: 1, icon: '🎵' },
  projector: { color: 0xff7043, w: 2, h: 1, icon: '🎬' },
  sofa: { color: 0xef5350, w: 2, h: 1, icon: '🛋️' },
  table: { color: 0x8d6e63, w: 1, h: 1, icon: '🪑' },
  plant: { color: 0x66bb6a, w: 1, h: 1, icon: '🪴' },
  bookshelf: { color: 0x6d4c41, w: 1, h: 2, icon: '📚' },
  bed: { color: 0xec407a, w: 2, h: 1, icon: '🛏️' },
  lamp: { color: 0xffca28, w: 1, h: 1, icon: '💡' },
}

/**
 * AI 生成贴图清单：key 与 Graphics 占位图完全一致，加载成功后下游
 * （WorldScene/InteriorScene/PlayerSprite）无感知切换。
 * 文件位于 public/assets/sprites/，由 scripts/generate-sprites.ts 生成。
 */
const SPRITE_FILES: Record<string, string> = {
  // 地形 tile（48×48）
  'tile-grass-0': 'tile-grass-0.png',
  'tile-grass-1': 'tile-grass-1.png',
  'tile-grass-2': 'tile-grass-2.png',
  'tile-dirt-0': 'tile-dirt-0.png',
  'tile-dirt-1': 'tile-dirt-1.png',
  'tile-dirt-2': 'tile-dirt-2.png',
  'tile-water-0': 'tile-water-0.png',
  'tile-water-1': 'tile-water-1.png',
  'tile-water-2': 'tile-water-2.png',
  'tile-sand-0': 'tile-sand-0.png',
  'tile-sand-1': 'tile-sand-1.png',
  'tile-sand-2': 'tile-sand-2.png',
  // 水面动画帧（48×48）
  'water-anim-0': 'water-anim-0.png',
  'water-anim-1': 'water-anim-1.png',
  'water-anim-2': 'water-anim-2.png',
  'water-anim-3': 'water-anim-3.png',
  // 玩家（32×48）
  'player-placeholder': 'player-placeholder.png',
  // 资源节点（24×28）
  'resource-wood': 'resource-wood.png',
  'resource-stone': 'resource-stone.png',
  'resource-mineral': 'resource-mineral.png',
  'resource-coral': 'resource-coral.png',
  'resource-deep_mineral': 'resource-deep_mineral.png',
  'resource-wood-depleted': 'resource-wood-depleted.png',
  'resource-stone-depleted': 'resource-stone-depleted.png',
  'resource-mineral-depleted': 'resource-mineral-depleted.png',
  'resource-coral-depleted': 'resource-coral-depleted.png',
  'resource-deep_mineral-depleted': 'resource-deep_mineral-depleted.png',
  // 房屋建筑（48×56）
  'house-wooden_house': 'house-wooden_house.png',
  'house-stone_house': 'house-stone_house.png',
  'house-advanced_house': 'house-advanced_house.png',
  'house-island_hut': 'house-island_hut.png',
  // 室内地板（48×48）
  'floor-wooden_house': 'floor-wooden_house.png',
  'floor-stone_house': 'floor-stone_house.png',
  'floor-advanced_house': 'floor-advanced_house.png',
  // 室内墙（48×24 / 24×48）
  'wall-top': 'wall-top.png',
  'wall-left': 'wall-left.png',
  // 家具
  'furniture-card_table': 'furniture-card_table.png',
  'furniture-radio': 'furniture-radio.png',
  'furniture-jukebox': 'furniture-jukebox.png',
  'furniture-projector': 'furniture-projector.png',
  'furniture-sofa': 'furniture-sofa.png',
  'furniture-table': 'furniture-table.png',
  'furniture-plant': 'furniture-plant.png',
  'furniture-bookshelf': 'furniture-bookshelf.png',
  'furniture-bed': 'furniture-bed.png',
  'furniture-lamp': 'furniture-lamp.png',
}

/**
 * 资源加载：优先从 assets/sprites/ 加载 AI 生成的 PNG 贴图，
 * 缺失的贴图在 create() 中由 Graphics 占位图补齐。
 * 下游（WorldScene/InteriorScene/PlayerSprite）只依赖贴图 key，不受影响。
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene')
  }

  preload(): void {
    // 将所有 AI 贴图加入加载队列
    for (const [key, file] of Object.entries(SPRITE_FILES)) {
      this.load.image(key, `assets/sprites/${file}`)
    }
  }

  create(): void {
    // 为加载失败的贴图生成 Graphics 占位图
    this.generateTileTextures()
    this.generateEdgeTextures()
    this.generateWaterAnimTextures()
    this.generatePlayerTexture()
    this.generateResourceTextures()
    this.generateHouseTextures()
    this.generateInteriorTextures()
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

  /** 生成室内地板/墙/家具的 Graphics 占位贴图（AI 贴图缺失时兜底） */
  private generateInteriorTextures(): void {
    // ---- 地板（48×48，对应 InteriorScene FLOOR_COLORS） ----
    for (const [template, color] of Object.entries(FLOOR_COLORS)) {
      const key = `floor-${template}`
      if (this.textures.exists(key)) continue

      const g = this.add.graphics()
      g.fillStyle(color, 1)
      g.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT)
      // 木纹/石纹噪点
      const random = createSeededRandom(hashStringToSeed(`floor_${template}`))
      for (let i = 0; i < 8; i++) {
        g.fillStyle(0x000000, 0.06)
        g.fillRect(Math.floor(random() * (TILE_WIDTH - 8)), Math.floor(random() * (TILE_HEIGHT - 4)), 6, 2)
      }
      g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT)
      g.destroy()
    }

    // ---- 墙（上墙 48×24，左墙 24×48） ----
    if (!this.textures.exists('wall-top')) {
      const g = this.add.graphics()
      g.fillStyle(WALL_COLOR, 0.8)
      g.fillRect(0, 0, TILE_WIDTH, 24)
      g.lineStyle(2, 0x3e2723, 1)
      g.strokeRect(0, 0, TILE_WIDTH, 24)
      g.generateTexture('wall-top', TILE_WIDTH, 24)
      g.destroy()
    }
    if (!this.textures.exists('wall-left')) {
      const g = this.add.graphics()
      g.fillStyle(WALL_COLOR, 0.8)
      g.fillRect(0, 0, 24, TILE_HEIGHT)
      g.lineStyle(2, 0x3e2723, 1)
      g.strokeRect(0, 0, 24, TILE_HEIGHT)
      g.generateTexture('wall-left', 24, TILE_HEIGHT)
      g.destroy()
    }

    // ---- 家具（按 FURNITURE_VISUALS 尺寸生成，w/h 为 tile 数） ----
    for (const [type, visual] of Object.entries(FURNITURE_VISUALS)) {
      const key = `furniture-${type}`
      if (this.textures.exists(key)) continue

      const w = visual.w * TILE_WIDTH
      const h = visual.h * TILE_HEIGHT
      const g = this.add.graphics()
      // 影子
      g.fillStyle(0x000000, 0.2)
      g.fillEllipse(w / 2, h - 4, w * 0.8, 12)
      // 主体
      g.fillStyle(visual.color, 1)
      g.fillRoundedRect(4, 4, w - 8, h - 8, 6)
      // 高光
      g.fillStyle(0xffffff, 0.2)
      g.fillRoundedRect(6, 6, w - 16, 4, 2)
      g.generateTexture(key, w, h)
      g.destroy()
    }
  }
}
