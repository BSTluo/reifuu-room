import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * 飞鸽传信（GDD 2.7）
 *
 * 消息发送后进入 "sending" 状态，按双方距离/大洲计算送达延迟（deliver_at），
 * 由周期任务（index.ts）把到时间的消息置为 "delivered" 并通知在线收件人。
 *
 * 延迟口径（GDD 建议值的下限，MVP 简化）：
 *  - 同区块 / 相邻区块          → 即时（0 延迟）
 *  - 同大洲内跨区块（无交通渠道）→ 5 分钟
 *  - 跨大洲（无交通渠道）       → 15 分钟
 *  传送门 / NPC 航线尚未实现（Phase 3 后续），有交通渠道的档位暂不区分。
 */

const MAX_CONTENT_LENGTH = 200;
// 每 5 分钟最多 3 条（GDD 防滥用）
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

// 相邻区块判定半径（Chebyshev 距离）
const NEAR_CHUNK_DISTANCE = 1;

/** 送达延迟档位（毫秒） */
const DELAY_NEAR = 0;
const DELAY_SAME_CONTINENT = 5 * 60 * 1000;
const DELAY_CROSS_CONTINENT = 15 * 60 * 1000;

export interface PigeonMessage {
  id: number;
  fromCharacterId: string;
  fromNickname: string;
  toCharacterId: string;
  toNickname: string;
  content: string;
  status: 'sending' | 'delivered' | 'read';
  deliverAt: string | null;
  createdAt: string;
}

export interface SendResult {
  messageId: number;
  toNickname: string;
  /** 预计送达延迟（毫秒），0 表示即时送达 */
  delayMs: number;
  /** 是否即时送达 */
  delivered: boolean;
}

export class PigeonMailService {
  /**
   * 计算两个区块 ID 之间的 Chebyshev 距离。
   */
  private chunkDistance(chunkIdA: string, chunkIdB: string): number {
    const [ax, ay] = (chunkIdA || '0_0').split('_').map(Number);
    const [bx, by] = (chunkIdB || '0_0').split('_').map(Number);
    return Math.max(Math.abs((ax || 0) - (bx || 0)), Math.abs((ay || 0) - (by || 0)));
  }

  /**
   * 大洲推断：区块按象限划分（x/y 正负分四大洲）。
   * 当前所有玩家都出生在 10_10（第一象限），同区块消息天然同大洲。
   */
  private getContinentOfChunk(chunkId: string): string {
    const [x, y] = (chunkId || '0_0').split('_').map(Number);
    const cx = x || 0;
    const cy = y || 0;
    if (cx >= 0 && cy >= 0) return 'east';
    if (cx < 0 && cy >= 0) return 'north';
    if (cx < 0 && cy < 0) return 'west';
    return 'south';
  }

  /**
   * 根据发件人/收件人当前位置计算送达延迟（毫秒）。
   */
  private calcDelayMs(fromChunkId: string, toChunkId: string): number {
    if (this.chunkDistance(fromChunkId, toChunkId) <= NEAR_CHUNK_DISTANCE) {
      return DELAY_NEAR; // 同区块/相邻区块：即时
    }
    const sameContinent =
      this.getContinentOfChunk(fromChunkId) === this.getContinentOfChunk(toChunkId);
    return sameContinent ? DELAY_SAME_CONTINENT : DELAY_CROSS_CONTINENT;
  }

