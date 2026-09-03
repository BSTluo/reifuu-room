<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ApiRequestError } from '../api/http'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()

const mode = ref<'login' | 'register'>('login')
const submitting = ref(false)
const errorMessage = ref('')

const loginForm = reactive({
  usernameOrEmail: '',
  password: '',
})

const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function switchMode(next: 'login' | 'register') {
  mode.value = next
  errorMessage.value = ''
}

function validateLogin(): string | null {
  if (!loginForm.usernameOrEmail.trim()) return '请输入用户名或邮箱'
  if (!loginForm.password) return '请输入密码'
  return null
}

function validateRegister(): string | null {
  if (!registerForm.username.trim()) return '请输入用户名'
  if (!EMAIL_PATTERN.test(registerForm.email)) return '邮箱格式不正确'
  if (registerForm.password.length < 8) return '密码长度至少8位'
  if (registerForm.password !== registerForm.confirmPassword) return '两次输入的密码不一致'
  return null
}

async function handleLogin() {
  const validationError = validateLogin()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await userStore.login({
      usernameOrEmail: loginForm.usernameOrEmail.trim(),
      password: loginForm.password,
    })
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

async function handleRegister() {
  const validationError = validateRegister()
  if (validationError) {
    errorMessage.value = validationError
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await userStore.register({
      username: registerForm.username.trim(),
      email: registerForm.email.trim(),
      password: registerForm.password,
    })
    // 注册成功后自动登录
    await userStore.login({
      usernameOrEmail: registerForm.username.trim(),
      password: registerForm.password,
    })
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-card">
      <h1 class="auth-title">Reifuu Chat</h1>

      <div class="auth-tabs">
        <button
          type="button"
          class="tab-button"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          class="tab-button"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="handleLogin">
        <input
          v-model="loginForm.usernameOrEmail"
          type="text"
          placeholder="用户名或邮箱"
          autocomplete="username"
        />
        <input
          v-model="loginForm.password"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
        />
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        <button type="submit" class="primary-button" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="handleRegister">
        <input v-model="registerForm.username" type="text" placeholder="用户名" autocomplete="username" />
        <input v-model="registerForm.email" type="email" placeholder="邮箱" autocomplete="email" />
        <input
          v-model="registerForm.password"
          type="password"
          placeholder="密码（至少8位）"
          autocomplete="new-password"
        />
        <input
          v-model="registerForm.confirmPassword"
          type="password"
          placeholder="确认密码"
          autocomplete="new-password"
        />
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        <button type="submit" class="primary-button" :disabled="submitting">
          {{ submitting ? '注册中…' : '注册' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #3e2723, #5c8b6f 40%, #a0522d 70%, #6eb5d1);
}

.auth-card {
  width: 320px;
  padding: 32px 28px;
  background: #3e2723;
  border: 3px solid #ffb300;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-title {
  margin: 0;
  text-align: center;
  color: #ffb300;
  font-size: 24px;
  letter-spacing: 1px;
}

.auth-tabs {
  display: flex;
  gap: 8px;
}

.tab-button {
  flex: 1;
  padding: 8px 0;
  background: #6d4c41;
  color: #f5e6d3;
  border: 2px solid #2c1810;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.tab-button.active {
  background: #ffb300;
  color: #2c1810;
  border-color: #ffb300;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-form input {
  padding: 10px 12px;
  background: #f5e6d3;
  color: #2c1810;
  border: 2px solid #2c1810;
  border-radius: 4px;
  font-size: 14px;
}

.auth-form input::placeholder {
  color: #6d4c41;
}

.primary-button {
  padding: 10px 0;
  background: #ffb300;
  color: #2c1810;
  border: none;
  border-radius: 4px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 3px 0 #a37000;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: #ffcdd2;
  background: rgba(211, 47, 47, 0.35);
  border: 1px solid #d32f2f;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
}
</style>
