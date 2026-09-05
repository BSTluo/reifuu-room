<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PhaserCanvas from '../components/game/PhaserCanvas.vue'
import Minimap from '../components/game/Minimap.vue'
import InteriorView from '../components/game/HUD/InteriorView.vue'
import MobileControls from '../components/game/MobileControls.vue'
import { EventBus } from '../game/EventBus'
import { socketClient } from '../game/network/SocketClient'
import { useUserStore } from '../stores/user'
import { useExplorationStore } from '../stores/exploration'
import { useCharacterStore } from '../stores/character'
import { useInventoryStore } from '../stores/inventory'
import { useVehicleStore } from '../stores/vehicle'
import VehicleCraftPanel from '../components/game/HUD/VehicleCraftPanel.vue'
import ChunkOwnershipPanel from '../components/game/HUD/ChunkOwnershipPanel.vue'
import { useRoomStore } from '../stores/room'
import { useInteriorStore } from '../stores/interior'
import FriendListPanel from '../components/game/HUD/FriendListPanel.vue'
import PrivateChatPanel from '../components/game/HUD/PrivateChatPanel.vue'
import MailboxPanel from '../components/game/HUD/MailboxPanel.vue'
import PigeonMailPanel from '../components/game/HUD/PigeonMailPanel.vue'
import TeamPanel from '../components/game/HUD/TeamPanel.vue'
import TownPortalPanel from '../components/game/HUD/TownPortalPanel.vue'
import InviteCodePanel from '../components/game/HUD/InviteCodePanel.vue'
import PassengerPanel from '../components/game/HUD/PassengerPanel.vue'
import PlayerInfoCard from '../components/game/HUD/PlayerInfoCard.vue'
import { apiGet, apiPost, ApiRequestError } from '../api/http'
import type { BuildTemplateDTO } from '../api/types'
import { registerFriendListeners, useFriendStore } from '../stores/friend'
import { registerPigeonListeners, usePigeonStore } from '../stores/pigeon'
import { registerTeamListeners, useTeamStore } from '../stores/team'
import { useMobile } from '../composables/useMobile'

const userStore = useUserStore()
const explorationStore = useExplorationStore()
const characterStore = useCharacterStore()
const inventoryStore = useInventoryStore()
const vehicleStore = useVehicleStore()
const roomStore = useRoomStore()
const interiorStore = useInteriorStore()
const friendStore = useFriendStore()
const pigeonStore = usePigeonStore()
const teamStore = useTeamStore()
const showTownPortal = ref(false)
const showInviteCode = ref(false)
const { isMobile } = useMobile()

const phaserReady = ref(false)
const lastPosition = ref({ x: 0, y: 0 })
const socketStatus = ref<'idle' | 'connected' | 'disconnected' | 'error'>('idle')

// ---- 好友 / 信箱 / 团队 ----
const showFriends = ref(false)
const showMailbox = ref(false)
const showPigeon = ref(false)
const showTeam = ref(false)
const selectedPlayer = ref<{ characterId: string; nickname: string } | null>(null)
/** 当前私聊窗口的目标好友 */
const privateChatTarget = ref<{ friendCharacterId: string; friendNickname: string } | null>(null)

function openPrivateChat(payload: { friendCharacterId: string; friendNickname: string }) {
  privateChatTarget.value = payload
}
function closePrivateChat() {
  friendStore.closeChat()
  privateChatTarget.value = null
}

// ---- 背包 / 建造 ----
const showInventory = ref(false)
const showVehicle = ref(false)
const showBuildMenu = ref(false)
const showOwnership = ref(false)
const showPassenger = ref(false)
const templates = ref<BuildTemplateDTO[]>([])
const buildForm = ref({ roomName: '' })
const buildMessage = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
const building = ref(false)

// ---- 移动端菜单 ----
const showMobileMenu = ref(false)

const ITEM_LABELS: Record<string, string> = {
  wood: '木材',
  stone: '石材',
  mineral: '矿石',
  coral: '珊瑚',
  deep_mineral: '深海矿物',
  magic_crystal: '魔法水晶',
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
}

function onInventoryUpdated(_payload: { items: { itemType: string; quantity: number }[] }) {
  inventoryStore.setItems(
    _payload.items.map((i) => ({ itemType: i.itemType, quantity: i.quantity }))
  )
}

