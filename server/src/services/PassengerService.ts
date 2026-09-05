import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import VehicleService, { VehicleType } from './VehicleService.js';

/**
 * 载客系统（GDD §2.8「载客能力」）
 *
 * 马车/船只/飞行器可邀请其他玩家乘坐。乘客移动控制权交给载具主人（跟随模式），
 * 乘客可随时下车。多人共乘时速度 -5%/人。
 */

const SPEED_PENALTY_PER_PASSENGER = 0.05;

export interface PassengerDTO {
  id: number;
  vehicleId: number;
  vehicleType: VehicleType;
  driverCharacterId: number;
  driverNickname: string;
  passengerCharacterId: number;
  passengerNickname: string;
  status: 'pending' | 'onboard' | 'rejected';
  invitedAt: string;
  boardedAt: string | null;
}

function mapPassenger(row: any): PassengerDTO {
  return {
    id: Number(row.id),
    vehicleId: Number(row.vehicle_id),
    vehicleType: row.vehicle_type,
    driverCharacterId: Number(row.driver_character_id),
    driverNickname: String(row.driver_nickname ?? ''),
    passengerCharacterId: Number(row.passenger_character_id),
    passengerNickname: String(row.passenger_nickname ?? ''),
    status: row.status,
    invitedAt: row.invited_at,
    boardedAt: row.boarded_at ?? null,
  };
}

export class PassengerService {
  /**
   * 获取载具模板容量
   */
  private getCapacity(vehicleType: string): number {
    const templates = VehicleService.getTemplates();
    const tpl = templates.find(t => t.vehicleType === vehicleType);
    return tpl ? tpl.capacity : 1;
  }

  /**
   * 邀请玩家乘坐（驾驶员发起）
   */
  async invitePassenger(
    driverCharacterId: string,
    passengerCharacterId: number
  ): Promise<PassengerDTO> {
    // 获取驾驶员已装备的载具
    const equipped = await VehicleService.getEquipped(driverCharacterId);
    if (!equipped) throw new AppError('请先装备交通工具', 400);

    const capacity = this.getCapacity(equipped.vehicleType);
    if (capacity <= 1) throw new AppError('该交通工具不支持载客', 400);

    // 检查已有乘客数
    const onboardCount = await this.getOnboardCount(equipped.id);
    if (onboardCount >= capacity - 1) {
      throw new AppError('交通工具已满员', 400);
    }

    // 不能邀请自己
    if (Number(passengerCharacterId) === Number(driverCharacterId)) {
      throw new AppError('不能邀请自己', 400);
    }

    // 检查是否已有 pending/onboard 记录
    const existing: any = await query(
      `SELECT id FROM vehicle_passengers
       WHERE vehicle_id = ? AND passenger_character_id = ? AND status IN ('pending', 'onboard')`,
      [equipped.id, passengerCharacterId]
    );
    if (Array.isArray(existing) && existing.length > 0) {
      throw new AppError('已邀请该玩家或该玩家已在车上', 400);
    }

    // 获取乘客昵称
    const passengerRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [passengerCharacterId]
    );
    if (!Array.isArray(passengerRows) || passengerRows.length === 0) {
      throw new AppError('乘客不存在', 404);
    }

    const driverRows: any = await query(
      'SELECT nickname FROM characters WHERE id = ?',
      [driverCharacterId]
    );

    const result: any = await query(
      `INSERT INTO vehicle_passengers (vehicle_id, driver_character_id, passenger_character_id, status)
       VALUES (?, ?, ?, 'pending')`,
      [equipped.id, Number(driverCharacterId), passengerCharacterId]
    );

    logger.info(`Passenger invite: driver ${driverCharacterId} -> passenger ${passengerCharacterId} on vehicle ${equipped.id}`);

