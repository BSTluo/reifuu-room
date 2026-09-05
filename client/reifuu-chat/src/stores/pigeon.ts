import { defineStore } from 'pinia'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type { PigeonMessageDTO } from '../api/types'

interface PigeonState {
  inbox: PigeonMessageDTO[]
  sent: PigeonMessageDTO[]
  unreadCount: number
  loading: boolean
  error: string | null
}

export const usePigeonStore = defineStore('pigeon', {
  state: (): PigeonState => ({
    inbox: [],
    sent: [],
    unreadCount: 0,
    loading: false,
    error: null,
  }),

  getters: {
    /** 收件箱按时间倒序（最新在前） */
    sortedInbox: (state) =>
      [...state.inbox].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    /** 已发送按时间倒序 */
    sortedSent: (state) =>
      [...state.sent].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
  },

  actions: {
    /** 请求服务端下发当前信箱状态（收件箱 + 未读数） */
    requestState() {
      if (!socketClient.connected) return
      this.loading = true
      socketClient.emit('pigeon:request-state')
    },

    /** 请求已发送列表 */
    requestSent() {
      if (!socketClient.connected) return
      socketClient.emit('pigeon:request-sent')
    },

    /** 发送飞鸽传信 */
    send(toCharacterId: string, content: string) {
      if (!socketClient.connected) return
      socketClient.emit('pigeon:send', { toCharacterId, content })
    },

    /** 标记某封信为已读 */
    markRead(messageId: number) {
      if (!socketClient.connected) return
      socketClient.emit('pigeon:mark-read', { messageId })
    },

    // ---- 状态更新（由 EventBus 事件驱动） ----

    applyState(data: { messages: PigeonMessageDTO[]; unreadCount: number }) {
      this.inbox = data.messages
      this.unreadCount = data.unreadCount
      this.loading = false
    },

    applySent(messages: PigeonMessageDTO[]) {
      this.sent = messages
    },

    onSent(data: { messageId: number; toCharacterId: string; toNickname: string; delayMs: number; delivered: boolean }) {
      // 发送成功：若即时送达，追加到已发送列表顶部
      if (data.delivered) {
        this.sent.unshift({
          id: data.messageId,
          fromCharacterId: '',
          fromNickname: '',
          toCharacterId: data.toCharacterId,
          toNickname: data.toNickname,
          content: '',
          status: 'delivered',
          deliverAt: null,
          createdAt: new Date().toISOString(),
        })
      }
    },

    onDelivered(data: { messageId: number; fromCharacterId: string; fromNickname: string; content: string; createdAt: string }) {
      // 收到新信件：追加到收件箱顶部并增加未读数
      const exists = this.inbox.some((m) => m.id === data.messageId)
      if (!exists) {
        this.inbox.unshift({
          id: data.messageId,
          fromCharacterId: data.fromCharacterId,
          fromNickname: data.fromNickname,
          toCharacterId: '',
          toNickname: '',
          content: data.content,
          status: 'delivered',
          deliverAt: null,
          createdAt: data.createdAt,
        })
        this.unreadCount += 1
      }
    },

    onReadConfirmed(data: { messageId: number; unreadCount: number }) {
      // 标记已读：更新本地状态与未读数
      const msg = this.inbox.find((m) => m.id === data.messageId)
      if (msg) {
        msg.status = 'read'
      }
      this.unreadCount = data.unreadCount
    },

    setError(message: string) {
      this.error = message
    },

    clearError() {
      this.error = null
    },
  },
})

/**
 * 注册飞鸽传信相关的 EventBus 监听（在 store 首次使用时调用一次）。
 * 由 GameView 挂载时调用，确保 socket 事件能驱动 store 状态。
 */
let listenersRegistered = false
export function registerPigeonListeners() {
  if (listenersRegistered) return
  listenersRegistered = true

  const store = usePigeonStore()

  EventBus.on('pigeon:state', (data) => store.applyState(data))
  EventBus.on('pigeon:sent', (data) => store.onSent(data))
  EventBus.on('pigeon:delivered', (data) => store.onDelivered(data))
  EventBus.on('pigeon:read-confirmed', (data) => store.onReadConfirmed(data))
}
