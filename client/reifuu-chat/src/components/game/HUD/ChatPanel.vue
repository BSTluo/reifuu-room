<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { useRoomStore } from '../../../stores/room'
import { useCharacterStore } from '../../../stores/character'
import { usePluginStore } from '../../../stores/plugin'
import { BUILTIN_PLUGINS, type PluginMeta } from './plugins'

const roomStore = useRoomStore()
const characterStore = useCharacterStore()
const pluginStore = usePluginStore()

const draft = ref('')
const messagesEl = ref<HTMLElement | null>(null)

// Plugin UI state: which plugin panel is currently shown (null = none)
const activePluginId = ref<string | null>(null)
const activePluginMeta = shallowRef<PluginMeta | null>(null)

const ROLE_LABELS: Record<string, string> = {
  owner: '房主',
  member: '成员',
  guest: '访客',
}

const myRoleLabel = computed(() => ROLE_LABELS[roomStore.myRole ?? 'guest'] ?? '访客')

function onRoomHistory(payload: { roomId: string; messages: any[] }) {
  roomStore.applyHistory(payload)
  scrollToBottom()
}

function onRoomMessage(payload: { roomId: string; message: any }) {
  roomStore.applyMessage(payload)
  scrollToBottom()
}

function onRoomMembers(payload: { roomId: string; members: any[] }) {
  roomStore.applyMembers(payload)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

function send() {
  const content = draft.value
  if (!content.trim()) return
  roomStore.sendMessage(content)
  draft.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function leave() {
  // Deactivate any active plugins before leaving
  if (activePluginId.value && roomStore.roomId) {
    pluginStore.deactivatePlugin(roomStore.roomId, activePluginId.value)
    activePluginId.value = null
    activePluginMeta.value = null
  }
  roomStore.leaveRoom()
}

// --- Plugin controls ---
function togglePlugin(meta: PluginMeta) {
  if (!roomStore.roomId) return

  if (activePluginId.value === meta.id) {
    // Already showing this plugin panel — close it
    activePluginId.value = null
    activePluginMeta.value = null
    return
  }

  // Activate the plugin if not already active
  if (!pluginStore.isPluginActive(roomStore.roomId, meta.id)) {
    pluginStore.activatePlugin(roomStore.roomId, meta.id)
  }

  activePluginId.value = meta.id
  activePluginMeta.value = meta
}

function closePlugin() {
  activePluginId.value = null
  activePluginMeta.value = null
}

const availablePlugins = BUILTIN_PLUGINS

onMounted(() => {
  EventBus.on('room:history', onRoomHistory)
  EventBus.on('room:message', onRoomMessage)
  EventBus.on('room:members', onRoomMembers)
  pluginStore.init()
})

onBeforeUnmount(() => {
  EventBus.off('room:history', onRoomHistory)
  EventBus.off('room:message', onRoomMessage)
  EventBus.off('room:members', onRoomMembers)
  pluginStore.dispose()
})
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="room-title">
        <span class="room-name">{{ roomStore.name }}</span>
        <span class="room-role">({{ myRoleLabel }})</span>
      </div>
      <button class="leave-btn" @click="leave">离开房间</button>
    </div>

    <div class="member-strip">
      <span
        v-for="member in roomStore.members"
        :key="member.characterId"
        class="member-chip"
        :class="{ me: member.characterId === characterStore.characterId }"
      >
        {{ member.nickname }}
      </span>
      <span v-if="roomStore.members.length === 0" class="member-empty">成员加载中…</span>
    </div>

    <!-- Plugin toolbar -->
    <div class="plugin-toolbar">
      <button
        v-for="plugin in availablePlugins"
        :key="plugin.id"
        class="plugin-btn"
        :class="{ active: activePluginId === plugin.id }"
        :title="plugin.description"
        @click="togglePlugin(plugin)"
      >
        {{ plugin.icon }} {{ plugin.name }}
      </button>
    </div>

    <!-- Plugin container: renders the active plugin component -->
    <div v-if="activePluginMeta && roomStore.roomId" class="plugin-container">
      <component
        :is="activePluginMeta.component"
        :room-id="roomStore.roomId"
        @close="closePlugin"
      />
    </div>

    <div ref="messagesEl" class="chat-messages">
      <p v-if="roomStore.messages.length === 0" class="empty">还没有消息，来说点什么吧</p>
      <div
        v-for="message in roomStore.messages"
        :key="message.id"
        class="message"
        :class="{ mine: message.characterId === characterStore.characterId }"
      >
        <span class="nickname">{{ message.nickname }}</span>
        <span class="content">{{ message.content }}</span>
      </div>
    </div>

    <div class="chat-input">
      <input
        v-model="draft"
        type="text"
        placeholder="输入消息，回车发送…"
        maxlength="500"
        @keydown="onKeydown"
      />
      <button @click="send">发送</button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.room-title .room-name {
  font-weight: bold;
  font-size: 15px;
}

.room-title .room-role {
  font-size: 12px;
  color: #888;
  margin-left: 4px;
}

.leave-btn {
  background: #b05454;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}

.leave-btn:hover {
  background: #94413f;
}

.member-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 4px;
}

.member-chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #4a5568;
  color: #fff;
}

.member-chip.me {
  background: #486b52;
}

.member-empty {
  font-size: 12px;
  color: #999;
}

.chat-messages {
  flex: 1;
  min-height: 0;
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

/* Plugin toolbar */
.plugin-toolbar {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.plugin-btn {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid #444;
  border-radius: 4px;
  color: #ccc;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.plugin-btn:hover {
  background: rgba(106, 171, 133, 0.15);
  border-color: #6aab85;
}

.plugin-btn.active {
  background: rgba(106, 171, 133, 0.25);
  border-color: #6aab85;
  color: #fff;
}

/* Plugin container */
.plugin-container {
  margin-bottom: 6px;
}
</style>