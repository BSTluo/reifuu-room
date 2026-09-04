-- Migration: add spawn_method column to characters table
-- Supports GDD §2.1 birth point selection (random_unowned / random_public / invited)

ALTER TABLE characters
  ADD COLUMN spawn_method VARCHAR(30) NULL AFTER start_continent;

-- Backfill existing characters so they keep their current spawn behaviour
UPDATE characters SET spawn_method = 'default' WHERE spawn_method IS NULL;