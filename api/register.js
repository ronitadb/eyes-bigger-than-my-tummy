const { sql } = require('./db/connection');
const { sendEmail, confirmationEmail } = require('./email/send');

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
  const meetingId = parseInt(body.meeting_id, 10);

  if (!name || name.length < 2) {
    return res.status(400).json({ ok: false, error: 'invalid_name', message: 'נא להזין שם' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email', message: 'כתובת אימייל לא תקינה' });
  }
  if (!meetingId) {
    return res.status(400).json({ ok: false, error: 'invalid_meeting', message: 'מפגש לא נבחר' });
  }

  try {
    const { rows: meetings } = await sql`
      SELECT id, title, description, meeting_date, meeting_time, timezone, zoom_link, status
      FROM meetings WHERE id = ${meetingId}
    `;
    if (!meetings.length || meetings[0].status !== 'open') {
      return res.status(400).json({ ok: false, error: 'meeting_not_open', message: 'ההרשמה למפגש זה אינה פתוחה' });
    }
    const meeting = meetings[0];

    const { rows: existing } = await sql`
      SELECT id FROM registrations WHERE meeting_id = ${meetingId} AND email = ${email}
    `;
    if (existing.length) {
      return res.status(200).json({ ok: true, already_registered: true, message: 'כבר נרשמת למפגש זה' });
    }

    let confirmationSentAt = null;
    try {
      const { subject, html } = confirmationEmail(meeting, name);
      await sendEmail({ to: email, subject, html });
      confirmationSentAt = new Date().toISOString();
    } catch (emailErr) {
      console.error('Confirmation email failed:', emailErr);
    }

    await sql`
      INSERT INTO registrations (meeting_id, name, email, confirmation_sent_at)
      VALUES (${meetingId}, ${name}, ${email}, ${confirmationSentAt})
    `;

    res.status(200).json({ ok: true, message: 'ההרשמה התקבלה. תודה!' });
  } catch (err) {
    console.error('POST /api/register error:', err);
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
