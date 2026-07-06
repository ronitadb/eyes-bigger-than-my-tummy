-- Run this in the Neon SQL console to update existing email templates.
-- This replaces the template content only. No schema changes.

UPDATE email_templates
SET subject = 'ברוכים הבאים למפגשי הזום "בואו נחזור לביתילדים"',
    body = 'שלום {{name}},

תודה שהצטרפת למחזור הראשון של מפגשי הזום "בואו נחזור לביתילדים".

המחזור כולל ארבעה מפגשים, שיתקיימו אחת לשבועיים. לקראת כל מפגש תקבלו תזכורת עם כל הפרטים וקישור לזום.

שמחה שתהיו איתנו.

להתראות,
רונית',
    updated_at = now()
WHERE template_type = 'join_confirmation';

UPDATE email_templates
SET subject = 'תזכורת: {{title}}',
    body = 'שלום {{name}},

רציתי להזכיר שהמפגש הקרוב יתקיים:

אם צירפתי חומרי קריאה או צפייה לקראת המפגש, הם מופיעים כאן למטה.

אין צורך להתכונן במיוחד.

אפשר פשוט להגיע כמו שאתם.

נתראה בזום,
רונית',
    updated_at = now()
WHERE template_type = 'meeting_reminder';

UPDATE email_templates
SET subject = 'תודה שהייתם איתנו',
    body = 'שלום {{name}},

תודה שהצטרפתם למפגש.

מטבע הדברים, בשיחה של שעה אי אפשר להספיק לגעת בכל מה שהנושא מזמין לחשוב עליו. לכן ריכזתי באתר חומרי קריאה שממשיכים את השיחה ומרחיבים את הרעיונות שעלו במפגש.

נסיים כאן את המפגש, אבל לא את השיחה.

להמשך הקריאה באתר:
https://eyes-bigger-than-my-tummy.vercel.app

להתראות במפגש הבא,
רונית',
    updated_at = now()
WHERE template_type = 'meeting_followup';
