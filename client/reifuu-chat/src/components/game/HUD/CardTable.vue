<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EventBus } from '../../../game/EventBus'
import { usePluginStore } from '../../../stores/plugin'
import { useCharacterStore } from '../../../stores/character'

const props = defineProps<{ roomId: string }>()
const emit = defineEmits<{ close: [] }>()

const pluginStore = usePluginStore()
const characterStore = useCharacterStore()

const PLUGIN_ID = 'doudizhu'

// 斗地主牌型描述
const CARD_TYPES = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  bomb: '炸弹',
  rocket: '王炸',
}

// 简化扑克牌数据
interface Card {
  id: string
  value: number // 3=3, 4=4... J=11, Q=12, K=13, A=14, 2=15, 小王=16, 大王=17
  suit: 'spade' | 'heart' | 'club' | 'diamond' | 'joker'
  display: string
}

// --- local UI state ---
const myCards = ref<Card[]>([])
const selectedCards = ref<Set<string>>(new Set())
const currentTurn = ref<string>('')
const lastPlay = ref<{ player: string; type: string; cards: Card[] } | null>(null)
const landlordId = ref<string | null>(null)
const phase = ref<'waiting' | 'playing' | 'finished'>('waiting')
const message = ref('')

const isController = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return String(state?.controllerId) === String(characterStore.characterId)
})

const isMyTurn = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return (state?.currentTurn as string) === characterStore.characterId
})

const players = computed(() => {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  return (state?.players as Array<{ characterId: string; nickname: string; cardCount: number }>) ?? []
})

// 从插件状态同步
function applyRemoteState() {
  const state = pluginStore.getPluginState(props.roomId, PLUGIN_ID)
  if (!state) return

  if (state.myCards) {
    myCards.value = state.myCards as Card[]
  }
  currentTurn.value = (state.currentTurn as string) ?? ''
  lastPlay.value = (state.lastPlay as { player: string; type: string; cards: Card[] } | null) ?? null
  landlordId.value = (state.landlordId as string) ?? null
  phase.value = (state.phase as 'waiting' | 'playing' | 'finished') ?? 'waiting'
  selectedCards.value.clear()
}

// 控制器操作：开始游戏（发牌）
function startGame() {
  if (!isController.value) return
  // 简化：随机生成发牌结果，由控制器同步
  const deck = createDeck()
  shuffle(deck)

  // 简化3人发牌（每人17张+3张底牌）
  const playerCount = Math.max(2, Math.min(4, players.value.length || 3))
  const hands: Card[][] = []
  const cardsPerPlayer = Math.floor(deck.length / playerCount)

  for (let i = 0; i < playerCount; i++) {
    const start = i * cardsPerPlayer
    const end = start + cardsPerPlayer
    hands.push(sortCards(deck.slice(start, end)))
  }

  // 第一人为地主，多拿剩余牌
  if (hands.length > 0) {
    const remainderStart = playerCount * cardsPerPlayer
    hands[0].push(...sortCards(deck.slice(remainderStart)))
    hands[0] = sortCards(hands[0])
  }

  // 同步状态
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    phase: 'playing',
    currentTurn: players.value[0]?.characterId ?? characterStore.characterId,
    lastPlay: null,
    landlordId: players.value[0]?.characterId ?? characterStore.characterId,
    // 简化：只发送自己的手牌，实际应该每人各自持有
    myCards: hands[0],
  })
}

// 选择/取消选择手牌
function toggleCard(card: Card) {
  if (selectedCards.value.has(card.id)) {
    selectedCards.value.delete(card.id)
  } else {
    selectedCards.value.add(card.id)
  }
  selectedCards.value = new Set(selectedCards.value) // trigger reactivity
}

// 出牌
function playSelected() {
  if (!isMyTurn.value || selectedCards.value.size === 0) return

  const selected = myCards.value.filter((c) => selectedCards.value.has(c.id))
  const cardType = detectCardType(selected)

  if (!cardType) {
    message.value = '无效的牌型'
    return
  }

  // 发送出牌到所有玩家
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    lastPlay: {
      player: characterStore.characterId,
      type: cardType,
      cards: selected,
    },
    // 从自己手牌中移除已出的牌
    myCards: myCards.value.filter((c) => !selectedCards.value.has(c.id)),
  })

  selectedCards.value.clear()
  message.value = ''
}

// 过牌
function pass() {
  if (!isMyTurn.value || !lastPlay.value) return
  // 下一家
  const idx = players.value.findIndex((p) => p.characterId === currentTurn.value)
  const nextIdx = (idx + 1) % players.value.length
  pluginStore.syncPluginState(props.roomId, PLUGIN_ID, {
    currentTurn: players.value[nextIdx]?.characterId ?? currentTurn.value,
  })
}

// --- 辅助函数 ---

function createDeck(): Card[] {
  const suits: Array<Card['suit']> = ['spade', 'heart', 'club', 'diamond']
  const displayMap: Record<number, string> = {
    11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '🃏', 17: '👑',
  }
  const cards: Card[] = []
  for (const suit of suits) {
    for (let v = 3; v <= 15; v++) {
      cards.push({
        id: `${suit}-${v}`,
        value: v,
        suit: suit,
        display: displayMap[v] ?? String(v),
      })
    }
  }
  // 小王、大王
  cards.push({ id: 'joker-16', value: 16, suit: 'joker', display: '🃏' })
  cards.push({ id: 'joker-17', value: 17, suit: 'joker', display: '👑' })
  return cards
}

