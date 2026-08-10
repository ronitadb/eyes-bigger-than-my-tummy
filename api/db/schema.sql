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
  participant_type          TEXT,
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
  audience          TEXT NOT NULL DEFAULT 'all'
                    CHECK (audience IN ('all','parents','children')),
  related_materials TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id            SERIAL PRIMARY KEY,
  sender        TEXT,
  email         TEXT,
  title         TEXT,
  body          TEXT,
  attribution   TEXT NOT NULL DEFAULT 'anonymous'
                CHECK (attribution IN ('full','first','anonymous')),
  consent       BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','published','hidden')),
  has_file      BOOLEAN NOT NULL DEFAULT false,
  file_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
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
  'ברוכים הבאים למפגשי הזום "בואו נחזור לביתלדים"',
  'שלום {{name}},

תודה שהצטרפת למחזור הראשון של מפגשי הזום "בואו נחזור לביתלדים".

המחזור כולל ארבעה מפגשים, שיתקיימו אחת לשבועיים. לקראת כל מפגש תקבלו תזכורת עם כל הפרטים וקישור לזום.

שמחה שתהיו איתנו.

להתראות,
רונית'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_reminder',
  'תזכורת: {{title}}',
  'שלום {{name}},

רציתי להזכיר שהמפגש הקרוב יתקיים:

אם צירפתי חומרי קריאה או צפייה לקראת המפגש, הם מופיעים כאן למטה.

אין צורך להתכונן במיוחד.

אפשר פשוט להגיע כמו שאתם.

נתראה בזום,
רונית'
) ON CONFLICT (template_type) DO NOTHING;

INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'meeting_followup',
  'תודה שהייתם איתנו',
  'שלום {{name}},

תודה שהצטרפתם למפגש.

מטבע הדברים, בשיחה של שעה אי אפשר להספיק לגעת בכל מה שהנושא מזמין לחשוב עליו. לכן ריכזתי באתר חומרי קריאה שממשיכים את השיחה ומרחיבים את הרעיונות שעלו במפגש.

נסיים כאן את המפגש, אבל לא את השיחה.

להמשך הקריאה באתר:
https://www.beityeladim.co.il

להתראות במפגש הבא,
רונית'
) ON CONFLICT (template_type) DO NOTHING;


-- =====================================================================
-- Distribution & Outreach network (also available standalone in
-- api/db/migrate-distribution.sql for an existing database).
-- =====================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  record_type         TEXT NOT NULL DEFAULT 'person',
  organisation        TEXT,
  kibbutz             TEXT,
  country             TEXT,
  city_region         TEXT,
  category            TEXT,
  subcategory_role    TEXT,
  gatekeeper_name     TEXT,
  gatekeeper_position TEXT,
  email               TEXT,
  phone               TEXT,
  whatsapp            TEXT,
  website             TEXT,
  facebook_url        TEXT,
  instagram_url       TEXT,
  other_url           TEXT,
  preferred_method    TEXT,
  relevance           TEXT,
  source              TEXT,
  source_url          TEXT,
  source_notes        TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_name_idx     ON contacts (lower(name));
CREATE INDEX IF NOT EXISTS contacts_category_idx ON contacts (category);
CREATE INDEX IF NOT EXISTS contacts_country_idx  ON contacts (country);
CREATE INDEX IF NOT EXISTS contacts_kibbutz_idx  ON contacts (kibbutz);
CREATE INDEX IF NOT EXISTS contacts_email_idx    ON contacts (lower(email));

