import { defineStore } from 'pinia'
import { EventBus } from '../game/EventBus'
import { apiGet } from '../api/http'
import { useUserStore } from './user'
import { worldToChunkId } from '../game/utils/world'

interface ExplorationState {
  /** All chunk IDs the player has ever explored (persisted on server) */
  exploredChunks: Set<string>
  /** Whether the initial explored list has been received */
  initialized: boolean
}

const VISION_RADIUS = 2 // 5x5 visible area around player chunk

export type ChunkFogState = 'hidden' | 'explored' | 'visible'

export const useExplorationStore = defineStore('exploration', {
  state: (): ExplorationState => ({
    exploredChunks: new Set<string>(),
    initialized: false,
  }),

  getters: {
    hasExploredChunk: (state) => {
      return (chunkId: string) => state.exploredChunks.has(chunkId)
    },
  },

  actions: {
    /** Add chunks from initial explored list or incremental explore event */
    addChunks(chunkIds: string[]) {
      let changed = false
      for (const id of chunkIds) {
        if (!this.exploredChunks.has(id)) {
          this.exploredChunks.add(id)
          changed = true
        }
      }
      if (changed) {
        // Pinia can't track Set mutations natively — force trigger by reassignment
        this.exploredChunks = new Set(this.exploredChunks)
        EventBus.emit('exploration:updated', { chunks: chunkIds })
      }
    },

    /** Compute 5x5 visible chunk set around a world position */
    computeVisibleChunks(worldX: number, worldY: number): Set<string> {
      const centerChunkId = worldToChunkId(worldX, worldY)
      const [ccx, ccy] = centerChunkId.split('_').map(Number)
      const visible = new Set<string>()
      for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy++) {
        for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx++) {
          visible.add(`${ccx + dx}_${ccy + dy}`)
        }
      }
      return visible
    },

    /** Determine fog state for a chunk: 'hidden' | 'explored' | 'visible' */
    getChunkFogState(chunkId: string, visibleChunks: Set<string>): ChunkFogState {
      if (visibleChunks.has(chunkId)) return 'visible'
      if (this.exploredChunks.has(chunkId)) return 'explored'
      return 'hidden'
    },

    /** Listen for exploration events from socket via EventBus */
    startListening() {
      EventBus.on('map:initial-explored', this.onInitialExplored)
      EventBus.on('map:explore', this.onExplore)
    },

    stopListening() {
      EventBus.off('map:initial-explored', this.onInitialExplored)
      EventBus.off('map:explore', this.onExplore)
    },

    /** Fallback: fetch explored chunks via REST (for reconnect/re-mount) */
    async fetchExploredChunks() {
      try {
        const userStore = useUserStore()
        const data = await apiGet<{ chunks: string[] }>('/map/explored', userStore.accessToken ?? undefined)
        this.addChunks(data.chunks)
        this.initialized = true
      } catch (e) {
        console.error('[ExplorationStore] fetchExploredChunks failed', e)
      }
    },

    reset() {
      this.exploredChunks = new Set<string>()
      this.initialized = false
    },

    onInitialExplored(data: { chunks: string[] }) {
      this.addChunks(data.chunks)
      this.initialized = true
    },

    onExplore(data: { chunks: string[] }) {
      this.addChunks(data.chunks)
    },
  },
})