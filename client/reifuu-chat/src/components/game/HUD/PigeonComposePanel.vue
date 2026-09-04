<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import type { ApiRequestError } from '../../../api/http'

const friendStore = useFriendStore()

const draft = ref('')
const sending = ref(false)
const result = ref<{ kind: 'instant' | 'delayed' | 'error'; message: string } | null>(null)

const targetNickname = computed(() => friendStore.pigeonComposeTargetNickname ?? '')
const targetId = computed(() => friendStore.pigeonComposeTargetId)

const remaining = computed(() => 200 - draft.value.length)

function formatDelay(seconds: number): string {
  if (seconds <= 0) return '即时送达'
  if (seconds < 60) return `约 ${seconds} 秒后送达`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `约 ${minutes} 分钟后送达`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `约 ${hours} 小时 ${mins} 分钟后送达`
}

async function send() {
  const content = draft.value.trim()
  if (!content) return
  if (!targetId.value) return
  sending.value = true
  result.value = null
  try {
    const pigeon = await friendStore.sendPigeonMessage(targetId.value, content)
    if (pigeon.deliveredAt) {
      result.value = { kind: 'instant', message: '飞鸽传书已即时送达' }
    } else {
      result.value = {
        kind: 'delayed',
        message: `飞鸽传书已发出，${formatDelay(pigeon.calculatedDelay)}`,
      }
    }
    draft.value = ''
  } catch (err) {
    const message = (err as ApiRequestError)?.message ?? '发送失败，请稍后再试'
    result.value = { kind: 'error', message }
  } finally {
    sending.value = false
  }
}

function close() {
  friendStore.closePigeonCompose()
}
</script>

<template>
  <div v-if="friendStore.pigeonComposeTargetId" class="pigeon-compose-panel">
    <div class="compose-header">
      <span class="target-name">飞鸽传书给 {{ targetNickname }}</span>
      <button class="close-btn" @click="close">关闭</button>
    </div>

    <p class="hint">飞鸽传书会跨越距离送达，距离越远耗时越长（同区块即时送达）。</p>

    <textarea
      v-model="draft"
      class="compose-input"
      placeholder="写下想传递的话…（最多 200 字）"
      maxlength="200"
      rows="4"
    ></textarea>
    <div class="compose-footer">
      <span class="char-count">{{ remaining }} 字</span>
      <button class="send-btn" :disabled="sending || !draft.trim()" @click="send">
        {{ sending ? '发送中…' : '发送' }}
      </button>
    </div>

    <p v-if="result" class="result" :class="`result-${result.kind}`">{{ result.message }}</p>
  </div>
</template>

<style scoped>
.pigeon-compose-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #1a222a;
  border: 1px solid #2e3a44;
  border-radius: 8px;
  padding: 10px;
}

.compose-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.target-name {
  font-weight: bold;
  font-size: 14px;
  color: #e6edf3;
}

.close-btn {
  background: #3c3c3c;
  color: #ccc;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
}

.close-btn:hover {
  background: #4c4c4c;
}

.hint {
  margin: 0;
  font-size: 11px;
  color: #9fb2c0;
}

.compose-input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #555;
  border-radius: 4px;
  color: #e6edf3;
  padding: 6px 10px;
  font-size: 13px;
  resize: vertical;
  min-height: 80px;
}

.compose-input:focus {
  outline: none;
  border-color: #c0a0e0;
}

.compose-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.char-count {
  font-size: 11px;
  color: #6b7a87;
}

.send-btn {
  background: #6aab85;
  color: #16321f;
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
}

.send-btn:hover {
  background: #7fc39b;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result {
  margin: 0;
  font-size: 12px;
}

.result-instant {
  color: #6ee7a0;
}

.result-delayed {
  color: #c0a0e0;
}

.result-error {
  color: #e0a0a0;
}
</style>
