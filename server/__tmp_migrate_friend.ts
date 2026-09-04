/* Temporary migration runner: creates friend system tables. Run: npx tsx __tmp_friend_migration.ts */
import { query } from './src/db/mysql.js';
import pool from './src/db/mysql.js';
import { readFile } from 'fs/promises';

async function main() {
  const sql = await readFile('./add_friend_system.sql', 'utf-8');
  // Split on semicolons at end of statement, strip comments
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await query(stmt);
      console.log('OK:', stmt.split('\n')[0].slice(0, 60));
    } catch (err: any) {
      console.error('FAIL:', stmt.split('\n')[0].slice(0, 60), '-', err.message);
      process.exitCode = 1;
    }
  }

  // Verify tables exist
  const tables: any = await query(
    `SHOW TABLES LIKE 'friend%'`
  );
  console.log('friend tables:', JSON.stringify(tables));
  const msgs: any = await query(`SHOW TABLES LIKE 'messages'`);
  console.log('messages table:', JSON.stringify(msgs));
  await pool.end();
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error('Migration crashed:', err);
  process.exit(1);
});