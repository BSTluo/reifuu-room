<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { usePluginStore } from '../../../stores/plugin'
import { useCharacterStore } from '../../../stores/character'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{ close: [] }>()

const pluginStore = usePluginStore()
const characterStore = useCharacterStore()

const PLUGIN_ID = 'video-sync'

// --- local UI ---
const videoUrl = ref('')
const videoTitle = ref('')
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)

// YouTube IFrame API types
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getVolume(): number
  setVolume(vol: number): void
  getPlayerState(): number
  destroy(): void
}

const playerEl = ref<HTMLDivElement | null>(null)
let ytPlayer: YTPlayer | null = null
let playerReady = false
let progressInterval: ReturnType<typeof setInterval> | null = null

const isController = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return String(state?.controllerId) === String(characterStore.characterId)
})

const currentVideo = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return (state?.track as { title: string; videoId: string } | null) ?? null
})

/** Extract YouTube video ID from various URL formats */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

// --- YouTube IFrame API loading ---
let apiReady = false
let apiCallbacks: Array<() => void> = []

function loadYouTubeAPI() {
  if ((window as any).YT?.Player) {
    apiReady = true
    return
  }
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
  ;(window as any).onYouTubeIframeAPIReady = () => {
    apiReady = true
    apiCallbacks.forEach((cb) => cb())
    apiCallbacks = []
  }
}

function whenAPIReady(cb: () => void) {
  if (apiReady) cb()
  else apiCallbacks.push(cb)
}

function createPlayer(videoId: string) {
  if (ytPlayer) {
    ytPlayer.destroy()
    ytPlayer = null
  }
  playerReady = false
  if (!playerEl.value) return

  const YT = (window as any).YT
  ytPlayer = new YT.Player(playerEl.value, {
    height: '200',
    width: '100%',
    videoId,
    playerVars: {
      autoplay: 0,
      controls: isController.value ? 1 : 0,
      modestbranding: 1,
      rel: 0,
    },
    events: {
      onReady: () => {
        playerReady = true
        duration.value = ytPlayer?.getDuration() ?? 0
        // Apply current plugin state
        applyRemoteState()
      },
      onStateChange: (e: any) => {
        // YT.PlayerState: UNSTARTED=-1, ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3
        const YTState = (window as any).YT.PlayerState
        if (e.data === YTState.PLAYING) {
          isPlaying.value = true
          if (isController.value) {
            startProgressBroadcast()
          }
        } else if (e.data === YTState.PAUSED || e.data === YTState.ENDED) {
          isPlaying.value = false
          stopProgressBroadcast()
          if (isController.value && e.data === YTState.PAUSED) {
            broadcastState()
          }
        }
      },
    },
  })
}

// --- sync from plugin store -> local player ---
function applyRemoteState() {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  if (!state || !ytPlayer || !playerReady) return

  const playing = state.playing === true
  const pos = typeof state.position === 'number' ? state.position : 0

  // Sync position (tolerate 3s drift for video)
  const drift = Math.abs(ytPlayer.getCurrentTime() - pos)
  if (drift > 3) {
    ytPlayer.seekTo(pos, true)
  }

  if (playing && !isPlaying.value) {
    ytPlayer.playVideo()
  } else if (!playing && isPlaying.value) {
    ytPlayer.pauseVideo()
  }
}

// --- controller actions ---
function loadVideo() {
  if (!videoUrl.value.trim() || !isController.value) return
  const videoId = extractYouTubeId(videoUrl.value.trim())
  if (!videoId) {
    alert('请输入有效的 YouTube 链接')
    return
  }

  const state: Record<string, unknown> = {
    track: { title: videoTitle.value || videoUrl.value, videoId },
    position: 0,
    playing: true,
    controllerId: characterStore.characterId,
  }
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, state)

  // Create the player locally
  createPlayer(videoId)
}

function togglePlay() {
  if (!isController.value || !ytPlayer) return
  if (isPlaying.value) {
    ytPlayer.pauseVideo()
  } else {
    ytPlayer.playVideo()
  }
  // State will be broadcast by onStateChange
}

function broadcastState() {
  if (isController.value && ytPlayer && playerReady) {
    pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
      playing: isPlaying.value,
      position: ytPlayer.getCurrentTime(),
    })
  }
}

