import { Router, Request, Response, NextFunction } from 'express';
import PigeonMailService from '../services/PigeonMailService.js';
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

function requireCharacterId(value: string): string {
  if (!/^\d+$/.test(value)) {
    throw new AppError('Invalid characterId', 400);
  }
  return value;
}

// Send a pigeon message
router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const { toCharacterId, content } = req.body ?? {};
    if (!toCharacterId || !content) {
      throw new AppError('toCharacterId and content are required', 400);
    }

    const result = await PigeonMailService.sendMessage(
      String(character.id),
      requireCharacterId(String(toCharacterId)),
      String(content)
    );
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Inbox: messages received by this character
router.get('/inbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const messages = await PigeonMailService.getInbox(String(character.id));
    const unreadCount = await PigeonMailService.getUnreadCount(String(character.id));
    res.json({ status: 'success', data: { messages, unreadCount } });
  } catch (error) {
    next(error);
  }
});

// Sent: messages sent by this character
router.get('/sent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const messages = await PigeonMailService.getSent(String(character.id));
    res.json({ status: 'success', data: { messages } });
  } catch (error) {
    next(error);
  }
});

// Mark a message as read (recipient only)
router.post('/:messageId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const messageId = Number(req.params.messageId);
    if (!Number.isFinite(messageId)) {
      throw new AppError('Invalid messageId', 400);
    }

    await PigeonMailService.markRead(messageId, String(character.id));
    const unreadCount = await PigeonMailService.getUnreadCount(String(character.id));
    res.json({ status: 'success', data: { unreadCount } });
  } catch (error) {
    next(error);
  }
});

export default router;