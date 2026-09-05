import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export interface TeamInfo {
  teamId: number;
  name: string;
  leaderCharacterId: string;
  leaderNickname: string;
  createdAt: string;
}

export interface TeamMemberItem {
  characterId: string;
  nickname: string;
  role: 'leader' | 'member';
  isOnline: boolean;
  joinedAt: string;
}

export interface TeamInvitationItem {
  id: number;
  teamId: number;
  teamName: string;
  fromNickname: string;
  createdAt: string;
}

export interface TeamApplicationItem {
  id: number;
  teamId: number;
  characterId: string;
  nickname: string;
  message: string | null;
  createdAt: string;
}

const MAX_TEAM_MEMBERS = 20;
const TEAM_NAME_MAX = 30;

/**
 * Team chunk limit (GDD 2.9 团队地块上限):
 * 1 人 10 块，2 人 15，3 人 20，4 人 25，5 人 30，
 * 6 人及以上每增加 1 人 +4 块（6 人 34，10 人 50）。
 */
export function calculateChunkLimit(memberCount: number): number {
  if (memberCount <= 0) return 0;
  if (memberCount <= 5) return 10 + (memberCount - 1) * 5;
  return 30 + (memberCount - 5) * 4;
}

export class TeamService {
  /**
   * Create a team. Creator becomes the leader.
   */
  async createTeam(
    leaderCharacterId: string,
    name: string
  ): Promise<TeamInfo> {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      throw new AppError('Team name is required', 400);
    }
    if (trimmed.length > TEAM_NAME_MAX) {
      throw new AppError(`Team name must be at most ${TEAM_NAME_MAX} characters`, 400);
    }

    // Must not already be in a team
    const existing = await this.getMembership(leaderCharacterId);
    if (existing) {
      throw new AppError('You are already in a team', 400);
    }

    // Name uniqueness
    const dup: any = await query('SELECT id FROM teams WHERE name = ?', [trimmed]);
    if (dup.length > 0) {
      throw new AppError('Team name already exists', 400);
    }

