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

// 统一的风格锚点：经典 16-bit JRPG 像素风（勇者斗恶龙 / 最终幻想 / 星露谷）
const STYLE = '16-bit JRPG pixel art in the style of Dragon Quest and Final Fantasy, Stardew Valley quality, rich hand-crafted detail, lush organic texture, vibrant saturated colors, crisp clean pixel clusters, no flat solid color fills'

export const TILE_SPRITES: SpriteSpec[] = [
  {
    key: 'tile-grass-0',
    filename: 'tile-grass-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable grass terrain tile, ${STYLE}. Lush green meadow with many individual grass blades in varied shades of green, scattered tiny white and yellow wildflowers, small clover patches, a few tiny pebbles, organic natural variation across the whole tile, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, flat solid color, empty plain, blurry, low detail',
  },
  {
    key: 'tile-grass-1',
    filename: 'tile-grass-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable grass terrain tile variant, ${STYLE}. Lush green grass with tiny pink and purple wildflowers, small mushrooms, clover patches, delicate grass blades in multiple green tones, organic natural variation, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, flat solid color, empty plain, blurry, low detail',
  },
  {
    key: 'tile-grass-2',
    filename: 'tile-grass-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable grass terrain tile variant, ${STYLE}. Deeper green grass with a few fallen leaves, tiny weeds, small pebbles, subtle dirt patches, rich layered grass blades in dark and light green, organic natural variation, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, flat solid color, empty plain, blurry, low detail',
  },
  {
    key: 'tile-dirt-0',
    filename: 'tile-dirt-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable dirt terrain tile, ${STYLE}. Rich brown soil with small pebbles, tiny roots, subtle cracks, varied earth tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-dirt-1',
    filename: 'tile-dirt-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable dirt terrain tile variant, ${STYLE}. Lighter sandy soil with scattered small stones, root fragments, tiny pebbles, varied light brown and tan tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-dirt-2',
    filename: 'tile-dirt-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable dirt terrain tile variant, ${STYLE}. Darker rich soil with subtle wet patches, small clumps, tiny stones, deep brown earth tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-sand-0',
    filename: 'tile-sand-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable sand terrain tile, ${STYLE}. Smooth golden beach sand with gentle wind ripples, tiny seashells, a small starfish, subtle sparkle, warm golden tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-sand-1',
    filename: 'tile-sand-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable sand terrain tile variant, ${STYLE}. Beach sand with small pebbles, driftwood fragments, a bit of dried seaweed, gentle ripples, light golden tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-sand-2',
    filename: 'tile-sand-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable wet sand terrain tile, ${STYLE}. Damp sand near the water edge with subtle foam traces, tiny sparkles, small shells, darker wet golden tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-water-0',
    filename: 'tile-water-0.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable ocean water tile, ${STYLE}. Calm deep blue ocean surface with gentle ripples, subtle wave patterns, soft light reflections, layered blue and teal tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-water-1',
    filename: 'tile-water-1.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable ocean water tile variant, ${STYLE}. Lighter turquoise ocean water with more visible ripples, small white foam dots, gentle wave crests, layered blue and cyan tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand, flat solid color, blurry, low detail',
  },
  {
    key: 'tile-water-2',
    filename: 'tile-water-2.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable deep ocean water tile variant, ${STYLE}. Darker deep ocean water with swirling currents, subtle light reflections, gentle wave patterns, rich navy and deep blue tones, organic natural texture, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, vignette, perspective, isometric, 3D, grass, sand, flat solid color, blurry, low detail',
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
  prompt: `Top-down seamless tileable water animation overlay frame ${i + 1} of 4, ${STYLE}. Semi-transparent white and light blue wave foam layer, animated gentle ripple pattern, soft foam bubbles, natural wave motion phase ${i + 1}, transparent background, only the foam overlay layer on top of water, no grid lines, no borders`,
  negativePrompt: 'grid lines, borders, solid background, opaque, perspective, isometric, 3D, flat solid color, blurry, low detail',
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
    prompt: `Top-down 2.5D pixel art RPG character sprite, ${STYLE}. Young adventurer with black hair, fair skin, wearing casual blue tunic and brown boots, viewed from above at slight angle, front-facing idle pose, clean crisp pixel outline, transparent background, detailed shading and highlights, suitable for top-down RPG game like Stardew Valley or Pokemon style`,
    negativePrompt: 'grid lines, borders, shadow on ground, perspective lines, 3D render, realistic, multiple characters, blurry, low detail',
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
    prompt: `Top-down 2.5D pixel art RPG resource node, ${STYLE}. A small pile of brown logs stacked neatly next to a tree stump, forest gathering point, detailed wood grain and bark texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene, blurry, low detail',
  },
  {
    key: 'resource-stone',
    filename: 'resource-stone.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG resource node, ${STYLE}. A cluster of gray rocks and stone boulders with visible mineral veins, mining node, detailed rocky texture with cracks and moss, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene, blurry, low detail',
  },
  {
    key: 'resource-mineral',
    filename: 'resource-mineral.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG resource node, ${STYLE}. Glowing blue crystal cluster growing from gray rock, mineral deposit, detailed crystal facets with soft blue glow, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene, blurry, low detail',
  },
  {
    key: 'resource-coral',
    filename: 'resource-coral.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG resource node, ${STYLE}. Pink coral branches growing from seabed, underwater coral formation, detailed coral texture with polyps, transparent background, slight 2.5D angle from above, soft pink tones`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene, blurry, low detail',
  },
  {
    key: 'resource-deep_mineral',
    filename: 'resource-deep_mineral.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG resource node, ${STYLE}. Glowing purple amethyst crystals in dark cave rock, deep mineral deposit, detailed crystal facets with purple glow, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large scene, blurry, low detail',
  },
]

