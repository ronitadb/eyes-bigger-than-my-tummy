-- Adds the "מי אני?" (who am I?) group to the join form.
-- Run once against the existing Neon database. Safe to run more than once.
ALTER TABLE zoom_participants ADD COLUMN IF NOT EXISTS participant_type TEXT;
