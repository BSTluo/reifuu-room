<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PhaserCanvas from '../components/game/PhaserCanvas.vue'
import Minimap from '../components/game/Minimap.vue'
import { EventBus } from '../game/EventBus'
import { socketClient } from '../game/network/SocketClient'
import { useUserStore } from '../stores/user'
import { useExplorationStore } from '../stores/exploration'
import { useCharacterStore } from '../stores/character'
import { useInventoryStore } from '../stores/inventory'
import { useRoomStore } from '../stores/room'
import ChatPanel from '../components/game/HUD/ChatPanel.vue'
import FriendListPanel from '../components/game/HUD/FriendListPanel.vue'
import MailboxPanel from '../components/game/HUD/MailboxPanel.vue'
import PigeonMailPanel from '../components/game/HUD/PigeonMailPanel.vue'
import PlayerInfoCard from '../components/game/HUD/PlayerInfoCard.vue'
import { apiGet, apiPost, ApiRequestError } from '../api/http'
import type { BuildTemplateDTO, OwnedChunkDTO } from '../api/types'
import { registerFriendListeners, useFriendStore } from '../stores/friend'
import { registerPigeonListeners, usePigeonStore } from '../stores/pigeon'

const userStore = useUserStore()
const explorationStore = useExplorationStore()
const characterStore = useCharacterStore()
const inventoryStore = useInventoryStore()
const roomStore = useRoomStore()
const friendStore = useFriendStore()
const pigeonStore = usePigeonStore()

const phaserReady = ref(false)
const lastPosition = ref({ x: 0, y: 0 })
const socketStatus = ref<'idle' | 'connected' | 'disconnected' | 'error'>('idle')

// ---- 好友 / 信箱 ----
const showFriends = ref(false)
const showMailbox = ref(false)
const showPigeon = ref(false)
const selectedPlayer = ref<{ characterId: string; nickname: string } | null>(null)

// ---- 背包 / 建造 ----
const showInventory = ref(false)
const showBuildMenu = ref(false)
const templates = ref<BuildTemplateDTO[]>([])
const ownedChunks = ref<OwnedChunkDTO[]>([])
const buildForm = ref({ roomName: '' })
const buildMessage = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
const building = ref(false)

const ITEM_LABELS: Record<string, string> = {
  wood: '木材',
  stone: '石材',
  mineral: '矿石',
}
const TEMPLATE_LABELS: Record<string, string> = {
  wooden_house: '木屋',
  stone_house: '石屋',
  advanced_house: '高级房屋',
}

function itemLabel(itemType: string): string {
  return ITEM_LABELS[itemType] ?? itemType
}
function templateLabel(template: string): string {
  return TEMPLATE_LABELS[template] ?? template
}

const currentChunkId = computed(() => characterStore.currentChunkId)

async function refreshInventory() {
  try {
    await inventoryStore.fetchInventory()
  } catch (err) {
    console.warn('fetch inventory failed', err)
  }
}

async function refreshOwnedChunks() {
  try {
    const data = await apiGet<{ chunks: OwnedChunkDTO[] }>(
      '/build/my-chunks',
      userStore.accessToken ?? undefined
    )
    ownedChunks.value = data.chunks ?? []
  } catch (err) {
    console.warn('fetch owned chunks failed', err)
  }
}

async function openBuildMenu() {
  showBuildMenu.value = true
  buildMessage.value = null
  buildForm.value.roomName = ''
  try {
    const data = await apiGet<{ templates: BuildTemplateDTO[] }>(
      '/build/templates',
      userStore.accessToken ?? undefined
    )
    templates.value = data.templates ?? []
  } catch (err) {
    console.warn('fetch templates failed', err)
  }
  refreshOwnedChunks()
}

function onInventoryUpdated(_payload: { items: { itemType: string; quantity: number }[] }) {
  inventoryStore.setItems(
    _payload.items.map((i) => ({ itemType: i.itemType, quantity: i.quantity }))
  )
}

function onChunkChanged(_payload: { chunkId: string }) {
  buildMessage.value = null
  if (showBuildMenu.value) refreshOwnedChunks()
}

