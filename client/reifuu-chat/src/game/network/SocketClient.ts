import { io, Socket } from 'socket.io-client'
import { EventBus } from '../EventBus'
import type { FriendListItemDTO, FriendRequestDTO, PigeonMessageDTO, TeamStateDTO, TeamInvitationDTO, TeamApplicationDTO, TeamChatMessageDTO, FurnitureItemDTO } from '../../api/types'
import type { TownDTO } from '../EventBus'

export interface ServerToClientEvents {
  echo: (payload: unknown) => void
  'player:move-confirmed': (data: { position: { x: number; y: number }; chunkId: string; equippedVehicle?: { id: number; vehicleType: 'horse' | 'cart'; speedMultiplier: number } | null }) => void
  'players:in-chunk': (data: { players: Array<{ characterId: string; nickname: string; position: { x: number; y: number } }> }) => void
  'players:position-update': (data: { characterId: string; position: { x: number; y: number } }) => void
  'player:enter-chunk': (data: { characterId: string; nickname: string; position: { x: number; y: number } }) => void
  'player:leave-chunk': (data: { characterId: string }) => void
  'map:chunk-data': (data: { chunkId: string; tiles: string[][] }) => void
  'map:initial-explored': (data: { chunks: string[] }) => void
  'map:explore': (data: { chunks: string[] }) => void
  'town:state': (data: { towns: TownDTO[] }) => void
  'town:teleport-confirmed': (data: { townId: number; name: string; position: { x: number; y: number }; chunkId: string }) => void
  'resource:collected': (data: {
    nodeId: number
    resourceType: string
    inventory: { itemType: string; quantity: number }[]
  }) => void
  'resource:node-depleted': (data: { nodeId: number }) => void
  'resource:node-respawned': (data: { nodeId: number }) => void
  'room:history': (data: { roomId: string; messages: Array<{ id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string }> }) => void
  'room:message': (data: { roomId: string; message: { id: number; roomId: string; characterId: string; nickname: string; content: string; createdAt: string } }) => void
  'room:members': (data: { roomId: string; members: Array<{ characterId: string; nickname: string }> }) => void
  'room:member-removed': (data: { roomId: string }) => void
  // Plugin events (server -> client)
  'plugin:activated': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  'plugin:deactivated': (data: { roomId: string; pluginId: string }) => void
  'plugin:state': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  'plugin:list': (data: { roomId: string; plugins: Array<{ pluginId: string; state: Record<string, unknown> }> }) => void
  // Friend events (server -> client)
  'friend:state': (data: { friends: FriendListItemDTO[]; requests: FriendRequestDTO[] }) => void
  'friend:request-received': (data: { requestId: number; fromCharacterId: string; fromNickname: string }) => void
  'friend:request-sent': (data: { requestId: number; toCharacterId: string; toNickname: string }) => void
  'friend:accepted': (data: { friendCharacterId: string; friendNickname: string }) => void
  'friend:rejected': (data: { requestId: number }) => void
  'friend:removed': (data: { characterId: string }) => void
  'friend:teleport-confirmed': (data: { characterId: string; nickname: string; position: { x: number; y: number }; chunkId: string }) => void
  // Pigeon mail events (server -> client)
  'pigeon:state': (data: { messages: PigeonMessageDTO[]; unreadCount: number }) => void
  'pigeon:sent': (data: { messageId: number; toCharacterId: string; toNickname: string; delayMs: number; delivered: boolean }) => void
  'pigeon:delivered': (data: { messageId: number; fromCharacterId: string; fromNickname: string; content: string; createdAt: string }) => void
  'pigeon:read-confirmed': (data: { messageId: number; unreadCount: number }) => void
  // Team events (server -> client)
  'team:state': (data: TeamStateDTO) => void
  'team:invite-received': (data: { invitationId: number; teamId: number; teamName: string; fromNickname: string }) => void
  'team:application-received': (data: { applicationId: number; teamId: number; teamName: string; characterId: string; nickname: string; message: string | null }) => void
  'team:applications': (data: TeamApplicationDTO[]) => void
  'team:invitations': (data: TeamInvitationDTO[]) => void
  'team:applied': (data: { teamId: number; teamName: string }) => void
  'team:member-joined': (data: { teamId: number; characterId: string; nickname: string }) => void
  'team:member-left': (data: { teamId: number; characterId: string; nickname: string }) => void
  'team:kicked': (data: { teamId: number; teamName: string }) => void
  'team:disbanded': (data: { teamId: number; teamName: string }) => void
  'team:chat-message': (data: TeamChatMessageDTO) => void
  // Furniture events (server -> client)
  'room:furniture': (data: { roomId: string; furniture: FurnitureItemDTO[] }) => void
  'room:furniture-changed': (data: { roomId: string; action: 'placed' | 'moved' | 'removed'; furniture: FurnitureItemDTO }) => void
  [event: string]: (...args: any[]) => void
}

