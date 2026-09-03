-- Reifuu Room Database Schema
-- MySQL Schema Initialization

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    refresh_token VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rooms table (placeholder)
CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT,
    max_players INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Players table (placeholder)
-- Using grid coordinates (grid_x, grid_y) as per frontend coordination
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    room_id INT,
    grid_x FLOAT DEFAULT 0,
    grid_y FLOAT DEFAULT 0,
    grid_z FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    INDEX idx_room (room_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resources table (placeholder)
CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT,
    resource_type VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    INDEX idx_player (player_id),
    INDEX idx_type (resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Map chunks table (placeholder for Phase 1)
-- Using grid coordinates for chunks
CREATE TABLE IF NOT EXISTS map_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    chunk_x INT NOT NULL,
    chunk_y INT NOT NULL,
    chunk_id VARCHAR(50) NOT NULL,
    chunk_type ENUM('empty', 'chatroom') DEFAULT 'empty',
    owner_id INT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    chunk_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES characters(id) ON DELETE SET NULL,
    UNIQUE KEY idx_chunk_position (room_id, chunk_x, chunk_y),
    UNIQUE KEY idx_chunk_id (chunk_id),
    INDEX idx_room_chunks (room_id),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Characters table
-- MVP: one character per user
CREATE TABLE IF NOT EXISTS characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    nickname VARCHAR(50) UNIQUE NOT NULL,
    appearance JSON NOT NULL,
    start_continent ENUM('east', 'south', 'west', 'north') NOT NULL,
    current_chunk_id VARCHAR(50) NOT NULL,
    grid_x FLOAT DEFAULT 0,
    grid_y FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_nickname (nickname),
    INDEX idx_chunk (current_chunk_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resource nodes table
CREATE TABLE IF NOT EXISTS resource_nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chunk_id VARCHAR(50) NOT NULL,
    resource_type ENUM('wood', 'stone', 'mineral') NOT NULL,
    grid_x FLOAT NOT NULL,
    grid_y FLOAT NOT NULL,
    is_depleted BOOLEAN DEFAULT FALSE,
    respawn_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_chunk (chunk_id),
    INDEX idx_type (resource_type),
    INDEX idx_depleted (is_depleted),
    INDEX idx_respawn (respawn_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id INT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE KEY idx_character_item (character_id, item_type),
    INDEX idx_character (character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chunk_id VARCHAR(50) NOT NULL UNIQUE,
    owner_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    template ENUM('wooden_house', 'stone_house', 'advanced_house') NOT NULL,
    decorations JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_chunk (chunk_id),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Explored chunks table (Fog of War, GDD 2.6)
CREATE TABLE IF NOT EXISTS explored_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id INT NOT NULL,
    chunk_id VARCHAR(50) NOT NULL,
    explored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_character_chunk (character_id, chunk_id),
    INDEX idx_character (character_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
