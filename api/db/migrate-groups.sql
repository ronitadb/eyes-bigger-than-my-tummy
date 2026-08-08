-- Group-aware sign-ups and emails. Run once against the Neon database.
-- Safe to run more than once.

-- 1) Which series each participant chose (parents / children) on the join form.
ALTER TABLE zoom_participants ADD COLUMN IF NOT EXISTS participant_type TEXT;

-- 2) Which audience each meeting is for. Reminders/follow-ups are sent only to
--    that group; 'all' sends to everyone.
ALTER TABLE zoom_meetings ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all';
