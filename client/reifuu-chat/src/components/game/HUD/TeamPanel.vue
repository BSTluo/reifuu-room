<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTeamStore } from '../../../stores/team'
import { EventBus } from '../../../game/EventBus'
import { apiGet } from '../../../api/http'
import type { TeamSearchResultDTO } from '../../../api/types'

const teamStore = useTeamStore()

const activeTab = ref<'team' | 'search' | 'chat'>('team')

const message = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  message.value = { text, type }
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
  }, 3000)
}

// ---- 创建团队 ----
const createName = ref('')
function handleCreate() {
  const name = createName.value.trim()
  if (!name) {
    showToast('请输入团队名称', 'warn')
    return
  }
  teamStore.create(name)
  createName.value = ''
}

// ---- 邀请 / 申请 ----
const inviteTargetId = ref('')
function handleInvite() {
  const target = inviteTargetId.value.trim()
  if (!target) {
    showToast('请输入要邀请的角色ID', 'warn')
    return
  }
  teamStore.invite(target)
  inviteTargetId.value = ''
}

const searchKeyword = ref('')
const searchResults = ref<TeamSearchResultDTO[]>([])
const searching = ref(false)
async function handleSearch() {
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    showToast('请输入团队名称关键词', 'warn')
    return
  }
  searching.value = true
  try {
    const res = await apiGet<{ teams: TeamSearchResultDTO[] }>(`/team/search?keyword=${encodeURIComponent(keyword)}`)
    searchResults.value = res.teams ?? []
    if (!searchResults.value.length) showToast('未找到匹配的团队', 'info')
  } catch (e: any) {
    showToast(e?.message ?? '搜索失败', 'error')
  } finally {
    searching.value = false
  }
}

function handleApply(teamId: number, teamName: string) {
  teamStore.apply(teamId)
  showToast(`已向「${teamName}」提交申请`, 'success')
}

// ---- 邀请 / 申请 处理 ----
function handleAcceptInvitation(id: number) {
  teamStore.acceptInvitation(id)
}
function handleRejectInvitation(id: number) {
  teamStore.rejectInvitation(id)
}
function handleAcceptApplication(id: number) {
  teamStore.acceptApplication(id)
}
function handleRejectApplication(id: number) {
  teamStore.rejectApplication(id)
}

// ---- 成员管理 ----
function handleKick(characterId: string, nickname: string) {
  if (!confirm(`确定将 ${nickname} 踢出团队吗？`)) return
  teamStore.kick(characterId)
}
function handleTransfer(characterId: string, nickname: string) {
  if (!confirm(`确定将队长转让给 ${nickname} 吗？`)) return
  teamStore.transfer(characterId)
}
function handleLeave() {
  if (!confirm('确定退出团队吗？')) return
  teamStore.leave()
}
function handleDisband() {
  if (!confirm('确定解散团队吗？此操作不可撤销！')) return
  teamStore.disband()
}

