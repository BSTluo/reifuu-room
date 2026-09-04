<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import { EventBus } from '../../../game/EventBus'
import type { MailboxMessageDTO, MailboxMessageType } from '../../../api/types'

const friendStore = useFriendStore()
const activeTab = ref<MailboxMessageType | 'all'>('all')
const responding = ref<Set<number>>(new Set())

const filteredMessages = computed(() => {
  if (activeTab.value === 'all') return friendStore.mailbox
  return friendStore.mailbox.filter((m) => m.type === activeTab.value)
})

const pendingFromMailbox = computed(() => {
  return friendStore.mailbox.filter((m) => m.type === 'friend_request' && !m.isRead)
})

function formatTime(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

function typeLabel(type: MailboxMessageType): string {
  if (type === 'friend_request') return '好友请求'
  if (type === 'system') return '系统'
  return '消息'
}

async function acceptRequest(msg: MailboxMessageDTO) {
  const requestId = msg.content?.requestId
  if (!requestId || responding.value.has(msg.id)) return
  responding.value.add(msg.id)
  try {
    await friendStore.respondToRequest(Number(requestId), true)
    await friendStore.markMessageRead(msg.id)
    await friendStore.fetchMailbox()
  } catch (err: any) {
    window.alert(err?.message ?? '接受好友请求失败')
  } finally {
    responding.value.delete(msg.id)
  }
}

async function rejectRequest(msg: MailboxMessageDTO) {
  const requestId = msg.content?.requestId
  if (!requestId || responding.value.has(msg.id)) return
  responding.value.add(msg.id)
  try {
    await friendStore.respondToRequest(Number(requestId), false)
    await friendStore.markMessageRead(msg.id)
    await friendStore.fetchMailbox()
  } catch (err: any) {
    window.alert(err?.message ?? '拒绝好友请求失败')
  } finally {
    responding.value.delete(msg.id)
  }
}

async function markRead(msg: MailboxMessageDTO) {
  if (msg.isRead) return
  await friendStore.markMessageRead(msg.id)
}

function onNewRequest() {
  friendStore.fetchMailbox()
  friendStore.fetchUnreadCount()
}

onMounted(() => {
  EventBus.on('friend:new-request', onNewRequest)
  friendStore.fetchMailbox()
  friendStore.fetchUnreadCount()
})

onBeforeUnmount(() => {
  EventBus.off('friend:new-request', onNewRequest)
})
</script>

<template>
  <div class="mailbox-panel">
    <h3>信箱</h3>
    <div class="tabs">
      <button :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">全部</button>
      <button :class="{ active: activeTab === 'friend_request' }" @click="activeTab = 'friend_request'">好友请求</button>
      <button :class="{ active: activeTab === 'system' }" @click="activeTab = 'system'">系统</button>
    </div>

    <div v-if="filteredMessages.length" class="message-list">
      <div
        v-for="msg in filteredMessages"
        :key="msg.id"
        class="message-item"
        :class="{ unread: !msg.isRead }"
        @click="markRead(msg)"
      >
        <div class="msg-head">
          <span class="msg-type" :class="`type-${msg.type}`">{{ typeLabel(msg.type) }}</span>
          <span v-if="msg.senderNickname" class="msg-sender">{{ msg.senderNickname }}</span>
          <span class="msg-time">{{ formatTime(msg.createdAt) }}</span>
        </div>
        <div class="msg-body">
          <template v-if="msg.type === 'friend_request'">
            <p>{{ msg.content?.fromNickname ?? '未知' }} 想加你为好友</p>
            <p v-if="msg.content?.message" class="msg-text">"{{ msg.content.message }}"</p>
            <div v-if="!msg.isRead" class="msg-actions">
              <button
                class="accept-btn"
                :disabled="responding.has(msg.id)"
                @click.stop="acceptRequest(msg)"
              >接受</button>
              <button
                class="reject-btn"
                :disabled="responding.has(msg.id)"
                @click.stop="rejectRequest(msg)"
              >拒绝</button>
            </div>
          </template>
          <template v-else>
            <p>{{ msg.content?.text ?? JSON.stringify(msg.content) }}</p>
          </template>
        </div>
      </div>
    </div>
    <p v-else class="empty">信箱为空</p>
  </div>
</template>

<style scoped>
.mailbox-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mailbox-panel h3 {
  margin: 0;
  font-size: 14px;
}
.tabs {
  display: flex;
  gap: 4px;
}
.tabs button {
  flex: 1;
  padding: 4px;
  background: #232d36;
  color: #9fb2c0;
  border: 1px solid #2e3a44;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.tabs button.active {
  background: #2a3540;
  color: #fff;
  border-color: #4a5a6a;
}
.message-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}
.message-item {
  padding: 8px;
  background: #232d36;
  border: 1px solid #2e3a44;
  border-radius: 6px;
  cursor: pointer;
}
.message-item.unread {
  border-left: 3px solid #4a9eff;
}
.msg-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.msg-type {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}
.type-friend_request {
  background: #2a4a3a;
  color: #6ee7a0;
}
.type-system {
  background: #3a3a2a;
  color: #e0d080;
}
.type-chat {
  background: #2a3a4a;
  color: #80b0e0;
}
.msg-sender {
  font-size: 12px;
  font-weight: bold;
}
.msg-time {
  margin-left: auto;
  font-size: 10px;
  color: #6b7a87;
}
.msg-body p {
  margin: 0 0 2px;
  font-size: 12px;
}
.msg-text {
  color: #9fb2c0;
  font-style: italic;
}
.msg-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.accept-btn {
  padding: 4px 12px;
  background: #2a4a3a;
  color: #6ee7a0;
  border: 1px solid #3a6a4a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.accept-btn:hover {
  background: #3a5a4a;
}
.reject-btn {
  padding: 4px 12px;
  background: #3c2a2a;
  color: #e0a0a0;
  border: 1px solid #5c3a3a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.reject-btn:hover {
  background: #4c3535;
}
.accept-btn:disabled, .reject-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: #9fb2c0;
}
</style>