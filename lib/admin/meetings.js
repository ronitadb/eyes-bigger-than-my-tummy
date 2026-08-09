const { sql } = require('../db');
const { checkAdmin } = require('../auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT m.*,
          (SELECT count(*)::int FROM email_logs el WHERE el.meeting_id = m.id AND el.email_type = 'meeting_reminder') AS reminders_sent,
          (SELECT count(*)::int FROM email_logs el WHERE el.meeting_id = m.id AND el.email_type = 'meeting_followup') AS followups_sent
        FROM zoom_meetings m
        ORDER BY m.meeting_date DESC, m.meeting_time DESC
      `;
      return res.status(200).json({ ok: true, meetings: rows });
    }

    if (req.method === 'POST') {
      const b = parseBody(req);
      const audience = ['parents', 'children', 'all'].indexOf(b.audience) > -1 ? b.audience : 'all';
      const { rows } = await sql`
        INSERT INTO zoom_meetings (title, description, meeting_date, meeting_time, timezone, zoom_link, status, related_materials)
        VALUES (${b.title}, ${b.description || null}, ${b.meeting_date}, ${b.meeting_time},
                ${b.timezone || 'Asia/Jerusalem'}, ${b.zoom_link || null}, ${b.status || 'draft'}, ${b.related_materials || null})
        RETURNING *
      `;
      const meeting = rows[0];
      await setAudience(meeting, audience);
      return res.status(201).json({ ok: true, meeting });
    }

    if (req.method === 'PUT') {
      const b = parseBody(req);
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });
      const audience = ['parents', 'children', 'all'].indexOf(b.audience) > -1 ? b.audience : 'all';
      const { rows } = await sql`
        UPDATE zoom_meetings SET
          title = ${b.title},
          description = ${b.description || null},
          meeting_date = ${b.meeting_date},
          meeting_time = ${b.meeting_time},
          timezone = ${b.timezone || 'Asia/Jerusalem'},
          zoom_link = ${b.zoom_link || null},
          status = ${b.status || 'draft'},
          related_materials = ${b.related_materials || null},
          updated_at = now()
        WHERE id = ${b.id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const meeting = rows[0];
      await setAudience(meeting, audience);
      return res.status(200).json({ ok: true, meeting });
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

// Set the meeting's audience in a separate, resilient write so that creating or
// editing a meeting keeps working even before the audience-column migration has run.
async function setAudience(meeting, audience) {
  try {
    await sql`UPDATE zoom_meetings SET audience = ${audience} WHERE id = ${meeting.id}`;
    meeting.audience = audience;
  } catch (e) {
    console.error('audience set skipped (column may not exist yet):', e.message);
  }
}
