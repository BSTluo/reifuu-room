<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import { EventBus } from '../../../game/EventBus'

const friendStore = useFriendStore()

const message = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  message.value = { text, type }
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
  }, 3000)
}

function accept(requestId: number, nickname: string) {
  friendStore.acceptRequest(requestId)
  showToast(`已接受 ${nickname} 的好友申请`, 'success')
}

function reject(requestId: number) {
  friendStore.rejectRequest(requestId)
  showToast('已拒绝该申请', 'info')
}

function onRequestReceived(payload: { fromNickname: string }) {
  showToast(`${payload.fromNickname} 向你发送了好友申请！`, 'success')
}

onMounted(() => {
  EventBus.on('friend:request-received', onRequestReceived)
  friendStore.requestState()
})

onBeforeUnmount(() => {
  EventBus.off('friend:request-received', onRequestReceived)
})
</script>

<template>
  <div class="mailbox-panel">
    <div class="mailbox-header">
      <h3>信箱 · 好友申请</h3>
      <span v-if="friendStore.requests.length" class="badge">{{ friendStore.requests.length }}</span>
    </div>
    <p v-if="message" class="mailbox-msg" :class="`msg-${message.type}`">{{ message.text }}</p>
    <ul v-if="friendStore.requests.length" class="request-list">
      <li v-for="req in friendStore.requests" :key="req.id" class="request-item">
        <div class="request-info">
          <span class="request-name">{{ req.fromNickname }}</span>
          <span class="request-time">{{ req.createdAt }}</span>
        </div>
        <div class="request-actions">
          <button class="btn-accept" @click="accept(req.id, req.fromNickname)">接受</button>
          <button class="btn-reject" @click="reject(req.id)">拒绝</button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">信箱空空如也</p>
  </div>
</template>

<style scoped>
.mailbox-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mailbox-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mailbox-header h3 {
  margin: 0;
  font-size: 15px;
}
.badge {
  background: #ef5350;
  color: #fff;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  padding: 0 4px;
}
.request-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}
.request-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.request-name {
  font-size: 13px;
}
.request-time {
  font-size: 11px;
  color: #90a4ae;
}
.request-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.btn-accept {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid #66bb6a;
  background: rgba(102, 187, 106, 0.15);
  color: #66bb6a;
  border-radius: 4px;
  cursor: pointer;
}
.btn-reject {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #90a4ae;
  border-radius: 4px;
  cursor: pointer;
}
.btn-reject:hover {
  color: #ff8a80;
  border-color: #ff8a80;
}
.empty {
  font-size: 12px;
  color: #90a4ae;
}
.mailbox-msg {
  font-size: 12px;
  padding: 4px 8px;
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