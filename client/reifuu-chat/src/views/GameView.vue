<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PhaserCanvas from '../components/game/PhaserCanvas.vue'
import Minimap from '../components/game/Minimap.vue'
import { EventBus } from '../game/EventBus'
import { socketClient } from '../game/network/SocketClient'
import { useUserStore } from '../stores/user'
import { useExplorationStore } from '../stores/exploration'

const userStore = useUserStore()
const explorationStore = useExplorationStore()

const phaserReady = ref(false)
const lastPosition = ref({ x: 0, y: 0 })
const socketStatus = ref<'idle' | 'connected' | 'disconnected' | 'error'>('idle')

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

  // 迷雾 store 先在 socket 建立前监听，确保不遗漏 map:initial-explored / map:explore 事件
  explorationStore.startListening()

  const url = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'
  if (userStore.accessToken) {
    socketClient.connect(url, userStore.accessToken)
  }
})

onBeforeUnmount(() => {
  EventBus.off('phaser:ready', onPhaserReady)
  EventBus.off('player:position-changed', onPositionChanged)
  EventBus.off('socket:connected', onSocketConnected)
  EventBus.off('socket:disconnected', onSocketDisconnected)
  EventBus.off('socket:error', onSocketError)
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
    </div>
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
.debug-panel {
  width: 220px;
  padding: 12px;
  background: #14181c;
  color: #fff;
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
</style>
