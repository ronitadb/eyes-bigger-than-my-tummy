-- היסטוריית שליחות גם לכתובות שלא נרשמו
--
-- The send window can now mail people who never registered (typed-in
-- addresses). They have no row in zoom_participants, so their sends are
-- recorded by address instead. Until this runs, those emails still go out —
-- they just don't appear in היסטוריית שליחות.
--
-- Safe to run more than once.

ALTER TABLE email_logs ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_email TEXT;
