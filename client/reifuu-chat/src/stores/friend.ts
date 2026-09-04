import { defineStore } from 'pinia'
import { apiGet, apiPost, apiDelete, ApiRequestError } from '../api/http'
import type { FriendDTO, FriendRequestDTO, MailboxMessageDTO, MailboxMessageType, PrivateMessageDTO, PigeonMessageDTO, PigeonSettingsDTO } from '../api/types'
import { useUserStore } from './user'
import { useCharacterStore } from './character'

interface FriendState {
  friends: FriendDTO[]
  pendingRequests: FriendRequestDTO[]
  mailbox: MailboxMessageDTO[]
  unreadCount: number
  loading: boolean
  /** 私聊消息缓存：key = friendCharacterId, value = messages (正序) */
  privateMessages: Record<number, PrivateMessageDTO[]>
  /** 当前私聊窗口对端 characterId */
  privateChatFriendId: number | null
  /** 当前私聊窗口对端昵称 */
  privateChatFriendNickname: string | null
  /** 飞鸽传书收件列表 */
  pigeonMessages: PigeonMessageDTO[]
  /** 飞鸽传书隐私设置 */
  pigeonSettings: PigeonSettingsDTO
  /** 飞鸽传书撰写窗口目标 characterId */
  pigeonComposeTargetId: number | null
  /** 飞鸽传书撰写窗口目标昵称 */
  pigeonComposeTargetNickname: string | null
}

export const useFriendStore = defineStore('friend', {
  state: (): FriendState => ({
    friends: [],
    pendingRequests: [],
    mailbox: [],
    unreadCount: 0,
    loading: false,
    privateMessages: {},
    privateChatFriendId: null,
    privateChatFriendNickname: null,
    pigeonMessages: [],
    pigeonSettings: { rejectStrangerPigeon: false },
    pigeonComposeTargetId: null,
    pigeonComposeTargetNickname: null,
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
    /** 获取与某好友的私聊历史 */
    async fetchPrivateMessages(friendCharacterId: number): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<{ messages: PrivateMessageDTO[] }>(
          `/friend/messages/${friendCharacterId}`,
          userStore.accessToken ?? undefined
        )
        this.privateMessages[friendCharacterId] = data.messages ?? []
      } catch (err) {
        console.warn('fetch private messages failed', err)
      }
    },
    /** 追加一条私聊消息到缓存（来自 socket 实时推送或发送回执） */
    appendPrivateMessage(message: PrivateMessageDTO): void {
      // 找到会话对端：若消息是发给我的，对端是 senderId；若是我发的，对端是 receiverId
      const characterStore = useCharacterStore()
      const myCharacterId = Number(characterStore.characterId ?? 0)
      const peerId = message.senderId === myCharacterId ? message.receiverId : message.senderId
      if (!this.privateMessages[peerId]) this.privateMessages[peerId] = []
      const list = this.privateMessages[peerId]
      if (!list.some((m) => m.id === message.id)) {
        list.push(message)
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      }
    },
    /** 打开与某好友的私聊窗口 */
    openPrivateChat(characterId: number, nickname: string): void {
      this.privateChatFriendId = characterId
      this.privateChatFriendNickname = nickname
    },
    /** 关闭私聊窗口 */
    closePrivateChat(): void {
      this.privateChatFriendId = null
      this.privateChatFriendNickname = null
    },
    /** 标记与某好友的私聊为已读 */
    async markConversationRead(friendCharacterId: number): Promise<void> {
      const userStore = useUserStore()
      try {
        await apiPost(
          `/friend/messages/${friendCharacterId}/read`,
          {},
          userStore.accessToken ?? undefined
        )
        const list = this.privateMessages[friendCharacterId]
        if (list) list.forEach((m) => (m.isRead = true))
      } catch (err) {
        console.warn('mark conversation read failed', err)
      }
    },
    /** 飞鸽传书：获取收件列表 */
    async fetchPigeonMessages(): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<{ pigeons: PigeonMessageDTO[] }>(
          '/friend/pigeon',
          userStore.accessToken ?? undefined
        )
        this.pigeonMessages = data.pigeons ?? []
      } catch (err) {
        console.warn('fetch pigeon messages failed', err)
      }
    },
    /** 飞鸽传书：获取隐私设置 */
    async fetchPigeonSettings(): Promise<void> {
      const userStore = useUserStore()
      try {
        const data = await apiGet<PigeonSettingsDTO>(
          '/friend/pigeon/settings',
          userStore.accessToken ?? undefined
        )
        this.pigeonSettings = data ?? { rejectStrangerPigeon: false }
      } catch (err) {
        console.warn('fetch pigeon settings failed', err)
      }
    },
    /** 飞鸽传书：更新隐私设置 */
    async updatePigeonSettings(rejectStrangerPigeon: boolean): Promise<void> {
      const userStore = useUserStore()
      const data = await apiPost<PigeonSettingsDTO>(
        '/friend/pigeon/settings',
        { rejectStrangerPigeon },
        userStore.accessToken ?? undefined
      )
      this.pigeonSettings = data ?? { rejectStrangerPigeon }
    },
    /** 飞鸽传书：发送消息，返回 PigeonMessageInfo（含 calculatedDelay/deliveredAt） */
    async sendPigeonMessage(toCharacterId: number, content: string): Promise<PigeonMessageDTO> {
      const userStore = useUserStore()
      const data = await apiPost<{ pigeon: PigeonMessageDTO }>(
        `/friend/pigeon/${toCharacterId}`,
        { content },
        userStore.accessToken ?? undefined
      )
      return data.pigeon
    },
    /** 飞鸽传书：打开撰写窗口 */
    openPigeonCompose(characterId: number, nickname: string): void {
      this.pigeonComposeTargetId = characterId
      this.pigeonComposeTargetNickname = nickname
    },
    /** 飞鸽传书：关闭撰写窗口 */
    closePigeonCompose(): void {
      this.pigeonComposeTargetId = null
      this.pigeonComposeTargetNickname = null
    },
    /** 飞鸽传书：收到投递通知时刷新列表与未读数 */
    onPigeonDelivered(): void {
      this.fetchPigeonMessages()
      this.fetchUnreadCount()
    },
    reset() {
      this.friends = []
      this.pendingRequests = []
      this.mailbox = []
      this.unreadCount = 0
      this.privateMessages = {}
      this.privateChatFriendId = null
      this.privateChatFriendNickname = null
      this.pigeonMessages = []
      this.pigeonSettings = { rejectStrangerPigeon: false }
      this.pigeonComposeTargetId = null
      this.pigeonComposeTargetNickname = null
    },
  },
})