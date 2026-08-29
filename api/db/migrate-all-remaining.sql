-- ============================================================
--  שתי המיגרציות שנותרו — הדבקה אחת בקונסולת ה־SQL של Neon
--  (console.neon.tech ← הפרויקט ← SQL Editor ← הדבקה ← Run)
--
--  1. עמודת שם פרטי לנרשמים, כולל מילוי אוטומטי לקיימים
--  2. תבנית המייל החמישית — "עדכון לנרשמים"
--
--  בטוח להרצה חוזרת. שימי לב: אם כבר ערכת את נוסח התבנית
--  ב-CMS, הרצה נוספת תדרוס את העריכה שלך.
-- ============================================================


-- ---------- 1 מתוך 2 : שם פרטי ----------
ALTER TABLE zoom_participants ADD COLUMN IF NOT EXISTS first_name TEXT;

-- מילוי ראשוני: המילה הראשונה בשם, לכל מי שכבר רשום.
UPDATE zoom_participants
   SET first_name = split_part(btrim(name), ' ', 1)
 WHERE first_name IS NULL
   AND btrim(coalesce(name, '')) <> '';

-- בדיקה: מה יוצג במיילים לכל נרשם
SELECT name AS "השם שנרשם", first_name AS "מה שיופיע במייל"
FROM zoom_participants
ORDER BY joined_at DESC;


-- ---------- 2 מתוך 2 : תבנית "עדכון לנרשמים" ----------
INSERT INTO email_templates (template_type, subject, body)
VALUES (
  'update',
  'כתבה חדשה, ומשהו לקראת המפגשים',
  'שלום {{first_name}},

לפני כמה ימים התפרסמה במגזין "זמן קיבוץ" כתבה שכתבתי, על בית הילדים ועל מכבש ההסתגלות.

היא מספרת איך הגעתי לכאן. מהמעון שהקמנו ב-2003, דרך שנים של עבודה, דרך מחלה וכתיבה, ועד ההחלטה לפתוח את המפגשים האלה.

חשבתי עליכם כשהיא יצאה. נרשמתם, ועוד לא נפגשנו, ורציתי שתכירו קצת יותר את מה שעומד מאחורי ההזמנה.

[לקריאת הכתבה — קובץ להורדה ולשמירה](https://www.beityeladim.co.il/maamar.pdf)

[ולקריאה באתר המגזין](https://zman-kibbutz.co.il/magazine/22983/)

נתראה בנובמבר,
רונית'
)
ON CONFLICT (template_type) DO UPDATE
SET subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    updated_at = now();

-- בדיקה: אמורה להחזיר שורה אחת, ושני הקישורים בתוכה
SELECT template_type,
       subject,
       (body LIKE '%maamar.pdf%')      AS "קישור לקובץ",
       (body LIKE '%zman-kibbutz%')    AS "קישור למגזין"
FROM email_templates WHERE template_type = 'update';
