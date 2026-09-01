-- Every column the library needs, in one idempotent block.
-- Safe to run any number of times: each statement is IF NOT EXISTS.
-- Run this whenever /admin/articles reports a missing column.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS canvas        TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS canvas_link   TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS core_sentence TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS asimon        TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS axis          TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS builds_on     INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE stories  ADD COLUMN IF NOT EXISTS article_id    INTEGER REFERENCES articles(id) ON DELETE SET NULL;

-- What exists now.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'articles' ORDER BY ordinal_position;
