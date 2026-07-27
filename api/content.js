const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  var page = req.query.page;
  if (!page) return res.status(400).json({ error: 'Missing page parameter' });

  try {
    var { rows } = await sql`
      SELECT block_id, content FROM page_content WHERE page_slug = ${page}
    `;
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.json({ blocks: rows });
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) {
      return res.json({ blocks: [] });
    }
    res.status(500).json({ error: 'Database error' });
  }
};
