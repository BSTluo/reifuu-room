import { Router, Request, Response, NextFunction } from 'express';
import ExplorationService from '../services/ExplorationService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All map routes require authentication
router.use(authenticate);

// Get current player's explored chunk list (fog of war state)
router.get('/explored', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const chunks = await ExplorationService.getExploredChunks(String(character.id));
    res.json({ status: 'success', data: { chunks } });
  } catch (error) {
    next(error);
  }
});

export default router;