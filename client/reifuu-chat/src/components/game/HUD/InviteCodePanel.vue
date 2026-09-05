<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCharacterStore } from '../../../stores/character'

const characterStore = useCharacterStore()
const copiedCode = ref<string | null>(null)

onMounted(() => {
  characterStore.listInviteCodes().catch(() => {})
})

async function handleGenerate() {
  try {
    await characterStore.createInviteCode()
  } catch {
    // store sets error state
  }
}

async function handleRevoke(codeId: number) {
  try {
    await characterStore.revokeInviteCode(codeId)
  } catch {
    // store sets error state
  }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code).then(() => {
    copiedCode.value = code
    setTimeout(() => { copiedCode.value = null }, 2000)
  })
}

function statusLabel(status: string): string {
  if (status === 'active') return '可用'
  if (status === 'used') return '已使用'
  if (status === 'revoked') return '已撤销'
  return status
}
</script>

<template>
  <section class="invite-panel">
    <h3>邀请码</h3>
    <p class="invite-desc">分享邀请码给好友，新角色输入后可直接出生在你所在地块。</p>

    <button class="generate-btn" :disabled="characterStore.inviteCodes.length >= 5" @click="handleGenerate">
      {{ characterStore.inviteCodes.length >= 5 ? '已达上限(5)' : '生成邀请码' }}
    </button>

    <p v-if="characterStore.inviteError" class="invite-error">{{ characterStore.inviteError }}</p>

    <ul v-if="characterStore.inviteCodes.length" class="code-list">
      <li v-for="code in characterStore.inviteCodes" :key="code.id" :class="['code-item', `status-${code.status}`]">
        <div class="code-info">
          <span class="code-text">{{ code.code }}</span>
          <span class="code-status">{{ statusLabel(code.status) }}</span>
          <span v-if="code.usedByNickname" class="code-used-by">→ {{ code.usedByNickname }}</span>
        </div>
        <div class="code-actions">
          <button v-if="code.status === 'active'" class="copy-btn" @click="copyCode(code.code)">
            {{ copiedCode === code.code ? '✓ 已复制' : '复制' }}
          </button>
          <button v-if="code.status === 'active'" class="revoke-btn" @click="handleRevoke(code.id)">撤销</button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">暂无邀请码</p>
  </section>
</template>

<style scoped>
.invite-panel {
  background: #18232b;
  color: #f1e8d0;
  padding: 12px;
  border-radius: 8px;
  min-width: 220px;
}

.invite-panel h3 {
  margin: 0 0 6px;
}

.invite-desc {
  font-size: 11px;
  color: #b0a090;
  margin: 0 0 8px;
}

.generate-btn {
  width: 100%;
  padding: 8px;
  background: #4a6fa5;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.invite-error {
  color: #ff6b6b;
  font-size: 11px;
  margin: 4px 0;
}

.code-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

.code-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #2c3e50;
}

.code-item:last-child {
  border-bottom: none;
}

.code-item.status-used,
.code-item.status-revoked {
  opacity: 0.6;
}

.code-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.code-text {
  font-family: monospace;
  font-size: 15px;
  letter-spacing: 2px;
  font-weight: 700;
  color: #ffd700;
}

.code-status {
  font-size: 10px;
  color: #b0a090;
}

.code-used-by {
  font-size: 10px;
  color: #88cc88;
}

.code-actions {
  display: flex;
  gap: 4px;
}

.copy-btn,
.revoke-btn {
  padding: 3px 8px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.copy-btn {
  background: #4a6fa5;
  color: #fff;
}

.revoke-btn {
  background: #c0392b;
  color: #fff;
}

.empty {
  color: #888;
  font-size: 12px;
  margin: 8px 0 0;
}
</style>