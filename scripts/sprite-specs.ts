/**
 * 游戏素材清单 —— 定义所有需要 AI 生成的贴图
 *
 * 命名与 PreloadScene 生成的占位贴图 key 完全一致，
 * 生成后放入 public/assets/sprites/ 即可实现无缝替换。
 */

export interface SpriteSpec {
  /** Phaser 纹理 key（与 PreloadScene 中一致） */
  key: string
  /** 输出文件名（不含路径，放在 public/assets/sprites/ 下） */
  filename: string
  /** 像素宽度 */
  width: number
  /** 像素高度 */
  height: number
  /** AI 绘图 prompt（英文，面向 pixel-art top-down RPG 风格） */
  prompt: string
  /** 是否为 tile（平铺地形块，需要无缝衔接） */
  isTile?: boolean
  /** 负面 prompt（可选，描述不希望出现的内容） */
  negativePrompt?: string
}

// =====================================================================
// 地形 Tile（48×48，平铺，无缝衔接）
// =====================================================================

const TILE_SIZE = 48

export const TILE_SPRITES: SpriteSpec[] = [
  {
    key: 'tile-grass-0',
    filename: 'tile-grass-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG grass tile, 48x48 pixels, lush green short grass texture with tiny grass blades and small pebbles, seamless tileable, no grid lines, no borders, flat top-down view, vibrant green tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D',
  },
  {
    key: 'tile-grass-1',
    filename: 'tile-grass-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG grass tile variant, 48x48 pixels, slightly different grass texture with small flowers and clover patches, seamless tileable, no grid lines, no borders, flat top-down view, vibrant green tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D',
  },
  {
    key: 'tile-grass-2',
    filename: 'tile-grass-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG grass tile variant, 48x48 pixels, darker grass with small dirt patches and tiny weeds, seamless tileable, no grid lines, no borders, flat top-down view, deep green tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D',
  },
  {
    key: 'tile-dirt-0',
    filename: 'tile-dirt-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG dirt tile, 48x48 pixels, brown soil texture with small pebbles and cracks, seamless tileable, no grid lines, no borders, flat top-down view, warm brown earth tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-dirt-1',
    filename: 'tile-dirt-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG dirt tile variant, 48x48 pixels, lighter sandy soil with scattered small stones and root fragments, seamless tileable, no grid lines, no borders, flat top-down view, light brown tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-dirt-2',
    filename: 'tile-dirt-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG dirt tile variant, 48x48 pixels, darker soil with wet patches and small clumps, seamless tileable, no grid lines, no borders, flat top-down view, dark brown tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-sand-0',
    filename: 'tile-sand-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG sand tile, 48x48 pixels, smooth sandy beach texture with gentle ripples and tiny shells, seamless tileable, no grid lines, no borders, flat top-down view, warm golden sand tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-sand-1',
    filename: 'tile-sand-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG sand tile variant, 48x48 pixels, sand with small pebbles and driftwood fragments, seamless tileable, no grid lines, no borders, flat top-down view, light golden tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-sand-2',
    filename: 'tile-sand-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG sand tile variant, 48x48 pixels, wet sand near water edge with subtle sparkle and foam traces, seamless tileable, no grid lines, no borders, flat top-down view, damp golden tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass',
  },
  {
    key: 'tile-water-0',
    filename: 'tile-water-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG water tile, 48x48 pixels, calm ocean water surface with gentle ripples and subtle wave patterns, seamless tileable, no grid lines, no borders, flat top-down view, deep blue water tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand',
  },
  {
    key: 'tile-water-1',
    filename: 'tile-water-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG water tile variant, 48x48 pixels, slightly lighter ocean water with more visible ripples and small foam dots, seamless tileable, no grid lines, no borders, flat top-down view, medium blue tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand',
  },
  {
    key: 'tile-water-2',
    filename: 'tile-water-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG water tile variant, 48x48 pixels, darker deep ocean water with swirling currents and subtle light reflections, seamless tileable, no grid lines, no borders, flat top-down view, dark blue tones',
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand',
  },
]

