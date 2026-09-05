import { defineStore } from 'pinia'
import { EventBus, type TownDTO } from '../game/EventBus'
import { socketClient } from '../game/network/SocketClient'

export const useTownStore = defineStore('town', {
  state: () => ({ towns: [] as TownDTO[], initialized: false }),
  getters: { unlockedTowns: (s) => s.towns.filter((town) => town.unlocked) },
  actions: {
    init() {
      EventBus.on('town:state', this.onState)
      EventBus.on('town:teleport-confirmed', this.onTeleport)
      socketClient.instance?.emit('town:request-state')
    },
    dispose() {
      EventBus.off('town:state', this.onState)
      EventBus.off('town:teleport-confirmed', this.onTeleport)
    },
    requestState() { socketClient.instance?.emit('town:request-state') },
    teleport(townId: number) { socketClient.instance?.emit('town:teleport', { townId }) },
    onState: (data: { towns: TownDTO[] }) => {
      const store = useTownStore()
      store.towns = data.towns
      store.initialized = true
    },
    onTeleport: () => { useTownStore().requestState() },
  },
})
