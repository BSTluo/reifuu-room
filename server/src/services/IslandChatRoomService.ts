import { query } from '../db/mysql.js';
import logger from '../utils/logger.js';
import { isIslandChunk } from './MovementService.js';

/**
 * 小岛区块隐藏聊天室服务（GDD §2.8 line 358）。
 * 约 30% 的岛屿区块自动生成一个隐藏聊天室，玩家进入区块后可发现并进入。
 * 聊天室由系统角色拥有，使用 'island_hut' 模板。
 */
class IslandChatRoomService {
  /** 确定性判断某岛屿区块是否有隐藏聊天室 */
  hasHiddenRoom(chunkX: number, chunkY: number): boolean {
    if (!isIslandChunk(chunkX, chunkY)) return false;
    // 使用与岛屿检测不同的哈希字符串，避免相关性
    const seed = hashStringToSeed(`island_room_${chunkX}_${chunkY}`);
    return seed < 0x4ccccccd; // ~30%
  }

  /**
   * 确保岛屿区块的隐藏聊天室已创建。
   * 在玩家进入区块时调用（幂等）。
   */
  async ensureIslandRoom(chunkId: string): Promise<void> {
    try {
      const [chunkX, chunkY] = chunkId.split('_').map(Number);
      if (!this.hasHiddenRoom(chunkX || 0, chunkY || 0)) return;

      // 检查是否已存在
      const existing: any = await query(
        'SELECT id FROM chat_rooms WHERE chunk_id = ?',
        [chunkId],
      );
      if (existing.length > 0) return;

      // 获取系统角色 ID
      const sysChars: any = await query(
        `SELECT c.id FROM characters c
         JOIN users u ON c.user_id = u.id
         WHERE u.username = '__system_island__' LIMIT 1`,
      );
      if (sysChars.length === 0) {
        logger.warn('System island character not found, skipping island room creation');
        return;
      }

      const ownerId = sysChars[0].id;
      const roomName = this.generateRoomName(chunkX || 0, chunkY || 0);

      await query(
        `INSERT INTO chat_rooms (chunk_id, owner_id, name, template)
         VALUES (?, ?, ?, 'island_hut')`,
        [chunkId, ownerId, roomName],
      );
      logger.info(`Created hidden island chat room for chunk ${chunkId}`);
    } catch (error) {
      logger.error('Failed to ensure island room', error);
    }
  }

  /** 生成有氛围感的岛屿聊天室名称 */
  private generateRoomName(chunkX: number, chunkY: number): string {
    const names = [
      '海风小屋',
      '潮汐洞穴',
      '珊瑚亭',
      '星辰灯塔',
      '漂流者驿站',
      '月光棚',
      '远岛茶室',
      '迷雾隐屋',
    ];
    const seed = hashStringToSeed(`island_name_${chunkX}_${chunkY}`);
    const name = names[seed % names.length];
    return name ?? names[0] ?? '海风小屋';
  }
}

function hashStringToSeed(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export default new IslandChatRoomService();