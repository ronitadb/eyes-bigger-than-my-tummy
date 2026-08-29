-- תבנית "עדכון לנרשמים" — הרצה חד־פעמית בקונסולת ה־SQL של Neon.
-- אחרי ההרצה היא תופיע ב־/admin/zoom ← תבניות אימייל, וניתן יהיה לערוך אותה שם.
--
-- בטוח להרצה חוזרת: אם התבנית כבר קיימת, הנוסח יתעדכן לזה שכאן.
-- שימי לב: אם כבר ערכת את הנוסח ב־CMS, הרצה נוספת תדרוס את העריכה שלך.
--
-- הערה על {{first_name}}: המשתנה קיים מרגע שהורצה migrate-first-name.sql.
-- לפני כן הוא ייפול אוטומטית לשם המלא, בלי לשבור דבר.

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
