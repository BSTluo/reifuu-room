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

// Check if noise changes with y
console.log('--- coast noise at x=162, y=280..290 ---')
for (let y = 280; y <= 290; y++) {
  const wx = 162, wy = y
  const coastNoise = fbm(wx * 0.2, wy * 0.2, 2)
  const bandNoise = fbm(wx * 0.35, wy * 0.35, 2)
  const dist = 2 // lx=2
  const noisyDist = dist + (coastNoise - 0.5) * 4
  const t = (noisyDist - 1.5) / (5 - 1.5)
  const isSand = sandGrassNoise(bandNoise, t)
  console.log(`y=${y}: coast=${coastNoise.toFixed(4)}, band=${bandNoise.toFixed(4)}, noisyDist=${noisyDist.toFixed(3)}, t=${t.toFixed(3)}, sand=${isSand}`)
}

function sandGrassNoise(noise: number, t: number): boolean {
  return noise > 0.35 + t * 0.35
}