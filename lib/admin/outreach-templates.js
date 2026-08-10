// /api/admin/outreach-templates — reusable copy-paste outreach texts.
// Nothing here is ever sent automatically; this is a text drawer, not a mailer.
// Modelled on lib/admin/templates.js (the email_templates editor).

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM outreach_templates ORDER BY id ASC`;
      return res.status(200).json({ ok: true, templates: rows });
    }

    if (req.method === 'POST') {
      const b = U.parseBody(req);
      const name = U.str(b.name);
      if (!name) return res.status(400).json({ ok: false, error: 'missing_name' });
      const { rows } = await sql`
        INSERT INTO outreach_templates (name, type, body)
        VALUES (${name}, ${U.str(b.type)}, ${b.body || ''})
        RETURNING *
      `;
      return res.status(201).json({ ok: true, template: rows[0] });
    }

    if (req.method === 'PUT') {
      const b = U.parseBody(req);
      const id = Number(b.id);
      if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
      const existing = (await sql`SELECT * FROM outreach_templates WHERE id = ${id}`).rows[0];
      if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
      const has = function (k) { return Object.prototype.hasOwnProperty.call(b, k); };
      const { rows } = await sql`
        UPDATE outreach_templates SET
          name = ${has('name') ? (U.str(b.name) || existing.name) : existing.name},
          type = ${has('type') ? U.str(b.type) : existing.type},
          body = ${has('body') ? (b.body || '') : existing.body},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json({ ok: true, template: rows[0] });
    }

    if (req.method === 'DELETE') {
      const b = U.parseBody(req);
      const id = Number(b.id || req.query.id);
      if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
      await sql`DELETE FROM outreach_templates WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    if (U.isMissingTable(err)) {
      return res.status(200).json({ ok: true, templates: [], migration_needed: true });
    }
    console.error('admin/outreach-templates error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
