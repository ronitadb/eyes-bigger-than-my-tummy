-- An article whose text lives somewhere else.
--
-- The זמן קיבוץ piece was published before the library existed and already
-- has a designed PDF. When external_url is set the card links there instead
-- of to /library/<slug>, so the library can carry work that predates it
-- without pretending that work is hosted here.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS external_url TEXT;
