import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

const MAX_FRIENDS = 100;
const TELEPORT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface FriendListItem {
  characterId: string;
  nickname: string;
  continent: string;
  chunkId: string;
  isOnline: boolean;
  createdAt: string;
}

export interface FriendRequestItem {
  id: number;
  fromCharacterId: string;
  fromNickname: string;
  status: string;
  createdAt: string;
}

export class FriendService {
  /**
   * Send a friend request from one character to another.
   * Validates: not self, not already friends, no duplicate pending request.
   */
  async sendRequest(
    fromCharacterId: string,
    toCharacterId: string
  ): Promise<{ requestId: number; toNickname: string }> {
    if (fromCharacterId === toCharacterId) {
      throw new AppError('Cannot send friend request to yourself', 400);
    }

    // Check target exists
    const targetRows: any = await query(
      'SELECT id, nickname FROM characters WHERE id = ?',
      [toCharacterId]
    );
    if (!targetRows.length) {
      throw new AppError('Target character not found', 404);
    }
    const toNickname = targetRows[0].nickname;

    // Check not already friends (either direction)
    const id1 = Math.min(parseInt(fromCharacterId), parseInt(toCharacterId));
    const id2 = Math.max(parseInt(fromCharacterId), parseInt(toCharacterId));
    const existingFriend: any = await query(
      'SELECT id FROM friendships WHERE character_id_1 = ? AND character_id_2 = ?',
      [id1, id2]
    );
    if (existingFriend.length > 0) {
      throw new AppError('Already friends with this character', 400);
    }

    // Check no duplicate pending request (either direction)
    const existingReq: any = await query(
      `SELECT id FROM friend_requests
       WHERE ((from_character_id = ? AND to_character_id = ?)
           OR (from_character_id = ? AND to_character_id = ?))
         AND status = 'pending'`,
      [fromCharacterId, toCharacterId, toCharacterId, fromCharacterId]
    );
    if (existingReq.length > 0) {
      throw new AppError('A pending friend request already exists', 400);
    }

    // Check friend count limit
    const friendCount = await this.getFriendCount(fromCharacterId);
    if (friendCount >= MAX_FRIENDS) {
      throw new AppError('Friend list is full', 400);
    }

    const result: any = await query(
      `INSERT INTO friend_requests (from_character_id, to_character_id, status)
       VALUES (?, ?, 'pending')`,
      [fromCharacterId, toCharacterId]
    );

    logger.info(`Friend request sent: ${fromCharacterId} -> ${toCharacterId}`);
    return { requestId: result.insertId, toNickname };
  }

  /**
   * Accept a friend request. Creates a friendship record and updates request status.
   */
  async acceptRequest(
    requestId: number,
    accepterCharacterId: string
  ): Promise<{ friendCharacterId: string; friendNickname: string }> {
    const reqRows: any = await query(
      `SELECT id, from_character_id, to_character_id, status
       FROM friend_requests WHERE id = ?`,
      [requestId]
    );
    if (!reqRows.length) {
      throw new AppError('Friend request not found', 404);
    }
    const req = reqRows[0];
    if (String(req.to_character_id) !== accepterCharacterId) {
      throw new AppError('Not authorized to accept this request', 403);
    }
    if (req.status !== 'pending') {
      throw new AppError(`Friend request already ${req.status}`, 400);
    }

    // Create friendship (ensure id1 < id2)
    const id1 = Math.min(req.from_character_id, req.to_character_id);
    const id2 = Math.max(req.from_character_id, req.to_character_id);

    try {
      await query(
        `INSERT INTO friendships (character_id_1, character_id_2)
         VALUES (?, ?)`,
        [id1, id2]
      );
    } catch (err: any) {
      // Duplicate entry = already friends (race condition edge case)
      if (err.code !== 'ER_DUP_ENTRY') throw err;
    }

    await query(
      `UPDATE friend_requests SET status = 'accepted', responded_at = NOW() WHERE id = ?`,
      [requestId]
    );

    // Get friend's nickname
    const friendRows: any = await query(
      'SELECT id, nickname FROM characters WHERE id = ?',
      [req.from_character_id]
    );
    const friendNickname = friendRows[0]?.nickname ?? 'Unknown';

    logger.info(`Friend request ${requestId} accepted by ${accepterCharacterId}`);
    return {
      friendCharacterId: String(req.from_character_id),
      friendNickname,
    };
  }

  /**
   * Reject a friend request.
   */
  async rejectRequest(
    requestId: number,
    rejecterCharacterId: string
  ): Promise<void> {
    const reqRows: any = await query(
      `SELECT id, to_character_id, status FROM friend_requests WHERE id = ?`,
      [requestId]
    );
    if (!reqRows.length) {
      throw new AppError('Friend request not found', 404);
    }
    if (String(reqRows[0].to_character_id) !== rejecterCharacterId) {
      throw new AppError('Not authorized to reject this request', 403);
    }
    if (reqRows[0].status !== 'pending') {
      throw new AppError(`Friend request already ${reqRows[0].status}`, 400);
    }

    await query(
      `UPDATE friend_requests SET status = 'rejected', responded_at = NOW() WHERE id = ?`,
      [requestId]
    );
    logger.info(`Friend request ${requestId} rejected`);
  }

