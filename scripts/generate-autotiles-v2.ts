#!/usr/bin/env tsx
/**
 * Autotile 贴图集生成脚本 v2 — 细腻过渡版
 *
 * 改进要点：
 * - 多级半透明 Alpha 渐变（而非二值透明/不透明）
 * - 8×8 Bayer 抖动 + 更小幅度 → 更柔和的像素风过渡
 * - 多倍频 FBM 噪声 → 更自然的有机边界
 * - 地形对专属边缘装饰（水边浪花、沙地颗粒、草地草叶）
 * - 渐进式崖面阴影（多级暗化，而非硬阈值）
 * - 更细的轮廓线（1px 宽，带半透明过渡）
 *
 * 用法:
 *   npx tsx scripts/generate-autotiles.ts --all
 *   npx tsx scripts/generate-autotiles.ts --pair grass-water
 */

import { writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import {
  AUTOTILE_PAIRS,
  TERRAIN_COLORS,
  SUB_TILE,
  TILESET_W,
  TILESET_H,
  DIR_BITS,
  type AutotilePair,
  type TerrainPalette,
} from './autotile-data'

// =====================================================
// 噪声函数（确定性 FBM）
// =====================================================

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function noise2d(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  const sx = smoothstep(fx)
  const sy = smoothstep(fy)
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy
}

/** 分形布朗运动：多倍频噪声叠加 */
function fbm(x: number, y: number, octaves: number = 3): number {
  let value = 0
  let amp = 0.5
  let freq = 1
  let maxVal = 0
  for (let i = 0; i < octaves; i++) {
    value += noise2d(x * freq, y * freq) * amp
    maxVal += amp
    amp *= 0.5
    freq *= 2
  }
  return value / maxVal
}

// =====================================================
// 8×8 Bayer 矩阵（更细腻的抖动）
// =====================================================

function bayerMatrix(size: number): number[][] {
  if (size === 2) {
    return [[0, 2], [3, 1]]
  }
  const half = size / 2
  const small = bayerMatrix(half)
  const result: number[][] = Array.from({ length: size }, () => Array(size).fill(0))
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const v = small[y][x] * 4
      result[y][x] = v
      result[y][x + half] = v + 2
      result[y + half][x] = v + 3
      result[y + half][x + half] = v + 1
    }
  }
  return result
}

const BAYER_8X8 = bayerMatrix(8)

function popcount4(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function mixColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ]
}

// =====================================================
// 渲染参数（地形对专属配置）
// =====================================================

interface PairRenderConfig {
  /** 边缘影响值衰减距离（像素）—— 越大过渡越宽 */
  falloff: number
  /** 边界噪声扰动幅度（像素）—— 越大锯齿越明显 */
  jitter: number
  /** 噪声频率 —— 越高碎屑越多 */
  noiseFreq: number
  /** 轮廓描边宽度（像素） */
  outlineWidth: number
  /** 崖面阴影起始影响值（< 此值开始变暗） */
  shadowStart: number
  /** 崖面阴影最大强度（0=不变暗, 1=完全暗） */
  shadowStrength: number
  /** Alpha 渐变宽度（影响值在 threshold ± alphaBand 内做半透明） */
  alphaBand: number
  /** 边缘装饰类型 */
  edgeDecor: 'none' | 'foam' | 'grass_blades' | 'pebbles'
}

