// היסטוריית שליחות — what was sent, when, to whom, and what failed.
//
// Reads email_logs, which is written a row at a time as each message goes out.
// That record survives whatever the screen did — it is the reason we could tell
// that 46 of 46 landed after the result message had already erased itself.
//
// Lives outside /api, so it costs no serverless function.
//
// It reports what THIS SITE did: whether Resend accepted each message. Whether
// the message then reached the person is Resend's to know, not ours.

const { sql } = require('../db');
const { checkAdmin } = require('../auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    // Participant details come along so a failure can be acted on directly
    // rather than sending the reader back to another screen to look up who.
    const { rows } = await sql`
      SELECT l.id, l.email_type, l.meeting_id, l.sent_at, l.status, l.error,
             p.name, p.first_name, p.email,
             m.title AS meeting_title
      FROM email_logs l
      LEFT JOIN zoom_participants p ON p.id = l.participant_id
      LEFT JOIN zoom_meetings     m ON m.id = l.meeting_id
      ORDER BY l.sent_at DESC
      LIMIT 2000
    `;
    res.status(200).json({ ok: true, logs: rows });
  } catch (err) {
    console.error('admin/send-log error:', err);
    res.status(500).json({ ok: false, error: 'db_error', message: err.message });
  }
};
