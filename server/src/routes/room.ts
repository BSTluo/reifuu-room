import { Router, Request, Response, NextFunction } from 'express';
import RoomService from '../services/RoomService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All room routes require authentication
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

function parseRoomId(raw: string | string[] | undefined): string {
  const roomId = String((Array.isArray(raw) ? raw[0] : raw) || '');
  if (!/^\d+$/.test(roomId)) {
    throw new AppError('Invalid roomId', 400);
  }
  return roomId;
}

// Get furniture catalog (available furniture types)
router.get('/furniture-catalog', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const catalog = RoomService.getFurnitureCatalog();
    res.json({ status: 'success', data: { catalog } });
  } catch (error) {
    next(error);
  }
});

// Get room furniture layout
router.get('/:roomId/furniture', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);
    const furniture = await RoomService.getFurniture(roomId);
    res.json({ status: 'success', data: { furniture } });
  } catch (error) {
    next(error);
  }
});

// Place a piece of furniture in the room
router.post('/:roomId/furniture', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);
    const { type, x, y, rotation } = req.body ?? {};

    if (!type) {
      throw new AppError('type is required', 400);
    }
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new AppError('x and y coordinates are required', 400);
    }

    const item = await RoomService.placeFurniture(
      roomId,
      String(character.id),
      String(type),
      x,
      y,
      rotation,
    );

    res.status(201).json({ status: 'success', data: { furniture: item } });
  } catch (error) {
    next(error);
  }
});

// Move a piece of furniture
router.put('/:roomId/furniture/:furnId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);
    const furnId = String(req.params.furnId || '');
    if (!furnId) {
      throw new AppError('furnId is required', 400);
    }

    const { x, y, rotation } = req.body ?? {};
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new AppError('x and y coordinates are required', 400);
    }

    const item = await RoomService.moveFurniture(
      roomId,
      String(character.id),
      furnId,
      x,
      y,
      rotation,
    );

    res.json({ status: 'success', data: { furniture: item } });
  } catch (error) {
    next(error);
  }
});

// Remove a piece of furniture
router.delete('/:roomId/furniture/:furnId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);
    const furnId = String(req.params.furnId || '');
    if (!furnId) {
      throw new AppError('furnId is required', 400);
    }

    await RoomService.removeFurniture(roomId, String(character.id), furnId);

    res.json({ status: 'success', data: { removed: true } });
  } catch (error) {
    next(error);
  }
});

export default router;