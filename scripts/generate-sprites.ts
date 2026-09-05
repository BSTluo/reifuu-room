#!/usr/bin/env node
/**
 * AI 游戏贴图生成脚本
 *
 * 使用 OpenAI 格式的图像生成 API，批量生成游戏中所有角色/地形/建筑/家具的像素风贴图。
 *
 * 用法:
 *   npx tsx scripts/generate-sprites.ts \
 *     --base-url https://api.openai.com/v1 \
 *     --api-key sk-xxxx \
 *     --model gpt-image-1 \
 *     --output client/reifuu-chat/public/assets/sprites
 *
 * 参数:
 *   --base-url    OpenAI 兼容 API 的 base URL（必填）
 *   --api-key     API Key（必填）
 *   --model       图像生成模型名（默认: gpt-image-1）
 *   --size        图像尺寸规格（默认: 1024x1024，生成后自动缩放到目标尺寸）
 *   --output      输出目录（默认: client/reifuu-chat/public/assets/sprites）
 *   --filter      只生成 key 匹配的贴图（正则匹配，可选）
 *   --dry-run     只打印 prompt 不调用 API
 *   --skip-existing  跳过已存在的文件
 *
 * 环境变量也支持:
 *   OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_IMAGE_MODEL
 */

import { mkdir, writeFile, existsSync } from 'fs'
import { join, resolve } from 'path'
import { ALL_SPRITES, SPRITE_STATS, type SpriteSpec } from './sprite-specs'

// =====================================================================
// 参数解析
// =====================================================================