CREATE TABLE IF NOT EXISTS tags (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS contact_tags_tag_idx ON contact_tags (tag_id);

-- ------------------------------------------------------------ per-campaign --

CREATE TABLE IF NOT EXISTS campaigns (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  start_date      DATE,
  end_date        DATE,
  target_audience TEXT,
  main_link       TEXT,
  flyer_ref       TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values in use (free to grow):
--   not_contacted, ready, contacted, follow_up_needed, replied,
--   agreed_to_share, shared, declined, no_response, not_relevant, do_not_contact
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id                  SERIAL PRIMARY KEY,
  campaign_id         INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id          INTEGER NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'not_contacted',
  next_follow_up_date DATE,
  notes               TEXT,
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS campaign_contacts_contact_idx  ON campaign_contacts (contact_id);
CREATE INDEX IF NOT EXISTS campaign_contacts_status_idx   ON campaign_contacts (campaign_id, status);
CREATE INDEX IF NOT EXISTS campaign_contacts_followup_idx ON campaign_contacts (next_follow_up_date);

-- Chronological history — never only the latest status.
CREATE TABLE IF NOT EXISTS outreach_activities (
  id                  SERIAL PRIMARY KEY,
  contact_id          INTEGER NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  campaign_id         INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  activity_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  type                TEXT,
  note                TEXT,
  next_follow_up_date DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_activities_contact_idx  ON outreach_activities (contact_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS outreach_activities_campaign_idx ON outreach_activities (campaign_id);

-- ----------------------------------------------------------------- support --

-- Copy-paste-and-customise outreach texts. Nothing here is ever sent automatically.
CREATE TABLE IF NOT EXISTS outreach_templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------- seeds --

INSERT INTO campaigns (name, description, target_audience, main_link, flyer_ref, status)
SELECT 'בואו נחזור לביתלדים — סדרת זום 2026',
       'הפצת העלון לסדרת מפגשי הזום: מפגשים להורים, מפגשים לילדי הקיבוץ ומפגשים משותפים בין־דוריים.',
       'ועדות תרבות, מנהלי קהילה, עלונים, קבוצות פייסבוק ווואטסאפ, ארגונים וקהילות ישראליות בחו״ל',
       'https://www.beityeladim.co.il',
       'עלון סדרת הזום',
       'active'
WHERE NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'בואו נחזור לביתלדים — סדרת זום 2026');

INSERT INTO outreach_templates (name, type, body)
SELECT 'ועדת תרבות / מנהל קהילה בקיבוץ', 'kibbutz',
'שלום {{name}},

שמי רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים.
לאחרונה יצא לאור ספרי "עיניים גדולות זה לא טוב" (הוצאת מטר), שעוסק בילדוּת בלינה המשותפת ובמה שהיא הותירה בנו.

בהמשך לספר אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתלדים" — מפגשים להורים, מפגשים לילדי הקיבוץ, ומפגשים משותפים בין־דוריים. ההשתתפות פתוחה ואינה כרוכה בתשלום.

חשבתי שאולי הנושא רלוונטי לחברי הקיבוץ אצלכם, ואשמח אם תוכלו להעביר את המידע — בעלון, בקבוצת הוואטסאפ הקהילתית או בכל דרך שנוחה לכם. מצורף עלון מוכן להפצה.

כל הפרטים וההרשמה: https://www.beityeladim.co.il

בתודה ובברכה,
רונית אדיב'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'ועדת תרבות / מנהל קהילה בקיבוץ');

INSERT INTO outreach_templates (name, type, body)
SELECT 'אדמין קבוצת פייסבוק — בקשת אישור', 'facebook',
'שלום {{name}},

רציתי לבקש אישור לפרסם בקבוצה פוסט קצר.

שמי רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים. כתבתי את הספר "עיניים גדולות זה לא טוב" (הוצאת מטר), על הילדוּת בלינה המשותפת, ובעקבותיו אני מקיימת סדרת מפגשי זום פתוחים — "בואו נחזור לביתלדים" — להורים, לילדי הקיבוץ, ומפגשים משותפים בין־דוריים.

אין כאן שום דבר מסחרי: ההשתתפות ללא תשלום, ונדמה לי שזה נושא שנוגע ללא מעט מחברי הקבוצה.

אם מתאים — אשמח לפרסם, ואשמח כמובן להתאים את הנוסח לכללי הקבוצה.

כל הפרטים: https://www.beityeladim.co.il

תודה,
רונית'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'אדמין קבוצת פייסבוק — בקשת אישור');

INSERT INTO outreach_templates (name, type, body)
SELECT 'וואטסאפ — טקסט קצר להעברה', 'whatsapp',
'🌿 "בואו נחזור לביתלדים" — סדרת מפגשי זום

רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים, מחברת הספר "עיניים גדולות זה לא טוב" (הוצאת מטר), מזמינה לסדרת מפגשים על הילדוּת בלינה המשותפת ועל מה שהיא הותירה בנו.

• מפגשים להורים
• מפגשים לילדי הקיבוץ
• מפגשים משותפים בין־דוריים

ההשתתפות ללא תשלום. אין צורך להתכונן — אפשר פשוט להגיע כמו שאתם.

פרטים והרשמה 👈 https://www.beityeladim.co.il

(מוזמנים להעביר הלאה למי שזה עשוי לגעת בו)'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'וואטסאפ — טקסט קצר להעברה');

INSERT INTO outreach_templates (name, type, body)
SELECT 'קהילה ישראלית בחו״ל', 'abroad',
'שלום {{name}},

שמי רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים, ומחברת הספר "עיניים גדולות זה לא טוב" (הוצאת מטר) — על הילדוּת בלינה המשותפת.

אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתלדים", ופונה אליכם מתוך מחשבה שבקהילה שלכם יש כנראה לא מעט אנשים שגדלו בקיבוץ. גם אחרי שנים רבות הרחק מהבית השאלות האלה נשארות, ולפעמים דווקא המרחק מאפשר לחזור אליהן.

חשוב לציין: המפגשים מתקיימים בעברית ובזום, כך שאפשר להשתתף מכל מקום בעולם.

אשמח מאוד אם תוכלו להעביר את המידע לחברי הקהילה — בניוזלטר, בקבוצה או בכל דרך שנוחה לכם. מצורף עלון מוכן להפצה.

פרטים והרשמה: https://www.beityeladim.co.il

בתודה,
רונית אדיב'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'קהילה ישראלית בחו״ל');

INSERT INTO outreach_templates (name, type, body)
SELECT 'ארגון או מוסד — נוסח פורמלי', 'organisation',
'לכבוד {{name}},

שמי רונית אדיב, פסיכולוגית קלינית, בת קיבוץ זיקים, ומחברת הספר "עיניים גדולות זה לא טוב" בהוצאת מטר, העוסק בילדוּת בלינה המשותפת ובהשלכותיה לאורך החיים.

בהמשך לספר אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתלדים", הכוללת מפגשים להורים, מפגשים לילדי הקיבוץ ומפגשים משותפים בין־דוריים. המפגשים פתוחים ואינם כרוכים בתשלום.

אני פונה אליכם בהנחה שהנושא עשוי להיות רלוונטי לציבור שאתם עומדים אתו בקשר, ואשמח לבחון יחד דרך מתאימה להביא את המידע לידיעתו — בערוצי המידע שלכם או בכל אופן אחר שתמצאו לנכון.

אשמח לעמוד לרשותכם לכל שאלה או הבהרה.

פרטים מלאים: https://www.beityeladim.co.il

בברכה,
רונית אדיב
פסיכולוגית קלינית'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'ארגון או מוסד — נוסח פורמלי');

INSERT INTO outreach_templates (name, type, body)
SELECT 'פנייה אישית למקשר/ת', 'personal',
'{{name}} יקר/ה,

חשבתי עלייך.

כזכור, יצא הספר שלי "עיניים גדולות זה לא טוב", ובעקבותיו אני מקיימת סדרת מפגשי זום — "בואו נחזור לביתלדים". מפגשים להורים, מפגשים לילדי הקיבוץ, ומפגשים משותפים בין־דוריים.

אני בונה את זה לאט, דרך אנשים ולא דרך פרסום, ולכן פניתי אלייך: אם עולה בדעתך מישהו, קבוצה או קהילה שזה עשוי לגעת בהם — אשמח מאוד אם תעבירי הלאה. מצורף עלון.

וכמובן, אשמח לראות שם גם אותך.

באהבה,
רונית'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'פנייה אישית למקשר/ת');
