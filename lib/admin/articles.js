// Admin CRUD for הספרייה המשותפת articles.
//
// Lives outside /api so it costs no serverless function; reached through
// api/admin/[resource].js as /api/admin/articles.
//
// @vercel/postgres v0.10 supports tagged templates only — no dynamic SQL — so
// each field is its own UPDATE. Verbose, but it keeps every value parameterised.

const { sql } = require('../db');
const { checkAdmin } = require('../auth');
const { renderBlocks } = require('../articles-render');

const STATUSES = ['planned', 'draft', 'published', 'hidden'];
// Latin, lowercase, hyphens. Hebrew slugs percent-encode into something
// unreadable when forwarded on WhatsApp, which is the main channel here.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  if (req.method === 'GET') return req.query.id ? one(req, res) : list(req, res);
  if (req.method === 'POST') return create(req, res);
  if (req.method === 'PUT') return update(req, res);
  if (req.method === 'DELETE') return remove(req, res);

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
};

async function list(req, res) {
  // The extended listing needs columns added by later migrations. If one has
  // not been run yet, degrade to the core columns rather than 500 — a failing
  // list here locks the whole screen, and the login can only report that
  // something went wrong, not what.
  try {
    const { rows } = await sql`
      SELECT id, slug, title_lead, title_topic, summary, term_name, status,
             sort_order, axis, published_at, updated_at,
             jsonb_array_length(blocks) AS block_count,
             jsonb_array_length(chain)  AS chain_count,
             COALESCE(LENGTH(canvas), 0) AS canvas_len,
             (core_sentence IS NOT NULL AND core_sentence <> '') AS has_sentence,
             (asimon IS NOT NULL AND asimon <> '')               AS has_asimon
      FROM articles ORDER BY sort_order, id
    `;
    return res.status(200).json({ ok: true, articles: rows });
  } catch (err) {
    console.error('admin/articles extended list failed, falling back:', err.message);
  }
  try {
    const { rows } = await sql`
      SELECT id, slug, title_lead, title_topic, summary, status, sort_order,
             published_at, updated_at,
             jsonb_array_length(blocks) AS block_count,
             jsonb_array_length(chain)  AS chain_count
      FROM articles ORDER BY sort_order, id
    `;
    res.status(200).json({ ok: true, articles: rows, degraded: true });
  } catch (err) {
    console.error('admin/articles list error:', err);
    res.status(500).json({ ok: false, error: 'db_error', message: err.message });
  }
}

