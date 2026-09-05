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
