<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import { EventBus } from '../../../game/EventBus'

const props = defineProps<{
  characterId: string
  nickname: string
}>()

const emit = defineEmits<{
  close: []
}>()

const friendStore = useFriendStore()
const message = ref<string | null>(null)
const sending = ref(false)

function sendFriendRequest() {
  if (sending.value) return
  sending.value = true
  message.value = null
  friendStore.sendRequest(props.characterId)
  // 收到 friend:request-sent / socket:error 事件后更新 message
}

function onSent(payload: { toCharacterId: string; toNickname: string }) {
  if (payload.toCharacterId === props.characterId) {
    message.value = `好友申请已发送给 ${payload.toNickname}`
    sending.value = false
  }
}

function onError(payload: { message: string }) {
  message.value = payload.message
  sending.value = false
}

EventBus.on('friend:request-sent', onSent)
EventBus.on('socket:error', onError)

onBeforeUnmount(() => {
  EventBus.off('friend:request-sent', onSent)
  EventBus.off('socket:error', onError)
})
</script>

<template>
  <div class="player-info-card">
    <div class="card-header">
      <h3>{{ nickname }}</h3>
      <button class="btn-close" @click="emit('close')">✕</button>
    </div>
    <p class="card-id">ID: {{ characterId }}</p>
    <p v-if="message" class="card-message">{{ message }}</p>
    <div class="card-actions">
      <button class="btn-friend" :disabled="sending" @click="sendFriendRequest">
        {{ sending ? '发送中…' : '发送好友申请' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-info-card {
  background: #1c242b;
  border: 1px solid #2e3a44;
  border-radius: 12px;
  padding: 20px;
  min-width: 260px;
  max-width: 320px;
  color: #fff;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card-header h3 {
  margin: 0;
  font-size: 18px;
}
.btn-close {
  background: transparent;
  border: none;
  color: #90a4ae;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}
.btn-close:hover {
  color: #ff8a80;
}
.card-id {
  font-size: 12px;
  color: #90a4ae;
  margin: 0 0 12px;
}
.card-message {
  font-size: 13px;
  color: #4dd0e1;
  margin: 0 0 12px;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.btn-friend {
  flex: 1;
  padding: 10px;
  background: rgba(77, 208, 225, 0.15);
  border: 1px solid #4dd0e1;
  color: #4dd0e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.btn-friend:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>