import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { OtherPlayerSprite } from '../entities/OtherPlayerSprite'
import { PlayerSprite } from '../entities/PlayerSprite'
import { socketClient } from '../network/SocketClient'
import { gridToIso, isoToGrid, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric'
import { CHUNK_SIZE, getChunkTerrain, chunkIdToWorldOrigin, worldToChunkId } from '../utils/world'
import { useCharacterStore } from '../../stores/character'
import { useExplorationStore } from '../../stores/exploration'
import type { ChunkFogState } from '../../stores/exploration'
import { apiGet } from '../../api/http'
import { useUserStore } from '../../stores/user'
import type { ResourceNodeDTO, ChatRoomDTO, TownDTO } from '../../api/types'

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
  /** 该区块的地形 Blitter（grass + dirt 各一个，因 Blitter 绑定单一贴图） */
  blitters: Phaser.GameObjects.Blitter[]
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
  /** townId -> 传送门精灵（当前区块） */
  private portalSprites = new Map<number, Phaser.GameObjects.Image>()
  /** townId -> 城镇数据（当前区块） */
  private portalData = new Map<number, TownDTO>()

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
    this.cameras.main.setZoom(1.2)
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
    EventBus.on('friend:teleport-confirmed', this.onTeleportConfirmed)
    EventBus.on('town:teleport-confirmed', this.onTownTeleportConfirmed)
    EventBus.on('exploration:updated', this.onExplorationUpdated)
    EventBus.on('resource:collected', this.onResourceCollected)
    EventBus.on('resource:node-depleted', this.onResourceNodeDepleted)
    EventBus.on('player:chunk-changed', this.onPlayerChunkChangedForResources)
    EventBus.on('player:chunk-changed', this.onPlayerChunkChangedForRooms)
    EventBus.on('player:chunk-changed', this.onPlayerChunkChangedForPortals)
    EventBus.on('build:created', this.onBuildCreated)

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

    // 加载当前区块的传送门标记
    this.loadChunkPortals(this.currentChunkId)

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
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this)
    EventBus.off('ui:move-player', this.onUIMovePlayer)
    EventBus.off('ui:spawn-character', this.onUISpawnCharacter)
    EventBus.off('friend:teleport-confirmed', this.onTeleportConfirmed)
    EventBus.off('town:teleport-confirmed', this.onTownTeleportConfirmed)
    EventBus.off('exploration:updated', this.onExplorationUpdated)
    EventBus.off('socket:connected', this.onSocketConnected)
    EventBus.off('resource:collected', this.onResourceCollected)
    EventBus.off('resource:node-depleted', this.onResourceNodeDepleted)
    EventBus.off('player:chunk-changed', this.onPlayerChunkChangedForResources)
    EventBus.off('player:chunk-changed', this.onPlayerChunkChangedForRooms)
    EventBus.off('player:chunk-changed', this.onPlayerChunkChangedForPortals)
    EventBus.off('build:created', this.onBuildCreated)
    this.cleanupMultiplayerSync()
    this.clearResourceSprites()
    this.clearRoomSprites()
    this.clearPortalSprites()
    this.destroyAllChunks()
  }

  // ==================== 区块渲染 ====================

  /** 确保 chunkId 的地形层已创建（不负责迷雾） */
  private ensureChunkTerrain(chunkId: string): void {
    if (this.chunkLayers.has(chunkId)) return

    const blitters: Phaser.GameObjects.Blitter[] = []
    for (const type of ['grass', 'dirt'] as const) {
      const blitter = this.add.blitter(0, 0, `tile-${type}`)
      blitter.setDepth(TERRAIN_DEPTH)
      blitters.push(blitter)
    }

    const layer: ChunkLayer = { blitters, fog: undefined }
    this.chunkLayers.set(chunkId, layer)
    this.populateChunkBobs(chunkId, layer)
  }

  /** 为 chunkId 的两个 Blitter 填充全部 CHUNK_SIZE x CHUNK_SIZE 个 tile Bob */
  private populateChunkBobs(chunkId: string, layer: ChunkLayer): void {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(chunkId)
    const terrain = getChunkTerrain(chunkId)
    const [grassBlitter, dirtBlitter] = layer.blitters
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = originWX + lx
        const wy = originWY + ly
        const center = gridToIso(wx, wy)
        const blitter = terrain[ly][lx] === 'grass' ? grassBlitter : dirtBlitter
        // Bob 使用左上角原点，tile 菱形中心在贴图 (halfW, halfH) 处
        blitter.create(center.x - halfW, center.y - halfH)
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

  /** 绘制整块大菱形迷雾遮罩（四个角落 tile 中心 ± 半 tile 延伸） */
  private buildFogOverlay(chunkId: string): Phaser.GameObjects.Graphics {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(chunkId)
    const n = CHUNK_SIZE - 1
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2

    const top = gridToIso(originWX, originWY)
    const right = gridToIso(originWX + n, originWY)
    const bottom = gridToIso(originWX + n, originWY + n)
    const left = gridToIso(originWX, originWY + n)

    const g = this.add.graphics()
    g.fillStyle(FOG_EXPLORED_COLOR, FOG_EXPLORED_ALPHA)
    g.beginPath()
    g.moveTo(top.x, top.y - halfH)
    g.lineTo(right.x + halfW, right.y)
    g.lineTo(bottom.x, bottom.y + halfH)
    g.lineTo(left.x - halfW, left.y)
    g.closePath()
    g.fillPath()
    g.setDepth(FOG_DEPTH)
    return g
  }

  private destroyChunkLayer(chunkId: string): void {
    const layer = this.chunkLayers.get(chunkId)
    if (!layer) return
    for (const blitter of layer.blitters) blitter.destroy()
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

    // 无限世界：无边界/水域检查，所有 tile 均可通行
    const { x, y } = gridToIso(nextGX, nextGY)
    this.player.moveTo(x, y)
    EventBus.emit('player:position-changed', { x: nextGX, y: nextGY })

    this.sendPlayerMove(nextGX, nextGY)
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

  /** 曼哈顿贪心寻路：世界坐标下所有 tile 均可通行，无需障碍检测 */
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
      if (x < targetX) {
        x++
      } else if (x > targetX) {
        x--
      } else if (y < targetY) {
        y++
      } else if (y > targetY) {
        y--
      }
      path.push({ gx: x, gy: y })
    }

    return path
  }

  private showTargetMarker(gx: number, gy: number): void {
    this.clearTargetMarker()

    const { x, y } = gridToIso(gx, gy)
    this.targetMarker = this.add.graphics()
    this.targetMarker.lineStyle(2, 0xffff00, 0.8)
    this.targetMarker.strokeCircle(x, y, 12)
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

  /** 好友传送确认：更新玩家位置、区块、迷雾与资源/房间 */
  private onTeleportConfirmed = (data: {
    position: { x: number; y: number }
    chunkId: string
    friendNickname: string | null
    cooldownRemaining: number
  }) => {
    const characterStore = useCharacterStore()
    characterStore.setPosition(data.position.x, data.position.y)

    // 更新玩家精灵位置
    const { x, y } = gridToIso(data.position.x, data.position.y)
    this.player.setPosition(x, y)
    this.player.moveTo(x, y)
    this.clearPath()

    // 区块变化：更新 currentChunkId、触发资源/房间加载、刷新迷雾
    if (data.chunkId !== this.currentChunkId) {
      this.currentChunkId = data.chunkId
      EventBus.emit('player:chunk-changed', { chunkId: data.chunkId })
      this.refreshFog()
    }

    EventBus.emit('game:toast', {
      message: data.friendNickname ? `已传送到 ${data.friendNickname} 附近` : '传送成功',
      type: 'success',
    })
  }

  /** 城镇传送确认：更新玩家位置、区块、迷雾与资源/房间 */
  private onTownTeleportConfirmed = (data: {
    position: { x: number; y: number }
    chunkId: string
    townName: string
    cooldownRemaining: number
  }) => {
    const characterStore = useCharacterStore()
    characterStore.setPosition(data.position.x, data.position.y)

    // 更新玩家精灵位置
    const { x, y } = gridToIso(data.position.x, data.position.y)
    this.player.setPosition(x, y)
    this.player.moveTo(x, y)
    this.clearPath()

    // 区块变化：更新 currentChunkId、触发资源/房间/传送门加载、刷新迷雾
    if (data.chunkId !== this.currentChunkId) {
      this.currentChunkId = data.chunkId
      EventBus.emit('player:chunk-changed', { chunkId: data.chunkId })
      this.refreshFog()
    }

    EventBus.emit('game:toast', {
      message: `已传送到 ${data.townName}`,
      type: 'success',
    })
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
      this.currentChunkId = data.chunkId
      EventBus.emit('player:chunk-changed', { chunkId: data.chunkId })
      this.refreshFog()
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

  // ==================== 聊天室房屋 ====================

  /** 玩家进入新区块时加载该区块的聊天室房屋 */
  private onPlayerChunkChangedForRooms = (payload: { chunkId: string }) => {
    this.loadChunkRooms(payload.chunkId)
  }

  /** 玩家进入新区块时加载该区块的传送门 */
  private onPlayerChunkChangedForPortals = (payload: { chunkId: string }) => {
    this.loadChunkPortals(payload.chunkId)
  }

  /** 从 REST API 加载所有城镇并在当前区块渲染传送门（需携带认证 token） */
  private async loadChunkPortals(chunkId: string | null): Promise<void> {
    if (!chunkId) return
    const userStore = useUserStore()
    const token = userStore.accessToken ?? undefined
    this.clearPortalSprites()
    try {
      const data = await apiGet<{ towns: TownDTO[] }>('/town/list', token)
      const towns = data.towns ?? []
      const target = chunkIdToOrigin(chunkId)
      for (const town of towns) {
        const origin = chunkIdToOrigin(town.centerChunkId)
        // 仅渲染中心区块与玩家当前区块一致的传送门（MVP：只渲染所在区块）
        if (origin.chunkX === target.chunkX && origin.chunkY === target.chunkY) {
          this.renderPortalMarker(town)
        }
      }
    } catch (err) {
      // 静默失败：网络错误或尚未登录
      console.warn('loadChunkPortals failed:', err)
    }
  }

  /** 渲染单个传送门精灵（可点击打开传送门面板） */
  private renderPortalMarker(town: TownDTO): void {
    const { wx: originWX, wy: originWY } = chunkIdToWorldOrigin(town.centerChunkId)
    // 传送门摆在城镇中心区块中央
    const cx = originWX + 24
    const cy = originWY + 24
    const { x, y } = gridToIso(cx, cy)
    const sprite = this.add.image(x, y - 12, 'portal')
    sprite.setDepth(y + 2)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => this.onPortalMarkerClick(town))
    this.portalSprites.set(town.id, sprite)
    this.portalData.set(town.id, town)
  }

  /** 点击传送门：提示 UI 层打开传送门面板（GameView 监听后显示 TownPortalPanel） */
  private onPortalMarkerClick(town: TownDTO): void {
    EventBus.emit('ui:open-portal-panel')
  }

  /** 清除当前所有传送门精灵 */
  private clearPortalSprites(): void {
    this.portalSprites.forEach((sprite) => sprite.destroy())
    this.portalSprites.clear()
    this.portalData.clear()
  }

  /** 建造完成：立即刷新当前区块房屋标记 */
  private onBuildCreated = (payload: { chunkId: string; chatRoomId: number }) => {
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
    const sprite = this.add.image(x, y - 16, textureKey)
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
    const sprite = this.add.image(x, y - 8, textureKey)
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
