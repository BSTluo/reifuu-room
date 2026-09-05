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
  equippedVehicle?: VehicleDTO | null
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
export type VehicleType = 'horse' | 'cart'
export interface VehicleDTO {
  id: number
  characterId: string
  vehicleType: VehicleType
  speedMultiplier: number
  durability: number | null
  equipped: boolean
  createdAt: string
}
export interface VehicleTemplateDTO {
  vehicleType: VehicleType
  name: string
  speedMultiplier: number
  requirements: { itemType: string; quantity: number }[]
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

// ---- House interior (furniture) DTOs ----

export interface FurnitureItemDTO {
  id: string
  type: string
  x: number
  y: number
  rotation: number
  placedBy: string
  createdAt: number
}

export interface FurnitureCatalogEntryDTO {
  type: string
  name: string
  icon: string
  width: number
  height: number
  pluginId: string | null
  memberPlaceable: boolean
}

// ---- Friend system DTOs ----

export interface FriendListItemDTO {
  characterId: string
  nickname: string
  continent: string
  chunkId: string
  isOnline: boolean
  createdAt: string
}

export interface FriendRequestDTO {
  id: number
  fromCharacterId: string
  fromNickname: string
  status: string
  createdAt: string
}

export interface FriendStateDTO {
  friends: FriendListItemDTO[]
  requests: FriendRequestDTO[]
}

export interface FriendTeleportResultDTO {
  characterId: string
  nickname: string
  position: { x: number; y: number }
  chunkId: string
}

// ---- Pigeon mail (飞鸽传信) DTOs ----

export type PigeonMessageStatus = 'sending' | 'delivered' | 'read'

export interface PigeonMessageDTO {
  id: number
  fromCharacterId: string
  fromNickname: string
  toCharacterId: string
  toNickname: string
  content: string
  status: PigeonMessageStatus
  deliverAt: string | null
  createdAt: string
}

export interface PigeonSendResultDTO {
  messageId: number
  toNickname: string
  delayMs: number
  delivered: boolean
}

// ---- Team system (团队系统) DTOs ----

export type TeamRole = 'leader' | 'member'

export interface TeamDTO {
  teamId: number
  name: string
  leaderCharacterId: string
  leaderNickname: string
  createdAt: string
}

export interface TeamMemberDTO {
  characterId: string
  nickname: string
  role: TeamRole
  isOnline: boolean
  joinedAt: string
}

export interface TeamInvitationDTO {
  id: number
  teamId: number
  teamName: string
  fromNickname: string
  createdAt: string
}

export interface TeamApplicationDTO {
  id: number
  teamId: number
  characterId: string
  nickname: string
  message: string | null
  createdAt: string
}

export interface TeamChunkUsageDTO {
  used: number
  limit: number
}

export interface TeamStateDTO {
  team: TeamDTO | null
  role: TeamRole | null
  members: TeamMemberDTO[]
  applications: TeamApplicationDTO[]
  invitations: TeamInvitationDTO[]
  chunkUsage: TeamChunkUsageDTO | null
}

export interface TeamSearchResultDTO {
  teamId: number
  name: string
  leaderNickname: string
  memberCount: number
  createdAt: string
}

export interface TeamChatMessageDTO {
  teamId: number
  fromCharacterId: string
  fromNickname: string
  content: string
  timestamp: string
}
