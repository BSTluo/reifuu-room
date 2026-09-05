-- Phase 3 vehicles (GDD 2.8: horse/cart only)
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    character_id INT NOT NULL,
    vehicle_type ENUM('horse', 'cart') NOT NULL,
    speed_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.50,
    durability INT NULL,
    equipped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    INDEX idx_vehicle_character (character_id),
    INDEX idx_vehicle_equipped (character_id, equipped)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
