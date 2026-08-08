const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');

const STATUSES = ['pending', 'published', 'hidden'];
const ATTRIBUTIONS = ['full', 'first', 'anonymous'];

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method === 'GET') return list(req, res);
  if (req.method === 'PUT') return update(req, res);
  if (req.method === 'DELETE') return remove(req, res);

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
};

async function list(req, res) {
  try {
    const { rows } = await sql`SELECT * FROM stories ORDER BY created_at DESC`;
    res.status(200).json({ ok: true, stories: rows });
  } catch (err) {
    console.error('admin/stories list error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

async function update(req, res) {
  const b = req.body || {};
  const id = b.id;
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    if (typeof b.status !== 'undefined') {
      if (STATUSES.indexOf(b.status) < 0) {
        return res.status(400).json({ ok: false, error: 'bad_status' });
      }
      if (b.status === 'published') {
        const { rows } = await sql`SELECT consent FROM stories WHERE id = ${id}`;
        if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
        if (!rows[0].consent) return res.status(400).json({ ok: false, error: 'no_consent' });
        await sql`UPDATE stories SET status = 'published', published_at = COALESCE(published_at, now()) WHERE id = ${id}`;
      } else {
        await sql`UPDATE stories SET status = ${b.status} WHERE id = ${id}`;
      }
    }

    if (typeof b.title !== 'undefined') {
      await sql`UPDATE stories SET title = ${b.title || null} WHERE id = ${id}`;
    }
    if (typeof b.body !== 'undefined') {
      await sql`UPDATE stories SET body = ${b.body || null} WHERE id = ${id}`;
    }
    if (typeof b.sender !== 'undefined') {
      await sql`UPDATE stories SET sender = ${b.sender || null} WHERE id = ${id}`;
    }
    if (typeof b.attribution !== 'undefined' && ATTRIBUTIONS.indexOf(b.attribution) > -1) {
      await sql`UPDATE stories SET attribution = ${b.attribution} WHERE id = ${id}`;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin/stories update error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

async function remove(req, res) {
  const b = req.body || {};
  const id = b.id;
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  try {
    await sql`DELETE FROM stories WHERE id = ${id}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin/stories delete error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}
