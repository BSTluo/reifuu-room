<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useVehicleStore } from '../../../stores/vehicle'
import { EventBus } from '../../../game/EventBus'

const vehicleStore = useVehicleStore()

const message = ref<{ text: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null)
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  message.value = { text, type }
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = null
  }, 3000)
}

const VEHICLE_LABELS: Record<string, string> = {
  horse: '马匹',
  cart: '马车',
  ship: '帆船',
  airship: '飞艇',
}

// ---- 驾驶员：邀请乘客 ----
const inviteTargetId = ref('')
function handleInvite() {
  const target = inviteTargetId.value.trim()
  if (!target) {
    showToast('请输入要邀请的角色ID', 'warn')
    return
  }
  const characterId = Number(target)
  if (!Number.isInteger(characterId) || characterId <= 0) {
    showToast('角色ID必须是正整数', 'warn')
    return
  }
  vehicleStore.invitePassenger(characterId)
  inviteTargetId.value = ''
  showToast('邀请已发送', 'success')
}

// ---- 乘客：接受 / 拒绝邀请 ----
function handleAcceptInvite(inviteId: number) {
  vehicleStore.acceptBoard(inviteId)
}
function handleRejectInvite(inviteId: number) {
  vehicleStore.rejectBoard(inviteId)
}

// ---- 乘客：下车 ----
function handleExit() {
  if (!confirm('确定下车吗？')) return
  vehicleStore.exitVehicle()
}

// ---- 驾驶员：踢出乘客 ----
function handleKick(inviteId: number, nickname: string) {
  if (!confirm(`确定将 ${nickname} 踢下交通工具吗？`)) return
  vehicleStore.kickPassenger(inviteId)
}

// ---- 事件监听 ----
function onError(payload: { message: string }) {
  showToast(payload.message, 'error')
}
function onInvited(payload: { invite: { driverNickname: string; vehicleType: string } }) {
  showToast(`${payload.invite.driverNickname} 邀请你乘坐${VEHICLE_LABELS[payload.invite.vehicleType] ?? payload.invite.vehicleType}`, 'info')
}
function onInviteSent() {
  showToast('乘车邀请已发送', 'success')
  vehicleStore.fetchDriverPassengers()
}
function onBoarded(payload: { ride: { passengerNickname: string } }) {
  showToast(`${payload.ride.passengerNickname} 已上车`, 'success')
  vehicleStore.fetchDriverPassengers()
}
function onRejected() {
  showToast('对方拒绝了你的邀请', 'info')
}
function onForcedExit() {
  showToast('你已被驾驶员移出交通工具', 'error')
}

onMounted(() => {
  EventBus.on('socket:error', onError)
  EventBus.on('passenger:invited', onInvited)
  EventBus.on('passenger:invite-sent', onInviteSent)
  EventBus.on('passenger:boarded', onBoarded)
  EventBus.on('passenger:rejected', onRejected)
  EventBus.on('passenger:forced-exit', onForcedExit)
  vehicleStore.fetchMyRide()
  vehicleStore.fetchPendingInvites()
  vehicleStore.fetchDriverPassengers()
})

onBeforeUnmount(() => {
  EventBus.off('socket:error', onError)
  EventBus.off('passenger:invited', onInvited)
  EventBus.off('passenger:invite-sent', onInviteSent)
  EventBus.off('passenger:boarded', onBoarded)
  EventBus.off('passenger:rejected', onRejected)
  EventBus.off('passenger:forced-exit', onForcedExit)
})
</script>

