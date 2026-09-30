-- A personal letter telling a writer that her story is up in the library.
-- {{link}} makes it personal (one-person send only); the name is typed by hand
-- into the ___ blank before sending. The link is filled by the send dialog:
-- the story's public page, or /voices for a story in the anthology.

INSERT INTO email_templates (template_type, name, subject, body)
VALUES ('update', 'הסיפור פורסם', 'הסיפור שלך עלה לספרייה המשותפת',
$t$שלום ___,

הסיפור שלך עלה לספרייה המשותפת.

[לקריאה]({{link}})

תודה שבחרת לשתף. הקולות שלכם הם מה שעושה את הספרייה למשותפת.

ובכל רגע אפשר לבקש להוריד את הסיפור — בלי צורך בהסבר, פשוט בתשובה למייל הזה.

להתראות,
רונית$t$);
