import { Router, Request, Response, NextFunction } from 'express';
import ResourceService from '../services/ResourceService.js';
import CharacterService from '../services/CharacterService.js';
import InventoryService from '../services/InventoryService.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All resource routes require authentication
router.use(authenticate);

// List resource nodes in a chunk
router.get('/chunk/:chunkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const chunkId = String(req.params.chunkId || '');
    if (!/^-?\d+_-?\d+$/.test(chunkId)) {
      throw new AppError('Invalid chunkId', 400);
    }

    await ResourceService.generateResourcesForChunk(chunkId);
    const nodes = await ResourceService.getResourcesInChunk(chunkId);

    res.json({ status: 'success', data: { chunkId, nodes } });
  } catch (error) {
    next(error);
  }
});

// Collect a resource node
router.post('/collect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const { nodeId, position } = req.body ?? {};
    const nodeIdNum = Number(nodeId);
    if (!Number.isFinite(nodeIdNum)) {
      throw new AppError('nodeId is required', 400);
    }
    if (
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number'
    ) {
      throw new AppError('position {x, y} is required', 400);
    }

    const result = await ResourceService.collectResource(
      nodeIdNum,
      String(character.id),
      { x: position.x, y: position.y }
    );

    if (!result.success) {
      throw new AppError(result.message ?? 'Collection failed', 400);
    }

    const inventory = await InventoryService.getInventory(String(character.id));

    res.json({
      status: 'success',
      data: {
        resourceType: result.resourceType,
        inventory,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get current character's inventory
router.get('/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const character = await CharacterService.getCharacterByUserId(userId);
    if (!character) {
      throw new AppError('Character not found', 404);
    }

    const inventory = await InventoryService.getInventory(String(character.id));

    res.json({ status: 'success', data: { items: inventory } });
  } catch (error) {
    next(error);
  }
});

export default router;