async function buildChatRoom(template: string) {
  if (!currentChunkId.value) {
    buildMessage.value = { text: '无法获取当前区块', type: 'error' }
    return
  }
  const roomName = buildForm.value.roomName.trim()
  if (!roomName) {
    buildMessage.value = { text: '请输入聊天室名称', type: 'warn' }
    return
  }
  if (building.value) return
  building.value = true
  try {
    const data = await apiPost<{ chatRoomId: number }>(
      '/build/chatroom',
      { chunkId: currentChunkId.value, template, roomName },
      userStore.accessToken ?? undefined
    )
    buildMessage.value = { text: `建造成功！聊天室 #${data.chatRoomId}`, type: 'success' }
    EventBus.emit('build:created', { chunkId: currentChunkId.value, chatRoomId: data.chatRoomId })
    refreshInventory()
    refreshOwnedChunks()
  } catch (err) {
    const text = err instanceof ApiRequestError ? err.message : '建造失败，请稍后再试'
    buildMessage.value = { text, type: 'error' }
  } finally {
    building.value = false
  }
}

function onToast(payload: { message: string; type?: 'info' | 'warn' | 'error' | 'success' }) {
  // 简易轻提示：2 秒后自动消失
  toast.value = { text: payload.message, type: payload.type ?? 'info' }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 2000)
}

// ---- 聊天室 ----
function onEnterRoom(payload: { roomId: string }) {
  roomStore.enterRoom(payload.roomId)
}

// ---- 好友 ----
function onShowPlayerInfo(payload: { characterId: string; nickname: string }) {
  selectedPlayer.value = payload
}

function closePlayerInfo() {
  selectedPlayer.value = null
}

function onFriendRequestReceived(payload: { fromNickname: string }) {
  // 打开信箱时显示；这里用 toast 提示
  onToast({ message: `${payload.fromNickname} 向你发送了好友申请！`, type: 'success' })
  friendStore.requestState()
}

function onFriendTeleportConfirmed(payload: { nickname: string }) {
  onToast({ message: `已传送到 ${payload.nickname} 身边！`, type: 'success' })
}

function onPigeonDelivered(payload: { fromNickname: string }) {
  onToast({ message: `🕊️ 收到 ${payload.fromNickname} 的飞鸽传信！`, type: 'success' })
}

