/**
 * 确定性伪随机数生成器：同一 seed（如 chunkId）在所有客户端上产生完全一致的随机序列，
 * 用于让同一区块内的所有玩家看到相同的地形布局。
 */

/** 将任意字符串哈希为 32 位无符号整数，作为 PRNG 的种子 */
export function hashStringToSeed(str: string): number {
  let hash = 2166136261 // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32：轻量、确定性的 32 位 PRNG，返回 [0, 1) 范围的浮点数生成函数 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return function random(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
