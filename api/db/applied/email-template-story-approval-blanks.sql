-- The approval letter is personal: Ronit types the writer's name into it
-- herself before each send. The name placeholders become blanks (___), and a
-- personal send is refused while any blank is left.

UPDATE email_templates SET
  body = replace(replace(body, 'שלום {{first_name}},', 'שלום ___,'),
                 'הסיפור מופיע בשם {{name}}.', 'הסיפור מופיע בשם ___.'),
  updated_at = now()
WHERE id = 8 AND name = 'אישור דף סיפור';
