-- A new article 3 enters the series; the planned articles 3–14 move one place
-- down, slugs and order both: article-03 → article-04 … article-14 → article-15.
-- Safe now because none of them is published, so no one holds their addresses.
--
-- After this runs, the older seed files that address rows by slug
-- (seed-article-card-*.sql, seed-cards-*.sql) point at the wrong articles.
-- Do not re-run them.
--
-- One transaction. Running it a second time changes nothing: step 1 finds no
-- rows once article-15 exists, and the INSERT then fails on the taken slug,
-- which rolls the whole thing back.

BEGIN;

-- 1. Out of the way first: slugs are unique, and shifting in place would
--    collide with the neighbour's slug mid-statement.
UPDATE articles SET slug = 'tmp-' || slug
WHERE id BETWEEN 3 AND 14
  AND slug ~ '^article-(0[3-9]|1[0-4])$'
  AND NOT EXISTS (SELECT 1 FROM articles WHERE slug = 'article-15');

-- 2. Each one place down, in slug and in order.
UPDATE articles SET
  slug = 'article-' || lpad((substring(slug from '^tmp-article-(\d+)$')::int + 1)::text, 2, '0'),
  sort_order = sort_order + 1,
  updated_at = now()
WHERE slug ~ '^tmp-article-\d+$';

-- 3. The new article 3.
INSERT INTO articles (slug, title_lead, title_topic, sort_order, status)
VALUES ('article-03',
        '״וְנַפְשׁוֹ קְשׁוּרָה בְנַפְשׁוֹ״',
        'האם בית הילדים יכול היה להיות מושא התקשרות (Attachment)?',
        3, 'planned');

COMMIT;
