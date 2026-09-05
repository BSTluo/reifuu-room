import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Team system migration (GDD 2.9 团队系统):
 * 1. Create teams / team_members / team_invitations / team_applications tables
 * 2. Add map_chunks.team_id column + index + FK
 * Idempotent: safe to re-run (checks information_schema first).
 */
async function main() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!,
    multipleStatements: false,
  });

  const [tables]: any = await c.query('SHOW TABLES');
  const tableNames: string[] = tables.map((r: any) => Object.values(r)[0]);
  console.log('Existing tables:', tableNames.join(', '));

  // 1. teams
  if (!tableNames.includes('teams')) {
    await c.query(`CREATE TABLE teams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(30) NOT NULL,
      leader_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY idx_team_name (name),
      FOREIGN KEY (leader_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('✅ Created teams table');
  } else {
    console.log('⏭️ teams table already exists');
  }

  // 2. team_members
  if (!tableNames.includes('team_members')) {
    await c.query(`CREATE TABLE team_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      character_id INT NOT NULL,
      role ENUM('leader', 'member') NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_team_member (team_id, character_id),
      INDEX idx_team (team_id),
      INDEX idx_member (character_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('✅ Created team_members table');
  } else {
    console.log('⏭️ team_members table already exists');
  }

  // 3. team_invitations
  if (!tableNames.includes('team_invitations')) {
    await c.query(`CREATE TABLE team_invitations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      from_character_id INT NOT NULL,
      to_character_id INT NOT NULL,
      status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_to_status (to_character_id, status),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('✅ Created team_invitations table');
  } else {
    console.log('⏭️ team_invitations table already exists');
  }

  // 4. team_applications
  if (!tableNames.includes('team_applications')) {
    await c.query(`CREATE TABLE team_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      character_id INT NOT NULL,
      message VARCHAR(100) NULL,
      status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_team_status (team_id, status),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('✅ Created team_applications table');
  } else {
    console.log('⏭️ team_applications table already exists');
  }

  // 5. map_chunks.team_id column
  const [cols]: any = await c.query('SHOW COLUMNS FROM map_chunks');
  const colNames: string[] = cols.map((r: any) => r.Field);
  if (!colNames.includes('team_id')) {
    await c.query(
      `ALTER TABLE map_chunks ADD COLUMN team_id INT NULL AFTER owner_id, ADD INDEX idx_team (team_id), ADD FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL`
    );
    console.log('✅ Added map_chunks.team_id column');
  } else {
    console.log('⏭️ map_chunks.team_id already exists');
  }

  // Verify
  const [newTables]: any = await c.query('SHOW TABLES');
  console.log(
    'Final tables:',
    newTables.map((r: any) => Object.values(r)[0]).join(', ')
  );
  const [chunkCols]: any = await c.query('SHOW COLUMNS FROM map_chunks');
  console.log('map_chunks columns:', chunkCols.map((r: any) => r.Field).join(', '));

  await c.end();
  console.log('Migration complete ✅');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});