import { query, getConnection } from '../db/mysql.js';
import { AppError } from '../middleware/errorHandler.js';

export type RoomRole = 'owner' | 'member';

class RoomMembershipService {
  async ensureOwner(roomId: string, characterId: string): Promise<void> {
    await query(
      `INSERT INTO room_members (room_id, character_id, role, status)
       VALUES (?, ?, 'owner', 'active')
       ON DUPLICATE KEY UPDATE role = 'owner', status = 'active'`,
      [roomId, characterId],
    );
  }

  async getRoomAccess(roomId: string, characterId: string): Promise<{ isPublic: boolean; role: RoomRole | null }> {
    const rows: any = await query(
      `SELECT cr.id, cr.owner_id, COALESCE(mc.is_public, 0) AS is_public,
              rm.role, rm.status
       FROM chat_rooms cr
       LEFT JOIN map_chunks mc ON mc.chunk_id = cr.chunk_id
       LEFT JOIN room_members rm ON rm.room_id = cr.id AND rm.character_id = ?
       WHERE cr.id = ?`,
      [characterId, roomId],
    );
    if (rows.length === 0) throw new AppError('Chat room not found', 404);
    const row = rows[0];
    const role = String(row.owner_id) === String(characterId)
      ? 'owner'
      : row.status === 'active' && row.role === 'member' ? 'member' : null;
    return { isPublic: Boolean(row.is_public), role };
  }

  async requireAccess(roomId: string, characterId: string): Promise<{ isPublic: boolean; role: RoomRole | null }> {
    const access = await this.getRoomAccess(roomId, characterId);
    if (!access.isPublic && !access.role) throw new AppError('Room membership required', 403);
    return access;
  }

  async requireOwner(roomId: string, characterId: string): Promise<void> {
    const access = await this.getRoomAccess(roomId, characterId);
    if (access.role !== 'owner') throw new AppError('Only the room owner can do this', 403);
  }

  async listState(roomId: string, characterId: string): Promise<any> {
    const access = await this.requireAccess(roomId, characterId);
    const members: any = await query(
      `SELECT rm.character_id, c.nickname, rm.role, rm.status, rm.joined_at
       FROM room_members rm JOIN characters c ON c.id = rm.character_id
       WHERE rm.room_id = ? AND rm.status = 'active' ORDER BY rm.role DESC, rm.joined_at`,
      [roomId],
    );
    const invitations: any = await query(
      `SELECT ri.id, ri.room_id, ri.to_character_id, ri.from_character_id,
              ri.status, ri.created_at, c.nickname AS from_nickname
       FROM room_invitations ri JOIN characters c ON c.id = ri.from_character_id
       WHERE ri.room_id = ? AND ri.to_character_id = ? AND ri.status = 'pending'
       ORDER BY ri.created_at DESC`,
      [roomId, characterId],
    );
    return {
      isPublic: access.isPublic,
      role: access.role,
      members: members.map((row: any) => ({
        characterId: String(row.character_id), nickname: row.nickname,
        role: row.role, status: row.status, joinedAt: row.joined_at,
      })),
      invitations: invitations.map((row: any) => ({
        id: row.id, roomId: String(row.room_id), fromCharacterId: String(row.from_character_id),
        fromNickname: row.from_nickname, createdAt: row.created_at,
      })),
    };
  }

  async listPendingInvitations(characterId: string): Promise<any[]> {
    const rows: any = await query(
      `SELECT ri.id, ri.room_id, ri.from_character_id, ri.created_at,
              cr.name AS room_name, c.nickname AS from_nickname
       FROM room_invitations ri
       JOIN chat_rooms cr ON cr.id = ri.room_id
       JOIN characters c ON c.id = ri.from_character_id
       WHERE ri.to_character_id = ? AND ri.status = 'pending'
       ORDER BY ri.created_at DESC`,
      [characterId],
    );
    return rows.map((row: any) => ({
      id: row.id, roomId: String(row.room_id), roomName: row.room_name,
      fromCharacterId: String(row.from_character_id), fromNickname: row.from_nickname,
      createdAt: row.created_at,
    }));
  }

  async invite(roomId: string, fromCharacterId: string, toCharacterId: string): Promise<any> {
    await this.requireOwner(roomId, fromCharacterId);
    if (String(fromCharacterId) === String(toCharacterId)) throw new AppError('Owner is already a member', 400);
    const target: any = await query('SELECT id FROM characters WHERE id = ?', [toCharacterId]);
    if (target.length === 0) throw new AppError('Character not found', 404);
    const existing: any = await query(
      `SELECT status FROM room_members WHERE room_id = ? AND character_id = ?`,
      [roomId, toCharacterId],
    );
    if (existing.length > 0 && existing[0].status === 'active') throw new AppError('Character is already a member', 409);
    const pending: any = await query(
      `SELECT id FROM room_invitations WHERE room_id = ? AND to_character_id = ? AND status = 'pending'`,
      [roomId, toCharacterId],
    );
    if (pending.length > 0) return { id: pending[0].id };
    const result: any = await query(
      `INSERT INTO room_invitations (room_id, from_character_id, to_character_id)
       VALUES (?, ?, ?)`,
      [roomId, fromCharacterId, toCharacterId],
    );
    return { id: result.insertId };
  }

  async respond(invitationId: string, characterId: string, accept: boolean): Promise<void> {
    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      const rows: any = await connection.execute(
        `SELECT id, room_id, status FROM room_invitations
         WHERE id = ? AND to_character_id = ? FOR UPDATE`,
        [invitationId, characterId],
      );
      const invitations = rows[0] as any[];
      if (invitations.length === 0) throw new AppError('Invitation not found', 404);
      if (invitations[0].status !== 'pending') throw new AppError('Invitation is no longer pending', 409);
      const status = accept ? 'accepted' : 'rejected';
      await connection.execute(
        `UPDATE room_invitations SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, invitationId],
      );
      if (accept) {
        await connection.execute(
          `INSERT INTO room_members (room_id, character_id, role, status)
           VALUES (?, ?, 'member', 'active')
           ON DUPLICATE KEY UPDATE role = 'member', status = 'active', joined_at = CURRENT_TIMESTAMP`,
          [invitations[0].room_id, characterId],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async remove(roomId: string, ownerId: string, memberId: string): Promise<void> {
    await this.requireOwner(roomId, ownerId);
    if (String(ownerId) === String(memberId)) throw new AppError('Owner cannot be removed', 400);
    const result: any = await query(
      `UPDATE room_members SET status = 'removed' WHERE room_id = ? AND character_id = ? AND role = 'member' AND status = 'active'`,
      [roomId, memberId],
    );
    if (result.affectedRows === 0) throw new AppError('Member not found', 404);
  }

  async isRemoved(roomId: string, characterId: string): Promise<boolean> {
    const rows: any = await query(
      'SELECT status FROM room_members WHERE room_id = ? AND character_id = ? LIMIT 1',
      [roomId, characterId],
    );
    return rows.length > 0 && rows[0].status === 'removed';
  }
}

export default new RoomMembershipService();
