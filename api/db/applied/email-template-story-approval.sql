-- A personal letter asking a writer to approve the page made for her story
-- (library-decisions §14). {{link}} makes it personal: the editor offers it
-- only as "שליחה לאדם אחד", and the server refuses to send it to the list.
-- At send time Ronit types the name ({{name}} / {{first_name}}), the address,
-- and the private preview link from the stories screen. Written to a woman;
-- Ronit edits the wording per writer in the email editor.

INSERT INTO email_templates (template_type, name, subject, body)
VALUES ('update', 'אישור דף סיפור', 'הסיפור שלך בספרייה המשותפת — לאישורך',
$t$שלום {{first_name}},

תודה ששלחת לי את הסיפור שלך.

הכנתי לו דף משלו בספרייה המשותפת. לפני שהוא עולה, חשוב לי שתראי אותו ותאשרי:

[לצפייה בדף]({{link}})

הקישור פרטי. רק מי שמחזיק בו יכול לראות את הדף, והוא לא יתפרסם בלי אישורך.

שלוש שאלות קצרות — אפשר לענות עליהן פשוט בתשובה למייל הזה:

1. האם את מאשרת את הדף כפי שהוא? אם תרצי לשנות משהו, אשנה.
2. הסיפור מופיע בשם {{name}}. זה עדיין מתאים לך?
3. האם תרצי שהסיפור יופיע גם בחיפוש בגוגל, או רק למי שמגיע לספרייה?

ובכל רגע, גם אחרי הפרסום, אפשר לבקש להוריד את הסיפור — בלי צורך בהסבר, פשוט בתשובה למייל.

להתראות,
רונית$t$);
