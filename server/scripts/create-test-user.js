import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

async function createTestUser() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    console.log('Creating test user...');

    // Check existing users
    const [existing] = await connection.query('SELECT username, email FROM users');
    console.log('Existing users:', existing);

    // Create test user with simple password
    const username = 'test';
    const email = 'test@example.com';
    const password = 'test123';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert or update
    await connection.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE password_hash = ?
    `, [username, email, passwordHash, passwordHash]);

    console.log('Test user created/updated:');
    console.log('  Username:', username);
    console.log('  Email:', email);
    console.log('  Password:', password);

    // Verify
    const [verify] = await connection.query(
      'SELECT id, username, email FROM users WHERE username = ?',
      [username]
    );
    console.log('Verified:', verify);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

createTestUser();
