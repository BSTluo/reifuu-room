import { defineStore } from 'pinia'
import { apiGet, apiPost, apiDelete, ApiRequestError } from '../api/http'
import type { FriendDTO, FriendRequestDTO, MailboxMessageDTO, MailboxMessageType } from '../api/types'
import { useUserStore } from './user'

interface FriendState {
  friends: FriendDTO[]
  pendingRequests: FriendRequestDTO[]
  mailbox: MailboxMessageDTO[]
  unreadCount: number
  loading: boolean
}

export const useFriendStore = defineStore('friend', {
  state: (): FriendState => ({
    friends: [],
    pendingRequests: [],
    mailbox: [],
    unreadCount: 0,
    loading: false,
  }),
  actions: {
    async fetchFriends(): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<{ friends: FriendDTO[] }>('/friend/list', userStore.accessToken ?? undefined)
        this.friends = data.friends ?? []
      } catch (err) {
        console.warn('fetch friends failed', err)
      }
    },
    async fetchPendingRequests(): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<{ requests: FriendRequestDTO[] }>(
          '/friend/requests/pending',
          userStore.accessToken ?? undefined
        )
        this.pendingRequests = data.requests ?? []
      } catch (err) {
        console.warn('fetch pending requests failed', err)
      }
    },
    async fetchMailbox(type?: MailboxMessageType): Promise<void> {
      const userStore = useUserStore()
      try {
        const qs = type ? `?type=${type}` : ''
        const data = await apiGet<{ messages: MailboxMessageDTO[] }>(
          `/friend/mailbox${qs}`,
          userStore.accessToken ?? undefined
        )
        this.mailbox = data.messages ?? []
      } catch (err) {
        console.warn('fetch mailbox failed', err)
      }
    },
    async fetchUnreadCount(): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<{ count: number }>(
          '/friend/mailbox/unread-count',
          userStore.accessToken ?? undefined
        )
        this.unreadCount = data.count ?? 0
      } catch (err) {
        console.warn('fetch unread count failed', err)
      }
    },
    async sendFriendRequest(toCharacterId: number, message?: string): Promise<void> {
      const userStore = useUserStore()
      await apiPost<{ request: FriendRequestDTO }>(
        '/friend/request',
        { toCharacterId, message },
        userStore.accessToken ?? undefined
      )
    },
    async respondToRequest(requestId: number, accept: boolean): Promise<void> {
      const userStore = useUserStore()
      await apiPost<{ status: 'accepted' | 'rejected' }>(
        `/friend/request/${requestId}/respond`,
        { accept },
        userStore.accessToken ?? undefined
      )
      // Refresh pending requests and friends after responding
      await this.fetchPendingRequests()
      if (accept) await this.fetchFriends()
    },
    async removeFriend(characterId: number): Promise<void> {
      const userStore = useUserStore()
      await apiDelete(`/friend/${characterId}`, userStore.accessToken ?? undefined)
      this.friends = this.friends.filter((f) => f.characterId !== characterId)
    },
    async markMessageRead(messageId: number): Promise<void> {
      const userStore = useUserStore()
      await apiPost(`/friend/mailbox/${messageId}/read`, {}, userStore.accessToken ?? undefined)
      const msg = this.mailbox.find((m) => m.id === messageId)
      if (msg) msg.isRead = true
      await this.fetchUnreadCount()
    },
    /** 本地更新好友在线状态（来自 socket 实时推送） */
    updateOnlineStatus(characterId: number, isOnline: boolean): void {
      const friend = this.friends.find((f) => f.characterId === characterId)
      if (friend) friend.isOnline = isOnline
      // 在线优先排序
      this.friends.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1
        return a.nickname.localeCompare(b.nickname)
      })
    },
    /** 收到新好友请求时刷新待处理列表与未读数 */
    onNewRequest(): void {
      this.fetchPendingRequests()
      this.fetchUnreadCount()
    },
    /** 好友请求被接受/拒绝后刷新列表 */
    onRequestResult(): void {
      this.fetchFriends()
      this.fetchUnreadCount()
    },
    reset() {
      this.friends = []
      this.pendingRequests = []
      this.mailbox = []
      this.unreadCount = 0
    },
  },
})