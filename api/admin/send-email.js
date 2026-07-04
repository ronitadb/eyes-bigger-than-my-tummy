const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');
const { sendEmail, unsubscribeUrl, formatDate, formatTime, renderTemplate } = require('../email/send');

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
  const templateType = String(body.template_type || '');

  if (!meetingId || !templateType) {
    return res.status(400).json({ ok: false, error: 'missing_fields', message: 'meeting_id and template_type required' });
  }

  try {
    const { rows: meetings } = await sql`SELECT * FROM zoom_meetings WHERE id = ${meetingId}`;
    if (!meetings.length) {
      return res.status(404).json({ ok: false, error: 'meeting_not_found' });
    }
    const meeting = meetings[0];

    const { rows: templates } = await sql`SELECT * FROM email_templates WHERE template_type = ${templateType}`;
    if (!templates.length) {
      return res.status(404).json({ ok: false, error: 'template_not_found' });
    }
    const template = templates[0];

    const { rows: participants } = await sql`
      SELECT id, name, email FROM zoom_participants WHERE status = 'active'
    `;

    let sent = 0;
    let failed = 0;

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
          VALUES (${p.id}, ${meetingId}, ${templateType}, 'sent')
        `;
        sent++;
      } catch (err) {
        console.error(`Email to ${p.email} failed:`, err);
        await sql`
          INSERT INTO email_logs (participant_id, meeting_id, email_type, status, error)
          VALUES (${p.id}, ${meetingId}, ${templateType}, 'failed', ${err.message || 'unknown'})
        `;
        failed++;
      }
    }

    res.status(200).json({ ok: true, sent, failed, total: participants.length });
  } catch (err) {
    console.error('admin/send-email error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
