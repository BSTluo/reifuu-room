import { Router, Request, Response, NextFunction } from 'express';
import CharacterService from '../services/CharacterService.js';
import SpawnPointService from '../services/SpawnPointService.js';
import { authenticate } from '../middleware/auth.js';
import VehicleService from '../services/VehicleService.js';

const router = Router();

// All character routes require authentication
router.use(authenticate);

// Get available spawn point options (GDD §2.1 preview for the create flow)
router.get('/spawn-options', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const options = await SpawnPointService.getSpawnOptions();
    res.json({ status: 'success', data: options });
  } catch (error) {
    next(error);
  }
});

// Create character
router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nickname, appearance, startContinent, spawnMethod } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
    }

    if (!nickname || !appearance || !startContinent) {
      return res.status(400).json({
        status: 'error',
        message: 'nickname, appearance, and startContinent are required',
      });
    }

    const character = await CharacterService.createCharacter(
      userId,
      nickname,
      appearance,
      startContinent,
      spawnMethod
    );

    res.status(201).json({ status: 'success', data: character });
  } catch (error) {
    next(error);
  }
});

// Get current user's character
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
    }

    const character = await CharacterService.getCharacterByUserId(userId);

    if (!character) {
      return res.status(404).json({
        status: 'error',
        message: 'Character not found',
      });
    }

    res.json({ status: 'success', data: { ...character, equippedVehicle: await VehicleService.getEquipped(String(character.id)) } });
  } catch (error) {
    next(error);
  }
});

export default router;
