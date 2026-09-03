<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { EventBus } from '../../game/EventBus'
import { useExplorationStore } from '../../stores/exploration'
import { useCharacterStore } from '../../stores/character'
import { worldToChunkId } from '../../game/utils/world'

const exploration = useExplorationStore()
const characterStore = useCharacterStore()

// 玩家世界坐标（跟随 player:position-changed 事件实时更新）
const playerPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })

function onPositionChanged(payload: { x: number; y: number }) {
  playerPos.value = payload
}

onMounted(() => {
  // 初始位置来自角色 store（出生点）
  if (characterStore.position && (characterStore.position.x !== 0 || characterStore.position.y !== 0)) {
    playerPos.value = characterStore.position
  }
  EventBus.on('player:position-changed', onPositionChanged)
})

onBeforeUnmount(() => {
  EventBus.off('player:position-changed', onPositionChanged)
})

// 小地图以玩家所在区块为中心，展示 VIEW_RADIUS 半径内的区块
const VIEW_RADIUS = 6
const GRID = VIEW_RADIUS * 2 + 1
const CELL = 16
const PAD = 6
const canvasSize = GRID * CELL + PAD * 2

interface Cell {
  chunkId: string
  state: 'hidden' | 'explored' | 'visible'
}

const cells = computed<Cell[]>(() => {
  const centerChunkId = worldToChunkId(playerPos.value.x, playerPos.value.y)
  const [ccx, ccy] = centerChunkId.split('_').map(Number)
  const visible = exploration.computeVisibleChunks(playerPos.value.x, playerPos.value.y)

  const result: Cell[] = []
  for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      const chunkId = `${ccx + dx}_${ccy + dy}`
      result.push({
        chunkId,
        state: exploration.getChunkFogState(chunkId, visible),
      })
    }
  }
  return result
})

function cellColor(state: Cell['state']): string {
  switch (state) {
    case 'visible':
      return '#3f6f4f'
    case 'explored':
      return '#2a3a44'
    case 'hidden':
      return '#0d1117'
  }
}
</script>

<template>
  <div class="minimap">
    <svg :width="canvasSize" :height="canvasSize" class="map-svg">
      <rect
        v-for="(cell, i) in cells"
        :key="cell.chunkId"
        :x="PAD + (i % GRID) * CELL"
        :y="PAD + Math.floor(i / GRID) * CELL"
        :width="CELL - 1"
        :height="CELL - 1"
        :fill="cellColor(cell.state)"
        rx="2"
      />
      <!-- 玩家位置标记 -->
      <circle
        :cx="PAD + VIEW_RADIUS * CELL + CELL / 2"
        :cy="PAD + VIEW_RADIUS * CELL + CELL / 2"
        :r="CELL / 3"
        fill="#ffd54f"
        stroke="#1a1a1a"
        stroke-width="1.5"
      />
    </svg>
  </div>
</template>

<style scoped>
.minimap {
  background: rgba(10, 14, 18, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.map-svg {
  display: block;
}
</style>
