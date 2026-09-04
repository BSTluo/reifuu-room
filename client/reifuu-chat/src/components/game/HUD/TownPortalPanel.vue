<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useUserStore } from '../../../stores/user'
import { apiGet } from '../../../api/http'
import { EventBus } from '../../../game/EventBus'
import type { TownDTO } from '../../../api/types'

const userStore = useUserStore()

const towns = ref<TownDTO[]>([])
const loading = ref(false)
const teleportingIds = ref(new Set<number>())

async function fetchTowns() {
  loading.value = true
  try {
    const data = await apiGet<{ towns: TownDTO[] }>('/town/list', userStore.accessToken ?? undefined)
    // 已到访（传送门已解锁）城镇排在前面
    towns.value = data.towns.sort((a, b) => Number(b.visited) - Number(a.visited))
  } catch (err: any) {
    console.warn('fetchTowns failed:', err)
  } finally {
    loading.value = false
  }
}

function teleportToTown(town: TownDTO) {
  if (teleportingIds.value.has(town.id)) return
  if (!town.visited) {
    window.alert('尚未到访过该城镇，传送门未解锁')
    return
  }
  teleportingIds.value.add(town.id)
  EventBus.emit('ui:teleport-town', { townId: town.id })
  // 防止重复点击；实际状态由 town:teleport-confirmed / error 事件驱动
  setTimeout(() => teleportingIds.value.delete(town.id), 2000)
}

function onTeleportConfirmed(payload: { townName: string }) {
  // toast 由 WorldScene 的 town:teleport-confirmed 处理器发出，这里只刷新城镇列表
  void payload
  fetchTowns()
}

onMounted(() => {
  EventBus.on('town:teleport-confirmed', onTeleportConfirmed)
  fetchTowns()
})

onBeforeUnmount(() => {
  EventBus.off('town:teleport-confirmed', onTeleportConfirmed)
})
</script>

<template>
  <div class="town-portal-panel">
    <h3>传送门</h3>
    <p class="hint">到访城镇即可解锁传送门 · 传送冷却 5 分钟</p>

    <p v-if="loading" class="empty">加载中...</p>
    <ul v-else-if="towns.length" class="town-list">
      <li v-for="town in towns" :key="town.id" class="town-item">
        <span class="portal-icon" :class="{ locked: !town.visited }">🌀</span>
        <div class="town-info">
          <span class="town-name">{{ town.name }}</span>
          <span class="meta">
            Lv.{{ town.level }} · 区块 {{ town.centerChunkId }}
            <template v-if="town.visited">· ✅ 已解锁</template>
            <template v-else>· 🔒 未解锁（需到访）</template>
          </span>
        </div>
        <button
          class="teleport-btn"
          :class="{ locked: !town.visited }"
          :disabled="!town.visited || teleportingIds.has(town.id)"
          @click="teleportToTown(town)"
        >
          {{ town.visited ? '传送' : '未解锁' }}
        </button>
      </li>
    </ul>
    <p v-else class="empty">世界上还没有城镇，建造更多相邻聊天室吧（3x3 范围内 ≥5 个聊天室形成城镇）</p>
  </div>
</template>

<style scoped>
.town-portal-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.town-portal-panel h3 {
  margin: 0;
  font-size: 14px;
}
.hint {
  margin: 0;
  font-size: 11px;
  color: #9fb2c0;
}
.town-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.town-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #232d36;
  border: 1px solid #2e3a44;
  border-radius: 6px;
}
.portal-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.portal-icon.locked {
  filter: grayscale(1);
  opacity: 0.5;
}
.town-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.town-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 10px;
  color: #9fb2c0;
}
.teleport-btn {
  padding: 4px 8px;
  background: #2a3c5c;
  color: #a0c0e0;
  border: 1px solid #3a5c8c;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
}
.teleport-btn:hover:not(:disabled) {
  background: #355078;
}
.teleport-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.teleport-btn.locked {
  background: #232d36;
  color: #56626d;
  border-color: #2e3a44;
}
.empty {
  margin: 0;
  font-size: 12px;
  color: #9fb2c0;
}
</style>