// The full record, private fields included — this is the editor's own view.
async function one(req, res) {
  try {
    const { rows } = await sql`SELECT * FROM articles WHERE id = ${parseInt(req.query.id, 10)}`;
    if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
    res.status(200).json({ ok: true, article: rows[0] });
  } catch (err) {
    console.error('admin/articles one error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

async function create(req, res) {
  const b = req.body || {};

  // Renders blocks through the SAME code the public page uses, so the preview
  // cannot drift from what gets published.
  if (b.action === 'preview') {
    try {
      return res.status(200).json({ ok: true, html: renderBlocks(b.blocks || []) });
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'render_failed', message: err.message });
    }
  }

  const slug = String(b.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ ok: false, error: 'bad_slug',
      message: 'כתובת באותיות לטיניות קטנות ומקפים בלבד, למשל article-11' });
  }
  try {
    const { rows } = await sql`
      INSERT INTO articles (slug, title_topic, sort_order, status)
      VALUES (${slug}, ${b.title_topic || 'מאמר חדש'},
              ${Number.isFinite(+b.sort_order) ? +b.sort_order : 99}, 'planned')
      RETURNING id
    `;
    res.status(200).json({ ok: true, id: rows[0].id });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(400).json({ ok: false, error: 'duplicate_slug',
        message: 'הכתובת הזו כבר תפוסה.' });
    }
    console.error('admin/articles create error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

async function update(req, res) {
  const b = req.body || {};
  const id = parseInt(b.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  try {
    if (typeof b.slug !== 'undefined') {
      const slug = String(b.slug).trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ ok: false, error: 'bad_slug',
          message: 'כתובת באותיות לטיניות קטנות ומקפים בלבד.' });
      }
      try {
        await sql`UPDATE articles SET slug = ${slug} WHERE id = ${id}`;
      } catch (err) {
        if (err && err.code === '23505') {
          return res.status(400).json({ ok: false, error: 'duplicate_slug',
            message: 'הכתובת הזו כבר תפוסה.' });
        }
        throw err;
      }
    }

    const TEXT = ['title_lead', 'title_topic', 'summary', 'notes',
                  'term_name', 'hero_image', 'hero_credit',
                  'canvas', 'canvas_link', 'core_sentence', 'asimon', 'axis'];
    for (const f of TEXT) {
      if (typeof b[f] === 'undefined') continue;
      const v = b[f] === '' ? null : b[f];
      if (f === 'title_lead')  await sql`UPDATE articles SET title_lead  = ${v} WHERE id = ${id}`;
      if (f === 'title_topic') await sql`UPDATE articles SET title_topic = ${v} WHERE id = ${id}`;
      if (f === 'summary')     await sql`UPDATE articles SET summary     = ${v} WHERE id = ${id}`;
      if (f === 'notes')       await sql`UPDATE articles SET notes       = ${v} WHERE id = ${id}`;
      if (f === 'term_name')   await sql`UPDATE articles SET term_name   = ${v} WHERE id = ${id}`;
      if (f === 'hero_image')  await sql`UPDATE articles SET hero_image  = ${v} WHERE id = ${id}`;
      if (f === 'hero_credit') await sql`UPDATE articles SET hero_credit = ${v} WHERE id = ${id}`;
      // כרטיס מאמר — private working document, stored verbatim.
      if (f === 'canvas')      await sql`UPDATE articles SET canvas      = ${v} WHERE id = ${id}`;
      if (f === 'canvas_link') await sql`UPDATE articles SET canvas_link = ${v} WHERE id = ${id}`;
      if (f === 'core_sentence') await sql`UPDATE articles SET core_sentence = ${v} WHERE id = ${id}`;
      if (f === 'asimon')        await sql`UPDATE articles SET asimon        = ${v} WHERE id = ${id}`;
      if (f === 'axis')          await sql`UPDATE articles SET axis          = ${v} WHERE id = ${id}`;
    }

    if (typeof b.blocks !== 'undefined') {
      await sql`UPDATE articles SET blocks = ${JSON.stringify(b.blocks || [])}::jsonb WHERE id = ${id}`;
    }
    // Private — מאחורי הקלעים. Never selected by the public page.
    if (typeof b.chain !== 'undefined') {
      await sql`UPDATE articles SET chain = ${JSON.stringify(b.chain || [])}::jsonb WHERE id = ${id}`;
    }
    if (typeof b.external_pubs !== 'undefined') {
      await sql`UPDATE articles SET external_pubs = ${JSON.stringify(b.external_pubs || [])}::jsonb WHERE id = ${id}`;
    }
    if (typeof b.related_ids !== 'undefined') {
      const ids = (Array.isArray(b.related_ids) ? b.related_ids : [])
        .map(Number).filter(function (n) { return Number.isInteger(n) && n !== id; });
      await sql`UPDATE articles SET related_ids = ${ids} WHERE id = ${id}`;
    }
    if (typeof b.builds_on !== 'undefined') {
      const ids = (Array.isArray(b.builds_on) ? b.builds_on : [])
        .map(Number).filter(function (n) { return Number.isInteger(n) && n !== id; });
      await sql`UPDATE articles SET builds_on = ${ids} WHERE id = ${id}`;
    }
    if (typeof b.story_ids !== 'undefined') {
      const ids = (Array.isArray(b.story_ids) ? b.story_ids : [])
        .map(Number).filter(Number.isInteger);
      await sql`UPDATE articles SET story_ids = ${ids} WHERE id = ${id}`;
    }
    if (typeof b.sort_order !== 'undefined' && Number.isFinite(+b.sort_order)) {
      await sql`UPDATE articles SET sort_order = ${+b.sort_order} WHERE id = ${id}`;
    }

    if (typeof b.status !== 'undefined') {
      if (STATUSES.indexOf(b.status) < 0) {
        return res.status(400).json({ ok: false, error: 'bad_status' });
      }
      if (b.status === 'published') {
        // Publishing is the one irreversible-feeling action here, so it checks
        // that there is actually an article to publish.
        const { rows } = await sql`
          SELECT title_topic, jsonb_array_length(blocks) AS n FROM articles WHERE id = ${id}
        `;
        if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
        if (!rows[0].title_topic || !rows[0].n) {
          return res.status(400).json({ ok: false, error: 'incomplete',
            message: 'צריך כותרת משנית ולפחות בלוק אחד לפני פרסום.' });
        }
        await sql`UPDATE articles SET status = 'published',
                  published_at = COALESCE(published_at, now()) WHERE id = ${id}`;
      } else {
        await sql`UPDATE articles SET status = ${b.status} WHERE id = ${id}`;
      }
    }

    await sql`UPDATE articles SET updated_at = now() WHERE id = ${id}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin/articles update error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

async function remove(req, res) {
  const id = parseInt((req.body || {}).id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  try {
    await sql`DELETE FROM articles WHERE id = ${id}`;
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin/articles delete error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}
