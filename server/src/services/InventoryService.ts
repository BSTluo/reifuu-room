import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

interface InventoryItem {
  itemType: string;
  quantity: number;
}

export class InventoryService {
  /**
   * Get character's inventory
   */
  async getInventory(characterId: string): Promise<InventoryItem[]> {
    try {
      const rows: any = await query(
        'SELECT item_type, quantity FROM inventory_items WHERE character_id = ?',
        [characterId]
      );

      return rows.map((row: any) => ({
        itemType: row.item_type,
        quantity: row.quantity,
      }));
    } catch (error) {
      logger.error('Failed to get inventory', error);
      throw new AppError('Failed to retrieve inventory', 500);
    }
  }

  /**
   * Add items to inventory
   */
  async addItem(
    characterId: string,
    itemType: string,
    quantity: number
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO inventory_items (character_id, item_type, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [characterId, itemType, quantity]
      );

      logger.info(`Added ${quantity} ${itemType} to character ${characterId}'s inventory`);
    } catch (error) {
      logger.error('Failed to add item to inventory', error);
      throw new AppError('Failed to add item', 500);
    }
  }

  /**
   * Remove items from inventory
   */
  async removeItem(
    characterId: string,
    itemType: string,
    quantity: number
  ): Promise<boolean> {
    try {
      // Check current quantity
      const items: any = await query(
        'SELECT quantity FROM inventory_items WHERE character_id = ? AND item_type = ?',
        [characterId, itemType]
      );

      if (!Array.isArray(items) || items.length === 0) {
        return false; // Item not found
      }

      const currentQuantity = items[0].quantity;
      if (currentQuantity < quantity) {
        return false; // Not enough items
      }

      // Update quantity
      const newQuantity = currentQuantity - quantity;
      if (newQuantity === 0) {
        // Remove entry if quantity reaches 0
        await query(
          'DELETE FROM inventory_items WHERE character_id = ? AND item_type = ?',
          [characterId, itemType]
        );
      } else {
        await query(
          'UPDATE inventory_items SET quantity = ? WHERE character_id = ? AND item_type = ?',
          [newQuantity, characterId, itemType]
        );
      }

      logger.info(`Removed ${quantity} ${itemType} from character ${characterId}'s inventory`);
      return true;
    } catch (error) {
      logger.error('Failed to remove item from inventory', error);
      throw new AppError('Failed to remove item', 500);
    }
  }

  /**
   * Check if character has enough items
   */
  async hasItems(
    characterId: string,
    requirements: { itemType: string; quantity: number }[]
  ): Promise<boolean> {
    try {
      for (const req of requirements) {
        const items: any = await query(
          'SELECT quantity FROM inventory_items WHERE character_id = ? AND item_type = ?',
          [characterId, req.itemType]
        );

        if (!Array.isArray(items) || items.length === 0) {
          return false;
        }

        if (items[0].quantity < req.quantity) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check inventory items', error);
      return false;
    }
  }
}

export default new InventoryService();
