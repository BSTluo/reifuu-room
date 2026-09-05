import { query, getConnection } from '../db/mysql.js';
import InventoryService from './InventoryService.js';
import { AppError } from '../middleware/errorHandler.js';

export type VehicleType = 'horse' | 'cart' | 'ship' | 'airship';
export type TerrainCapability = 'land' | 'water' | 'all';

export interface VehicleDTO {
  id: number;
  characterId: string;
  vehicleType: VehicleType;
  speedMultiplier: number;
  terrainCapability: TerrainCapability;
  waterSpeedMultiplier: number | null;
  durability: number | null;
  equipped: boolean;
  createdAt: string;
}

export interface VehicleTemplateDTO {
  vehicleType: VehicleType;
  name: string;
  speedMultiplier: number;
  terrainCapability: TerrainCapability;
  waterSpeedMultiplier: number | null;
  capacity: number;
  requirements: { itemType: string; quantity: number }[];
}

const TEMPLATES: VehicleTemplateDTO[] = [
  { vehicleType: 'horse', name: 'Horse', speedMultiplier: 1.5, terrainCapability: 'land', waterSpeedMultiplier: null, capacity: 1, requirements: [{ itemType: 'wood', quantity: 50 }, { itemType: 'stone', quantity: 20 }] },
  { vehicleType: 'cart', name: 'Cart', speedMultiplier: 1.5, terrainCapability: 'land', waterSpeedMultiplier: null, capacity: 2, requirements: [{ itemType: 'wood', quantity: 50 }, { itemType: 'stone', quantity: 20 }] },
  { vehicleType: 'ship', name: 'Ship', speedMultiplier: 1.2, terrainCapability: 'water', waterSpeedMultiplier: 1.8, capacity: 4, requirements: [{ itemType: 'wood', quantity: 100 }, { itemType: 'mineral', quantity: 30 }] },
  { vehicleType: 'airship', name: 'Airship', speedMultiplier: 2.0, terrainCapability: 'all', waterSpeedMultiplier: null, capacity: 6, requirements: [{ itemType: 'wood', quantity: 150 }, { itemType: 'mineral', quantity: 80 }, { itemType: 'magic_crystal', quantity: 5 }] },
];

function mapVehicle(row: any): VehicleDTO {
  return {
    id: Number(row.id), characterId: String(row.character_id), vehicleType: row.vehicle_type,
    speedMultiplier: Number(row.speed_multiplier), terrainCapability: row.terrain_capability,
    waterSpeedMultiplier: row.water_speed_multiplier == null ? null : Number(row.water_speed_multiplier),
    durability: row.durability == null ? null : Number(row.durability),
    equipped: Boolean(row.equipped), createdAt: row.created_at,
  };
}

export class VehicleService {
  getTemplates() { return TEMPLATES; }

  async list(characterId: string): Promise<VehicleDTO[]> {
    const rows: any = await query('SELECT id, character_id, vehicle_type, speed_multiplier, terrain_capability, water_speed_multiplier, durability, equipped, created_at FROM vehicles WHERE character_id = ? ORDER BY created_at', [characterId]);
    return rows.map(mapVehicle);
  }

  async getEquipped(characterId: string): Promise<VehicleDTO | null> {
    const rows: any = await query('SELECT id, character_id, vehicle_type, speed_multiplier, terrain_capability, water_speed_multiplier, durability, equipped, created_at FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1', [characterId]);
    return rows.length ? mapVehicle(rows[0]) : null;
  }

  async craft(characterId: string, vehicleType: string): Promise<VehicleDTO> {
    const template = TEMPLATES.find((item) => item.vehicleType === vehicleType);
    if (!template) throw new AppError('Invalid vehicle type', 400);
    if (!(await InventoryService.hasItems(characterId, template.requirements))) throw new AppError('Insufficient resources', 400);
    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      for (const req of template.requirements) {
        const [rows]: any = await connection.execute('SELECT quantity FROM inventory_items WHERE character_id = ? AND item_type = ? FOR UPDATE', [characterId, req.itemType]);
        if (!rows.length || Number(rows[0].quantity) < req.quantity) throw new AppError('Insufficient resources', 400);
        const next = Number(rows[0].quantity) - req.quantity;
        if (next) await connection.execute('UPDATE inventory_items SET quantity = ? WHERE character_id = ? AND item_type = ?', [next, characterId, req.itemType]);
        else await connection.execute('DELETE FROM inventory_items WHERE character_id = ? AND item_type = ?', [characterId, req.itemType]);
      }
      const [result]: any = await connection.execute('INSERT INTO vehicles (character_id, vehicle_type, speed_multiplier, terrain_capability, water_speed_multiplier) VALUES (?, ?, ?, ?, ?)', [characterId, template.vehicleType, template.speedMultiplier, template.terrainCapability, template.waterSpeedMultiplier]);
      await connection.commit();
      const rows: any = await query('SELECT id, character_id, vehicle_type, speed_multiplier, terrain_capability, water_speed_multiplier, durability, equipped, created_at FROM vehicles WHERE id = ?', [result.insertId]);
      return mapVehicle(rows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async equip(characterId: string, vehicleId: number): Promise<VehicleDTO> {
    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.execute('SELECT id FROM vehicles WHERE id = ? AND character_id = ? FOR UPDATE', [vehicleId, characterId]);
      if (!rows.length) throw new AppError('Vehicle not found', 404);
      await connection.execute('UPDATE vehicles SET equipped = FALSE WHERE character_id = ?', [characterId]);
      await connection.execute('UPDATE vehicles SET equipped = TRUE WHERE id = ?', [vehicleId]);
      await connection.commit();
      const result = await this.getEquipped(characterId);
      if (!result) throw new AppError('Failed to equip vehicle', 500);
      return result;
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }

  async unequip(characterId: string): Promise<null> {
    await query('UPDATE vehicles SET equipped = FALSE WHERE character_id = ?', [characterId]);
    return null;
  }

  async getEquippedTerrainCapability(characterId: string): Promise<TerrainCapability | null> {
    const rows: any = await query('SELECT terrain_capability FROM vehicles WHERE character_id = ? AND equipped = TRUE LIMIT 1', [characterId]);
    return rows.length ? rows[0].terrain_capability : null;
  }
}
export default new VehicleService();