<template>
  <div class="passenger-panel">
    <div class="passenger-header">
      <h3>🚗 载客系统</h3>
    </div>

    <p v-if="message" class="passenger-msg" :class="`msg-${message.type}`">{{ message.text }}</p>

    <!-- 我是乘客：当前乘车信息 -->
    <div v-if="vehicleStore.rideInfo" class="my-ride">
      <h4>当前乘车</h4>
      <div class="ride-info">
        <span class="ride-vehicle">{{ VEHICLE_LABELS[vehicleStore.rideInfo.vehicleType] ?? vehicleStore.rideInfo.vehicleType }}</span>
        <span class="ride-driver">驾驶员：{{ vehicleStore.rideInfo.driverNickname }}</span>
      </div>
      <p class="ride-hint">乘坐期间移动由驾驶员控制</p>
      <button class="btn-danger" @click="handleExit">下车</button>
    </div>

    <!-- 收到的乘车邀请 -->
    <div v-if="vehicleStore.pendingInvites.length" class="invites">
      <h4>收到的乘车邀请</h4>
      <ul>
        <li v-for="inv in vehicleStore.pendingInvites" :key="inv.id" class="invite-item">
          <div class="invite-info">
            <span class="invite-name">{{ inv.driverNickname }}</span>
            <span class="invite-meta">{{ VEHICLE_LABELS[inv.vehicleType] ?? inv.vehicleType }}</span>
          </div>
          <div class="invite-actions">
            <button class="btn-accept" @click="handleAcceptInvite(inv.id)">上车</button>
            <button class="btn-reject" @click="handleRejectInvite(inv.id)">拒绝</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- 我是驾驶员：管理乘客 -->
    <div v-if="vehicleStore.equipped && !vehicleStore.rideInfo" class="driver-section">
      <h4>邀请乘客</h4>
      <div class="invite-form">
        <input
          v-model="inviteTargetId"
          class="input"
          placeholder="输入玩家角色ID"
          @keyup.enter="handleInvite"
        />
        <button class="btn-primary" @click="handleInvite">邀请</button>
      </div>

      <div v-if="vehicleStore.driverPassengers.length" class="onboard-list">
        <h4>当前乘客 ({{ vehicleStore.driverPassengers.length }})</h4>
        <ul>
          <li v-for="p in vehicleStore.driverPassengers" :key="p.id" class="onboard-item">
            <div class="onboard-info">
              <span class="onboard-name">{{ p.passengerNickname }}</span>
              <span class="onboard-status" :class="`status-${p.status}`">
                {{ p.status === 'onboard' ? '已上车' : p.status === 'pending' ? '等待中' : p.status }}
              </span>
            </div>
            <div class="onboard-actions">
              <button v-if="p.status === 'onboard'" class="btn-reject" @click="handleKick(p.id, p.passengerNickname)">踢出</button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="!vehicleStore.equipped && !vehicleStore.rideInfo && !vehicleStore.pendingInvites.length" class="empty">
      装备交通工具后可邀请其他玩家乘坐
    </p>
  </div>
</template>

<style scoped>
.passenger-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
}
.passenger-header h3 {
  margin: 0;
  font-size: 15px;
}
.passenger-msg {
  margin: 0;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 4px;
}
.msg-info { background: rgba(77, 208, 225, 0.12); color: #4dd0e1; }
.msg-warn { background: rgba(255, 193, 7, 0.12); color: #ffc107; }
.msg-error { background: rgba(239, 83, 80, 0.12); color: #ef5350; }
.msg-success { background: rgba(102, 187, 106, 0.12); color: #66bb6a; }

.my-ride {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: rgba(77, 208, 225, 0.08);
  border-radius: 6px;
}
.my-ride h4,
.driver-section h4,
.invites h4,
.onboard-list h4 {
  margin: 0 0 4px;
  font-size: 13px;
  color: #4dd0e1;
}
.ride-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.ride-vehicle {
  font-weight: bold;
}
.ride-driver {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}
.ride-hint {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.invites ul,
.onboard-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.invite-item,
.onboard-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}
.invite-info,
.onboard-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.invite-name,
.onboard-name {
  font-size: 13px;
  font-weight: bold;
}
.invite-meta,
.onboard-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}
.status-onboard { color: #66bb6a; }
.status-pending { color: #ffc107; }

.invite-actions,
.onboard-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.driver-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.invite-form {
  display: flex;
  gap: 6px;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
}
.input:focus {
  outline: none;
  border-color: #4dd0e1;
}

.btn-primary,
.btn-accept,
.btn-reject,
.btn-danger {
  padding: 6px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: #fff;
}
.btn-primary { background: #4dd0e1; color: #003740; font-weight: bold; }
.btn-accept { background: #66bb6a; }
.btn-reject { background: rgba(255, 255, 255, 0.15); }
.btn-danger { background: #ef5350; align-self: flex-start; }
.btn-primary:hover { filter: brightness(1.1); }
.btn-accept:hover { filter: brightness(1.1); }
.btn-reject:hover { filter: brightness(1.2); }
.btn-danger:hover { filter: brightness(1.1); }

.empty {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  padding: 12px 0;
}
</style>