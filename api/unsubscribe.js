const { sql } = require('./db/connection');
const { unsubscribeToken } = require('./email/send');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const email = String(req.query.email || '').trim().toLowerCase();
  const token = String(req.query.token || '');

  if (!email || !token || token !== unsubscribeToken(email)) {
    return res.status(200).send(page('הקישור אינו תקין', 'לא הצלחנו לזהות את הבקשה. ניתן לפנות אלינו ישירות.'));
  }

  try {
    await sql`
      UPDATE zoom_participants
      SET status = 'unsubscribed', unsubscribed_at = now()
      WHERE email = ${email} AND status = 'active'
    `;

    return res.status(200).send(page(
      'הוסרת מרשימת התפוצה',
      'לא תקבל/י יותר עדכונים על מפגשי הזום.<br>אם תרצה/י להצטרף שוב בעתיד — הדלת תמיד פתוחה.'
    ));
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(200).send(page('שגיאה', 'משהו לא עבד. ניתן לפנות אלינו ישירות.'));
  }
};

function page(title, message) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&family=Frank+Ruhl+Libre:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Assistant', sans-serif; background: #FAF8F4; color: #22302F; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
  .wrap { max-width: 480px; text-align: center; }
  h1 { font-size: 24px; color: #3D7468; margin-bottom: 18px; }
  p { font-family: 'Frank Ruhl Libre', serif; font-size: 18px; line-height: 1.8; color: #3A4744; margin-bottom: 24px; }
  a { color: #3D7468; text-decoration: none; font-family: 'Assistant', sans-serif; font-weight: 600; font-size: 16px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">חזרה לאתר ←</a>
  </div>
</body>
</html>`;
}
