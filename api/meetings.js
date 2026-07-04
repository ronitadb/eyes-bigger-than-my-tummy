const { sql } = require('./db/connection');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const { rows } = await sql`
      SELECT id, title, description, meeting_date, meeting_time, timezone, status
      FROM zoom_meetings
      WHERE status = 'open'
      ORDER BY meeting_date ASC, meeting_time ASC
    `;
    res.status(200).json({ ok: true, meetings: rows });
  } catch (err) {
    console.error('GET /api/meetings error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
