const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT * FROM email_templates ORDER BY template_type ASC
      `;
      return res.status(200).json({ ok: true, templates: rows });
    }

    if (req.method === 'PUT') {
      const b = typeof req.body === 'object' && req.body !== null ? req.body : {};
      if (!b.id) return res.status(400).json({ ok: false, error: 'missing_id' });

      const { rows } = await sql`
        UPDATE email_templates
        SET subject = ${b.subject}, body = ${b.body}, updated_at = now()
        WHERE id = ${b.id}
        RETURNING *
      `;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, template: rows[0] });
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('admin/templates error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
