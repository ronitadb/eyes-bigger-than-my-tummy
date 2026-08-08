// Public feed for the shared library (הספרייה המשותפת).
// Returns only published, consented stories, newest first. Emails are never exposed.

const { sql } = require('./db/connection');

function displayName(sender, attribution) {
  const s = (sender || '').trim();
  if (attribution === 'full') return s || 'אנונימי';
  if (attribution === 'first') return s ? s.split(/\s+/)[0] : 'אנונימי';
  return 'אנונימי';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const { rows } = await sql`
      SELECT id, sender, title, body, attribution, published_at, created_at
      FROM stories
      WHERE status = 'published' AND consent = true
      ORDER BY COALESCE(published_at, created_at) DESC
    `;

    const stories = rows.map(function (r) {
      return {
        id: r.id,
        title: r.title || '',
        body: r.body || '',
        author: displayName(r.sender, r.attribution),
        date: r.published_at || r.created_at,
      };
    });

    res.status(200).json({ ok: true, stories });
  } catch (err) {
    // Table may not exist yet (before migration) — render an empty library cleanly.
    console.error('GET /api/stories error:', err.message);
    res.status(200).json({ ok: true, stories: [] });
  }
};
