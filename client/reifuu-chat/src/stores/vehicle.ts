import { defineStore } from 'pinia'
import { apiGet, apiPost } from '../api/http'
import { useUserStore } from './user'
import type { VehicleDTO, VehicleTemplateDTO, PassengerInviteDTO, PassengerRideDTO } from '../api/types'
import { EventBus } from '../game/EventBus'
import { socketClient as socket } from '../game/network/SocketClient'

export const useVehicleStore = defineStore('vehicle', {
  state: () => ({
    vehicles: [] as VehicleDTO[],
    equipped: null as VehicleDTO | null,
    templates: [] as VehicleTemplateDTO[],
    loading: false,
    // Passenger state
    rideInfo: null as PassengerRideDTO | null,
    pendingInvites: [] as PassengerInviteDTO[],
    driverPassengers: [] as PassengerInviteDTO[],
    showPassengerPanel: false,
  }),
  actions: {
    listen() {
      EventBus.on('vehicle:equipped', (vehicle) => { this.equipped = vehicle ? this.vehicles.find((item) => item.id === vehicle.id) ?? { ...vehicle, characterId: '', waterSpeedMultiplier: null, durability: null, equipped: true, createdAt: '' } : null })

      // Passenger events
      EventBus.on('passenger:invite-sent', () => { this.fetchDriverPassengers() })
      EventBus.on('passenger:invited', (data) => { this.pendingInvites = [...this.pendingInvites, data.invite] })
      EventBus.on('passenger:boarded', (data) => {
        this.rideInfo = data.ride
        this.fetchDriverPassengers()
      })
      EventBus.on('passenger:rejected', (data) => {
        this.pendingInvites = this.pendingInvites.filter(i => i.id !== data.inviteId)
        this.fetchDriverPassengers()
      })
      EventBus.on('passenger:exited', () => { this.rideInfo = null })
      EventBus.on('passenger:left', () => { this.fetchDriverPassengers() })
      EventBus.on('passenger:kicked', () => { this.fetchDriverPassengers() })
      EventBus.on('passenger:forced-exit', () => { this.rideInfo = null })
      EventBus.on('passenger:pending-invites', (data) => { this.pendingInvites = data.invites })
      EventBus.on('passenger:position-sync', (data) => {
        EventBus.emit('game:toast', { message: '驾驶员移动中...', type: 'info' })
        // Update local position via Phaser event
        EventBus.emit('ui:spawn-character', { wx: data.position.x, wy: data.position.y })
      })
      EventBus.on('ui:open-passenger', () => { this.showPassengerPanel = true })
    },
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

    // ===== Passenger actions =====
    async fetchMyRide() {
      try {
        const data = await apiGet<{ ride: PassengerRideDTO | null }>('/vehicle/my-ride', useUserStore().accessToken ?? undefined)
        this.rideInfo = data.ride
      } catch { /* no ride */ }
    },
    async fetchPendingInvites() {
      try {
        const data = await apiGet<{ invites: PassengerInviteDTO[] }>('/vehicle/pending-invites', useUserStore().accessToken ?? undefined)
        this.pendingInvites = data.invites
      } catch { /* silent */ }
    },
    async fetchDriverPassengers() {
      try {
        const data = await apiGet<{ passengers: PassengerInviteDTO[] }>('/vehicle/passengers', useUserStore().accessToken ?? undefined)
        this.driverPassengers = data.passengers
      } catch { /* silent */ }
    },
    invitePassenger(passengerCharacterId: number) {
      socket.emit('vehicle:invite-passenger', { passengerCharacterId })
    },
    acceptBoard(inviteId: number) {
      socket.emit('vehicle:accept-board', { inviteId })
    },
    rejectBoard(inviteId: number) {
      socket.emit('vehicle:reject-board', { inviteId })
    },
    exitVehicle() {
      socket.emit('vehicle:exit')
    },
    kickPassenger(inviteId: number) {
      socket.emit('vehicle:kick-passenger', { inviteId })
    },
    requestPendingInvites() {
      socket.emit('vehicle:pending-invites')
    },
  },
})