function shuffle(arr: Card[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.value - b.value)
}

function detectCardType(cards: Card[]): string | null {
  if (cards.length === 0) return null
  if (cards.length === 1) return CARD_TYPES.single
  if (cards.length === 2) {
    // 王炸
    if (cards.every((c) => c.suit === 'joker')) return CARD_TYPES.rocket
    // 对子
    if (cards[0].value === cards[1].value) return CARD_TYPES.pair
    return null
  }
  if (cards.length === 3 && cards.every((c) => c.value === cards[0].value)) {
    return CARD_TYPES.triple
  }
  if (cards.length === 4 && cards.every((c) => c.value === cards[0].value)) {
    return CARD_TYPES.bomb
  }
  return null
}

// 监听插件状态变化
watch(
  () => pluginStore.getPluginState(props.roomId, PLUGIN_ID),
  () => applyRemoteState(),
  { deep: true },
)

onMounted(() => {
  applyRemoteState()
})
</script>

<template>
  <div class="card-table">
    <div class="card-header">
      <span class="table-title">🃏 牌桌 · 斗地主</span>
      <button class="close-btn" @click="emit('close')">✕</button>
    </div>

    <div class="game-status">
      <p v-if="phase === 'waiting'" class="status-text">等待开始…</p>
      <p v-else-if="phase === 'playing'" class="status-text">
        当前回合：{{ players.find((p) => p.characterId === currentTurn)?.nickname ?? '?' }}
        <span v-if="isMyTurn">（你）</span>
      </p>
    </div>

    <div v-if="lastPlay" class="last-play">
      <span class="last-play-label">上一手：</span>
      <span class="last-play-type">{{ lastPlay.type }}</span>
      <div class="last-play-cards">
        <span v-for="card in lastPlay.cards" :key="card.id" class="mini-card">{{ card.display }}</span>
      </div>
    </div>

    <div v-if="phase === 'waiting' && isController" class="start-controls">
      <button class="start-btn" @click="startGame">开始游戏</button>
    </div>

    <div v-if="phase === 'playing'" class="player-hands">
      <div class="hand-label">你的手牌 ({{ myCards.length }})</div>
      <div class="cards-row">
        <button
          v-for="card in myCards"
          :key="card.id"
          class="playing-card"
          :class="{ selected: selectedCards.has(card.id) }"
          @click="toggleCard(card)"
        >
          {{ card.display }}
        </button>
      </div>
    </div>

    <div v-if="phase === 'playing'" class="action-buttons">
      <button class="action-btn play" :disabled="!isMyTurn || selectedCards.size === 0" @click="playSelected">
        出牌
      </button>
      <button class="action-btn pass" :disabled="!isMyTurn || !lastPlay" @click="pass">
        过
      </button>
    </div>

    <p v-if="message" class="message">{{ message }}</p>
    <p v-if="!isController && phase === 'waiting'" class="hint">等待房主开始游戏</p>
  </div>
</template>

<style scoped>
.card-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-title {
  font-weight: bold;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  color: #9fb2c0;
  cursor: pointer;
  font-size: 14px;
}

.game-status {
  text-align: center;
}

.status-text {
  font-size: 13px;
  color: #4dd0e1;
  margin: 0;
}

.last-play {
  background: #1a2530;
  border: 1px solid #3c4b59;
  border-radius: 4px;
  padding: 6px 8px;
}

.last-play-label {
  font-size: 11px;
  color: #9fb2c0;
}

.last-play-type {
  font-size: 12px;
  font-weight: bold;
  margin-left: 4px;
}

.last-play-cards {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}

.mini-card {
  display: inline-block;
  background: #fff;
  color: #000;
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  min-width: 18px;
  text-align: center;
}

.start-controls {
  text-align: center;
  padding: 12px;
}

.start-btn {
  padding: 8px 20px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.player-hands {
  background: #1a2530;
  border: 1px solid #3c4b59;
  border-radius: 4px;
  padding: 8px;
}

.hand-label {
  font-size: 12px;
  color: #9fb2c0;
  margin-bottom: 6px;
}

.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  max-height: 140px;
  overflow-y: auto;
}

.playing-card {
  background: #fff;
  color: #000;
  border: 2px solid #3c4b59;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  cursor: pointer;
  min-width: 24px;
  text-align: center;
  transition: transform 0.1s;
}

.playing-card:hover {
  border-color: #4dd0e1;
}

.playing-card.selected {
  transform: translateY(-8px);
  border-color: #4dd0e1;
  background: #e0f7fa;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.action-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #fff;
}

.action-btn.play {
  background: #4caf50;
}

.action-btn.pass {
  background: #ff9800;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message {
  font-size: 12px;
  color: #ff8a80;
  text-align: center;
  margin: 0;
}

.hint {
  font-size: 11px;
  color: #9fb2c0;
  text-align: center;
  margin: 0;
}
</style>