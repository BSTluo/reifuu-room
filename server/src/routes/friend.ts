import { Router, Request, Response, NextFunction } from 'express';
import FriendService from '../services/FriendService.js';
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

// ==================== 好友列表 ====================

// GET /friend/list
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const friends = await FriendService.getFriends(Number(character.id));
    res.json({ status: 'success', data: { friends } });
  } catch (error) {
    next(error);
  }
});

// DELETE /friend/:characterId
router.delete('/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const friendCharacterId = parseInt(String(req.params.characterId), 10);
    if (!Number.isFinite(friendCharacterId)) throw new AppError('Invalid characterId', 400);

    await FriendService.removeFriend(Number(character.id), friendCharacterId);
    res.json({ status: 'success', message: 'Friend removed' });
  } catch (error) {
    next(error);
  }
});

// ==================== 好友传送（GDD §2.7） ====================

// POST /friend/teleport/:characterId
router.post('/teleport/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const friendCharacterId = parseInt(String(req.params.characterId), 10);
    if (!Number.isFinite(friendCharacterId)) throw new AppError('Invalid characterId', 400);

    const result = await FriendService.teleportToFriend(
      Number(character.id),
      friendCharacterId
    );

    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// ==================== 好友请求 ====================

// POST /friend/request  body: { toCharacterId, message? }
router.post('/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const { toCharacterId, message } = req.body ?? {};
    if (!Number.isFinite(Number(toCharacterId))) {
      throw new AppError('toCharacterId is required', 400);
    }

    const result = await FriendService.sendFriendRequest(
      Number(character.id),
      Number(toCharacterId),
      message ? String(message).slice(0, 200) : undefined
    );

    res.status(201).json({ status: 'success', data: { request: result } });
  } catch (error) {
    next(error);
  }
});

// POST /friend/request/:requestId/respond  body: { accept: boolean }
router.post('/request/:requestId/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const requestId = parseInt(String(req.params.requestId), 10);
    if (!Number.isFinite(requestId)) throw new AppError('Invalid requestId', 400);

    const accept = req.body?.accept === true;
    const result = await FriendService.respondToRequest(requestId, Number(character.id), accept);

    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// GET /friend/requests/pending
router.get('/requests/pending', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const requests = await FriendService.getPendingRequests(Number(character.id));
    res.json({ status: 'success', data: { requests } });
  } catch (error) {
    next(error);
  }
});

// ==================== 信箱 ====================

// GET /friend/mailbox  query: ?type=friend_request|system|chat
router.get('/mailbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const type = req.query.type as 'friend_request' | 'system' | 'chat' | undefined;
    const messages = await FriendService.getMailbox(Number(character.id), type);
    res.json({ status: 'success', data: { messages } });
  } catch (error) {
    next(error);
  }
});

// POST /friend/mailbox/:messageId/read
router.post('/mailbox/:messageId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const messageId = parseInt(String(req.params.messageId), 10);
    if (!Number.isFinite(messageId)) throw new AppError('Invalid messageId', 400);

    await FriendService.markMessageRead(Number(character.id), messageId);
    res.json({ status: 'success', message: 'Message marked as read' });
  } catch (error) {
    next(error);
  }
});

// GET /friend/mailbox/unread-count
router.get('/mailbox/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const count = await FriendService.getUnreadCount(Number(character.id));
    res.json({ status: 'success', data: { count } });
  } catch (error) {
    next(error);
  }
});

export default router;