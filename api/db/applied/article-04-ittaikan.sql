-- Article 4: ״תחושת אחדות״ gets its seal (Ronit, 2026-10-27, option ב).
-- The entry is built like the others in its box: characters 一体感 in the
-- seal, the Japanese name אִיטַּאִיקָן, and the translation opening the
-- explanation, as ״לאפשר אמאה״ does for אָמָאֶסָסֶרוּ.
-- Touches that one entry only (block 8, item 0), and only while it is
-- still exactly as seed-article-04.sql wrote it; otherwise UPDATE 0.

UPDATE articles SET
  blocks = jsonb_set(blocks, '{8,items,0}', $j${"seal": "一体感", "name": "אִיטַּאִיקָן", "body": "״תחושת אחדות״. כך תיאר הפסיכיאטר טאקאו דואי את חוויית התינוק עם אמו. האמאה, לפי דואי, היא הגעגוע לחזור אליה."}$j$::jsonb),
  updated_at = now()
WHERE id = 18 AND slug = 'article-04'
  AND blocks #> '{8,items,0}' = $j${"seal": "", "name": "תחושת אחדות", "body": "כך תיאר הפסיכיאטר טאקאו דואי את חוויית התינוק עם אמו. האמאה, לפי דואי, היא הגעגוע לחזור אליה."}$j$::jsonb;
