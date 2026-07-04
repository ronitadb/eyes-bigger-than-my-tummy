const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT m.*,
          (SELECT count(*)::int FROM registrations r WHERE r.meeting_id = m.id) AS registration_count
        FROM meetings m
        ORDER BY m.meeting_date DESC, m.meeting_time DESC
      `;
      return res.status(200).json({ ok: true, meetings: rows });
    }

    if (req.method === 'POST') {
      const b = parseBody(req);
      const { rows } = await sql`
        INSERT INTO meetings (title, description, meeting_date, meeting_time, timezone, zoom_link, status)
        VALUES (${b.title}, ${b.description || null}, ${b.meeting_date}, ${b.meeting_time}, ${b.timezone || 'Asia/Jerusalem'}, ${b.zoom_link || null}, ${b.status || 'draft'})
        RETURNING *
      `;
      return res.status(201).json({ ok: true, meeting: rows[0] });
    }

    if (req.method === 'PUT') {
      const b = parseBody(req);
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });
      const { rows } = await sql`
        UPDATE meetings SET
          title = ${b.title},
          description = ${b.description || null},
          meeting_date = ${b.meeting_date},
          meeting_time = ${b.meeting_time},
          timezone = ${b.timezone || 'Asia/Jerusalem'},
          zoom_link = ${b.zoom_link || null},
          status = ${b.status || 'draft'},
          updated_at = now()
        WHERE id = ${b.id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, meeting: rows[0] });
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('admin/meetings error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};

function parseBody(req) {
  return typeof req.body === 'object' && req.body !== null ? req.body : {};
}
