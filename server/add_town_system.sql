-- Migration: Town system + portal teleport (GDD §2.3)
-- Run this on existing databases to add town tables.
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to re-run.

-- Towns table (auto-created when 3x3 chatroom density >= 5, GDD §2.3)
CREATE TABLE IF NOT EXISTS towns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    center_chunk_id VARCHAR(50) NOT NULL UNIQUE,
    founded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (founded_by) REFERENCES characters(id) ON DELETE SET NULL,
    INDEX idx_center_chunk (center_chunk_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Town visits table (GDD §2.3 传送门解锁条件)
-- A player must physically visit a town once to unlock it for portal teleport.
CREATE TABLE IF NOT EXISTS town_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id INT NOT NULL,
    town_id INT NOT NULL,
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_character_town (character_id, town_id),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (town_id) REFERENCES towns(id) ON DELETE CASCADE,
    INDEX idx_character (character_id),
    INDEX idx_town (town_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;