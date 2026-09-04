export interface AuthUser {
  id: number | string
  username: string
  email: string
}

export interface RegisterResponse {
  id: number | string
  username: string
  email: string
  message: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface RefreshResponse {
  accessToken: string
  user: AuthUser
}

export type Continent = 'east' | 'south' | 'west' | 'north'

export type SpawnMethod = 'random_unowned' | 'random_public'

export interface SpawnOptionDTO {
  method: SpawnMethod
  label: string
  description: string
  available: boolean
  poolSize: number
}

export interface CharacterAppearanceDTO {
  gender: string
  hair: string
  skin: string
  outfit: string
}

export interface CharacterDTO {
  id: string
  nickname: string
  appearance: CharacterAppearanceDTO
  continent: Continent
  spawnMethod: string
  currentChunkId: string
  position: { x: number; y: number }
}

export type ResourceType = 'wood' | 'stone' | 'mineral'

export interface ResourceNodeDTO {
  id: number
  chunkId: string
  resourceType: ResourceType
  position: { x: number; y: number }
  isDepleted: boolean
  respawnAt: string | null
}

export interface InventoryItemDTO {
  itemType: string
  quantity: number
}

export interface BuildTemplateDTO {
  template: 'wooden_house' | 'stone_house' | 'advanced_house'
  name: string
  requirements: { itemType: string; quantity: number }[]
}

export interface OwnedChunkDTO {
  chunkId: string
  position: { x: number; y: number }
  isPublic: boolean
  roomName: string | null
  template: string | null
}

export interface ChatRoomDTO {
  id: string
  chunkId: string
  name: string
  template: string
  ownerId: string
  ownerNickname?: string
}

export interface ChatMessageDTO {
  id: number
  roomId: string
  characterId: string
  nickname: string
  content: string
  createdAt: string
}

export interface RoomMemberDTO {
  characterId: string
  nickname: string
}

// ==================== 好友系统 (GDD §2.7) ====================

export interface FriendDTO {
  characterId: number
  nickname: string
  isOnline: boolean
  currentChunkId: string | null
  friendSince: string
}

export interface FriendRequestDTO {
  requestId: number
  fromCharacterId: number
  fromNickname: string
  message: string | null
  createdAt: string
}

export type MailboxMessageType = 'friend_request' | 'system' | 'chat' | 'pigeon'

export interface MailboxMessageDTO {
  id: number
  type: MailboxMessageType
  senderId: number | null
  senderNickname: string | null
  content: Record<string, any>
  isRead: boolean
  createdAt: string
}

/** 好友私聊消息 (GDD §2.7 好友私聊频道) */
export interface PrivateMessageDTO {
  id: number
  senderId: number
  receiverId: number
  senderNickname: string
  content: { text: string }
  isRead: boolean
  createdAt: string
}

/** 飞鸽传书消息 (GDD §2.7 飞鸽传书) */
export interface PigeonMessageDTO {
  id: number
  senderId: number
  receiverId: number
  senderNickname: string
  content: string
  distance: number
  hasTrafficChannel: boolean
  calculatedDelay: number
  sentAt: string
  deliveredAt: string | null
}

/** 飞鸽传书隐私设置 (GDD §2.7 隐私设置) */
export interface PigeonSettingsDTO {
  rejectStrangerPigeon: boolean
}

/** 城镇信息 (GDD §2.3 城镇系统 + 传送门) */
export interface TownDTO {
  id: number
  name: string
  level: number
  centerChunkId: string
  visited: boolean
}
