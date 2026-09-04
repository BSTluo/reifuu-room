import { query } from './src/db/mysql.js';
import pool from './src/db/mysql.js';

(async () => {
  for (const table of ['friend_requests', 'friendships', 'messages']) {
    const r: any = await query(`DESCRIBE ${table}`);
    console.log(`\n${table} columns:`);
    for (const col of r) console.log(`  ${col.Field}: ${col.Type}`);
  }
  await pool.end();
})();