import { query } from '../db/mysql.js';
import { getRedis, prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import MovementService from './MovementService.js';
import ExplorationService from './ExplorationService.js';
import config from '../config.js';

/** 好友上限（GDD §2.7 好友列表功能） */
export const FRIEND_LIMIT = 50;

/** 好友传送冷却时间（GDD §2.7：5-10 分钟，取 5 分钟） */
export const TELEPORT_COOLDOWN_SECONDS = 300;

export interface FriendInfo {
  characterId: number;
  nickname: string;
  isOnline: boolean;
  currentChunkId: string | null;
  friendSince: string;
}

export interface FriendRequestInfo {
  requestId: number;
  fromCharacterId: number;
  fromNickname: string;
  message: string | null;
  createdAt: string;
}

export interface MailboxMessageInfo {
  id: number;
  type: 'friend_request' | 'system' | 'chat' | 'pigeon';
  senderId: number | null;
  senderNickname: string | null;
  content: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

/** 好友私聊消息（GDD §2.7 好友私聊频道） */
export interface PrivateMessageInfo {
  id: number;
  senderId: number;
  receiverId: number;
  senderNickname: string;
  content: { text: string };
  isRead: boolean;
  createdAt: string;
}

/** 飞鸽传书消息（GDD §2.7 飞鸽传书） */
export interface PigeonMessageInfo {
  id: number;
  senderId: number;
  receiverId: number;
  senderNickname: string;
  content: string;
  distance: number;
  hasTrafficChannel: boolean;
  calculatedDelay: number;
  sentAt: string;
  deliveredAt: string | null;
}

/** 在线角色集合的 Redis key（服务端内部使用，需自行加 prefixKey） */
const ONLINE_CHARACTERS_KEY = 'online:characters';

export class FriendService {
  // ==================== 在线状态 ====================

  /** 角色上线（socket 连接建立时调用） */
  async setCharacterOnline(characterId: number): Promise<void> {
    const redis = getRedis();
    await redis.sAdd(prefixKey(ONLINE_CHARACTERS_KEY), String(characterId));
  }

  /** 角色下线（socket 断开时调用） */
  async setCharacterOffline(characterId: number): Promise<void> {
    const redis = getRedis();
    await redis.sRem(prefixKey(ONLINE_CHARACTERS_KEY), String(characterId));
  }

  /** 批量查询角色在线状态 */
  async getOnlineStatus(characterIds: number[]): Promise<Map<number, boolean>> {
    const result = new Map<number, boolean>();
    if (characterIds.length === 0) return result;

    const redis = getRedis();
    for (const id of characterIds) {
      const isOnline = await redis.sIsMember(prefixKey(ONLINE_CHARACTERS_KEY), String(id));
      result.set(id, Boolean(isOnline));
    }
    return result;
  }

  // ==================== 好友请求 ====================

  /**
   * 发送好友请求。
   * 校验：不能加自己、目标存在、非已是好友、无 pending 请求、好友数量未超上限。
   * 创建请求 + 写入收件人 mailbox（type=friend_request）。
   */
  async sendFriendRequest(
    fromCharacterId: number,
    toCharacterId: number,
    message?: string
  ): Promise<FriendRequestInfo> {
    if (fromCharacterId === toCharacterId) {
      throw new AppError('不能向自己发送好友请求', 400);
    }

    // 目标角色必须存在
    const targets: any = await query('SELECT id, nickname FROM characters WHERE id = ?', [
      toCharacterId,
    ]);
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new AppError('目标角色不存在', 404);
    }
    const targetNickname: string = targets[0].nickname;

    // 已经是好友？
    if (await this.isFriend(fromCharacterId, toCharacterId)) {
      throw new AppError('你们已经是好友了', 409);
    }

    // 已有待处理的请求（任一方向）？
    const pending: any = await query(
      `SELECT id FROM friend_requests
       WHERE status = 'pending' AND ((from_character_id = ? AND to_character_id = ?)
         OR (from_character_id = ? AND to_character_id = ?))`,
      [fromCharacterId, toCharacterId, toCharacterId, fromCharacterId]
    );
    if (Array.isArray(pending) && pending.length > 0) {
      throw new AppError('已存在待处理的好友请求', 409);
    }

    // 好友上限校验（双方）
    const myCount = await this.getFriendCount(fromCharacterId);
    if (myCount >= FRIEND_LIMIT) {
      throw new AppError('好友数量已达上限', 400);
    }
    const targetCount = await this.getFriendCount(toCharacterId);
    if (targetCount >= FRIEND_LIMIT) {
      throw new AppError('对方好友数量已达上限', 400);
    }

    const sender: any = await query('SELECT nickname FROM characters WHERE id = ?', [
      fromCharacterId,
    ]);
    const fromNickname: string = sender[0]?.nickname ?? '';

    // 创建请求
    const insert: any = await query(
      `INSERT INTO friend_requests (from_character_id, to_character_id, status, message)
       VALUES (?, ?, 'pending', ?)`,
      [fromCharacterId, toCharacterId, message ?? null]
    );
    const requestId = insert.insertId;

    // 写入收件人信箱
    await this.createMailboxMessage(toCharacterId, 'friend_request', fromCharacterId, {
      requestId,
      fromNickname,
      message: message ?? null,
    });

    logger.info(`Friend request sent: character ${fromCharacterId} -> ${toCharacterId}`);

    return {
      requestId,
      fromCharacterId,
      fromNickname,
      message: message ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  /** 处理好友请求（接受/拒绝）。接受时创建双向 Friendship。 */
  async respondToRequest(
    requestId: number,
    responderCharacterId: number,
    accept: boolean
  ): Promise<{ status: 'accepted' | 'rejected'; fromCharacterId: number; toCharacterId: number }> {
    const requests: any = await query('SELECT * FROM friend_requests WHERE id = ?', [requestId]);
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new AppError('好友请求不存在', 404);
    }
    const req = requests[0];

    if (req.to_character_id !== responderCharacterId) {
      throw new AppError('无权处理该请求', 403);
    }
    if (req.status !== 'pending') {
      throw new AppError('该请求已被处理', 409);
    }

    const newStatus = accept ? 'accepted' : 'rejected';
    await query(
      `UPDATE friend_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, requestId]
    );

    if (accept) {
      // 创建双向 Friendship（id1 < id2 保证唯一）
      await this.createFriendship(req.from_character_id, req.to_character_id);

      // 给发起方写一条系统消息
      await this.createMailboxMessage(req.from_character_id, 'system', null, {
        text: '你的好友请求已被接受',
        requestId,
      });
    }

    logger.info(`Friend request ${requestId} ${newStatus} by character ${responderCharacterId}`);

    return {
      status: newStatus,
      fromCharacterId: req.from_character_id,
      toCharacterId: req.to_character_id,
    };
  }

  /** 获取收到的待处理请求列表 */
  async getPendingRequests(characterId: number): Promise<FriendRequestInfo[]> {
    const rows: any = await query(
      `SELECT fr.id, fr.from_character_id, fr.message, fr.created_at, c.nickname AS from_nickname
       FROM friend_requests fr
       JOIN characters c ON c.id = fr.from_character_id
       WHERE fr.to_character_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [characterId]
    );

    return (rows as any[]).map((r) => ({
      requestId: r.id,
      fromCharacterId: r.from_character_id,
      fromNickname: r.from_nickname,
      message: r.message,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  // ==================== 好友列表 ====================

  /** 获取好友列表（含在线状态，在线者优先，其次按昵称排序） */
  async getFriends(characterId: number): Promise<FriendInfo[]> {
    const rows: any = await query(
      `SELECT
         CASE WHEN f.character_id_1 = ? THEN f.character_id_2 ELSE f.character_id_1 END AS friend_id,
         f.created_at AS friend_since,
         c.nickname,
         c.current_chunk_id
       FROM friendships f
       JOIN characters c ON c.id =
         CASE WHEN f.character_id_1 = ? THEN f.character_id_2 ELSE f.character_id_1 END
       WHERE ? IN (f.character_id_1, f.character_id_2)`,
      [characterId, characterId, characterId]
    );

    if (!Array.isArray(rows) || rows.length === 0) return [];

    const friends: FriendInfo[] = [];
    for (const r of rows as any[]) {
      friends.push({
        characterId: r.friend_id,
        nickname: r.nickname,
        isOnline: false,
        currentChunkId: r.current_chunk_id,
        friendSince: new Date(r.friend_since).toISOString(),
      });
    }

    // 批量填充在线状态
    const statusMap = await this.getOnlineStatus(friends.map((f) => f.characterId));
    for (const f of friends) {
      f.isOnline = statusMap.get(f.characterId) ?? false;
    }

    // 在线优先，其次按昵称
    friends.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.nickname.localeCompare(b.nickname);
    });

    return friends;
  }

  /** 删除好友（解除双向 Friendship） */
  async removeFriend(characterId: number, friendCharacterId: number): Promise<void> {
    if (!(await this.isFriend(characterId, friendCharacterId))) {
      throw new AppError('你们不是好友', 404);
    }

    const [id1, id2] = [characterId, friendCharacterId].sort((a, b) => a - b);
    await query(
      'DELETE FROM friendships WHERE character_id_1 = ? AND character_id_2 = ?',
      [id1, id2]
    );

    logger.info(`Friendship removed: ${characterId} <-> ${friendCharacterId}`);
  }

  /** 好友数量 */
  async getFriendCount(characterId: number): Promise<number> {
    const rows: any = await query(
      'SELECT COUNT(*) AS cnt FROM friendships WHERE ? IN (character_id_1, character_id_2)',
      [characterId]
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  /** 两人是否已是好友 */
  async isFriend(a: number, b: number): Promise<boolean> {
    const [id1, id2] = [a, b].sort((x, y) => x - y);
    const rows: any = await query(
      'SELECT id FROM friendships WHERE character_id_1 = ? AND character_id_2 = ?',
      [id1, id2]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  // ==================== 好友传送（GDD §2.7） ====================

  /**
   * 传送到好友位置
   * 校验：好友关系、好友在线、冷却时间（5 分钟）
   * 落地后随机落在好友附近 1-2 格（避免完全重叠），并自动探索周边
   */
  async teleportToFriend(
    characterId: number,
    friendCharacterId: number
  ): Promise<{
    position: { x: number; y: number };
    chunkId: string;
    friendNickname: string | null;
    cooldownRemaining: number;
  }> {
    // 校验好友关系
    if (!(await this.isFriend(characterId, friendCharacterId))) {
      throw new AppError('你们不是好友，无法传送', 404);
    }

    // 校验好友在线
    const onlineMap = await this.getOnlineStatus([friendCharacterId]);
    if (!onlineMap.get(friendCharacterId)) {
      throw new AppError('好友不在线，无法传送', 400);
    }

    // 校验冷却
    const redis = await getRedis();
    const cooldownKey = prefixKey(`teleport:cooldown:${characterId}`);
    const remaining = await redis.ttl(cooldownKey);
    if (remaining > 0) {
      throw new AppError(
        `传送冷却中，请 ${Math.ceil(remaining / 60)} 分钟后再试`,
        429
      );
    }

    // 获取好友位置
    const friendPos = await MovementService.getPlayerPosition(String(friendCharacterId));
    if (!friendPos) {
      throw new AppError('无法获取好友位置', 400);
    }

    // 计算传送落点：好友附近随机偏移 1-2 格（避免完全重叠）
    const offset = () => {
      const magnitude = 1 + Math.floor(Math.random() * 2); // 1 或 2
      const angle = Math.random() * Math.PI * 2;
      return {
        dx: Math.round(Math.cos(angle) * magnitude),
        dy: Math.round(Math.sin(angle) * magnitude),
      };
    };

    const targetX = friendPos.position.x + offset().dx;
    const targetY = friendPos.position.y + offset().dy;

    // 计算目标 chunk（沿用 32x32 网格规则）
    const targetChunkId = MovementService.getChunkId(targetX, targetY);

    // 落地后写入位置：DB + Redis 缓存
    await MovementService.updatePositionAfterTeleport(String(characterId), targetX, targetY, targetChunkId);

    // 自动探索落点周边（探索半径与 GDD §3.2 一致，取 1）
    await ExplorationService.exploreArea(String(characterId), targetChunkId, 1);

    // 写入冷却（5 分钟）
    await redis.setEx(cooldownKey, TELEPORT_COOLDOWN_SECONDS, String(Date.now()));

    logger.info(
      `Friend teleport: character ${characterId} -> friend ${friendCharacterId} at (${targetX}, ${targetY}) chunk ${targetChunkId}`
    );

    return {
      position: { x: targetX, y: targetY },
      chunkId: targetChunkId,
      friendNickname: friendPos.nickname,
      cooldownRemaining: TELEPORT_COOLDOWN_SECONDS,
    };
  }

  // ==================== 信箱 ====================

  /** 写入一条信箱消息（服务内部使用） */
  async createMailboxMessage(
    receiverId: number,
    type: 'friend_request' | 'system' | 'chat' | 'pigeon',
    senderId: number | null,
    content: Record<string, any>
  ): Promise<number> {
    const insert: any = await query(
      'INSERT INTO messages (receiver_id, sender_id, type, content) VALUES (?, ?, ?, ?)',
      [receiverId, senderId, type, JSON.stringify(content)]
    );
    return insert.insertId;
  }

  /** 获取信箱消息列表（按类型筛选可选） */
  async getMailbox(
    characterId: number,
    type?: 'friend_request' | 'system' | 'chat' | 'pigeon'
  ): Promise<MailboxMessageInfo[]> {
    let sql = `SELECT m.id, m.type, m.sender_id, m.content, m.is_read, m.created_at, c.nickname AS sender_nickname
       FROM messages m
       LEFT JOIN characters c ON c.id = m.sender_id
       WHERE m.receiver_id = ?`;
    const params: any[] = [characterId];
    if (type) {
      sql += ' AND m.type = ?';
      params.push(type);
    }
    sql += ' ORDER BY m.created_at DESC LIMIT 100';

    const rows: any = await query(sql, params);

    return (rows as any[]).map((r) => ({
      id: r.id,
      type: r.type,
      senderId: r.sender_id,
      senderNickname: r.sender_nickname,
      content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
      isRead: Boolean(r.is_read),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  /** 标记信箱消息为已读 */
  async markMessageRead(characterId: number, messageId: number): Promise<void> {
    await query('UPDATE messages SET is_read = TRUE WHERE id = ? AND receiver_id = ?', [
      messageId,
      characterId,
    ]);
  }

  /** 未读消息数 */
  async getUnreadCount(characterId: number): Promise<number> {
    const rows: any = await query(
      'SELECT COUNT(*) AS cnt FROM messages WHERE receiver_id = ? AND is_read = FALSE',
      [characterId]
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  // ==================== 好友私聊（GDD §2.7） ====================

  /**
   * 发送私聊消息。
   * 校验：好友关系、内容非空且 ≤200 字。
   * 写入 messages 表 type='chat'，receiver_id=接收者, sender_id=发送者。
   * 返回创建的消息记录（含 id、createdAt）。
   */
  async sendPrivateMessage(
    fromCharacterId: number,
    toCharacterId: number,
    content: string
  ): Promise<PrivateMessageInfo> {
    if (!content || content.trim().length === 0) {
      throw new AppError('消息内容不能为空', 400);
    }
    if (content.length > 200) {
      throw new AppError('消息内容不能超过 200 字', 400);
    }

    // 校验好友关系
    const friendOk = await this.isFriend(fromCharacterId, toCharacterId);
    if (!friendOk) {
      throw new AppError('对方不是你的好友', 404);
    }

    // 获取发送者昵称
    const senderRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [fromCharacterId]
    );
    const senderNickname = senderRows[0]?.nickname ?? '未知';

    const msgContent = { text: content.trim() };
    const insert: any = await query(
      'INSERT INTO messages (receiver_id, sender_id, type, content) VALUES (?, ?, ?, ?)',
      [toCharacterId, fromCharacterId, 'chat', JSON.stringify(msgContent)]
    );

    return {
      id: insert.insertId,
      senderId: fromCharacterId,
      receiverId: toCharacterId,
      senderNickname,
      content: msgContent,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * 获取与某好友的私聊历史（双向，最近 100 条，按时间正序返回）。
   */
  async getPrivateMessages(
    characterId: number,
    friendCharacterId: number
  ): Promise<PrivateMessageInfo[]> {
    const rows: any = await query(
      `SELECT m.id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
              s.nickname AS sender_nickname
       FROM messages m
       LEFT JOIN characters s ON s.id = m.sender_id
       WHERE m.type = 'chat'
         AND ((m.sender_id = ? AND m.receiver_id = ?)
           OR (m.sender_id = ? AND m.receiver_id = ?))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 100`,
      [characterId, friendCharacterId, friendCharacterId, characterId]
    );

    const messages = (rows as any[]).map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      senderNickname: r.sender_nickname ?? '未知',
      content: typeof r.content === 'string' ? JSON.parse(r.content) : r.content,
      isRead: Boolean(r.is_read),
      createdAt: new Date(r.created_at).toISOString(),
    }));

    // 按时间正序返回（最旧在前）
    return messages.reverse();
  }

  /**
   * 标记与某好友的私聊消息为已读（仅标记 receiver_id = characterId 的消息）。
   */
  async markConversationRead(
    characterId: number,
    friendCharacterId: number
  ): Promise<void> {
    await query(
      `UPDATE messages SET is_read = TRUE
       WHERE type = 'chat' AND receiver_id = ? AND sender_id = ?`,
      [characterId, friendCharacterId]
    );
  }

  // ==================== 飞鸽传书（GDD §2.7） ====================

  /**
   * 发送飞鸽传书。
   * 校验：内容非空且 ≤200 字、不能发给自己、接收者存在、
   *   陌生人检查（接收者开启了 reject_stranger_pigeon 且非好友则拒绝）、
   *   冷却检查（每 5 分钟最多 3 条）。
   * 计算：根据双方区块距离 & 交通渠道计算延迟。
   * 延迟为 0 时立即投递；否则写入 pigeon_messages 等待定时扫描。
   */
  async sendPigeonMessage(
    fromCharacterId: number,
    toCharacterId: number,
    content: string
  ): Promise<PigeonMessageInfo> {
    if (!content || content.trim().length === 0) {
      throw new AppError('飞鸽传书内容不能为空', 400);
    }
    if (content.length > 200) {
      throw new AppError('飞鸽传书内容不能超过 200 字', 400);
    }
    if (fromCharacterId === toCharacterId) {
      throw new AppError('不能给自己发飞鸽传书', 400);
    }

    // 校验接收者存在
    const receiverRows: any = await query(
      'SELECT id, nickname, start_continent, current_chunk_id, reject_stranger_pigeon FROM characters WHERE id = ?',
      [toCharacterId]
    );
    if (!Array.isArray(receiverRows) || receiverRows.length === 0) {
      throw new AppError('接收者不存在', 404);
    }
    const receiver = receiverRows[0];

    // 陌生人检查
    const isFriend = await this.isFriend(fromCharacterId, toCharacterId);
    if (Boolean(receiver.reject_stranger_pigeon) && !isFriend) {
      throw new AppError('对方已开启拒绝陌生人飞鸽传书', 403);
    }

    // 冷却检查：每 5 分钟最多 3 条
    const cooldownRows: any = await query(
      `SELECT COUNT(*) AS cnt FROM pigeon_messages
       WHERE sender_id = ? AND sent_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [fromCharacterId]
    );
    if (Number(cooldownRows[0]?.cnt ?? 0) >= 3) {
      throw new AppError('飞鸽传书发送过于频繁，每 5 分钟最多 3 条', 429);
    }

    // 获取发送者位置信息
    const senderRows: any = await query(
      'SELECT id, nickname, start_continent, current_chunk_id FROM characters WHERE id = ?',
      [fromCharacterId]
    );
    const sender = senderRows[0];

    // 计算区块距离
    const distance = this.calculateChunkDistance(
      String(sender.current_chunk_id),
      String(receiver.current_chunk_id)
    );

    // 计算延迟（秒）
    const sameContinent = sender.start_continent === receiver.start_continent;
    const { delaySeconds, hasTrafficChannel } = this.calculatePigeonDelay(
      distance,
      sameContinent
    );

    // 应用延迟缩放（E2E 测试用）
    const scaledDelay = Math.round(delaySeconds * config.pigeon.delayScale);

    const msgContent = { text: content.trim() };

    if (scaledDelay === 0) {
      // 即时投递：写入 pigeon_messages（delivered_at 立即设置）+ 写入信箱
      const insert: any = await query(
        `INSERT INTO pigeon_messages (sender_id, receiver_id, content, distance, has_traffic_channel, calculated_delay, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [fromCharacterId, toCharacterId, content.trim(), distance, hasTrafficChannel, delaySeconds]
      );
      await this.createMailboxMessage(
        toCharacterId,
        'pigeon',
        fromCharacterId,
        { text: content.trim(), pigeonId: insert.insertId }
      );

      return {
        id: insert.insertId,
        senderId: fromCharacterId,
        receiverId: toCharacterId,
        senderNickname: sender.nickname,
        content: content.trim(),
        distance,
        hasTrafficChannel,
        calculatedDelay: delaySeconds,
        sentAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
      };
    }

    // 延迟投递：写入 pigeon_messages，delivered_at 为 NULL
    const insert: any = await query(
      `INSERT INTO pigeon_messages (sender_id, receiver_id, content, distance, has_traffic_channel, calculated_delay)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fromCharacterId, toCharacterId, content.trim(), distance, hasTrafficChannel, delaySeconds]
    );

    return {
      id: insert.insertId,
      senderId: fromCharacterId,
      receiverId: toCharacterId,
      senderNickname: sender.nickname,
      content: content.trim(),
      distance,
      hasTrafficChannel,
      calculatedDelay: scaledDelay,
      sentAt: new Date().toISOString(),
      deliveredAt: null,
    };
  }

  /**
   * 处理到期飞鸽传书：扫描 delivered_at IS NULL 且已过延迟时间的消息，
   * 标记已投递并写入接收者信箱。
   * 返回已投递的消息列表（供 socket 层通知在线接收者）。
   */
  async processDuePigeonMessages(): Promise<Array<{
    pigeonId: number;
    senderId: number;
    receiverId: number;
    senderNickname: string;
    content: string;
  }>> {
    // 查找到期的飞鸽传书
    const dueRows: any = await query(
      `SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.sent_at, pm.calculated_delay,
              s.nickname AS sender_nickname
       FROM pigeon_messages pm
       LEFT JOIN characters s ON s.id = pm.sender_id
       WHERE pm.delivered_at IS NULL
         AND TIMESTAMPDIFF(SECOND, pm.sent_at, NOW()) >= pm.calculated_delay * ?
       LIMIT 100`,
      [config.pigeon.delayScale > 0 ? config.pigeon.delayScale : 1]
    );

    if (!Array.isArray(dueRows) || dueRows.length === 0) {
      return [];
    }

    const delivered: Array<{
      pigeonId: number;
      senderId: number;
      receiverId: number;
      senderNickname: string;
      content: string;
    }> = [];

    for (const r of dueRows) {
      // 标记已投递
      await query(
        'UPDATE pigeon_messages SET delivered_at = NOW() WHERE id = ? AND delivered_at IS NULL',
        [r.id]
      );
      // 写入信箱
      await this.createMailboxMessage(
        Number(r.receiver_id),
        'pigeon',
        Number(r.sender_id),
        { text: r.content, pigeonId: r.id }
      );

      delivered.push({
        pigeonId: Number(r.id),
        senderId: Number(r.sender_id),
        receiverId: Number(r.receiver_id),
        senderNickname: r.sender_nickname ?? '未知',
        content: r.content,
      });
    }

    return delivered;
  }

  /**
   * 获取飞鸽传书列表（已收到的，按时间倒序）。
   */
  async getPigeonMessages(characterId: number): Promise<PigeonMessageInfo[]> {
    const rows: any = await query(
      `SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.distance,
              pm.has_traffic_channel, pm.calculated_delay, pm.sent_at, pm.delivered_at,
              s.nickname AS sender_nickname
       FROM pigeon_messages pm
       LEFT JOIN characters s ON s.id = pm.sender_id
       WHERE pm.receiver_id = ? AND pm.delivered_at IS NOT NULL
       ORDER BY pm.delivered_at DESC LIMIT 100`,
      [characterId]
    );

    return (rows as any[]).map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      senderNickname: r.sender_nickname ?? '未知',
      content: r.content,
      distance: r.distance,
      hasTrafficChannel: Boolean(r.has_traffic_channel),
      calculatedDelay: r.calculated_delay,
      sentAt: new Date(r.sent_at).toISOString(),
      deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
    }));
  }

  /**
   * 获取飞鸽传书隐私设置。
   */
  async getPigeonSettings(characterId: number): Promise<{ rejectStrangerPigeon: boolean }> {
    const rows: any = await query(
      'SELECT reject_stranger_pigeon FROM characters WHERE id = ?',
      [characterId]
    );
    return { rejectStrangerPigeon: Boolean(rows[0]?.reject_stranger_pigeon) };
  }

  /**
   * 更新飞鸽传书隐私设置。
   */
  async updatePigeonSettings(
    characterId: number,
    rejectStrangerPigeon: boolean
  ): Promise<{ rejectStrangerPigeon: boolean }> {
    await query(
      'UPDATE characters SET reject_stranger_pigeon = ? WHERE id = ?',
      [rejectStrangerPigeon, characterId]
    );
    return { rejectStrangerPigeon };
  }

  // ---- 飞鸽传书内部工具 ----

  /**
   * 计算两个区块之间的距离（切比雪夫距离，即八方向最大格数）。
   * chunkId 格式为 "x_y"。
   */
  private calculateChunkDistance(chunkIdA: string, chunkIdB: string): number {
    const [ax, ay] = chunkIdA.split('_').map(Number);
    const [bx, by] = chunkIdB.split('_').map(Number);
    const dx = Math.abs((ax ?? 0) - (bx ?? 0));
    const dy = Math.abs((ay ?? 0) - (by ?? 0));
    return Math.max(dx, dy);
  }

  /**
   * 根据 GDD §2.7 计算飞鸽传书延迟（秒）。
   * - 同区块/相邻区块（distance ≤ 1）= 0（即时）
   * - 同大洲内跨区块（无交通渠道）= 5-15 分钟
   * - 跨大洲（无交通渠道）= 15-30 分钟
   * hasTrafficChannel 目前固定为 false（无传送门系统）。
   */
  private calculatePigeonDelay(
    distance: number,
    sameContinent: boolean
  ): { delaySeconds: number; hasTrafficChannel: boolean } {
    const hasTrafficChannel = false;

    if (distance <= 1) {
      return { delaySeconds: 0, hasTrafficChannel };
    }

    if (sameContinent) {
      // 同大洲跨区块：5-15 分钟（取中间值 600 秒）
      return { delaySeconds: 600, hasTrafficChannel };
    }

    // 跨大洲：15-30 分钟（取中间值 1350 秒）
    return { delaySeconds: 1350, hasTrafficChannel };
  }

  // ==================== 内部工具 ====================

  /** 创建双向 Friendship（id1 < id2） */
  private async createFriendship(a: number, b: number): Promise<void> {
    const [id1, id2] = [a, b].sort((x, y) => x - y);
    await query(
      'INSERT IGNORE INTO friendships (character_id_1, character_id_2) VALUES (?, ?)',
      [id1, id2]
    );
  }
}

export default new FriendService();