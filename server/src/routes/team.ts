import { Router, Request, Response, NextFunction } from 'express';
import TeamService from '../services/TeamService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

async function requireCharacter(req: Request): Promise<{ id: string }> {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }
  const character = await CharacterService.getCharacterByUserId(userId);
  if (!character) {
    throw new AppError('Character not found', 404);
  }
  return character;
}

// Create a team
router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const { name } = req.body ?? {};
    if (typeof name !== 'string') {
      throw new AppError('Team name must be a string', 400);
    }
    const team = await TeamService.createTeam(String(character.id), name);
    res.status(201).json({ status: 'success', data: team });
  } catch (error) {
    next(error);
  }
});

// Search teams by name
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireCharacter(req);
    const keyword = String(req.query.keyword ?? '');
    const teams = await TeamService.searchTeams(keyword);
    res.json({ status: 'success', data: { teams } });
  } catch (error) {
    next(error);
  }
});

// Get the character's team overview (info + members + applications + chunk usage)
router.get('/info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const characterId = String(character.id);
    const membership = await TeamService.getMembership(characterId);
    if (!membership) {
      res.json({ status: 'success', data: { team: null, invitations: await TeamService.getPendingInvitations(characterId) } });
      return;
    }

    const isOnline = async (cid: string) => {
      const { default: redisClient, prefixKey } = await import('../db/redis.js');
      return (await redisClient.exists(prefixKey(`player:${cid}:position`))) === 1;
    };

    const [team, members, applications, invitations, usedChunks, memberCount] = await Promise.all([
      TeamService.getTeamInfo(membership.teamId),
      TeamService.getTeamMembers(membership.teamId, isOnline),
      membership.role === 'leader'
        ? TeamService.getPendingApplications(membership.teamId)
        : Promise.resolve([]),
      TeamService.getPendingInvitations(characterId),
      TeamService.getTeamChunkUsage(membership.teamId),
      TeamService.getMemberCount(membership.teamId),
    ]);

    const { calculateChunkLimit } = await import('../services/TeamService.js');
    res.json({
      status: 'success',
      data: {
        team,
        role: membership.role,
        members,
        applications,
        invitations,
        chunkUsage: { used: usedChunks, limit: calculateChunkLimit(memberCount) },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Invite a player to my team
router.post('/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.body?.characterId ?? '');
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }
    const result = await TeamService.inviteMember(String(character.id), targetId);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Apply to join a team
router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const teamId = Number(req.body?.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new AppError('Invalid teamId', 400);
    }
    const message = typeof req.body?.message === 'string' ? req.body.message : undefined;
    const result = await TeamService.applyToTeam(String(character.id), teamId, message);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Accept an invitation
router.post('/invitation/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError('Invalid invitation id', 400);
    }
    const result = await TeamService.acceptInvitation(id, String(character.id));
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Reject an invitation
router.post('/invitation/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError('Invalid invitation id', 400);
    }
    await TeamService.rejectInvitation(id, String(character.id));
    res.json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

// Accept an application (leader)
router.post('/application/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError('Invalid application id', 400);
    }
    const result = await TeamService.acceptApplication(id, String(character.id));
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Reject an application (leader)
router.post('/application/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError('Invalid application id', 400);
    }
    await TeamService.rejectApplication(id, String(character.id));
    res.json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

// Kick a member (leader)
router.post('/kick', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.body?.characterId ?? '');
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }
    const result = await TeamService.kickMember(String(character.id), targetId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Leave the team
router.post('/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const result = await TeamService.leaveTeam(String(character.id));
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Transfer leadership (leader)
router.post('/transfer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.body?.characterId ?? '');
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }
    const result = await TeamService.transferLeadership(String(character.id), targetId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Disband the team (leader)
router.post('/disband', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const result = await TeamService.disbandTeam(String(character.id));
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

export default router;