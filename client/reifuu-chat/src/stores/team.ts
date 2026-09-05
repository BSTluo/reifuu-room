import { defineStore } from 'pinia'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type {
  TeamStateDTO,
  TeamDTO,
  TeamMemberDTO,
  TeamInvitationDTO,
  TeamApplicationDTO,
  TeamChatMessageDTO,
  TeamRole,
} from '../api/types'

interface TeamState {
  team: TeamDTO | null
  role: TeamRole | null
  members: TeamMemberDTO[]
  applications: TeamApplicationDTO[]
  invitations: TeamInvitationDTO[]
  chunkUsage: { used: number; limit: number } | null
  chatMessages: TeamChatMessageDTO[]
  loading: boolean
  error: string | null
}

export const useTeamStore = defineStore('team', {
  state: (): TeamState => ({
    team: null,
    role: null,
    members: [],
    applications: [],
    invitations: [],
    chunkUsage: null,
    chatMessages: [],
    loading: false,
    error: null,
  }),

  getters: {
    /** 当前玩家是否为队长 */
    isLeader: (state) => state.role === 'leader',
    /** 当前玩家是否在团队中 */
    inTeam: (state) => state.team !== null,
    /** 成员按角色排序（队长在前） */
    sortedMembers: (state) =>
      [...state.members].sort((a, b) => {
        if (a.role === b.role) return a.nickname.localeCompare(b.nickname)
        return a.role === 'leader' ? -1 : 1
      }),
    /** 聊天记录按时间正序（旧在前） */
    sortedChat: (state) =>
      [...state.chatMessages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
  },

  actions: {
    /** 请求服务端下发当前团队状态 */
    requestState() {
      if (!socketClient.connected) return
      this.loading = true
      socketClient.emit('team:request-state')
    },

    /** 创建团队 */
    create(name: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:create', { name })
    },

    /** 邀请玩家加入团队（队长） */
    invite(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:invite', { characterId })
    },

    /** 申请加入团队 */
    apply(teamId: number, message?: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:apply', { teamId, message })
    },

    /** 接受邀请 */
    acceptInvitation(invitationId: number) {
      if (!socketClient.connected) return
      socketClient.emit('team:accept-invite', { invitationId })
    },

    /** 拒绝邀请 */
    rejectInvitation(invitationId: number) {
      if (!socketClient.connected) return
      socketClient.emit('team:reject-invite', { invitationId })
    },

    /** 接受申请（队长） */
    acceptApplication(applicationId: number) {
      if (!socketClient.connected) return
      socketClient.emit('team:accept-application', { applicationId })
    },

    /** 拒绝申请（队长） */
    rejectApplication(applicationId: number) {
      if (!socketClient.connected) return
      socketClient.emit('team:reject-application', { applicationId })
    },

    /** 踢出成员（队长） */
    kick(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:kick', { characterId })
    },

    /** 退出团队 */
    leave() {
      if (!socketClient.connected) return
      socketClient.emit('team:leave')
    },

    /** 转让队长（队长） */
    transfer(characterId: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:transfer', { characterId })
    },

    /** 解散团队（队长） */
    disband() {
      if (!socketClient.connected) return
      socketClient.emit('team:disband')
    },

    /** 发送团队聊天消息 */
    sendChat(content: string) {
      if (!socketClient.connected) return
      socketClient.emit('team:chat', { content })
    },

    // ---- 状态更新（由 EventBus 事件驱动） ----

    applyState(data: TeamStateDTO) {
      this.team = data.team
      this.role = data.role
      this.members = data.members
      this.applications = data.applications
      this.invitations = data.invitations
      this.chunkUsage = data.chunkUsage
      this.loading = false
      // 若已不在团队，清空聊天记录
      if (!data.team) {
        this.chatMessages = []
      }
    },

    applyInvitations(invitations: TeamInvitationDTO[]) {
      this.invitations = invitations
    },

    applyApplications(applications: TeamApplicationDTO[]) {
      this.applications = applications
    },

    onInviteReceived(data: { invitationId: number; teamId: number; teamName: string; fromNickname: string }) {
      // 收到新邀请：追加到邀请列表（若尚未存在）
      const exists = this.invitations.some((i) => i.id === data.invitationId)
      if (!exists) {
        this.invitations.unshift({
          id: data.invitationId,
          teamId: data.teamId,
          teamName: data.teamName,
          fromNickname: data.fromNickname,
          createdAt: new Date().toISOString(),
        })
      }
    },

    onApplicationReceived(data: { applicationId: number; teamId: number; teamName: string; characterId: string; nickname: string; message: string | null }) {
      // 队长收到新申请：追加到申请列表
      const exists = this.applications.some((a) => a.id === data.applicationId)
      if (!exists) {
        this.applications.unshift({
          id: data.applicationId,
          teamId: data.teamId,
          characterId: data.characterId,
          nickname: data.nickname,
          message: data.message,
          createdAt: new Date().toISOString(),
        })
      }
    },

    onMemberJoined(data: { teamId: number; characterId: string; nickname: string }) {
      // 新成员加入：若本地已有该成员则更新，否则追加
      const idx = this.members.findIndex((m) => m.characterId === data.characterId)
      if (idx >= 0) {
        this.members[idx].nickname = data.nickname
      } else {
        this.members.push({
          characterId: data.characterId,
          nickname: data.nickname,
          role: 'member',
          isOnline: true,
          joinedAt: new Date().toISOString(),
        })
      }
    },

    onMemberLeft(data: { teamId: number; characterId: string; nickname: string }) {
      this.members = this.members.filter((m) => m.characterId !== data.characterId)
    },

    onKicked(_data: { teamId: number; teamName: string }) {
      // 自己被踢出：清空团队状态
      this.resetTeam()
    },

    onDisbanded(_data: { teamId: number; teamName: string }) {
      // 团队解散：清空团队状态
      this.resetTeam()
    },

    onChatMessage(data: TeamChatMessageDTO) {
      this.chatMessages.push(data)
      // 限制本地聊天记录长度，避免无限增长
      if (this.chatMessages.length > 200) {
        this.chatMessages = this.chatMessages.slice(-200)
      }
    },

    resetTeam() {
      this.team = null
      this.role = null
      this.members = []
      this.applications = []
      this.invitations = []
      this.chunkUsage = null
      this.chatMessages = []
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
 * 注册团队相关的 EventBus 监听（在 store 首次使用时调用一次）。
 * 由 GameView 挂载时调用，确保 socket 事件能驱动 store 状态。
 */
let listenersRegistered = false
export function registerTeamListeners() {
  if (listenersRegistered) return
  listenersRegistered = true

  const store = useTeamStore()

  EventBus.on('team:state', (data) => store.applyState(data))
  EventBus.on('team:invite-received', (data) => store.onInviteReceived(data))
  EventBus.on('team:application-received', (data) => store.onApplicationReceived(data))
  EventBus.on('team:applications', (data) => store.applyApplications(data))
  EventBus.on('team:invitations', (data) => store.applyInvitations(data))
  EventBus.on('team:member-joined', (data) => store.onMemberJoined(data))
  EventBus.on('team:member-left', (data) => store.onMemberLeft(data))
  EventBus.on('team:kicked', (data) => store.onKicked(data))
  EventBus.on('team:disbanded', (data) => store.onDisbanded(data))
  EventBus.on('team:chat-message', (data) => store.onChatMessage(data))
}
