-- Run this in the Neon SQL console (Vercel Dashboard → Storage → your DB → SQL Editor)
-- This creates all tables and seeds default email templates.

CREATE TABLE IF NOT EXISTS zoom_participants (
  id                        SERIAL PRIMARY KEY,
  name                      TEXT NOT NULL,
  email                     TEXT NOT NULL UNIQUE,
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','unsubscribed')),
  joined_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at           TIMESTAMPTZ,
  last_confirmation_sent_at TIMESTAMPTZ,
  notes                     TEXT
);

CREATE TABLE IF NOT EXISTS zoom_meetings (
  id                SERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  meeting_date      DATE NOT NULL,
  meeting_time      TIME NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  zoom_link         TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','open','closed','completed')),
  related_materials TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id              SERIAL PRIMARY KEY,
  template_type   TEXT NOT NULL UNIQUE,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id              SERIAL PRIMARY KEY,
  participant_id  INTEGER NOT NULL REFERENCES zoom_participants(id),
  meeting_id      INTEGER REFERENCES zoom_meetings(id),
  email_type      TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'sent',
  error           TEXT
);

-- Seed default email templates with plain text bodies (skip if already exist)
-- The system wraps these in styled HTML automatically when sending.

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'join_confirmation',
  'ברוכים הבאים למפגשי הזום — עיניים גדולות זה לא טוב',
  'שלום {{name}},

תודה שהצטרפת לרשימת מפגשי הזום. שמחה שאת/ה איתנו.

נעדכן אותך לקראת כל מפגש עם פרטים, נושא וקישור.

בחום,
רונית'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_reminder',
  'מפגש זום בקרוב — {{title}}',
  'שלום {{name}},

תזכורת קטנה — המפגש הבא שלנו מתקרב.

נתראה,
רונית'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_followup',
  'אחרי המפגש — {{title}}',
  'שלום {{name}},

תודה למי שהיה איתנו במפגש ״{{title}}״.

בחום,
רונית'
) ON CONFLICT (template_type) DO NOTHING;
