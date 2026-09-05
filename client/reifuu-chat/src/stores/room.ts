import { defineStore } from 'pinia'
import { apiGet, apiPost, apiDelete, ApiRequestError } from '../api/http'
import { useUserStore } from './user'
import { useCharacterStore } from './character'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type { ChatMessageDTO, ChatRoomDTO, RoomMemberDTO, RoomInvitationDTO } from '../api/types'

export type RoomRole = 'owner' | 'member' | 'guest'

interface RoomState {
  roomId: string | null
  name: string | null
  template: string | null
  ownerId: string | null
  myRole: RoomRole | null
  members: RoomMemberDTO[]
  invitations: RoomInvitationDTO[]
  pendingInvitations: RoomInvitationDTO[]
  isPublic: boolean
  messages: ChatMessageDTO[]
  loading: boolean
  error: string | null
}

export const useRoomStore = defineStore('room', {
  state: (): RoomState => ({
    roomId: null,
    name: null,
    template: null,
    ownerId: null,
    myRole: null,
    members: [],
    invitations: [],
    pendingInvitations: [],
    isPublic: true,
    messages: [],
    loading: false,
    error: null,
  }),
  getters: {
    inRoom: (state): boolean => state.roomId !== null,
  },
  actions: {
    async enterRoom(roomId: string) {
      const userStore = useUserStore()
      const characterStore = useCharacterStore()
      this.loading = true
      this.error = null
      try {
        // Fetch room details via REST
        const data = await apiGet<{ room: ChatRoomDTO }>(
          `/chat/room/${roomId}`,
          userStore.accessToken ?? undefined,
        )
        const room = data.room

        this.roomId = room.id
        this.name = room.name
        this.template = room.template
        this.ownerId = room.ownerId
        this.messages = []

        // Determine my role
        this.myRole = room.role ?? (room.ownerId === characterStore.characterId ? 'owner' : 'guest')
        this.isPublic = room.isPublic !== false
        const membership = await apiGet<{ members: RoomMemberDTO[]; invitations: RoomInvitationDTO[]; role: RoomRole | null }>(
          `/room/${roomId}/membership`, userStore.accessToken ?? undefined,
        )
        this.members = membership.members
        this.invitations = membership.invitations
        this.myRole = membership.role ?? this.myRole

        // Join socket room (server will send room:history + room:members)
        const socket = socketClient.instance
        if (socket) {
          socket.emit('room:join', { roomId })
        }

        EventBus.emit('room:entered', { roomId: room.id, name: room.name })
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.message : '进入房间失败'
        this.error = message
        console.warn('enterRoom failed:', err)
      } finally {
        this.loading = false
      }
    },
    leaveRoom() {
      if (this.roomId) {
        const socket = socketClient.instance
        if (socket) {
          socket.emit('room:leave', { roomId: this.roomId })
        }
        EventBus.emit('room:left', { roomId: this.roomId })
      }
      this.roomId = null
      this.name = null
      this.template = null
      this.ownerId = null
      this.myRole = null
      this.members = []
      this.invitations = []
      this.pendingInvitations = []
      this.isPublic = true
      this.messages = []
      this.error = null
    },
    applyHistory(payload: { roomId: string; messages: ChatMessageDTO[] }) {
      if (payload.roomId !== this.roomId) return
      this.messages = payload.messages
    },
    applyMessage(payload: { roomId: string; message: ChatMessageDTO }) {
      if (payload.roomId !== this.roomId) return
      // Dedupe by message id (server ack + broadcast may double-deliver)
      if (this.messages.some((m) => m.id === payload.message.id)) return
      this.messages.push(payload.message)
    },
    applyMembers(payload: { roomId: string; members: RoomMemberDTO[] }) {
      if (payload.roomId !== this.roomId) return
      this.members = payload.members
    },
    sendMessage(content: string) {
      if (!this.roomId) return
      const trimmed = content.trim()
      if (!trimmed) return
      const socket = socketClient.instance
      if (socket) {
        socket.emit('room:message', { roomId: this.roomId, content: trimmed })
      }
    },
    async inviteMember(characterId: string) {
      const token = useUserStore().accessToken ?? undefined
      await apiPost(`/room/${this.roomId}/invitations`, { characterId }, token)
    },
    async respondInvitation(invitationId: number, accept: boolean) {
      const token = useUserStore().accessToken ?? undefined
      await apiPost(`/room/invitations/${invitationId}/respond`, { accept }, token)
      this.invitations = this.invitations.filter((item) => item.id !== invitationId)
      this.pendingInvitations = this.pendingInvitations.filter((item) => item.id !== invitationId)
    },
    async fetchPendingInvitations() {
      const token = useUserStore().accessToken ?? undefined
      const data = await apiGet<{ invitations: RoomInvitationDTO[] }>('/room/invitations/pending', token)
      this.pendingInvitations = data.invitations
    },
    async removeMember(characterId: string) {
      const token = useUserStore().accessToken ?? undefined
      if (this.roomId) await apiDelete(`/room/${this.roomId}/members/${characterId}`, token)
      this.members = this.members.filter((member) => member.characterId !== characterId)
    },
  },
})