function startProgressBroadcast() {
  stopProgressBroadcast()
  progressInterval = setInterval(() => {
    if (ytPlayer && playerReady && isController.value) {
      currentTime.value = ytPlayer.getCurrentTime()
      duration.value = ytPlayer.getDuration()
      pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
        position: currentTime.value,
        playing: true,
      })
    }
  }, 5000)
}

function stopProgressBroadcast() {
  if (progressInterval) {
    clearInterval(progressInterval)
    progressInterval = null
  }
}

function deactivate() {
  if (ytPlayer) {
    ytPlayer.destroy()
    ytPlayer = null
  }
  stopProgressBroadcast()
  pluginStore.deactivatePlugin(props.roomId, PLUGIN_ID)
  emit('close')
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// --- watch for track changes from remote ---
function onPluginStateEvent(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
  if (data.roomId !== props.roomId || data.pluginId !== PLUGIN_ID) return

  const track = data.state.track as { title: string; videoId: string } | null
  if (track?.videoId && ytPlayer) {
    // Video changed: recreate player
    createPlayer(track.videoId)
  }
  applyRemoteState()
}

function onPluginActivatedEvent(data: { roomId: string; pluginId: string; state: Record<string, unknown> }) {
  if (data.roomId !== props.roomId || data.pluginId !== PLUGIN_ID) return
  const track = data.state.track as { videoId: string } | null
  if (track?.videoId) {
    whenAPIReady(() => createPlayer(track.videoId))
  }
}

onMounted(() => {
  loadYouTubeAPI()
  EventBus.on('plugin:state', onPluginStateEvent)
  EventBus.on('plugin:activated', onPluginActivatedEvent)

  // If plugin was already active (joining late), load the video
  const track = currentVideo.value
  if (track?.videoId) {
    whenAPIReady(() => createPlayer(track.videoId))
  }
})

onBeforeUnmount(() => {
  EventBus.off('plugin:state', onPluginStateEvent)
  EventBus.off('plugin:activated', onPluginActivatedEvent)
  stopProgressBroadcast()
  if (ytPlayer) {
    ytPlayer.destroy()
    ytPlayer = null
  }
})
</script>

<template>
  <div class="video-player">
    <div class="plugin-header">
      <span class="plugin-title">🎬 一起看视频</span>
      <button class="plugin-close" @click="deactivate" title="关闭插件">✕</button>
    </div>

    <!-- Load video (controller only) -->
    <div v-if="isController" class="video-input">
      <input
        v-model="videoUrl"
        type="text"
        placeholder="输入 YouTube 链接…"
        @keydown.enter="loadVideo"
      />
      <input
        v-model="videoTitle"
        type="text"
        placeholder="标题 (可选)"
        class="title-input"
      />
      <button class="load-btn" @click="loadVideo">加载</button>
    </div>

    <div v-if="!isController && !currentVideo" class="waiting">
      等待房主播放视频…
    </div>

    <!-- YouTube player container -->
    <div v-show="currentVideo" class="player-container">
      <div ref="playerEl" class="yt-player" />
    </div>

    <!-- Controls -->
    <div v-if="currentVideo" class="controls-row">
      <div class="track-info">
        <span class="track-name">{{ currentVideo?.title || 'YouTube 视频' }}</span>
        <span class="time-text">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>
      <div v-if="isController" class="playback-controls">
        <button class="ctrl-btn" @click="togglePlay">
          {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
        </button>
      </div>
      <div v-else class="playback-controls">
        <span class="status-text">{{ isPlaying ? '▶ 播放中…' : '⏸ 已暂停' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-player {
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
  color: #f0a0a0;
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

.video-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.video-input input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #555;
  border-radius: 4px;
  color: #e6edf3;
  padding: 5px 8px;
  font-size: 12px;
}

.video-input input:focus {
  outline: none;
  border-color: #e8a0a0;
}

.title-input {
  font-size: 11px !important;
}

.load-btn {
  background: #c07070;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  align-self: flex-end;
}

.load-btn:hover {
  background: #d08080;
}

.waiting {
  text-align: center;
  color: #888;
  font-size: 12px;
  padding: 12px 0;
}

.player-container {
  margin-bottom: 6px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
}

.yt-player {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.track-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.track-name {
  font-size: 12px;
  color: #e6edf3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.time-text {
  font-size: 10px;
  color: #888;
}

.playback-controls {
  flex-shrink: 0;
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
</style>
