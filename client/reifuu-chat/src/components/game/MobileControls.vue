<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { EventBus } from '../../game/EventBus'

const emit = defineEmits<{
  (e: 'action', action: string): void
}>()

// Virtual joystick state
const joystickActive = ref(false)
const joystickX = ref(0)
const joystickY = ref(0)
const joystickStyle = ref({})

let joystickTouchId: number | null = null
let centerX = 0
let centerY = 0
const JOYSTICK_RADIUS = 50

function handleJoystickStart(e: TouchEvent) {
  const touch = e.changedTouches[0]
  joystickTouchId = touch.identifier
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  centerX = rect.left + rect.width / 2
  centerY = rect.top + rect.height / 2
  joystickActive.value = true
  updateJoystick(touch.clientX, touch.clientY)
}

function handleJoystickMove(e: TouchEvent) {
  if (joystickTouchId === null) return
  const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId)
  if (!touch) return
  updateJoystick(touch.clientX, touch.clientY)
  e.preventDefault()
}

function handleJoystickEnd(e: TouchEvent) {
  const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId)
  if (!touch) return
  joystickTouchId = null
  joystickActive.value = false
  joystickX.value = 0
  joystickY.value = 0
  joystickStyle.value = { transform: 'translate(-50%, -50%)' }
  EventBus.emit('ui:move-player', { dx: 0, dy: 0 })
}

function updateJoystick(clientX: number, clientY: number) {
  let dx = clientX - centerX
  let dy = clientY - centerY
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance > JOYSTICK_RADIUS) {
    dx = (dx / distance) * JOYSTICK_RADIUS
    dy = (dy / distance) * JOYSTICK_RADIUS
  }

  joystickX.value = dx / JOYSTICK_RADIUS
  joystickY.value = dy / JOYSTICK_RADIUS

  joystickStyle.value = {
    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }

  // Emit movement based on joystick direction
  const threshold = 0.3
  let moveX = 0
  let moveY = 0
  if (Math.abs(joystickX.value) > threshold) {
    moveX = joystickX.value > 0 ? 1 : -1
  }
  if (Math.abs(joystickY.value) > threshold) {
    moveY = joystickY.value > 0 ? 1 : -1
  }
  EventBus.emit('ui:move-player', { dx: moveX, dy: moveY })
}

// Action buttons
function handleAction(action: string) {
  emit('action', action)
}

// Prevent default touch behavior on game canvas
function preventTouchDefault(e: TouchEvent) {
  if (e.target instanceof HTMLElement) {
    const tagName = e.target.tagName.toLowerCase()
    if (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'button') {
      e.preventDefault()
    }
  }
}

onMounted(() => {
  document.addEventListener('touchmove', preventTouchDefault, { passive: false })
})

onUnmounted(() => {
  document.removeEventListener('touchmove', preventTouchDefault)
})
</script>

<template>
  <div class="mobile-controls">
    <!-- Virtual Joystick -->
    <div 
      class="joystick-area"
      @touchstart.passive="handleJoystickStart"
      @touchmove="handleJoystickMove"
      @touchend.passive="handleJoystickEnd"
      @touchcancel.passive="handleJoystickEnd"
    >
      <div class="joystick-base">
        <div 
          class="joystick-knob"
          :class="{ active: joystickActive }"
          :style="joystickStyle"
        />
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <button class="action-btn-mobile interact-btn" @touchstart.prevent="handleAction('interact')">
        <span class="btn-icon">E</span>
        <span class="btn-label">交互</span>
      </button>
      <button class="action-btn-mobile menu-btn" @touchstart.prevent="handleAction('menu')">
        <span class="btn-icon">☰</span>
        <span class="btn-label">菜单</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mobile-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 20px;
  pointer-events: none;
  z-index: 100;
}

.joystick-area {
  width: 140px;
  height: 140px;
  pointer-events: auto;
  touch-action: none;
}

.joystick-base {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
}

.joystick-knob {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  border: 2px solid rgba(255, 255, 255, 0.8);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: background 0.1s;
}

.joystick-knob.active {
  background: rgba(77, 208, 225, 0.8);
  border-color: #4dd0e1;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: auto;
}

.action-btn-mobile {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.4);
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.action-btn-mobile:active {
  background: rgba(77, 208, 225, 0.4);
  border-color: #4dd0e1;
}

.btn-icon {
  font-size: 20px;
  line-height: 1;
}

.btn-label {
  font-size: 10px;
  margin-top: 2px;
}

.interact-btn {
  background: rgba(76, 175, 80, 0.3);
  border-color: rgba(76, 175, 80, 0.6);
}

.interact-btn:active {
  background: rgba(76, 175, 80, 0.6);
}

.menu-btn {
  background: rgba(33, 150, 243, 0.3);
  border-color: rgba(33, 150, 243, 0.6);
}

.menu-btn:active {
  background: rgba(33, 150, 243, 0.6);
}
</style>
