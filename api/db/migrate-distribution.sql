-- Distribution & Outreach network — run this in the Neon SQL console
-- (console.neon.tech -> your project -> SQL Editor), paste the whole file, Run.
-- Safe to run more than once: everything is IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- Design rule: PERMANENT contact data (contacts, tags) is kept separate from
-- PER-CAMPAIGN outreach state (campaign_contacts). The same coordinator can be
-- "shared" in the Zoom campaign and "not contacted" for a future lecture,
-- without ever overwriting the contact record.
--
-- Enum-ish columns deliberately have NO CHECK constraint (record_type, category,
-- country, preferred_method, campaign_contacts.status, outreach_activities.type)
-- so the taxonomy can grow from the UI without a migration.

-- ---------------------------------------------------------------- permanent --

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
SELECT 'בואו נחזור לביתילדים — סדרת זום 2026',
       'הפצת העלון לסדרת מפגשי הזום: מפגשים להורים, מפגשים לילדי הקיבוץ ומפגשים משותפים בין־דוריים.',
       'ועדות תרבות, מנהלי קהילה, עלונים, קבוצות פייסבוק ווואטסאפ, ארגונים וקהילות ישראליות בחו״ל',
       'https://www.beityeladim.co.il',
       'עלון סדרת הזום',
       'active'
WHERE NOT EXISTS (SELECT 1 FROM campaigns WHERE name = 'בואו נחזור לביתילדים — סדרת זום 2026');

INSERT INTO outreach_templates (name, type, body)
SELECT 'ועדת תרבות / מנהל קהילה בקיבוץ', 'kibbutz',
'שלום {{name}},

שמי רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים.
לאחרונה יצא לאור ספרי "עיניים גדולות זה לא טוב" (הוצאת מטר), שעוסק בילדוּת בלינה המשותפת ובמה שהיא הותירה בנו.

בהמשך לספר אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתילדים" — מפגשים להורים, מפגשים לילדי הקיבוץ, ומפגשים משותפים בין־דוריים. ההשתתפות פתוחה ואינה כרוכה בתשלום.

חשבתי שאולי הנושא רלוונטי לחברי הקיבוץ אצלכם, ואשמח אם תוכלו להעביר את המידע — בעלון, בקבוצת הוואטסאפ הקהילתית או בכל דרך שנוחה לכם. מצורף עלון מוכן להפצה.

כל הפרטים וההרשמה: https://www.beityeladim.co.il

בתודה ובברכה,
רונית אדיב'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'ועדת תרבות / מנהל קהילה בקיבוץ');

INSERT INTO outreach_templates (name, type, body)
SELECT 'אדמין קבוצת פייסבוק — בקשת אישור', 'facebook',
'שלום {{name}},

רציתי לבקש אישור לפרסם בקבוצה פוסט קצר.

שמי רונית אדיב, פסיכולוגית קלינית ובת קיבוץ זיקים. כתבתי את הספר "עיניים גדולות זה לא טוב" (הוצאת מטר), על הילדוּת בלינה המשותפת, ובעקבותיו אני מקיימת סדרת מפגשי זום פתוחים — "בואו נחזור לביתילדים" — להורים, לילדי הקיבוץ, ומפגשים משותפים בין־דוריים.

אין כאן שום דבר מסחרי: ההשתתפות ללא תשלום, ונדמה לי שזה נושא שנוגע ללא מעט מחברי הקבוצה.

אם מתאים — אשמח לפרסם, ואשמח כמובן להתאים את הנוסח לכללי הקבוצה.

כל הפרטים: https://www.beityeladim.co.il

תודה,
רונית'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'אדמין קבוצת פייסבוק — בקשת אישור');

INSERT INTO outreach_templates (name, type, body)
SELECT 'וואטסאפ — טקסט קצר להעברה', 'whatsapp',
'🌿 "בואו נחזור לביתילדים" — סדרת מפגשי זום

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

אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתילדים", ופונה אליכם מתוך מחשבה שבקהילה שלכם יש כנראה לא מעט אנשים שגדלו בקיבוץ. גם אחרי שנים רבות הרחק מהבית השאלות האלה נשארות, ולפעמים דווקא המרחק מאפשר לחזור אליהן.

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

בהמשך לספר אני מקיימת סדרת מפגשי זום בשם "בואו נחזור לביתילדים", הכוללת מפגשים להורים, מפגשים לילדי הקיבוץ ומפגשים משותפים בין־דוריים. המפגשים פתוחים ואינם כרוכים בתשלום.

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

כזכור, יצא הספר שלי "עיניים גדולות זה לא טוב", ובעקבותיו אני מקיימת סדרת מפגשי זום — "בואו נחזור לביתילדים". מפגשים להורים, מפגשים לילדי הקיבוץ, ומפגשים משותפים בין־דוריים.

אני בונה את זה לאט, דרך אנשים ולא דרך פרסום, ולכן פניתי אלייך: אם עולה בדעתך מישהו, קבוצה או קהילה שזה עשוי לגעת בהם — אשמח מאוד אם תעבירי הלאה. מצורף עלון.

וכמובן, אשמח לראות שם גם אותך.

באהבה,
רונית'
WHERE NOT EXISTS (SELECT 1 FROM outreach_templates WHERE name = 'פנייה אישית למקשר/ת');
