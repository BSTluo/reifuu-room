import Phaser from 'phaser'
import { EventBus } from '../EventBus'
import { socketClient } from '../network/SocketClient'
import { useInteriorStore, ROOM_GRID_WIDTH, ROOM_GRID_HEIGHT } from '../../stores/interior'
import { useRoomStore } from '../../stores/room'
import { useCharacterStore } from '../../stores/character'
import { TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric'
import type { FurnitureItemDTO, FurnitureCatalogEntryDTO } from '../../api/types'

/** Interior tile size (same as world tiles for consistency) */
const ITILE_W = TILE_WIDTH
const ITILE_H = TILE_HEIGHT

/** Wall height for 2.5D illusion */
const WALL_HEIGHT = 24

/** Floor color per room template */
const FLOOR_COLORS: Record<string, number> = {
  wooden_house: 0x8b6e4a,
  stone_house: 0x9e9e8e,
  advanced_house: 0x7e57c2,
}

const WALL_COLOR = 0x5d4037

/** Furniture rendering config: color + emoji-like shape */
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

/** Total room pixel dimensions */
const ROOM_PX_W = ROOM_GRID_WIDTH * ITILE_W
const ROOM_PX_H = ROOM_GRID_HEIGHT * ITILE_H

/**
 * House interior scene: 2.5D top-down room view with furniture placement.
 *
 * The interior is a fixed-size grid (ROOM_GRID_WIDTH x ROOM_GRID_HEIGHT tiles).
 * Players can walk around inside the room, click on furniture to interact
 * with plugins, and place/move/remove furniture if they have permission.
 */
export class InteriorScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private playerSprite!: Phaser.GameObjects.Sprite
  private playerNameText!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key
  private moveSpeed = 160 // px/s
  private furnitureSprites = new Map<string, Phaser.GameObjects.Container>()
  private placementPreview: Phaser.GameObjects.Graphics | null = null
  private furnitureGraphics!: Phaser.GameObjects.Graphics
  private wallGraphics!: Phaser.GameObjects.Graphics
  private floorGraphics!: Phaser.GameObjects.Graphics
  private interiorStore: ReturnType<typeof useInteriorStore> | null = null
  private roomStore: ReturnType<typeof useRoomStore> | null = null
  private characterStore: ReturnType<typeof useCharacterStore> | null = null

  // ---- Proximity-based plugin interaction ----
  private keyE!: Phaser.Input.Keyboard.Key
  /** 当前靠近的带插件的家具（null 表示附近没有可交互家具） */
  private nearbyPluginFurniture: FurnitureItemDTO | null = null
  /** 浮动交互提示文字 */
  private interactionPrompt!: Phaser.GameObjects.Text
  /** 交互半径（像素） */
  private readonly INTERACTION_RADIUS = 80

  constructor() {
    super('InteriorScene')
  }

  create(): void {
    this.interiorStore = useInteriorStore()
    this.roomStore = useRoomStore()
    this.characterStore = useCharacterStore()

    const template = this.roomStore?.template ?? 'wooden_house'
    const floorColor = FLOOR_COLORS[template] ?? FLOOR_COLORS.wooden_house

    // Draw floor
    this.floorGraphics = this.add.graphics()
    this.floorGraphics.fillStyle(floorColor, 1)
    this.floorGraphics.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H)
    // Floor grid lines
    this.floorGraphics.lineStyle(1, 0x000000, 0.1)
    for (let i = 0; i <= ROOM_GRID_WIDTH; i++) {
      this.floorGraphics.lineBetween(i * ITILE_W, 0, i * ITILE_W, ROOM_PX_H)
    }
    for (let j = 0; j <= ROOM_GRID_HEIGHT; j++) {
      this.floorGraphics.lineBetween(0, j * ITILE_H, ROOM_PX_W, j * ITILE_H)
    }
    this.floorGraphics.setDepth(-100)

    // Draw walls (top + left, 2.5D perspective illusion)
    this.wallGraphics = this.add.graphics()
    this.wallGraphics.fillStyle(WALL_COLOR, 0.8)
    // Top wall
    this.wallGraphics.fillRect(0, -WALL_HEIGHT, ROOM_PX_W, WALL_HEIGHT)
    // Left wall
    this.wallGraphics.fillRect(-WALL_HEIGHT, 0, WALL_HEIGHT, ROOM_PX_H)
    this.wallGraphics.lineStyle(2, 0x3e2723, 1)
    this.wallGraphics.strokeRect(0, -WALL_HEIGHT, ROOM_PX_W, WALL_HEIGHT)
    this.wallGraphics.strokeRect(-WALL_HEIGHT, 0, WALL_HEIGHT, ROOM_PX_H)
    this.wallGraphics.setDepth(-99)

    // Furniture layer graphics (for placement preview grid)
    this.furnitureGraphics = this.add.graphics()
    this.furnitureGraphics.setDepth(100)

    // Create player at room entrance (center-ish bottom)
    const px = ROOM_PX_W / 2
    const py = ROOM_PX_H - ITILE_H
    this.playerSprite = this.add.sprite(0, 0, 'player-placeholder')
    this.playerSprite.setOrigin(0.5, 0.9)
    this.playerNameText = this.add.text(0, -32, this.characterStore?.nickname ?? 'Player', {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1)
    this.player = this.add.container(px, py, [this.playerNameText, this.playerSprite])
    this.player.setDepth(py)

    // Camera follows player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1.4)
    this.cameras.main.setBackgroundColor('#1a1a2e')
    this.cameras.main.setBounds(-WALL_HEIGHT * 2, -WALL_HEIGHT * 2, ROOM_PX_W + WALL_HEIGHT * 3, ROOM_PX_H + WALL_HEIGHT * 3)

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W)
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S)
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E)

    // Interaction prompt (hidden by default)
    this.interactionPrompt = this.add.text(0, 0, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.interactionPrompt.setOrigin(0.5, 1)
    this.interactionPrompt.setDepth(9999)
    this.interactionPrompt.setVisible(false)

    this.input.on('pointerdown', this.onPointerDown, this)

    // Load furniture from store
    this.renderAllFurniture()

    // Listen for furniture changes
    EventBus.on('room:furniture-changed', this.onFurnitureChanged)
    // Listen for full furniture list (initial load / re-sync)
    EventBus.on('room:furniture', this.onFurnitureList)
    // Listen for scene switch requests (back to world)
    EventBus.on('ui:request-scene', this.onRequestScene)

    EventBus.emit('phaser:ready', { sceneKey: this.scene.key })
    EventBus.emit('phaser:scene-changed', { sceneKey: this.scene.key })
  }

  update(_time: number, delta: number): void {
    this.handleKeyboardInput(delta)
    this.updatePlacementPreview()
    this.updateProximityInteraction()
    this.handleInteractionInput()
  }

  shutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this)
    EventBus.off('room:furniture-changed', this.onFurnitureChanged)
    EventBus.off('room:furniture', this.onFurnitureList)
    EventBus.off('ui:request-scene', this.onRequestScene)
    this.furnitureSprites.forEach((sprite) => sprite.destroy())
    this.furnitureSprites.clear()
    if (this.placementPreview) {
      this.placementPreview.destroy()
      this.placementPreview = null
    }
    if (this.interactionPrompt) {
      this.interactionPrompt.destroy()
    }
    this.nearbyPluginFurniture = null
    this.interiorStore?.cancelPlacement()
  }

  // ==================== Scene switching ====================

  /** UI 请求切换场景（返回大世界） */
  private onRequestScene = (payload: { sceneKey: string }): void => {
    if (payload.sceneKey === 'WorldScene') {
      this.scene.start('WorldScene')
    }
  }

  /** 收到完整家具列表时重新渲染 */
  private onFurnitureList = (data: { roomId: string; furniture: FurnitureItemDTO[] }): void => {
    const roomStore = this.roomStore
    if (!roomStore || data.roomId !== roomStore.roomId) return
    // 更新 store 中的家具
    if (this.interiorStore) {
      this.interiorStore.furniture = data.furniture
    }
    this.renderAllFurniture()
  }

  // ==================== Movement ====================

  private handleKeyboardInput(delta: number): void {
    if (!this.player) return
    let dx = 0
    let dy = 0

    if (this.cursors.up.isDown || this.keyW.isDown) dy = -1
    if (this.cursors.down.isDown || this.keyS.isDown) dy = 1
    if (this.cursors.left.isDown || this.keyA.isDown) dx = -1
    if (this.cursors.right.isDown || this.keyD.isDown) dx = 1

    if (dx !== 0 || dy !== 0) {
      // Cancel placement mode when moving
      this.interiorStore?.cancelPlacement()
      const step = this.moveSpeed * (delta / 1000)
      this.player.x = Phaser.Math.Clamp(
        this.player.x + dx * step,
        ITILE_W / 2,
        ROOM_PX_W - ITILE_W / 2,
      )
      this.player.y = Phaser.Math.Clamp(
        this.player.y + dy * step,
        ITILE_H / 2,
        ROOM_PX_H - ITILE_H / 2,
      )
      this.player.setDepth(this.player.y)
    }
  }

  // ==================== Click / Placement ====================

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const gx = Math.floor(pointer.worldX / ITILE_W)
    const gy = Math.floor(pointer.worldY / ITILE_H)

    if (gx < 0 || gy < 0 || gx >= ROOM_GRID_WIDTH || gy >= ROOM_GRID_HEIGHT) return

    const store = this.interiorStore
    if (!store) return

    // Placement mode: place furniture at clicked tile
    if (store.placementMode === 'place' && store.selectedType) {
      this.handlePlaceFurniture(store.selectedType, gx, gy)
      return
    }

    // Move mode: first click selects furniture, second click moves it
    if (store.placementMode === 'move') {
      const clickedFurniture = this.getFurnitureAt(gx, gy)
      if (clickedFurniture) {
        // Select this furniture for moving
        store.startMoveMode(clickedFurniture.id)
        EventBus.emit('game:toast', {
          message: `已选中 ${clickedFurniture.type}，点击目标位置移动`,
          type: 'info',
        })
      } else if (store.selectedFurnitureId) {
        // Move the selected furniture to this empty tile
        this.handleMoveFurniture(store.selectedFurnitureId, gx, gy)
      }
      return
    }

    // Normal mode: check if clicked on furniture
    const clickedFurniture = this.getFurnitureAt(gx, gy)
    if (clickedFurniture) {
      this.onFurnitureClick(clickedFurniture)
    }
  }

  private async handlePlaceFurniture(type: string, x: number, y: number): Promise<void> {
    const store = this.interiorStore
    if (!store) return
    try {
      await store.placeFurniture(type, x, y)
      // Success: cancel placement mode (single placement per click)
      // Or keep active for multiple placements - let's keep it active for convenience
    } catch (err) {
      EventBus.emit('game:toast', {
        message: (err as Error)?.message ?? '摆放失败',
        type: 'warn',
      })
    }
  }

  private async handleMoveFurniture(furnitureId: string, x: number, y: number): Promise<void> {
    const store = this.interiorStore
    if (!store) return
    try {
      await store.moveFurniture(furnitureId, x, y)
      store.cancelPlacement()
    } catch (err) {
      EventBus.emit('game:toast', {
        message: (err as Error)?.message ?? '移动失败',
        type: 'warn',
      })
    }
  }

  private onFurnitureClick(furniture: FurnitureItemDTO): void {
    const store = this.interiorStore
    if (!store) return

    const catalogEntry = store.catalog.find((c) => c.type === furniture.type)
    if (catalogEntry?.pluginId) {
      // Activate the associated plugin
      const roomStore = this.roomStore
      if (roomStore?.roomId) {
        EventBus.emit('ui:activate-furniture-plugin', {
          roomId: roomStore.roomId,
          pluginId: catalogEntry.pluginId,
          furnitureId: furniture.id,
        })
      }
    } else {
      // Non-plugin furniture: offer move/remove options
      EventBus.emit('game:toast', {
        message: `${catalogEntry?.name ?? furniture.type} (点击摆放/移动模式来调整)`,
        type: 'info',
      })
    }
  }

  private getFurnitureAt(gx: number, gy: number): FurnitureItemDTO | null {
    const store = this.interiorStore
    if (!store) return null
    for (const f of store.furniture) {
      const visual = FURNITURE_VISUALS[f.type]
      const w = visual?.w ?? 1
      const h = visual?.h ?? 1
      if (gx >= f.x && gx < f.x + w && gy >= f.y && gy < f.y + h) {
        return f
      }
    }
    return null
  }

  // ==================== Rendering ====================

  private renderAllFurniture(): void {
    const store = this.interiorStore
    if (!store) return

    // Clear existing
    this.furnitureSprites.forEach((sprite) => sprite.destroy())
    this.furnitureSprites.clear()

    for (const item of store.furniture) {
      this.renderFurnitureItem(item)
    }
  }

  private renderFurnitureItem(item: FurnitureItemDTO): void {
    const visual = FURNITURE_VISUALS[item.type]
    if (!visual) return

    const px = item.x * ITILE_W + (visual.w * ITILE_W) / 2
    const py = item.y * ITILE_H + (visual.h * ITILE_H) / 2

    const g = this.add.graphics()
    // Shadow
    g.fillStyle(0x000000, 0.2)
    g.fillEllipse(0, visual.h * ITILE_H / 2 - 4, visual.w * ITILE_W * 0.8, 12)
    // Body
    g.fillStyle(visual.color, 1)
    g.fillRoundedRect(
      -visual.w * ITILE_W / 2 + 4,
      -visual.h * ITILE_H / 2 + 4,
      visual.w * ITILE_W - 8,
      visual.h * ITILE_H - 8,
      6,
    )
    // Highlight
    g.fillStyle(0xffffff, 0.2)
    g.fillRoundedRect(
      -visual.w * ITILE_W / 2 + 6,
      -visual.h * ITILE_H / 2 + 6,
      visual.w * ITILE_W - 16,
      4,
      2,
    )

    const label = this.add.text(0, 0, visual.icon, {
      fontSize: '20px',
    }).setOrigin(0.5, 0.5)

    const container = this.add.container(px, py, [g, label])
    container.setDepth(py + 1)
    container.setSize(visual.w * ITILE_W, visual.h * ITILE_H)

    this.furnitureSprites.set(item.id, container)
  }

  // ==================== Placement Preview ====================

  private updatePlacementPreview(): void {
    const store = this.interiorStore
    if (!store || !store.isPlacing) {
      if (this.placementPreview) {
        this.placementPreview.clear()
      }
      return
    }

    const pointer = this.input.activePointer
    const gx = Math.floor(pointer.worldX / ITILE_W)
    const gy = Math.floor(pointer.worldY / ITILE_H)

    if (gx < 0 || gy < 0 || gx >= ROOM_GRID_WIDTH || gy >= ROOM_GRID_HEIGHT) {
      if (this.placementPreview) this.placementPreview.clear()
      return
    }

    let w = 1
    let h = 1
    if (store.placementMode === 'place' && store.selectedType) {
      const visual = FURNITURE_VISUALS[store.selectedType]
      w = visual?.w ?? 1
      h = visual?.h ?? 1
    } else if (store.placementMode === 'move' && store.selectedFurnitureId) {
      const item = store.furniture.find((f) => f.id === store.selectedFurnitureId)
      if (item) {
        const visual = FURNITURE_VISUALS[item.type]
        w = visual?.w ?? 1
        h = visual?.h ?? 1
      }
    }

    if (!this.placementPreview) {
      this.placementPreview = this.add.graphics()
      this.placementPreview.setDepth(200)
    }
    this.placementPreview.clear()
    this.placementPreview.lineStyle(2, 0x00ff00, 0.8)
    this.placementPreview.strokeRect(gx * ITILE_W, gy * ITILE_H, w * ITILE_W, h * ITILE_H)
    this.placementPreview.fillStyle(0x00ff00, 0.15)
    this.placementPreview.fillRect(gx * ITILE_W, gy * ITILE_H, w * ITILE_W, h * ITILE_H)
  }

  // ==================== Proximity Plugin Interaction ====================

  /** 每帧检测玩家是否靠近带插件的家具，更新交互提示 */
  private updateProximityInteraction(): void {
    const store = this.interiorStore
    if (!store) return

    const px = this.player.x
    const py = this.player.y

    let closestFurniture: FurnitureItemDTO | null = null
    let closestDist = Infinity

    for (const item of store.furniture) {
      const catalogEntry = store.catalog.find((c) => c.type === item.type)
      if (!catalogEntry?.pluginId) continue

      const visual = FURNITURE_VISUALS[item.type]
      const w = visual?.w ?? 1
      const h = visual?.h ?? 1
      // Furniture center in pixels
      const fx = item.x * ITILE_W + (w * ITILE_W) / 2
      const fy = item.y * ITILE_H + (h * ITILE_H) / 2
      const dist = Phaser.Math.Distance.Between(px, py, fx, fy)

      if (dist < this.INTERACTION_RADIUS && dist < closestDist) {
        closestDist = dist
        closestFurniture = item
      }
    }

    // Update nearby state
    if (closestFurniture !== this.nearbyPluginFurniture) {
      // Walked away from previous furniture → deactivate its plugin
      if (this.nearbyPluginFurniture && this.roomStore?.roomId) {
        const prevCatalog = store.catalog.find((c) => c.type === this.nearbyPluginFurniture!.type)
        if (prevCatalog?.pluginId) {
          EventBus.emit('ui:deactivate-furniture-plugin', {
            roomId: this.roomStore.roomId,
            pluginId: prevCatalog.pluginId,
          })
        }
      }
      this.nearbyPluginFurniture = closestFurniture
    }

    // Update prompt position and visibility
    if (this.nearbyPluginFurniture) {
      const item = this.nearbyPluginFurniture
      const visual = FURNITURE_VISUALS[item.type]
      const w = visual?.w ?? 1
      const h = visual?.h ?? 1
      const fx = item.x * ITILE_W + (w * ITILE_W) / 2
      const fy = item.y * ITILE_H
      const catalogEntry = store.catalog.find((c) => c.type === item.type)
      const promptText = `${visual?.icon ?? '✨'} 按 E 打开${catalogEntry?.name ?? item.type}`
      this.interactionPrompt.setText(promptText)
      this.interactionPrompt.setPosition(fx, fy - 8)
      this.interactionPrompt.setVisible(true)
      // Keep prompt on top of everything
      this.interactionPrompt.setDepth(9999)
    } else {
      this.interactionPrompt.setVisible(false)
    }
  }

  /** 处理 E 键交互：激活靠近的家具插件 */
  private handleInteractionInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keyE)) return
    if (!this.nearbyPluginFurniture || !this.roomStore?.roomId) return

    const store = this.interiorStore
    if (!store) return

    const item = this.nearbyPluginFurniture
    const catalogEntry = store.catalog.find((c) => c.type === item.type)
    if (!catalogEntry?.pluginId) return

    EventBus.emit('ui:activate-furniture-plugin', {
      roomId: this.roomStore.roomId,
      pluginId: catalogEntry.pluginId,
      furnitureId: item.id,
    })
  }

  // ==================== Furniture Change Handler ====================

  private onFurnitureChanged = (data: {
    roomId: string
    action: 'placed' | 'moved' | 'removed'
    furniture: FurnitureItemDTO
  }) => {
    const roomStore = this.roomStore
    if (!roomStore || data.roomId !== roomStore.roomId) return

    if (data.action === 'removed') {
      const sprite = this.furnitureSprites.get(data.furniture.id)
      if (sprite) {
        sprite.destroy()
        this.furnitureSprites.delete(data.furniture.id)
      }
    } else {
      // For placed/moved: destroy old sprite and re-render
      const existing = this.furnitureSprites.get(data.furniture.id)
      if (existing) {
        existing.destroy()
        this.furnitureSprites.delete(data.furniture.id)
      }
      this.renderFurnitureItem(data.furniture)
    }
  }
}