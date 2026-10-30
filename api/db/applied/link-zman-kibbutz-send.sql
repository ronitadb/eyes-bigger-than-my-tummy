-- הכתבה ב״זמן קיבוץ״ נשלחה ב-1.9.2026 ל-46 נרשמים, לפני שההיסטוריה שמרה
-- איזה מכתב יצא. 46 השורות האלה רשומות בלי template_id, ולכן לשונית
-- האימיילים הציגה את הכתבה (id 5) כטיוטה. השורות מקושרות כאן אליה.
--
-- Only the 1.9 update rows with no template are touched. Safe to run more
-- than once.

UPDATE email_logs
SET template_id = 5
WHERE template_id IS NULL
  AND email_type = 'update'
  AND sent_at::date = '2026-09-01';

SELECT template_id, count(*) FROM email_logs
WHERE email_type = 'update' AND sent_at::date = '2026-09-01'
GROUP BY template_id;
