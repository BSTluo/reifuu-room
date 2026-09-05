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

-- Teams table (GDD 2.9 团队系统) — defined before map_chunks due to FK
CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    leader_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_team_name (name),
    FOREIGN KEY (leader_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Map chunks table (placeholder for Phase 1)
-- Using grid coordinates for chunks
CREATE TABLE IF NOT EXISTS map_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT,
    chunk_x INT NOT NULL,
    chunk_y INT NOT NULL,
    chunk_id VARCHAR(50) NOT NULL,
    chunk_type ENUM('empty', 'resource', 'chatroom', 'ocean') DEFAULT 'empty',
    owner_id INT NULL,
    team_id INT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    chunk_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES characters(id) ON DELETE SET NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
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
    spawn_method ENUM('unowned', 'public', 'invited') NOT NULL DEFAULT 'unowned',
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
    resource_type ENUM('wood', 'stone', 'mineral', 'coral', 'deep_mineral') NOT NULL,
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

-- Vehicles (GDD 2.8, Phase 3 horse/cart + Phase 4.5 ship/airship)
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id INT NOT NULL,
    vehicle_type ENUM('horse', 'cart', 'ship', 'airship') NOT NULL,
    speed_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.50,
    terrain_capability ENUM('land', 'water', 'all') NOT NULL DEFAULT 'land',
    water_speed_multiplier DECIMAL(4,2) NULL,
    durability INT NULL,
    equipped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_vehicle_character (character_id),
    INDEX idx_vehicle_equipped (character_id, equipped)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vehicle passengers table (GDD §2.8 载客能力)
CREATE TABLE IF NOT EXISTS vehicle_passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_id INT NOT NULL,
    driver_character_id INT NOT NULL,
    passenger_character_id INT NOT NULL,
    status ENUM('pending', 'boarding', 'onboard', 'rejected') NOT NULL DEFAULT 'pending',
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    boarded_at TIMESTAMP NULL,
    left_at TIMESTAMP NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (passenger_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_passenger_vehicle (vehicle_id),
    INDEX idx_passenger_passenger (passenger_character_id, status),
    INDEX idx_passenger_driver (driver_character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chunk_id VARCHAR(50) NOT NULL UNIQUE,
    owner_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    template ENUM('wooden_house', 'stone_house', 'advanced_house', 'island_hut') NOT NULL,
    decorations JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_chunk (chunk_id),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat messages table (room text chat, GDD 2.4)
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    character_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_room (room_id),
    INDEX idx_room_created (room_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Room membership and owner invitations. Public rooms still allow guests.
CREATE TABLE IF NOT EXISTS room_members (
    room_id INT NOT NULL,
    character_id INT NOT NULL,
    role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
    status ENUM('active', 'removed') NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, character_id),
    INDEX idx_room_members_character (character_id, status),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_invitations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    INDEX idx_room_invite_target (to_character_id, status),
    INDEX idx_room_invite_room (room_id, status),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
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

-- Towns are explicit fast-travel anchors formed from a group of chat rooms.
CREATE TABLE IF NOT EXISTS towns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    chunk_id VARCHAR(50) NOT NULL UNIQUE,
    continent ENUM('east', 'south', 'west', 'north') NOT NULL,
    level INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_town_continent (continent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    town_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    grid_x FLOAT NOT NULL DEFAULT 5,
    grid_y FLOAT NOT NULL DEFAULT 5,
    cooldown_seconds INT NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (town_id) REFERENCES towns(id) ON DELETE CASCADE,
    UNIQUE KEY idx_portal_town (town_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS town_visits (
    character_id INT NOT NULL,
    town_id INT NOT NULL,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (character_id, town_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (town_id) REFERENCES towns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Friendships table (GDD 2.7 好友系统)
-- 单条记录表示双向好友关系，character_id_1 < character_id_2 保证唯一
CREATE TABLE IF NOT EXISTS friendships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id_1 INT NOT NULL,
    character_id_2 INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_pair (character_id_1, character_id_2),
    INDEX idx_char1 (character_id_1),
    INDEX idx_char2 (character_id_2),
    FOREIGN KEY (character_id_1) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id_2) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Friend requests table (GDD 2.7 好友申请流程)
-- 唯一约束不放在表上（MySQL 5.7 生成列与外键不兼容），而是在 FriendService.sendRequest
-- 中用显式查询检查是否存在 pending 请求。这样同一对好友可以保留多条
-- accepted/rejected 历史记录，避免重复 accept 时触发唯一键冲突。
CREATE TABLE IF NOT EXISTS friend_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    INDEX idx_pair_pending (from_character_id, to_character_id, status),
    INDEX idx_to_status (to_character_id, status),
    INDEX idx_from_status (from_character_id, status),
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pigeon messages table (GDD 2.7 飞鸽传信)
CREATE TABLE IF NOT EXISTS pigeon_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    content VARCHAR(200) NOT NULL,
    status ENUM('sending', 'delivered', 'read') NOT NULL DEFAULT 'sending',
    deliver_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_to_status (to_character_id, status),
    INDEX idx_from (from_character_id),
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teams table (GDD 2.9 团队系统)
CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    leader_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_team_name (name),
    FOREIGN KEY (leader_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team invitations (leader → player, GDD 2.9 组队机制)
CREATE TABLE IF NOT EXISTS team_invitations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invite codes for spawn point system (GDD 2.1 邀请码出生)
CREATE TABLE IF NOT EXISTS invite_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    inviter_character_id INT NOT NULL,
    used_by_character_id INT NULL,
    status ENUM('active', 'used', 'revoked') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP NULL,
    FOREIGN KEY (inviter_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (used_by_character_id) REFERENCES characters(id) ON DELETE SET NULL,
    INDEX idx_code (code),
    INDEX idx_inviter (inviter_character_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team applications (player → team, GDD 2.9 组队机制)
CREATE TABLE IF NOT EXISTS team_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    character_id INT NOT NULL,
    message VARCHAR(100) NULL,
    status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_team_status (team_id, status),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Friend private chat messages (GDD 2.7 私聊频道)
-- Short-term cache: stores recent messages between friends for history display.
CREATE TABLE IF NOT EXISTS friend_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    content VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pair_from (from_character_id, to_character_id, created_at),
    INDEX idx_pair_to (to_character_id, from_character_id, created_at),
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
