// One-off migration runner for the pigeon mail system.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  multipleStatements: false,
});

async function columnExists(table, column) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return rows.length > 0;
}

try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS pigeon_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        content VARCHAR(200) NOT NULL,
        distance INT NOT NULL DEFAULT 0,
        has_traffic_channel BOOLEAN DEFAULT FALSE,
        calculated_delay INT NOT NULL DEFAULT 0,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP NULL,
        FOREIGN KEY (sender_id) REFERENCES characters(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES characters(id) ON DELETE CASCADE,
        INDEX idx_receiver_delivered (receiver_id, delivered_at),
        INDEX idx_delivered (delivered_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('OK: pigeon_messages table ensured');

  await conn.query(
    `ALTER TABLE messages MODIFY COLUMN type ENUM('friend_request', 'system', 'chat', 'pigeon') NOT NULL`
  );
  console.log('OK: messages.type enum extended');

  if (!(await columnExists('characters', 'reject_stranger_pigeon'))) {
    await conn.query(
      `ALTER TABLE characters ADD COLUMN reject_stranger_pigeon BOOLEAN DEFAULT FALSE AFTER spawn_method`
    );
    console.log('OK: characters.reject_stranger_pigeon added');
  } else {
    console.log('SKIP: characters.reject_stranger_pigeon already exists');
  }
  console.log('Migration complete');
} finally {
  await conn.end();
}