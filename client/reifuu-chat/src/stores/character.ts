import { defineStore } from 'pinia'
import { apiGet, apiPost, ApiRequestError } from '../api/http'
import type { CharacterAppearanceDTO, CharacterDTO, Continent, SpawnMethod, SpawnOptionDTO } from '../api/types'
import { useUserStore } from './user'

interface CharacterState {
  characterId: string | null
  nickname: string | null
  appearance: CharacterAppearanceDTO | null
  continent: Continent | null
  currentChunkId: string | null
  position: { x: number; y: number }
  hasCharacter: boolean | null
}

export const useCharacterStore = defineStore('character', {
  state: (): CharacterState => ({
    characterId: null,
    nickname: null,
    appearance: null,
    continent: null,
    currentChunkId: null,
    position: { x: 0, y: 0 },
    hasCharacter: null,
  }),
  actions: {
    applyCharacter(dto: CharacterDTO) {
      this.characterId = dto.id
      this.nickname = dto.nickname
      this.appearance = dto.appearance
      this.continent = dto.continent
      this.currentChunkId = dto.currentChunkId
      this.position = dto.position
      this.hasCharacter = true
    },
    async fetchCharacter(): Promise<void> {
      const userStore = useUserStore()
      console.log('[CharacterStore] fetchCharacter: starting', { hasToken: !!userStore.accessToken })

      // Set a timeout to prevent hanging forever
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
      })

      try {
        const fetchPromise = apiGet<CharacterDTO>('/character/me', userStore.accessToken ?? undefined)
        const dto = await Promise.race([fetchPromise, timeoutPromise]) as CharacterDTO
        console.log('[CharacterStore] fetchCharacter: success', dto)
        this.applyCharacter(dto)
      } catch (error) {
        console.log('[CharacterStore] fetchCharacter: error', error)
        if (error instanceof ApiRequestError && error.statusCode === 404) {
          console.log('[CharacterStore] fetchCharacter: 404 -> hasCharacter=false')
          this.hasCharacter = false
          return
        }
        // If unauthorized (401), throw to let App.vue handle logout
        if (error instanceof ApiRequestError && error.statusCode === 401) {
          console.warn('[CharacterStore] fetchCharacter: 401 unauthorized, throwing')
          throw error
        }
        // 如果是其他错误（如接口未实现返回500），也视为"无角色"状态，避免卡在loading
        console.warn('[CharacterStore] fetchCharacter: non-404 error treated as no character', error)
        this.hasCharacter = false
      }
    },
    async createCharacter(payload: {
      nickname: string
      appearance: CharacterAppearanceDTO
      startContinent: Continent
      spawnMethod?: SpawnMethod
    }): Promise<void> {
      const userStore = useUserStore()
      const dto = await apiPost<CharacterDTO>('/character/create', {
        ...payload,
        spawnMethod: payload.spawnMethod ?? 'unowned',
      }, userStore.accessToken ?? undefined)
      this.applyCharacter(dto)
    },
    setPosition(x: number, y: number) {
      this.position.x = x
      this.position.y = y
    },
    async fetchSpawnOptions(): Promise<SpawnOptionDTO[]> {
      const userStore = useUserStore()
      return apiGet<SpawnOptionDTO[]>('/character/spawn-options', userStore.accessToken ?? undefined)
    },
    reset() {
      this.characterId = null
      this.nickname = null
      this.appearance = null
      this.continent = null
      this.currentChunkId = null
      this.position = { x: 0, y: 0 }
      this.hasCharacter = null
    },
  },
})
