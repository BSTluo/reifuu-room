<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { useRoomStore } from '../../../stores/room'
import { useInteriorStore } from '../../../stores/interior'
import { usePluginStore } from '../../../stores/plugin'
import { useCharacterStore } from '../../../stores/character'
import { getPluginMeta, type PluginMeta } from './plugins'
import ChatPanel from './ChatPanel.vue'
import type { FurnitureCatalogEntryDTO } from '../../../api/types'

const roomStore = useRoomStore()
const interiorStore = useInteriorStore()
const pluginStore = usePluginStore()
const characterStore = useCharacterStore()

// ---- Plugin UI state ----
const activePluginId = ref<string | null>(null)
const activePluginMeta = shallowRef<PluginMeta | null>(null)

// ---- Furniture catalog panel ----
const showCatalog = ref(false)

const isOwner = computed(() => roomStore.myRole === 'owner')

const placeableCatalog = computed(() =>
  interiorStore.catalog.filter((c) => isOwner.value || c.memberPlaceable)
)

// ---- Plugin activation from furniture click ----
function onActivateFurniturePlugin(payload: { roomId: string; pluginId: string; furnitureId: string }) {
  if (payload.roomId !== roomStore.roomId) return
  const meta = getPluginMeta(payload.pluginId)
  if (!meta) return

  // Activate the plugin if not already active
  if (!pluginStore.isPluginActive(payload.roomId, payload.pluginId)) {
    pluginStore.activatePlugin(payload.roomId, payload.pluginId)
  }
  activePluginId.value = payload.pluginId
  activePluginMeta.value = meta
}

// ---- Plugin close (manual or walk-away) ----
function closePlugin() {
  if (activePluginId.value && roomStore.roomId) {
    pluginStore.deactivatePlugin(roomStore.roomId, activePluginId.value)
  }
  activePluginId.value = null
  activePluginMeta.value = null
}

// ---- Walk-away deactivation from scene ----
function onDeactivateFurniturePlugin(payload: { roomId: string; pluginId: string }) {
  if (payload.roomId !== roomStore.roomId) return
  if (activePluginId.value === payload.pluginId) {
    activePluginId.value = null
    activePluginMeta.value = null
  }
}

// ---- Furniture placement ----
function startPlacement(entry: FurnitureCatalogEntryDTO) {
  interiorStore.startPlacement(entry.type)
  showCatalog.value = false
}

function cancelPlacement() {
  interiorStore.cancelPlacement()
}

function startMoveMode() {
  // Move mode: user clicks a furniture item in the scene to select it
  interiorStore.startMoveMode('')
  // Toast hint
  EventBus.emit('game:toast', { message: '点击房间中的家具来移动它', type: 'info' })
}

// ---- Exit room ----
function exitRoom() {
  // Deactivate active plugins
  if (activePluginId.value && roomStore.roomId) {
    pluginStore.deactivatePlugin(roomStore.roomId, activePluginId.value)
    activePluginId.value = null
    activePluginMeta.value = null
  }
  interiorStore.clearFurniture()
  roomStore.leaveRoom()
  EventBus.emit('ui:exit-room-interior')
}

onMounted(() => {
  EventBus.on('ui:activate-furniture-plugin', onActivateFurniturePlugin)
  EventBus.on('ui:deactivate-furniture-plugin', onDeactivateFurniturePlugin)
  // 注意：pluginStore.init() 由 ChatPanel 负责（InteriorView 内嵌 ChatPanel）
  // 加载当前房间的家具
  interiorStore.fetchFurniture()
})

onBeforeUnmount(() => {
  EventBus.off('ui:activate-furniture-plugin', onActivateFurniturePlugin)
  EventBus.off('ui:deactivate-furniture-plugin', onDeactivateFurniturePlugin)
  // 注意：pluginStore.dispose() 由 ChatPanel 负责
})
</script>

