<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AuthView from './views/AuthView.vue'
import CharacterCreateView from './views/CharacterCreateView.vue'
import GameView from './views/GameView.vue'
import { useUserStore } from './stores/user'
import { useCharacterStore } from './stores/character'

const userStore = useUserStore()
const characterStore = useCharacterStore()

const checkingCharacter = ref(false)

const view = computed<'auth' | 'character-create' | 'game' | 'loading'>(() => {
  if (!userStore.isAuthenticated) return 'auth'
  if (checkingCharacter.value || characterStore.hasCharacter === null) return 'loading'
  if (characterStore.hasCharacter === false) return 'character-create'
  return 'game'
})

async function loadCharacter() {
  console.log('[App] loadCharacter: starting')
  checkingCharacter.value = true
  try {
    await characterStore.fetchCharacter()
    console.log('[App] loadCharacter: success')
  } catch (error: any) {
    console.error('[App] loadCharacter: unexpected error', error)
    // If token is invalid (401), logout and return to login screen
    if (error?.statusCode === 401 || error?.response?.status === 401) {
      console.warn('[App] loadCharacter: token invalid, logging out')
      userStore.logout()
      characterStore.reset()
    }
  } finally {
    checkingCharacter.value = false
    console.log('[App] loadCharacter: done, checkingCharacter=false')
  }
}

function handleCharacterCreated() {
  // characterStore 已在 createCharacter 内更新，无需额外处理
}

// 登录状态变化时自动检查角色是否存在。
// 不能依赖 AuthView 触发的 emit('login-success')：userStore.login() 内部更新
// accessToken 后，isAuthenticated 变为 true 会让 App 立即把 AuthView 从 DOM 上卸载，
// 此时 handleLogin 函数体内 await 之后的 emit 调用已经发生在被卸载的组件实例上，
// 事件不会送达父组件，导致视图卡在“加载中”。用 watch 监听 store 状态本身则不受组件卸载影响。
watch(
  () => userStore.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      loadCharacter()
    } else {
      characterStore.reset()
    }
  },
  { immediate: true },
)
</script>

<template>
  <GameView v-if="view === 'game'" />
  <CharacterCreateView v-else-if="view === 'character-create'" @character-created="handleCharacterCreated" />
  <div v-else-if="view === 'loading'" class="loading-screen">加载中…</div>
  <AuthView v-else />
</template>

<style scoped>
.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #f5e6d3;
  background: #3e2723;
  font-size: 16px;
}
</style>
