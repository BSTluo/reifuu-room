import crypto from 'crypto';
import { query, getConnection } from '../db/mysql.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * 邀请码出生系统（GDD §2.1「邀请码出生」）
 *
 * 玩家可生成邀请码（一次一个 active），新玩家在创角时输入邀请码，
 * 直接出生到邀请者所在地块（需邀请者地块公开或邀请者手动授权——
 * 本实现统一按「邀请码即授权」处理：生码即视为授权对方出生到自己当前地块）。
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符（0/O、1/I）
const CODE_LENGTH = 8;
const MAX_ACTIVE_CODES_PER_INVITER = 5;

export interface InviteCodeDTO {
  id: number;
  code: string;
  inviterCharacterId: number;
  inviterNickname: string;
  status: 'active' | 'used' | 'revoked';
  createdAt: string;
  usedAt: string | null;
  usedByNickname: string | null;
}

function mapInviteCode(row: any): InviteCodeDTO {
  return {
    id: Number(row.id),
    code: String(row.code),
    inviterCharacterId: Number(row.inviter_character_id),
    inviterNickname: String(row.inviter_nickname ?? ''),
    status: row.status,
    createdAt: row.created_at,
    usedAt: row.used_at ?? null,
    usedByNickname: row.used_by_nickname ? String(row.used_by_nickname) : null,
  };
}

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

export class InviteCodeService {
  /**
   * 生成新的邀请码。每个邀请者最多同时持有 MAX_ACTIVE_CODES_PER_INVITER 个 active 邀请码。
   */
  async createInviteCode(characterId: string): Promise<InviteCodeDTO> {
    const activeCount: any = await query(
      `SELECT COUNT(*) AS cnt FROM invite_codes
       WHERE inviter_character_id = ? AND status = 'active'`,
      [characterId]
    );
    if (Array.isArray(activeCount) && Number(activeCount[0].cnt) >= MAX_ACTIVE_CODES_PER_INVITER) {
      throw new AppError(`邀请码数量已达上限（最多 ${MAX_ACTIVE_CODES_PER_INVITER} 个有效邀请码）`, 400);
    }

    // 碰撞时重试生成
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      try {
        const result: any = await query(
          `INSERT INTO invite_codes (code, inviter_character_id) VALUES (?, ?)`,
          [code, characterId]
        );
        const dto = await this.getInviteCodeById(String(result.insertId));
        logger.info(`Invite code created by character ${characterId}`);
        return dto!;
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_ENTRY') throw error;
        // duplicate code: retry
      }
    }
    throw new AppError('生成邀请码失败，请稍后重试', 500);
  }

  /** 查询单个邀请码（含邀请者昵称） */
  async getInviteCodeById(id: string): Promise<InviteCodeDTO | null> {
    const rows: any = await query(
      `SELECT ic.id, ic.code, ic.inviter_character_id, ic.status, ic.created_at, ic.used_at,
              c.nickname AS inviter_nickname
       FROM invite_codes ic
       JOIN characters c ON c.id = ic.inviter_character_id
       WHERE ic.id = ?`,
      [id]
    );
    return Array.isArray(rows) && rows.length ? mapInviteCode(rows[0]) : null;
  }

  /** 列出某角色生成的全部邀请码 */
  async listByInviter(characterId: string): Promise<InviteCodeDTO[]> {
    const rows: any = await query(
      `SELECT ic.id, ic.code, ic.inviter_character_id, ic.status, ic.created_at, ic.used_at,
              c.nickname AS inviter_nickname,
              uc.nickname AS used_by_nickname
       FROM invite_codes ic
       JOIN characters c ON c.id = ic.inviter_character_id
       LEFT JOIN characters uc ON uc.id = ic.used_by_character_id
       WHERE ic.inviter_character_id = ?
       ORDER BY ic.created_at DESC`,
      [characterId]
    );
    return (Array.isArray(rows) ? rows : []).map(mapInviteCode);
  }

  /** 撤销邀请码（仅邀请者本人） */
  async revokeInviteCode(characterId: string, codeId: number): Promise<void> {
    const result: any = await query(
      `UPDATE invite_codes SET status = 'revoked'
       WHERE id = ? AND inviter_character_id = ? AND status = 'active'`,
      [codeId, characterId]
    );
    if (!result.affectedRows) {
      throw new AppError('邀请码不存在或不可撤销', 404);
    }
  }

  /**
   * 校验邀请码并返回邀请者出生信息（当前地块 + 出生点世界坐标）。
   * 不修改邀请码状态——由 CharacterService 在创角事务内消费（markUsed）。
   */
  async validateForSpawn(code: string): Promise<{
    codeId: number;
    inviterCharacterId: number;
    inviterNickname: string;
    chunkId: string;
    chunkX: number;
    chunkY: number;
    gridX: number;
    gridY: number;
    worldX: number;
    worldY: number;
  }> {
    const rows: any = await query(
      `SELECT ic.id AS code_id, ic.inviter_character_id, c.nickname AS inviter_nickname,
              c.current_chunk_id, c.grid_x, c.grid_y
       FROM invite_codes ic
       JOIN characters c ON c.id = ic.inviter_character_id
       WHERE ic.code = ? AND ic.status = 'active'
       LIMIT 1`,
      [code]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('邀请码无效或已被使用', 404);
    }

    const row = rows[0];
    const chunkId = String(row.current_chunk_id);
    const parts = chunkId.split('_').map(Number);
    const chunkX = parts[0] ?? 0;
    const chunkY = parts[1] ?? 0;

    // 出生点固定在邀请者所在区块内的 (5,5) 附近，与邀请者本人保持一点距离
    const gridX = 5;
    const gridY = 5;
    const CHUNK_SIZE = 32;
    const worldX = chunkX * CHUNK_SIZE + gridX;
    const worldY = chunkY * CHUNK_SIZE + gridY;

    return {
      codeId: Number(row.code_id),
      inviterCharacterId: Number(row.inviter_character_id),
      inviterNickname: String(row.inviter_nickname),
      chunkId,
      chunkX,
      chunkY,
      gridX,
      gridY,
      worldX,
      worldY,
    };
  }

  /**
   * 在创角事务内消费邀请码（status → used，记录使用者）。
   * 只在连接事务内调用；若邀请码已被并发消费（affectedRows=0）抛错回滚。
   */
  async markUsedOnConnection(
    connection: any,
    codeId: number,
    usedByCharacterId: number
  ): Promise<void> {
    const [result]: any = await connection.execute(
      `UPDATE invite_codes
       SET status = 'used', used_by_character_id = ?, used_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'active'`,
      [usedByCharacterId, codeId]
    );
    if (!result.affectedRows) {
      throw new AppError('邀请码已被使用', 409);
    }
  }
}

export default new InviteCodeService();