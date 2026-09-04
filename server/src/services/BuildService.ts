import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import InventoryService from './InventoryService.js';

interface BuildTemplate {
  template: 'wooden_house' | 'stone_house' | 'advanced_house';
  name: string;
  requirements: { itemType: string; quantity: number }[];
}

const BUILD_TEMPLATES: Record<string, BuildTemplate> = {
  wooden_house: {
    template: 'wooden_house',
    name: 'Wooden House',
    requirements: [{ itemType: 'wood', quantity: 20 }],
  },
  stone_house: {
    template: 'stone_house',
    name: 'Stone House',
    requirements: [
      { itemType: 'stone', quantity: 15 },
      { itemType: 'wood', quantity: 5 },
    ],
  },
  advanced_house: {
    template: 'advanced_house',
    name: 'Advanced House',
    requirements: [
      { itemType: 'stone', quantity: 10 },
      { itemType: 'wood', quantity: 10 },
      { itemType: 'mineral', quantity: 5 },
    ],
  },
};

export class BuildService {
  private readonly MAX_CHUNKS_PER_PLAYER = 10;

  /**
   * Build a chat room on a chunk
   */
  async buildChatRoom(
    characterId: string,
    chunkId: string,
    template: string,
    roomName: string
  ): Promise<{ success: boolean; message?: string; chatRoomId?: number }> {
    try {
      // Validate template
      const buildTemplate = BUILD_TEMPLATES[template];
      if (!buildTemplate) {
        throw new AppError('Invalid build template', 400);
      }

      // Check chunk ownership limit
      const ownedChunks: any = await query(
        'SELECT COUNT(*) as count FROM map_chunks WHERE owner_id = ?',
        [characterId]
      );

      if (ownedChunks[0]?.count >= this.MAX_CHUNKS_PER_PLAYER) {
        throw new AppError(`Maximum ${this.MAX_CHUNKS_PER_PLAYER} chunks per player`, 400);
      }

      // Check if chunk already has a building
      const existingChunk: any = await query(
        'SELECT chunk_type FROM map_chunks WHERE chunk_id = ?',
        [chunkId]
      );

      if (existingChunk.length > 0 && existingChunk[0].chunk_type === 'chatroom') {
        throw new AppError('Chunk already has a building', 400);
      }

      // Check resources
      const hasResources = await InventoryService.hasItems(
        characterId,
        buildTemplate.requirements
      );

      if (!hasResources) {
        throw new AppError('Insufficient resources', 400);
      }

      // Consume resources
      for (const req of buildTemplate.requirements) {
        await InventoryService.removeItem(characterId, req.itemType, req.quantity);
      }

      // Create or update chunk
      const [chunkX, chunkY] = chunkId.split('_').map(Number);

      if (existingChunk.length === 0) {
        // Create new chunk entry
        await query(
          `INSERT INTO map_chunks (chunk_id, chunk_x, chunk_y, chunk_type, owner_id, is_public)
           VALUES (?, ?, ?, 'chatroom', ?, FALSE)`,
          [chunkId, chunkX, chunkY, characterId]
        );
      } else {
        // Update existing chunk
        await query(
          `UPDATE map_chunks SET chunk_type = 'chatroom', owner_id = ?, is_public = FALSE
           WHERE chunk_id = ?`,
          [characterId, chunkId]
        );
      }

      // Create chat room
      const result: any = await query(
        `INSERT INTO chat_rooms (chunk_id, owner_id, name, template)
         VALUES (?, ?, ?, ?)`,
        [chunkId, characterId, roomName, template]
      );

      const chatRoomId = result.insertId;

      logger.info(`Character ${characterId} built ${template} at chunk ${chunkId}`);

      return {
        success: true,
        chatRoomId,
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        return {
          success: false,
          message: error.message,
        };
      }
      logger.error('Build chat room error', error);
      return {
        success: false,
        message: 'Build failed',
      };
    }
  }

  /**
   * Get owned chunks
   */
  async getOwnedChunks(characterId: string): Promise<any[]> {
    try {
      const chunks: any = await query(
        `SELECT mc.chunk_id, mc.chunk_x, mc.chunk_y, mc.is_public,
         cr.name as room_name, cr.template
         FROM map_chunks mc
         LEFT JOIN chat_rooms cr ON mc.chunk_id = cr.chunk_id
         WHERE mc.owner_id = ? AND mc.chunk_type = 'chatroom'`,
        [characterId]
      );

      return chunks.map((chunk: any) => ({
        chunkId: chunk.chunk_id,
        position: { x: chunk.chunk_x, y: chunk.chunk_y },
        isPublic: chunk.is_public === 1,
        roomName: chunk.room_name,
        template: chunk.template,
      }));
    } catch (error) {
      logger.error('Failed to get owned chunks', error);
      return [];
    }
  }

  /**
   * Set chunk public/private
   */
  async setChunkPublic(
    characterId: string,
    chunkId: string,
    isPublic: boolean
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Verify ownership
      const chunks: any = await query(
        'SELECT owner_id FROM map_chunks WHERE chunk_id = ?',
        [chunkId]
      );

      if (chunks.length === 0) {
        throw new AppError('Chunk not found', 404);
      }

      if (chunks[0].owner_id.toString() !== characterId) {
        throw new AppError('Not the owner of this chunk', 403);
      }

      // Update
      await query(
        'UPDATE map_chunks SET is_public = ? WHERE chunk_id = ?',
        [isPublic, chunkId]
      );

      logger.info(`Chunk ${chunkId} set to ${isPublic ? 'public' : 'private'}`);

      return { success: true };
    } catch (error: any) {
      if (error instanceof AppError) {
        return { success: false, message: error.message };
      }
      logger.error('Set chunk public error', error);
      return { success: false, message: 'Update failed' };
    }
  }

  /**
   * Get build templates
   */
  getBuildTemplates(): BuildTemplate[] {
    return Object.values(BUILD_TEMPLATES);
  }

  /**
   * Get chat rooms located in a chunk (for rendering house markers)
   */
  async getRoomsInChunk(chunkId: string): Promise<
    Array<{ id: number; chunkId: string; name: string; template: string; ownerId: string }>
  > {
    try {
      const rooms: any = await query(
        `SELECT id, chunk_id, name, template, owner_id
         FROM chat_rooms WHERE chunk_id = ?`,
        [chunkId]
      );

      return rooms.map((room: any) => ({
        id: room.id,
        chunkId: room.chunk_id,
        name: room.name,
        template: room.template,
        ownerId: String(room.owner_id),
      }));
    } catch (error) {
      logger.error('Failed to get rooms in chunk', error);
      return [];
    }
  }
}

export default new BuildService();
