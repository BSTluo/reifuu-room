<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ApiRequestError } from '../api/http'
import { useCharacterStore } from '../stores/character'
import { useUserStore } from '../stores/user'
import type { Continent, SpawnMethod } from '../api/types'

const emit = defineEmits<{ 'character-created': [] }>()

const characterStore = useCharacterStore()
const userStore = useUserStore()

const nickname = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
]

const HAIRSTYLES = [
  { value: 'short', label: '短发' },
  { value: 'long', label: '长发' },
  { value: 'ponytail', label: '双马尾' },
]

const SKIN_TONES = [
  { value: 'fair', label: '白皙' },
  { value: 'tan', label: '健康色' },
  { value: 'dark', label: '深肤色' },
]

const OUTFITS = [
  { value: 'villager', label: '村民装' },
  { value: 'traveler', label: '旅行者装' },
  { value: 'noble', label: '贵族装' },
]

const CONTINENTS: { value: Continent; name: string; theme: string; color: string; description: string }[] = [
  { value: 'east', name: '东洲', theme: '竹林渔村', color: '#5C8B6F', description: '静谧、雅致、水墨感' },
  { value: 'south', name: '南洲', theme: '草原农庄', color: '#E8B44F', description: '温暖、丰收、田园风' },
  { value: 'west', name: '西洲', theme: '矿山丘陵', color: '#A0522D', description: '粗犷、工业、矿石质感' },
  { value: 'north', name: '北洲', theme: '雪原城堡', color: '#6EB5D1', description: '寒冷、庄严、哥特式' },
]

const appearance = reactive({
  gender: GENDERS[0].value,
  hair: HAIRSTYLES[0].value,
  skin: SKIN_TONES[0].value,
  outfit: OUTFITS[0].value,
})

const startContinent = ref<Continent>('east')
const spawnMethod = ref<SpawnMethod>('unowned')
const SPAWN_METHODS: { value: SpawnMethod; label: string; description: string }[] = [
  { value: 'unowned', label: '随机无主地块', description: '独享未被占领的空地' },
  { value: 'public', label: '随机公开地块', description: '加入其他玩家公开的地块' },
]

const previewText = computed(() => {
  const genderLabel = GENDERS.find((g) => g.value === appearance.gender)?.label
  const hairLabel = HAIRSTYLES.find((h) => h.value === appearance.hair)?.label
  const skinLabel = SKIN_TONES.find((s) => s.value === appearance.skin)?.label
  const outfitLabel = OUTFITS.find((o) => o.value === appearance.outfit)?.label
  return `${genderLabel} · ${hairLabel} · ${skinLabel} · ${outfitLabel}`
})

const selectedContinent = computed(() => CONTINENTS.find((c) => c.value === startContinent.value)!)

