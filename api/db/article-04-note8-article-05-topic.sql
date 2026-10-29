-- 1. Article 4, note 8: the working marker comes off (Ronit, 2026-10-29:
--    the secondary sources are enough).
UPDATE articles SET
  blocks = replace(blocks::text, $m$ **[Sroufe & Waters אומת ממקור משני; לאמת מול המאמר]**$m$, '')::jsonb,
  updated_at = now()
WHERE id = 18 AND slug = 'article-04'
  AND position($m$ **[Sroufe & Waters אומת ממקור משני; לאמת מול המאמר]**$m$ in blocks::text) > 0;

-- 2. Article 5's topic line, as in article 4's teaser (Ronit, 2026-10-29).
UPDATE articles SET
  title_topic = 'על החוזה הלא כתוב בין היחיד לקבוצה',
  updated_at = now()
WHERE slug = 'article-05'
  AND title_topic = 'מה מעניקה קבוצה ליחיד, מה הוא נותן בתמורה, וכיצד נוצר האיזון בין שייכות לחופש';
