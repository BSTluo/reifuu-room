import { query } from '../db/mysql.js';
import redisClient, { prefixKey } from '../db/redis.js';
import { AppError } from '../middleware/errorHandler.js';
import ExplorationService from './ExplorationService.js';

export interface TownDTO {
  id: number; name: string; chunkId: string; continent: string; level: number;
  portalId: number; portalX: number; portalY: number; cooldownSeconds: number;
  unlocked: boolean;
  cooldownRemaining?: number;
}

class TownService {
  async listForCharacter(characterId: string): Promise<TownDTO[]> {
    const rows: any = await query(`
      SELECT t.id, t.name, t.chunk_id chunkId, t.continent, t.level,
             p.id portalId, p.grid_x portalX, p.grid_y portalY, p.cooldown_seconds cooldownSeconds,
             EXISTS(SELECT 1 FROM town_visits v WHERE v.town_id=t.id AND v.character_id=?) unlocked
      FROM towns t JOIN portals p ON p.town_id=t.id ORDER BY t.name`, [characterId]);
    return Promise.all(rows.map(async (town: TownDTO) => ({
      ...town,
      cooldownRemaining: await this.getCooldownRemaining(characterId, town.portalId),
    })));
  }

  async teleport(characterId: string, townId: number) {
    const rows: any = await query(`
      SELECT t.id, t.name, t.chunk_id chunkId, p.id portalId,
             p.grid_x portalX, p.grid_y portalY, p.cooldown_seconds cooldownSeconds,
             EXISTS(SELECT 1 FROM town_visits v WHERE v.town_id=t.id AND v.character_id=?) unlocked
      FROM towns t JOIN portals p ON p.town_id=t.id WHERE t.id=?`, [characterId, townId]);
    const town = rows?.[0];
    if (!town) throw new AppError('Town not found', 404);
    if (!town.unlocked) throw new AppError('Visit this town before using its portal', 403);
    const cooldownKey = this.cooldownKey(characterId, town.portalId);
    const claimed = await redisClient.set(cooldownKey, '1', {
      NX: true,
      EX: Math.max(1, Number(town.cooldownSeconds) || 30),
    });
    if (claimed !== 'OK') {
      const remaining = await this.getCooldownRemaining(characterId, town.portalId);
      throw new AppError(`Portal is on cooldown (${remaining}s remaining)`, 429);
    }
    await query('INSERT INTO town_visits (character_id,town_id) VALUES (?,?) ON DUPLICATE KEY UPDATE visited_at=CURRENT_TIMESTAMP',
      [characterId, town.id]);
    const chunks = await ExplorationService.exploreArea(characterId, town.chunkId, 1);
    return { town, position: { x: town.portalX, y: town.portalY }, chunks };
  }

  private cooldownKey(characterId: string, portalId: number): string {
    return prefixKey(`town:portal:cooldown:${characterId}:${portalId}`);
  }

  private async getCooldownRemaining(characterId: string, portalId: number): Promise<number> {
    const ttl = await redisClient.ttl(this.cooldownKey(characterId, portalId));
    return ttl > 0 ? ttl : 0;
  }

  /** Creates the initial anchor when a world has no generated towns yet. */
  async ensureTownForChunk(chunkId: string, continent = 'east', characterId?: string): Promise<void> {
    await query(
      `INSERT IGNORE INTO towns (name, chunk_id, continent) VALUES (?, ?, ?)`,
      [`${continent[0]?.toUpperCase() ?? 'T'}own ${chunkId}`, chunkId, continent]
    );
    await query(
      `INSERT INTO portals (town_id, name, grid_x, grid_y)
       SELECT id, name, 5, 5 FROM towns WHERE chunk_id=?
       ON DUPLICATE KEY UPDATE id=id`,
      [chunkId]
    );
    if (characterId) {
      await query(
        `INSERT INTO town_visits (character_id, town_id)
         SELECT ?, id FROM towns WHERE chunk_id=?
         ON DUPLICATE KEY UPDATE visited_at=CURRENT_TIMESTAMP`,
        [characterId, chunkId]
      );
    }
  }

  async markVisit(characterId: string, chunkId: string) {
    await query(`INSERT INTO town_visits (character_id,town_id)
      SELECT ?, id FROM towns WHERE chunk_id=? ON DUPLICATE KEY UPDATE visited_at=CURRENT_TIMESTAMP`,
      [characterId, chunkId]);
  }
}
export default new TownService();
