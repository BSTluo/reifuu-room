import { Router, Request, Response, NextFunction } from 'express';
import TownService from '../services/TownService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

async function requireCharacter(req: Request) {
  const userId = req.user?.userId;
  if (!userId) throw new AppError('User not authenticated', 401);
  const character = await CharacterService.getCharacterByUserId(userId);
  if (!character) throw new AppError('Character not found', 404);
  return character;
}

// ==================== 城镇系统 + 传送门（GDD §2.3） ====================

// GET /town/list —— 所有城镇（含当前角色是否已到访 = 传送门是否解锁）
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const towns = await TownService.listTowns(String(character.id));
    res.json({ status: 'success', data: { towns } });
  } catch (error) {
    next(error);
  }
});

// GET /town/visited —— 当前角色已到访（已解锁传送门）的城镇
router.get('/visited', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const towns = await TownService.getVisitedTowns(String(character.id));
    res.json({ status: 'success', data: { towns } });
  } catch (error) {
    next(error);
  }
});

// POST /town/:townId/teleport —— 传送到城镇（须已到访）
router.post('/:townId/teleport', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const townId = parseInt(String(req.params.townId), 10);
    if (!Number.isFinite(townId)) throw new AppError('Invalid townId', 400);

    const result = await TownService.teleportToTown(String(character.id), townId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

export default router;