const { sql } = require('../db');
const { checkAdmin } = require('../auth');

// Only keep-in-touch letters may multiply. The automatic emails are looked up
// by type by api/join.js and api/reminders.js, which take the first row they
// find — so a second 'join_confirmation' would make the cron ambiguous. A
// partial unique index enforces this in the database; these guards make the
// screen say why instead of surfacing a constraint violation.
const LETTER_TYPE = 'update';

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const b = typeof req.body === 'object' && req.body !== null ? req.body : {};

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT * FROM email_templates ORDER BY template_type ASC
      `;
      return res.status(200).json({ ok: true, templates: rows });
    }

    // A new letter, or a copy of one. A copy takes the original's words and
    // leaves the original untouched, so last year's letter stays the record of
    // what was actually sent.
    if (req.method === 'POST') {
      const name = String(b.name || '').trim();
      if (!name) {
        return res.status(400).json({ ok: false, error: 'missing_name', message: 'צריך שם למכתב.' });
      }

      let subject = 'נושא המכתב';
      let bodyText = 'שלום {{שם פרטי}},\n\n';

      if (b.copy_from) {
        const { rows } = await sql`
          SELECT subject, body, template_type FROM email_templates WHERE id = ${b.copy_from}
        `;
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: 'not_found', message: 'המכתב המקורי לא נמצא.' });
        }
        if (rows[0].template_type !== LETTER_TYPE) {
          return res.status(400).json({
            ok: false, error: 'not_a_letter',
            message: 'אפשר לשכפל רק מכתבי שמירת קשר, לא תבניות אוטומטיות.'
          });
        }
        subject = rows[0].subject;
        bodyText = rows[0].body;
      }

      const { rows } = await sql`
        INSERT INTO email_templates (template_type, name, subject, body)
        VALUES (${LETTER_TYPE}, ${name}, ${subject}, ${bodyText})
        RETURNING *
      `;
      return res.status(200).json({ ok: true, template: rows[0] });
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
      return res.status(200).json({ ok: true, template: rows[0] });
    }

    if (req.method === 'DELETE') {
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });

      // email_logs.template_id is ON DELETE SET NULL, so the send history
      // survives a deleted letter — it just stops being able to name it.
      const { rows } = await sql`
        DELETE FROM email_templates
        WHERE id = ${b.id} AND template_type = ${LETTER_TYPE}
        RETURNING id
      `;
      if (!rows.length) {
        return res.status(400).json({
          ok: false, error: 'not_deletable',
          message: 'תבניות אוטומטיות אי אפשר למחוק.'
        });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('admin/templates error:', err);
    res.status(500).json({ ok: false, error: 'db_error', message: 'שגיאת שרת.' });
  }
};
