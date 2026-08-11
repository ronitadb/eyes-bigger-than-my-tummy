-- Split the reminder into two wordings. Run once in the Neon SQL console.
-- The first reminder keeps template_type 'meeting_reminder' (sent ~5 days before).
-- This adds the day-before reminder that api/reminders.js uses for the 1-day
-- lead time. Meeting details (title/date/time/Zoom link) are injected automatically.
-- Safe to run more than once.

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_reminder_1d',
  'נתראה מחר — {{title}}',
  'שלום {{name}},

עוד תזכורת קטנה — המפגש שלנו מתקיים מחר:

הקישור לזום מופיע למעלה, ואפשר פשוט להצטרף בזמן. אין צורך להתכונן — אפשר להגיע כמו שאתם.

נתראה מחר,
רונית'
) ON CONFLICT (template_type) DO NOTHING;
