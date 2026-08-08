-- Run this in the Neon SQL console (console.neon.tech → project → SQL Editor).
-- Creates the "stories" table for the shared library (הספרייה המשותפת).
-- Nothing appears publicly until a story has consent = true AND status = 'published'.

CREATE TABLE IF NOT EXISTS stories (
  id            SERIAL PRIMARY KEY,
  sender        TEXT,
  email         TEXT,
  title         TEXT,
  body          TEXT,
  attribution   TEXT NOT NULL DEFAULT 'anonymous'
                CHECK (attribution IN ('full','first','anonymous')),
  consent       BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','published','hidden')),
  has_file      BOOLEAN NOT NULL DEFAULT false,
  file_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS stories_public_idx
  ON stories (status, published_at DESC)
  WHERE status = 'published';
