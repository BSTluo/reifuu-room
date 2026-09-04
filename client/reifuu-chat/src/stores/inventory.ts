import { defineStore } from 'pinia'
import { apiGet } from '../api/http'
import { useUserStore } from './user'

export interface InventoryItem {
  itemType: string
  quantity: number
}

interface InventoryState {
  items: InventoryItem[]
  capacity: number
}

export const useInventoryStore = defineStore('inventory', {
  state: (): InventoryState => ({
    items: [],
    capacity: 20,
  }),
  getters: {
    usedSlots: (state) => state.items.length,
    quantityOf: (state) => {
      return (itemType: string) =>
        state.items.find((i) => i.itemType === itemType)?.quantity ?? 0
    },
  },
  actions: {
    setItems(items: InventoryItem[]) {
      this.items = items
    },
    upsertItem(item: InventoryItem) {
      const existing = this.items.find((i) => i.itemType === item.itemType)
      if (existing) {
        existing.quantity = item.quantity
      } else {
        this.items.push(item)
      }
    },
    removeItem(itemType: string) {
      this.items = this.items.filter((i) => i.itemType !== itemType)
    },
    async fetchInventory(): Promise<void> {
      const userStore = useUserStore()
      const data = await apiGet<{ items: InventoryItem[] }>(
        '/resource/inventory',
        userStore.accessToken ?? undefined
      )
      this.setItems(data.items)
    },
  },
})
