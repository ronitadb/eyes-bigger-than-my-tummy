-- The series' new order (Ronit, 2026-10-27):
--   5 ״לא טוב היות האדם לבדו״        (was 6)
--   6 ״יוסי, ילד שלי מוצלח!״          (was 7)
--   7 ״המלבין פני חברו ברבים…״       (was 8)
--   8 ״אני כאן! א-נ-י כאן!!״          (was 5)
--   9 ״רואים לי. כל הזמן״             (stays)
-- Slug and order move together, by row id, and only while each row is still
-- where this file expects it (slug, title, unpublished). If any one is not,
-- nothing changes: the check at the end raises and the transaction rolls back.
-- Titles and topic lines are not touched.
--
-- Older seeds that address rows by slug now point at the wrong articles. Do
-- not re-run them, nor insert-article-04.sql, nor this file.

BEGIN;

-- 1. Out of the way first: slugs are unique.
UPDATE articles SET slug = 'tmp-' || slug
WHERE (id, slug) IN ((3,'article-05'), (4,'article-06'), (5,'article-07'), (6,'article-08'))
  AND published_at IS NULL;

-- 2. Into their new places.
UPDATE articles SET slug = 'article-05', sort_order = 5, updated_at = now()
  WHERE id = 4 AND slug = 'tmp-article-06' AND title_lead = '״לא טוב היות האדם לבדו״';
UPDATE articles SET slug = 'article-06', sort_order = 6, updated_at = now()
  WHERE id = 5 AND slug = 'tmp-article-07' AND title_lead = '״יוסי, ילד שלי מוצלח!״';
UPDATE articles SET slug = 'article-07', sort_order = 7, updated_at = now()
  WHERE id = 6 AND slug = 'tmp-article-08' AND title_lead = '״המלבין פני חברו ברבים כאילו שופך דמים״';
UPDATE articles SET slug = 'article-08', sort_order = 8, updated_at = now()
  WHERE id = 3 AND slug = 'tmp-article-05' AND title_lead = '״אני כאן! א-נ-י כאן!!״';

-- 3. All four landed, or none: anything still 'tmp-' undoes the lot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM articles WHERE slug LIKE 'tmp-%')
     OR (SELECT count(*) FROM articles
         WHERE (id, slug, sort_order) IN ((4,'article-05',5), (5,'article-06',6), (6,'article-07',7), (3,'article-08',8), (7,'article-09',9))) <> 5
  THEN
    RAISE EXCEPTION 'renumber did not match what was expected; nothing changed';
  END IF;
END $$;

COMMIT;

-- To see the result:
-- SELECT id, slug, sort_order, title_lead FROM articles WHERE sort_order BETWEEN 4 AND 9 ORDER BY sort_order;