// 资源节点耗尽态
export const RESOURCE_DEPLETED_SPRITES: SpriteSpec[] = [
  {
    key: 'resource-wood-depleted',
    filename: 'resource-wood-depleted.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG depleted resource node, ${STYLE}. An empty tree stump with scattered wood chips, depleted wood node, detailed bark texture, gray and desaturated tones, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, fresh wood, full logs, blurry, low detail',
  },
  {
    key: 'resource-stone-depleted',
    filename: 'resource-stone-depleted.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG depleted resource node, ${STYLE}. An empty small crater with rubble dust, depleted stone node, detailed rocky texture, gray and desaturated tones, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, full rocks, blurry, low detail',
  },
  {
    key: 'resource-mineral-depleted',
    filename: 'resource-mineral-depleted.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG depleted resource node, ${STYLE}. Empty rock with small blue crystal fragments, depleted mineral node, detailed rock texture, dull gray-blue tones, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, glowing crystals, blurry, low detail',
  },
  {
    key: 'resource-coral-depleted',
    filename: 'resource-coral-depleted.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG depleted resource node, ${STYLE}. Broken coral fragments on seabed, depleted coral node, detailed coral texture, dull gray-pink tones, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, living coral, blurry, low detail',
  },
  {
    key: 'resource-deep_mineral-depleted',
    filename: 'resource-deep_mineral-depleted.png',
    width: 24,
    height: 28,
    prompt: `Top-down 2.5D pixel art RPG depleted resource node, ${STYLE}. Empty dark cave rock with tiny purple dust, depleted deep mineral node, detailed rock texture, dark gray tones, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, glowing crystals, blurry, low detail',
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
    prompt: `Top-down 2.5D pixel art RPG wooden house building, ${STYLE}. Small cozy cabin with brown wooden walls and dark brown shingled roof, a front door and two small windows, detailed wood grain and roof shingle texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building, blurry, low detail',
  },
  {
    key: 'house-stone_house',
    filename: 'house-stone_house.png',
    width: 48,
    height: 56,
    prompt: `Top-down 2.5D pixel art RPG stone house building, ${STYLE}. Small cottage with gray stone walls and dark gray slate roof, a wooden front door and small windows, detailed stone block and slate texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building, blurry, low detail',
  },
  {
    key: 'house-advanced_house',
    filename: 'house-advanced_house.png',
    width: 48,
    height: 56,
    prompt: `Top-down 2.5D pixel art RPG advanced magical house building, ${STYLE}. Small mystical tower house with purple stone walls and deep purple pointed roof, glowing windows and ornate door, detailed stone and magical rune texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building, blurry, low detail',
  },
  {
    key: 'house-island_hut',
    filename: 'house-island_hut.png',
    width: 48,
    height: 56,
    prompt: `Top-down 2.5D pixel art RPG tropical island hut building, ${STYLE}. Small beach hut with sandy colored bamboo walls and brown thatched palm leaf roof, open doorway, detailed bamboo and thatch texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, large castle, modern building, blurry, low detail',
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
    prompt: `Top-down seamless tileable interior wooden floor tile, ${STYLE}. Warm brown wooden plank flooring with detailed grain, subtle nail heads, varied plank tones, cozy cabin floor, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture, flat solid color, blurry, low detail',
  },
  {
    key: 'floor-stone_house',
    filename: 'floor-stone_house.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable interior stone floor tile, ${STYLE}. Gray stone tile flooring with detailed texture, subtle mortar lines, varied stone tones, castle interior floor, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture, flat solid color, blurry, low detail',
  },
  {
    key: 'floor-advanced_house',
    filename: 'floor-advanced_house.png',
    width: TILE_SIZE,
    height: TILE_SIZE,
    isTile: true,
    prompt: `Top-down seamless tileable interior magical floor tile, ${STYLE}. Purple enchanted stone flooring with subtle glowing rune patterns, detailed stone texture, fantasy interior floor, no grid lines, no borders, flat top-down view`,
    negativePrompt: 'grid lines, borders, shadows, bevel, perspective, isometric, 3D, furniture, flat solid color, blurry, low detail',
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
    prompt: `Top-down 2.5D pixel art RPG interior wall section, ${STYLE}. Wooden wall seen from slight above angle, brown wood plank texture with detailed grain and highlights, wall strip for top edge of room, transparent background`,
    negativePrompt: 'grid lines, borders, 3D, realistic, floor, furniture, perspective lines, blurry, low detail',
  },
  {
    key: 'wall-left',
    filename: 'wall-left.png',
    width: 24,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG interior wall section, ${STYLE}. Wooden wall seen from slight above angle, brown wood plank texture with detailed grain and highlights, wall strip for left edge of room, transparent background`,
    negativePrompt: 'grid lines, borders, 3D, realistic, floor, furniture, perspective lines, blurry, low detail',
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
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A green felt card table with playing cards scattered on top, 2x2 tile size furniture, detailed felt and card texture, transparent background, slight 2.5D angle from above, cozy game room furniture`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-radio',
    filename: 'furniture-radio.png',
    width: 48,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A vintage blue retro radio with antenna and speaker grill, 1x1 tile size, detailed plastic and dial texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-jukebox',
    filename: 'furniture-jukebox.png',
    width: 48,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A purple pink retro jukebox with glowing records, 1x1 tile size, detailed chrome and light texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-projector',
    filename: 'furniture-projector.png',
    width: 96,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. An orange movie projector on a small stand, 2x1 tile size, detailed lens and reel texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-sofa',
    filename: 'furniture-sofa.png',
    width: 96,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A red comfy sofa couch with cushions, 2x1 tile size, detailed fabric and cushion texture, transparent background, slight 2.5D angle from above, cozy living room furniture`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-table',
    filename: 'furniture-table.png',
    width: 48,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A small brown wooden chair and table set, 1x1 tile size, detailed wood grain texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-plant',
    filename: 'furniture-plant.png',
    width: 48,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A small potted green houseplant in a terracotta pot, 1x1 tile size, detailed leaf and pot texture, transparent background, slight 2.5D angle from above, decorative plant`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-bookshelf',
    filename: 'furniture-bookshelf.png',
    width: 48,
    height: 96,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A tall brown wooden bookshelf filled with colorful books, 1x2 tile size, detailed wood and book spine texture, transparent background, slight 2.5D angle from above`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-bed',
    filename: 'furniture-bed.png',
    width: 96,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A pink cozy single bed with pillow and blanket, 2x1 tile size, detailed fabric and blanket texture, transparent background, slight 2.5D angle from above, bedroom furniture`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
  },
  {
    key: 'furniture-lamp',
    filename: 'furniture-lamp.png',
    width: 48,
    height: 48,
    prompt: `Top-down 2.5D pixel art RPG furniture, ${STYLE}. A small golden glowing table lamp with warm light, 1x1 tile size, detailed metal and glow texture, transparent background, slight 2.5D angle from above, warm illumination`,
    negativePrompt: 'grid lines, borders, 3D, realistic, room walls, floor, blurry, low detail',
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