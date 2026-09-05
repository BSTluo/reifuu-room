-- Phase 4.5+: Invite code spawn system (GDD 2.1 "邀请码出生")
-- Allows players to generate invite codes; new players using a code spawn at the inviter's chunk.

-- Add 'invited' to characters.spawn_method
ALTER TABLE characters
  MODIFY COLUMN spawn_method ENUM('unowned', 'public', 'invited') NOT NULL DEFAULT 'unowned';

-- Invite codes table
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