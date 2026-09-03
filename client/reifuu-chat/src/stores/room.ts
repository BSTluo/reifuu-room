import { defineStore } from 'pinia'

export type RoomRole = 'owner' | 'member' | 'guest'

export interface RoomMember {
  characterId: string
  nickname: string
  role: RoomRole
}

interface RoomState {
  roomId: string | null
  name: string | null
  members: RoomMember[]
  chatHistory: { characterId: string; nickname: string; content: string; sentAt: number }[]
}

export const useRoomStore = defineStore('room', {
  state: (): RoomState => ({
    roomId: null,
    name: null,
    members: [],
    chatHistory: [],
  }),
  actions: {
    enterRoom(payload: { roomId: string; name: string; members: RoomMember[] }) {
      this.roomId = payload.roomId
      this.name = payload.name
      this.members = payload.members
      this.chatHistory = []
    },
    leaveRoom() {
      this.roomId = null
      this.name = null
      this.members = []
      this.chatHistory = []
    },
    pushMessage(message: { characterId: string; nickname: string; content: string; sentAt: number }) {
      this.chatHistory.push(message)
    },
  },
})
