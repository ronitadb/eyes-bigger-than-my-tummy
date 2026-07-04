-- Run this in the Neon SQL console (Vercel Dashboard → Storage → your DB → SQL Editor)

CREATE TABLE IF NOT EXISTS meetings (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  meeting_date  DATE NOT NULL,
  meeting_time  TIME NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  zoom_link     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','open','closed','completed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrations (
  id                   SERIAL PRIMARY KEY,
  meeting_id           INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  registered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_sent_at TIMESTAMPTZ,
  reminder_sent_at     TIMESTAMPTZ,
  notes                TEXT,
  UNIQUE (meeting_id, email)
);
