import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import CharacterService from '../services/CharacterService.js';
import TownService from '../services/TownService.js';
const router = Router();
router.use(authenticate);
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const c = await CharacterService.getCharacterByUserId(req.user?.userId ?? '');
    if (!c) throw new AppError('Character not found', 404);
    res.json({ status: 'success', data: { towns: await TownService.listForCharacter(String(c.id)) } });
  } catch (e) { next(e); }
});
export default router;
