<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import type { FriendDTO } from '../../../api/types'

const props = defineProps<{
  characterId: number
  nickname: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const friendStore = useFriendStore()
const sending = ref(false)
const requestMessage = ref('')
const sendResult = ref<{ text: string; type: 'success' | 'error' } | null>(null)

const isFriend = computed(() =>
  friendStore.friends.some((f) => f.characterId === props.characterId)
)

async function sendFriendRequest() {
  if (sending.value || isFriend.value) return
  sending.value = true
  sendResult.value = null
  try {
    await friendStore.sendFriendRequest(props.characterId, requestMessage.value || undefined)
    sendResult.value = { text: '好友请求已发送', type: 'success' }
  } catch (err: any) {
    sendResult.value = { text: err?.message ?? '发送失败', type: 'error' }
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="player-info-overlay" @click.self="emit('close')">
    <div class="player-info-card">
      <div class="card-head">
        <span class="nickname">{{ nickname }}</span>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <div class="card-body">
        <p class="meta">角色 ID: {{ characterId }}</p>

        <div v-if="isFriend" class="already-friend">
          ✓ 你们已经是好友
        </div>
        <template v-else>
          <input
            v-model="requestMessage"
            class="msg-input"
            placeholder="留言（可选，最多200字）"
            maxlength="200"
            :disabled="sending"
          />
          <button class="send-btn" :disabled="sending" @click="sendFriendRequest">
            {{ sending ? '发送中...' : '发送好友请求' }}
          </button>
        </template>

        <p v-if="sendResult" class="send-result" :class="`result-${sendResult.type}`">
          {{ sendResult.text }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-info-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.player-info-card {
  width: 280px;
  background: #1c242b;
  border: 1px solid #3c4b59;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.nickname {
  font-size: 16px;
  font-weight: bold;
}
.close-btn {
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: #9fb2c0;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.close-btn:hover {
  color: #fff;
}
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta {
  margin: 0;
  font-size: 11px;
  color: #6b7a87;
}
.already-friend {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: #6ee7a0;
  background: #2a4a3a;
  border-radius: 6px;
}
.msg-input {
  padding: 8px;
  background: #232d36;
  border: 1px solid #3c4b59;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
}
.msg-input:focus {
  outline: none;
  border-color: #4a9eff;
}
.send-btn {
  padding: 8px;
  background: #2a4a6a;
  color: #fff;
  border: 1px solid #3a6a8a;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.send-btn:hover {
  background: #3a5a7a;
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.send-result {
  margin: 0;
  font-size: 12px;
  text-align: center;
}
.result-success {
  color: #6ee7a0;
}
.result-error {
  color: #e08080;
}
</style>