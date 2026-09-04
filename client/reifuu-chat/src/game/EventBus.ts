import mitt from 'mitt'
import type { PrivateMessagePayload } from './network/SocketClient'

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
  /** 游戏内轻提示（采集距离不足等） */
  'game:toast': { message: string; type?: 'info' | 'warn' | 'error' | 'success' }

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

  // Resource / inventory / build
  /** 资源采集成功（服务端确认），携带最新背包 */
  'resource:collected': {
    nodeId: number
    resourceType: string
    inventory: { itemType: string; quantity: number }[]
  }
  /** 同区块其他玩家采集了资源节点 → 前端标记为已耗尽 */
  'resource:node-depleted': { nodeId: number }
  /** 背包已更新（采集/建造后） */
  'inventory:updated': { items: { itemType: string; quantity: number }[] }
  /** 建造完成 → 场景可显示聊天室标记 */
  'build:created': { chunkId: string; chatRoomId: number }

  // Chat room
  /** 服务端下发房间历史消息 */
  'room:history': { roomId: string; messages: Array<{ id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string }> }
  /** 房间内新消息广播 */
  'room:message': { roomId: string; message: { id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string } }
  /** 房间成员列表更新 */
  'room:members': { roomId: string; members: Array<{ characterId: string; nickname: string }> }
  /** UI 请求进入聊天室 */
  'ui:enter-room': { roomId: string }
  /** UI 请求离开聊天室 */
  'ui:leave-room': { roomId: string }
  /** 已进入聊天室（场景/UI 可据此切换状态） */
  'room:entered': { roomId: string; name: string }
  /** 已离开聊天室 */
  'room:left': { roomId: string }

  // Plugin events
  /** 插件已激活（房间内广播） */
  'plugin:activated': { roomId: string; pluginId: string; state: Record<string, unknown> }
  /** 插件已停用（房间内广播） */
  'plugin:deactivated': { roomId: string; pluginId: string }
  /** 插件状态更新（来自服务端广播，非本客户端触发） */
  'plugin:state': { roomId: string; pluginId: string; state: Record<string, unknown> }
  /** 加入房间时服务端下发当前已激活插件列表 */
  'plugin:list': { roomId: string; plugins: Array<{ pluginId: string; state: Record<string, unknown> }> }

  // Friend system (GDD §2.7)
  /** 收到新的好友请求（实时推送） */
  'friend:new-request': { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }
  /** 好友请求已发送（本客户端确认） */
  'friend:request-sent': { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }
  /** 好友请求处理结果（发起方收到：accepted/rejected） */
  'friend:request-result': { requestId: number; status: 'accepted' | 'rejected'; responderCharacterId: number }
  /** 好友请求已处理（本客户端确认） */
  'friend:responded': { result: { status: 'accepted' | 'rejected'; fromCharacterId: number; toCharacterId: number } }
  /** 好友在线状态变化 */
  'friend:online-status': { characterId: number; isOnline: boolean }
  /** UI 请求查看某玩家信息卡（点击其他玩家） */
  'ui:show-player-info': { characterId: number; nickname: string }
  /** 好友传送已确认（服务端返回新位置与区块） */
  'friend:teleport-confirmed': { position: { x: number; y: number }; chunkId: string; friendNickname: string | null; cooldownRemaining: number }
  /** UI 请求传送到好友位置 */
  'ui:teleport-friend': { characterId: number }

  // Friend private chat (GDD §2.7 好友私聊频道)
  /** 收到好友私聊消息（实时推送） */
  'friend:message-received': { message: PrivateMessagePayload }
  /** 私聊消息发送成功（本客户端确认） */
  'friend:message-sent': { message: PrivateMessagePayload }
  /** UI 请求打开与某好友的私聊窗口 */
  'ui:open-private-chat': { characterId: number; nickname: string }
  /** UI 请求关闭私聊窗口 */
  'ui:close-private-chat': void
}

export const EventBus = mitt<GameEvents>()
