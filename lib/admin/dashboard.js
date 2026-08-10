// /api/admin/dashboard — the "what should I do next" summary.
//
// Deliberately small: three next-action buckets plus a few counts. No funnels,
// no scoring, no analytics. Optional ?campaign_id=N, otherwise the newest
// active campaign is used.

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

const EMPTY = {
  ok: true, migration_needed: true,
  totals: { contacts: 0, campaigns: 0, activities: 0 },
  by_category: [], by_record_type: [], by_country: [],
  campaign: null, campaign_counts: {},
  next_actions: { ready: [], follow_up: [], replied: [] },
  recent: []
};

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const totals = {
      contacts: (await sql`SELECT count(*)::int AS n FROM contacts`).rows[0].n,
      campaigns: (await sql`SELECT count(*)::int AS n FROM campaigns WHERE status = 'active'`).rows[0].n,
      activities: (await sql`SELECT count(*)::int AS n FROM outreach_activities`).rows[0].n
    };

    const by_category = (await sql`
      SELECT COALESCE(NULLIF(category, ''), 'ללא קטגוריה') AS label, count(*)::int AS n
      FROM contacts GROUP BY 1 ORDER BY n DESC
    `).rows;

    const by_record_type = (await sql`
      SELECT COALESCE(NULLIF(record_type, ''), 'person') AS label, count(*)::int AS n
      FROM contacts GROUP BY 1 ORDER BY n DESC
    `).rows;

    const by_country = (await sql`
      SELECT COALESCE(NULLIF(country, ''), '—') AS label, count(*)::int AS n
      FROM contacts WHERE country IS NOT NULL AND country <> '' GROUP BY 1 ORDER BY n DESC
    `).rows;

    let campaign = null;
    if (req.query.campaign_id) {
      campaign = (await sql`SELECT * FROM campaigns WHERE id = ${Number(req.query.campaign_id)}`).rows[0] || null;
    }
    if (!campaign) {
      campaign = (await sql`
        SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
      `).rows[0] || null;
    }

    let campaign_counts = {};
    let next_actions = { ready: [], follow_up: [], replied: [] };

    if (campaign) {
      (await sql`
        SELECT status, count(*)::int AS n FROM campaign_contacts
        WHERE campaign_id = ${campaign.id} GROUP BY status
      `).rows.forEach(function (r) { campaign_counts[r.status] = r.n; });

      next_actions.ready = (await sql`
        SELECT c.id, c.name, c.organisation, c.kibbutz, c.category, c.preferred_method,
               c.email, c.phone, c.whatsapp, c.facebook_url, cc.status
        FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
        WHERE cc.campaign_id = ${campaign.id} AND cc.status = 'ready'
        ORDER BY lower(c.name) LIMIT 100
      `).rows;

      next_actions.follow_up = (await sql`
        SELECT c.id, c.name, c.organisation, c.kibbutz, c.category, c.preferred_method,
               c.email, c.phone, c.whatsapp, c.facebook_url,
               cc.status, cc.next_follow_up_date
        FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
        WHERE cc.campaign_id = ${campaign.id}
          AND (cc.status = 'follow_up_needed'
               OR (cc.next_follow_up_date IS NOT NULL AND cc.next_follow_up_date <= CURRENT_DATE))
        ORDER BY cc.next_follow_up_date NULLS LAST, lower(c.name) LIMIT 100
      `).rows;

      next_actions.replied = (await sql`
        SELECT c.id, c.name, c.organisation, c.kibbutz, c.category, c.preferred_method,
               c.email, c.phone, c.whatsapp, c.facebook_url, cc.status
        FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
        WHERE cc.campaign_id = ${campaign.id} AND cc.status = 'replied'
        ORDER BY lower(c.name) LIMIT 100
      `).rows;
    }

    const recent = (await sql`
      SELECT a.id, a.activity_date, a.type, a.note, a.contact_id,
             c.name AS contact_name, cp.name AS campaign_name
      FROM outreach_activities a
      JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN campaigns cp ON cp.id = a.campaign_id
      ORDER BY a.activity_date DESC, a.id DESC LIMIT 12
    `).rows;

    res.status(200).json({
      ok: true, totals: totals, by_category: by_category,
      by_record_type: by_record_type, by_country: by_country,
      campaign: campaign, campaign_counts: campaign_counts,
      next_actions: next_actions, recent: recent
    });
  } catch (err) {
    if (U.isMissingTable(err)) {
      console.error('admin/dashboard: tables missing, run migrate-distribution.sql');
      return res.status(200).json(EMPTY);
    }
    console.error('admin/dashboard error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
