import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export const MAX_CHAT_HISTORY = 100;

export class ChatMessageService {
  /**
   * Persist a chat message and return the full row (including generated id/time).
   */
  async sendMessage(
    roomId: string,
    characterId: string,
    content: string
  ): Promise<{
    id: number;
    roomId: string;
    characterId: string;
    nickname: string;
    content: string;
    createdAt: string;
  }> {
    const trimmed = String(content).trim();
    if (!trimmed) {
      throw new AppError('Message content is empty', 400);
    }
    if (trimmed.length > 500) {
      throw new AppError('Message content too long (max 500 chars)', 400);
    }

    // Verify the room exists before inserting (FK will also enforce, but a
    // clearer error is nicer).
    const roomCheck: any = await query('SELECT id FROM chat_rooms WHERE id = ?', [roomId]);
    if (roomCheck.length === 0) {
      throw new AppError('Chat room not found', 404);
    }

    await query(
      `INSERT INTO chat_messages (room_id, character_id, content)
       VALUES (?, ?, ?)`,
      [roomId, characterId, trimmed]
    );

    // Join back with the character nickname so the client can render directly.
    const rows: any = await query(
      `SELECT cm.id, cm.room_id, cm.character_id, c.nickname, cm.content,
              DATE_FORMAT(cm.created_at, '%Y-%m-%dT%H:%i:%sZ') as created_at
       FROM chat_messages cm
       JOIN characters c ON c.id = cm.character_id
       WHERE cm.room_id = ? AND cm.character_id = ?
       ORDER BY cm.id DESC
       LIMIT 1`,
      [roomId, characterId]
    );

    const row = rows[0];
    logger.info(`Character ${characterId} sent message to room ${roomId}`);

    return {
      id: row.id,
      roomId: String(row.room_id),
      characterId: String(row.character_id),
      nickname: row.nickname,
      content: row.content,
      createdAt: row.created_at,
    };
  }

  /**
   * Get the most recent messages in a room (most recent first in DB, reversed
   * to chronological order for the client).
   */
  async getHistory(roomId: string, limit = MAX_CHAT_HISTORY): Promise<
    Array<{
      id: number;
      roomId: string;
      characterId: string;
      nickname: string;
      content: string;
      createdAt: string;
    }>
  > {
    const roomCheck: any = await query('SELECT id FROM chat_rooms WHERE id = ?', [roomId]);
    if (roomCheck.length === 0) {
      throw new AppError('Chat room not found', 404);
    }

    const rows: any = await query(
      `SELECT cm.id, cm.room_id, cm.character_id, c.nickname, cm.content,
              DATE_FORMAT(cm.created_at, '%Y-%m-%dT%H:%i:%sZ') as created_at
       FROM chat_messages cm
       JOIN characters c ON c.id = cm.character_id
       WHERE cm.room_id = ?
       ORDER BY cm.id DESC
       LIMIT ?`,
      [roomId, limit]
    );

    return rows.reverse().map((row: any) => ({
      id: row.id,
      roomId: String(row.room_id),
      characterId: String(row.character_id),
      nickname: row.nickname,
      content: row.content,
      createdAt: row.created_at,
    }));
  }
}

export default new ChatMessageService();
