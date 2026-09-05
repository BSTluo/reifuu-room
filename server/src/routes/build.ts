import { Router, Request, Response, NextFunction } from 'express';
import BuildService from '../services/BuildService.js';
import CharacterService from '../services/CharacterService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All build routes require authentication
router.use(authenticate);

// List build templates
router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = BuildService.getBuildTemplates();
    res.json({ status: 'success', data: { templates } });
  } catch (error) {
    next(error);
  }
});

// Build a chat room on the current chunk
router.post('/chatroom', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const { chunkId, template, roomName } = req.body ?? {};
    if (!chunkId || !/^-?\d+_-?\d+$/.test(String(chunkId))) {
      throw new AppError('chunkId is required', 400);
    }
    if (!template) {
      throw new AppError('template is required', 400);
    }
    if (!roomName || String(roomName).trim().length === 0) {
      throw new AppError('roomName is required', 400);
    }

    const result = await BuildService.buildChatRoom(
      String(character.id),
      String(chunkId),
      String(template),
      String(roomName).trim()
    );

    if (!result.success) {
      throw new AppError(result.message ?? 'Build failed', 400);
    }

    res.status(201).json({
      status: 'success',
      data: { chatRoomId: result.chatRoomId },
    });
  } catch (error) {
    next(error);
  }
});

// List chunks owned by the current character
router.get('/my-chunks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const chunks = await BuildService.getOwnedChunks(String(character.id));

    res.json({ status: 'success', data: { chunks } });
  } catch (error) {
    next(error);
  }
});

// Set a chunk public/private (ownership required)
router.post('/visibility', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const { chunkId, isPublic } = req.body ?? {};
    if (!chunkId || !/^-?\d+_-?\d+$/.test(String(chunkId))) {
      throw new AppError('chunkId is required', 400);
    }
    if (typeof isPublic !== 'boolean') {
      throw new AppError('isPublic is required', 400);
    }

    const result = await BuildService.setChunkPublic(
      String(character.id),
      String(chunkId),
      isPublic
    );

    if (!result.success) {
      throw new AppError(result.message ?? 'Update failed', 400);
    }

    res.json({ status: 'success', data: { chunkId, isPublic } });
  } catch (error) {
    next(error);
  }
});

// Abandon a chunk: demolish chat room, refund 60% resources, revert to unowned empty land (GDD §2.2)
router.post('/abandon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const { chunkId } = req.body ?? {};
    if (!chunkId || !/^-?\d+_-?\d+$/.test(String(chunkId))) {
      throw new AppError('chunkId is required', 400);
    }

    const result = await BuildService.abandonChunk(
      String(character.id),
      String(chunkId)
    );

    if (!result.success) {
      throw new AppError(result.message ?? 'Abandon failed', 400);
    }

    res.json({
      status: 'success',
      data: { chunkId, refunded: result.refunded ?? [] },
    });
  } catch (error) {
    next(error);
  }
});

export default router;