<template>
  <div class="interior-view">
    <!-- Top bar: room name + exit -->
    <div class="interior-topbar">
      <div class="room-title">
        <span class="room-name">{{ roomStore.name }}</span>
        <span class="room-role">{{ roomStore.myRole === 'owner' ? '房主' : '访客' }}</span>
      </div>
      <div class="topbar-actions">
        <button class="tool-btn" :class="{ active: showCatalog }" @click="showCatalog = !showCatalog">
          🛋️ 布置
        </button>
        <button class="tool-btn" :class="{ active: interiorStore.placementMode === 'move' }" @click="startMoveMode">
          ✋ 移动
        </button>
        <button class="exit-btn" @click="exitRoom">🚪 离开房间</button>
      </div>
    </div>

    <!-- Plugin container (shown when near a plugin furniture) -->
    <div v-if="activePluginMeta && roomStore.roomId" class="plugin-container">
      <div class="plugin-header">
        <span class="plugin-title">{{ activePluginMeta.icon }} {{ activePluginMeta.name }}</span>
        <button class="plugin-close-btn" @click="closePlugin">✕</button>
      </div>
      <component
        :is="activePluginMeta.component"
        :room-id="roomStore.roomId"
        @close="closePlugin"
      />
    </div>

    <!-- Furniture catalog panel -->
    <div v-if="showCatalog" class="catalog-panel">
      <h3>布置家具</h3>
      <p v-if="!isOwner" class="hint">仅房主可布置家具</p>
      <div class="catalog-grid">
        <button
          v-for="entry in placeableCatalog"
          :key="entry.type"
          class="catalog-item"
          :class="{ selected: interiorStore.selectedType === entry.type }"
          @click="startPlacement(entry)"
        >
          <span class="catalog-icon">{{ entry.icon }}</span>
          <span class="catalog-name">{{ entry.name }}</span>
        </button>
      </div>
      <p v-if="interiorStore.isPlacing" class="hint">
        点击房间地面放置家具，按 ESC 或再次点击取消
      </p>
      <button v-if="interiorStore.isPlacing" class="cancel-btn" @click="cancelPlacement">
        取消摆放
      </button>
    </div>

    <!-- Chat panel -->
    <div class="chat-panel-wrap">
      <ChatPanel />
    </div>
  </div>
</template>

<style scoped>
.interior-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  z-index: 30;
}

.interior-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(20, 24, 28, 0.85);
  border-bottom: 1px solid #3c4b59;
  pointer-events: auto;
}

.room-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-name {
  font-weight: bold;
  font-size: 15px;
  color: #fff;
}

.room-role {
  font-size: 12px;
  color: #9fb2c0;
}

.topbar-actions {
  display: flex;
  gap: 6px;
}

.tool-btn,
.exit-btn {
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid #3c4b59;
  background: #2a3540;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.tool-btn:hover,
.tool-btn.active {
  background: #35434f;
  border-color: #4dd0e1;
}

.exit-btn {
  background: #b05454;
  border-color: #b05454;
}

.exit-btn:hover {
  background: #c06060;
}

.plugin-container {
  position: absolute;
  top: 50px;
  right: 12px;
  width: 300px;
  background: rgba(20, 24, 28, 0.92);
  border: 1px solid #3c4b59;
  border-radius: 8px;
  padding: 10px;
  pointer-events: auto;
  z-index: 40;
}

.plugin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #3c4b59;
}

.plugin-title {
  font-size: 14px;
  font-weight: bold;
  color: #4dd0e1;
}

.plugin-close-btn {
  background: none;
  border: none;
  color: #9fb2c0;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.plugin-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.catalog-panel {
  position: absolute;
  top: 80px;
  left: 12px;
  width: 240px;
  background: rgba(20, 24, 28, 0.92);
  border: 1px solid #3c4b59;
  border-radius: 8px;
  padding: 10px;
  pointer-events: auto;
  z-index: 40;
}

.catalog-panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #fff;
}

.hint {
  font-size: 12px;
  color: #9fb2c0;
  margin: 4px 0;
}

.catalog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.catalog-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: #242f38;
  border: 1px solid #3c4b59;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 11px;
}

.catalog-item:hover,
.catalog-item.selected {
  background: #35434f;
  border-color: #4dd0e1;
}

.catalog-icon {
  font-size: 20px;
}

.cancel-btn {
  margin-top: 8px;
  width: 100%;
  padding: 5px;
  background: #b05454;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.chat-panel-wrap {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 300px;
  height: 320px;
  background: rgba(20, 24, 28, 0.92);
  border: 1px solid #3c4b59;
  border-radius: 8px;
  padding: 8px;
  pointer-events: auto;
  z-index: 35;
}
</style>
