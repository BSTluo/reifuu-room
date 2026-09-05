import { hashStringToSeed } from '../client/reifuu-chat/src/game/utils/rng'

function valueNoise(x: number, y: number): number {
  const h = hashStringToSeed(`n_${x & 0xffff}_${y & 0xffff}`)
  return (h & 0xffffff) / 0x1000000
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = valueNoise(ix, iy)
  const b = valueNoise(ix + 1, iy)
  const c = valueNoise(ix, iy + 1)
  const d = valueNoise(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

function fbm(x: number, y: number, octaves = 3): number {
  let val = 0
  let amp = 0.5
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq) * amp
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return val / max
}

// Distribution check
let buckets = new Array(10).fill(0)
let min = 1, max = 0, sum = 0
for (let i = 0; i < 10000; i++) {
  const v = fbm(i * 1.37, i * 2.71, 2)
  buckets[Math.min(9, Math.floor(v * 10))]++
  min = Math.min(min, v)
  max = Math.max(max, v)
  sum += v
}
console.log('fbm distribution: min', min.toFixed(3), 'max', max.toFixed(3), 'mean', (sum / 10000).toFixed(3))
console.log('buckets:', buckets.map((b, i) => `${i * 10}-${i * 10 + 9}%: ${b}`).join('  '))

// What are the coast noise values at the failing area?
console.log('\n--- coast noise at x=160..165, y=285 ---')
for (let x = 160; x <= 165; x++) {
  const coastNoise = fbm(x * 0.2, 285 * 0.2, 2)
  const bandNoise = fbm(x * 0.35, 285 * 0.35, 2)
  const noisyDist = (x - 160) + (coastNoise - 0.5) * 3
  console.log(`x=${x}: coastNoise=${coastNoise.toFixed(3)}, noisyDist=${noisyDist.toFixed(2)}, bandNoise=${bandNoise.toFixed(3)}`)
}