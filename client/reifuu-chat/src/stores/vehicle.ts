import { defineStore } from 'pinia'
import { apiGet, apiPost } from '../api/http'
import { useUserStore } from './user'
import type { VehicleDTO, VehicleTemplateDTO } from '../api/types'
import { EventBus } from '../game/EventBus'

export const useVehicleStore = defineStore('vehicle', {
  state: () => ({ vehicles: [] as VehicleDTO[], equipped: null as VehicleDTO | null, templates: [] as VehicleTemplateDTO[], loading: false }),
  actions: {
    listen() { EventBus.on('vehicle:equipped', (vehicle) => { this.equipped = vehicle ? this.vehicles.find((item) => item.id === vehicle.id) ?? { ...vehicle, characterId: '', waterSpeedMultiplier: null, durability: null, equipped: true, createdAt: '' } : null }) },
    async fetch() {
      const token = useUserStore().accessToken ?? undefined
      const data = await apiGet<{ vehicles: VehicleDTO[]; equipped: VehicleDTO | null }>('/vehicle', token)
      this.vehicles = data.vehicles; this.equipped = data.equipped
    },
    async fetchTemplates() { this.templates = (await apiGet<{ templates: VehicleTemplateDTO[] }>('/vehicle/templates', useUserStore().accessToken ?? undefined)).templates },
    async craft(vehicleType: string) {
      const data = await apiPost<{ vehicle: VehicleDTO }>('/vehicle/craft', { vehicleType }, useUserStore().accessToken ?? undefined)
      this.vehicles.push(data.vehicle)
    },
    async equip(id: number) {
      const data = await apiPost<{ vehicle: VehicleDTO }>(`/vehicle/${id}/equip`, {}, useUserStore().accessToken ?? undefined)
      this.equipped = data.vehicle; this.vehicles = this.vehicles.map((v) => ({ ...v, equipped: v.id === id }))
    },
    async unequip() { await apiPost('/vehicle/unequip', {}, useUserStore().accessToken ?? undefined); this.equipped = null; this.vehicles = this.vehicles.map((v) => ({ ...v, equipped: false })) },
  },
})
