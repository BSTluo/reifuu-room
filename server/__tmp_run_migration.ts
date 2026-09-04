import { query } from './src/db/mysql.js';

async function main() {
  const cols: any = await query("SHOW COLUMNS FROM characters LIKE 'spawn_method'");
  if (Array.isArray(cols) && cols.length > 0) {
    console.log('spawn_method column already exists');
  } else {
    console.log('Adding spawn_method column...');
    await query(
      'ALTER TABLE characters ADD COLUMN spawn_method VARCHAR(30) NULL AFTER start_continent'
    );
    console.log('Added spawn_method column');
  }

  await query("UPDATE characters SET spawn_method = 'default' WHERE spawn_method IS NULL");
  console.log('Backfilled existing characters');

  const chars: any = await query(
    'SELECT id, nickname, spawn_method, current_chunk_id FROM characters'
  );
  console.log('CHARS:', JSON.stringify(chars, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('MIGRATION_FAILED:', err.message);
  process.exit(1);
});