const { sql } = require('@vercel/postgres');
const { checkAdmin } = require('../auth');

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    var { rows } = await sql`
      SELECT page_slug, block_id, content, updated_at
      FROM page_content ORDER BY page_slug, block_id
    `;
    return res.json({ blocks: rows });
  }

  if (req.method === 'PUT') {
    var { page_slug, block_id, content } = req.body;
    if (!page_slug || !block_id) return res.status(400).json({ error: 'Missing fields' });

    if (!content && content !== '') {
      await sql`DELETE FROM page_content WHERE page_slug = ${page_slug} AND block_id = ${block_id}`;
      return res.json({ ok: true, action: 'deleted' });
    }

    await sql`
      INSERT INTO page_content (page_slug, block_id, content)
      VALUES (${page_slug}, ${block_id}, ${content})
      ON CONFLICT (page_slug, block_id)
      DO UPDATE SET content = ${content}, updated_at = now()
    `;
    return res.json({ ok: true, action: 'saved' });
  }

  if (req.method === 'DELETE') {
    var { page_slug, block_id } = req.body;
    if (!page_slug || !block_id) return res.status(400).json({ error: 'Missing fields' });
    await sql`DELETE FROM page_content WHERE page_slug = ${page_slug} AND block_id = ${block_id}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
