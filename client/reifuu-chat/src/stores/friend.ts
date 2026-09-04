import { defineStore } from 'pinia'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type { FriendListItemDTO, FriendRequestDTO } from '../api/types'

interface FriendState {
  friends: FriendListItemDTO[]
  requests: FriendRequestDTO[]
  loading: boolean
  error: string | null
  /** 未读好友申请数量（用于信箱角标） */
  unreadRequestCount: number
}

export const useFriendStore = defineStore('friend', {
  state: (): FriendState => ({
    friends: [],
    requests: [],
    loading: false,
    error: null,
    unreadRequestCount: 0,
  }),

  getters: {
    onlineFriends: (state) => state.friends.filter((f) => f.isOnline),
    offlineFriends: (state) => state.friends.filter((f) => !f.isOnline),
  },

  actions: {
    /** 请求服务端下发当前好友状态（列表 + 待处理申请） */
    requestState() {
      if (!socketClient.connected) return
      socketClient.emit('friend:request-state')
    },

    /** 发送好友申请 */
    sendRequest(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('friend:send-request', { characterId })
    },

    /** 接受好友申请 */
    acceptRequest(requestId: number) {
      if (!socketClient.connected) return
      socketClient.emit('friend:accept-request', { requestId })
    },

    /** 拒绝好友申请 */
    rejectRequest(requestId: number) {
      if (!socketClient.connected) return
      socketClient.emit('friend:reject-request', { requestId })
    },

    /** 删除好友 */
    removeFriend(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('friend:remove', { characterId })
    },

    /** 传送到好友位置 */
    teleportToFriend(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('friend:teleport', { characterId })
    },

    // ---- 状态更新（由 EventBus 事件驱动） ----

    applyState(data: { friends: FriendListItemDTO[]; requests: FriendRequestDTO[] }) {
      this.friends = data.friends
      this.requests = data.requests
      this.unreadRequestCount = data.requests.length
      this.loading = false
    },

    onRequestReceived(data: { requestId: number; fromCharacterId: string; fromNickname: string }) {
      // 追加到待处理申请列表（若不存在）
      const exists = this.requests.some((r) => r.id === data.requestId)
      if (!exists) {
        this.requests.unshift({
          id: data.requestId,
          fromCharacterId: data.fromCharacterId,
          fromNickname: data.fromNickname,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })
      }
      this.unreadRequestCount = this.requests.length
    },

    onRequestSent(data: { requestId: number; toCharacterId: string; toNickname: string }) {
      // 发送成功，无需本地状态变更（可提示）
    },

    onAccepted(data: { friendCharacterId: string; friendNickname: string }) {
      // 从待处理申请中移除（若存在）
      this.requests = this.requests.filter(
        (r) => r.fromCharacterId !== data.friendCharacterId
      )
      this.unreadRequestCount = this.requests.length
      // 刷新好友列表
      this.requestState()
    },

    onRejected(data: { requestId: number }) {
      this.requests = this.requests.filter((r) => r.id !== data.requestId)
      this.unreadRequestCount = this.requests.length
    },

    onRemoved(data: { characterId: string }) {
      this.friends = this.friends.filter((f) => f.characterId !== data.characterId)
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
 * 注册好友相关的 EventBus 监听（在 store 首次使用时调用一次）。
 * 由 GameView 挂载时调用，确保 socket 事件能驱动 store 状态。
 */
let listenersRegistered = false
export function registerFriendListeners() {
  if (listenersRegistered) return
  listenersRegistered = true

  const store = useFriendStore()

  EventBus.on('friend:state', (data) => store.applyState(data))
  EventBus.on('friend:request-received', (data) => store.onRequestReceived(data))
  EventBus.on('friend:request-sent', (data) => store.onRequestSent(data))
  EventBus.on('friend:accepted', (data) => store.onAccepted(data))
  EventBus.on('friend:rejected', (data) => store.onRejected(data))
  EventBus.on('friend:removed', (data) => store.onRemoved(data))
}
