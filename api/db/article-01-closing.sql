-- The closing reflection for מאמר 1, appended to the paragraph that ends
-- 'לכל אדם דרכיו.' — just before the divider and גידי's vignette.
--
-- Targeted by content rather than by position: it finds the block by how it
-- ends and appends to that one, so nothing else in the article is rewritten and
-- any edit made in the CMS meanwhile survives.

WITH target AS (
  SELECT a.id AS aid, (t.idx - 1) AS pos
  FROM articles a,
       LATERAL jsonb_array_elements(a.blocks) WITH ORDINALITY AS t(block, idx)
  WHERE a.slug = 'article-01'
    AND t.block->>'type' = 'text'
    AND rtrim(t.block->>'body') LIKE '%לכל אדם דרכיו.'
  LIMIT 1
)
UPDATE articles a
SET blocks = jsonb_set(
      a.blocks,
      ARRAY[target.pos::text, 'body'],
      to_jsonb(rtrim(a.blocks -> target.pos ->> 'body') || E'\n\n' || $add$לא נכון יהיה לומר שבית הילדים העביר מסר חד-ממדי של ביטול צרכים אישיים. היו מטפלות שידעו לעצור, היו רגעים שבהם ילד נראה ונענה, ויש מי שזוכר ידיים חמות ולילה שבו מטפלת נשארה לצידו. כמו בדברים רבים בחיים, זו היתה תערובת. כל ילד חווה את אותה מציאות והתמודד איתה בדרכו שלו. הטענה שלי אינה על כל רגע ואינה על כל ילד. הטענה שלי מבקשת להוסיף למשוואה משתנה - מקומו של הצורך הפרטי בחברה שקידשה את הקולקטיב.

האם ספגנו מראשית ילדותנו ש׳אני צריך׳, ׳אני רוצה׳ כפופים למה שמתאפשר בקבוצה באותו רגע?
האם קלטנו עם ובלי מילים שאנחנו ילדים טובים כשאיננו עומדים בדרכם של צרכי הקולקטיב?
והחדווה — שלהם מאיתנו, ושלנו מעצמנו — על היכולת להתאים את עצמנו לקבוצה: האם היא נטועה בנו גם היום?$add$)
    ),
    updated_at = now()
FROM target
WHERE a.id = target.aid;

SELECT jsonb_array_length(blocks) AS blocks,
       right(blocks -> (
         SELECT (t.idx - 1)::int FROM jsonb_array_elements(blocks) WITH ORDINALITY AS t(b, idx)
         WHERE b->>'type' = 'text' AND b->>'body' LIKE '%נטועה בנו גם היום?' LIMIT 1
       ) ->> 'body', 60) AS ends_with
FROM articles WHERE slug = 'article-01';
