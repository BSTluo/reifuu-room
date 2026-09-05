-- Migration 008: Vehicle passenger system (GDD §2.8 载客能力)
-- Allows players to board another player's vehicle (cart/ship/airship) as passengers.

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