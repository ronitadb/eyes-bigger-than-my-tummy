const { sql } = require('./db/connection');
const { sendEmail, unsubscribeUrl, renderTemplate, renderSeriesScheduleBlock } = require('./email/send');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (body == null || typeof body === 'string') {
    try {
      body = JSON.parse(typeof body === 'string' ? body : await readRawBody(req));
    } catch (_) {
      body = {};
    }
  }

  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();

  if (!name || name.length < 2) {
    return res.status(400).json({ ok: false, error: 'invalid_name', message: 'נא להזין שם' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email', message: 'כתובת אימייל לא תקינה' });
  }

  try {
    const { rows: existing } = await sql`
      SELECT id, status FROM zoom_participants WHERE email = ${email}
    `;

    if (existing.length) {
      if (existing[0].status === 'active') {
        return res.status(200).json({ ok: true, already_joined: true, message: 'כבר נמצאת ברשימה. נעדכן אותך לקראת המפגש הבא.' });
      }
      await sql`
        UPDATE zoom_participants
        SET status = 'active', name = ${name}, unsubscribed_at = NULL, joined_at = now()
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO zoom_participants (name, email)
        VALUES (${name}, ${email})
      `;
    }

    let confirmationSent = false;
    try {
      const { rows: templates } = await sql`
        SELECT subject, body FROM email_templates WHERE template_type = 'join_confirmation'
      `;
      if (templates.length) {
        const { rows: upcoming } = await sql`
          SELECT title, meeting_date, meeting_time
          FROM zoom_meetings
          WHERE status IN ('draft','open')
          ORDER BY meeting_date ASC, meeting_time ASC
          LIMIT 4
        `;
        const vars = {
          name,
          unsubscribe_url: unsubscribeUrl(email),
          scheduleBlock: renderSeriesScheduleBlock(upcoming),
        };
        const { subject, html } = renderTemplate(templates[0].body, templates[0].subject, vars);
        await sendEmail({ to: email, subject, html });
        confirmationSent = true;
        await sql`UPDATE zoom_participants SET last_confirmation_sent_at = now() WHERE email = ${email}`;
      }
    } catch (emailErr) {
      console.error('Confirmation email failed:', emailErr);
    }

    res.status(200).json({
      ok: true,
      message: confirmationSent
        ? 'תודה שהצטרפת! אישור נשלח לאימייל שלך.'
        : 'תודה שהצטרפת! נעדכן אותך לקראת המפגש הבא.'
    });
  } catch (err) {
    console.error('POST /api/join error:', err);
    res.status(500).json({ ok: false, error: 'server_error', message: 'שגיאה בשרת, נא לנסות שוב' });
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
