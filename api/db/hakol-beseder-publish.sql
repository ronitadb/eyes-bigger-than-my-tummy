-- ״הכול בסדר?״ — publish it as a page reached from the email link only
-- (Ronit, 2026-11-19, before the letter to the children's group goes out).
--
-- Three page settings on articles, each defaulting to what every page does
-- today, so no existing article changes:
--   listed      — false: public at its address, but not in the library list
--   echo_form   — false: no ״מה זה עורר בך?״ form under the page
--   indexable   — false: <meta name="robots" content="noindex">
-- Then hakol-beseder takes all three as false and is published. Its address
-- /library/hakol-beseder is final: it is in the email.
--
-- Guard: the UPDATE touches only the hakol-beseder row while it is a draft.
-- Expect: ALTER TABLE, then UPDATE 1.

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS listed    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS echo_form BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS indexable BOOLEAN NOT NULL DEFAULT true;

UPDATE articles SET
  listed = false, echo_form = false, indexable = false,
  status = 'published', published_at = COALESCE(published_at, now())
WHERE slug = 'hakol-beseder' AND status = 'draft';
