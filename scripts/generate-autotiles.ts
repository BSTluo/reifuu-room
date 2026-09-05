#!/usr/bin/env tsx
/**
 * Autotile 贴图集生成脚本（程序化，无需 AI API）
 *
 * 为每个地形对生成一张 192×240 PNG 贴图集，包含 16 种 4 向位掩码变体。
 * 使用 sharp 进行 PNG 编码。
 *
 * 渲染策略：连续场（continuous field）
 * - 每个像素根据 4 方向位掩码计算"高地形影响值"（从各高邻居边缘向内衰减）
 * - 影响值 > 阈值 → 不透明高地形（带轮廓 + 崖面阴影 + 纹理噪点）
 * - 影响值 ≤ 阈值 → 透明（低地形底图透出）
 * - 过渡区域使用噪声扰动 + Bayer 抖动，产生有机锯齿边界
 * - 3+ 方向有高邻居时，中心区域获得额外覆盖（避免 3/4 包围时中心空洞）
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
// 噪声函数（确定性，相同输入永远产生相同输出）
// =====================================================

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

function noise2d(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy
}

/** 4×4 Bayer 矩阵（有序抖动，产生像素风过渡） */
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

function popcount4(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1)
}

// =====================================================
// 渲染参数
// =====================================================

const FALLOFF = 28             // 影响值从边缘向内衰减到 0 的距离（像素）
const JITTER = 4               // 边界噪声扰动幅度（像素）
const CENTER_RADIUS = 18       // 中心补偿半径
const OUTLINE_THRESHOLD = 0.54 // 影响值低于此值 → 轮廓描边
const SHADOW_THRESHOLD = 0.72  // 影响值低于此值 → 崖面阴影
const DITHER_RANGE = 0.18      // Bayer 抖动幅度

// =====================================================
// 像素渲染
// =====================================================

interface PixelRGBA {
  r: number; g: number; b: number; a: number
}

function renderPixel(
  px: number, py: number, mask: number,
  palette: TerrainPalette,
  globalX: number, globalY: number,
): PixelRGBA {
  if (mask === 0) return { r: 0, g: 0, b: 0, a: 0 }

  // 计算各方向影响值
  let maxInfluence = 0

  if (mask & DIR_BITS.up) {
    const n = (noise2d(globalX * 0.14, globalY * 0.14 + 10) - 0.5) * JITTER * 2
    const dist = py + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / FALLOFF)
  }
  if (mask & DIR_BITS.right) {
    const n = (noise2d(globalX * 0.14 + 20, globalY * 0.14) - 0.5) * JITTER * 2
    const dist = (47 - px) + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / FALLOFF)
  }
  if (mask & DIR_BITS.down) {
    const n = (noise2d(globalX * 0.14 + 30, globalY * 0.14 + 30) - 0.5) * JITTER * 2
    const dist = (47 - py) + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / FALLOFF)
  }
  if (mask & DIR_BITS.left) {
    const n = (noise2d(globalX * 0.14, globalY * 0.14 + 40) - 0.5) * JITTER * 2
    const dist = px + n
    maxInfluence = Math.max(maxInfluence, 1.0 - dist / FALLOFF)
  }

  // 中心补偿：3+ 方向有高邻居时，中心区域获得额外覆盖
  const numHigh = popcount4(mask)
  if (numHigh >= 3) {
    const dx = px - 24, dy = py - 24
    const distFromCenter = Math.sqrt(dx * dx + dy * dy)
    const centerFalloff = Math.max(0, 1 - distFromCenter / CENTER_RADIUS)
    maxInfluence += (numHigh - 2) * 0.5 * centerFalloff
  }

  maxInfluence = Math.max(0, Math.min(1, maxInfluence))

  if (maxInfluence <= 0) return { r: 0, g: 0, b: 0, a: 0 }

  // Bayer 抖动：在阈值附近产生像素风过渡
  const bayer = BAYER_4X4[py % 4][px % 4] / 16 - 0.5
  const ditheredThreshold = 0.5 + bayer * DITHER_RANGE

  const solid = maxInfluence > ditheredThreshold
  if (!solid) return { r: 0, g: 0, b: 0, a: 0 }

  // ---- 着色 ----

  // 纹理噪点（中频 + 高频）
  const texLow = noise2d(globalX * 0.22, globalY * 0.22)
  const texHigh = noise2d(globalX * 0.65, globalY * 0.65)
  const variation = (texLow - 0.5) * 22 + (texHigh - 0.5) * 10

  let r = palette.base[0] + variation
  let g = palette.base[1] + variation
  let b = palette.base[2] + variation

  // 崖面阴影（近边界暗化 + 垂直条纹）
  if (maxInfluence < SHADOW_THRESHOLD) {
    const shadowT = Math.max(0, Math.min(1,
      1.0 - (maxInfluence - OUTLINE_THRESHOLD) / (SHADOW_THRESHOLD - OUTLINE_THRESHOLD)))
    const streak = noise2d(globalX * 0.8, globalY * 0.08)  // 垂直条纹
    const shadowAmount = shadowT * (0.55 + streak * 0.25)
    r = r * (1 - shadowAmount) + palette.dark[0] * shadowAmount
    g = g * (1 - shadowAmount) + palette.dark[1] * shadowAmount
    b = b * (1 - shadowAmount) + palette.dark[2] * shadowAmount
  }

  // 轮廓描边（最外边缘）
  if (maxInfluence < OUTLINE_THRESHOLD) {
    r = palette.outline[0]
    g = palette.outline[1]
    b = palette.outline[2]
  }

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
    a: 255,
  }
}

// =====================================================
// 子块渲染（48×48）
// =====================================================

function renderSubTile(
  buffer: Buffer,
  mask: number,
  palette: TerrainPalette,
  offsetX: number, offsetY: number,
): void {
  for (let py = 0; py < SUB_TILE; py++) {
    for (let px = 0; px < SUB_TILE; px++) {
      const result = renderPixel(px, py, mask, palette, offsetX + px, offsetY + py)
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
  if (!palette) throw new Error(`No palette for terrain: ${pair.high}`)
  const buffer = Buffer.alloc(TILESET_W * TILESET_H * 4)

  for (let mask = 0; mask < 16; mask++) {
    const col = mask % 4
    const row = Math.floor(mask / 4)
    renderSubTile(buffer, mask, palette, col * SUB_TILE, row * SUB_TILE)
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
    console.error(`Available: ${AUTOTILE_PAIRS.map(p => `${p.high}-${p.low}`).join(', ')}`)
    process.exit(1)
  }

  await mkdir(outDir, { recursive: true })
  const sharp = (await import('sharp')).default

  for (const pair of pairs) {
    console.log(`Generating ${pair.filename} (${pair.high} → ${pair.low})...`)
    const rawBuffer = renderTileset(pair)

    const pngBuffer = await sharp(rawBuffer, {
      raw: { width: TILESET_W, height: TILESET_H, channels: 4 },
    }).png().toBuffer()

    const filePath = join(outDir, pair.filename)
    await writeFile(filePath, pngBuffer)
    console.log(`  → ${filePath} (${TILESET_W}×${TILESET_H}, ${pngBuffer.length} bytes)`)
  }

  console.log(`\nDone! Generated ${pairs.length} autotile tileset(s) to ${outDir}`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})