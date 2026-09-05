import { hashStringToSeed } from '../client/reifuu-chat/src/game/utils/rng'

// Check hash variation for adjacent values
for (let y = 55; y <= 65; y++) {
  const h = hashStringToSeed(`n_32_${y}`)
  const v = (h & 0xffffff) / 0x1000000
  console.log(`n_32_${y}: hash=${h}, value=${v.toFixed(6)}`)
}

console.log('\n--- Higher frequency check ---')
for (let y = 140; y <= 150; y++) {
  const h = hashStringToSeed(`n_81_${y}`)
  const v = (h & 0xffffff) / 0x1000000
  console.log(`n_81_${y}: hash=${h}, value=${v.toFixed(6)}`)
}