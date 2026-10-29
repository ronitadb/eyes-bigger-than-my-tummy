const { sql } = require('../db');
const { checkAdmin } = require('../auth');

// Every email is written fresh from one of four types (see admin/zoom.html →
// אימיילים). The screen assembles the body from what Ronit typed; this handler
// stores the result, plus the typed fields so the email reopens as the form
// she filled in. The send path (send-email.js) treats it like any letter.
//
// template_type is kept per kind so everything that already reads it — the
// meeting cards' counters, the send history's labels — goes on working.
const KIND_TYPE = {
  reminder1: 'meeting_reminder',
  reminder2: 'meeting_reminder_1d',
  article: 'update',
  free: 'update',
};
const NEEDS_SQL = 'צריך קודם להריץ ב-Neon את api/db/applied/emails-by-type.sql.';

function columnMissing(e) {
  // 42703 undefined column (kind/fields not added yet); 23505 the old
  // one-reminder-per-type index still in place.
  return e && (e.code === '42703' || e.code === '23505' ||
    /column .* does not exist|duplicate key|unique/i.test(e.message || ''));
}

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const b = typeof req.body === 'object' && req.body !== null ? req.body : {};

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT * FROM email_templates ORDER BY id ASC
      `;
      return res.status(200).json({ ok: true, templates: rows });
    }

    // A new email of one of the four kinds, saved as a draft.
    if (req.method === 'POST') {
      const type = KIND_TYPE[b.kind];
      if (!type) return res.status(400).json({ ok: false, error: 'bad_kind', message: 'סוג אימייל לא מוכר.' });
      const subject = String(b.subject || '').trim();
      if (!subject) return res.status(400).json({ ok: false, error: 'missing_subject', message: 'צריך נושא.' });
      const fields = JSON.stringify(b.fields && typeof b.fields === 'object' ? b.fields : {});
      try {
        const { rows } = await sql`
          INSERT INTO email_templates (template_type, name, subject, body, kind, fields)
          VALUES (${type}, ${subject}, ${subject}, ${String(b.body || '')}, ${b.kind}, ${fields}::jsonb)
          RETURNING *
        `;
        return res.status(200).json({ ok: true, template: rows[0] });
      } catch (e) {
        if (columnMissing(e)) return res.status(400).json({ ok: false, error: 'needs_sql', message: NEEDS_SQL });
        throw e;
      }
    }

    if (req.method === 'PUT') {
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });

      // An email written from a type: what she typed and the body built from it
      // are saved together.
      if (b.kind !== undefined) {
        const type = KIND_TYPE[b.kind];
        if (!type) return res.status(400).json({ ok: false, error: 'bad_kind', message: 'סוג אימייל לא מוכר.' });
        const subject = String(b.subject || '').trim();
        if (!subject) return res.status(400).json({ ok: false, error: 'missing_subject', message: 'צריך נושא.' });
        const fields = JSON.stringify(b.fields && typeof b.fields === 'object' ? b.fields : {});
        try {
          const { rows } = await sql`
            UPDATE email_templates
            SET name = ${subject}, subject = ${subject}, body = ${String(b.body || '')},
                kind = ${b.kind}, fields = ${fields}::jsonb, updated_at = now()
            WHERE id = ${b.id} AND template_type = ${type}
            RETURNING *
          `;
          if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
          return res.status(200).json({ ok: true, template: rows[0] });
        } catch (e) {
          if (columnMissing(e)) return res.status(400).json({ ok: false, error: 'needs_sql', message: NEEDS_SQL });
          throw e;
        }
      }

      // An email from before the types (the join confirmation, a personal
      // letter, an older letter): subject and body as written.
      const { rows } = await sql`
        UPDATE email_templates
        SET subject = COALESCE(${b.subject === undefined ? null : b.subject}, subject),
            body    = COALESCE(${b.body === undefined ? null : b.body}, body),
            updated_at = now()
        WHERE id = ${b.id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, template: rows[0] });
    }

    // Only a draft can be deleted. What was sent stays as the record of it,
    // and the join confirmation is always there.
    if (req.method === 'DELETE') {
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });
      const { rows: cur } = await sql`SELECT template_type FROM email_templates WHERE id = ${b.id}`;
      if (!cur.length) return res.status(404).json({ ok: false, error: 'not_found' });
      if (cur[0].template_type === 'join_confirmation') {
        return res.status(400).json({ ok: false, error: 'not_deletable', message: 'את אישור ההצטרפות אי אפשר למחוק.' });
      }
      const { rows: sent } = await sql`
        SELECT 1 FROM email_logs WHERE template_id = ${b.id} AND status = 'sent' LIMIT 1
      `;
      if (sent.length) {
        return res.status(400).json({ ok: false, error: 'already_sent',
          message: 'האימייל הזה כבר נשלח, והוא נשמר כתיעוד. אפשר למחוק רק טיוטה.' });
      }
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
