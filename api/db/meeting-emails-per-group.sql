-- מיילים על מפגש: נוסח נפרד לכל קבוצה
--
-- The reminders and the after-meeting message were one row per type, shared
-- by every group, because the cron looked them up by type. The cron is gone
-- (every email is sent by hand from the send window, which names the exact
-- row), so they can now multiply like letters: "תזכורת ראשונה — הורים" and
-- "תזכורת ראשונה — ילדים" side by side, each keeping its own words.
--
-- Only the join confirmation stays one of a kind: api/join.js still looks it
-- up by type, on its own, at the moment someone registers.
--
-- audience says which group an email was written for. In the send window it
-- decides who is ticked to begin with; it never sends to anyone by itself.
--
-- Safe to run more than once.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS audience TEXT;

DROP INDEX IF EXISTS email_templates_auto_type_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_join_uniq
  ON email_templates (template_type)
  WHERE template_type = 'join_confirmation';

-- The first reminder as it stands was written for the parents' group.
UPDATE email_templates
SET name = 'תזכורת ראשונה — הורים', audience = 'parents'
WHERE id = 2 AND template_type = 'meeting_reminder'
  AND (name IS NULL OR name = '');

SELECT id, template_type, name, audience
FROM email_templates
WHERE template_type <> 'update'
ORDER BY template_type, id;
