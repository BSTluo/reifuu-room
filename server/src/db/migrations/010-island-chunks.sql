-- Migration 010: Island chunk system (GDD §2.8 小岛区块)
-- Adds a system user + character for ownership of hidden island chat rooms.
-- Also extends chat_rooms.template enum to include 'island_hut'.

-- System user for island rooms (id will be auto-assigned)
INSERT IGNORE INTO users (username, email, password_hash)
VALUES ('__system_island__', 'system-island@reifuu.local', 'DISABLED');

-- System character for island rooms (id will be auto-assigned)
INSERT IGNORE INTO characters (user_id, nickname, appearance, start_continent, spawn_method, current_chunk_id)
SELECT id, '__system_island__', '{}', 'east', 'unowned', '0_0'
FROM users WHERE username = '__system_island__';

-- Extend chat_rooms template enum to include island_hut
ALTER TABLE chat_rooms
    MODIFY COLUMN template ENUM('wooden_house', 'stone_house', 'advanced_house', 'island_hut') NOT NULL;