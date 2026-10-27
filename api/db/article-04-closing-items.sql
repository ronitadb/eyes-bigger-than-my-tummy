-- Article 4, the closing (Ronit, 2026-10-27): the sentence that opens it,
-- ״ליצור עבור עצמנו את סף הדלת … ולדעת שמותר:״, leaves the band and ends the
-- paragraph before it; the band holds the four lines as items, each on the
-- green diamond of the parallel lines (like the four conditions earlier).
-- No word changes. Needs the deploy that teaches the band its items.
--
-- Run after article-04-gidi-vignette.sql: it expects the paragraph
-- ״גם אם לא זכינו…״ as its own block, which that file made. Touches those two
-- blocks only; if either is not exactly as expected, UPDATE 0.

UPDATE articles SET
  blocks = (
    SELECT jsonb_agg(
      CASE WHEN e = $ot${"type": "text", "body": "גם אם לא זכינו לתלות מיטיבה בילדותנו, את המשקולת, את העוגן, את האמון בַּטּוֹב – אפשר לגדל. להעז ולבקש עזרה. לומר ״אני צריך״ ולהרגיש טוב עם עצמנו. אנחנו לא ״מקטרים״, לא ״מתמסכנים״, לא ״נופלים״ על מי שהציע לנו כתף."}$ot$::jsonb THEN $nt${"type": "text", "body": "גם אם לא זכינו לתלות מיטיבה בילדותנו, את המשקולת, את העוגן, את האמון בַּטּוֹב – אפשר לגדל. להעז ולבקש עזרה. לומר ״אני צריך״ ולהרגיש טוב עם עצמנו. אנחנו לא ״מקטרים״, לא ״מתמסכנים״, לא ״נופלים״ על מי שהציע לנו כתף.\n\nליצור עבור עצמנו את סף הדלת, לחלוץ את הנעליים מחוץ ל״ביתנו״, ושם – לבטא פגיעות, חולשה, אי-ידיעה, חוסר-אונים, ולדעת שמותר:"}$nt$::jsonb
           WHEN e = $ob${"type": "keyline", "style": "band", "body": "ליצור עבור עצמנו את סף הדלת, לחלוץ את הנעליים מחוץ ל״ביתנו״, ושם – לבטא פגיעות, חולשה, אי-ידיעה, חוסר-אונים, ולדעת שמותר:\nשיש את המישהו-שלנו שיבוא\n\nשלהזדקקות שלנו לא יהיה מחיר נגדנו\n\nשגם גדולים ממשיכים להזדקק וכך אמור להיות\n\nשכאן, בפרטיות שמעבר לסף דלתנו, שהוא המעגל הקרוב של אוהבינו, ההזדקקות מקבלת את הכבוד הראוי לה"}$ob$::jsonb THEN $nb${"type": "keyline", "style": "band", "body": "", "items": ["שיש את המישהו-שלנו שיבוא", "שלהזדקקות שלנו לא יהיה מחיר נגדנו", "שגם גדולים ממשיכים להזדקק וכך אמור להיות", "שכאן, בפרטיות שמעבר לסף דלתנו, שהוא המעגל הקרוב של אוהבינו, ההזדקקות מקבלת את הכבוד הראוי לה"]}$nb$::jsonb
           ELSE e END
      ORDER BY o)
    FROM jsonb_array_elements(blocks) WITH ORDINALITY AS t(e, o)
  ),
  updated_at = now()
WHERE id = 18 AND slug = 'article-04'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(blocks) e WHERE e = $ot${"type": "text", "body": "גם אם לא זכינו לתלות מיטיבה בילדותנו, את המשקולת, את העוגן, את האמון בַּטּוֹב – אפשר לגדל. להעז ולבקש עזרה. לומר ״אני צריך״ ולהרגיש טוב עם עצמנו. אנחנו לא ״מקטרים״, לא ״מתמסכנים״, לא ״נופלים״ על מי שהציע לנו כתף."}$ot$::jsonb)
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(blocks) e WHERE e = $ob${"type": "keyline", "style": "band", "body": "ליצור עבור עצמנו את סף הדלת, לחלוץ את הנעליים מחוץ ל״ביתנו״, ושם – לבטא פגיעות, חולשה, אי-ידיעה, חוסר-אונים, ולדעת שמותר:\nשיש את המישהו-שלנו שיבוא\n\nשלהזדקקות שלנו לא יהיה מחיר נגדנו\n\nשגם גדולים ממשיכים להזדקק וכך אמור להיות\n\nשכאן, בפרטיות שמעבר לסף דלתנו, שהוא המעגל הקרוב של אוהבינו, ההזדקקות מקבלת את הכבוד הראוי לה"}$ob$::jsonb);