// ---- 团队聊天 ----
const chatInput = ref('')
function handleSendChat() {
  const content = chatInput.value.trim()
  if (!content) return
  teamStore.sendChat(content)
  chatInput.value = ''
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function roleLabel(role: string): string {
  return role === 'leader' ? '队长' : '成员'
}

// ---- 事件监听 ----
function onError(payload: { message: string }) {
  showToast(payload.message, 'error')
}
function onInviteReceived(payload: { teamName: string; fromNickname: string }) {
  showToast(`${fromNickname} 邀请你加入「${payload.teamName}」`, 'success')
}
function onApplicationReceived(payload: { nickname: string }) {
  showToast(`${payload.nickname} 申请加入团队`, 'info')
}
function onMemberJoined(payload: { nickname: string }) {
  showToast(`${payload.nickname} 加入了团队`, 'success')
}
function onMemberLeft(payload: { nickname: string }) {
  showToast(`${payload.nickname} 离开了团队`, 'info')
}
function onKicked() {
  showToast('你已被移出团队', 'error')
}
function onDisbanded() {
  showToast('团队已解散', 'error')
}

onMounted(() => {
  EventBus.on('socket:error', onError)
  EventBus.on('team:invite-received', onInviteReceived)
  EventBus.on('team:application-received', onApplicationReceived)
  EventBus.on('team:member-joined', onMemberJoined)
  EventBus.on('team:member-left', onMemberLeft)
  EventBus.on('team:kicked', onKicked)
  EventBus.on('team:disbanded', onDisbanded)
  teamStore.requestState()
})

onBeforeUnmount(() => {
  EventBus.off('socket:error', onError)
  EventBus.off('team:invite-received', onInviteReceived)
  EventBus.off('team:application-received', onApplicationReceived)
  EventBus.off('team:member-joined', onMemberJoined)
  EventBus.off('team:member-left', onMemberLeft)
  EventBus.off('team:kicked', onKicked)
  EventBus.off('team:disbanded', onDisbanded)
})

const chunkUsagePercent = computed(() => {
  const u = teamStore.chunkUsage
  if (!u || u.limit <= 0) return 0
  return Math.min(100, Math.round((u.used / u.limit) * 100))
})
</script>

<template>
  <div class="team-panel">
    <div class="team-header">
      <h3>👥 团队</h3>
      <span v-if="teamStore.inTeam" class="team-name">{{ teamStore.team?.name }}</span>
    </div>

    <p v-if="message" class="team-msg" :class="`msg-${message.type}`">{{ message.text }}</p>

    <!-- 未加入团队：创建 / 搜索 -->
    <div v-if="!teamStore.inTeam" class="no-team">
      <div class="create-form">
        <input
          v-model="createName"
          class="input"
          placeholder="团队名称（最多30字）"
          maxlength="30"
          @keyup.enter="handleCreate"
        />
        <button class="btn-primary" @click="handleCreate">创建团队</button>
      </div>

      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">
          搜索团队
        </button>
      </div>

      <div v-if="activeTab === 'search'" class="search-form">
        <input
          v-model="searchKeyword"
          class="input"
          placeholder="输入团队名称关键词"
          @keyup.enter="handleSearch"
        />
        <button class="btn-primary" :disabled="searching" @click="handleSearch">搜索</button>
      </div>

      <ul v-if="searchResults.length" class="search-results">
        <li v-for="t in searchResults" :key="t.teamId" class="search-item">
          <div class="search-info">
            <span class="search-name">{{ t.name }}</span>
            <span class="search-meta">队长 {{ t.leaderNickname }} · {{ t.memberCount }} 人</span>
          </div>
          <button class="btn-apply" @click="handleApply(t.teamId, t.name)">申请</button>
        </li>
      </ul>

      <!-- 收到的邀请 -->
      <div v-if="teamStore.invitations.length" class="invitations">
        <h4>收到的邀请</h4>
        <ul>
          <li v-for="inv in teamStore.invitations" :key="inv.id" class="invitation-item">
            <div class="invitation-info">
              <span class="invitation-name">{{ inv.teamName }}</span>
              <span class="invitation-meta">来自 {{ inv.fromNickname }}</span>
            </div>
            <div class="invitation-actions">
              <button class="btn-accept" @click="handleAcceptInvitation(inv.id)">接受</button>
              <button class="btn-reject" @click="handleRejectInvitation(inv.id)">拒绝</button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- 已加入团队 -->
    <div v-else class="in-team">
      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'team' }" @click="activeTab = 'team'">
          成员 ({{ teamStore.members.length }})
        </button>
        <button class="tab" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">
          聊天
        </button>
      </div>

      <!-- 地块使用情况 -->
      <div v-if="teamStore.chunkUsage" class="chunk-usage">
        <div class="chunk-usage-row">
          <span>地块使用</span>
          <span>{{ teamStore.chunkUsage.used }} / {{ teamStore.chunkUsage.limit }}</span>
        </div>
        <div class="chunk-bar">
          <div class="chunk-bar-fill" :style="{ width: chunkUsagePercent + '%' }"></div>
        </div>
      </div>

      <!-- 成员列表 -->
      <div v-if="activeTab === 'team'" class="member-list">
        <ul>
          <li v-for="m in teamStore.sortedMembers" :key="m.characterId" class="member-item">
            <div class="member-info">
              <span class="member-name">
                {{ m.nickname }}
                <span v-if="m.role === 'leader'" class="leader-badge">队长</span>
              </span>
              <span class="member-status" :class="{ online: m.isOnline }">
                {{ m.isOnline ? '在线' : '离线' }}
              </span>
            </div>
            <div v-if="teamStore.isLeader && m.characterId !== teamStore.team?.leaderCharacterId" class="member-actions">
              <button class="btn-transfer" @click="handleTransfer(m.characterId, m.nickname)">转让</button>
              <button class="btn-kick" @click="handleKick(m.characterId, m.nickname)">踢出</button>
            </div>
          </li>
        </ul>

        <!-- 队长：邀请成员 -->
        <div v-if="teamStore.isLeader" class="invite-form">
          <input
            v-model="inviteTargetId"
            class="input"
            placeholder="输入角色ID邀请加入"
            @keyup.enter="handleInvite"
          />
          <button class="btn-primary" @click="handleInvite">邀请</button>
        </div>

        <!-- 队长：待处理申请 -->
        <div v-if="teamStore.isLeader && teamStore.applications.length" class="applications">
          <h4>待处理申请</h4>
          <ul>
            <li v-for="app in teamStore.applications" :key="app.id" class="application-item">
              <div class="application-info">
                <span class="application-name">{{ app.nickname }}</span>
                <span v-if="app.message" class="application-message">{{ app.message }}</span>
              </div>
              <div class="application-actions">
                <button class="btn-accept" @click="handleAcceptApplication(app.id)">接受</button>
                <button class="btn-reject" @click="handleRejectApplication(app.id)">拒绝</button>
              </div>
            </li>
          </ul>
        </div>

        <!-- 团队操作 -->
        <div class="team-actions">
          <button v-if="teamStore.isLeader" class="btn-danger" @click="handleDisband">解散团队</button>
          <button v-else class="btn-danger" @click="handleLeave">退出团队</button>
        </div>
      </div>

      <!-- 团队聊天 -->
      <div v-else-if="activeTab === 'chat'" class="team-chat">
        <div class="chat-messages">
          <div v-for="(msg, i) in teamStore.sortedChat" :key="i" class="chat-message">
            <span class="chat-from">{{ msg.fromNickname }}</span>
            <span class="chat-time">{{ formatTime(msg.timestamp) }}</span>
            <div class="chat-content">{{ msg.content }}</div>
          </div>
          <p v-if="!teamStore.chatMessages.length" class="empty">还没有聊天记录</p>
        </div>
        <div class="chat-input-row">
          <input
            v-model="chatInput"
            class="input"
            placeholder="输入团队消息…"
            maxlength="500"
            @keyup.enter="handleSendChat"
          />
          <button class="btn-primary" @click="handleSendChat">发送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
}
.team-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-header h3 {
  margin: 0;
  font-size: 15px;
}
.team-name {
  font-size: 13px;
  color: #4dd0e1;
}
.team-msg {
  margin: 0;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 4px;
}
.msg-info { background: rgba(77, 208, 225, 0.12); color: #4dd0e1; }
.msg-warn { background: rgba(255, 193, 7, 0.12); color: #ffc107; }
.msg-error { background: rgba(239, 83, 80, 0.12); color: #ef5350; }
.msg-success { background: rgba(102, 187, 106, 0.12); color: #66bb6a; }

.tabs {
  display: flex;
  gap: 4px;
}
.tab {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #90a4ae;
  border-radius: 4px;
  cursor: pointer;
}
.tab.active {
  border-color: #4dd0e1;
  background: rgba(77, 208, 225, 0.12);
  color: #4dd0e1;
}

.input {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #e0e0e0;
}
.input::placeholder { color: #78909c; }

.btn-primary {
  padding: 6px 10px;
  font-size: 12px;
  background: rgba(77, 208, 225, 0.15);
  border: 1px solid #4dd0e1;
  color: #4dd0e1;
  border-radius: 4px;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-accept {
  padding: 3px 8px;
  font-size: 11px;
  background: rgba(102, 187, 106, 0.15);
  border: 1px solid #66bb6a;
  color: #66bb6a;
  border-radius: 4px;
  cursor: pointer;
}
.btn-reject {
  padding: 3px 8px;
  font-size: 11px;
  background: rgba(239, 83, 80, 0.15);
  border: 1px solid #ef5350;
  color: #ef5350;
  border-radius: 4px;
  cursor: pointer;
}
.btn-transfer {
  padding: 3px 8px;
  font-size: 11px;
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid #ffc107;
  color: #ffc107;
  border-radius: 4px;
  cursor: pointer;
}
.btn-kick {
  padding: 3px 8px;
  font-size: 11px;
  background: rgba(239, 83, 80, 0.15);
  border: 1px solid #ef5350;
  color: #ef5350;
  border-radius: 4px;
  cursor: pointer;
}
.btn-danger {
  padding: 6px 10px;
  font-size: 12px;
  background: rgba(239, 83, 80, 0.15);
  border: 1px solid #ef5350;
  color: #ef5350;
  border-radius: 4px;
  cursor: pointer;
}
.btn-apply {
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(77, 208, 225, 0.15);
  border: 1px solid #4dd0e1;
  color: #4dd0e1;
  border-radius: 4px;
  cursor: pointer;
}

.create-form,
.search-form,
.invite-form,
.chat-input-row {
  display: flex;
  gap: 6px;
}

.no-team {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-results,
.invitations,
.applications,
.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.search-results ul,
.invitations ul,
.applications ul,
.member-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-item,
.invitation-item,
.application-item,
.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}
.search-info,
.invitation-info,
.application-info,
.member-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.search-name,
.invitation-name,
.application-name,
.member-name {
  font-size: 13px;
  color: #e0e0e0;
}
.search-meta,
.invitation-meta,
.application-message {
  font-size: 11px;
  color: #78909c;
}
.invitation-actions,
.application-actions,
.member-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.leader-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  font-size: 10px;
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
  border-radius: 3px;
}
.member-status {
  font-size: 11px;
  color: #78909c;
}
.member-status.online {
  color: #66bb6a;
}

.chunk-usage {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chunk-usage-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #90a4ae;
}
.chunk-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}
.chunk-bar-fill {
  height: 100%;
  background: #4dd0e1;
  border-radius: 3px;
  transition: width 0.3s;
}

.team-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.team-chat {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chat-messages {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chat-message {
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}
.chat-from {
  font-size: 12px;
  color: #4dd0e1;
  margin-right: 6px;
}
.chat-time {
  font-size: 10px;
  color: #78909c;
}
.chat-content {
  font-size: 13px;
  color: #e0e0e0;
  margin-top: 2px;
  word-break: break-word;
}
.empty {
  font-size: 12px;
  color: #78909c;
  text-align: center;
  padding: 12px 0;
}
</style>
