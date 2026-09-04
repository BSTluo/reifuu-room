import { io, Socket } from 'socket.io-client'
import { EventBus } from '../EventBus'

export interface ServerToClientEvents {
  echo: (payload: unknown) => void
  'player:move-confirmed': (data: { position: { x: number; y: number }; chunkId: string }) => void
  'players:in-chunk': (data: { players: Array<{ characterId: string; nickname: string; position: { x: number; y: number } }> }) => void
  'players:position-update': (data: { characterId: string; position: { x: number; y: number } }) => void
  'player:enter-chunk': (data: { characterId: string; nickname: string; position: { x: number; y: number } }) => void
  'player:leave-chunk': (data: { characterId: string }) => void
  'map:chunk-data': (data: { chunkId: string; tiles: string[][] }) => void
  'map:initial-explored': (data: { chunks: string[] }) => void
  'map:explore': (data: { chunks: string[] }) => void
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
  // Plugin events (server -> client)
  'plugin:activated': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  'plugin:deactivated': (data: { roomId: string; pluginId: string }) => void
  'plugin:state': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  'plugin:list': (data: { roomId: string; plugins: Array<{ pluginId: string; state: Record<string, unknown> }> }) => void
  // Friend events (server -> client)
  'friend:new-request': (data: { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }) => void
  'friend:request-sent': (data: { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }) => void
  'friend:request-result': (data: { requestId: number; status: 'accepted' | 'rejected'; responderCharacterId: number }) => void
  'friend:responded': (data: { result: { status: 'accepted' | 'rejected'; fromCharacterId: number; toCharacterId: number } }) => void
  'friend:online-status': (data: { characterId: number; isOnline: boolean }) => void
  'friend:teleport-confirmed': (data: { position: { x: number; y: number }; chunkId: string; friendNickname: string | null; cooldownRemaining: number }) => void
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
  // Plugin events (client -> server)
  'plugin:activate': (data: { roomId: string; pluginId: string }) => void
  'plugin:deactivate': (data: { roomId: string; pluginId: string }) => void
  'plugin:state-sync': (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => void
  // Friend events (client -> server)
  'friend:send-request': (data: { toCharacterId: number; message?: string }) => void
  'friend:respond': (data: { requestId: number; accept: boolean }) => void
  'friend:teleport': (data: { toCharacterId: number }) => void
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

    // 迷雾：初始已探索列表 + 新探索区块
    this.socket.on('map:initial-explored', (data: { chunks: string[] }) => {
      EventBus.emit('map:initial-explored', data)
    })
    this.socket.on('map:explore', (data: { chunks: string[] }) => {
      EventBus.emit('map:explore', data)
    })

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

    // Friend events: forward to EventBus for Vue components
    this.socket.on('friend:new-request', (data: { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }) => {
      EventBus.emit('friend:new-request', data)
    })
    this.socket.on('friend:request-sent', (data: { request: { requestId: number; fromCharacterId: number; fromNickname: string; message: string | null; createdAt: string } }) => {
      EventBus.emit('friend:request-sent', data)
    })
    this.socket.on('friend:request-result', (data: { requestId: number; status: 'accepted' | 'rejected'; responderCharacterId: number }) => {
      EventBus.emit('friend:request-result', data)
    })
    this.socket.on('friend:responded', (data: { result: { status: 'accepted' | 'rejected'; fromCharacterId: number; toCharacterId: number } }) => {
      EventBus.emit('friend:responded', data)
    })
    this.socket.on('friend:online-status', (data: { characterId: number; isOnline: boolean }) => {
      EventBus.emit('friend:online-status', data)
    })
    this.socket.on('friend:teleport-confirmed', (data: { position: { x: number; y: number }; chunkId: string; friendNickname: string | null; cooldownRemaining: number }) => {
      EventBus.emit('friend:teleport-confirmed', data)
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
