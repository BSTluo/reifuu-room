<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiGet, apiPost, ApiRequestError } from '../../../api/http'
import { useUserStore } from '../../../stores/user'
import { useInventoryStore } from '../../../stores/inventory'
import { EventBus } from '../../../game/EventBus'
import type { OwnedChunkDTO } from '../../../api/types'

const userStore = useUserStore()
const inventoryStore = useInventoryStore()

const chunks = ref<OwnedChunkDTO[]>([])
const loading = ref(false)
const message = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | null = null
const confirmingAbandon = ref<string | null>(null)
const lastRefunded = ref<{ itemType: string; quantity: number }[] | null>(null)

const TEMPLATE_LABELS: Record<string, string> = {
  wooden_house: '木屋',
  stone_house: '石屋',
  advanced_house: '高级房屋',
}

function showToast(text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  message.value = { text, type }
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
  }, 3000)
}

async function fetchChunks() {
  loading.value = true
  try {
    const data = await apiGet<{ chunks: OwnedChunkDTO[] }>(
      '/build/my-chunks',
      userStore.accessToken ?? undefined,
    )
    chunks.value = data.chunks ?? []
  } catch (err) {
    showToast(err instanceof ApiRequestError ? err.message : '加载领地失败', 'error')
  } finally {
    loading.value = false
  }
}

async function toggleVisibility(chunk: OwnedChunkDTO) {
  try {
    await apiPost(
      '/build/visibility',
      { chunkId: chunk.chunkId, isPublic: !chunk.isPublic },
      userStore.accessToken ?? undefined,
    )
    chunk.isPublic = !chunk.isPublic
    showToast(`已切换为${chunk.isPublic ? '公开' : '私有'}`, 'success')
  } catch (err) {
    showToast(err instanceof ApiRequestError ? err.message : '切换失败', 'error')
  }
}

async function abandon(chunk: OwnedChunkDTO) {
  try {
    const data = await apiPost<{ refunded: { itemType: string; quantity: number }[] }>(
      '/build/abandon',
      { chunkId: chunk.chunkId },
      userStore.accessToken ?? undefined,
    )
    lastRefunded.value = data.refunded ?? []
    chunks.value = chunks.value.filter((c) => c.chunkId !== chunk.chunkId)
    EventBus.emit('build:abandoned', { chunkId: chunk.chunkId })
    await inventoryStore.fetchInventory()
    const refundText = (data.refunded ?? [])
      .map((r) => `${r.itemType} ×${r.quantity}`)
      .join(', ')
    showToast(`已放弃地块${refundText ? `，返还 ${refundText}` : ''}`, 'success')
  } catch (err) {
    showToast(err instanceof ApiRequestError ? err.message : '放弃失败', 'error')
  } finally {
    confirmingAbandon.value = null
  }
}

onMounted(fetchChunks)
</script>

<template>
  <section class="ownership-panel">
    <h3>我的领地</h3>
    <p v-if="loading" class="hint">加载中…</p>
    <p v-else-if="chunks.length === 0" class="empty">暂无领地，建造聊天室即可获得地块所有权。</p>
    <ul v-else class="chunk-list">
      <li v-for="chunk in chunks" :key="chunk.chunkId" class="chunk-item">
        <div class="chunk-info">
          <span class="chunk-id">{{ chunk.chunkId }}</span>
          <span v-if="chunk.roomName" class="chunk-room">· {{ chunk.roomName }}</span>
          <span v-if="chunk.template" class="chunk-template">{{ TEMPLATE_LABELS[chunk.template] ?? chunk.template }}</span>
          <span class="visibility-tag" :class="{ public: chunk.isPublic }">
            {{ chunk.isPublic ? '公开' : '私有' }}
          </span>
        </div>
        <div class="chunk-actions">
          <button class="btn-toggle" @click="toggleVisibility(chunk)">
            {{ chunk.isPublic ? '设为私有' : '设为公开' }}
          </button>
          <template v-if="confirmingAbandon === chunk.chunkId">
            <span class="confirm-text">确认？</span>
            <button class="btn-confirm" @click="abandon(chunk)">确定</button>
            <button class="btn-cancel" @click="confirmingAbandon = null">取消</button>
          </template>
          <button v-else class="btn-abandon" @click="confirmingAbandon = chunk.chunkId">
            放弃
          </button>
        </div>
      </li>
    </ul>
    <p v-if="message" class="ownership-msg" :class="`msg-${message.type}`">{{ message.text }}</p>
  </section>
</template>

<style scoped>
.ownership-panel {
  max-width: 480px;
}
.chunk-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.chunk-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.chunk-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.chunk-id {
  font-family: monospace;
  font-size: 0.85rem;
}
.chunk-room {
  font-size: 0.85rem;
  opacity: 0.8;
}
.chunk-template {
  font-size: 0.75rem;
  opacity: 0.6;
}
.visibility-tag {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
}
.visibility-tag.public {
  background: rgba(80, 200, 120, 0.25);
  color: #5fc880;
}
.chunk-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.btn-toggle, .btn-abandon, .btn-confirm, .btn-cancel {
  font-size: 0.8rem;
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  cursor: pointer;
}
.btn-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
}
.btn-abandon {
  color: #e57373;
}
.btn-abandon:hover {
  background: rgba(229, 115, 115, 0.15);
}
.btn-confirm {
  color: #e57373;
  border-color: rgba(229, 115, 115, 0.4);
}
.btn-confirm:hover {
  background: rgba(229, 115, 115, 0.2);
}
.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}
.confirm-text {
  font-size: 0.75rem;
  opacity: 0.7;
}
.ownership-msg {
  margin-top: 8px;
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 4px;
}
.msg-info { color: #64b5f6; }
.msg-warn { color: #ffb74d; }
.msg-error { color: #e57373; }
.msg-success { color: #5fc880; }
.empty, .hint {
  opacity: 0.6;
  font-size: 0.9rem;
}
</style>