// =====================================================================
// 水面动画帧（48×48，4 帧）
// =====================================================================

export const WATER_ANIM_SPRITES: SpriteSpec[] = Array.from({ length: 4 }, (_, i) => ({
  key: `water-anim-${i}`,
  filename: `water-anim-${i}.png`,
  width: TILE_SIZE,
  height: TILE_SIZE,
  isTile: true,
  prompt: `Top-down 2D pixel art RPG water animation frame ${i + 1} of 4, 48x48 pixels, semi-transparent white wave foam overlay on ocean water, animated ripple pattern frame ${i + 1}, seamless tileable, no grid lines, no borders, transparent background, only the foam overlay layer`,
  negativePrompt: 'grid lines, borders, solid background, opaque, perspective, isometric, 3D',
}))

// =====================================================================
// 玩家角色（32×48，俯视 2.5D）
// =====================================================================

export const PLAYER_SPRITES: SpriteSpec[] = [
  {
    key: 'player-placeholder',
    filename: 'player-placeholder.png',
    width: 32,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG character sprite, 32x48 pixels, young adventurer with black hair, fair skin, wearing casual blue tunic and brown boots, viewed from above at slight angle, front-facing idle pose, transparent background, clean pixel art outline, suitable for top-down RPG game like Stardew Valley or Pokemon style',
    negativePrompt: 'grid lines, borders, shadow on ground, perspective lines, 3D render, realistic, multiple characters',
  },
]

// =====================================================================
// 资源节点（24×28，俯视）
// =====================================================================

export const RESOURCE_SPRITES: SpriteSpec[] = [
  {
    key: 'resource-wood',
    filename: 'resource-wood.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG resource node, 24x28 pixels, a small pile of brown logs stacked neatly, forest tree stump with axe, transparent background, top-down view with slight 2.5D angle, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene',
  },
  {
    key: 'resource-stone',
    filename: 'resource-stone.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG resource node, 24x28 pixels, a cluster of gray rocks and stone boulders, mining node, transparent background, top-down view with slight 2.5D angle, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene',
  },
  {
    key: 'resource-mineral',
    filename: 'resource-mineral.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG resource node, 24x28 pixels, glowing blue crystal cluster growing from rock, mineral deposit, transparent background, top-down view with slight 2.5D angle, pixel art style, subtle blue glow',
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene',
  },
  {
    key: 'resource-coral',
    filename: 'resource-coral.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG resource node, 24x28 pixels, pink coral branch growing from seabed, underwater coral formation, transparent background, top-down view with slight 2.5D angle, pixel art style, soft pink tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene',
  },
  {
    key: 'resource-deep_mineral',
    filename: 'resource-deep_mineral.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG resource node, 24x28 pixels, glowing purple amethyst crystals in dark cave rock, deep mineral deposit, transparent background, top-down view with slight 2.5D angle, pixel art style, purple glow',
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene',
  },
]

// 资源节点耗尽态
export const RESOURCE_DEPLETED_SPRITES: SpriteSpec[] = [
  {
    key: 'resource-wood-depleted',
    filename: 'resource-wood-depleted.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG depleted resource node, 24x28 pixels, an empty tree stump with wood chips scattered, depleted wood node, transparent background, top-down view, pixel art style, gray and desaturated tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, fresh wood, full logs',
  },
  {
    key: 'resource-stone-depleted',
    filename: 'resource-stone-depleted.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG depleted resource node, 24x28 pixels, an empty small crater with rubble dust, depleted stone node, transparent background, top-down view, pixel art style, gray and desaturated tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, full rocks',
  },
  {
    key: 'resource-mineral-depleted',
    filename: 'resource-mineral-depleted.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG depleted resource node, 24x28 pixels, empty rock with small blue crystal fragments, depleted mineral node, transparent background, top-down view, pixel art style, dull gray-blue tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, glowing crystals',
  },
  {
    key: 'resource-coral-depleted',
    filename: 'resource-coral-depleted.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG depleted resource node, 24x28 pixels, broken coral fragments on seabed, depleted coral node, transparent background, top-down view, pixel art style, dull gray-pink tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, living coral',
  },
  {
    key: 'resource-deep_mineral-depleted',
    filename: 'resource-deep_mineral-depleted.png',
    width: 24,
    height: 28,
    prompt: 'Top-down 2D pixel art RPG depleted resource node, 24x28 pixels, empty dark cave rock with tiny purple dust, depleted deep mineral node, transparent background, top-down view, pixel art style, dark gray tones',
    negativePrompt: 'grid lines, borders, 3D, realistic, glowing crystals',
  },
]

