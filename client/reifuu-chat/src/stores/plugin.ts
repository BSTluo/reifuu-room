import { defineStore } from 'pinia'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'

/** 单个插件实例的状态 */
export interface PluginInstance {
  pluginId: string
  state: Record<string, unknown>
}

interface PluginStoreState {
  /** roomId -> Map<pluginId, PluginInstance> */
  activePlugins: Map<string, Map<string, PluginInstance>>
}

export const usePluginStore = defineStore('plugin', {
  state: (): PluginStoreState => ({
    activePlugins: new Map(),
  }),

  actions: {
    /** 初始化：监听 EventBus 插件事件 */
    init() {
      EventBus.on('plugin:activated', this.onPluginActivated)
      EventBus.on('plugin:deactivated', this.onPluginDeactivated)
      EventBus.on('plugin:state', this.onPluginState)
      EventBus.on('plugin:list', this.onPluginList)
      EventBus.on('room:left', this.onRoomLeft)
    },

    /** 清理监听 */
    dispose() {
      EventBus.off('plugin:activated', this.onPluginActivated)
      EventBus.off('plugin:deactivated', this.onPluginDeactivated)
      EventBus.off('plugin:state', this.onPluginState)
      EventBus.off('plugin:list', this.onPluginList)
      EventBus.off('room:left', this.onRoomLeft)
    },

    /** 获取指定房间的已激活插件 */
    getPlugins(roomId: string): PluginInstance[] {
      const map = this.activePlugins.get(roomId)
      return map ? Array.from(map.values()) : []
    },

    /** 检查某个插件是否在当前房间激活 */
    isPluginActive(roomId: string, pluginId: string): boolean {
      const map = this.activePlugins.get(roomId)
      return map?.has(pluginId) ?? false
    },

    /** 获取指定插件的状态 */
    getPluginState(roomId: string, pluginId: string): Record<string, unknown> | null {
      const map = this.activePlugins.get(roomId)
      return map?.get(pluginId)?.state ?? null
    },

    /** 请求激活插件 */
    activatePlugin(roomId: string, pluginId: string) {
      const socket = socketClient.instance
      if (socket) {
        socket.emit('plugin:activate', { roomId, pluginId })
      }
    },

    /** 请求停用插件 */
    deactivatePlugin(roomId: string, pluginId: string) {
      const socket = socketClient.instance
      if (socket) {
        socket.emit('plugin:deactivate', { roomId, pluginId })
      }
    },

    /** 同步插件状态（控制器调用） */
    syncPluginState(roomId: string, pluginId: string, state: Record<string, unknown>) {
      const socket = socketClient.instance
      if (socket) {
        socket.emit('plugin:state-sync', { roomId, pluginId, state })
      }
    },

    // --- EventBus handlers ---

    onPluginActivated(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
      if (!this.activePlugins.has(data.roomId)) {
        this.activePlugins.set(data.roomId, new Map())
      }
      this.activePlugins.get(data.roomId)!.set(data.pluginId, {
        pluginId: data.pluginId,
        state: data.state,
      })
    },

    onPluginDeactivated(data: { roomId: string; pluginId: string }) {
      this.activePlugins.get(data.roomId)?.delete(data.pluginId)
    },

    onPluginState(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
      const map = this.activePlugins.get(data.roomId)
      const instance = map?.get(data.pluginId)
      if (instance) {
        Object.assign(instance.state, data.state)
      }
    },

    onPluginList(data: { roomId: string; plugins: Array<{ pluginId: string; state: Record<string, unknown> }> }) {
      if (!this.activePlugins.has(data.roomId)) {
        this.activePlugins.set(data.roomId, new Map())
      }
      const map = this.activePlugins.get(data.roomId)!
      for (const p of data.plugins) {
        map.set(p.pluginId, { pluginId: p.pluginId, state: p.state })
      }
    },

    onRoomLeft(data: { roomId: string }) {
      this.activePlugins.delete(data.roomId)
    },
  },
})