export interface ClientToServerEvents {
  echo: (payload: unknown) => void
  'player:move': (data: { x: number; y: number }) => void
  'client:request-chunk-players': () => void
  'resource:collect': (data: { nodeId: number; x: number; y: number }) => void
  'room:join': (data: { roomId: string }) => void
  'room:leave': (data: { roomId: string }) => void
  'room:message': (data: { roomId: string; content: string }) => void
  'room:membership-refresh': (data: { roomId: string; removedCharacterId?: string }) => void
  // Plugin events (client -> server)
  'plugin:activate': (data: { roomId: string; pluginId: string }) => void
  'plugin:deactivate': (data: { roomId: string; pluginId: string }) => void
  'plugin:state-sync': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  // Friend events (client -> server)
  'friend:request-state': () => void
  'friend:send-request': (data: { characterId: string }) => void
  'friend:accept-request': (data: { requestId: number }) => void
  'friend:reject-request': (data: { requestId: number }) => void
  'friend:remove': (data: { characterId: string }) => void
  'friend:teleport': (data: { characterId: string }) => void
  // Pigeon mail events (client -> server)
  'pigeon:request-state': () => void
  'pigeon:send': (data: { toCharacterId: string; content: string }) => void
  'pigeon:mark-read': (data: { messageId: number }) => void
  // Team events (client -> server)
  'team:request-state': () => void
  'team:create': (data: { name: string }) => void
  'team:invite': (data: { characterId: string }) => void
  'team:apply': (data: { teamId: number; message?: string }) => void
  'team:accept-invite': (data: { invitationId: number }) => void
  'team:reject-invite': (data: { invitationId: number }) => void
  'team:accept-application': (data: { applicationId: number }) => void
  'team:reject-application': (data: { applicationId: number }) => void
  'team:kick': (data: { characterId: string }) => void
  'team:leave': () => void
  'team:transfer': (data: { characterId: string }) => void
  'team:disband': () => void
  'team:chat': (data: { content: string }) => void
  'town:request-state': () => void
  'town:teleport': (data: { townId: number }) => void
  // Furniture events (client -> server)
  'room:furniture-request': (data: { roomId: string }) => void
  'room:furniture-changed': (data: { roomId: string; action: 'placed' | 'moved' | 'removed'; furniture: FurnitureItemDTO }) => void
  [event: string]: (...args: any[]) => void
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * Socket.io 客户端封装，统一收发协议、断线重连与状态广播（通过 EventBus 通知 UI 层）。
 */
class SocketClient {
  private socket: ClientSocket | null = null

  get connected(): boolean {
    return this.socket?.connected ?? false
  }

  get instance(): ClientSocket | null {
    return this.socket
  }