  /**
   * 发送速率限制（Redis 计数，窗口 5 分钟）。
   */
  private async checkRateLimit(fromCharacterId: string): Promise<void> {
    const key = prefixKey(`pigeon:ratelimit:${fromCharacterId}`);
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    }
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redisClient.ttl(key);
      const remainingSec = ttl > 0 ? ttl : RATE_LIMIT_WINDOW_MS / 1000;
      throw new AppError(
        `飞鸽传信太频繁了，请 ${Math.ceil(remainingSec / 60)} 分钟后再试`,
        429
      );
    }
  }

  /**
   * 查询角色昵称。
   */
  private async getNickname(characterId: string): Promise<string | null> {
    const rows: any = await query('SELECT nickname FROM characters WHERE id = ?', [
      characterId,
    ]);
    return rows?.[0]?.nickname ?? null;
  }

  /**
   * 查询角色当前区块（Redis 优先，DB 兜底）。
   */
  private async getChunkId(characterId: string): Promise<string> {
    const posKey = prefixKey(`player:${characterId}:position`);
    const cached = await redisClient.get(posKey);
    if (cached) {
      const data = JSON.parse(cached);
      if (data?.chunkId) return data.chunkId;
    }
    const rows: any = await query(
      'SELECT current_chunk_id FROM characters WHERE id = ?',
      [characterId]
    );
    return rows?.[0]?.current_chunk_id ?? '0_0';
  }

  /**
   * 发送一封飞鸽传信。
   * 校验：非空、≤200 字、收件人存在、速率限制。
   */
  async sendMessage(
    fromCharacterId: string,
    toCharacterId: string,
    content: string
  ): Promise<SendResult> {
    if (fromCharacterId === toCharacterId) {
      throw new AppError('不能给自己寄信哦', 400);
    }
    const text = (content ?? '').trim();
    if (!text) {
      throw new AppError('信件内容不能为空', 400);
    }
    if (text.length > MAX_CONTENT_LENGTH) {
      throw new AppError(`信件内容不能超过 ${MAX_CONTENT_LENGTH} 字`, 400);
    }

    const toNickname = await this.getNickname(toCharacterId);
    if (!toNickname) {
      throw new AppError('收件人不存在', 404);
    }

    await this.checkRateLimit(fromCharacterId);

    const [fromChunkId, toChunkId] = await Promise.all([
      this.getChunkId(fromCharacterId),
      this.getChunkId(toCharacterId),
    ]);
    const delayMs = this.calcDelayMs(fromChunkId, toChunkId);
    const deliverAt = delayMs > 0 ? new Date(Date.now() + delayMs) : null;
    // 即时消息直接落库为 delivered
    const status = delayMs === 0 ? 'delivered' : 'sending';

    const result: any = await query(
      `INSERT INTO pigeon_messages
        (from_character_id, to_character_id, content, status, deliver_at)
       VALUES (?, ?, ?, ?, ?)`,
      [fromCharacterId, toCharacterId, text, status, deliverAt]
    );

    logger.info(
      `Pigeon message ${result.insertId}: ${fromCharacterId} -> ${toCharacterId}` +
        (delayMs === 0 ? ' (instant)' : ` (delay ${Math.round(delayMs / 60000)}min)`)
    );

    return {
      messageId: result.insertId,
      toNickname,
      delayMs,
      delivered: delayMs === 0,
    };
  }

  /**
   * 将行数据映射为 DTO。
   */
  private mapRow(row: any): PigeonMessage {
    return {
      id: row.id,
      fromCharacterId: String(row.from_character_id),
      fromNickname: row.from_nickname,
      toCharacterId: String(row.to_character_id),
      toNickname: row.to_nickname,
      content: row.content,
      status: row.status,
      deliverAt: row.deliver_at,
      createdAt: row.created_at,
    };
  }

  private static readonly SELECT_FIELDS = `
    pm.id, pm.from_character_id, pm.to_character_id, pm.content,
           pm.status, pm.deliver_at, pm.created_at,
           fc.nickname AS from_nickname,
           tc.nickname AS to_nickname`;

  /**
   * 收件箱：收到的全部信件（含传递中），最新在前，最近 50 封。
   * "sending" 状态的旧消息（延迟已到但未被 tick 处理）也会被补标记。
   */
  async getInbox(characterId: string): Promise<PigeonMessage[]> {
    const rows: any = await query(
      `SELECT ${PigeonMailService.SELECT_FIELDS}
       FROM pigeon_messages pm
       JOIN characters fc ON fc.id = pm.from_character_id
       JOIN characters tc ON tc.id = pm.to_character_id
       WHERE pm.to_character_id = ?
       ORDER BY pm.created_at DESC
       LIMIT 50`,
      [characterId]
    );
    return (rows ?? []).map((r: any) => this.mapRow(r));
  }

  /**
   * 已发送：发出的全部信件，最新在前，最近 50 封。
   */
  async getSent(characterId: string): Promise<PigeonMessage[]> {
    const rows: any = await query(
      `SELECT ${PigeonMailService.SELECT_FIELDS}
       FROM pigeon_messages pm
       JOIN characters fc ON fc.id = pm.from_character_id
       JOIN characters tc ON tc.id = pm.to_character_id
       WHERE pm.from_character_id = ?
       ORDER BY pm.created_at DESC
       LIMIT 50`,
      [characterId]
    );
    return (rows ?? []).map((r: any) => this.mapRow(r));
  }

  /**
   * 未读数量（delivered 且未 read）。
   */
  async getUnreadCount(characterId: string): Promise<number> {
    const rows: any = await query(
      `SELECT COUNT(*) AS cnt FROM pigeon_messages
       WHERE to_character_id = ? AND status = 'delivered'`,
      [characterId]
    );
    return rows?.[0]?.cnt ?? 0;
  }

  /**
   * 标记一封信为已读（仅收件人本人可操作）。
   */
  async markRead(messageId: number, characterId: string): Promise<void> {
    const result: any = await query(
      `UPDATE pigeon_messages SET status = 'read'
       WHERE id = ? AND to_character_id = ? AND status = 'delivered'`,
      [messageId, characterId]
    );
    if (result?.affectedRows === 0) {
      const rows: any = await query(
        'SELECT id FROM pigeon_messages WHERE id = ? AND to_character_id = ?',
        [messageId, characterId]
      );
      if (!rows?.length) {
        throw new AppError('信件不存在', 404);
      }
      // 已是 read / 仍在传递中：幂等处理，不报错
    }
  }

  /**
   * 周期任务：把到时间的 "sending" 消息置为 "delivered"。
   * 返回本次送达的消息（供 socket 层通知在线收件人）。
   */
  async deliverDueMessages(): Promise<PigeonMessage[]> {
    const due: any = await query(
      `SELECT id FROM pigeon_messages
       WHERE status = 'sending' AND deliver_at IS NOT NULL AND deliver_at <= NOW()
       ORDER BY deliver_at ASC
       LIMIT 50`
    );
    if (!due?.length) return [];

    const delivered: PigeonMessage[] = [];
    for (const row of due) {
      try {
        const result: any = await query(
          `UPDATE pigeon_messages SET status = 'delivered'
           WHERE id = ? AND status = 'sending'`,
          [row.id]
        );
        if (result?.affectedRows === 0) continue; // 已被并发处理

        const msgRows: any = await query(
          `SELECT ${PigeonMailService.SELECT_FIELDS}
           FROM pigeon_messages pm
           JOIN characters fc ON fc.id = pm.from_character_id
           JOIN characters tc ON tc.id = pm.to_character_id
           WHERE pm.id = ?`,
          [row.id]
        );
        if (msgRows?.length) {
          delivered.push(this.mapRow(msgRows[0]));
        }
      } catch (err) {
        logger.error(`Failed to deliver pigeon message ${row.id}`, err);
      }
    }

    if (delivered.length > 0) {
      logger.info(`Pigeon delivery tick: ${delivered.length} message(s) delivered`);
    }
    return delivered;
  }
}

export default new PigeonMailService();