    const nicknameRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [leaderCharacterId]
    );
    if (!nicknameRows.length) {
      throw new AppError('Character not found', 404);
    }

    const result: any = await query(
      'INSERT INTO teams (name, leader_id) VALUES (?, ?)',
      [trimmed, leaderCharacterId]
    );
    const teamId = result.insertId;

    await query(
      `INSERT INTO team_members (team_id, character_id, role) VALUES (?, ?, 'leader')`,
      [teamId, leaderCharacterId]
    );

    logger.info(`Team ${teamId} "${trimmed}" created by character ${leaderCharacterId}`);
    return {
      teamId,
      name: trimmed,
      leaderCharacterId,
      leaderNickname: nicknameRows[0].nickname,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get a character's membership row (team_id + role), or null.
   */
  async getMembership(
    characterId: string
  ): Promise<{ teamId: number; role: 'leader' | 'member' } | null> {
    const rows: any = await query(
      'SELECT team_id, role FROM team_members WHERE character_id = ?',
      [characterId]
    );
    if (!rows.length) return null;
    return { teamId: rows[0].team_id, role: rows[0].role };
  }

  /**
   * Leader invites a player to the team (GDD 2.9 队长邀请).
   */
  async inviteMember(
    fromCharacterId: string,
    toCharacterId: string
  ): Promise<{ invitationId: number; teamId: number; teamName: string; toNickname: string }> {
    if (fromCharacterId === toCharacterId) {
      throw new AppError('Cannot invite yourself', 400);
    }

    const membership = await this.getMembership(fromCharacterId);
    if (!membership) {
      throw new AppError('You are not in a team', 400);
    }
    if (membership.role !== 'leader') {
      throw new AppError('Only the team leader can invite members', 403);
    }
    const teamId = membership.teamId;

    const targetRows: any = await query(
      'SELECT id, nickname FROM characters WHERE id = ?',
      [toCharacterId]
    );
    if (!targetRows.length) {
      throw new AppError('Target character not found', 404);
    }
    const toNickname = targetRows[0].nickname;

    // Target must not already be in a team
    const targetMembership = await this.getMembership(toCharacterId);
    if (targetMembership) {
      throw new AppError('Target is already in a team', 400);
    }

    // Team size check
    const memberCount = await this.getMemberCount(teamId);
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new AppError('Team is full', 400);
    }

    // No duplicate pending invitation to this character for this team
    const dup: any = await query(
      `SELECT id FROM team_invitations
       WHERE team_id = ? AND to_character_id = ? AND status = 'pending'`,
      [teamId, toCharacterId]
    );
    if (dup.length > 0) {
      throw new AppError('A pending invitation already exists', 400);
    }

    const result: any = await query(
      `INSERT INTO team_invitations (team_id, from_character_id, to_character_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [teamId, fromCharacterId, toCharacterId]
    );

    const teamName = await this.getTeamName(teamId);
    logger.info(`Team ${teamId} invited character ${toCharacterId}`);
    return { invitationId: result.insertId, teamId, teamName, toNickname };
  }

  /**
   * Player applies to join a team (GDD 2.9 玩家申请).
   */
  async applyToTeam(
    characterId: string,
    teamId: number,
    message?: string
  ): Promise<{ applicationId: number; teamName: string }> {
    const membership = await this.getMembership(characterId);
    if (membership) {
      throw new AppError('You are already in a team', 400);
    }

    const teamRows: any = await query(
      'SELECT id, name FROM teams WHERE id = ?',
      [teamId]
    );
    if (!teamRows.length) {
      throw new AppError('Team not found', 404);
    }
    const teamName = teamRows[0].name;

    const memberCount = await this.getMemberCount(teamId);
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new AppError('Team is full', 400);
    }

    const dup: any = await query(
      `SELECT id FROM team_applications
       WHERE team_id = ? AND character_id = ? AND status = 'pending'`,
      [teamId, characterId]
    );
    if (dup.length > 0) {
      throw new AppError('A pending application already exists', 400);
    }

    const trimmed = message?.trim().slice(0, 100) || null;
    const result: any = await query(
      `INSERT INTO team_applications (team_id, character_id, message, status)
       VALUES (?, ?, ?, 'pending')`,
      [teamId, characterId, trimmed]
    );

    logger.info(`Character ${characterId} applied to team ${teamId}`);
    return { applicationId: result.insertId, teamName };
  }

  /**
   * Invitee accepts an invitation → joins the team.
   */
  async acceptInvitation(
    invitationId: number,
    characterId: string
  ): Promise<{ teamId: number; teamName: string; nickname: string }> {
    const invRows: any = await query(
      `SELECT id, team_id, to_character_id, status FROM team_invitations WHERE id = ?`,
      [invitationId]
    );
    if (!invRows.length) {
      throw new AppError('Invitation not found', 404);
    }
    const inv = invRows[0];
    if (String(inv.to_character_id) !== characterId) {
      throw new AppError('Not authorized to accept this invitation', 403);
    }
    if (inv.status !== 'pending') {
      throw new AppError(`Invitation already ${inv.status}`, 400);
    }

    const membership = await this.getMembership(characterId);
    if (membership) {
      throw new AppError('You are already in a team', 400);
    }

    const memberCount = await this.getMemberCount(inv.team_id);
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new AppError('Team is full', 400);
    }

    await query(
      `UPDATE team_invitations SET status = 'accepted' WHERE id = ?`,
      [invitationId]
    );

    await query(
      `INSERT INTO team_members (team_id, character_id, role) VALUES (?, ?, 'member')`,
      [inv.team_id, characterId]
    );

    // Cancel any other pending invitations/applications of this character
    await query(
      `UPDATE team_invitations SET status = 'rejected' WHERE to_character_id = ? AND status = 'pending'`,
      [characterId]
    );
    await query(
      `UPDATE team_applications SET status = 'rejected' WHERE character_id = ? AND status = 'pending'`,
      [characterId]
    );

    const teamName = await this.getTeamName(inv.team_id);
    const nickRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [characterId]
    );
    const nickname = nickRows[0]?.nickname ?? '';

    logger.info(`Character ${characterId} joined team ${inv.team_id}`);
    return { teamId: inv.team_id, teamName, nickname };
  }

  /**
   * Invitee rejects an invitation.
   */
  async rejectInvitation(
    invitationId: number,
    characterId: string
  ): Promise<void> {
    const invRows: any = await query(
      'SELECT id, to_character_id, status FROM team_invitations WHERE id = ?',
      [invitationId]
    );
    if (!invRows.length) {
      throw new AppError('Invitation not found', 404);
    }
    if (String(invRows[0].to_character_id) !== characterId) {
      throw new AppError('Not authorized to reject this invitation', 403);
    }
    if (invRows[0].status !== 'pending') {
      throw new AppError(`Invitation already ${invRows[0].status}`, 400);
    }
    await query(
      `UPDATE team_invitations SET status = 'rejected' WHERE id = ?`,
      [invitationId]
    );
  }

  /**
   * Leader accepts an application → applicant joins the team.
   */
  async acceptApplication(
    applicationId: number,
    leaderCharacterId: string
  ): Promise<{ teamId: number; teamName: string; characterId: string; nickname: string }> {
    const appRows: any = await query(
      'SELECT id, team_id, character_id, status FROM team_applications WHERE id = ?',
      [applicationId]
    );
    if (!appRows.length) {
      throw new AppError('Application not found', 404);
    }
    const app = appRows[0];
    if (app.status !== 'pending') {
      throw new AppError(`Application already ${app.status}`, 400);
    }

    // Acceptor must be the leader of the application's team
    const membership = await this.getMembership(leaderCharacterId);
    if (!membership || membership.teamId !== app.team_id || membership.role !== 'leader') {
      throw new AppError('Only the team leader can accept applications', 403);
    }

    const applicantMembership = await this.getMembership(String(app.character_id));
    if (applicantMembership) {
      throw new AppError('Applicant is already in a team', 400);
    }

    const memberCount = await this.getMemberCount(app.team_id);
    if (memberCount >= MAX_TEAM_MEMBERS) {
      throw new AppError('Team is full', 400);
    }

    await query(
      `UPDATE team_applications SET status = 'accepted' WHERE id = ?`,
      [applicationId]
    );
    await query(
      `INSERT INTO team_members (team_id, character_id, role) VALUES (?, ?, 'member')`,
      [app.team_id, app.character_id]
    );

    // Cancel other pending invitations/applications of this character
    await query(
      `UPDATE team_invitations SET status = 'rejected' WHERE to_character_id = ? AND status = 'pending'`,
      [app.character_id]
    );
    await query(
      `UPDATE team_applications SET status = 'rejected' WHERE character_id = ? AND status = 'pending' AND id != ?`,
      [app.character_id, applicationId]
    );

    const teamName = await this.getTeamName(app.team_id);
    const nickRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [app.character_id]
    );

    logger.info(`Application ${applicationId} accepted; character ${app.character_id} joined team ${app.team_id}`);
    return {
      teamId: app.team_id,
      teamName,
      characterId: String(app.character_id),
      nickname: nickRows[0]?.nickname ?? '',
    };
  }

  /**
   * Leader rejects an application.
   */
  async rejectApplication(
    applicationId: number,
    leaderCharacterId: string
  ): Promise<void> {
    const appRows: any = await query(
      'SELECT id, team_id, status FROM team_applications WHERE id = ?',
      [applicationId]
    );
    if (!appRows.length) {
      throw new AppError('Application not found', 404);
    }

    const membership = await this.getMembership(leaderCharacterId);
    if (!membership || membership.teamId !== appRows[0].team_id || membership.role !== 'leader') {
      throw new AppError('Only the team leader can reject applications', 403);
    }
    if (appRows[0].status !== 'pending') {
      throw new AppError(`Application already ${appRows[0].status}`, 400);
    }
    await query(
      `UPDATE team_applications SET status = 'rejected' WHERE id = ?`,
      [applicationId]
    );
  }

  /**
   * Member leaves the team (GDD 2.9 退出团队).
   * The leader cannot leave directly — must transfer leadership or disband.
   */
  async leaveTeam(
    characterId: string
  ): Promise<{ teamId: number; teamName: string; nickname: string }> {
    const membership = await this.getMembership(characterId);
    if (!membership) {
      throw new AppError('You are not in a team', 400);
    }
    if (membership.role === 'leader') {
      throw new AppError(
        'Team leader cannot leave directly; transfer leadership or disband the team',
        400
      );
    }
    const teamId = membership.teamId;

    await query('DELETE FROM team_members WHERE team_id = ? AND character_id = ?', [
      teamId,
      characterId,
    ]);
    // Their team-owned chunks revert to personal (owner_id already points at them)
    await query('UPDATE map_chunks SET team_id = NULL WHERE owner_id = ? AND team_id = ?', [
      characterId,
      teamId,
    ]);

    const teamName = await this.getTeamName(teamId);
    const nickRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [characterId]
    );
    logger.info(`Character ${characterId} left team ${teamId}`);
    return { teamId, teamName, nickname: nickRows[0]?.nickname ?? '' };
  }

  /**
   * Leader kicks a member (GDD 2.9 踢出团队).
   */
  async kickMember(
    leaderCharacterId: string,
    targetCharacterId: string
  ): Promise<{ teamId: number; teamName: string; nickname: string }> {
    const membership = await this.getMembership(leaderCharacterId);
    if (!membership || membership.role !== 'leader') {
      throw new AppError('Only the team leader can kick members', 403);
    }
    const teamId = membership.teamId;
    if (leaderCharacterId === targetCharacterId) {
      throw new AppError('Cannot kick yourself', 400);
    }

    const targetMembership = await this.getMembership(targetCharacterId);
    if (!targetMembership || targetMembership.teamId !== teamId) {
      throw new AppError('Target is not in your team', 400);
    }

    await query('DELETE FROM team_members WHERE team_id = ? AND character_id = ?', [
      teamId,
      targetCharacterId,
    ]);
    await query('UPDATE map_chunks SET team_id = NULL WHERE owner_id = ? AND team_id = ?', [
      targetCharacterId,
      teamId,
    ]);

    const teamName = await this.getTeamName(teamId);
    const nickRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [targetCharacterId]
    );
    logger.info(`Character ${targetCharacterId} kicked from team ${teamId}`);
    return { teamId, teamName, nickname: nickRows[0]?.nickname ?? '' };
  }

  /**
   * Leader transfers leadership to another member (GDD 2.9 转让队长).
   */
  async transferLeadership(
    leaderCharacterId: string,
    newLeaderCharacterId: string
  ): Promise<{ teamId: number; teamName: string; newLeaderNickname: string }> {
    const membership = await this.getMembership(leaderCharacterId);
    if (!membership || membership.role !== 'leader') {
      throw new AppError('Only the team leader can transfer leadership', 403);
    }
    const teamId = membership.teamId;
    if (leaderCharacterId === newLeaderCharacterId) {
      throw new AppError('You are already the leader', 400);
    }

    const targetMembership = await this.getMembership(newLeaderCharacterId);
    if (!targetMembership || targetMembership.teamId !== teamId) {
      throw new AppError('Target is not in your team', 400);
    }

    await query('UPDATE teams SET leader_id = ? WHERE id = ?', [newLeaderCharacterId, teamId]);
    await query(
      `UPDATE team_members SET role = 'member' WHERE team_id = ? AND character_id = ?`,
      [teamId, leaderCharacterId]
    );
    await query(
      `UPDATE team_members SET role = 'leader' WHERE team_id = ? AND character_id = ?`,
      [teamId, newLeaderCharacterId]
    );

    const teamName = await this.getTeamName(teamId);
    const nickRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [newLeaderCharacterId]
    );
    logger.info(`Team ${teamId} leadership transferred to ${newLeaderCharacterId}`);
    return { teamId, teamName, newLeaderNickname: nickRows[0]?.nickname ?? '' };
  }

  /**
   * Leader disbands the team (GDD 2.9 解散团队).
   * Team chunks revert to personal ownership (owner_id = builder).
   */
  async disbandTeam(
    leaderCharacterId: string
  ): Promise<{ teamId: number; teamName: string; memberIds: string[] }> {
    const membership = await this.getMembership(leaderCharacterId);
    if (!membership || membership.role !== 'leader') {
      throw new AppError('Only the team leader can disband the team', 403);
    }
    const teamId = membership.teamId;
    const teamName = await this.getTeamName(teamId);

    const memberRows: any = await query(
      'SELECT character_id FROM team_members WHERE team_id = ?',
      [teamId]
    );
    const memberIds = memberRows.map((r: any) => String(r.character_id));

    // All team chunks revert to purely personal (owner_id preserved)
    await query('UPDATE map_chunks SET team_id = NULL WHERE team_id = ?', [teamId]);

    await query('DELETE FROM team_members WHERE team_id = ?', [teamId]);
    await query('DELETE FROM teams WHERE id = ?', [teamId]);

    logger.info(`Team ${teamId} "${teamName}" disbanded by ${leaderCharacterId}`);
    return { teamId, teamName, memberIds };
  }

  /**
   * Get the team's info.
   */
  async getTeamInfo(teamId: number): Promise<TeamInfo> {
    const rows: any = await query(
      `SELECT t.id, t.name, t.leader_id, t.created_at, c.nickname AS leader_nickname
       FROM teams t JOIN characters c ON c.id = t.leader_id
       WHERE t.id = ?`,
      [teamId]
    );
    if (!rows.length) {
      throw new AppError('Team not found', 404);
    }
    return {
      teamId: rows[0].id,
      name: rows[0].name,
      leaderCharacterId: String(rows[0].leader_id),
      leaderNickname: rows[0].leader_nickname,
      createdAt: rows[0].created_at,
    };
  }

  async getTeamName(teamId: number): Promise<string> {
    const rows: any = await query('SELECT name FROM teams WHERE id = ?', [teamId]);
    return rows[0]?.name ?? '';
  }

  async getMemberCount(teamId: number): Promise<number> {
    const rows: any = await query(
      'SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?',
      [teamId]
    );
    return rows[0].n;
  }

  /**
   * Get all members of a team with online status.
   * Online detection mirrors FriendService (Redis position cache existence).
   */
  async getTeamMembers(
    teamId: number,
    isCharacterOnline: (characterId: string) => Promise<boolean>
  ): Promise<TeamMemberItem[]> {
    const rows: any = await query(
      `SELECT tm.character_id, tm.role, tm.joined_at, c.nickname
       FROM team_members tm JOIN characters c ON c.id = tm.character_id
       WHERE tm.team_id = ? ORDER BY tm.role = 'leader' DESC, c.nickname`,
      [teamId]
    );
    const members: TeamMemberItem[] = [];
    for (const row of rows) {
      members.push({
        characterId: String(row.character_id),
        nickname: row.nickname,
        role: row.role,
        isOnline: await isCharacterOnline(String(row.character_id)),
        joinedAt: row.joined_at,
      });
    }
    return members;
  }

  /**
   * Pending invitations received by a character.
   */
  async getPendingInvitations(characterId: string): Promise<TeamInvitationItem[]> {
    const rows: any = await query(
      `SELECT i.id, i.team_id, i.created_at, t.name AS team_name,
              (SELECT nickname FROM characters WHERE id = i.from_character_id) AS from_nickname
       FROM team_invitations i JOIN teams t ON t.id = i.team_id
       WHERE i.to_character_id = ? AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [characterId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      teamId: r.team_id,
      teamName: r.team_name,
      fromNickname: r.from_nickname,
      createdAt: r.created_at,
    }));
  }

  /**
   * Pending applications for a team (leader view).
   */
  async getPendingApplications(teamId: number): Promise<TeamApplicationItem[]> {
    const rows: any = await query(
      `SELECT a.id, a.team_id, a.character_id, a.message, a.created_at, c.nickname
       FROM team_applications a JOIN characters c ON c.id = a.character_id
       WHERE a.team_id = ? AND a.status = 'pending'
       ORDER BY a.created_at DESC`,
      [teamId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      teamId: r.team_id,
      characterId: String(r.character_id),
      nickname: r.nickname,
      message: r.message,
      createdAt: r.created_at,
    }));
  }

  /**
   * Team chunk usage: chunks owned by the team OR by any of its members
   * (GDD 2.9: 个人地块 + 团队地块共享同一池).
   */
  async getTeamChunkUsage(teamId: number): Promise<number> {
    const rows: any = await query(
      `SELECT COUNT(*) AS n FROM map_chunks
       WHERE team_id = ?
          OR owner_id IN (SELECT character_id FROM team_members WHERE team_id = ?)`,
      [teamId, teamId]
    );
    return rows[0].n;
  }

  /**
   * Chunk limit applicable to a character: team limit if in a team, else personal (10).
   */
  async getChunkLimitForCharacter(
    characterId: string
  ): Promise<{ limit: number; teamId: number | null }> {
    const membership = await this.getMembership(characterId);
    if (!membership) {
      return { limit: 10, teamId: null };
    }
    const memberCount = await this.getMemberCount(membership.teamId);
    return { limit: calculateChunkLimit(memberCount), teamId: membership.teamId };
  }

  /**
   * Search teams by name prefix (for applying, GDD 2.9 团队名称支持搜索).
   */
  async searchTeams(
    keyword: string,
    limit = 20
  ): Promise<
    Array<{
      teamId: number;
      name: string;
      leaderNickname: string;
      memberCount: number;
      createdAt: string;
    }>
  > {
    const trimmed = (keyword ?? '').trim();
    if (!trimmed) return [];

    const rows: any = await query(
      `SELECT t.id, t.name, t.created_at,
              (SELECT nickname FROM characters WHERE id = t.leader_id) AS leader_nickname,
              (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
       FROM teams t
       WHERE t.name LIKE ?
       ORDER BY t.name
       LIMIT ${Number(limit) || 20}`,
      [`%${trimmed}%`]
    );
    return rows.map((r: any) => ({
      teamId: r.id,
      name: r.name,
      leaderNickname: r.leader_nickname,
      memberCount: r.member_count,
      createdAt: r.created_at,
    }));
  }

  /**
   * All online member characterIds of a team (excluding one, e.g. the sender).
   */
  async getTeamMemberIds(teamId: number): Promise<string[]> {
    const rows: any = await query(
      'SELECT character_id FROM team_members WHERE team_id = ?',
      [teamId]
    );
    return rows.map((r: any) => String(r.character_id));
  }
}

export default new TeamService();