    return {
      id: Number(result.insertId),
      vehicleId: equipped.id,
      vehicleType: equipped.vehicleType,
      driverCharacterId: Number(driverCharacterId),
      driverNickname: String(driverRows[0]?.nickname ?? ''),
      passengerCharacterId: Number(passengerCharacterId),
      passengerNickname: String(passengerRows[0]?.nickname ?? ''),
      status: 'pending',
      invitedAt: new Date().toISOString(),
      boardedAt: null,
    };
  }

  /**
   * 乘客接受邀请上车
   */
  async acceptInvite(passengerCharacterId: string, inviteId: number): Promise<PassengerDTO> {
    const rows: any = await query(
      `SELECT vp.*, v.vehicle_type,
              d.nickname AS driver_nickname,
              p.nickname AS passenger_nickname
       FROM vehicle_passengers vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       JOIN characters d ON d.id = vp.driver_character_id
       JOIN characters p ON p.id = vp.passenger_character_id
       WHERE vp.id = ? AND vp.passenger_character_id = ? AND vp.status = 'pending'`,
      [inviteId, Number(passengerCharacterId)]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('邀请不存在或已过期', 404);
    }

    const invite = rows[0];

    // 检查载具是否还有空位
    const capacity = this.getCapacity(invite.vehicle_type);
    const onboardCount = await this.getOnboardCount(invite.vehicle_id);
    if (onboardCount >= capacity - 1) {
      throw new AppError('交通工具已满员', 400);
    }

    await query(
      `UPDATE vehicle_passengers SET status = 'onboard', boarded_at = NOW() WHERE id = ?`,
      [inviteId]
    );

    logger.info(`Passenger ${passengerCharacterId} boarded vehicle ${invite.vehicle_id}`);

    return mapPassenger({ ...invite, status: 'onboard', boarded_at: new Date() });
  }

  /**
   * 乘客拒绝邀请
   */
  async rejectInvite(passengerCharacterId: string, inviteId: number): Promise<void> {
    const result: any = await query(
      `UPDATE vehicle_passengers SET status = 'rejected' WHERE id = ? AND passenger_character_id = ? AND status = 'pending'`,
      [inviteId, Number(passengerCharacterId)]
    );
    if (result.affectedRows === 0) {
      throw new AppError('邀请不存在或已处理', 404);
    }
  }

  /**
   * 乘客下车
   */
  async exitVehicle(passengerCharacterId: string): Promise<void> {
    const result: any = await query(
      `UPDATE vehicle_passengers SET status = 'rejected', left_at = NOW()
       WHERE passenger_character_id = ? AND status = 'onboard'`,
      [Number(passengerCharacterId)]
    );
    if (result.affectedRows === 0) {
      throw new AppError('你当前不在任何交通工具上', 400);
    }
    logger.info(`Passenger ${passengerCharacterId} exited vehicle`);
  }

  /**
   * 驾驶员踢出乘客
   */
  async kickPassenger(driverCharacterId: string, inviteId: number): Promise<void> {
    const rows: any = await query(
      `SELECT vp.id FROM vehicle_passengers vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       WHERE vp.id = ? AND v.character_id = ? AND vp.status = 'onboard'`,
      [inviteId, Number(driverCharacterId)]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('乘客不存在或不在你的载具上', 404);
    }

    await query(
      `UPDATE vehicle_passengers SET status = 'rejected', left_at = NOW() WHERE id = ?`,
      [inviteId]
    );
    logger.info(`Driver ${driverCharacterId} kicked passenger invite ${inviteId}`);
  }

  /**
   * 获取载具当前乘客数（onboard 状态）
   */
  async getOnboardCount(vehicleId: number): Promise<number> {
    const rows: any = await query(
      `SELECT COUNT(*) as count FROM vehicle_passengers WHERE vehicle_id = ? AND status = 'onboard'`,
      [vehicleId]
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * 获取玩家当前乘坐的载具信息（如果该玩家是乘客）
   */
  async getMyRide(passengerCharacterId: string): Promise<PassengerDTO | null> {
    const rows: any = await query(
      `SELECT vp.*, v.vehicle_type,
              d.nickname AS driver_nickname,
              p.nickname AS passenger_nickname
       FROM vehicle_passengers vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       JOIN characters d ON d.id = vp.driver_character_id
       JOIN characters p ON p.id = vp.passenger_character_id
       WHERE vp.passenger_character_id = ? AND vp.status = 'onboard'
       LIMIT 1`,
      [Number(passengerCharacterId)]
    );
    return Array.isArray(rows) && rows.length > 0 ? mapPassenger(rows[0]) : null;
  }

  /**
   * 获取驾驶员当前的乘客列表
   */
  async getDriverPassengers(driverCharacterId: string): Promise<PassengerDTO[]> {
    const equipped = await VehicleService.getEquipped(driverCharacterId);
    if (!equipped) return [];

    const rows: any = await query(
      `SELECT vp.*, v.vehicle_type,
              d.nickname AS driver_nickname,
              p.nickname AS passenger_nickname
       FROM vehicle_passengers vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       JOIN characters d ON d.id = vp.driver_character_id
       JOIN characters p ON p.id = vp.passenger_character_id
       WHERE vp.vehicle_id = ? AND vp.status = 'onboard'
       ORDER BY vp.boarded_at`,
      [equipped.id]
    );
    return Array.isArray(rows) ? rows.map(mapPassenger) : [];
  }

  /**
   * 获取玩家的待处理邀请（作为乘客）
   */
  async getPendingInvites(passengerCharacterId: string): Promise<PassengerDTO[]> {
    const rows: any = await query(
      `SELECT vp.*, v.vehicle_type,
              d.nickname AS driver_nickname,
              p.nickname AS passenger_nickname
       FROM vehicle_passengers vp
       JOIN vehicles v ON v.id = vp.vehicle_id
       JOIN characters d ON d.id = vp.driver_character_id
       JOIN characters p ON p.id = vp.passenger_character_id
       WHERE vp.passenger_character_id = ? AND vp.status = 'pending'
       ORDER BY vp.invited_at DESC`,
      [Number(passengerCharacterId)]
    );
    return Array.isArray(rows) ? rows.map(mapPassenger) : [];
  }

  /**
   * 当驾驶员移动时，同步乘客位置到驾驶员位置（跟随模式）。
   * 返回需要通知的乘客 characterId 列表及新位置。
   */
  async syncPassengersOnMove(
    driverCharacterId: string,
    newPosition: { x: number; y: number },
    newChunkId: string
  ): Promise<{ passengerCharacterId: number; nickname: string; position: { x: number; y: number }; chunkId: string }[]> {
    const passengers = await this.getDriverPassengers(driverCharacterId);
    const updates: { passengerCharacterId: number; nickname: string; position: { x: number; y: number }; chunkId: string }[] = [];

    for (const p of passengers) {
      // 更新乘客 Redis 缓存
      const cacheKey = prefixKey(`player:${p.passengerCharacterId}:position`);
      const cachedData = await redisClient.get(cacheKey);
      let nickname = p.passengerNickname;
      if (cachedData) {
        try {
          const cached = JSON.parse(cachedData);
          nickname = cached.nickname ?? nickname;
        } catch { /* use fallback */ }
      }

      await redisClient.setEx(
        cacheKey,
        300,
        JSON.stringify({
          userId: `passenger_${p.passengerCharacterId}`,
          characterId: String(p.passengerCharacterId),
          nickname,
          chunkId: newChunkId,
          position: newPosition,
          timestamp: Date.now(),
        })
      );

      // 异步更新数据库
      query(
        'UPDATE characters SET grid_x = ?, grid_y = ?, current_chunk_id = ? WHERE id = ?',
        [newPosition.x, newPosition.y, newChunkId, p.passengerCharacterId]
      ).catch(err => logger.error('Failed to sync passenger position in DB', err));

      updates.push({
        passengerCharacterId: p.passengerCharacterId,
        nickname,
        position: newPosition,
        chunkId: newChunkId,
      });
    }

    return updates;
  }

  /**
   * 获取速度惩罚倍率（每多一名乘客 -5%）
   */
  async getPassengerSpeedPenalty(driverCharacterId: string): Promise<number> {
    const equipped = await VehicleService.getEquipped(driverCharacterId);
    if (!equipped) return 1;

    const count = await this.getOnboardCount(equipped.id);
    return Math.max(0.5, 1 - count * SPEED_PENALTY_PER_PASSENGER);
  }

  /**
   * 玩家是否正在乘坐（禁止自主移动）
   */
  async isOnboard(characterId: string): Promise<boolean> {
    const ride = await this.getMyRide(characterId);
    return ride !== null;
  }
}

export default new PassengerService();