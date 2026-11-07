const { sql } = require('../lib/db');
const { validToken, icsFile } = require('../lib/calendar');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // /cal/<id>/<token> (rewrite in vercel.json): one meeting as an .ics file,
  // for the "add to calendar" link in its emails. It carries the Zoom link,
  // so it needs the signed token; a wrong one gets the same 404 as no meeting.
  if (req.query.ics) {
    const id = parseInt(req.query.ics, 10);
    if (!Number.isInteger(id) || !validToken(id, String(req.query.t || ''))) {
      return res.status(404).send('Not found');
    }
    try {
      const { rows } = await sql`SELECT * FROM zoom_meetings WHERE id = ${id}`;
      const body = rows.length ? icsFile(rows[0]) : null;
      if (!body) return res.status(404).send('Not found');
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="beityeladim-meeting-' + id + '.ics"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).send(body);
    } catch (err) {
      console.error('GET /api/meetings ics error:', err);
      return res.status(500).send('Server error');
    }
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
