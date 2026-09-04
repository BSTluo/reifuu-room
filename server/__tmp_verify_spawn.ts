import { query } from './src/db/mysql.js';

async function main() {
  const cols: any = await query('SHOW COLUMNS FROM characters');
  console.log('COLUMNS:', cols.map((c: any) => c.Field).join(', '));

  const chars: any = await query(
    'SELECT id, nickname, spawn_method, current_chunk_id, grid_x, grid_y FROM characters'
  );
  console.log('CHARS:', JSON.stringify(chars, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('MIGRATION_VERIFY_FAILED:', err.message);
  process.exit(1);
});