  /**
   * Get all friends of a character with online status (via Redis).
   */
  async getFriendList(characterId: string): Promise<FriendListItem[]> {
    const rows: any = await query(
      `SELECT
         CASE WHEN f.character_id_1 = ? THEN f.character_id_2 ELSE f.character_id_1 END AS friend_id,
         c.nickname, c.start_continent, c.current_chunk_id,
         DATE_FORMAT(f.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM friendships f
       JOIN characters c ON c.id =
         CASE WHEN f.character_id_1 = ? THEN f.character_id_2 ELSE f.character_id_1 END
       WHERE f.character_id_1 = ? OR f.character_id_2 = ?
       ORDER BY c.nickname`,
      [characterId, characterId, characterId, characterId]
    );

    const friends: FriendListItem[] = [];
    for (const row of rows) {
      const isOnline = await this.isCharacterOnline(String(row.friend_id));
      friends.push({
        characterId: String(row.friend_id),
        nickname: row.nickname,
        continent: row.start_continent,
        chunkId: row.current_chunk_id,
        isOnline,
        createdAt: row.created_at,
      });
    }
    return friends;
  }

  /**
   * Get pending friend requests received by a character.
   */
  async getPendingRequests(characterId: string): Promise<FriendRequestItem[]> {
    const rows: any = await query(
      `SELECT fr.id, fr.from_character_id, c.nickname AS from_nickname,
              fr.status,
              DATE_FORMAT(fr.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM friend_requests fr
       JOIN characters c ON c.id = fr.from_character_id
       WHERE fr.to_character_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [characterId]
    );
    return rows.map((row: any) => ({
      id: row.id,
      fromCharacterId: String(row.from_character_id),
      fromNickname: row.from_nickname,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Remove a friend (delete friendship record).
   */
  async removeFriend(
    characterId: string,
    friendCharacterId: string
  ): Promise<void> {
    const id1 = Math.min(parseInt(characterId), parseInt(friendCharacterId));
    const id2 = Math.max(parseInt(characterId), parseInt(friendCharacterId));
    const result: any = await query(
      'DELETE FROM friendships WHERE character_id_1 = ? AND character_id_2 = ?',
      [id1, id2]
    );
    if (result.affectedRows === 0) {
      throw new AppError('Not friends with this character', 404);
    }
    logger.info(`Friendship removed: ${characterId} <-> ${friendCharacterId}`);
  }

  /**
   * Teleport to a friend's location. Checks cooldown via Redis.
   * Returns the target position and chunk ID.
   */
  async teleportToFriend(
    characterId: string,
    friendCharacterId: string
  ): Promise<{ position: { x: number; y: number }; chunkId: string; nickname: string }> {
    // Verify friendship
    const id1 = Math.min(parseInt(characterId), parseInt(friendCharacterId));
    const id2 = Math.max(parseInt(characterId), parseInt(friendCharacterId));
    const friendRows: any = await query(
      'SELECT id FROM friendships WHERE character_id_1 = ? AND character_id_2 = ?',
      [id1, id2]
    );
    if (!friendRows.length) {
      throw new AppError('Not friends with this character', 403);
    }

    // Check cooldown
    const cooldownKey = prefixKey(`friend:teleport:cooldown:${characterId}`);
    const cooldown = await redisClient.get(cooldownKey);
    if (cooldown) {
      const remaining = Math.ceil((parseInt(cooldown) - Date.now()) / 1000);
      throw new AppError(
        `Teleport cooldown: ${remaining}s remaining`,
        429
      );
    }

    // Get friend's current position (Redis first, then DB)
    const posKey = prefixKey(`player:${friendCharacterId}:position`);
    const cached = await redisClient.get(posKey);
    let position: { x: number; y: number };
    let chunkId: string;
    let nickname: string;

    if (cached) {
      const data = JSON.parse(cached);
      position = data.position;
      chunkId = data.chunkId;
      nickname = data.nickname;
    } else {
      const rows: any = await query(
        'SELECT grid_x, grid_y, current_chunk_id, nickname FROM characters WHERE id = ?',
        [friendCharacterId]
      );
      if (!rows.length) {
        throw new AppError('Friend character not found', 404);
      }
      position = { x: rows[0].grid_x, y: rows[0].grid_y };
      chunkId = rows[0].current_chunk_id;
      nickname = rows[0].nickname;
    }

    // Set cooldown
    await redisClient.setEx(cooldownKey, TELEPORT_COOLDOWN_MS / 1000, String(Date.now() + TELEPORT_COOLDOWN_MS));

    logger.info(`Teleport: ${characterId} -> friend ${friendCharacterId} at ${chunkId}`);
    return { position, chunkId, nickname };
  }

  /**
   * Check if a character is online (has an active Redis position cache).
   */
  async isCharacterOnline(characterId: string): Promise<boolean> {
    const posKey = prefixKey(`player:${characterId}:position`);
    const exists = await redisClient.exists(posKey);
    return exists === 1;
  }

  /**
   * Get the count of friends for a character.
   */
  async getFriendCount(characterId: string): Promise<number> {
    const rows: any = await query(
      `SELECT COUNT(*) AS cnt FROM friendships
       WHERE character_id_1 = ? OR character_id_2 = ?`,
      [characterId, characterId]
    );
    return rows[0]?.cnt ?? 0;
  }

  /**
   * Get just the friend character IDs (for online-status broadcast on socket
   * connect/disconnect — avoids the per-friend Redis online checks).
   */
  async getFriendIds(characterId: string): Promise<string[]> {
    const rows: any = await query(
      `SELECT
         CASE WHEN f.character_id_1 = ? THEN f.character_id_2 ELSE f.character_id_1 END AS friend_id
       FROM friendships f
       WHERE f.character_id_1 = ? OR f.character_id_2 = ?`,
      [characterId, characterId, characterId]
    );
    return rows.map((row: any) => String(row.friend_id));
  }
}

export default new FriendService();