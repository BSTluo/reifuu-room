import mitt from 'mitt'
import type { FriendListItemDTO, FriendRequestDTO, PigeonMessageDTO, TeamStateDTO, TeamInvitationDTO, TeamApplicationDTO, TeamChatMessageDTO, FurnitureItemDTO, FriendChatMessageDTO } from '../api/types'
export interface TownDTO {
  id: number; name: string; chunkId: string; continent: string; level: number
  portalId: number; portalX: number; portalY: number; cooldownSeconds: number; cooldownRemaining?: number; unlocked: boolean
}

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
  'town:state': { towns: TownDTO[] }
  'town:teleport-confirmed': { townId: number; name: string; position: { x: number; y: number }; chunkId: string }

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
  'vehicle:state': { vehicles: Array<{ id: number; characterId: string; vehicleType: 'horse' | 'cart'; speedMultiplier: number; durability: number | null; equipped: boolean; createdAt: string }>; equipped: { id: number; vehicleType: 'horse' | 'cart'; speedMultiplier: number } | null }
  'vehicle:equipped': { id: number; vehicleType: 'horse' | 'cart'; speedMultiplier: number } | null
  /** 建造完成 → 场景可显示聊天室标记 */
  'build:created': { chunkId: string; chatRoomId: number }
  'build:abandoned': { chunkId: string }

  // Chat room
  /** 服务端下发房间历史消息 */
  'room:history': { roomId: string; messages: Array<{ id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string }> }
  /** 房间内新消息广播 */
  'room:message': { roomId: string; message: { id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string } }
  /** 房间成员列表更新 */
  'room:members': { roomId: string; members: Array<{ characterId: string; nickname: string }> }
  /** 私有房间成员被移除后，客户端必须立即退出房间 */
  'room:member-removed': { roomId: string }
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

  // Furniture (house interior) events
  /** 服务端下发房间家具布局 */
  'room:furniture': { roomId: string; furniture: FurnitureItemDTO[] }
  /** 房间内家具变更广播（摆放/移动/移除） */
  'room:furniture-changed': {
    roomId: string
    action: 'placed' | 'moved' | 'removed'
    furniture: FurnitureItemDTO
  }
  /** 点击带插件的家具 → 激活对应插件 */
  'ui:activate-furniture-plugin': { roomId: string; pluginId: string; furnitureId: string }
  /** 走出家具交互范围 → 停用当前插件 */
  'ui:deactivate-furniture-plugin': { roomId: string; pluginId: string }
  /** UI 请求退出房间内部 → 返回大世界 */
  'ui:exit-room-interior': void

  // Friend events
  /** 服务端下发好友列表 + 待处理申请 */
  'friend:state': { friends: FriendListItemDTO[]; requests: FriendRequestDTO[] }
  /** 收到新的好友申请 */
  'friend:request-received': { requestId: number; fromCharacterId: string; fromNickname: string }
  /** 好友申请已发送成功 */
  'friend:request-sent': { requestId: number; toCharacterId: string; toNickname: string }
  /** 好友申请被接受（双方都会收到） */
  'friend:accepted': { friendCharacterId: string; friendNickname: string }
  /** 好友申请被拒绝 */
  'friend:rejected': { requestId: number }
  /** 好友被删除 */
  'friend:removed': { characterId: string }
  /** 传送到好友位置成功 */
  'friend:teleport-confirmed': { characterId: string; nickname: string; position: { x: number; y: number }; chunkId: string }
  /** 收到好友私聊消息（在线即时送达） */
  'friend:chat-message': { messageId: number; fromCharacterId: string; fromNickname: string; content: string; createdAt: string }
  /** 私聊消息发送成功（服务端确认） */
  'friend:message-sent': { messageId: number; toCharacterId: string; content: string; createdAt: string }
  /** 服务端下发与某好友的私聊历史 */
  'friend:chat-history': { friendCharacterId: string; messages: FriendChatMessageDTO[] }
  /** UI 请求打开好友面板 */
  'ui:open-friends': void
  /** UI 请求打开私聊窗口 */
  'ui:open-private-chat': { friendCharacterId: string; friendNickname: string }
  /** UI 请求打开信箱面板 */
  'ui:open-mailbox': void
  /** 点击其他玩家 → 显示信息卡（含加好友按钮） */
  'ui:show-player-info': { characterId: string; nickname: string }

  // Pigeon mail (飞鸽传信) events
  /** 服务端下发信箱状态（收件箱 + 未读数） */
  'pigeon:state': { messages: PigeonMessageDTO[]; unreadCount: number }
  /** 发送成功（携带延迟信息） */
  'pigeon:sent': { messageId: number; toCharacterId: string; toNickname: string; delayMs: number; delivered: boolean }
  /** 收到新信件（即时送达或投递周期送达） */
  'pigeon:delivered': { messageId: number; fromCharacterId: string; fromNickname: string; content: string; createdAt: string }
  /** 标记已读成功（未读数更新） */
  'pigeon:read-confirmed': { messageId: number; unreadCount: number }
  /** UI 请求打开飞鸽传信面板 */
  'ui:open-pigeon': void

  // Team system (团队系统) events
  /** 服务端下发团队完整状态 */
  'team:state': TeamStateDTO
  /** 收到团队邀请 */
  'team:invite-received': { invitationId: number; teamId: number; teamName: string; fromNickname: string }
  /** 收到申请通知（队长） */
  'team:application-received': { applicationId: number; teamId: number; teamName: string; characterId: string; nickname: string; message: string | null }
  /** 申请列表更新（队长） */
  'team:applications': TeamApplicationDTO[]
  /** 邀请列表更新 */
  'team:invitations': TeamInvitationDTO[]
  /** 申请加入成功 */
  'team:applied': { teamId: number; teamName: string }
  /** 新成员加入 */
  'team:member-joined': { teamId: number; characterId: string; nickname: string }
  /** 成员离开/被踢出 */
  'team:member-left': { teamId: number; characterId: string; nickname: string }
  /** 自己被踢出团队 */
  'team:kicked': { teamId: number; teamName: string }
  /** 团队已解散 */
  'team:disbanded': { teamId: number; teamName: string }
  /** 团队聊天消息 */
  'team:chat-message': TeamChatMessageDTO
  /** UI 请求打开团队面板 */
  'ui:open-team': void
}

export const EventBus = mitt<GameEvents>()
