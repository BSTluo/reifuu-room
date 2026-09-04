-- Migration: Pigeon mail system (GDD §2.7 飞鸽传书)
-- Run this on existing databases to add pigeon mail tables and columns.
-- Uses CREATE TABLE IF NOT EXISTS + conditional ALTER for missing columns.

-- Pigeon messages table (delayed delivery queue, GDD §2.7 PigeonMessage model)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend messages.type ENUM to include 'pigeon' (mailbox category).
-- MODIFY COLUMN is idempotent: re-declaring the ENUM with the extra value is safe.
ALTER TABLE messages MODIFY COLUMN type ENUM('friend_request', 'system', 'chat', 'pigeon') NOT NULL;

-- Add reject_stranger_pigeon setting to characters (GDD §2.7 隐私设置).
-- MySQL 5.7 / older 8.x builds don't support ADD COLUMN IF NOT EXISTS.
-- Safe to run manually: uncomment if you hit "Unknown column 'reject_stranger_pigeon'".
-- ALTER TABLE characters ADD COLUMN reject_stranger_pigeon BOOLEAN DEFAULT FALSE AFTER spawn_method;