  connect(url: string, token?: string): ClientSocket {
    if (this.socket) {
      return this.socket
    }

    this.socket = io(url, {
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket'],
    })

    this.socket.on('connect', () => {
      EventBus.emit('socket:connected')
    })
    this.socket.on('player:move-confirmed', (data) => {
      EventBus.emit('vehicle:equipped', data.equippedVehicle ?? null)
    })

    // 迷雾：初始已探索列表 + 新探索区块
    this.socket.on('map:initial-explored', (data: { chunks: string[] }) => {
      EventBus.emit('map:initial-explored', data)
    })
    this.socket.on('map:explore', (data: { chunks: string[] }) => {
      EventBus.emit('map:explore', data)
    })
    this.socket.on('town:state', (data) => EventBus.emit('town:state', data))
    this.socket.on('town:teleport-confirmed', (data) => EventBus.emit('town:teleport-confirmed', data))

    // 资源/背包：服务端确认采集 → EventBus 通知场景与 UI
    this.socket.on(
      'resource:collected',
      (data: {
        nodeId: number
        resourceType: string
        inventory: { itemType: string; quantity: number }[]
      }) => {
        EventBus.emit('resource:collected', data)
        EventBus.emit('inventory:updated', { items: data.inventory })
      }
    )
    this.socket.on('resource:node-depleted', (data: { nodeId: number }) => {
      EventBus.emit('resource:node-depleted', data)
    })

    // Chat room: history, incoming message, member list updates
    this.socket.on('room:history', (data: { roomId: string; messages: any[] }) => {
      EventBus.emit('room:history', data)
    })
    this.socket.on('room:message', (data: { roomId: string; message: any }) => {
      EventBus.emit('room:message', data)
    })
    this.socket.on('room:members', (data: { roomId: string; members: Array<{ characterId: string; nickname: string }> }) => {
      EventBus.emit('room:members', data)
    })
    this.socket.on('room:member-removed', (data: { roomId: string }) => {
      EventBus.emit('room:member-removed', data)
    })

    // Plugin events: activated, deactivated, state sync, plugin list
    this.socket.on('plugin:activated', (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => {
      EventBus.emit('plugin:activated', data)
    })
    this.socket.on('plugin:deactivated', (data: { roomId: string; pluginId: string }) => {
      EventBus.emit('plugin:deactivated', data)
    })
    this.socket.on('plugin:state', (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => {
      EventBus.emit('plugin:state', data)
    })
    this.socket.on('plugin:list', (data: { roomId: string; plugins: Array<{ pluginId: string; state: Record<string, unknown> }> }) => {
      EventBus.emit('plugin:list', data)
    })

    // Furniture events: forward to EventBus for the interior store / scene
    this.socket.on('room:furniture', (data: { roomId: string; furniture: FurnitureItemDTO[] }) => {
      EventBus.emit('room:furniture', data)
    })
    this.socket.on('room:furniture-changed', (data: { roomId: string; action: 'placed' | 'moved' | 'removed'; furniture: FurnitureItemDTO }) => {
      EventBus.emit('room:furniture-changed', data)
    })

    // Friend events: forward to EventBus for the friend store / UI
    this.socket.on('friend:state', (data: { friends: FriendListItemDTO[]; requests: FriendRequestDTO[] }) => {
      EventBus.emit('friend:state', data)
    })
    this.socket.on('friend:request-received', (data: { requestId: number; fromCharacterId: string; fromNickname: string }) => {
      EventBus.emit('friend:request-received', data)
    })
    this.socket.on('friend:request-sent', (data: { requestId: number; toCharacterId: string; toNickname: string }) => {
      EventBus.emit('friend:request-sent', data)
    })
    this.socket.on('friend:accepted', (data: { friendCharacterId: string; friendNickname: string }) => {
      EventBus.emit('friend:accepted', data)
    })
    this.socket.on('friend:rejected', (data: { requestId: number }) => {
      EventBus.emit('friend:rejected', data)
    })
    this.socket.on('friend:removed', (data: { characterId: string }) => {
      EventBus.emit('friend:removed', data)
    })
    this.socket.on('friend:teleport-confirmed', (data: { characterId: string; nickname: string; position: { x: number; y: number }; chunkId: string }) => {
      EventBus.emit('friend:teleport-confirmed', data)
    })

    // Pigeon mail events: forward to EventBus for the pigeon store / UI
    this.socket.on('pigeon:state', (data: { messages: PigeonMessageDTO[]; unreadCount: number }) => {
      EventBus.emit('pigeon:state', data)
    })
    this.socket.on('pigeon:sent', (data: { messageId: number; toCharacterId: string; toNickname: string; delayMs: number; delivered: boolean }) => {
      EventBus.emit('pigeon:sent', data)
    })
    this.socket.on('pigeon:delivered', (data: { messageId: number; fromCharacterId: string; fromNickname: string; content: string; createdAt: string }) => {
      EventBus.emit('pigeon:delivered', data)
    })
    this.socket.on('pigeon:read-confirmed', (data: { messageId: number; unreadCount: number }) => {
      EventBus.emit('pigeon:read-confirmed', data)
    })

    // Team events: forward to EventBus for the team store / UI
    this.socket.on('team:state', (data: TeamStateDTO) => {
      EventBus.emit('team:state', data)
    })
    this.socket.on('team:invite-received', (data: { invitationId: number; teamId: number; teamName: string; fromNickname: string }) => {
      EventBus.emit('team:invite-received', data)
    })
    this.socket.on('team:application-received', (data: { applicationId: number; teamId: number; teamName: string; characterId: string; nickname: string; message: string | null }) => {
      EventBus.emit('team:application-received', data)
    })
    this.socket.on('team:applications', (data: TeamApplicationDTO[]) => {
      EventBus.emit('team:applications', data)
    })
    this.socket.on('team:invitations', (data: TeamInvitationDTO[]) => {
      EventBus.emit('team:invitations', data)
    })
    this.socket.on('team:applied', (data: { teamId: number; teamName: string }) => {
      EventBus.emit('team:applied', data)
    })
    this.socket.on('team:member-joined', (data: { teamId: number; characterId: string; nickname: string }) => {
      EventBus.emit('team:member-joined', data)
    })
    this.socket.on('team:member-left', (data: { teamId: number; characterId: string; nickname: string }) => {
      EventBus.emit('team:member-left', data)
    })
    this.socket.on('team:kicked', (data: { teamId: number; teamName: string }) => {
      EventBus.emit('team:kicked', data)
    })
    this.socket.on('team:disbanded', (data: { teamId: number; teamName: string }) => {
      EventBus.emit('team:disbanded', data)
    })
    this.socket.on('team:chat-message', (data: TeamChatMessageDTO) => {
      EventBus.emit('team:chat-message', data)
    })

    this.socket.on('disconnect', (reason) => {
      EventBus.emit('socket:disconnected', { reason })
    })

    this.socket.on('connect_error', (err) => {
      EventBus.emit('socket:error', { message: err.message })
    })

    return this.socket
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
  }

  /**
   * 断线重连或 GameView 重新挂载后，SocketClient.connect 会复用已有 socket，
   * 此时迷雾初始列表事件早已错过。提供 onSocket 供外部一次性补拉。
   */
  offAllMapEvents(): void {
    // 由 WorldScene 通过 EventBus.off 处理，无需在此实现
  }

  emit<K extends keyof ClientToServerEvents>(event: K, ...args: Parameters<ClientToServerEvents[K]>): void {
    if (!this.socket) {
      throw new Error('SocketClient: not connected, call connect() first')
    }
    this.socket.emit(event as string, ...args)
  }

  on<K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): void {
    this.socket?.on(event as string, handler as (...args: any[]) => void)
  }

  off<K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): void {
    this.socket?.off(event as string, handler as (...args: any[]) => void)
  }
}

export const socketClient = new SocketClient()
