-- Phase 4.5: Ocean chunks and advanced vehicles (ships/airships)
-- GDD 2.8: boats cross ocean, airships cross all terrain

-- Add 'ocean' to map_chunks.chunk_type
ALTER TABLE map_chunks
  MODIFY COLUMN chunk_type ENUM('empty', 'resource', 'chatroom', 'ocean') DEFAULT 'empty';

-- Add ship/airship to vehicles.vehicle_type
ALTER TABLE vehicles
  MODIFY COLUMN vehicle_type ENUM('horse', 'cart', 'ship', 'airship') NOT NULL;

-- Add terrain_capability column to distinguish land/water/all vehicles
ALTER TABLE vehicles
  ADD COLUMN terrain_capability ENUM('land', 'water', 'all') NOT NULL DEFAULT 'land'
  AFTER speed_multiplier;

-- Ship speed on water vs land (GDD 2.8: 180% water / 120% land)
ALTER TABLE vehicles
  ADD COLUMN water_speed_multiplier DECIMAL(4,2) NULL
  AFTER terrain_capability;