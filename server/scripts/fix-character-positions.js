import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from server directory (parent of scripts)
dotenv.config({ path: join(__dirname, '..', '.env') });

async function fixCharacterPositions() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    console.log('Fixing character positions...');

    // Check current positions
    const [before] = await connection.query(
      'SELECT id, nickname, current_chunk_id, grid_x, grid_y FROM characters'
    );
    console.log('Before:', before);

    // Fix positions
    const [result] = await connection.query(`
      UPDATE characters
      SET
        grid_x = CASE
          WHEN grid_x < 32 AND current_chunk_id = '10_10' THEN 10 * 32 + grid_x
          ELSE grid_x
        END,
        grid_y = CASE
          WHEN grid_y < 32 AND current_chunk_id = '10_10' THEN 10 * 32 + grid_y
          ELSE grid_y
        END
      WHERE current_chunk_id = '10_10' AND (grid_x < 32 OR grid_y < 32)
    `);
    console.log('Updated rows:', result.affectedRows);

    // Check after
    const [after] = await connection.query(
      'SELECT id, nickname, current_chunk_id, grid_x, grid_y FROM characters'
    );
    console.log('After:', after);

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

fixCharacterPositions();
