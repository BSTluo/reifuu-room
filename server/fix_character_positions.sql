-- Fix character positions: convert chunk-local coordinates to world coordinates
-- This fixes characters that were created with chunk-local coords (e.g. 5,5)
-- instead of world coords (e.g. 325,325)

-- For characters in chunk 10_10 with small coordinates (< 32),
-- convert them to world coordinates
UPDATE characters
SET
  grid_x = CASE
    WHEN grid_x < 32 AND current_chunk_id = '10_10' THEN 10 * 32 + grid_x
    ELSE grid_x
  END,
  grid_y = CASE
    WHEN grid_y < 32 AND current_chunk_id = '10_10' THEN 10 * 32 + grid_y
    ELSE grid_y
  END
WHERE current_chunk_id = '10_10' AND (grid_x < 32 OR grid_y < 32);

-- Verify the update
SELECT id, nickname, current_chunk_id, grid_x, grid_y
FROM characters
WHERE current_chunk_id = '10_10';
