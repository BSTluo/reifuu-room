ALTER TABLE characters
  ADD COLUMN spawn_method ENUM('unowned', 'public') NOT NULL DEFAULT 'unowned'
  AFTER start_continent;

ALTER TABLE map_chunks
  MODIFY COLUMN chunk_type ENUM('empty', 'resource', 'chatroom') DEFAULT 'empty';
