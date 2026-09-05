import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { randomUUID } from 'crypto';
import RoomMembershipService from './RoomMembershipService.js';

/** 家具类型定义 */
export interface FurnitureItem {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  placedBy: string;
  createdAt: number;
}

/** 房间装饰数据（持久化在 chat_rooms.decorations JSON 列） */
interface RoomDecorations {
  furniture: FurnitureItem[];
}

/** 家具目录：类型 -> 名称/尺寸/是否可交互插件 */
export interface FurnitureCatalogEntry {
  type: string;
  name: string;
  icon: string;
  width: number;
  height: number;
  /** 关联的插件 ID（如 card_table -> doudizhu），无则 null */
  pluginId: string | null;
  /** 是否可被普通成员摆放（false 则仅房主可摆） */
  memberPlaceable: boolean;
}

/** 内建家具目录 */
const FURNITURE_CATALOG: Record<string, FurnitureCatalogEntry> = {
  card_table: {
    type: 'card_table',
    name: '牌桌',
    icon: '🃏',
    width: 2,
    height: 2,
    pluginId: 'doudizhu',
    memberPlaceable: false,
  },
  radio: {
    type: 'radio',
    name: '收音机',
    icon: '📻',
    width: 1,
    height: 1,
    pluginId: 'radio-fm',
    memberPlaceable: true,
  },
  jukebox: {
    type: 'jukebox',
    name: '点播机',
    icon: '🎵',
    width: 1,
    height: 1,
    pluginId: 'music-sync',
    memberPlaceable: true,
  },
  projector: {
    type: 'projector',
    name: '放映仪',
    icon: '🎬',
    width: 2,
    height: 1,
    pluginId: 'video-sync',
    memberPlaceable: true,
  },
  sofa: {
    type: 'sofa',
    name: '沙发',
    icon: '🛋️',
    width: 2,
    height: 1,
    pluginId: null,
    memberPlaceable: true,
  },
  table: {
    type: 'table',
    name: '桌子',
    icon: '🪑',
    width: 1,
    height: 1,
    pluginId: null,
    memberPlaceable: true,
  },
  plant: {
    type: 'plant',
    name: '盆栽',
    icon: '🪴',
    width: 1,
    height: 1,
    pluginId: null,
    memberPlaceable: true,
  },
  bookshelf: {
    type: 'bookshelf',
    name: '书架',
    icon: '📚',
    width: 1,
    height: 2,
    pluginId: null,
    memberPlaceable: true,
  },
  bed: {
    type: 'bed',
    name: '床',
    icon: '🛏️',
    width: 2,
    height: 1,
    pluginId: null,
    memberPlaceable: true,
  },
  lamp: {
    type: 'lamp',
    name: '台灯',
    icon: '💡',
    width: 1,
    height: 1,
    pluginId: null,
    memberPlaceable: true,
  },
};

/** 房间内部网格尺寸（tile 数） */
export const ROOM_GRID_WIDTH = 12;
export const ROOM_GRID_HEIGHT = 8;

/** 默认房间装饰（空房间） */
const EMPTY_DECORATIONS: RoomDecorations = { furniture: [] };

class RoomService {
  /** 获取家具目录 */
  getFurnitureCatalog(): FurnitureCatalogEntry[] {
    return Object.values(FURNITURE_CATALOG);
  }

  /** 获取家具目录条目 */
  getCatalogEntry(type: string): FurnitureCatalogEntry | undefined {
    return FURNITURE_CATALOG[type];
  }

