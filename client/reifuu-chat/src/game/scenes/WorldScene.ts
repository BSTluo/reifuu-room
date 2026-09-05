import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { OtherPlayerSprite } from '../entities/OtherPlayerSprite'
import { PlayerSprite } from '../entities/PlayerSprite'
import { socketClient } from '../network/SocketClient'
import { gridToIso, isoToGrid, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric'
import { CHUNK_SIZE, getChunkTerrain, chunkIdToWorldOrigin, worldToChunkId, getTileType, isIslandChunk, chunkIdToOrigin, isForestTile, isDesertTile, isMarshTile, isHighlandTile } from '../utils/world'
import { hashStringToSeed, createSeededRandom } from '../utils/rng'
import { AUTOTILE_PAIRS, calculateBitmask } from '../utils/autotile-constants'
import { useCharacterStore } from '../../stores/character'
import { useExplorationStore } from '../../stores/exploration'
import type { ChunkFogState } from '../../stores/exploration'
import { apiGet } from '../../api/http'
import { useUserStore } from '../../stores/user'
import { useVehicleStore } from '../../stores/vehicle'
import type { ResourceNodeDTO, ChatRoomDTO, TerrainCapability } from '../../api/types'

/** 每种地形类型的变体数量（须与 PreloadScene TILE_VARIANTS 一致） */
const TILE_VARIANT_COUNT = 3
/** 水面波纹动画帧数 */
const WATER_ANIM_FRAMES = 4
/** 水面波纹动画间隔（毫秒） */
const WATER_ANIM_INTERVAL = 600

/** 地形 Blitter 层深度：低于一切实体与迷雾层 */
const TERRAIN_DEPTH = -10000
/** 迷雾层深度：高于地形、低于实体（实体 depth = 世界 y，恒为正） */
const FOG_DEPTH = -9000
/** 已探索但不可见区块的迷雾颜色/透明度（"记忆中的地图"） */
const FOG_EXPLORED_COLOR = 0x263238
const FOG_EXPLORED_ALPHA = 0.75
/** 无出生点时的默认世界坐标（大陆中心附近） */
const DEFAULT_SPAWN = 325

interface ChunkLayer {
  /** 该区块的地形 Blitter（每种地形类型每个变体各一个） */
  blitters: Phaser.GameObjects.Blitter[]
  /** blitter 索引映射：type -> [variantStartIndex, variantCount] */
  blitterIndex: Map<string, number>
  /** 地形过渡 overlay Blitter（按贴图集纹理 key 缓存复用，叠加在 base tile 之上） */
  autotileBlitters: Map<string, Phaser.GameObjects.Blitter>
  /** 水面波纹动画 Blitter（可选，仅含 water tile 的区块才有） */
  waterAnim?: Phaser.GameObjects.Blitter
  /** 森林群系的树木装饰，仅随区块生命周期存在 */
  forestDecorations: Phaser.GameObjects.GameObject[]
  /** 荒漠、湿地和高地装饰，仅随区块生命周期存在 */
  biomeDecorations: Phaser.GameObjects.Graphics[]
  /** 已探索但不可见时的整块半透明迷雾遮罩，undefined 表示无遮罩 */
  fog: Phaser.GameObjects.Graphics | undefined
}

/**
 * 主世界场景：以玩家为中心渲染多区块等距世界 + 迷雾（未探索区块不渲染）。
 *
 * 坐标体系：全部使用世界网格坐标（跨区块连续），iso = gridToIso(wx, wy)，
 * 与单图时代完全相同的等距公式，只是不再有 MAP_SIZE 边界。
 */
export class WorldScene extends Phaser.Scene {
  private player!: PlayerSprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private targetMarker: Phaser.GameObjects.Graphics | null = null
  private pathToTarget: { gx: number; gy: number }[] = []
  private currentPathIndex = 0
  private otherPlayers = new Map<string, OtherPlayerSprite>()
  /** 玩家当前所在区块 ID（用于检测跨区块） */
  private currentChunkId: string | null = null
  /** socket 层多人事件监听器是否已注册（防止重复注册） */
  private syncHandlersRegistered = false
  /** chunkId -> 该区块的地形 Blitter 层与迷雾遮罩 */
  private chunkLayers = new Map<string, ChunkLayer>()
  /** nodeId -> 资源节点精灵（当前区块） */
  private resourceSprites = new Map<number, Phaser.GameObjects.Image>()
  /** nodeId -> 资源节点数据（当前区块） */
  private resourceNodeData = new Map<number, ResourceNodeDTO>()
  /** roomId -> 聊天室房屋精灵（当前区块） */
  private roomSprites = new Map<string, Phaser.GameObjects.Image>()
  /** roomId -> 聊天室数据（当前区块） */
  private roomData = new Map<string, ChatRoomDTO>()
  /** 水面波纹动画当前帧索引 */
  private waterAnimFrame = 0
  /** 水面波纹动画计时器 */
  private waterAnimTimer = 0

  constructor() {
    super('WorldScene')
  }

  create(): void {
    const characterStore = useCharacterStore()
    const explorationStore = useExplorationStore()

    // 出生点：优先使用角色 store 中的世界坐标，缺省回退到大陆中心
    const hasPosition = characterStore.position.x !== 0 || characterStore.position.y !== 0
    const worldX = hasPosition ? characterStore.position.x : DEFAULT_SPAWN
    const worldY = hasPosition ? characterStore.position.y : DEFAULT_SPAWN
    const spawnIso = gridToIso(worldX, worldY)
    this.player = new PlayerSprite(this, spawnIso.x, spawnIso.y)
    this.currentChunkId = characterStore.currentChunkId ?? worldToChunkId(worldX, worldY)

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1.0)
    this.cameras.main.setBackgroundColor('#1d2b34')

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W)
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S)
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)

    // 鼠标/触摸点击地图移动
    this.input.on('pointerdown', this.onPointerDown, this)

    // 多人位置同步
    this.setupMultiplayerSync()

    // 监听器注册完成后，主动向服务端请求当前区块内已存在的玩家，
    // 避免连接时服务端推送早于客户端监听器注册而被丢弃。
    // 如果 socket 尚未就绪（GameView onMounted 与 WorldScene create 的时序差），
    // 在 socket:connected 事件触发时补发请求。
    this.onSocketConnected()
    EventBus.on('socket:connected', this.onSocketConnected)

    EventBus.on('ui:move-player', this.onUIMovePlayer)
    EventBus.on('ui:spawn-character', this.onUISpawnCharacter)
    EventBus.on('ui:request-scene', this.onRequestScene)
    EventBus.on('exploration:updated', this.onExplorationUpdated)
    EventBus.on('resource:collected', this.onResourceCollected)
    EventBus.on('resource:node-depleted', this.onResourceNodeDepleted)
    EventBus.on('player:chunk-changed', this.onPlayerChunkChangedForResources)
    EventBus.on('player:chunk-changed', this.onPlayerChunkChangedForRooms)
    EventBus.on('build:created', this.onBuildCreated)
    EventBus.on('build:abandoned', this.onBuildAbandoned)
    EventBus.on('friend:teleport-confirmed', this.onFriendTeleportConfirmed)
    EventBus.on('town:teleport-confirmed', this.onTownTeleportConfirmed)

    // 若 socket 尚未推送初始已探索列表（如重连复用旧 socket），通过 REST 兜底拉取
    if (!explorationStore.initialized) {
      explorationStore.fetchExploredChunks()
    }

    // 初始渲染：store 中已有数据则立即绘制，否则等待 exploration:updated 触发
    this.refreshFog()

    // 加载当前区块的资源节点
    this.loadChunkResources(this.currentChunkId)

    // 加载当前区块的聊天室房屋标记
    this.loadChunkRooms(this.currentChunkId)

    EventBus.emit('phaser:ready', { sceneKey: this.scene.key })
    EventBus.emit('phaser:scene-changed', { sceneKey: this.scene.key })
  }

  update(_time: number, delta: number): void {
    this.player.update(delta)

    this.otherPlayers.forEach((otherPlayer) => {
      otherPlayer.update(delta)
    })

    // 自动寻路移动
    if (!this.player.isMoving && this.pathToTarget.length > 0) {
      const nextStep = this.pathToTarget[this.currentPathIndex]
      if (nextStep) {
        const { x, y } = gridToIso(nextStep.gx, nextStep.gy)
        this.player.moveTo(x, y)
        EventBus.emit('player:position-changed', { x: nextStep.gx, y: nextStep.gy })
        this.sendPlayerMove(nextStep.gx, nextStep.gy)
        this.currentPathIndex++

        if (this.currentPathIndex >= this.pathToTarget.length) {
          this.clearPath()
        }
      }
    }

    // 键盘输入（优先级高于自动寻路）
    if (!this.player.isMoving && this.pathToTarget.length === 0) {
      this.handleKeyboardInput()
    }

    // 水面波纹动画：定时切换所有区块的水纹贴图
    this.waterAnimTimer += delta
    if (this.waterAnimTimer >= WATER_ANIM_INTERVAL) {
      this.waterAnimTimer = 0
      this.waterAnimFrame = (this.waterAnimFrame + 1) % WATER_ANIM_FRAMES
      const frameKey = `water-anim-${this.waterAnimFrame}`
      if (this.textures.exists(frameKey)) {
        this.chunkLayers.forEach((layer) => {
          if (layer.waterAnim) {
            layer.waterAnim.setTexture(frameKey)
          }
        })
      }
    }
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this)
    EventBus.off('ui:move-player', this.onUIMovePlayer)
    EventBus.off('ui:spawn-character', this.onUISpawnCharacter)
    EventBus.off('ui:request-scene', this.onRequestScene)
    EventBus.off('exploration:updated', this.onExplorationUpdated)
    EventBus.off('socket:connected', this.onSocketConnected)
    EventBus.off('resource:collected', this.onResourceCollected)
    EventBus.off('resource:node-depleted', this.onResourceNodeDepleted)
    EventBus.off('player:chunk-changed', this.onPlayerChunkChangedForResources)
    EventBus.off('player:chunk-changed', this.onPlayerChunkChangedForRooms)
    EventBus.off('build:created', this.onBuildCreated)
    EventBus.off('build:abandoned', this.onBuildAbandoned)
    EventBus.off('friend:teleport-confirmed', this.onFriendTeleportConfirmed)
    EventBus.off('town:teleport-confirmed', this.onTownTeleportConfirmed)
    this.cleanupMultiplayerSync()
    this.clearResourceSprites()
    this.clearRoomSprites()
    this.destroyAllChunks()
  }

  // ==================== 场景切换 ====================

  /** UI 请求切换场景（进入房间内部 / 返回大世界） */
  private onRequestScene = (payload: { sceneKey: string }): void => {
    if (payload.sceneKey === 'InteriorScene') {
      // 停止世界场景（shutdown 会自动调用），启动室内场景
      this.scene.start('InteriorScene')
    }
  }

  // ==================== 区块渲染 ====================

  /** 确保 chunkId 的地形层已创建（不负责迷雾） */
  private ensureChunkTerrain(chunkId: string): void {
    if (this.chunkLayers.has(chunkId)) return

    const tileTypes = ['grass', 'dirt', 'water', 'sand'] as const
    const blitters: Phaser.GameObjects.Blitter[] = []
    const blitterIndex = new Map<string, number>()

    for (const type of tileTypes) {
      blitterIndex.set(type, blitters.length)
      for (let v = 0; v < TILE_VARIANT_COUNT; v++) {
        const blitter = this.add.blitter(0, 0, `tile-${type}-${v}`)
        blitter.setDepth(TERRAIN_DEPTH)
        blitters.push(blitter)
      }
    }

    const layer: ChunkLayer = {
      blitters,
      blitterIndex,
      autotileBlitters: new Map(),
      forestDecorations: [],
      biomeDecorations: [],
      fog: undefined,
    }
    this.chunkLayers.set(chunkId, layer)
    this.populateChunkBobs(chunkId, layer)
  }

  /** 为 chunkId 的所有变体 Blitter 填充 CHUNK_SIZE x CHUNK_SIZE 个 tile Bob */
  private populateChunkBobs(chunkId: string, layer: ChunkLayer): void {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(chunkId)
    const terrain = getChunkTerrain(chunkId)
    let hasWater = false
    /** 需要绘制过渡 overlay 的 tile：[wx, wy, lowType, highType, mask] */
    const overlayTiles: Array<{ wx: number; wy: number; high: string; low: string; mask: number }> = []

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = originWX + lx
        const wy = originWY + ly
        const center = gridToIso(wx, wy)
        const type = terrain[ly][lx]

        // AI 生成的变体色差较大，逐 tile 随机切换会形成明显的棋盘格。
        // 以单一主变体铺底，避免相邻地块出现硬直线；不同地貌仍由
        // terrain 类型和 autotile 边缘细节区分。
        const preferredVariant: Record<string, number> = {
          grass: 1,
          dirt: 0,
          sand: 0,
          water: 0,
        }
        const variant = preferredVariant[type] ?? 0
        const baseIndex = layer.blitterIndex.get(type)
        if (baseIndex === undefined) continue

        const blitter = layer.blitters[baseIndex + variant]
        if (!blitter) continue
        // Bob 使用左上角原点，tile 绘制区域左上角 = 中心 - (TILE_WIDTH/2, TILE_HEIGHT/2)
        blitter.create(center.x - TILE_WIDTH / 2, center.y - TILE_HEIGHT / 2)

        if (type === 'water') hasWater = true

        // 从低地形 tile 视角计算与每个高地形邻居的位掩码，
        // 掩码非零时叠画对应 autotile 子块（高地形向本 tile 的过渡形状）
        for (const pair of AUTOTILE_PAIRS) {
          if (pair.low !== type) continue
          const mask = calculateBitmask(pair.high, (dx, dy) => getTileType(wx + dx, wy + dy))
          // 单一高地邻居会在草地上形成完整深色方块；只在连续边缘
          // （至少两个方向相接）时绘制悬崖过渡。
          const connectedSides = (
            ((mask & 0x1) !== 0 ? 1 : 0) +
            ((mask & 0x2) !== 0 ? 1 : 0) +
            ((mask & 0x4) !== 0 ? 1 : 0) +
            ((mask & 0x8) !== 0 ? 1 : 0)
          )
          if (mask > 0 && (pair.high !== 'dirt' || connectedSides >= 2)) {
            overlayTiles.push({ wx, wy, high: pair.high, low: type, mask })
          }
        }
      }
    }

    // 为每个过渡 tile 叠画对应 autotile 子块（按贴图集纹理 key 缓存 Blitter）
    if (overlayTiles.length > 0) {
      for (const { wx, wy, high, low, mask } of overlayTiles) {
        const textureKey = `autotile-${high}-${low}`
        let blitter = layer.autotileBlitters.get(textureKey)
        if (!blitter) {
          blitter = this.add.blitter(0, 0, textureKey)
          blitter.setDepth(TERRAIN_DEPTH + 1)
          // 过渡贴图包含较深的崖边阴影；降低整体不透明度，
          // 让底层地貌纹理透出，避免形成僵硬的深色直角带。
          const overlayAlpha = textureKey === 'autotile-grass-sand'
            ? 0.30
            : textureKey === 'autotile-dirt-grass'
              ? 0.72
              : 0.65
          blitter.setAlpha(overlayAlpha)
          layer.autotileBlitters.set(textureKey, blitter)
        }
        const center = gridToIso(wx, wy)
        // 帧名 = 位掩码字符串（PreloadScene.registerAutotileFrames 已注册 0..15 帧）
        blitter.create(center.x - TILE_WIDTH / 2, center.y - TILE_HEIGHT / 2, String(mask))
      }
    }

    // 如果区块包含水域，创建水面波纹动画 Blitter
    if (hasWater && !layer.waterAnim) {
      const animBlitter = this.add.blitter(0, 0, 'water-anim-0')
      animBlitter.setDepth(TERRAIN_DEPTH + 2)
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          if (terrain[ly][lx] !== 'water') continue
          const wx = originWX + lx
          const wy = originWY + ly
          const center = gridToIso(wx, wy)
          animBlitter.create(center.x - TILE_WIDTH / 2, center.y - TILE_HEIGHT / 2)
        }
      }
      layer.waterAnim = animBlitter
    }

    // 森林装饰使用低频群系噪声 + 确定性抽样，形成成片树林而不是棋盘格。
    const decorationRandom = createSeededRandom(hashStringToSeed(`forest_${chunkId}`))
    for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const wx = originWX + lx
        const wy = originWY + ly
        if (terrain[ly][lx] !== 'grass' || !isForestTile(wx, wy)) continue
        if (decorationRandom() > 0.58) continue
        const { x, y } = gridToIso(wx, wy)
        const tree = this.add.image(x, y, 'tree-forest')
        tree.setOrigin(0.5, 1)
        tree.setScale(0.78 + decorationRandom() * 0.22)
        tree.setDepth(y + 2)
        layer.forestDecorations.push(tree)
      }
    }

    const biomeRandom = createSeededRandom(hashStringToSeed(`biomes_${chunkId}`))
    for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const wx = originWX + lx
        const wy = originWY + ly
        const type = terrain[ly][lx]
        if (biomeRandom() > 0.16) continue
        const { x, y } = gridToIso(wx, wy)
        const decoration = this.add.graphics()
        decoration.setDepth(y + 1)

        if (type === 'sand' && isDesertTile(wx, wy)) {
          // 荒漠：用小型仙人掌替代单调的整片沙地。
          decoration.fillStyle(0x4d8a54, 0.95)
          decoration.fillRect(x - 2, y - 18, 4, 18)
          decoration.fillRect(x - 7, y - 13, 5, 3)
          decoration.fillRect(x - 7, y - 16, 3, 6)
          decoration.fillRect(x + 2, y - 9, 5, 3)
          decoration.fillRect(x + 4, y - 12, 3, 6)
          layer.biomeDecorations.push(decoration)
        } else if (isMarshTile(wx, wy) && type !== 'water') {
          // 湿地：芦苇簇只出现在草地/沙地边缘，避免遮住水面。
          decoration.lineStyle(2, 0x567d3f, 0.9)
          decoration.lineBetween(x - 3, y - 2, x - 4, y - 19)
          decoration.lineBetween(x, y - 2, x + 1, y - 22)
          decoration.lineBetween(x + 3, y - 2, x + 5, y - 16)
          decoration.fillStyle(0x9db85c, 0.9)
          decoration.fillCircle(x + 1, y - 22, 2)
          layer.biomeDecorations.push(decoration)
        } else if (type === 'dirt' && isHighlandTile(wx, wy)) {
          // 高地：低矮岩块强化台地边缘，不制造新的地形类型。
          decoration.fillStyle(0x667078, 0.95)
          decoration.fillEllipse(x, y - 5, 13, 8)
          decoration.fillStyle(0x8c9798, 0.8)
          decoration.fillEllipse(x - 2, y - 7, 6, 3)
          layer.biomeDecorations.push(decoration)
        } else if (type === 'grass' && isForestTile(wx, wy)) {
          // 森林边缘的石块景观与服务端 stone 节点配套，石块节点可点击采集。
          decoration.fillStyle(0x657078, 0.95)
          decoration.fillEllipse(x, y - 5, 12, 8)
          decoration.fillStyle(0xa4adb0, 0.8)
          decoration.fillEllipse(x - 2, y - 7, 5, 3)
          layer.biomeDecorations.push(decoration)
        } else {
          decoration.destroy()
        }
      }
    }
  }

  // ==================== 迷雾渲染 ====================

  /**
   * 迷雾实现：hidden 区块完全不渲染（场景背景即"虚空"）。
   * explored-but-not-visible 区块在整块大菱形上叠加半透明遮罩。
   */
  private refreshFog(): void {
    const explorationStore = useExplorationStore()
    const { gridX, gridY } = isoToGrid(this.player.x, this.player.y)
    const px = Math.round(gridX)
    const py = Math.round(gridY)
    const visibleChunks = explorationStore.computeVisibleChunks(px, py)

    // 需要渲染的区块 = 可视区块 ∪ 已探索区块
    const toRender = new Set<string>([...visibleChunks, ...explorationStore.exploredChunks])

    // 移除不再需要的区块
    for (const chunkId of [...this.chunkLayers.keys()]) {
      if (!toRender.has(chunkId)) {
        this.destroyChunkLayer(chunkId)
      }
    }

    // 确保所有需要的区块存在，并按迷雾状态设置遮罩
    for (const chunkId of toRender) {
      this.ensureChunkTerrain(chunkId)
      const state = explorationStore.getChunkFogState(chunkId, visibleChunks)
      this.setChunkFog(chunkId, state)
    }
  }

  /** 按迷雾状态铺设/移除某区块的遮罩 */
  private setChunkFog(chunkId: string, state: ChunkFogState): void {
    const layer = this.chunkLayers.get(chunkId)
    if (!layer) return

    if (state === 'explored') {
      if (!layer.fog) {
        layer.fog = this.buildFogOverlay(chunkId)
      }
    } else {
      // visible 或 hidden：无遮罩（hidden 区块本就不在渲染集合中）
      if (layer.fog) {
        layer.fog.destroy()
        layer.fog = undefined
      }
    }
  }

  /** 绘制整块矩形迷雾遮罩（覆盖整个区块的 tile 范围） */
  private buildFogOverlay(chunkId: string): Phaser.GameObjects.Graphics {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(chunkId)
    const n = CHUNK_SIZE - 1
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2

    const topLeft = gridToIso(originWX, originWY)
    const bottomRight = gridToIso(originWX + n, originWY + n)

    const g = this.add.graphics()
    g.fillStyle(FOG_EXPLORED_COLOR, FOG_EXPLORED_ALPHA)
    g.fillRect(
      topLeft.x - halfW,
      topLeft.y - halfH,
      bottomRight.x - topLeft.x + TILE_WIDTH,
      bottomRight.y - topLeft.y + TILE_HEIGHT,
    )
    g.setDepth(FOG_DEPTH)
    return g
  }

  private destroyChunkLayer(chunkId: string): void {
    const layer = this.chunkLayers.get(chunkId)
    if (!layer) return
    for (const blitter of layer.blitters) blitter.destroy()
    for (const blitter of layer.autotileBlitters.values()) blitter.destroy()
    for (const decoration of layer.forestDecorations) decoration.destroy()
    for (const decoration of layer.biomeDecorations) decoration.destroy()
    if (layer.waterAnim) layer.waterAnim.destroy()
    if (layer.fog) layer.fog.destroy()
    this.chunkLayers.delete(chunkId)
  }

  private destroyAllChunks(): void {
    for (const chunkId of [...this.chunkLayers.keys()]) {
      this.destroyChunkLayer(chunkId)
    }
  }

  // ==================== 移动控制 ====================

  private handleKeyboardInput(): void {
    let dx = 0
    let dy = 0

    if (this.cursors.up.isDown || this.keyW.isDown) dy = -1
    if (this.cursors.down.isDown || this.keyS.isDown) dy = 1
    if (this.cursors.left.isDown || this.keyA.isDown) dx = -1
    if (this.cursors.right.isDown || this.keyD.isDown) dx = 1

    if (dx !== 0 || dy !== 0) {
      this.movePlayerByGrid(dx, dy)
    }
  }

  private movePlayerByGrid(dgx: number, dgy: number): void {
    const current = isoToGrid(this.player.x, this.player.y)
    const nextGX = Math.round(current.gridX + dgx)
    const nextGY = Math.round(current.gridY + dgy)

    if (!this.canEnterTile(nextGX, nextGY)) return

    const { x, y } = gridToIso(nextGX, nextGY)
    this.player.moveTo(x, y)
    EventBus.emit('player:position-changed', { x: nextGX, y: nextGY })

    this.sendPlayerMove(nextGX, nextGY)
  }

  /**
   * GDD 2.8 地形通行判定：
   * - 海洋区块（water tile）需要装备船只（terrain_capability='water'）或飞艇（'all'）
   * - 徒步/马/车无法进入海洋区块
   * - 飞艇可无视地形
   */
  private canEnterTile(gx: number, gy: number): boolean {
    const tileType = getTileType(gx, gy)
    if (tileType !== 'water') return true
    const capability = this.getEquippedTerrainCapability()
    if (capability === 'water' || capability === 'all') return true
    return false
  }

  private getEquippedTerrainCapability(): TerrainCapability | null {
    const vehicleStore = useVehicleStore()
    return vehicleStore.equipped?.terrainCapability ?? null
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const grid = isoToGrid(pointer.worldX, pointer.worldY)
    const targetGX = Math.round(grid.gridX)
    const targetGY = Math.round(grid.gridY)

    const currentGrid = isoToGrid(this.player.x, this.player.y)
    const startGX = Math.round(currentGrid.gridX)
    const startGY = Math.round(currentGrid.gridY)

    const path = this.findSimplePath(startGX, startGY, targetGX, targetGY)
    if (path.length === 0) return

    this.pathToTarget = path
    this.currentPathIndex = 0
    this.showTargetMarker(targetGX, targetGY)
  }

  /**
   * 曼哈顿贪心寻路 + 水域绕行：
   * 优先朝目标走，若下一步不可通行（海洋 tile 且无船），尝试沿垂直方向绕行。
   * 找不到任何可走方向时返回已计算的部分路径。
   */
  private findSimplePath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): { gx: number; gy: number }[] {
    const path: { gx: number; gy: number }[] = []
    let x = startX
    let y = startY

    while (x !== targetX || y !== targetY) {
      const candidates: { gx: number; gy: number }[] = []
      if (x < targetX) candidates.push({ gx: x + 1, gy: y })
      if (x > targetX) candidates.push({ gx: x - 1, gy: y })
      if (y < targetY) candidates.push({ gx: x, gy: y + 1 })
      if (y > targetY) candidates.push({ gx: x, gy: y - 1 })
      // 绕行方向：与主要移动方向垂直（沿海岸线）
      const dx = Math.sign(targetX - x)
      const dy = Math.sign(targetY - y)
      if (dx !== 0) {
        candidates.push({ gx: x, gy: y + 1 })
        candidates.push({ gx: x, gy: y - 1 })
      } else if (dy !== 0) {
        candidates.push({ gx: x + 1, gy: y })
        candidates.push({ gx: x - 1, gy: y })
      }

      const next = candidates.find((c) => this.canEnterTile(c.gx, c.gy))
      if (!next) break // 被完全围住，走已算出的部分路径
      x = next.gx
      y = next.gy
      path.push(next)
    }

    return path
  }

  private showTargetMarker(gx: number, gy: number): void {
    this.clearTargetMarker()

    const { x, y } = gridToIso(gx, gy)
    this.targetMarker = this.add.graphics()
    this.targetMarker.lineStyle(2, 0xffff00, 0.8)
    this.targetMarker.strokeCircle(x, y, TILE_WIDTH * 0.4)
    this.targetMarker.setDepth(10000)

    this.tweens.add({
      targets: this.targetMarker,
      alpha: { from: 1, to: 0.3 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    })
  }

  private clearTargetMarker(): void {
    if (this.targetMarker) {
      this.targetMarker.destroy()
      this.targetMarker = null
    }
  }

  private clearPath(): void {
    this.pathToTarget = []
    this.currentPathIndex = 0
    this.clearTargetMarker()
  }

  // ==================== Vue -> Phaser 事件 ====================

  private onUIMovePlayer = (payload: { dx: number; dy: number }) => {
    this.clearPath()
    this.movePlayerByGrid(payload.dx, payload.dy)
  }

  private onUISpawnCharacter = (payload: { wx: number; wy: number }) => {
    const { x, y } = gridToIso(payload.wx, payload.wy)
    this.player.setPosition(x, y)
    this.player.moveTo(x, y)
    this.clearPath()
    this.refreshFog()
  }

  private onExplorationUpdated = () => {
    this.refreshFog()
  }

  // ==================== 多人同步 ====================

  private setupMultiplayerSync(): void {
    if (this.syncHandlersRegistered) return

    const socket = socketClient.instance
    if (!socket) return

    socket.on('players:in-chunk', this.onPlayersInChunk)
    socket.on('player:enter-chunk', this.onPlayerEnterChunk)
    socket.on('players:position-update', this.onPlayerPositionUpdate)
    socket.on('player:leave-chunk', this.onPlayerLeaveChunk)
    socket.on('player:move-confirmed', this.onMoveConfirmed)
    this.syncHandlersRegistered = true
  }

  /**
   * 请求当前区块内已存在的玩家名单。在 create() 时立即调用一次，
   * 并在 socket 连接就绪（socket:connected）时补发，覆盖 socket 尚未
   * 建立或断线重连的时序差。同时补注册 socket 层事件监听器（若
   * create() 时 socket 尚未创建）。
   */
  private onSocketConnected = () => {
    this.setupMultiplayerSync()
    const socket = socketClient.instance
    if (socket) {
      socket.emit('client:request-chunk-players')
    }
  }

  private cleanupMultiplayerSync(): void {
    const socket = socketClient.instance
    if (!socket) return

    socket.off('players:in-chunk', this.onPlayersInChunk)
    socket.off('player:enter-chunk', this.onPlayerEnterChunk)
    socket.off('players:position-update', this.onPlayerPositionUpdate)
    socket.off('player:leave-chunk', this.onPlayerLeaveChunk)
    socket.off('player:move-confirmed', this.onMoveConfirmed)

    this.otherPlayers.forEach((sprite) => sprite.destroy())
    this.otherPlayers.clear()
    this.syncHandlersRegistered = false
  }

  private onPlayersInChunk = (data: {
    players: Array<{ characterId: string; nickname: string; position: { x: number; y: number } }>
  }) => {
    this.otherPlayers.forEach((sprite) => sprite.destroy())
    this.otherPlayers.clear()

    data.players.forEach((player) => {
      this.addOtherPlayer(player)
    })
  }

  private onPlayerEnterChunk = (data: { characterId: string; nickname: string; position: { x: number; y: number } }) => {
    this.addOtherPlayer(data)
  }

  private onPlayerPositionUpdate = (data: { characterId: string; position: { x: number; y: number } }) => {
    const otherPlayer = this.otherPlayers.get(data.characterId)
    if (otherPlayer) {
      const { x, y } = gridToIso(data.position.x, data.position.y)
      otherPlayer.moveToPosition(x, y)
    }
  }

  private onPlayerLeaveChunk = (data: { characterId: string }) => {
    const otherPlayer = this.otherPlayers.get(data.characterId)
    if (otherPlayer) {
      otherPlayer.destroy()
      this.otherPlayers.delete(data.characterId)
    }
  }

  private onMoveConfirmed = (data: { position: { x: number; y: number }; chunkId: string }) => {
    const characterStore = useCharacterStore()
    characterStore.setPosition(data.position.x, data.position.y)

    if (data.chunkId !== this.currentChunkId) {
      const prevChunkId = this.currentChunkId
      this.currentChunkId = data.chunkId
      EventBus.emit('player:chunk-changed', { chunkId: data.chunkId })
      this.refreshFog()
      this.checkIslandDiscovery(data.chunkId, prevChunkId)
    }
  }

  private addOtherPlayer(data: { characterId: string; nickname: string; position: { x: number; y: number } }): void {
    if (this.otherPlayers.has(data.characterId)) return

    const { x, y } = gridToIso(data.position.x, data.position.y)
    const sprite = new OtherPlayerSprite(this, x, y, data.nickname, data.characterId)
    this.otherPlayers.set(data.characterId, sprite)
  }

  private sendPlayerMove(gx: number, gy: number): void {
    const socket = socketClient.instance
    if (socket) {
      socket.emit('player:move', { x: gx, y: gy })
    }
  }

  /** 好友传送确认：将本地玩家瞬移到目标坐标并刷新区块资源/房屋 */
  private onFriendTeleportConfirmed = (data: {
    characterId: string
    nickname: string
    position: { x: number; y: number }
    chunkId: string
  }) => {
    const { x, y } = gridToIso(data.position.x, data.position.y)
    this.player.setPosition(x, y)
    this.player.moveTo(x, y)
    this.clearPath()

    const characterStore = useCharacterStore()
    characterStore.setPosition(data.position.x, data.position.y)

    if (data.chunkId !== this.currentChunkId) {
      const prevChunkId = this.currentChunkId
      this.currentChunkId = data.chunkId
      EventBus.emit('player:chunk-changed', { chunkId: data.chunkId })
      this.refreshFog()
      this.loadChunkResources(data.chunkId)
      this.loadChunkRooms(data.chunkId)
      this.checkIslandDiscovery(data.chunkId, prevChunkId)
    }
  }

  private onTownTeleportConfirmed = (data: { townId: number; name: string; position: { x: number; y: number }; chunkId: string }) => {
    this.onFriendTeleportConfirmed({ characterId: '', nickname: data.name, position: data.position, chunkId: data.chunkId })
    EventBus.emit('game:toast', { message: `已传送至 ${data.name}`, type: 'success' })
  }

  /** 小岛区块发现通知（GDD §2.8 小岛区块） */
  private checkIslandDiscovery(newChunkId: string, _prevChunkId: string | null): void {
    const { chunkX, chunkY } = chunkIdToOrigin(newChunkId)
    if (isIslandChunk(chunkX, chunkY)) {
      EventBus.emit('game:toast', { message: '🏝️ 发现小岛！探索这片未知的土地吧', type: 'success' })
    }
  }

  // ==================== 聊天室房屋 ====================

  /** 玩家进入新区块时加载该区块的聊天室房屋 */
  private onPlayerChunkChangedForRooms = (payload: { chunkId: string }) => {
    this.loadChunkRooms(payload.chunkId)
  }

  /** 建造完成：立即刷新当前区块房屋标记 */
  private onBuildCreated = (payload: { chunkId: string; chatRoomId: number }) => {
    if (payload.chunkId === this.currentChunkId) {
      this.loadChunkRooms(payload.chunkId)
    }
  }

  private onBuildAbandoned = (payload: { chunkId: string }) => {
    if (payload.chunkId === this.currentChunkId) {
      this.loadChunkRooms(payload.chunkId)
    }
  }

  /** 从 REST API 加载指定区块的聊天室列表并渲染房屋标记（需携带认证 token） */
  private async loadChunkRooms(chunkId: string | null): Promise<void> {
    if (!chunkId) return
    const userStore = useUserStore()
    const token = userStore.accessToken ?? undefined
    this.clearRoomSprites()
    try {
      const data = await apiGet<{ chunkId: string; rooms: Array<{ id: number; chunkId: string; name: string; template: string; ownerId: string }> }>(
        `/map/rooms-in-chunk/${chunkId}`,
        token,
      )
      if (data.rooms) {
        for (const room of data.rooms) {
          this.renderRoomMarker({
            id: String(room.id),
            chunkId: room.chunkId,
            name: room.name,
            template: room.template,
            ownerId: room.ownerId,
          })
        }
      }
    } catch (err) {
      // 静默失败：区块可能没有聊天室，或网络错误
      console.warn('loadChunkRooms failed:', err)
    }
  }

  /** 渲染单个聊天室房屋精灵（可点击进入） */
  private renderRoomMarker(room: ChatRoomDTO): void {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(room.chunkId)
    // 房屋摆在区块中央（CHUNK_SIZE=16 → 中心 7,7；偏 -1 靠左上以不遮挡资源）
    const cx = originWX + 7
    const cy = originWY + 7
    const { x, y } = gridToIso(cx, cy)
    const textureKey = `house-${room.template}`
    const sprite = this.add.image(x, y, textureKey)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(y + 2)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => this.onRoomMarkerClick(room))
    this.roomSprites.set(room.id, sprite)
    this.roomData.set(room.id, room)
  }

  /** 点击聊天室房屋：提示 UI 层进入房间（GameView 监听后打开 ChatPanel） */
  private onRoomMarkerClick(room: ChatRoomDTO): void {
    EventBus.emit('ui:enter-room', { roomId: room.id })
  }

  /** 清除当前所有聊天室房屋精灵 */
  private clearRoomSprites(): void {
    this.roomSprites.forEach((sprite) => sprite.destroy())
    this.roomSprites.clear()
    this.roomData.clear()
  }

  // ==================== 资源节点 ====================

  /** 玩家进入新区块时加载该区块的资源节点 */
  private onPlayerChunkChangedForResources = (payload: { chunkId: string }) => {
    this.loadChunkResources(payload.chunkId)
  }

  /** 从 REST API 加载指定区块的资源节点列表并渲染（需携带认证 token） */
  private async loadChunkResources(chunkId: string | null): Promise<void> {
    if (!chunkId) return
    const userStore = useUserStore()
    const token = userStore.accessToken ?? undefined
    this.clearResourceSprites()
    try {
      const data = await apiGet<{ chunkId: string; nodes: ResourceNodeDTO[] }>(
        `/resource/chunk/${chunkId}`,
        token,
      )
      if (data.nodes) {
        for (const node of data.nodes) {
          this.renderResourceNode(node)
        }
      }
    } catch (err) {
      // 静默失败：区块可能尚未生成资源，或网络错误
      console.warn('loadChunkResources failed:', err)
    }
  }

  /** 渲染单个资源节点精灵（可点击采集） */
  private renderResourceNode(node: ResourceNodeDTO): void {
    const { x: worldX, y: worldY } = node.position
    const { x, y } = gridToIso(worldX, worldY)
    const textureKey = node.isDepleted ? `resource-${node.resourceType}-depleted` : `resource-${node.resourceType}`
    const sprite = this.add.image(x, y, textureKey)
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(y + 1)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => this.onResourceNodeClick(node))
    this.resourceSprites.set(node.id, sprite)
    this.resourceNodeData.set(node.id, node)
  }

  /** 点击资源节点：距离 <= 2 格时发送采集请求 */
  private onResourceNodeClick(node: ResourceNodeDTO): void {
    if (node.isDepleted) return
    const { gridX, gridY } = isoToGrid(this.player.x, this.player.y)
    const playerGX = Math.round(gridX)
    const playerGY = Math.round(gridY)
    const dx = Math.abs(playerGX - node.position.x)
    const dy = Math.abs(playerGY - node.position.y)
    if (dx > 2 || dy > 2) {
      EventBus.emit('game:toast', { message: '距离资源太远，请先靠近', type: 'warn' })
      return
    }
    const socket = socketClient.instance
    if (socket) {
      socket.emit('resource:collect', { nodeId: node.id, x: playerGX, y: playerGY })
    }
  }

  /** 采集成功：将节点标记为已耗尽（inventory:updated 已由 SocketClient 统一转发） */
  private onResourceCollected = (payload: { nodeId: number }) => {
    this.onResourceNodeDepleted({ nodeId: payload.nodeId })
  }

  /** 节点被采空：替换为 depleted 贴图并禁用交互 */
  private onResourceNodeDepleted = (payload: { nodeId: number }) => {
    const sprite = this.resourceSprites.get(payload.nodeId)
    const node = this.resourceNodeData.get(payload.nodeId)
    if (sprite && node) {
      const depletedKey = `resource-${node.resourceType}-depleted`
      sprite.setTexture(depletedKey)
      sprite.disableInteractive()
      node.isDepleted = true
    }
  }

  /** 清除当前所有资源节点精灵 */
  private clearResourceSprites(): void {
    this.resourceSprites.forEach((sprite) => sprite.destroy())
    this.resourceSprites.clear()
    this.resourceNodeData.clear()
  }
}
