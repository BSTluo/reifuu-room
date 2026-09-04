<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { usePluginStore } from '../../../stores/plugin'
import { useCharacterStore } from '../../../stores/character'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{ close: [] }>()

const pluginStore = usePluginStore()
const characterStore = useCharacterStore()

const PLUGIN_ID = 'radio-fm'

// 模拟 FM 广播电台列表
interface RadioStation {
  id: string
  name: string
  frequency: string
  description: string
}

const STATIONS: RadioStation[] = [
  { id: 'classic', name: '古典音乐台', frequency: 'FM 88.7', description: '舒缓的古典乐' },
  { id: 'jazz', name: '爵士电台', frequency: 'FM 92.3', description: '慵懒的爵士乐' },
  { id: 'pop', name: '流行音乐台', frequency: 'FM 98.5', description: '热门流行歌曲' },
  { id: 'news', name: '新闻广播', frequency: 'FM 101.1', description: '实时新闻播报' },
  { id: 'talk', name: '谈话节目', frequency: 'FM 104.9', description: '轻松闲聊' },
]

// --- local UI state ---
const currentStationId = ref<string | null>(null)
const isPlaying = ref(false)
const volume = ref(0.5)

// 是否为本客户端控制器（激活者或房主）
const isController = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return String(state?.controllerId) === String(characterStore.characterId)
})

const currentStation = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  const stationId = (state?.stationId as string) ?? null
  return STATIONS.find((s) => s.id === stationId) ?? null
})

// 从插件状态同步到本地 UI
function applyRemoteState() {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  if (!state) return
  currentStationId.value = (state.stationId as string) ?? null
  isPlaying.value = state.playing === true
  if (typeof state.volume === 'number') volume.value = state.volume
}

// 控制器操作：切换电台
function selectStation(station: RadioStation) {
  if (!isController.value) return
  currentStationId.value = station.id
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    stationId: station.id,
    playing: true,
    volume: volume.value,
  })
}

// 控制器操作：播放/暂停
function togglePlay() {
  if (!isController.value) return
  isPlaying.value = !isPlaying.value
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    stationId: currentStationId.value,
    playing: isPlaying.value,
    volume: volume.value,
  })
}

// 控制器操作：调节音量
function setVolume(e: Event) {
  const target = e.target as HTMLInputElement
  volume.value = Number(target.value)
  if (isController.value) {
    pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
      stationId: currentStationId.value,
      playing: isPlaying.value,
      volume: volume.value,
    })
  }
}

// 监听插件状态变化
watch(
  () => pluginStore.getPluginState(props.roomId, PLUGIN_ID),
  () => applyRemoteState(),
  { deep: true },
)

onMounted(() => {
  applyRemoteState()
})

onBeforeUnmount(() => {
  // 无需清理，插件状态由 store 管理
})
</script>

<template>
  <div class="radio-player">
    <div class="radio-header">
      <span class="radio-title">📻 收音机</span>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="radio-display">
      <div class="frequency">{{ currentStation?.frequency ?? '--.-' }}</div>
      <div class="station-name">{{ currentStation?.name ?? '未选择电台' }}</div>
      <div class="station-desc">{{ currentStation?.description ?? '点击下方电台开始收听' }}</div>
    </div>

    <div class="radio-controls">
      <button class="play-btn" :disabled="!isController" @click="togglePlay">
        {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
      </button>
      <div class="volume-control">
        <span>🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          :disabled="!isController"
          @input="setVolume"
        />
      </div>
    </div>

    <div class="station-list">
      <button
        v-for="station in STATIONS"
        :key="station.id"
        class="station-item"
        :class="{ active: currentStationId === station.id }"
        :disabled="!isController"
        @click="selectStation(station)"
      >
        <span class="station-freq">{{ station.frequency }}</span>
        <span class="station-name">{{ station.name }}</span>
      </button>
    </div>

    <p v-if="!isController" class="hint">仅控制器可切换电台</p>
  </div>
</template>

<style scoped>
.radio-player {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.radio-title {
  font-weight: bold;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  color: #9fb2c0;
  cursor: pointer;
  font-size: 14px;
}

.radio-display {
  background: #1a2530;
  border: 1px solid #3c4b59;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}

.frequency {
  font-size: 24px;
  font-weight: bold;
  color: #4dd0e1;
  font-family: monospace;
}

.station-name {
  font-size: 14px;
  margin-top: 4px;
}

.station-desc {
  font-size: 11px;
  color: #9fb2c0;
  margin-top: 2px;
}

.radio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.play-btn {
  padding: 5px 12px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.play-btn:disabled {
  background: #4a5c50;
  cursor: not-allowed;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.volume-control input[type='range'] {
  flex: 1;
}

.station-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.station-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #242f38;
  border: 1px solid #3c4b59;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.station-item:hover,
.station-item.active {
  background: #35434f;
  border-color: #4dd0e1;
}

.station-item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.station-freq {
  font-family: monospace;
  color: #4dd0e1;
  min-width: 60px;
}

.hint {
  font-size: 11px;
  color: #9fb2c0;
  margin: 0;
  text-align: center;
}
</style>
