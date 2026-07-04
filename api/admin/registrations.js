const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const meetingId = req.query.meeting_id;
  if (!meetingId) {
    return res.status(400).json({ ok: false, error: 'missing_meeting_id' });
  }

  const format = req.query.format || 'json';

  try {
    const { rows } = await sql`
      SELECT id, name, email, registered_at, confirmation_sent_at, reminder_sent_at, notes
      FROM registrations
      WHERE meeting_id = ${parseInt(meetingId, 10)}
      ORDER BY registered_at ASC
    `;

    if (format === 'csv') {
      const header = 'שם,אימייל,תאריך הרשמה,אישור נשלח,תזכורת נשלחה,הערות';
      const lines = rows.map(r =>
        [r.name, r.email, fmtDate(r.registered_at), fmtDate(r.confirmation_sent_at), fmtDate(r.reminder_sent_at), r.notes || '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = '﻿' + header + '\n' + lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="registrations-${meetingId}.csv"`);
      return res.status(200).send(csv);
    }

    res.status(200).json({ ok: true, registrations: rows });
  } catch (err) {
    console.error('admin/registrations error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}
