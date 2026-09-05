import { getTileType, worldToChunkId, isOceanChunk } from '../client/reifuu-chat/src/game/utils/world'

// Character at (160, 285), chunk 5_8. Chunk 4_8 is ocean.
console.log('chunkId for (160,285):', worldToChunkId(160, 285))
console.log('isOceanChunk(4,8):', isOceanChunk(4, 8))
console.log('isOceanChunk(5,8):', isOceanChunk(5, 8))

// Scan across the boundary (chunk 4 ends at x=127, chunk 5 starts at x=160)
// chunk 4: x = 4*32=128 .. 159, chunk 5: x = 160..191
console.log('--- Cross-boundary scan (x=125..165, y=285) ---')
for (let x = 125; x <= 165; x++) {
  const t = getTileType(x, 285)
  const c = worldToChunkId(x, 285)
  console.log(`x=${x} (${c}): ${t}`)
}

// 2D area
console.log('--- 2D coast area (x=125..165, y=280..300) ---')
for (let y = 280; y <= 300; y++) {
  let row = ''
  for (let x = 125; x <= 165; x++) {
    const t = getTileType(x, y)
    row += t === 'water' ? 'W' : t === 'sand' ? 's' : t === 'dirt' ? 'D' : 'g'
  }
  console.log(`y=${y}: ${row}`)
}

// Interior biome area (chunk 6_8, no coast)
console.log('--- Interior biome (x=192..223, y=256..287) ---')
for (let y = 256; y <= 287; y++) {
  let row = ''
  for (let x = 192; x <= 223; x++) {
    const t = getTileType(x, y)
    row += t === 'water' ? 'W' : t === 'sand' ? 's' : t === 'dirt' ? 'D' : 'g'
  }
  console.log(`y=${y}: ${row}`)
}