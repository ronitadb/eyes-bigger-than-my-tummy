-- שם פרטי לנרשמים — הרצה חד־פעמית בקונסולת ה־SQL של Neon.
--
-- הטופס הציבורי לא משתנה: הנרשם ממשיך להזין שם אחד. העמודה הזו נגזרת ממנו
-- אוטומטית, וניתנת לתיקון ידני ב־/admin/zoom ← משתתפים. שם פרטי אוטומטי לבד
-- נשבר על "אור לי" או "בת שבע", ולכן התיקון הידני הוא חלק מהתכנון ולא טלאי.
--
-- בטוח להרצה חוזרת.

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
