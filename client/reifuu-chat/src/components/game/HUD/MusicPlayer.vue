<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EventBus } from '../../../../game/EventBus'
import { usePluginStore } from '../../../../stores/plugin'
import { useRoomStore } from '../../../../stores/room'
import { useCharacterStore } from '../../../../stores/character'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{ close: [] }>()

const pluginStore = usePluginStore()
const roomStore = useRoomStore()
const characterStore = useCharacterStore()

const PLUGIN_ID = 'music-sync'

// --- local UI state ---
const trackUrl = ref('')
const trackTitle = ref('')
const volume = ref(0.5)
const audioEl = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)

// Whether this client is the controller (whoever activated the plugin, or room owner)
const isController = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return state?.controllerId === characterStore.characterId
})

const currentTrack = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return (state?.track as { title: string; url: string } | null) ?? null
})

// --- sync state from plugin store -> local audio element ---
function applyRemoteState() {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  if (!state) return

  const playing = state.playing === true
  const pos = typeof state.position === 'number' ? state.position : 0
  const track = state.track as { title: string; url: string } | null

  if (track && track.url) {
    // If track changed, load new source
    if (audioEl.value && audioEl.value.src !== new URL(track.url, window.location.href).href) {
      audioEl.value.src = track.url
      audioEl.value.load()
    }
    trackTitle.value = track.title || track.url
    trackUrl.value = track.url
  }

  // Sync playback position (allow 2s drift tolerance)
  if (audioEl.value) {
    const drift = Math.abs(audioEl.value.currentTime - pos)
    if (drift > 2) {
      audioEl.value.currentTime = pos
    }
    if (playing && audioEl.value.paused) {
      audioEl.value.play().catch(() => {})
    } else if (!playing && !audioEl.value.paused) {
      audioEl.value.pause()
    }
  }
}

// --- local controls (controller only) ---
function loadAndPlay() {
  if (!trackUrl.value.trim() || !isController.value) return
  const state: Record<string, unknown> = {
    track: { title: trackTitle.value || trackUrl.value, url: trackUrl.value.trim() },
    position: 0,
    playing: true,
    controllerId: characterStore.characterId,
  }
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, state)
}

function togglePlay() {
  if (!isController.value || !currentTrack.value) return
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  const newPlaying = !(state?.playing === true)
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    playing: newPlaying,
    position: audioEl.value?.currentTime ?? 0,
  })
}

function seekTo(e: Event) {
  if (!isController.value || !audioEl.value) return
  const target = e.target as HTMLInputElement
  const time = parseFloat(target.value)
  audioEl.value.currentTime = time
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, { position: time })
}

function broadcastPosition() {
  // Periodically broadcast position to keep clients in sync
  if (isController.value && isPlaying.value && audioEl.value) {
    pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
      position: audioEl.value.currentTime,
    })
  }
}

function onTimeUpdate() {
  if (audioEl.value) {
    currentTime.value = audioEl.value.currentTime
    duration.value = audioEl.value.duration || 0
  }
}

function onAudioPlay() { isPlaying.value = true }
function onAudioPause() { isPlaying.value = false }
function onAudioEnded() { isPlaying.value = false }

function deactivate() {
  pluginStore.deactivatePlugin(props.roomId, PLUGIN_ID)
  emit('close')
}

// --- volume sync ---
watch(volume, (v) => {
  if (audioEl.value) audioEl.value.volume = v
})

// --- plugin state sync listener ---
let syncInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  EventBus.on('plugin:state', onPluginStateEvent)
  EventBus.on('plugin:activated', onPluginActivatedEvent)
  applyRemoteState()
  // Sync position every 5 seconds
  syncInterval = setInterval(broadcastPosition, 5000)
})

onBeforeUnmount(() => {
  EventBus.off('plugin:state', onPluginStateEvent)
  EventBus.off('plugin:activated', onPluginActivatedEvent)
  if (syncInterval) clearInterval(syncInterval)
})

