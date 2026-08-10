// /api/admin/tags — user-editable tags. Renaming a tag keeps every link intact,
// which is the whole point of the join table.

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT t.id, t.name, count(ct.contact_id)::int AS contact_count
        FROM tags t LEFT JOIN contact_tags ct ON ct.tag_id = t.id
        GROUP BY t.id, t.name ORDER BY t.name ASC
      `;
      return res.status(200).json({ ok: true, tags: rows });
    }

    if (req.method === 'POST') {
      const name = U.str(U.parseBody(req).name);
      if (!name) return res.status(400).json({ ok: false, error: 'missing_name' });
      await sql`INSERT INTO tags (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
      const { rows } = await sql`SELECT id, name FROM tags WHERE name = ${name}`;
      return res.status(201).json({ ok: true, tag: rows[0] });
    }

    if (req.method === 'PUT') {
      const b = U.parseBody(req);
      const id = Number(b.id);
      const name = U.str(b.name);
      if (!id || !name) return res.status(400).json({ ok: false, error: 'missing_fields' });
      const { rows } = await sql`UPDATE tags SET name = ${name} WHERE id = ${id} RETURNING id, name`;
      if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(200).json({ ok: true, tag: rows[0] });
    }

    if (req.method === 'DELETE') {
      const b = U.parseBody(req);
      const id = Number(b.id || req.query.id);
      if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
      await sql`DELETE FROM tags WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    if (U.isMissingTable(err)) {
      return res.status(200).json({ ok: true, tags: [], migration_needed: true });
    }
    if (err.code === '23505') {
      return res.status(400).json({ ok: false, error: 'duplicate_name' });
    }
    console.error('admin/tags error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