const PAIR_CONFIGS: Record<string, PairRenderConfig> = {
  'grass-water': {
    falloff: 32, jitter: 3.5, noiseFreq: 0.12,
    outlineWidth: 1.5, shadowStart: 0.62, shadowStrength: 0.45,
    alphaBand: 0.12, edgeDecor: 'foam',
  },
  'grass-sand': {
    // 沙滩边缘保持轻薄，避免草地侧形成明显的深色带。
    falloff: 16, jitter: 1.8, noiseFreq: 0.11,
    outlineWidth: 0.7, shadowStart: 0.68, shadowStrength: 0.10,
    alphaBand: 0.07, edgeDecor: 'grass_blades',
  },
  'sand-water': {
    falloff: 28, jitter: 3, noiseFreq: 0.13,
    outlineWidth: 1, shadowStart: 0.60, shadowStrength: 0.35,
    alphaBand: 0.10, edgeDecor: 'foam',
  },
  'dirt-grass': {
    // 高地边缘只保留窄坡脚，避免在草地上形成整块深色贴片。
    falloff: 14, jitter: 1.5, noiseFreq: 0.11,
    outlineWidth: 0.7, shadowStart: 0.68, shadowStrength: 0.14,
    alphaBand: 0.07, edgeDecor: 'pebbles',
  },
  'dirt-sand': {
    falloff: 24, jitter: 2.5, noiseFreq: 0.14,
    outlineWidth: 1, shadowStart: 0.55, shadowStrength: 0.25,
    alphaBand: 0.08, edgeDecor: 'pebbles',
  },
  'dirt-water': {
    falloff: 30, jitter: 3.5, noiseFreq: 0.12,
    outlineWidth: 1.5, shadowStart: 0.62, shadowStrength: 0.40,
    alphaBand: 0.12, edgeDecor: 'foam',
  },
}

function getConfig(pair: AutotilePair): PairRenderConfig {
  return PAIR_CONFIGS[`${pair.high}-${pair.low}`] ?? {
    falloff: 28, jitter: 3, noiseFreq: 0.13,
    outlineWidth: 1, shadowStart: 0.60, shadowStrength: 0.35,
    alphaBand: 0.10, edgeDecor: 'none',
  }
}

// =====================================================
// 像素渲染
// =====================================================

interface PixelRGBA {
  r: number; g: number; b: number; a: number
}

