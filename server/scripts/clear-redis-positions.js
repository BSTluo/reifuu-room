import redisClient, { prefixKey } from '../dist/db/redis.js';

async function clearPlayerPositions() {
  try {
    console.log('Clearing player position cache...');

    // Find all player position keys
    const pattern = prefixKey('player:*:position');
    const keys = [];

    let cursor = '0';
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = result.cursor.toString();
      keys.push(...result.keys);
    } while (cursor !== '0');

    console.log(`Found ${keys.length} player position keys:`, keys);

    if (keys.length > 0) {
      const result = await redisClient.del(keys);
      console.log(`Deleted ${result} keys`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

clearPlayerPositions();