  /** 读取房间装饰数据（解析 JSON 列） */
  private async readDecorations(roomId: string): Promise<RoomDecorations> {
    const rows: any = await query('SELECT decorations FROM chat_rooms WHERE id = ?', [roomId]);
    if (rows.length === 0) {
      throw new AppError('Chat room not found', 404);
    }
    const raw = rows[0].decorations;
    if (!raw) return { ...EMPTY_DECORATIONS };
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        furniture: Array.isArray(parsed?.furniture) ? parsed.furniture : [],
      };
    } catch {
      return { ...EMPTY_DECORATIONS };
    }
  }

  /** 写入房间装饰数据 */
  private async writeDecorations(roomId: string, decorations: RoomDecorations): Promise<void> {
    await query('UPDATE chat_rooms SET decorations = ? WHERE id = ?', [
      JSON.stringify(decorations),
      roomId,
    ]);
  }

  /** 获取房间内所有家具 */
  async getFurniture(roomId: string): Promise<FurnitureItem[]> {
    const decorations = await this.readDecorations(roomId);
    return decorations.furniture;
  }

  /** 校验家具摆放位置是否合法（网格内 + 不与其他家具重叠） */
  private validatePlacement(
    furniture: FurnitureItem[],
    entry: FurnitureCatalogEntry,
    x: number,
    y: number,
    excludeId?: string,
  ): void {
    if (x < 0 || y < 0 || x + entry.width > ROOM_GRID_WIDTH || y + entry.height > ROOM_GRID_HEIGHT) {
      throw new AppError('家具超出房间范围', 400);
    }
    for (const f of furniture) {
      if (f.id === excludeId) continue;
      const other = FURNITURE_CATALOG[f.type];
      if (!other) continue;
      const overlap =
        x < f.x + other.width &&
        x + entry.width > f.x &&
        y < f.y + other.height &&
        y + entry.height > f.y;
      if (overlap) {
        throw new AppError('该位置已有家具', 400);
      }
    }
  }

  /** 摆放家具（房主或成员，取决于家具类型） */
  async placeFurniture(
    roomId: string,
    characterId: string,
    type: string,
    x: number,
    y: number,
    rotation = 0,
  ): Promise<FurnitureItem> {
    const entry = FURNITURE_CATALOG[type];
    if (!entry) {
      throw new AppError('未知家具类型', 400);
    }

    // 校验房间存在 + 获取房主
    const rooms: any = await query('SELECT id, owner_id FROM chat_rooms WHERE id = ?', [roomId]);
    if (rooms.length === 0) {
      throw new AppError('Chat room not found', 404);
    }
    const ownerId = String(rooms[0].owner_id);
    const access = await RoomMembershipService.requireAccess(roomId, characterId);
    if (!access.role && access.isPublic === false) throw new AppError('Room membership required', 403);

    // 权限：非 memberPlaceable 家具仅房主可摆
    if (!entry.memberPlaceable && String(characterId) !== ownerId) {
      throw new AppError('仅房主可摆放该家具', 403);
    }

    const gx = Math.floor(Number(x));
    const gy = Math.floor(Number(y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      throw new AppError('Invalid position', 400);
    }

    const decorations = await this.readDecorations(roomId);
    this.validatePlacement(decorations.furniture, entry, gx, gy);

    const item: FurnitureItem = {
      id: randomUUID(),
      type,
      x: gx,
      y: gy,
      rotation: Number(rotation) || 0,
      placedBy: characterId,
      createdAt: Date.now(),
    };
    decorations.furniture.push(item);
    await this.writeDecorations(roomId, decorations);
    logger.info(`Furniture "${type}" placed in room ${roomId} by ${characterId} at (${gx},${gy})`);
    return item;
  }

  /** 移动家具 */
  async moveFurniture(
    roomId: string,
    characterId: string,
    furnitureId: string,
    x: number,
    y: number,
    rotation?: number,
  ): Promise<FurnitureItem> {
    const rooms: any = await query('SELECT id, owner_id FROM chat_rooms WHERE id = ?', [roomId]);
    if (rooms.length === 0) {
      throw new AppError('Chat room not found', 404);
    }
    const ownerId = String(rooms[0].owner_id);
    await RoomMembershipService.requireAccess(roomId, characterId);

    const decorations = await this.readDecorations(roomId);
    const item = decorations.furniture.find((f) => f.id === furnitureId);
    if (!item) {
      throw new AppError('家具不存在', 404);
    }
    const entry = FURNITURE_CATALOG[item.type];
    if (!entry) return item;

    // 权限：仅房主或摆放者可移动
    if (String(characterId) !== ownerId && String(characterId) !== item.placedBy) {
      throw new AppError('无权移动该家具', 403);
    }

    const gx = Math.floor(Number(x));
    const gy = Math.floor(Number(y));
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
      throw new AppError('Invalid position', 400);
    }

    this.validatePlacement(decorations.furniture, entry, gx, gy, item.id);

    item.x = gx;
    item.y = gy;
    if (typeof rotation === 'number' && Number.isFinite(rotation)) {
      item.rotation = rotation;
    }
    await this.writeDecorations(roomId, decorations);
    logger.info(`Furniture "${item.type}" moved in room ${roomId} by ${characterId} to (${gx},${gy})`);
    return item;
  }

  /** 移除家具 */
  async removeFurniture(
    roomId: string,
    characterId: string,
    furnitureId: string,
  ): Promise<boolean> {
    const rooms: any = await query('SELECT id, owner_id FROM chat_rooms WHERE id = ?', [roomId]);
    if (rooms.length === 0) {
      throw new AppError('Chat room not found', 404);
    }
    const ownerId = String(rooms[0].owner_id);
    await RoomMembershipService.requireAccess(roomId, characterId);

    const decorations = await this.readDecorations(roomId);
    const idx = decorations.furniture.findIndex((f) => f.id === furnitureId);
    if (idx === -1) {
      throw new AppError('家具不存在', 404);
    }
    const item = decorations.furniture[idx]!;
    if (String(characterId) !== ownerId && String(characterId) !== item.placedBy) {
      throw new AppError('无权移除该家具', 403);
    }
    decorations.furniture.splice(idx, 1);
    await this.writeDecorations(roomId, decorations);
    logger.info(`Furniture "${item.type}" removed from room ${roomId} by ${characterId}`);
    return true;
  }
}

export default new RoomService();
