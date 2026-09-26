-- Image credits: "פיקיוויקי" → "PikiWiki", the collection's own spelling.
-- Three credits: one in article 1, two in article 2. The word appears nowhere
-- else in these rows, so a text replace over the blocks is exact.

UPDATE articles SET
  blocks = replace(blocks::text, 'פיקיוויקי', 'PikiWiki')::jsonb,
  updated_at = now()
WHERE id IN (1, 2) AND blocks::text LIKE '%פיקיוויקי%';
