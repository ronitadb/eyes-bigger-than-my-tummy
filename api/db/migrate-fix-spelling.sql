-- Spelling fix: ביתילדים  ->  ביתלדים
--
-- The site pages, the join flow and the email wrapper always used ביתלדים.
-- The SQL seed files used ביתילדים, so the wrong spelling reached the database
-- in the campaign name, the seeded email templates (including a live subject
-- line sent to registrants) and the outreach templates. The seed files are now
-- corrected; this script fixes the rows already stored.
--
-- Run once in the Neon SQL console. Safe to run more than once — each statement
-- only touches rows that still contain the old spelling, so a second run is a
-- no-op. It rewrites nothing else in those columns.

UPDATE campaigns SET name = replace(name, 'ביתילדים', 'ביתלדים')
  WHERE name LIKE '%ביתילדים%';
UPDATE campaigns SET description = replace(description, 'ביתילדים', 'ביתלדים')
  WHERE description LIKE '%ביתילדים%';
UPDATE campaigns SET target_audience = replace(target_audience, 'ביתילדים', 'ביתלדים')
  WHERE target_audience LIKE '%ביתילדים%';
UPDATE campaigns SET notes = replace(notes, 'ביתילדים', 'ביתלדים')
  WHERE notes LIKE '%ביתילדים%';

UPDATE outreach_templates SET name = replace(name, 'ביתילדים', 'ביתלדים')
  WHERE name LIKE '%ביתילדים%';
UPDATE outreach_templates SET body = replace(body, 'ביתילדים', 'ביתלדים')
  WHERE body LIKE '%ביתילדים%';

UPDATE email_templates SET subject = replace(subject, 'ביתילדים', 'ביתלדים')
  WHERE subject LIKE '%ביתילדים%';
UPDATE email_templates SET body = replace(body, 'ביתילדים', 'ביתלדים')
  WHERE body LIKE '%ביתילדים%';

UPDATE zoom_meetings SET title = replace(title, 'ביתילדים', 'ביתלדים')
  WHERE title LIKE '%ביתילדים%';
UPDATE zoom_meetings SET description = replace(description, 'ביתילדים', 'ביתלדים')
  WHERE description LIKE '%ביתילדים%';

UPDATE page_content SET content = replace(content, 'ביתילדים', 'ביתלדים')
  WHERE content LIKE '%ביתילדים%';

-- Check: this should return no rows once the fix has run.
SELECT 'campaigns' AS table_name, name AS remaining FROM campaigns WHERE name LIKE '%ביתילדים%'
UNION ALL SELECT 'outreach_templates', name FROM outreach_templates WHERE body LIKE '%ביתילדים%'
UNION ALL SELECT 'email_templates', template_type FROM email_templates WHERE subject LIKE '%ביתילדים%' OR body LIKE '%ביתילדים%'
UNION ALL SELECT 'zoom_meetings', title FROM zoom_meetings WHERE title LIKE '%ביתילדים%'
UNION ALL SELECT 'page_content', block_id FROM page_content WHERE content LIKE '%ביתילדים%';
