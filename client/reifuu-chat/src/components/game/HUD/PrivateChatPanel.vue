<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useFriendStore } from '../../../stores/friend'

const props = defineProps<{
  friendCharacterId: string
  friendNickname: string
}>()

const emit = defineEmits<{ close: [] }>()

const friendStore = useFriendStore()
const inputText = ref('')
const messagesEl = ref<HTMLDivElement | null>(null)

const messages = computed(() => friendStore.chatMessages[props.friendCharacterId] ?? [])

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

function sendMessage() {
  const content = inputText.value.trim()
  if (!content) return
  friendStore.sendChatMessage(props.friendCharacterId, content)
  inputText.value = ''
  scrollToBottom()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

onMounted(() => {
  friendStore.openChat(props.friendCharacterId)
  scrollToBottom()
})

watch(
  () => messages.value.length,
  () => scrollToBottom()
)
</script>

<template>
  <div class="private-chat">
    <div class="chat-header">
      <span class="chat-title">私聊 — {{ props.friendNickname }}</span>
      <button class="btn-close" title="关闭" @click="emit('close')">✕</button>
    </div>
    <div ref="messagesEl" class="chat-messages">
      <p v-if="!messages.length" class="empty-hint">还没有消息，发一条打个招呼吧！</p>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="msg-row"
        :class="{ mine: msg.fromCharacterId === 'self' }"
      >
        <span class="msg-bubble">{{ msg.content }}</span>
        <span class="msg-time">{{ new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
      </div>
    </div>
    <div class="chat-input-row">
      <input
        v-model="inputText"
        class="chat-input"
        type="text"
        placeholder="输入消息，Enter 发送"
        maxlength="200"
        @keydown="handleKeydown"
      />
      <button class="btn-send" :disabled="!inputText.trim()" @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<style scoped>
.private-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 300px;
}
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.chat-title {
  font-size: 14px;
  font-weight: bold;
}
.btn-close {
  padding: 2px 8px;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #90a4ae;
  border-radius: 4px;
  cursor: pointer;
}
.btn-close:hover {
  color: #ff8a80;
  border-color: #ff8a80;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.empty-hint {
  font-size: 12px;
  color: #90a4ae;
  text-align: center;
  margin: auto 0;
}
.msg-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.msg-row.mine {
  align-items: flex-end;
}
.msg-bubble {
  max-width: 75%;
  padding: 5px 10px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  word-break: break-word;
}
.msg-row.mine .msg-bubble {
  background: rgba(77, 208, 225, 0.2);
}
.msg-time {
  font-size: 10px;
  color: #78909c;
}
.chat-input-row {
  display: flex;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.chat-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.2);
  color: #e0e0e0;
  border-radius: 6px;
  outline: none;
}
.chat-input:focus {
  border-color: #4dd0e1;
}
.btn-send {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid #4dd0e1;
  background: rgba(77, 208, 225, 0.15);
  color: #4dd0e1;
  border-radius: 6px;
  cursor: pointer;
}
.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>