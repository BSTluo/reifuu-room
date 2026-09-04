import logger from '../utils/logger.js';

/** 插件会话中可持久化到内存的状态（每个插件自定义） */
export interface PluginState {
  [key: string]: unknown;
}

/** 单个插件会话 */
interface PluginSession {
  roomId: string;
  pluginId: string;
  state: PluginState;
  activatedBy: string; // characterId
  activatedAt: number;
}

/**
 * PluginService — 管理房间内插件的激活/停用/状态同步。
 *
 * 插件会话是临时的（内存中），不持久化到数据库。
 * 每个房间对每个 pluginId 最多有一个活跃实例。
 *
 * 内建插件 ID:
 *   - "music-sync"  : 一起听歌
 *   - "video-sync"  : 一起看视频
 */
class PluginService {
  /** key = `${roomId}:${pluginId}` */
  private sessions = new Map<string, PluginSession>();

  /** 获取会话 key */
  private sessionKey(roomId: string, pluginId: string): string {
    return `${roomId}:${pluginId}`;
  }

  /** 激活插件（若已激活则忽略） */
  activate(roomId: string, pluginId: string, characterId: string, initialState?: PluginState): PluginState {
    const key = this.sessionKey(roomId, pluginId);
    if (this.sessions.has(key)) {
      return this.sessions.get(key)!.state;
    }
    const state: PluginState = initialState ?? {};
    const session: PluginSession = {
      roomId,
      pluginId,
      state,
      activatedBy: characterId,
      activatedAt: Date.now(),
    };
    this.sessions.set(key, session);
    logger.info(`Plugin "${pluginId}" activated in room ${roomId} by ${characterId}`);
    return state;
  }

  /** 停用插件 */
  deactivate(roomId: string, pluginId: string): boolean {
    const key = this.sessionKey(roomId, pluginId);
    const existed = this.sessions.has(key);
    this.sessions.delete(key);
    if (existed) {
      logger.info(`Plugin "${pluginId}" deactivated in room ${roomId}`);
    }
    return existed;
  }

  /** 更新插件状态（仅在插件已激活时有效） */
  updateState(roomId: string, pluginId: string, patch: PluginState): PluginState | null {
    const key = this.sessionKey(roomId, pluginId);
    const session = this.sessions.get(key);
    if (!session) return null;
    Object.assign(session.state, patch);
    return { ...session.state };
  }

  /** 获取插件当前状态 */
  getState(roomId: string, pluginId: string): PluginState | null {
    const key = this.sessionKey(roomId, pluginId);
    const session = this.sessions.get(key);
    return session ? { ...session.state } : null;
  }

  /** 列出房间内所有已激活的插件 */
  listActive(roomId: string): Array<{ pluginId: string; state: PluginState }> {
    const result: Array<{ pluginId: string; state: PluginState }> = [];
    for (const [key, session] of this.sessions) {
      if (session.roomId === roomId) {
        result.push({ pluginId: session.pluginId, state: { ...session.state } });
      }
    }
    return result;
  }

  /** 玩家离开房间时，清理该玩家控制的插件（可选策略：保持活跃） */
  onPlayerLeave(roomId: string, _characterId: string): void {
    // 策略：房间内至少还有一人时保持插件活跃
    // 具体逻辑由 socket 层判断房间人数后调用
    void roomId;
    void _characterId;
  }

  /** 房间内所有人离开时，清理该房间所有插件 */
  onRoomEmpty(roomId: string): void {
    const prefix = `${roomId}:`;
    for (const key of this.sessions.keys()) {
      if (key.startsWith(prefix)) {
        this.sessions.delete(key);
        logger.info(`Plugin "${key.split(':')[1]}" cleared (room ${roomId} empty)`);
      }
    }
  }
}

export default new PluginService();