function renderPixel(
  px: number, py: number, mask: number,
  palette: TerrainPalette,
  lowPalette: TerrainPalette,
  config: PairRenderConfig,
  globalX: number, globalY: number,
): PixelRGBA {
  if (mask === 0) return { r: 0, g: 0, b: 0, a: 0 }

  const S = SUB_TILE // 48
  const half = S / 2  // 24

  // ---- 1. 计算各方向影响值（带 FBM 噪声扰动）----
  let maxInfluence = 0

  if (mask & DIR_BITS.up) {
    const n = (fbm(globalX * config.noiseFreq, globalY * config.noiseFreq + 100, 3) - 0.5) * config.jitter * 2
    const dist = py + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / config.falloff)
  }
  if (mask & DIR_BITS.right) {
    const n = (fbm(globalX * config.noiseFreq + 200, globalY * config.noiseFreq, 3) - 0.5) * config.jitter * 2
    const dist = (S - 1 - px) + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / config.falloff)
  }
  if (mask & DIR_BITS.down) {
    const n = (fbm(globalX * config.noiseFreq + 300, globalY * config.noiseFreq + 300, 3) - 0.5) * config.jitter * 2
    const dist = (S - 1 - py) + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / config.falloff)
  }
  if (mask & DIR_BITS.left) {
    const n = (fbm(globalX * config.noiseFreq, globalY * config.noiseFreq + 400, 3) - 0.5) * config.jitter * 2
    const dist = px + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / config.falloff)
  }

  // ---- 2. 中心补偿：3+ 方向有高邻居时 ----
  const numHigh = popcount4(mask)
  if (numHigh >= 3) {
    const dx = px - half, dy = py - half
    const distFromCenter = Math.sqrt(dx * dx + dy * dy)
    const centerRadius = 20
    const centerFalloff = Math.max(0, 1 - distFromCenter / centerRadius)
    maxInfluence += (numHigh - 2) * 0.45 * centerFalloff
  }

  // 2 方向对角（如 up+right）时，角落区域稍微增强
  if (numHigh === 2) {
    const corners: Record<number, [number, number]> = {
      [DIR_BITS.up | DIR_BITS.right]: [S, 0],
      [DIR_BITS.up | DIR_BITS.left]: [0, 0],
      [DIR_BITS.down | DIR_BITS.right]: [S, S],
      [DIR_BITS.down | DIR_BITS.left]: [0, S],
    }
    const corner = corners[mask]
    if (corner) {
      const dx = px - corner[0], dy = py - corner[1]
      const distFromCorner = Math.sqrt(dx * dx + dy * dy)
      const cornerBoost = Math.max(0, 1 - distFromCorner / 16) * 0.25
      maxInfluence += cornerBoost
    }
  }

  maxInfluence = clamp(maxInfluence, 0, 1.2)

  if (maxInfluence <= 0) return { r: 0, g: 0, b: 0, a: 0 }

  // ---- 3. Alpha 渐变（多级半透明过渡）----
  const threshold = 0.5
  const bayer = BAYER_8X8[py % 8][px % 8] / 64 - 0.5
  const ditheredInfluence = maxInfluence + bayer * config.alphaBand

  let alpha: number
  const diff = ditheredInfluence - threshold
  if (diff > config.alphaBand) {
    alpha = 255
  } else if (diff < -config.alphaBand) {
    alpha = 0
  } else {
    // 渐变区：在 ±alphaBand 内做平滑过渡
    alpha = Math.round(clamp((diff + config.alphaBand) / (config.alphaBand * 2), 0, 1) * 255)
  }

  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }

  // ---- 4. 着色（高地形表面色 + 纹理细节）----

  // FBM 纹理：低频色块 + 中频细节 + 高频颗粒
  const texLow = fbm(globalX * 0.08, globalY * 0.08, 2)     // 大色块
  const texMid = fbm(globalX * 0.25, globalY * 0.25, 2)      // 中等细节
  const texHigh = noise2d(globalX * 0.7, globalY * 0.7)      // 细颗粒
  const variation = (texLow - 0.5) * 16 + (texMid - 0.5) * 12 + (texHigh - 0.5) * 6

  let color: [number, number, number] = [
    palette.base[0] + variation,
    palette.base[1] + variation,
    palette.base[2] + variation,
  ]

  // 高光斑点（亮色随机散布）
  const highlightNoise = noise2d(globalX * 0.5 + 500, globalY * 0.5 + 500)
  if (highlightNoise > 0.72) {
    const highlightT = (highlightNoise - 0.72) / 0.28 * 0.4
    color = mixColor(color, palette.light, highlightT)
  }

  // ---- 5. 崖面阴影（渐进式多级暗化）----
  if (maxInfluence < config.shadowStart) {
    const shadowT = clamp(1 - (maxInfluence - 0.15) / (config.shadowStart - 0.15), 0, 1)
    // 垂直条纹噪声（模拟崖面纹理）
    const streak = fbm(globalX * 0.9, globalY * 0.05, 2)
    const shadowAmount = shadowT * config.shadowStrength * (0.7 + streak * 0.3)
    color = mixColor(color, palette.dark, shadowAmount)
  }

  // ---- 6. 轮廓描边（最外边缘，带半透明渐变）----
  const edgeDist = threshold - maxInfluence // 正值 = 在边缘外侧
  if (edgeDist > -config.outlineWidth * 0.5) {
    const outlineT = clamp(1 - (edgeDist + config.outlineWidth * 0.5) / config.outlineWidth, 0, 1)
    if (outlineT > 0) {
      color = mixColor(color, palette.outline, outlineT * 0.85)
    }
  }

  // ---- 7. 边缘装饰（地形对专属）----
  if (config.edgeDecor !== 'none' && maxInfluence > 0.3 && maxInfluence < 0.65) {
    const decorNoise = fbm(globalX * 0.3 + 700, globalY * 0.3 + 700, 2)

    if (config.edgeDecor === 'foam') {
      // 水边浪花：白色泡沫斑点
      if (decorNoise > 0.62) {
        const foamT = (decorNoise - 0.62) / 0.38
        const foamColor: [number, number, number] = [220, 230, 240]
        color = mixColor(color, foamColor, foamT * 0.5)
      }
      // 细碎波浪线
      const waveNoise = noise2d(globalX * 0.3 + 800, globalY * 0.8 + 800)
      if (waveNoise > 0.78) {
        color = mixColor(color, [200, 215, 230], (waveNoise - 0.78) / 0.22 * 0.35)
      }
    } else if (config.edgeDecor === 'grass_blades') {
      // 草地边缘草叶：深绿色细碎纹理
      if (decorNoise > 0.58) {
        const bladeT = (decorNoise - 0.58) / 0.42
        color = mixColor(color, [38, 88, 36], bladeT * 0.4)
      }
      // 亮色草尖
      const tipNoise = noise2d(globalX * 0.6 + 900, globalY * 0.6 + 900)
      if (tipNoise > 0.75) {
        color = mixColor(color, [110, 175, 95], (tipNoise - 0.75) / 0.25 * 0.3)
      }
    } else if (config.edgeDecor === 'pebbles') {
      // 泥土边缘碎石：暗色小斑点
      if (decorNoise > 0.65) {
        const pebbleT = (decorNoise - 0.65) / 0.35
        color = mixColor(color, [80, 56, 32], pebbleT * 0.35)
      }
    }
  }

  return {
    r: clamp(Math.round(color[0]), 0, 255),
    g: clamp(Math.round(color[1]), 0, 255),
    b: clamp(Math.round(color[2]), 0, 255),
    a: alpha,
  }
}

