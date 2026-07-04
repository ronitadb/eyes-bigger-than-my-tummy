const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');
const { sendEmail, reminderEmail } = require('../email/send');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const meetingId = parseInt(body.meeting_id, 10);
  if (!meetingId) {
    return res.status(400).json({ ok: false, error: 'missing_meeting_id' });
  }

  try {
    const { rows: meetings } = await sql`
      SELECT * FROM meetings WHERE id = ${meetingId}
    `;
    if (!meetings.length) {
      return res.status(404).json({ ok: false, error: 'meeting_not_found' });
    }
    const meeting = meetings[0];

    const { rows: regs } = await sql`
      SELECT id, name, email FROM registrations
      WHERE meeting_id = ${meetingId} AND reminder_sent_at IS NULL
    `;

    let sent = 0;
    let failed = 0;

    for (const reg of regs) {
      try {
        const { subject, html } = reminderEmail(meeting, reg.name);
        await sendEmail({ to: reg.email, subject, html });
        await sql`UPDATE registrations SET reminder_sent_at = now() WHERE id = ${reg.id}`;
        sent++;
      } catch (err) {
        console.error(`Reminder to ${reg.email} failed:`, err);
        failed++;
      }
    }

    res.status(200).json({ ok: true, sent, failed, skipped: 0 });
  } catch (err) {
    console.error('admin/send-reminders error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