function onChunkChanged(_payload: { chunkId: string }) {
  buildMessage.value = null
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

// ---- 聊天室（房间内部） ----
async function onEnterRoom(payload: { roomId: string }) {
  // 先初始化家具 store（目录 + socket 监听），再进入房间
  interiorStore.init()
  await roomStore.enterRoom(payload.roomId)
  // 仅在成功进入房间后切换场景
  if (roomStore.inRoom) {
    EventBus.emit('ui:request-scene', { sceneKey: 'InteriorScene' })
  }
}

function onExitRoomInterior() {
  // 返回大世界场景
  EventBus.emit('ui:request-scene', { sceneKey: 'WorldScene' })
  interiorStore.dispose()
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

function handleMobileAction(action: string) {
  switch (action) {
    case 'interact':
      // Emit E key press for interaction
      EventBus.emit('game:toast', { message: '交互', type: 'info' })
      break
    case 'menu':
      showMobileMenu.value = !showMobileMenu.value
      break
  }
}

async function respondToRoomInvitation(invitationId: number, accept: boolean) {
  try {
    await roomStore.respondInvitation(invitationId, accept)
    onToast({ message: accept ? '已加入房间' : '已拒绝邀请', type: 'success' })
  } catch (error) {
    onToast({ message: error instanceof ApiRequestError ? error.message : '处理房间邀请失败', type: 'error' })
  }
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
  EventBus.on('ui:exit-room-interior', onExitRoomInterior)
  EventBus.on('ui:show-player-info', onShowPlayerInfo)
  EventBus.on('ui:open-private-chat', openPrivateChat)
  EventBus.on('friend:request-received', onFriendRequestReceived)
  EventBus.on('friend:teleport-confirmed', onFriendTeleportConfirmed)
  EventBus.on('pigeon:delivered', onPigeonDelivered)

  // 注册好友 store 的 EventBus 监听
  registerFriendListeners()
  // 注册飞鸽传信 store 的 EventBus 监听
  registerPigeonListeners()
  // 注册团队 store 的 EventBus 监听
  registerTeamListeners()

  // 迷雾 store 先在 socket 建立前监听，确保不遗漏 map:initial-explored / map:explore 事件
  explorationStore.startListening()

  const url = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'
  if (userStore.accessToken) {
    socketClient.connect(url, userStore.accessToken)
  }

  // 初始拉取背包
  refreshInventory()
  roomStore.fetchPendingInvitations().catch(() => { /* panel can retry */ })
  vehicleStore.fetch().catch(() => { /* panel will retry when opened */ })
  vehicleStore.listen()
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
  EventBus.off('ui:exit-room-interior', onExitRoomInterior)
  EventBus.off('ui:show-player-info', onShowPlayerInfo)
  EventBus.off('ui:open-private-chat', openPrivateChat)
  EventBus.off('friend:request-received', onFriendRequestReceived)
  EventBus.off('friend:teleport-confirmed', onFriendTeleportConfirmed)
  EventBus.off('pigeon:delivered', onPigeonDelivered)
  if (toastTimer) clearTimeout(toastTimer)
  explorationStore.stopListening()
  socketClient.disconnect()
})
</script>

<template>
  <div class="game-view" :class="{ 'is-mobile': isMobile }">
    <div class="game-canvas-wrap">
      <PhaserCanvas />
      <div class="minimap-overlay" :class="{ 'mobile-minimap': isMobile }">
        <Minimap />
      </div>
      <div v-if="toast" class="toast" :class="`toast-${toast.type}`">
        {{ toast.text }}
      </div>
      <!-- 房间内部 UI 覆盖层（进入房间时显示） -->
      <InteriorView v-if="roomStore.inRoom" />
    </div>
    
    <!-- 桌面端侧边栏 -->
    <div v-if="!isMobile" class="side-panel">
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
        <button class="action-btn" @click="showVehicle = !showVehicle">🐎 交通工具</button>
        <button class="action-btn" @click="openBuildMenu">🏠 建造</button>
        <button class="action-btn" @click="showOwnership = !showOwnership">🗺️ 我的领地</button>
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
        <button class="action-btn" @click="showTeam = !showTeam">
          👥 团队
          <span v-if="teamStore.inTeam" class="team-badge">{{ teamStore.members.length }}</span>
        </button>
        <button
          class="action-btn"
          :class="{ 'has-badge': roomStore.pendingInvitations.length > 0 }"
          @click="roomStore.fetchPendingInvitations()"
        >
          🏠 房间邀请
          <span v-if="roomStore.pendingInvitations.length > 0" class="mail-badge">{{ roomStore.pendingInvitations.length }}</span>
        </button>
        <button class="action-btn" @click="showTownPortal = !showTownPortal">🌀 城镇传送</button>
        <button class="action-btn" @click="showInviteCode = !showInviteCode">📨 邀请码</button>
        <button class="action-btn" @click="showPassenger = !showPassenger">
          🚗 载客
          <span v-if="vehicleStore.pendingInvites.length" class="mail-badge">{{ vehicleStore.pendingInvites.length }}</span>
        </button>
      </div>
      <div v-if="roomStore.pendingInvitations.length > 0" class="panel room-invitations-panel">
        <h3>房间邀请</h3>
        <div v-for="invitation in roomStore.pendingInvitations" :key="invitation.id" class="room-invitation-row">
          <span>{{ invitation.fromNickname }} 邀请你加入「{{ invitation.roomName ?? invitation.roomId }}」</span>
          <button @click="respondToRoomInvitation(invitation.id, true)">接受</button>
          <button @click="respondToRoomInvitation(invitation.id, false)">拒绝</button>
        </div>
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
      <div v-if="showVehicle" class="panel"><VehicleCraftPanel /></div>

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
      </div>

      <div v-if="showFriends" class="panel">
        <FriendListPanel />
      </div>

      <div v-if="privateChatTarget" class="panel private-chat-panel">
        <PrivateChatPanel
          :key="privateChatTarget.friendCharacterId"
          :friend-character-id="privateChatTarget.friendCharacterId"
          :friend-nickname="privateChatTarget.friendNickname"
          @close="closePrivateChat"
        />
      </div>

      <div v-if="showMailbox" class="panel">
        <MailboxPanel />
      </div>

      <div v-if="showPigeon" class="panel">
        <PigeonMailPanel />
      </div>

      <div v-if="showTeam" class="panel">
        <TeamPanel />
      </div>
      <div v-if="showTownPortal" class="panel">
        <TownPortalPanel />
      </div>
      <div v-if="showInviteCode" class="panel">
        <InviteCodePanel />
      </div>
      <div v-if="showOwnership" class="panel">
        <ChunkOwnershipPanel />
      </div>
      <div v-if="showPassenger" class="panel">
        <PassengerPanel />
      </div>
    </div>

    <!-- 移动端菜单抽屉 -->
    <Transition name="slide-up">
      <div v-if="isMobile && showMobileMenu" class="mobile-menu-drawer">
        <div class="mobile-menu-header">
          <h3>菜单</h3>
          <button class="close-drawer-btn" @click="showMobileMenu = false">✕</button>
        </div>
        <div class="mobile-menu-content">
          <div class="mobile-action-grid">
            <button class="mobile-action-btn" @click="showInventory = !showInventory; showMobileMenu = false">
              <span class="mobile-btn-icon">🎒</span>
              <span class="mobile-btn-label">背包</span>
              <span class="mobile-btn-badge">{{ inventoryStore.usedSlots }}/{{ inventoryStore.capacity }}</span>
            </button>
            <button class="mobile-action-btn" @click="showVehicle = !showVehicle; showMobileMenu = false">
              <span class="mobile-btn-icon">🐎</span><span class="mobile-btn-label">交通工具</span>
            </button>
            <button class="mobile-action-btn" @click="openBuildMenu(); showMobileMenu = false">
              <span class="mobile-btn-icon">🏠</span>
              <span class="mobile-btn-label">建造</span>
            </button>
            <button class="mobile-action-btn" @click="showOwnership = !showOwnership; showMobileMenu = false">
              <span class="mobile-btn-icon">🗺️</span>
              <span class="mobile-btn-label">领地</span>
            </button>
            <button class="mobile-action-btn" @click="showFriends = !showFriends; showMobileMenu = false">
              <span class="mobile-btn-icon">👥</span>
              <span class="mobile-btn-label">好友</span>
              <span class="mobile-btn-badge">{{ friendStore.friends.length }}</span>
            </button>
            <button
              class="mobile-action-btn"
              :class="{ 'has-badge': friendStore.unreadRequestCount > 0 }"
              @click="showMailbox = !showMailbox; showMobileMenu = false"
            >
              <span class="mobile-btn-icon">📬</span>
              <span class="mobile-btn-label">信箱</span>
              <span v-if="friendStore.unreadRequestCount > 0" class="mail-badge">{{ friendStore.unreadRequestCount }}</span>
            </button>
            <button
              class="mobile-action-btn"
              :class="{ 'has-badge': pigeonStore.unreadCount > 0 }"
              @click="showPigeon = !showPigeon; showMobileMenu = false"
            >
              <span class="mobile-btn-icon">🕊️</span>
              <span class="mobile-btn-label">飞鸽</span>
              <span v-if="pigeonStore.unreadCount > 0" class="mail-badge">{{ pigeonStore.unreadCount }}</span>
            </button>
            <button class="mobile-action-btn" @click="showTeam = !showTeam; showMobileMenu = false">
              <span class="mobile-btn-icon">👥</span>
              <span class="mobile-btn-label">团队</span>
              <span v-if="teamStore.inTeam" class="team-badge">{{ teamStore.members.length }}</span>
            </button>
            <button class="mobile-action-btn" @click="showInviteCode = !showInviteCode; showMobileMenu = false">
              <span class="mobile-btn-icon">📨</span>
              <span class="mobile-btn-label">邀请码</span>
            </button>
            <button class="mobile-action-btn" @click="showPassenger = !showPassenger; showMobileMenu = false">
              <span class="mobile-btn-icon">🚗</span>
              <span class="mobile-btn-label">载客</span>
              <span v-if="vehicleStore.pendingInvites.length" class="mail-badge">{{ vehicleStore.pendingInvites.length }}</span>
            </button>
          </div>
          
          <div class="mobile-status">
            <p>位置: {{ lastPosition.x.toFixed(0) }}, {{ lastPosition.y.toFixed(0) }}</p>
            <p>连接: {{ socketStatus }}</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 移动端面板（全屏显示） -->
    <Transition name="slide-up">
      <div v-if="isMobile && showVehicle" class="mobile-panel-overlay">
        <div class="mobile-panel"><div class="mobile-panel-header"><h3>交通工具</h3><button class="close-panel-btn" @click="showVehicle = false">✕</button></div><div class="mobile-panel-content"><VehicleCraftPanel /></div></div>
      </div>
    </Transition>
    <Transition name="slide-up">
      <div v-if="isMobile && showInventory" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>背包</h3>
            <button class="close-panel-btn" @click="showInventory = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <ul v-if="inventoryStore.items.length" class="inventory-list">
              <li v-for="item in inventoryStore.items" :key="item.itemType">
                <span>{{ itemLabel(item.itemType) }}</span>
                <span class="qty">×{{ item.quantity }}</span>
              </li>
            </ul>
            <p v-else class="empty">背包为空，去采集资源吧</p>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showBuildMenu" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>建造聊天室</h3>
            <button class="close-panel-btn" @click="showBuildMenu = false">✕</button>
          </div>
          <div class="mobile-panel-content">
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
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showOwnership" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>我的领地</h3>
            <button class="close-panel-btn" @click="showOwnership = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <ChunkOwnershipPanel />
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showFriends" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>好友</h3>
            <button class="close-panel-btn" @click="showFriends = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <FriendListPanel />
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && privateChatTarget" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>私聊 — {{ privateChatTarget.friendNickname }}</h3>
            <button class="close-panel-btn" @click="closePrivateChat">✕</button>
          </div>
          <div class="mobile-panel-content">
            <PrivateChatPanel
              :key="privateChatTarget.friendCharacterId"
              :friend-character-id="privateChatTarget.friendCharacterId"
              :friend-nickname="privateChatTarget.friendNickname"
              @close="closePrivateChat"
            />
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showMailbox" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>信箱</h3>
            <button class="close-panel-btn" @click="showMailbox = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <MailboxPanel />
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showPigeon" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>飞鸽传书</h3>
            <button class="close-panel-btn" @click="showPigeon = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <PigeonMailPanel />
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="slide-up">
      <div v-if="isMobile && showTeam" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>团队</h3>
            <button class="close-panel-btn" @click="showTeam = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <TeamPanel />
          </div>
        </div>
      </div>
      <div v-if="isMobile && showInviteCode" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>邀请码</h3>
            <button class="close-panel-btn" @click="showInviteCode = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <InviteCodePanel />
          </div>
        </div>
      </div>
      <div v-if="isMobile && showPassenger" class="mobile-panel-overlay">
        <div class="mobile-panel">
          <div class="mobile-panel-header">
            <h3>载客系统</h3>
            <button class="close-panel-btn" @click="showPassenger = false">✕</button>
          </div>
          <div class="mobile-panel-content">
            <PassengerPanel />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 移动端触控控件 -->
    <MobileControls v-if="isMobile" @action="handleMobileAction" />

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
.team-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #4dd0e1;
  color: #1a2530;
  font-size: 10px;
  font-weight: bold;
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
.private-chat-panel {
  display: flex;
  flex-direction: column;
  height: 360px;
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

/* Mobile Styles */
.is-mobile {
  flex-direction: column;
}

.is-mobile .game-canvas-wrap {
  width: 100%;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
}

.mobile-minimap {
  top: 8px;
  right: 8px;
  transform: scale(0.8);
  transform-origin: top right;
}

/* Mobile Menu Drawer */
.mobile-menu-drawer {
  position: fixed;
  bottom: 140px;
  left: 0;
  right: 0;
  background: #14181c;
  border-top: 1px solid #3c4b59;
  border-radius: 16px 16px 0 0;
  z-index: 150;
  max-height: 60vh;
  overflow-y: auto;
}

.mobile-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3c4b59;
  position: sticky;
  top: 0;
  background: #14181c;
}

.mobile-menu-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.close-drawer-btn {
  background: none;
  border: none;
  color: #9fb2c0;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}

.mobile-menu-content {
  padding: 12px;
}

.mobile-action-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.mobile-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  background: #2a3540;
  border: 1px solid #3c4b59;
  border-radius: 8px;
  color: #fff;
  position: relative;
  -webkit-tap-highlight-color: transparent;
}

.mobile-action-btn:active {
  background: #35434f;
  border-color: #4dd0e1;
}

.mobile-btn-icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.mobile-btn-label {
  font-size: 12px;
}

.mobile-btn-badge {
  font-size: 10px;
  color: #ffd54f;
  margin-top: 2px;
}

.mobile-status {
  padding: 8px;
  background: #242f38;
  border-radius: 6px;
  font-size: 11px;
  color: #9fb2c0;
}

.mobile-status p {
  margin: 2px 0;
}

/* Mobile Panel Overlay */
.mobile-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 200;
  display: flex;
  align-items: flex-end;
}

.mobile-panel {
  width: 100%;
  max-height: 85vh;
  background: #14181c;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
}

.mobile-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #3c4b59;
  position: sticky;
  top: 0;
  background: #14181c;
  border-radius: 16px 16px 0 0;
}

.mobile-panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.close-panel-btn {
  background: none;
  border: none;
  color: #9fb2c0;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.mobile-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.mobile-panel-content .inventory-list li {
  padding: 10px 12px;
  font-size: 14px;
}

.mobile-panel-content .room-name-input {
  padding: 10px 12px;
  font-size: 14px;
}

.mobile-panel-content .template-item {
  padding: 12px;
}

.mobile-panel-content .build-btn {
  padding: 8px 16px;
  font-size: 14px;
}

.mobile-panel-content .req {
  padding: 4px 8px;
  font-size: 12px;
}

/* Slide Up Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Badge styles for mobile */
.mobile-action-btn .mail-badge,
.mobile-action-btn .team-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  line-height: 16px;
  border-radius: 8px;
}

.mobile-action-btn .mail-badge {
  background: #ff5722;
}

.mobile-action-btn .team-badge {
  background: #4caf50;
}
</style>
