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
