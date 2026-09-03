import { defineStore } from 'pinia'
import { apiPost } from '../api/http'
import type { LoginResponse, RegisterResponse } from '../api/types'

const ACCESS_TOKEN_KEY = 'reifuu.accessToken'
const REFRESH_TOKEN_KEY = 'reifuu.refreshToken'

interface UserState {
  userId: string | null
  username: string | null
  email: string | null
  accessToken: string | null
  refreshToken: string | null
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    userId: null,
    username: null,
    email: null,
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
  },
  actions: {
    setTokens(accessToken: string, refreshToken?: string) {
      this.accessToken = accessToken
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
      if (refreshToken) {
        this.refreshToken = refreshToken
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
      }
    },
    async register(payload: { username: string; email: string; password: string }): Promise<void> {
      await apiPost<RegisterResponse>('/auth/register', payload)
    },
    async login(payload: { usernameOrEmail: string; password: string }): Promise<void> {
      const data = await apiPost<LoginResponse>('/auth/login', {
        usernameOrEmail: payload.usernameOrEmail,
        password: payload.password,
      })
      this.userId = String(data.user.id)
      this.username = data.user.username
      this.email = data.user.email
      this.setTokens(data.accessToken, data.refreshToken)
    },
    logout() {
      this.userId = null
      this.username = null
      this.email = null
      this.accessToken = null
      this.refreshToken = null
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    },
  },
})
