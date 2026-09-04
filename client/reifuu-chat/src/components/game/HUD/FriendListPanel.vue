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

function teleport(friendCharacterId: string, nickname: string) {
  friendStore.teleportToFriend(friendCharacterId)
  showToast(`正在传送到 ${nickname} 的位置…`, 'info')
}

function removeFriend(friendCharacterId: string, nickname: string) {
  if (!confirm(`确定删除好友 ${nickname} 吗？`)) return
  friendStore.removeFriend(friendCharacterId)
}

function onTeleportConfirmed(payload: { nickname: string }) {
  showToast(`已传送到 ${payload.nickname} 身边！`, 'success')
}

function onFriendAccepted(payload: { friendNickname: string }) {
  showToast(`${payload.friendNickname} 接受了你的好友申请！`, 'success')
  friendStore.requestState()
}

function onFriendRemoved() {
  showToast('好友已删除', 'info')
}

function onError(payload: { message: string }) {
  showToast(payload.message, 'error')
}

onMounted(() => {
  EventBus.on('friend:teleport-confirmed', onTeleportConfirmed)
  EventBus.on('friend:accepted', onFriendAccepted)
  EventBus.on('friend:removed', onFriendRemoved)
  EventBus.on('socket:error', onError)
  friendStore.requestState()
})

onBeforeUnmount(() => {
  EventBus.off('friend:teleport-confirmed', onTeleportConfirmed)
  EventBus.off('friend:accepted', onFriendAccepted)
  EventBus.off('friend:removed', onFriendRemoved)
  EventBus.off('socket:error', onError)
})
</script>

<template>
  <div class="friend-panel">
    <div class="friend-header">
      <h3>好友 ({{ friendStore.friends.length }})</h3>
    </div>
    <p v-if="message" class="friend-msg" :class="`msg-${message.type}`">{{ message.text }}</p>
    <ul v-if="friendStore.friends.length" class="friend-list">
      <li v-for="friend in friendStore.friends" :key="friend.characterId" class="friend-item">
        <span class="status-dot" :class="{ online: friend.isOnline }"></span>
        <div class="friend-info">
          <span class="friend-name">{{ friend.nickname }}</span>
          <span class="friend-location">{{ friend.chunkId }}</span>
        </div>
        <div class="friend-actions">
          <button
            class="btn-teleport"
            :disabled="!friend.isOnline"
            :title="friend.isOnline ? '传送到好友身边' : '好友不在线'"
            @click="teleport(friend.characterId, friend.nickname)"
          >
            传送
          </button>
          <button class="btn-remove" title="删除好友" @click="removeFriend(friend.characterId, friend.nickname)">
            ✕
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">还没有好友，点击地图上的玩家发送申请吧</p>
  </div>
</template>

<style scoped>
.friend-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.friend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.friend-header h3 {
  margin: 0;
  font-size: 15px;
}
.friend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.friend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #78909c;
  flex-shrink: 0;
}
.status-dot.online {
  background: #66bb6a;
  box-shadow: 0 0 6px rgba(102, 187, 106, 0.8);
}
.friend-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.friend-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.friend-location {
  font-size: 11px;
  color: #90a4ae;
}
.friend-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.btn-teleport {
  padding: 3px 8px;
  font-size: 12px;
  border: 1px solid #4dd0e1;
  background: rgba(77, 208, 225, 0.15);
  color: #4dd0e1;
  border-radius: 4px;
  cursor: pointer;
}
.btn-teleport:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.btn-remove {
  padding: 3px 6px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #90a4ae;
  border-radius: 4px;
  cursor: pointer;
}
.btn-remove:hover {
  color: #ff8a80;
  border-color: #ff8a80;
}
.empty {
  font-size: 12px;
  color: #90a4ae;
}
.friend-msg {
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