<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { usePigeonStore } from '../../../stores/pigeon'
import { EventBus } from '../../../game/EventBus'

const pigeonStore = usePigeonStore()

const activeTab = ref<'inbox' | 'sent'>('inbox')

const sendTargetId = ref('')
const sendContent = ref('')
const sending = ref(false)

const message = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  message.value = { text, type }
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
  }, 3000)
}

const charCount = computed(() => sendContent.value.length)
const maxChars = 200

const inboxMessages = computed(() => pigeonStore.sortedInbox)
const sentMessages = computed(() => pigeonStore.sortedSent)

function statusLabel(status: string): string {
  switch (status) {
    case 'sending':
      return '传递中'
    case 'delivered':
      return '已送达'
    case 'read':
      return '已读'
    default:
      return status
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function handleSend() {
  const target = sendTargetId.value.trim()
  const content = sendContent.value.trim()
  if (!target) {
    showToast('请输入收件人角色ID', 'warn')
    return
  }
  if (!content) {
    showToast('请输入信件内容', 'warn')
    return
  }
  if (content.length > maxChars) {
    showToast(`内容不能超过${maxChars}字`, 'warn')
    return
  }

  sending.value = true
  pigeonStore.send(target, content)
  showToast('飞鸽已放飞！', 'success')
  sendContent.value = ''
  sending.value = false
}

function handleRead(messageId: number) {
  pigeonStore.markRead(messageId)
}

function handleReply(fromCharacterId: string, fromNickname: string) {
  sendTargetId.value = fromCharacterId
  activeTab.value = 'sent'
  showToast(`回复 ${fromNickname}`, 'info')
}

function onPigeonSent(payload: { toNickname: string; delayMs: number; delivered: boolean }) {
  if (payload.delivered) {
    showToast(`信件已即时送达 ${payload.toNickname}`, 'success')
  } else {
    const minutes = Math.ceil(payload.delayMs / 60000)
    showToast(`信件已放飞，预计 ${minutes} 分钟后送达 ${payload.toNickname}`, 'info')
  }
}

function onPigeonDelivered(payload: { fromNickname: string }) {
  showToast(`收到来自 ${payload.fromNickname} 的飞鸽传信！`, 'success')
}

function onError(payload: { message: string }) {
  showToast(payload.message, 'error')
}

onMounted(() => {
  EventBus.on('pigeon:sent', onPigeonSent)
  EventBus.on('pigeon:delivered', onPigeonDelivered)
  EventBus.on('socket:error', onError)
  pigeonStore.requestState()
})

onBeforeUnmount(() => {
  EventBus.off('pigeon:sent', onPigeonSent)
  EventBus.off('pigeon:delivered', onPigeonDelivered)
  EventBus.off('socket:error', onError)
})
</script>

<template>
  <div class="pigeon-panel">
    <div class="pigeon-header">
      <h3>🕊️ 飞鸽传书</h3>
      <span v-if="pigeonStore.unreadCount > 0" class="unread-badge">{{ pigeonStore.unreadCount }}</span>
    </div>

    <p v-if="message" class="pigeon-msg" :class="`msg-${message.type}`">{{ message.text }}</p>

    <div class="tabs">
      <button class="tab" :class="{ active: activeTab === 'inbox' }" @click="activeTab = 'inbox'">
        收件 ({{ inboxMessages.length }})
      </button>
      <button class="tab" :class="{ active: activeTab === 'sent' }" @click="activeTab = 'sent'">
        已发送 ({{ sentMessages.length }})
      </button>
    </div>

    <div class="tab-content">
      <ul v-if="activeTab === 'inbox'" class="msg-list">
        <li
          v-for="msg in inboxMessages"
          :key="msg.id"
          class="msg-item"
          :class="{ unread: msg.status === 'delivered' }"
          @click="handleRead(msg.id)"
        >
          <div class="msg-row">
            <span class="msg-from">{{ msg.fromNickname }}</span>
            <span class="msg-status" :class="`status-${msg.status}`">{{ statusLabel(msg.status) }}</span>
          </div>
          <div class="msg-content">{{ msg.content }}</div>
          <div class="msg-row">
            <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
            <button class="btn-reply" @click.stop="handleReply(msg.fromCharacterId, msg.fromNickname)">
              回复
            </button>
          </div>
        </li>
      </ul>
      <p v-if="activeTab === 'inbox' && !inboxMessages.length" class="empty">收件箱空空如也</p>

      <ul v-if="activeTab === 'sent'" class="msg-list">
        <li v-for="msg in sentMessages" :key="msg.id" class="msg-item">
          <div class="msg-row">
            <span class="msg-to">→ {{ msg.toNickname }}</span>
            <span class="msg-status" :class="`status-${msg.status}`">{{ statusLabel(msg.status) }}</span>
          </div>
          <div class="msg-content">{{ msg.content }}</div>
          <div class="msg-row">
            <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
          </div>
        </li>
      </ul>
      <p v-if="activeTab === 'sent' && !sentMessages.length" class="empty">还没有发送过信件</p>
    </div>

    <div class="send-form">
      <input
        v-model="sendTargetId"
        class="input-target"
        placeholder="收件人角色ID"
        type="text"
      />
      <textarea
        v-model="sendContent"
        class="input-content"
        placeholder="写信…"
        :maxlength="maxChars"
        rows="2"
      />
      <div class="send-row">
        <span class="char-count" :class="{ over: charCount > maxChars }">{{ charCount }} / {{ maxChars }}</span>
        <button class="btn-send" :disabled="sending" @click="handleSend">🕊️ 放飞</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pigeon-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pigeon-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pigeon-header h3 {
  margin: 0;
  font-size: 15px;
}
.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: bold;
  background: #ef5350;
  color: #fff;
  border-radius: 9px;
}
.tabs {
  display: flex;
  gap: 4px;
}
.tab {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #90a4ae;
  border-radius: 4px;
  cursor: pointer;
}
.tab.active {
  border-color: #4dd0e1;
  background: rgba(77, 208, 225, 0.12);
  color: #4dd0e1;
}
.tab-content {
  max-height: 220px;
  overflow-y: auto;
}
.msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg-item {
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
}
.msg-item.unread {
  border-color: rgba(77, 208, 225, 0.5);
  background: rgba(77, 208, 225, 0.08);
}
.msg-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.msg-from {
  font-size: 13px;
  font-weight: bold;
  color: #e0e0e0;
}
.msg-to {
  font-size: 13px;
  color: #b0bec5;
}
.msg-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.status-sending {
  color: #ffd54f;
  background: rgba(255, 213, 79, 0.15);
}
.status-delivered {
  color: #4dd0e1;
  background: rgba(77, 208, 225, 0.15);
}
.status-read {
  color: #a5d6a7;
  background: rgba(165, 214, 167, 0.15);
}
.msg-content {
  font-size: 12px;
  color: #cfd8dc;
  margin: 4px 0;
  word-break: break-word;
}
.msg-time {
  font-size: 11px;
  color: #78909c;
}
.btn-reply {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid rgba(77, 208, 225, 0.5);
  background: rgba(77, 208, 225, 0.1);
  color: #4dd0e1;
  border-radius: 4px;
  cursor: pointer;
}
.empty {
  font-size: 12px;
  color: #90a4ae;
  text-align: center;
  padding: 16px 0;
}
.send-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.input-target {
  padding: 4px 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #e0e0e0;
}
.input-content {
  padding: 4px 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #e0e0e0;
  resize: none;
  font-family: inherit;
}
.send-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.char-count {
  font-size: 11px;
  color: #78909c;
}
.char-count.over {
  color: #ff8a80;
}
.btn-send {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #4dd0e1;
  background: rgba(77, 208, 225, 0.15);
  color: #4dd0e1;
  border-radius: 4px;
  cursor: pointer;
}
.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pigeon-msg {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  margin: 0;
}
.msg-info {
  color: #4dd0e1;
}
.msg-warn {
  color: #ffd54f;
}
.msg-error {
  color: #ff8a80;
}
.msg-success {
  color: #a5d6a7;
}
</style>