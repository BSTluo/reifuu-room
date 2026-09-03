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
