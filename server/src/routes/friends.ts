import { Router, Request, Response, NextFunction } from 'express';
import FriendService from '../services/FriendService.js';
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

// Send a friend request to a character
router.post('/request/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.params.characterId);
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }

    const result = await FriendService.sendRequest(String(character.id), targetId);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Accept a friend request
router.post('/accept/:requestId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId)) {
      throw new AppError('Invalid requestId', 400);
    }

    const result = await FriendService.acceptRequest(requestId, String(character.id));
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Reject a friend request
router.post('/reject/:requestId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId)) {
      throw new AppError('Invalid requestId', 400);
    }

    await FriendService.rejectRequest(requestId, String(character.id));
    res.json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

// Get friend list (with online status)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const friends = await FriendService.getFriendList(String(character.id));
    res.json({ status: 'success', data: { friends } });
  } catch (error) {
    next(error);
  }
});

// Get pending friend requests (received)
router.get('/requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const requests = await FriendService.getPendingRequests(String(character.id));
    res.json({ status: 'success', data: { requests } });
  } catch (error) {
    next(error);
  }
});

// Remove a friend
router.delete('/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.params.characterId);
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }

    await FriendService.removeFriend(String(character.id), targetId);
    res.json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

// Teleport to a friend's location
router.post('/teleport/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const targetId = String(req.params.characterId);
    if (!/^\d+$/.test(targetId)) {
      throw new AppError('Invalid characterId', 400);
    }

    const result = await FriendService.teleportToFriend(String(character.id), targetId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

export default router;