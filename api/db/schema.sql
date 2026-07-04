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

-- Seed default email templates (skip if already exist)

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'join_confirmation',
  'ברוכים הבאים למפגשי הזום — עיניים גדולות זה לא טוב',
  '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px;">עיניים גדולות זה לא טוב</div>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px;">שלום {{name}},</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">תודה שהצטרפת לרשימת מפגשי הזום. שמחה שאת/ה איתנו.</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">נעדכן אותך לקראת כל מפגש עם פרטים, נושא וקישור.</p>
    <p style="font-size: 15px; line-height: 1.7; color: #6E7C78; margin: 0;">בחום,<br>רונית</p>
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(34,48,47,.12); font-size: 13px; color: #8A9692;">
      <a href="{{unsubscribe_url}}" style="color: #8A9692;">להסרה מרשימת התפוצה</a>
    </div>
  </div>
</body>
</html>'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_reminder',
  'מפגש זום בקרוב — {{title}}',
  '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px;">עיניים גדולות זה לא טוב</div>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px;">שלום {{name}},</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">תזכורת קטנה — המפגש הבא שלנו מתקרב.</p>
    <div style="background: #EEF3EF; border: 1px solid rgba(34,48,47,.12); border-radius: 4px; padding: 24px; margin-bottom: 24px;">
      <div style="font-weight: 700; font-size: 18px; color: #2F5248; margin-bottom: 14px;">{{title}}</div>
      <div style="font-size: 16px; line-height: 1.7; color: #3A4744;">
        <div>📅 {{date}}</div>
        <div>🕐 {{time}}</div>
        {{zoom_link_html}}
      </div>
      {{description_html}}
      {{materials_html}}
    </div>
    <p style="font-size: 15px; line-height: 1.7; color: #6E7C78; margin: 0;">נתראה,<br>רונית</p>
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(34,48,47,.12); font-size: 13px; color: #8A9692;">
      <a href="{{unsubscribe_url}}" style="color: #8A9692;">להסרה מרשימת התפוצה</a>
    </div>
  </div>
</body>
</html>'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_followup',
  'אחרי המפגש — {{title}}',
  '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px;">עיניים גדולות זה לא טוב</div>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px;">שלום {{name}},</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">תודה למי שהיה איתנו במפגש ״{{title}}״.</p>
    {{materials_html}}
    <p style="font-size: 15px; line-height: 1.7; color: #6E7C78; margin: 0;">בחום,<br>רונית</p>
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(34,48,47,.12); font-size: 13px; color: #8A9692;">
      <a href="{{unsubscribe_url}}" style="color: #8A9692;">להסרה מרשימת התפוצה</a>
    </div>
  </div>
</body>
</html>'
) ON CONFLICT (template_type) DO NOTHING;
