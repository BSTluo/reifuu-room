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
  [event: string]: (...args: any[]) => void
}

export interface ClientToServerEvents {
  echo: (payload: unknown) => void
  'player:move': (data: { x: number; y: number }) => void
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
