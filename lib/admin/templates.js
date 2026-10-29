const { sql } = require('../db');
const { checkAdmin } = require('../auth');

// Letters and meeting emails (reminders, after-meeting message) may multiply:
// each is sent by hand from the send window, which names the exact row. Only
// the join confirmation stays one of a kind, because api/join.js looks it up
// by type when someone registers. A partial unique index enforces that in the
// database; these guards make the screen say why instead of surfacing a
// constraint violation.
const LETTER_TYPE = 'update';
const MEETING_TYPES = ['meeting_reminder', 'meeting_reminder_1d', 'meeting_followup'];
// Which group an email was written for. It only decides who is ticked when the
// send window opens; it never sends to anyone by itself.
const AUDIENCES = ['parents', 'children', 'all'];
const NEEDS_SQL = 'צריך קודם להריץ ב-Neon את api/db/meeting-emails-per-group.sql.';

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const b = typeof req.body === 'object' && req.body !== null ? req.body : {};

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT * FROM email_templates ORDER BY template_type ASC, id ASC
      `;
      return res.status(200).json({ ok: true, templates: rows });
    }

    // A new letter, or a copy of a letter or a meeting email. A copy takes the
    // original's words and leaves the original untouched, so last year's
    // letter stays the record of what was actually sent.
    if (req.method === 'POST') {
      const name = String(b.name || '').trim();
      if (!name) {
        return res.status(400).json({ ok: false, error: 'missing_name', message: 'צריך שם למכתב.' });
      }

      let type = LETTER_TYPE;
      let subject = 'נושא המכתב';
      let bodyText = 'שלום {{first_name}},\n\n';
      let audience = null;

      if (b.copy_from) {
        const { rows } = await sql`
          SELECT * FROM email_templates WHERE id = ${b.copy_from}
        `;
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'המכתב המקורי לא נמצא.' });
        }
        const src = rows[0];
        if (src.template_type !== LETTER_TYPE && MEETING_TYPES.indexOf(src.template_type) === -1) {
          return res.status(400).json({
            ok: false, error: 'not_copyable',
            message: 'את אישור ההצטרפות אי אפשר לשכפל — יש רק אחד.'
          });
        }
        type = src.template_type;
        subject = src.subject;
        bodyText = src.body;
        audience = src.audience || null;
      }

      let created;
      try {
        ({ rows: [created] } = await sql`
          INSERT INTO email_templates (template_type, name, subject, body)
          VALUES (${type}, ${name}, ${subject}, ${bodyText})
          RETURNING *
        `);
      } catch (e) {
        // Before the SQL has run, the old index still allows one row per
        // meeting-email type.
        if (e.code === '23505' || /duplicate key|unique/i.test(e.message || '')) {
          return res.status(400).json({ ok: false, error: 'needs_sql', message: NEEDS_SQL });
        }
        throw e;
      }
      if (audience) {
        try {
          ({ rows: [created] } = await sql`
            UPDATE email_templates SET audience = ${audience} WHERE id = ${created.id} RETURNING *
          `);
        } catch (e) {
          console.error('audience not copied (column missing?):', e.message);
        }
      }
      return res.status(200).json({ ok: true, template: created });
    }

    if (req.method === 'PUT') {
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });

      // Renaming sends no subject or body; editing sends no name. Each field
      // falls back to what is stored, so neither call erases the other's work.
      const { rows } = await sql`
        UPDATE email_templates
        SET name    = COALESCE(${b.name === undefined ? null : b.name}, name),
            subject = COALESCE(${b.subject === undefined ? null : b.subject}, subject),
            body    = COALESCE(${b.body === undefined ? null : b.body}, body),
            updated_at = now()
        WHERE id = ${b.id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });

      // '' clears it: the email is for everyone and the meeting's own group
      // decides who is ticked.
      if (b.audience !== undefined) {
        const audience = AUDIENCES.indexOf(b.audience) > -1 ? b.audience : null;
        try {
          const { rows: r2 } = await sql`
            UPDATE email_templates SET audience = ${audience} WHERE id = ${b.id} RETURNING *
          `;
          return res.status(200).json({ ok: true, template: r2[0] });
        } catch (e) {
          return res.status(200).json({ ok: true, template: rows[0], warning: 'הטקסט נשמר, הקבוצה לא. ' + NEEDS_SQL });
        }
      }
      return res.status(200).json({ ok: true, template: rows[0] });
    }

    if (req.method === 'DELETE') {
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });

      // A meeting email can go as long as another of its kind remains, so
      // there is always something to send from a meeting card.
      const { rows: cur } = await sql`SELECT template_type FROM email_templates WHERE id = ${b.id}`;
      if (!cur.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const type = cur[0].template_type;
      if (MEETING_TYPES.indexOf(type) > -1) {
        const { rows: same } = await sql`
          SELECT count(*)::int AS n FROM email_templates WHERE template_type = ${type}
        `;
        if (same[0].n < 2) {
          return res.status(400).json({ ok: false, error: 'last_of_kind',
            message: 'זה הנוסח היחיד מהסוג הזה — אי אפשר למחוק אותו. אפשר לערוך.' });
        }
      } else if (type !== LETTER_TYPE) {
        return res.status(400).json({ ok: false, error: 'not_deletable',
          message: 'את אישור ההצטרפות אי אפשר למחוק.' });
      }

      // email_logs.template_id is ON DELETE SET NULL, so the send history
      // survives a deleted letter — it just stops being able to name it.
      await sql`DELETE FROM email_templates WHERE id = ${b.id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('admin/templates error:', err);
    res.status(500).json({ ok: false, error: 'db_error', message: 'שגיאת שרת.' });
  }
};