// =====================================================
// 子块渲染（48×48）
// =====================================================

function renderSubTile(
  buffer: Buffer,
  mask: number,
  palette: TerrainPalette,
  lowPalette: TerrainPalette,
  config: PairRenderConfig,
  offsetX: number, offsetY: number,
): void {
  for (let py = 0; py < SUB_TILE; py++) {
    for (let px = 0; px < SUB_TILE; px++) {
      const result = renderPixel(
        px, py, mask, palette, lowPalette, config,
        offsetX + px, offsetY + py,
      )
      const idx = ((offsetY + py) * TILESET_W + (offsetX + px)) * 4
      buffer[idx]     = result.r
      buffer[idx + 1] = result.g
      buffer[idx + 2] = result.b
      buffer[idx + 3] = result.a
    }
  }
}

// =====================================================
// 贴图集渲染（192×240，16 个掩码变体）
// =====================================================

function renderTileset(pair: AutotilePair): Buffer {
  const palette = TERRAIN_COLORS[pair.high]
  const lowPalette = TERRAIN_COLORS[pair.low]
  if (!palette) throw new Error(`No palette for terrain: ${pair.high}`)
  if (!lowPalette) throw new Error(`No palette for terrain: ${pair.low}`)
  const config = getConfig(pair)
  const buffer = Buffer.alloc(TILESET_W * TILESET_H * 4)

  for (let mask = 0; mask < 16; mask++) {
    const col = mask % 4
    const row = Math.floor(mask / 4)
    renderSubTile(buffer, mask, palette, lowPalette, config, col * SUB_TILE, row * SUB_TILE)
  }

  return buffer
}

// =====================================================
// CLI 主函数
// =====================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const allFlag = args.includes('--all')
  const pairIdx = args.indexOf('--pair')
  const specificPair = pairIdx >= 0 ? args[pairIdx + 1] : null
  const outIdx = args.indexOf('--out')
  const outDir = outIdx >= 0
    ? resolve(args[outIdx + 1])
    : resolve(process.cwd(), 'client/reifuu-chat/public/assets/autotiles')

  if (!allFlag && !specificPair) {
    console.error('Usage: npx tsx scripts/generate-autotiles.ts --all')
    console.error('       npx tsx scripts/generate-autotiles.ts --pair grass-water')
    console.error('       npx tsx scripts/generate-autotiles.ts --all --out ./custom/dir')
    process.exit(1)
  }

  const pairs = specificPair
    ? AUTOTILE_PAIRS.filter(p => `${p.high}-${p.low}` === specificPair)
    : AUTOTILE_PAIRS

  if (pairs.length === 0) {
    console.error(`No matching autotile pair: ${specificPair}`)
    process.exit(1)
  }

  const sharp = (await import('sharp')).default
  await mkdir(outDir, { recursive: true })

  for (const pair of pairs) {
    const buffer = renderTileset(pair)
    const filename = pair.filename
    const filepath = join(outDir, filename)

    await sharp(buffer, {
      raw: { width: TILESET_W, height: TILESET_H, channels: 4 },
    })
      .png()
      .toFile(filepath)

    console.log(`✓ Generated ${filename} (${TILESET_W}×${TILESET_H})`)
  }

  console.log(`\nDone! ${pairs.length} tileset(s) written to ${outDir}`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})