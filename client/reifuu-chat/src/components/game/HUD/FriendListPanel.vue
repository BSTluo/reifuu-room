<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useFriendStore } from '../../../stores/friend'
import { EventBus } from '../../../game/EventBus'
import type { FriendDTO } from '../../../api/types'

const friendStore = useFriendStore()

const removing = ref<number | null>(null)
const removingIds = ref(new Set<number>())
const teleportingIds = ref(new Set<number>())

const onlineCount = computed(() => friendStore.friends.filter((f) => f.isOnline).length)

function formatSince(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function removeFriend(friend: FriendDTO) {
  if (removingIds.value.has(friend.characterId)) return
  if (!window.confirm(`确定删除好友 ${friend.nickname} 吗？`)) return
  removingIds.value.add(friend.characterId)
  try {
    await friendStore.removeFriend(friend.characterId)
  } catch (err: any) {
    window.alert(err?.message ?? '删除好友失败')
  } finally {
    removingIds.value.delete(friend.characterId)
  }
}

function teleportToFriend(friend: FriendDTO) {
  if (teleportingIds.value.has(friend.characterId)) return
  if (!friend.isOnline) {
    window.alert('好友不在线，无法传送')
    return
  }
  teleportingIds.value.add(friend.characterId)
  EventBus.emit('ui:teleport-friend', { characterId: friend.characterId })
  // 防止重复点击；实际状态由 friend:teleport-confirmed / error 事件驱动
  setTimeout(() => teleportingIds.value.delete(friend.characterId), 2000)
}

function openPrivateChat(friend: FriendDTO) {
  EventBus.emit('ui:open-private-chat', {
    characterId: friend.characterId,
    nickname: friend.nickname,
  })
}

/** 给好友发飞鸽传书 */
function sendPigeon(friend: FriendDTO) {
  EventBus.emit('ui:open-pigeon-compose', {
    characterId: friend.characterId,
    nickname: friend.nickname,
  })
}

function onOnlineStatus(payload: { characterId: number; isOnline: boolean }) {
  friendStore.updateOnlineStatus(payload.characterId, payload.isOnline)
}

onMounted(() => {
  EventBus.on('friend:online-status', onOnlineStatus)
  friendStore.fetchFriends()
})

onBeforeUnmount(() => {
  EventBus.off('friend:online-status', onOnlineStatus)
})
</script>

<template>
  <div class="friend-list-panel">
    <h3>好友 ({{ friendStore.friends.length }})</h3>
    <p class="hint">在线 {{ onlineCount }} 人 · 在线好友排前面</p>

    <ul v-if="friendStore.friends.length" class="friend-list">
      <li v-for="friend in friendStore.friends" :key="friend.characterId" class="friend-item">
        <span class="status-dot" :class="friend.isOnline ? 'online' : 'offline'"></span>
        <div class="friend-info">
          <span class="nickname">{{ friend.nickname }}</span>
          <span class="meta">
            {{ friend.isOnline ? '在线' : '离线' }}
            <template v-if="friend.currentChunkId">· 区块 {{ friend.currentChunkId }}</template>
          </span>
        </div>
        <span class="since">{{ formatSince(friend.friendSince) }}</span>
        <button class="msg-btn" @click="openPrivateChat(friend)">消息</button>
        <button class="pigeon-btn" @click="sendPigeon(friend)">飞鸽</button>
        <button
          v-if="friend.isOnline"
          class="teleport-btn"
          :disabled="teleportingIds.has(friend.characterId)"
          @click="teleportToFriend(friend)"
        >
          传送
        </button>
        <button
          class="remove-btn"
          :disabled="removingIds.has(friend.characterId)"
          @click="removeFriend(friend)"
        >
          删除
        </button>
      </li>
    </ul>
    <p v-else class="empty">还没有好友，点击其他玩家发送好友请求吧</p>
  </div>
</template>

<style scoped>
.friend-list-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.friend-list-panel h3 {
  margin: 0;
  font-size: 14px;
}
.hint {
  margin: 0;
  font-size: 11px;
  color: #9fb2c0;
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
  background: #232d36;
  border: 1px solid #2e3a44;
  border-radius: 6px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online {
  background: #4ade80;
}
.status-dot.offline {
  background: #56626d;
}
.friend-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.nickname {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 10px;
  color: #9fb2c0;
}
.since {
  font-size: 10px;
  color: #6b7a87;
}
.remove-btn {
  padding: 4px 8px;
  background: #3c2a2a;
  color: #e0a0a0;
  border: 1px solid #5c3a3a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.remove-btn:hover {
  background: #4c3535;
}
.remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.teleport-btn {
  padding: 4px 8px;
  background: #2a3c5c;
  color: #a0c0e0;
  border: 1px solid #3a5c8c;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.teleport-btn:hover {
  background: #355078;
}
.teleport-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.msg-btn {
  padding: 4px 8px;
  background: #2c3c2c;
  color: #a0d0a0;
  border: 1px solid #3c5c3c;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.msg-btn:hover {
  background: #3c503c;
}
.pigeon-btn {
  padding: 4px 8px;
  background: #3a2a4a;
  color: #c0a0e0;
  border: 1px solid #5c3a6a;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.pigeon-btn:hover {
  background: #4a3a5a;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: #9fb2c0;
}
</style>