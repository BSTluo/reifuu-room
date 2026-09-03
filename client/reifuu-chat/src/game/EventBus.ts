import mitt from 'mitt'

/**
 * Vue <-> Phaser 通信事件表。
 * Vue 侧发起的事件用于驱动 Phaser 场景，Phaser 侧发起的事件用于同步 UI 状态。
 * 位置相关事件统一使用网格坐标（grid coordinates），与后端 MapChunk/Character 的坐标系一致。
 */
export type GameEvents = {
  // Phaser -> Vue
  'phaser:ready': { sceneKey: string }
  'phaser:scene-changed': { sceneKey: string }
  'player:position-changed': { x: number; y: number }

  // Vue -> Phaser
  'ui:request-scene': { sceneKey: string }
  /** 网格坐标增量（-1/0/1），用于点击按钮触发的单步移动 */
  'ui:move-player': { dx: number; dy: number }
  /** 登录/创角完成后，Vue 层告知 Phaser 玩家出生世界坐标 */
  'ui:spawn-character': { wx: number; wy: number }

  // Network -> UI（由 SocketClient 转发）
  'socket:connected': void
  'socket:disconnected': { reason: string }
  'socket:error': { message: string }

  // Map / fog of war
  /** 服务端下发初始已探索区块列表 */
  'map:initial-explored': { chunks: string[] }
  /** 移动进入新区域后，服务端广播新解锁的区块列表 */
  'map:explore': { chunks: string[] }
  /** 探索 store 更新完成（已探索集合变化），WorldScene/UI 据此重渲染 */
  'exploration:updated': { chunks: string[] }
  /** 玩家所在区块变化（跨越区块边界） */
  'player:chunk-changed': { chunkId: string }
}

export const EventBus = mitt<GameEvents>()
