-- Migration: Friend system tables (GDD §2.7)
-- Run this on existing databases to add friend system tables.
-- Uses CREATE TABLE IF NOT EXISTS + conditional ALTER for missing columns.

-- Friendship table (bidirectional, id1 < id2 for uniqueness)
CREATE TABLE IF NOT EXISTS friendships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id_1 INT NOT NULL,
    character_id_2 INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_interact_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id_1) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id_2) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE KEY idx_friendship_pair (character_id_1, character_id_2),
    INDEX idx_char1 (character_id_1),
    INDEX idx_char2 (character_id_2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_character_id INT NOT NULL,
    to_character_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    message VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    FOREIGN KEY (from_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (to_character_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_to_status (to_character_id, status),
    INDEX idx_from_status (from_character_id, status),
    INDEX idx_pair (from_character_id, to_character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages table (mailbox: friend requests, system, chat)
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receiver_id INT NOT NULL,
    sender_id INT NULL,
    type ENUM('friend_request', 'system', 'chat') NOT NULL,
    content JSON NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receiver_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES characters(id) ON DELETE SET NULL,
    INDEX idx_receiver_read (receiver_id, is_read),
    INDEX idx_receiver_type (receiver_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patch: add message column to friend_requests if it was created by an earlier
-- version of the migration that didn't include it (CREATE TABLE IF NOT EXISTS
-- is a no-op when the table already exists).
-- In MySQL 8+ you could use ALTER TABLE ... ADD COLUMN IF NOT EXISTS, but
-- MySQL 5.7 / older 8.x builds don't support IF NOT EXISTS on ALTER COLUMN.
-- Safe to run manually: just uncomment if you hit "Unknown column 'message'".
-- ALTER TABLE friend_requests ADD COLUMN message VARCHAR(200) NULL AFTER status;