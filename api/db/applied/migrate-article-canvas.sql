-- כרטיס מאמר — the working document behind each article.
--
-- Deliberately ONE long text column, not a parsed structure. This document is
-- not a summary and must not be reorganised into fields: it is the canvas the
-- writing happens on, and its value is that it stays exactly as written.
--
-- PRIVATE. api/article.js selects explicit columns and never includes these,
-- so they cannot reach the page source.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS canvas      TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS canvas_link TEXT;