const toast = ref<{ text: string; type: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function onPhaserReady() {
  phaserReady.value = true
}

function onPositionChanged(payload: { x: number; y: number }) {
  lastPosition.value = payload
}

function onSocketConnected() {
  socketStatus.value = 'connected'
}

function onSocketDisconnected() {
  socketStatus.value = 'disconnected'
}

function onSocketError() {
  socketStatus.value = 'error'
}

function movePlayer(dx: number, dy: number) {
  EventBus.emit('ui:move-player', { dx, dy })
}

onMounted(() => {
  EventBus.on('phaser:ready', onPhaserReady)
  EventBus.on('player:position-changed', onPositionChanged)
  EventBus.on('socket:connected', onSocketConnected)
  EventBus.on('socket:disconnected', onSocketDisconnected)
  EventBus.on('socket:error', onSocketError)
  EventBus.on('inventory:updated', onInventoryUpdated)
  EventBus.on('player:chunk-changed', onChunkChanged)
  EventBus.on('game:toast', onToast)
  EventBus.on('ui:enter-room', onEnterRoom)
  EventBus.on('ui:show-player-info', onShowPlayerInfo)
  EventBus.on('friend:request-received', onFriendRequestReceived)
  EventBus.on('friend:teleport-confirmed', onFriendTeleportConfirmed)
  EventBus.on('pigeon:delivered', onPigeonDelivered)

  // 注册好友 store 的 EventBus 监听
  registerFriendListeners()
  // 注册飞鸽传信 store 的 EventBus 监听
  registerPigeonListeners()

  // 迷雾 store 先在 socket 建立前监听，确保不遗漏 map:initial-explored / map:explore 事件
  explorationStore.startListening()

  const url = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'
  if (userStore.accessToken) {
    socketClient.connect(url, userStore.accessToken)
  }

  // 初始拉取背包
  refreshInventory()
})

onBeforeUnmount(() => {
  EventBus.off('phaser:ready', onPhaserReady)
  EventBus.off('player:position-changed', onPositionChanged)
  EventBus.off('socket:connected', onSocketConnected)
  EventBus.off('socket:disconnected', onSocketDisconnected)
  EventBus.off('socket:error', onSocketError)
  EventBus.off('inventory:updated', onInventoryUpdated)
  EventBus.off('player:chunk-changed', onChunkChanged)
  EventBus.off('game:toast', onToast)
  EventBus.off('ui:enter-room', onEnterRoom)
  EventBus.off('ui:show-player-info', onShowPlayerInfo)
  EventBus.off('friend:request-received', onFriendRequestReceived)
  EventBus.off('friend:teleport-confirmed', onFriendTeleportConfirmed)
  EventBus.off('pigeon:delivered', onPigeonDelivered)
  if (toastTimer) clearTimeout(toastTimer)
  explorationStore.stopListening()
  socketClient.disconnect()
})
</script>

<template>
  <div class="game-view">
    <div class="game-canvas-wrap">
      <PhaserCanvas />
      <div class="minimap-overlay">
        <Minimap />
      </div>
      <div v-if="toast" class="toast" :class="`toast-${toast.type}`">
        {{ toast.text }}
      </div>
    </div>
    <div class="side-panel">
      <div class="debug-panel">
        <p>Phaser ready: {{ phaserReady }}</p>
        <p>Position: {{ lastPosition.x.toFixed(0) }}, {{ lastPosition.y.toFixed(0) }}</p>
        <p>Socket: {{ socketStatus }}</p>
        <div class="controls">
          <button @click="movePlayer(0, -1)">↑</button>
          <div>
            <button @click="movePlayer(-1, 0)">←</button>
            <button @click="movePlayer(1, 0)">→</button>
          </div>
          <button @click="movePlayer(0, 1)">↓</button>
        </div>
      </div>

      <div class="action-panel">
        <button class="action-btn" @click="showInventory = !showInventory">
          🎒 背包 ({{ inventoryStore.usedSlots }}/{{ inventoryStore.capacity }})
        </button>
        <button class="action-btn" @click="openBuildMenu">🏠 建造</button>
        <button class="action-btn" @click="showFriends = !showFriends">
          👥 好友 ({{ friendStore.friends.length }})
        </button>
        <button
          class="action-btn"
          :class="{ 'has-badge': friendStore.unreadRequestCount > 0 }"
          @click="showMailbox = !showMailbox"
        >
          📬 信箱
          <span v-if="friendStore.unreadRequestCount > 0" class="mail-badge">{{ friendStore.unreadRequestCount }}</span>
        </button>
        <button
          class="action-btn"
          :class="{ 'has-badge': pigeonStore.unreadCount > 0 }"
          @click="showPigeon = !showPigeon"
        >
          🕊️ 飞鸽传书
          <span v-if="pigeonStore.unreadCount > 0" class="mail-badge">{{ pigeonStore.unreadCount }}</span>
        </button>
      </div>

      <div v-if="roomStore.inRoom" class="panel chat-panel-wrap">
        <ChatPanel />
      </div>

      <div v-if="showInventory" class="panel">
        <h3>背包</h3>
        <ul v-if="inventoryStore.items.length" class="inventory-list">
          <li v-for="item in inventoryStore.items" :key="item.itemType">
            <span>{{ itemLabel(item.itemType) }}</span>
            <span class="qty">×{{ item.quantity }}</span>
          </li>
        </ul>
        <p v-else class="empty">背包为空，去采集资源吧</p>
      </div>

      <div v-if="showBuildMenu" class="panel">
        <h3>建造聊天室</h3>
        <p class="hint">当前区块：{{ currentChunkId ?? '未知' }}</p>
        <input
          v-model="buildForm.roomName"
          class="room-name-input"
          placeholder="聊天室名称"
          maxlength="20"
        />
        <div class="template-list">
          <div v-for="tpl in templates" :key="tpl.template" class="template-item">
            <div class="template-head">
              <span class="template-name">{{ templateLabel(tpl.template) }}</span>
              <button
                class="build-btn"
                :disabled="building"
                @click="buildChatRoom(tpl.template)"
              >
                建造
              </button>
            </div>
            <div class="template-req">
              <span
                v-for="req in tpl.requirements"
                :key="req.itemType"
                class="req"
                :class="{ 'req-ok': inventoryStore.quantityOf(req.itemType) >= req.quantity }"
              >
                {{ itemLabel(req.itemType) }} {{ inventoryStore.quantityOf(req.itemType) }}/{{ req.quantity }}
              </span>
            </div>
          </div>
        </div>
        <p v-if="buildMessage" class="build-msg" :class="`msg-${buildMessage.type}`">
          {{ buildMessage.text }}
        </p>
        <div v-if="ownedChunks.length" class="owned-chunks">
          <h4>我的领地</h4>
          <ul>
            <li v-for="chunk in ownedChunks" :key="chunk.chunkId">
              {{ chunk.chunkId }}
              <span v-if="chunk.roomName">· {{ chunk.roomName }}</span>
              <span class="visibility">{{ chunk.isPublic ? '公开' : '私有' }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="showFriends" class="panel">
        <FriendListPanel />
      </div>

      <div v-if="showMailbox" class="panel">
        <MailboxPanel />
      </div>

      <div v-if="showPigeon" class="panel">
        <PigeonMailPanel />
      </div>
    </div>

    <div v-if="selectedPlayer" class="player-info-overlay" @click.self="closePlayerInfo">
      <PlayerInfoCard
        :character-id="selectedPlayer.characterId"
        :nickname="selectedPlayer.nickname"
        @close="closePlayerInfo"
      />
    </div>
  </div>
</template>

<style scoped>
.game-view {
  display: flex;
  height: 100vh;
}
.game-canvas-wrap {
  flex: 1;
  display: flex;
  position: relative;
}
.minimap-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  pointer-events: none;
}
.side-panel {
  width: 260px;
  padding: 12px;
  background: #14181c;
  color: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.debug-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.debug-panel p {
  margin: 0;
  font-size: 12px;
  color: #9fb2c0;
}
.action-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.action-btn {
  flex: 1 1 calc(50% - 3px);
  min-width: 70px;
  padding: 8px;
  background: #2a3540;
  color: #fff;
  border: 1px solid #3c4b59;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  position: relative;
}
.action-btn:hover {
  background: #35434f;
}
.action-btn.has-badge {
  border-color: #ef5350;
}
.mail-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef5350;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  padding: 0 3px;
}
.player-info-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.panel {
  background: #1c242b;
  border: 1px solid #2e3a44;
  border-radius: 8px;
  padding: 10px;
}
.chat-panel-wrap {
  display: flex;
  flex-direction: column;
  min-height: 300px;
  flex: 1;
}
.panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.panel h4 {
  margin: 8px 0 4px;
  font-size: 12px;
  color: #9fb2c0;
}
.inventory-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inventory-list li {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: #242f38;
  border-radius: 4px;
  font-size: 13px;
}
.inventory-list .qty {
  color: #ffd54f;
}
.empty {
  font-size: 12px;
  color: #7d8f9c;
}
.hint {
  font-size: 12px;
  color: #7d8f9c;
  margin: 0 0 6px;
}
.room-name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  margin-bottom: 8px;
  background: #242f38;
  border: 1px solid #3c4b59;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
}
.template-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.template-item {
  background: #242f38;
  border-radius: 6px;
  padding: 8px;
}
.template-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.template-name {
  font-size: 13px;
  font-weight: 600;
}
.build-btn {
  padding: 3px 12px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.build-btn:disabled {
  background: #4a5c50;
  cursor: not-allowed;
}
.template-req {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.req {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: #38434e;
  color: #ff8a80;
}
.req-ok {
  color: #a5d6a7;
}
.build-msg {
  margin: 8px 0 0;
  font-size: 12px;
}
.msg-error {
  color: #ff8a80;
}
.msg-warn {
  color: #ffd54f;
}
.msg-success {
  color: #a5d6a7;
}
.msg-info {
  color: #90caf9;
}
.owned-chunks ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
  color: #9fb2c0;
}
.owned-chunks li {
  padding: 2px 0;
}
.visibility {
  float: right;
  color: #68829a;
}
.toast {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #fff;
  background: rgba(20, 24, 28, 0.9);
  border: 1px solid #3c4b59;
  z-index: 20;
  pointer-events: none;
}
.toast-warn {
  border-color: #ffd54f;
  color: #ffd54f;
}
.toast-error {
  border-color: #ff8a80;
  color: #ff8a80;
}
.toast-success {
  border-color: #a5d6a7;
  color: #a5d6a7;
}
</style>
