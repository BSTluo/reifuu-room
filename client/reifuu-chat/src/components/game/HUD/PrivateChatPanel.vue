<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { useFriendStore } from '../../../stores/friend'
import { useCharacterStore } from '../../../stores/character'
import { socketClient } from '../../../game/network/SocketClient'

const friendStore = useFriendStore()
const characterStore = useCharacterStore()

const draft = ref('')
const messagesEl = ref<HTMLElement | null>(null)

const myCharacterId = computed(() => Number(characterStore.characterId ?? 0))
const messages = computed(() => friendStore.privateMessages[friendStore.privateChatFriendId ?? 0] ?? [])

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function send() {
  const content = draft.value
  if (!content.trim()) return
  if (!friendStore.privateChatFriendId) return
  const socket = socketClient.instance
  if (!socket) {
    window.alert('连接未就绪，请稍后再试')
    return
  }
  socket.emit('friend:send-message', {
    toCharacterId: friendStore.privateChatFriendId,
    content: content.trim(),
  })
  draft.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function close() {
  friendStore.closePrivateChat()
}

// 收到新消息或打开会话时滚动到底部
watch(
  () => messages.value.length,
  () => scrollToBottom()
)
watch(
  () => friendStore.privateChatFriendId,
  async (id) => {
    if (id) {
      await friendStore.fetchPrivateMessages(id)
      await friendStore.markConversationRead(id)
      scrollToBottom()
    }
  },
  { immediate: true }
)

onMounted(() => {
  EventBus.on('friend:message-received', onMessageReceived)
  EventBus.on('friend:message-sent', onMessageSent)
  scrollToBottom()
})

onBeforeUnmount(() => {
  EventBus.off('friend:message-received', onMessageReceived)
  EventBus.off('friend:message-sent', onMessageSent)
})

function onMessageReceived(payload: { message: any }) {
  friendStore.appendPrivateMessage(payload.message)
}

function onMessageSent(payload: { message: any }) {
  friendStore.appendPrivateMessage(payload.message)
}
</script>

<template>
  <div v-if="friendStore.privateChatFriendId" class="private-chat-panel">
    <div class="chat-header">
      <span class="friend-name">与 {{ friendStore.privateChatFriendNickname }} 私聊</span>
      <button class="close-btn" @click="close">关闭</button>
    </div>

    <div ref="messagesEl" class="chat-messages">
      <p v-if="messages.length === 0" class="empty">还没有消息，打个招呼吧</p>
      <div
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="{ mine: message.senderId === myCharacterId }"
      >
        <span class="nickname">{{ message.senderNickname }}</span>
        <span class="content">{{ message.content?.text }}</span>
        <span class="time">{{ formatTime(message.createdAt) }}</span>
      </div>
    </div>

    <div class="chat-input">
      <input
        v-model="draft"
        type="text"
        placeholder="输入消息，回车发送…"
        maxlength="200"
        @keydown="onKeydown"
      />
      <button @click="send">发送</button>
    </div>
  </div>
</template>

<style scoped>
.private-chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1a222a;
  border: 1px solid #2e3a44;
  border-radius: 8px;
  padding: 10px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.friend-name {
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

.chat-messages {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  padding: 5px 10px;
  align-self: flex-start;
}

.message.mine {
  align-self: flex-end;
  background: rgba(106, 171, 133, 0.22);
}

.message .nickname {
  font-size: 11px;
  color: #9ecbff;
  margin-bottom: 2px;
}

.message.mine .nickname {
  color: #a7e3bd;
}

.message .content {
  font-size: 13px;
  color: #e6edf3;
  white-space: pre-wrap;
  word-break: break-word;
}

.message .time {
  font-size: 10px;
  color: #6b7a87;
  margin-top: 2px;
  align-self: flex-end;
}

.empty {
  text-align: center;
  color: #777;
  font-size: 12px;
  margin-top: 20px;
}

.chat-input {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.chat-input input {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #555;
  border-radius: 4px;
  color: #e6edf3;
  padding: 6px 10px;
  font-size: 13px;
}

.chat-input input:focus {
  outline: none;
  border-color: #6aab85;
}

.chat-input button {
  background: #6aab85;
  color: #16321f;
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
}

.chat-input button:hover {
  background: #7fc39b;
}
</style>