// =====================================================================
// 建筑/房屋（48×56，俯视 2.5D）
// =====================================================================

export const HOUSE_SPRITES: SpriteSpec[] = [
  {
    key: 'house-wooden_house',
    filename: 'house-wooden_house.png',
    width: 48,
    height: 56,
    prompt: 'Top-down 2.5D pixel art RPG wooden house building, 48x56 pixels, small cozy cabin with brown wooden walls and dark brown shingled roof, a front door and two small windows, transparent background, slight 2.5D angle from above, pixel art style, like Stardew Valley building',
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building',
  },
  {
    key: 'house-stone_house',
    filename: 'house-stone_house.png',
    width: 48,
    height: 56,
    prompt: 'Top-down 2.5D pixel art RPG stone house building, 48x56 pixels, small cottage with gray stone walls and dark gray slate roof, a wooden front door and small windows, transparent background, slight 2.5D angle from above, pixel art style, like Stardew Valley building',
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building',
  },
  {
    key: 'house-advanced_house',
    filename: 'house-advanced_house.png',
    width: 48,
    height: 56,
    prompt: 'Top-down 2.5D pixel art RPG advanced magical house building, 48x56 pixels, small mystical tower house with purple stone walls and deep purple pointed roof, glowing windows and ornate door, transparent background, slight 2.5D angle from above, pixel art style, fantasy game building',
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building',
  },
  {
    key: 'house-island_hut',
    filename: 'house-island_hut.png',
    width: 48,
    height: 56,
    prompt: 'Top-down 2.5D pixel art RPG tropical island hut building, 48x56 pixels, small beach hut with sandy colored bamboo walls and brown thatched palm leaf roof, open doorway, transparent background, slight 2.5D angle from above, pixel art style, tropical island vibe',
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building',
  },
]

// =====================================================================
// 室内地板纹理（48×48 tile）
// =====================================================================

export const INTERIOR_FLOOR_SPRITES: SpriteSpec[] = [
  {
    key: 'floor-wooden_house',
    filename: 'floor-wooden_house.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG interior wooden floor tile, 48x48 pixels, warm brown wooden plank flooring texture with grain details, seamless tileable, no grid lines, no borders, flat top-down view, cozy cabin floor',
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture',
  },
  {
    key: 'floor-stone_house',
    filename: 'floor-stone_house.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG interior stone floor tile, 48x48 pixels, gray stone tile flooring with subtle texture and mortar lines, seamless tileable, no grid lines, no borders, flat top-down view, castle interior floor',
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture',
  },
  {
    key: 'floor-advanced_house',
    filename: 'floor-advanced_house.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: 'Top-down 2D pixel art RPG interior magical floor tile, 48x48 pixels, purple enchanted stone flooring with subtle glowing rune patterns, seamless tileable, no grid lines, no borders, flat top-down view, fantasy interior floor',
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture',
  },
]

// =====================================================================
// 室内墙壁（48×24，用于 2.5D 墙面效果）
// =====================================================================

export const INTERIOR_WALL_SPRITES: SpriteSpec[] = [
  {
    key: 'wall-top',
    filename: 'wall-top.png',
    width: 48,
    height: 24,
    prompt: 'Top-down 2.5D pixel art RPG interior wall section, 48x24 pixels, wooden wall seen from slight above angle, brown wood plank texture with subtle highlights, this is a wall strip for the top edge of a room, transparent background, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, floor, furniture, perspective lines',
  },
  {
    key: 'wall-left',
    filename: 'wall-left.png',
    width: 24,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG interior wall section, 24x48 pixels, wooden wall seen from slight above angle, brown wood plank texture with subtle highlights, this is a wall strip for the left edge of a room, transparent background, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, floor, furniture, perspective lines',
  },
]

