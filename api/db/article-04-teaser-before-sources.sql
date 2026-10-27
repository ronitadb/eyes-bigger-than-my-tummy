-- Article 4: the ״במאמר הבא״ box (and the seam above it) moves to before
-- the sources (Ronit, 2026-10-27). It was: … side notes, sources, seam,
-- teaser. Now: … side notes, seam, teaser, sources. Nothing else changes.
--
-- Only while the article still ends in sources, seam, teaser; otherwise
-- UPDATE 0.

UPDATE articles SET
  blocks = (
    SELECT jsonb_agg(e ORDER BY
      CASE WHEN o = n - 2 THEN n + 1 ELSE o END)   -- the sources go last
    FROM jsonb_array_elements(blocks) WITH ORDINALITY AS t(e, o),
         (SELECT jsonb_array_length(blocks) AS n) AS len
  ),
  updated_at = now()
WHERE id = 18 AND slug = 'article-04'
  AND blocks -> -3 ->> 'type' = 'sources'
  AND blocks -> -2 ->> 'type' = 'divider'
  AND blocks -> -1 ->> 'type' = 'fact';
