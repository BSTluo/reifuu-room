import { Router, Request, Response, NextFunction } from 'express';
import ChatMessageService from '../services/ChatMessageService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { query } from '../db/mysql.js';

const router = Router();

// All chat routes require authentication
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

// Send a message to a chat room (persisted + broadcast via socket)
router.post('/:roomId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);
    const { content } = req.body ?? {};
    if (!content || !String(content).trim()) {
      throw new AppError('content is required', 400);
    }

    const message = await ChatMessageService.sendMessage(
      roomId,
      String(character.id),
      String(content)
    );

    res.status(201).json({ status: 'success', data: { message } });
  } catch (error) {
    next(error);
  }
});

// Get the most recent messages in a chat room
router.get('/:roomId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const character = await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);

    const limitParam = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), 100)
      : 100;

    const messages = await ChatMessageService.getHistory(roomId, limit);

    res.json({ status: 'success', data: { roomId, messages } });
  } catch (error) {
    next(error);
  }
});

// Get chat room details (name, owner, template) for entering a room
router.get('/room/:roomId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await requireCharacter(req);
    const roomId = parseRoomId(req.params.roomId);

    const rooms: any = await query(
      `SELECT cr.id, cr.chunk_id, cr.name, cr.template, cr.owner_id, c.nickname as owner_nickname
       FROM chat_rooms cr
       JOIN characters c ON c.id = cr.owner_id
       WHERE cr.id = ?`,
      [roomId]
    );

    if (rooms.length === 0) {
      throw new AppError('Chat room not found', 404);
    }

    const room = rooms[0];
    res.json({
      status: 'success',
      data: {
        room: {
          id: String(room.id),
          chunkId: room.chunk_id,
          name: room.name,
          template: room.template,
          ownerId: String(room.owner_id),
          ownerNickname: room.owner_nickname,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;