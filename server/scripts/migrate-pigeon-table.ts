import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
    multipleStatements: true,
  });

  // Back up existing rows
  const [oldRows] = await c.query('SELECT * FROM pigeon_messages');
  console.log(`Backing up ${oldRows.length} old rows`);

  // Drop and recreate with schema.sql structure
  await c.query(`DROP TABLE IF EXISTS pigeon_messages`);
  await c.query(`CREATE TABLE pigeon_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    content VARCHAR(200) NOT NULL,
    status ENUM('sending','delivered','read') NOT NULL DEFAULT 'sending',
    deliver_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_to_status (to_character_id, status),
    INDEX idx_from (from_character_id),
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Migrate old data (sender_id→from_character_id, receiver_id→to_character_id, sent_at→created_at, delivered_at→deliver_at)
  // Status: if delivered_at is not null → 'delivered', else 'sending'
  for (const row of oldRows) {
    const status = row.delivered_at ? 'delivered' : 'sending';
    await c.query(
      'INSERT INTO pigeon_messages (from_character_id, to_character_id, content, status, deliver_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [row.sender_id, row.receiver_id, row.content, status, row.delivered_at, row.sent_at]
    );
  }

  const [newRows] = await c.query('SELECT COUNT(*) AS n FROM pigeon_messages');
  console.log(`Migration complete. ${newRows[0].n} rows in new table.`);

  const [cols] = await c.query('SHOW COLUMNS FROM pigeon_messages');
  console.log('Columns:', cols.map((r: any) => r.Field).join(', '));

  await c.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});