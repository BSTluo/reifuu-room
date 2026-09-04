import { defineStore } from 'pinia'
import { apiGet, ApiRequestError } from '../api/http'
import { useUserStore } from './user'
import { useCharacterStore } from './character'
import { socketClient } from '../game/network/SocketClient'
import { EventBus } from '../game/EventBus'
import type { ChatMessageDTO, ChatRoomDTO, RoomMemberDTO } from '../api/types'

export type RoomRole = 'owner' | 'member' | 'guest'

interface RoomState {
  roomId: string | null
  name: string | null
  template: string | null
  ownerId: string | null
  myRole: RoomRole | null
  members: RoomMemberDTO[]
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
        this.myRole = room.ownerId === characterStore.characterId ? 'owner' : 'guest'

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
  },
})
