-- The זמן קיבוץ article, at the head of the library.
--
-- sort_order 0 puts it before article 1. It is 'published' rather than
-- 'planned' because it exists and can be read now, and external_url sends the
-- card to the designed PDF rather than to a library page it does not have.

INSERT INTO articles (slug, title_lead, title_topic, summary, sort_order, status, external_url,
                      external_pubs, published_at)
VALUES (
  'zman-kibbutz',
  'לחזור לביתלדים',
  'הכתבה שפורסמה במגזין ״זמן קיבוץ״',
  'איך התהוותה ההחלטה לפתוח את מפגשי הזום, ומה עומד מאחורי ההזמנה להתבונן מחדש בילדות הקיבוצית.',
  0, 'published', '/maamar.pdf',
  '[{"name":"זמן קיבוץ","url":"https://zman-kibbutz.co.il/magazine/22983/","date":"אוגוסט 2026"}]'::jsonb,
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title_lead   = EXCLUDED.title_lead,
  title_topic  = EXCLUDED.title_topic,
  summary      = EXCLUDED.summary,
  sort_order   = EXCLUDED.sort_order,
  status       = EXCLUDED.status,
  external_url = EXCLUDED.external_url,
  updated_at   = now();
