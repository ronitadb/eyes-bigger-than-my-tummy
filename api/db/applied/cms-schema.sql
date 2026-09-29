-- Run this in the Neon SQL console to create the page_content table.

CREATE TABLE IF NOT EXISTS page_content (
  id SERIAL PRIMARY KEY,
  page_slug VARCHAR(50) NOT NULL,
  block_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(page_slug, block_id)
);