interface CliArgs {
  baseUrl: string
  apiKey: string
  model: string
  size: string
  output: string
  filter?: string
  dryRun: boolean
  skipExisting: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const get = (key: string): string | undefined => {
    const idx = args.indexOf(`--${key}`)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const flag = (key: string): boolean => args.includes(`--${key}`)

  const baseUrl = get('base-url') || process.env.OPENAI_BASE_URL || ''
  const apiKey = get('api-key') || process.env.OPENAI_API_KEY || ''
  const model = get('model') || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const size = get('size') || '1024x1024'
  const output = get('output') || 'client/reifuu-chat/public/assets/sprites'
  const filter = get('filter')
  const dryRun = flag('dry-run')
  const skipExisting = flag('skip-existing')

  if (!dryRun && (!baseUrl || !apiKey)) {
    console.error('❌ 缺少必填参数: --base-url 和 --api-key（或设置 OPENAI_BASE_URL / OPENAI_API_KEY 环境变量）')
    console.error('')
    console.error('用法示例:')
    console.error('  npx tsx scripts/generate-sprites.ts \\')
    console.error('    --base-url https://api.openai.com/v1 \\')
    console.error('    --api-key sk-xxxx \\')
    console.error('    --model gpt-image-1')
    process.exit(1)
  }

  return { baseUrl, apiKey, model, size, output, filter, dryRun, skipExisting }
}

// =====================================================================
// API 调用
// =====================================================================

interface ImageGenResponse {
  data: Array<{ b64_json?: string; url?: string }>
  usage?: { total_tokens?: number }
}

async function generateImage(
  spec: SpriteSpec,
  args: CliArgs,
): Promise<Buffer> {
  // 构建 prompt：spec.prompt 已包含完整风格描述
  const sizeSuffix = ` The image must be exactly ${spec.width}x${spec.height} pixels in size.`
  const fullPrompt = spec.prompt + sizeSuffix

  const body: Record<string, unknown> = {
    model: args.model,
    prompt: fullPrompt,
    n: 1,
    size: args.size,
  }

  if (spec.negativePrompt) {
    body.negative_prompt = spec.negativePrompt
  }

  const url = `${args.baseUrl.replace(/\/+$/, '')}/images/generations`
  console.log(`  → POST ${url}`)

  // 自动重试：502/503/504/429 等临时错误指数退避重试
  const maxRetries = 5
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      'Authorization': `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  })

    if (resp.ok) {
      const json = (await resp.json()) as ImageGenResponse
      const item = json.data?.[0]
      if (!item) throw new Error('API 返回空数据')

      if (item.b64_json) {
        return Buffer.from(item.b64_json, 'base64')
      }

      if (item.url) {
        console.log(`  → 下载图片: ${item.url}`)
        const imgResp = await fetch(item.url)
        if (!imgResp.ok) throw new Error(`下载图片失败: ${imgResp.status}`)
        return Buffer.from(await imgResp.arrayBuffer())
      }

      throw new Error('API 返回数据中无 b64_json 或 url')
    }

    const errText = await resp.text()
    lastError = new Error(`API 返回 ${resp.status}: ${errText.substring(0, 500)}`)

    if ([429, 502, 503, 504].includes(resp.status) && attempt < maxRetries) {
      const delay = Math.min(5000 * attempt, 30000)
      console.log(`  ⚠️ 第 ${attempt}/${maxRetries} 次失败 (${resp.status})，${delay / 1000}s 后重试...`)
      await new Promise((r) => setTimeout(r, delay))
      continue
    }

    throw lastError
  }

  throw lastError ?? new Error('未知错误')
}

// =====================================================================
// 图片后处理：使用 sharp 缩放到目标尺寸
// =====================================================================

async function resizeImage(
  input: Buffer,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default

    // 先用 Lanczos 高质量缩放到目标尺寸（保留尽量多的细节）
    let img = sharp(input).resize(targetW, targetH, {
      fit: 'fill',
      kernel: 'lanczos3',
    })

    // 色彩后处理：轻度 posterize 让缩放后的色块更干净
    // 缩小后再做 posterize 效果更好
    const { data, info } = await img
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    // posterize: 将每通道 256 级量化到约 32 级（每通道 5 bits 感觉）
    // 对 RGBA 通道做量化，alpha 保持更多精度
    const levels = 32 // 色彩通道量化级数
    for (let i = 0; i < data.length; i += channels) {
      for (let c = 0; c < channels; c++) {
        if (c === 3) continue // alpha 不做量化
        // 量化: round(v/255 * (levels-1)) / (levels-1) * 255
        const v = data[i + c]
        data[i + c] = Math.round(
          (Math.round((v / 255) * (levels - 1)) / (levels - 1)) * 255,
        )
      }
    }

    return await sharp(data, {
      raw: { width: info.width, height: info.height, channels },
    })
      .png()
      .toBuffer()
  } catch {
    console.warn('  ⚠ sharp 未安装，跳过缩放（图像尺寸由 API 参数决定）')
    return input
  }
}

// =====================================================================
// 主流程
// =====================================================================

async function main() {
  const args = parseArgs()

  console.log('🎮 AI 游戏贴图生成脚本')
  console.log('═'.repeat(60))
  console.log(`  模型:     ${args.model}`)
  console.log(`  API 尺寸: ${args.size}`)
  console.log(`  输出目录: ${args.output}`)
  console.log(`  素材总数: ${SPRITE_STATS.total} 张`)
  console.log(`    地形 Tile:  ${SPRITE_STATS.tiles}`)
  console.log(`    水面动画:   ${SPRITE_STATS.waterAnim}`)
  console.log(`    玩家角色:   ${SPRITE_STATS.player}`)
  console.log(`    资源节点:   ${SPRITE_STATS.resources}`)
  console.log(`    建筑房屋:   ${SPRITE_STATS.houses}`)
  console.log(`    室内地板:   ${SPRITE_STATS.interiorFloor}`)
  console.log(`    室内墙壁:   ${SPRITE_STATS.interiorWall}`)
  console.log(`    室内家具:   ${SPRITE_STATS.furniture}`)
  if (args.filter) console.log(`  过滤正则: ${args.filter}`)
  if (args.dryRun) console.log(`  ⏼ Dry Run 模式（不调用 API）`)
  console.log('═'.repeat(60))

  // 过滤素材列表
  let sprites = ALL_SPRITES
  if (args.filter) {
    const regex = new RegExp(args.filter)
    sprites = sprites.filter((s) => regex.test(s.key))
    console.log(`  过滤后: ${sprites.length} 张`)
  }

  if (sprites.length === 0) {
    console.log('没有需要生成的素材。')
    return
  }

  // 创建输出目录
  const outputDir = resolve(args.output)
  if (!existsSync(outputDir)) {
    mkdir(outputDir, { recursive: true }, () => {})
    console.log(`  📁 创建目录: ${outputDir}`)
  }

  let success = 0
  let failed = 0
  let skipped = 0
  const failures: Array<{ spec: SpriteSpec; error: string }> = []

  for (let i = 0; i < sprites.length; i++) {
    const spec = sprites[i]
    const progress = `[${i + 1}/${sprites.length}]`
    const outPath = join(outputDir, spec.filename)

    // 跳过已存在文件
    if (args.skipExisting && existsSync(outPath)) {
      console.log(`${progress} ⏭  跳过 ${spec.key}（文件已存在）`)
      skipped++
      continue
    }

    console.log(`${progress} 🎨 生成 ${spec.key} (${spec.width}×${spec.height})`)

    if (args.dryRun) {
      console.log(`  prompt: ${spec.prompt}`)
      if (spec.negativePrompt) console.log(`  negative: ${spec.negativePrompt}`)
      success++
      continue
    }

    try {
      const rawImage = await generateImage(spec, args)
      const finalImage = await resizeImage(rawImage, spec.width, spec.height)
      writeFile(outPath, finalImage, () => {})
      console.log(`  ✅ 已保存: ${outPath}`)
      success++
    } catch (err: any) {
      console.error(`  ❌ 失败: ${err.message}`)
      failed++
      failures.push({ spec, error: err.message })
    }

    // API 限速：每张间隔 500ms
    if (!args.dryRun && i < sprites.length - 1) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  // 汇总
  console.log('')
  console.log('═'.repeat(60))
  console.log(`  ✅ 成功: ${success}`)
  console.log(`  ❌ 失败: ${failed}`)
  console.log(`  ⏭  跳过: ${skipped}`)

  if (failures.length > 0) {
    console.log('')
    console.log('失败明细:')
    for (const { spec, error } of failures) {
      console.log(`  ${spec.key}: ${error}`)
    }
    // 生成重试命令
    const retryKeys = failures.map((f) => f.spec.key).join('|')
    console.log('')
    console.log('重试失败项:')
    console.log(`  npx tsx scripts/generate-sprites.ts --filter "${retryKeys}" --base-url ... --api-key ...`)
  }

  console.log('')
  console.log('💡 提示: 生成完成后，运行 PreloadScene 会自动从 public/assets/sprites/ 加载贴图')
}

main().catch((err) => {
  console.error('致命错误:', err)
  process.exit(1)
})