// =====================================================================
// 室内家具（多尺寸，俯视 2.5D）
// =====================================================================

export const FURNITURE_SPRITES: SpriteSpec[] = [
  {
    key: 'furniture-card_table',
    filename: 'furniture-card_table.png',
    width: 96,
    height: 96,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 96x96 pixels, a green felt card table with playing cards scattered on top, 2x2 tile size furniture, transparent background, slight 2.5D angle from above, pixel art style, cozy game room furniture',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-radio',
    filename: 'furniture-radio.png',
    width: 48,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x48 pixels, a vintage blue retro radio with antenna and speaker grill, 1x1 tile size, transparent background, slight 2.5D angle from above, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-jukebox',
    filename: 'furniture-jukebox.png',
    width: 48,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x48 pixels, a purple pink retro jukebox with glowing records, 1x1 tile size, transparent background, slight 2.5D angle from above, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-projector',
    filename: 'furniture-projector.png',
    width: 96,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 96x48 pixels, an orange movie projector on a small stand, 2x1 tile size, transparent background, slight 2.5D angle from above, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-sofa',
    filename: 'furniture-sofa.png',
    width: 96,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 96x48 pixels, a red comfy sofa couch, 2x1 tile size, transparent background, slight 2.5D angle from above, pixel art style, cozy living room furniture',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-table',
    filename: 'furniture-table.png',
    width: 48,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x48 pixels, a small brown wooden chair and table set, 1x1 tile size, transparent background, slight 2.5D angle from above, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-plant',
    filename: 'furniture-plant.png',
    width: 48,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x48 pixels, a small potted green houseplant in a terracotta pot, 1x1 tile size, transparent background, slight 2.5D angle from above, pixel art style, decorative plant',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-bookshelf',
    filename: 'furniture-bookshelf.png',
    width: 48,
    height: 96,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x96 pixels, a tall brown wooden bookshelf filled with colorful books, 1x2 tile size, transparent background, slight 2.5D angle from above, pixel art style',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-bed',
    filename: 'furniture-bed.png',
    width: 96,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 96x48 pixels, a pink cozy single bed with pillow and blanket, 2x1 tile size, transparent background, slight 2.5D angle from above, pixel art style, bedroom furniture',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
  {
    key: 'furniture-lamp',
    filename: 'furniture-lamp.png',
    width: 48,
    height: 48,
    prompt: 'Top-down 2.5D pixel art RPG furniture, 48x48 pixels, a small golden glowing table lamp with warm light, 1x1 tile size, transparent background, slight 2.5D angle from above, pixel art style, warm illumination',
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor',
  },
]

// =====================================================================
// 全部素材合集
// =====================================================================

export const ALL_SPRITES: SpriteSpec[] = [
  ...TILE_SPRITES,
  ...WATER_ANIM_SPRITES,
  ...PLAYER_SPRITES,
  ...RESOURCE_SPRITES,
  ...RESOURCE_DEPLETED_SPRITES,
  ...HOUSE_SPRITES,
  ...INTERIOR_FLOOR_SPRITES,
  ...INTERIOR_WALL_SPRITES,
  ...FURNITURE_SPRITES,
]

/** 统计信息 */
export const SPRITE_STATS = {
  tiles: TILE_SPRITES.length,
  waterAnim: WATER_ANIM_SPRITES.length,
  player: PLAYER_SPRITES.length,
  resources: RESOURCE_SPRITES.length + RESOURCE_DEPLETED_SPRITES.length,
  houses: HOUSE_SPRITES.length,
  interiorFloor: INTERIOR_FLOOR_SPRITES.length,
  interiorWall: INTERIOR_WALL_SPRITES.length,
  furniture: FURNITURE_SPRITES.length,
  total: ALL_SPRITES.length,
}