-- Keep-in-touch letters, kept rather than overwritten.
--
-- template_type was UNIQUE, so there could only ever be one 'update' and each
-- new letter destroyed the last. The automatic emails — join_confirmation,
-- the two reminders, meeting_followup — genuinely must stay unique, because
-- api/join.js and api/reminders.js look them up by type and take the first row.
--
-- So the uniqueness is kept for those and lifted only for 'update', using a
-- partial index. The cron cannot become ambiguous; the letters can multiply.

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_template_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_auto_type_uniq
  ON email_templates (template_type)
  WHERE template_type <> 'update';

-- Name the letter that already exists, so it is not left blank in the list.
UPDATE email_templates
SET name = 'הכתבה ב״זמן קיבוץ״ — ספטמבר 2026'
WHERE template_type = 'update' AND (name IS NULL OR name = '');

-- Which letter a log row belongs to, so the send history can name it rather
-- than showing every letter as 'עדכון לנרשמים'.
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS template_id INTEGER
  REFERENCES email_templates(id) ON DELETE SET NULL;

SELECT id, template_type, name, archived, updated_at
FROM email_templates ORDER BY template_type, updated_at DESC;
