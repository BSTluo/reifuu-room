<script setup lang="ts">
import Phaser from 'phaser'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createGameConfig } from '../../game/config'

const container = ref<HTMLDivElement | null>(null)
let game: Phaser.Game | null = null

onMounted(() => {
  if (!container.value) return
  game = new Phaser.Game(createGameConfig(container.value))
})

onBeforeUnmount(() => {
  game?.destroy(true)
  game = null
})
</script>

<template>
  <div ref="container" class="phaser-canvas"></div>
</template>

<style scoped>
.phaser-canvas {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
</style>