async function handleCreate() {
  if (!nickname.value.trim()) {
    errorMessage.value = '请输入昵称'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await characterStore.createCharacter({
      nickname: nickname.value.trim(),
      appearance: { ...appearance },
      startContinent: startContinent.value,
      spawnMethod: spawnMethod.value,
    })
    emit('character-created')
  } catch (error) {
    errorMessage.value = error instanceof ApiRequestError ? error.message : '创建角色失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function handleLogout() {
  userStore.logout()
  characterStore.reset()
}

</script>

<template>
  <div class="character-create-view">
    <div class="create-card">
      <div class="header-with-logout">
        <h1 class="title">创建你的角色</h1>
        <button type="button" class="logout-button" @click="handleLogout" title="退出登录">
          退出
        </button>
      </div>

      <div class="section">
        <label class="section-label">昵称</label>
        <input v-model="nickname" type="text" placeholder="输入昵称" maxlength="20" />
      </div>

      <div class="section">
        <label class="section-label">性别</label>
        <div class="option-row">
          <button
            v-for="option in GENDERS"
            :key="option.value"
            type="button"
            class="option-button"
            :class="{ active: appearance.gender === option.value }"
            @click="appearance.gender = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <label class="section-label">发型</label>
        <div class="option-row">
          <button
            v-for="option in HAIRSTYLES"
            :key="option.value"
            type="button"
            class="option-button"
            :class="{ active: appearance.hair === option.value }"
            @click="appearance.hair = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <label class="section-label">肤色</label>
        <div class="option-row">
          <button
            v-for="option in SKIN_TONES"
            :key="option.value"
            type="button"
            class="option-button"
            :class="{ active: appearance.skin === option.value }"
            @click="appearance.skin = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <label class="section-label">初始服装</label>
        <div class="option-row">
          <button
            v-for="option in OUTFITS"
            :key="option.value"
            type="button"
            class="option-button"
            :class="{ active: appearance.outfit === option.value }"
            @click="appearance.outfit = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="section">
        <label class="section-label">出生大洲</label>
        <div class="continent-grid">
          <button
            v-for="continent in CONTINENTS"
            :key="continent.value"
            type="button"
            class="continent-card"
            :class="{ active: startContinent === continent.value }"
            :style="{ borderColor: continent.color }"
            @click="startContinent = continent.value"
          >
            <span class="continent-name" :style="{ color: continent.color }">{{ continent.name }}</span>
            <span class="continent-theme">{{ continent.theme }}</span>
            <span class="continent-desc">{{ continent.description }}</span>
          </button>
        </div>
      </div>

      <div class="section">
        <label class="section-label">出生方式</label>
        <div class="option-row">
          <button
            v-for="method in SPAWN_METHODS"
            :key="method.value"
            type="button"
            class="spawn-method-button"
            :class="{ active: spawnMethod === method.value }"
            @click="spawnMethod = method.value"
          >
            <span>{{ method.label }}</span>
            <small>{{ method.description }}</small>
          </button>
        </div>
      </div>

      <div class="preview-box">
        <p class="preview-label">预览</p>
        <p class="preview-text">{{ nickname || '（未命名）' }} · {{ previewText }}</p>
        <p class="preview-text" :style="{ color: selectedContinent.color }">
          出生地：{{ selectedContinent.name }}（{{ selectedContinent.theme }}）
        </p>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <button type="button" class="primary-button" :disabled="submitting" @click="handleCreate">
        {{ submitting ? '创建中…' : '确认创建' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.character-create-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: linear-gradient(135deg, #3e2723, #5c8b6f 40%, #a0522d 70%, #6eb5d1);
}

.create-card {
  width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 28px;
  background: #3e2723;
  border: 3px solid #ffb300;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title {
  margin: 0;
  text-align: center;
  color: #ffb300;
  font-size: 22px;
}

.header-with-logout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.logout-button {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #f5e6d3;
  border-radius: 4px;
  color: #f5e6d3;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-button:hover {
  background: rgba(245, 230, 211, 0.1);
  border-color: #ffb300;
  color: #ffb300;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label {
  color: #f5e6d3;
  font-size: 13px;
  font-weight: 600;
}

.section input {
  padding: 10px 12px;
  background: #f5e6d3;
  color: #2c1810;
  border: 2px solid #2c1810;
  border-radius: 4px;
  font-size: 14px;
}

.option-row {
  display: flex;
  gap: 8px;
}

.option-button {
  flex: 1;
  padding: 8px 0;
  background: #6d4c41;
  color: #f5e6d3;
  border: 2px solid #2c1810;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.option-button.active {
  background: #ffb300;
  color: #2c1810;
  border-color: #ffb300;
}

.spawn-method-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: #6d4c41;
  color: #f5e6d3;
  border: 2px solid #2c1810;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.spawn-method-button.active {
  background: #ffb300;
  color: #2c1810;
  border-color: #ffb300;
}

.spawn-method-button small {
  font-size: 11px;
  opacity: 0.8;
}

.continent-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.continent-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  background: #2c1810;
  border: 2px solid;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.continent-card.active {
  box-shadow: 0 0 0 2px #ffb300 inset;
}

.continent-name {
  font-weight: 700;
  font-size: 14px;
}

.continent-theme {
  color: #f5e6d3;
  font-size: 12px;
}

.continent-desc {
  color: #a1887f;
  font-size: 11px;
}

.preview-box {
  padding: 10px 12px;
  background: #f5e6d3;
  border: 2px dashed #ffb300;
  border-radius: 4px;
}

.preview-label {
  margin: 0 0 4px;
  color: #6d4c41;
  font-size: 12px;
  font-weight: 700;
}

.preview-text {
  margin: 0;
  color: #2c1810;
  font-size: 13px;
}

.primary-button {
  padding: 12px 0;
  background: #ffb300;
  color: #2c1810;
  border: none;
  border-radius: 4px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 3px 0 #a37000;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: #ffcdd2;
  background: rgba(211, 47, 47, 0.35);
  border: 1px solid #d32f2f;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
}
</style>
