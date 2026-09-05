<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useVehicleStore } from '../../../stores/vehicle'
import { useInventoryStore } from '../../../stores/inventory'
import { ApiRequestError } from '../../../api/http'
import type { TerrainCapability } from '../../../api/types'

const vehicle = useVehicleStore()
const inventory = useInventoryStore()
const message = ref('')

const terrainLabel: Record<TerrainCapability, string> = { land: '陆地', water: '海域', all: '全地形' }

onMounted(async () => { await Promise.all([vehicle.fetch(), vehicle.fetchTemplates()]) })
async function craft(type: string) { try { await vehicle.craft(type); await inventory.fetchInventory(); message.value = '制作成功' } catch (e) { message.value = e instanceof ApiRequestError ? e.message : '制作失败' } }
</script>

<template>
  <section class="vehicle-panel">
    <h3>交通工具</h3>
    <p v-if="vehicle.equipped">
      已装备：{{ vehicle.equipped.vehicleType }}（{{ Math.round(vehicle.equipped.speedMultiplier * 100) }}%<template v-if="vehicle.equipped.waterSpeedMultiplier"> / 海{{ Math.round(vehicle.equipped.waterSpeedMultiplier * 100) }}%</template> · {{ terrainLabel[vehicle.equipped.terrainCapability] }}）
      <button @click="vehicle.unequip()">卸下</button>
    </p>
    <p v-else>未装备交通工具（徒步 100% · 陆地）</p>

    <h4>制作</h4>
    <div v-for="tpl in vehicle.templates" :key="tpl.vehicleType" class="vehicle-template">
      <span>{{ tpl.name }} · 陆{{ Math.round(tpl.speedMultiplier * 100) }}%<template v-if="tpl.waterSpeedMultiplier"> / 海{{ Math.round(tpl.waterSpeedMultiplier * 100) }}%</template> · {{ terrainLabel[tpl.terrainCapability] }} · {{ tpl.capacity }}人</span>
      <small v-for="req in tpl.requirements" :key="req.itemType"> {{ req.itemType }} {{ inventory.quantityOf(req.itemType) }}/{{ req.quantity }}</small>
      <button @click="craft(tpl.vehicleType)">制作</button>
    </div>

    <h4>已有</h4>
    <div v-for="item in vehicle.vehicles" :key="item.id">
      <span>{{ item.vehicleType }} · {{ terrainLabel[item.terrainCapability] }}</span>
      <button v-if="!item.equipped" @click="vehicle.equip(item.id)">装备</button>
    </div>
    <p v-if="message">{{ message }}</p>
  </section>
</template>
