import { defineStore } from 'pinia'

export interface InventoryItem {
  id: string
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
  },
  actions: {
    setItems(items: InventoryItem[]) {
      this.items = items
    },
    upsertItem(item: InventoryItem) {
      const existing = this.items.find((i) => i.id === item.id)
      if (existing) {
        existing.quantity = item.quantity
      } else {
        this.items.push(item)
      }
    },
    removeItem(itemId: string) {
      this.items = this.items.filter((i) => i.id !== itemId)
    },
  },
})
