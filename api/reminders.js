// Automatic Zoom-meeting reminders. Triggered once a day by Vercel Cron
// (see vercel.json). For every meeting happening in ~5 days and ~1 day, it emails
// that meeting's group (parents / children / everyone) with the meeting's own
// title, date, time and Zoom link. Idempotent: each meeting+offset is sent once.

const { sql } = require('../lib/db');
const { getRecipients } = require('../lib/admin/send-email');
const { sendEmail, unsubscribeUrl, formatDate, formatTime, renderTemplate } = require('../lib/email');

// One row per lead-time. Same template for both; the log type keeps them distinct.
const OFFSETS = [
  { days: 5, type: 'reminder_5d' },
  { days: 1, type: 'reminder_1d' },
];

// Today's calendar date in Israel (meetings are stored in Asia/Jerusalem).
function israelToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // 'YYYY-MM-DD'
}
function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers['authorization'] || '') !== 'Bearer ' + secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const { rows: templates } = await sql`
      SELECT subject, body FROM email_templates WHERE template_type = 'meeting_reminder'
    `;
    if (!templates.length) {
      return res.status(200).json({ ok: true, note: 'no meeting_reminder template' });
    }
    const template = templates[0];

    const today = israelToday();
    const summary = [];

    for (const off of OFFSETS) {
      const target = addDays(today, off.days);
      const { rows: meetings } = await sql`
        SELECT * FROM zoom_meetings
        WHERE meeting_date = ${target} AND status IN ('draft', 'open')
      `;

      for (const meeting of meetings) {
        // Already sent this lead-time for this meeting? (safety against double runs)
        const { rows: already } = await sql`
          SELECT 1 FROM email_logs
          WHERE meeting_id = ${meeting.id} AND email_type = ${off.type} LIMIT 1
        `;
        if (already.length) {
          summary.push({ meeting: meeting.id, type: off.type, skipped: 'already_sent' });
          continue;
        }

        const participants = await getRecipients(meeting.audience);
        let sent = 0, failed = 0;

        for (const p of participants) {
          try {
            const vars = {
              name: p.name,
              title: meeting.title,
              date: formatDate(meeting.meeting_date),
              time: formatTime(meeting.meeting_time),
              zoom_link: meeting.zoom_link || '',
              description: meeting.description || '',
              materials: meeting.related_materials || '',
              unsubscribe_url: unsubscribeUrl(p.email),
            };
            const { subject, html } = renderTemplate(template.body, template.subject, vars);
            await sendEmail({ to: p.email, subject, html });
            await sql`
              INSERT INTO email_logs (participant_id, meeting_id, email_type, status)
              VALUES (${p.id}, ${meeting.id}, ${off.type}, 'sent')
            `;
            sent++;
          } catch (e) {
            console.error('reminder to', p.email, 'failed:', e.message);
            await sql`
              INSERT INTO email_logs (participant_id, meeting_id, email_type, status, error)
              VALUES (${p.id}, ${meeting.id}, ${off.type}, 'failed', ${e.message || 'unknown'})
            `;
            failed++;
          }
        }
        summary.push({ meeting: meeting.id, title: meeting.title, audience: meeting.audience, type: off.type, sent, failed });
      }
    }

    res.status(200).json({ ok: true, today, summary });
  } catch (err) {
    console.error('reminders cron error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
