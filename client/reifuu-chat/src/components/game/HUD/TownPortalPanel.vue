<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useTownStore } from '../../../stores/town'
const townStore = useTownStore()
onMounted(() => townStore.init())
onBeforeUnmount(() => townStore.dispose())
</script>
<template>
  <section class="town-panel">
    <h3>城镇传送门</h3>
    <p v-if="!townStore.unlockedTowns.length">到访城镇后即可解锁传送。</p>
    <button v-for="town in townStore.unlockedTowns" :key="town.id" :disabled="(town.cooldownRemaining ?? 0) > 0" @click="townStore.teleport(town.id)">
      {{ town.name }} · {{ town.continent }}
      <span v-if="(town.cooldownRemaining ?? 0) > 0">({{ town.cooldownRemaining }}s)</span>
    </button>
  </section>
</template>
<style scoped>
.town-panel { background: #18232b; color: #f1e8d0; padding: 12px; border-radius: 8px; min-width: 190px }
.town-panel h3 { margin: 0 0 8px }
.town-panel button { display: block; width: 100%; margin: 4px 0; padding: 6px; cursor: pointer }
</style>
