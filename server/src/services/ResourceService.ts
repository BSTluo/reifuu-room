import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

interface ResourceNode {
  id: number;
  chunkId: string;
  resourceType: 'wood' | 'stone' | 'mineral';
  position: { x: number; y: number };
  isDepleted: boolean;
  respawnAt: Date | null;
}

export class ResourceService {
  // Respawn times in minutes
  private readonly RESPAWN_TIMES = {
    wood: 5,
    stone: 10,
    mineral: 30,
  };

  // Collect distance threshold
  private readonly COLLECT_DISTANCE = 2;

  /**
   * Generate initial resource nodes for a chunk
   */
  async generateResourcesForChunk(chunkId: string): Promise<void> {
    try {
      // Check if chunk already has resources
      const existing: any = await query(
        'SELECT COUNT(*) as count FROM resource_nodes WHERE chunk_id = ?',
        [chunkId]
      );

      if (existing[0]?.count > 0) {
        return; // Already generated
      }

      // Generate 3-5 wood nodes
      const woodCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < woodCount; i++) {
        await this.createResourceNode(chunkId, 'wood');
      }

      // Generate 2-4 stone nodes
      const stoneCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < stoneCount; i++) {
        await this.createResourceNode(chunkId, 'stone');
      }

      // Generate 1-2 mineral nodes
      const mineralCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < mineralCount; i++) {
        await this.createResourceNode(chunkId, 'mineral');
      }

      logger.info(`Generated resources for chunk ${chunkId}`);
    } catch (error) {
      logger.error('Failed to generate resources', error);
    }
  }

  /**
   * Create a single resource node
   */
  private async createResourceNode(
    chunkId: string,
    resourceType: 'wood' | 'stone' | 'mineral'
  ): Promise<void> {
    // Parse chunk ID to get base position
    const parts = chunkId.split('_').map(Number);
    const chunkX = parts[0] ?? 0;
    const chunkY = parts[1] ?? 0;
    const baseX = chunkX * 32;
    const baseY = chunkY * 32;

    // Random position within chunk
    const x = baseX + Math.random() * 32;
    const y = baseY + Math.random() * 32;

    await query(
      'INSERT INTO resource_nodes (chunk_id, resource_type, grid_x, grid_y) VALUES (?, ?, ?, ?)',
      [chunkId, resourceType, x, y]
    );
  }

  /**
   * Get all resource nodes in a chunk
   */
  async getResourcesInChunk(chunkId: string): Promise<ResourceNode[]> {
    try {
      const rows: any = await query(
        `SELECT id, chunk_id, resource_type, grid_x, grid_y, is_depleted, respawn_at
         FROM resource_nodes WHERE chunk_id = ?`,
        [chunkId]
      );

      return rows.map((row: any) => ({
        id: row.id,
        chunkId: row.chunk_id,
        resourceType: row.resource_type,
        position: { x: row.grid_x, y: row.grid_y },
        isDepleted: row.is_depleted === 1,
        respawnAt: row.respawn_at,
      }));
    } catch (error) {
      logger.error('Failed to get resources in chunk', error);
      return [];
    }
  }

  /**
   * Handle resource collection
   */
  async collectResource(
    resourceNodeId: number,
    characterId: string,
    playerPosition: { x: number; y: number }
  ): Promise<{ success: boolean; resourceType?: string; message?: string }> {
    try {
      // Get resource node
      const nodes: any = await query(
        `SELECT id, resource_type, grid_x, grid_y, is_depleted, respawn_at
         FROM resource_nodes WHERE id = ?`,
        [resourceNodeId]
      );

      if (!Array.isArray(nodes) || nodes.length === 0) {
        throw new AppError('Resource node not found', 404);
      }

      const node = nodes[0];

      // Check if already depleted
      if (node.is_depleted) {
        throw new AppError('Resource node is depleted', 400);
      }

      // Check distance
      const distance = Math.sqrt(
        Math.pow(node.grid_x - playerPosition.x, 2) +
        Math.pow(node.grid_y - playerPosition.y, 2)
      );

      if (distance > this.COLLECT_DISTANCE) {
        throw new AppError('Too far from resource node', 400);
      }

      // Mark as depleted and set respawn time
      const respawnMinutes = this.RESPAWN_TIMES[node.resource_type as keyof typeof this.RESPAWN_TIMES];
      await query(
        `UPDATE resource_nodes
         SET is_depleted = TRUE, respawn_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
         WHERE id = ?`,
        [respawnMinutes, resourceNodeId]
      );

      // Add to inventory
      await this.addToInventory(characterId, node.resource_type, 1);

      logger.info(`Character ${characterId} collected ${node.resource_type} from node ${resourceNodeId}`);

      return {
        success: true,
        resourceType: node.resource_type,
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        return {
          success: false,
          message: error.message,
        };
      }
      logger.error('Resource collection error', error);
      return {
        success: false,
        message: 'Collection failed',
      };
    }
  }

  /**
   * Add item to inventory
   */
  private async addToInventory(
    characterId: string,
    itemType: string,
    quantity: number
  ): Promise<void> {
    await query(
      `INSERT INTO inventory_items (character_id, item_type, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [characterId, itemType, quantity]
    );
  }

  /**
   * Respawn depleted resources (called periodically)
   */
  async respawnResources(): Promise<number> {
    try {
      const result: any = await query(
        `UPDATE resource_nodes
         SET is_depleted = FALSE, respawn_at = NULL
         WHERE is_depleted = TRUE AND respawn_at <= NOW()`
      );

      const count = result.affectedRows || 0;
      if (count > 0) {
        logger.info(`Respawned ${count} resource nodes`);
      }

      return count;
    } catch (error) {
      logger.error('Resource respawn error', error);
      return 0;
    }
  }
}

export default new ResourceService();
