import { defineStore } from 'pinia'
import { apiGet, apiPost, apiPut, apiDelete } from '../api/http'
import { useUserStore } from './user'
import { useRoomStore } from './room'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type { FurnitureItemDTO, FurnitureCatalogEntryDTO } from '../api/types'

/** 房间网格尺寸（与服务端一致） */
export const ROOM_GRID_WIDTH = 12
export const ROOM_GRID_HEIGHT = 8

interface InteriorState {
  /** 当前房间家具列表 */
  furniture: FurnitureItemDTO[]
  /** 家具目录 */
  catalog: FurnitureCatalogEntryDTO[]
  /** 是否正在加载 */
  loading: boolean
  /** 是否正在摆放/移动/移除家具 */
  placing: boolean
  /** 错误信息 */
  error: string | null
  /** 是否已加载目录 */
  catalogLoaded: boolean
  /** 摆放模式：'place' | 'move' | null */
  placementMode: 'place' | 'move' | null
  /** 当前选中的家具类型（摆放模式中） */
  selectedType: string | null
  /** 当前选中的家具 ID（移动模式中） */
  selectedFurnitureId: string | null
}

export const useInteriorStore = defineStore('interior', {
  state: (): InteriorState => ({
    furniture: [],
    catalog: [],
    loading: false,
    placing: false,
    error: null,
    catalogLoaded: false,
    placementMode: null,
    selectedType: null,
    selectedFurnitureId: null,
  }),

  getters: {
    /** 是否处于家具摆放/移动模式 */
    isPlacing: (state): boolean => state.placementMode !== null,
  },

  actions: {
    /** 初始化：加载目录 + 注册 socket 监听 */
    async init() {
      if (!this.catalogLoaded) {
        await this.fetchCatalog()
      }
      EventBus.on('room:furniture', this.onFurnitureList)
      EventBus.on('room:furniture-changed', this.onFurnitureChanged)
    },

    /** 清理 */
    dispose() {
      EventBus.off('room:furniture', this.onFurnitureList)
      EventBus.off('room:furniture-changed', this.onFurnitureChanged)
    },

    /** 获取家具目录 */
    async fetchCatalog() {
      try {
        const userStore = useUserStore()
        const data = await apiGet<{ catalog: FurnitureCatalogEntryDTO[] }>(
          '/room/furniture-catalog',
          userStore.accessToken ?? undefined,
        )
        this.catalog = data.catalog
        this.catalogLoaded = true
      } catch (err) {
        console.warn('fetchCatalog failed:', err)
      }
    },

    /** 加载房间家具（进入房间时调用） */
    async fetchFurniture() {
      const roomStore = useRoomStore()
      if (!roomStore.roomId) return
      this.loading = true
      this.error = null
      try {
        const userStore = useUserStore()
        const data = await apiGet<{ furniture: FurnitureItemDTO[] }>(
          `/room/${roomStore.roomId}/furniture`,
          userStore.accessToken ?? undefined,
        )
        this.furniture = data.furniture
        // 通知场景重新渲染家具（InteriorScene 监听此事件）
        EventBus.emit('room:furniture', { roomId: roomStore.roomId, furniture: data.furniture })
      } catch (err) {
        this.error = '加载家具失败'
        console.warn('fetchFurniture failed:', err)
      } finally {
        this.loading = false
      }
    },

    /** 摆放家具 */
    async placeFurniture(type: string, x: number, y: number, rotation = 0) {
      const roomStore = useRoomStore()
      if (!roomStore.roomId) return
      this.placing = true
      this.error = null
      try {
        const userStore = useUserStore()
        const data = await apiPost<{ furniture: FurnitureItemDTO }>(
          `/room/${roomStore.roomId}/furniture`,
          { type, x, y, rotation },
          userStore.accessToken ?? undefined,
        )
        this.furniture.push(data.furniture)
        // Broadcast to other room members
        const socket = socketClient.instance
        if (socket) {
          socket.emit('room:furniture-changed', {
            roomId: roomStore.roomId,
            action: 'placed',
            furniture: data.furniture,
          })
        }
        return data.furniture
      } catch (err: any) {
        this.error = err?.message ?? '摆放家具失败'
        throw err
      } finally {
        this.placing = false
      }
    },

    /** 移动家具 */
    async moveFurniture(furnitureId: string, x: number, y: number, rotation?: number) {
      const roomStore = useRoomStore()
      if (!roomStore.roomId) return
      this.placing = true
      this.error = null
      try {
        const userStore = useUserStore()
        const body: Record<string, unknown> = { x, y }
        if (typeof rotation === 'number') body.rotation = rotation
        const data = await apiPut<{ furniture: FurnitureItemDTO }>(
          `/room/${roomStore.roomId}/furniture/${furnitureId}`,
          body,
          userStore.accessToken ?? undefined,
        )
        // Update local state
        const idx = this.furniture.findIndex((f) => f.id === furnitureId)
        if (idx !== -1) {
          this.furniture[idx] = data.furniture
        }
        // Broadcast to other room members
        const socket = socketClient.instance
        if (socket) {
          socket.emit('room:furniture-changed', {
            roomId: roomStore.roomId!,
            action: 'moved',
            furniture: data.furniture,
          })
        }
        return data.furniture
      } catch (err: any) {
        this.error = err?.message ?? '移动家具失败'
        throw err
      } finally {
        this.placing = false
      }
    },

    /** 移除家具 */
    async removeFurniture(furnitureId: string) {
      const roomStore = useRoomStore()
      if (!roomStore.roomId) return
      this.placing = true
      this.error = null
      try {
        const userStore = useUserStore()
        await apiDelete(
          `/room/${roomStore.roomId}/furniture/${furnitureId}`,
          userStore.accessToken ?? undefined,
        )
        // Capture the removed item BEFORE filtering it out
        const removedItem = this.furniture.find((f) => f.id === furnitureId)
        this.furniture = this.furniture.filter((f) => f.id !== furnitureId)
        // Broadcast to other room members
        const socket = socketClient.instance
        if (socket) {
          socket.emit('room:furniture-changed', {
            roomId: roomStore.roomId,
            action: 'removed',
            furniture: removedItem ?? { id: furnitureId, type: '', x: 0, y: 0, rotation: 0, placedBy: '', createdAt: 0 },
          })
        }
      } catch (err: any) {
        this.error = err?.message ?? '移除家具失败'
        throw err
      } finally {
        this.placing = false
      }
    },

    /** 进入摆放模式 */
    startPlacement(type: string) {
      this.placementMode = 'place'
      this.selectedType = type
      this.selectedFurnitureId = null
    },

    /** 进入移动模式 */
    startMoveMode(furnitureId: string) {
      this.placementMode = 'move'
      this.selectedFurnitureId = furnitureId
      this.selectedType = null
    },

    /** 退出摆放/移动模式 */
    cancelPlacement() {
      this.placementMode = null
      this.selectedType = null
      this.selectedFurnitureId = null
    },

    /** 离开房间时清空状态 */
    clearFurniture() {
      this.furniture = []
      this.placementMode = null
      this.selectedType = null
      this.selectedFurnitureId = null
      this.error = null
    },

    // --- Socket event handlers ---

    onFurnitureList(data: { roomId: string; furniture: FurnitureItemDTO[] }) {
      const roomStore = useRoomStore()
      if (data.roomId === roomStore.roomId) {
        this.furniture = data.furniture
      }
    },

    onFurnitureChanged(data: { roomId: string; action: 'placed' | 'moved' | 'removed'; furniture: FurnitureItemDTO }) {
      const roomStore = useRoomStore()
      if (data.roomId !== roomStore.roomId) return

      if (data.action === 'placed') {
        if (!this.furniture.some((f) => f.id === data.furniture.id)) {
          this.furniture.push(data.furniture)
        }
      } else if (data.action === 'moved') {
        const idx = this.furniture.findIndex((f) => f.id === data.furniture.id)
        if (idx !== -1) {
          this.furniture[idx] = data.furniture
        }
      } else if (data.action === 'removed') {
        this.furniture = this.furniture.filter((f) => f.id !== data.furniture.id)
      }
    },
  },
})