-- מערכת האימיילים: אימייל חדש לפי סוג
--
-- Every email is now written fresh from one of four types — first reminder,
-- short second reminder, article, free letter. Ronit fills two or three
-- fields; the screen assembles the rest (greeting, boxes, meeting details,
-- the list of earlier articles, signature) into the body, which is stored and
-- sent exactly like any letter.
--
--   kind   which of the four it is (reminder1 / reminder2 / article / free)
--   fields what she typed, so the email reopens as the form she filled in
--
-- Reminders are no longer one row per type: each meeting gets its own. Only
-- the join confirmation stays one of a kind — api/join.js looks it up by type
-- when someone registers, and it is the one email that goes out by itself.
--
-- Safe to run more than once.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS fields JSONB;

DROP INDEX IF EXISTS email_templates_auto_type_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_join_uniq
  ON email_templates (template_type)
  WHERE template_type = 'join_confirmation';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'email_templates' AND column_name IN ('kind', 'fields');
