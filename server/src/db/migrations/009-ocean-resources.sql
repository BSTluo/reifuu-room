-- Migration 009: Ocean resource nodes (GDD §2.8 海洋区块内容)
-- Adds coral and deep_mineral resource types for ocean chunks.
-- Also updates resource_nodes.resource_type enum to include new types.

ALTER TABLE resource_nodes
    MODIFY COLUMN resource_type ENUM('wood', 'stone', 'mineral', 'coral', 'deep_mineral') NOT NULL;