function onPluginStateEvent(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
  if (data.roomId === props.roomId && data.pluginId === PLUGIN_ID) {
    applyRemoteState()
  }
}

function onPluginActivatedEvent(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
  if (data.roomId === props.roomId && data.pluginId === PLUGIN_ID) {
    applyRemoteState()
  }
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="music-player">
    <div class="plugin-header">
      <span class="plugin-title">🎵 一起听歌</span>
      <button class="plugin-close" @click="deactivate" title="关闭插件">✕</button>
    </div>

    <audio
      ref="audioEl"
      :volume="volume"
      @timeupdate="onTimeUpdate"
      @play="onAudioPlay"
      @pause="onAudioPause"
      @ended="onAudioEnded"
    />

    <!-- Load track (controller only) -->
    <div v-if="isController" class="track-input">
      <input
        v-model="trackUrl"
        type="text"
        placeholder="输入音频 URL (MP3/OGG/WAV)…"
        @keydown.enter="loadAndPlay"
      />
      <input
        v-model="trackTitle"
        type="text"
        placeholder="标题 (可选)"
        class="title-input"
      />
      <button class="load-btn" @click="loadAndPlay">播放</button>
    </div>

    <div v-if="!isController && !currentTrack" class="waiting">
      等待房主播放音乐…
    </div>

    <!-- Now playing -->
    <div v-if="currentTrack" class="now-playing">
      <div class="track-info">
        <span class="track-name">{{ trackTitle || currentTrack.title || '未知曲目' }}</span>
      </div>

      <!-- Progress bar -->
      <div class="progress-bar">
        <input
          type="range"
          :min="0"
          :max="duration || 100"
          :value="currentTime"
          :disabled="!isController"
          step="0.1"
          @input="seekTo"
        />
        <div class="time-display">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>

      <!-- Playback controls -->
      <div class="controls">
        <button
          v-if="isController"
          class="ctrl-btn"
          @click="togglePlay"
        >
          {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
        </button>
        <span v-else class="status-text">
          {{ isPlaying ? '▶ 播放中…' : '⏸ 已暂停' }}
        </span>
      </div>

      <!-- Volume -->
      <div class="volume-control">
        <span>🔊</span>
        <input type="range" min="0" max="1" step="0.01" v-model.number="volume" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-player {
  background: rgba(20, 20, 30, 0.95);
  border: 1px solid #444;
  border-radius: 8px;
  padding: 10px;
  margin-top: 8px;
}

.plugin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.plugin-title {
  font-size: 13px;
  font-weight: bold;
  color: #9ecbff;
}

.plugin-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.plugin-close:hover {
  color: #e55;
}

.track-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.track-input input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #555;
  border-radius: 4px;
  color: #e6edf3;
  padding: 5px 8px;
  font-size: 12px;
}

.track-input input:focus {
  outline: none;
  border-color: #6aab85;
}

.title-input {
  font-size: 11px !important;
}

.load-btn {
  background: #6aab85;
  color: #16321f;
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  align-self: flex-end;
}

.load-btn:hover {
  background: #7fc39b;
}

.waiting {
  text-align: center;
  color: #888;
  font-size: 12px;
  padding: 12px 0;
}

.now-playing {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.track-info {
  text-align: center;
}

.track-name {
  font-size: 13px;
  color: #e6edf3;
  font-weight: 500;
}

.progress-bar {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.progress-bar input[type="range"] {
  width: 100%;
  height: 4px;
  accent-color: #6aab85;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #888;
}

.controls {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.ctrl-btn {
  background: #4a5568;
  color: #e6edf3;
  border: none;
  border-radius: 4px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
}

.ctrl-btn:hover {
  background: #5a6578;
}

.status-text {
  font-size: 12px;
  color: #aaa;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.volume-control input[type="range"] {
  flex: 1;
  height: 3px;
  accent-color: #6aab85;
}
</style>
