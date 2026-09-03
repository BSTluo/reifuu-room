import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/mysql.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    logger.info('Starting database initialization...');

    // Read schema.sql
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove comments and split by semicolon
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    logger.info(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;
      if (statement.trim()) {
        const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
        logger.info(`[${i + 1}/${statements.length}] Executing: ${preview}...`);
        try {
          await pool.query(statement);
          logger.info(`[${i + 1}/${statements.length}] ✅ Success`);
        } catch (error: any) {
          logger.error(`[${i + 1}/${statements.length}] ❌ Failed:`, error.message);
          throw error;
        }
      }
    }

    logger.info('✅ All statements executed successfully');

    // Verify tables
    const tables: any = await pool.query('SHOW TABLES');
    const tableNames = tables.map((row: any) => Object.values(row)[0]);
    logger.info(`✅ Database contains ${tableNames.length} tables: ${tableNames.join(', ')}`);

    // Verify users table structure
    const usersStructure: any = await pool.query('DESCRIBE users');
    logger.info(`✅ Users table structure:`);
    usersStructure.forEach((col: any) => {
      logger.info(`   - ${col.Field}: ${col.Type}`);
    });

    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
