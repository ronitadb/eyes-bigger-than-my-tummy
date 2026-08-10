// /api/admin/activities — the chronological outreach history.
//
// Every contact keeps its full trail, not just the latest status. Logging an
// activity can optionally move the per-campaign status in the same request,
// which is how the UI keeps "what I did" and "where this stands" in sync.
//
//   GET    ?contact_id=N | ?campaign_id=N | ?due=1 | (none = recent)
//   POST   -> log an activity (optionally with set_status for a campaign)
//   PUT    -> edit an activity
//   DELETE -> remove an activity

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') return list(req, res);
    if (req.method === 'POST') return create(U.parseBody(req), res);
    if (req.method === 'PUT') return update(U.parseBody(req), res);
    if (req.method === 'DELETE') return remove(req, res);

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    if (U.isMissingTable(err)) {
      console.error('admin/activities: tables missing, run migrate-distribution.sql');
      if (req.method === 'GET') {
        return res.status(200).json({ ok: true, activities: [], migration_needed: true });
      }
      return res.status(503).json({ ok: false, error: 'migration_needed' });
    }
    console.error('admin/activities error:', err);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
};

async function list(req, res) {
  let rows;
  if (req.query.contact_id) {
    rows = (await sql`
      SELECT a.*, c.name AS campaign_name, ct.name AS contact_name
      FROM outreach_activities a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.contact_id = ${Number(req.query.contact_id)}
      ORDER BY a.activity_date DESC, a.id DESC
    `).rows;
  } else if (req.query.campaign_id) {
    rows = (await sql`
      SELECT a.*, c.name AS campaign_name, ct.name AS contact_name
      FROM outreach_activities a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.campaign_id = ${Number(req.query.campaign_id)}
      ORDER BY a.activity_date DESC, a.id DESC
    `).rows;
  } else if (req.query.due) {
    rows = (await sql`
      SELECT a.*, c.name AS campaign_name, ct.name AS contact_name
      FROM outreach_activities a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      JOIN contacts ct ON ct.id = a.contact_id
      WHERE a.next_follow_up_date IS NOT NULL AND a.next_follow_up_date <= CURRENT_DATE
      ORDER BY a.next_follow_up_date ASC
    `).rows;
  } else {
    rows = (await sql`
      SELECT a.*, c.name AS campaign_name, ct.name AS contact_name
      FROM outreach_activities a
      LEFT JOIN campaigns c ON c.id = a.campaign_id
      JOIN contacts ct ON ct.id = a.contact_id
      ORDER BY a.activity_date DESC, a.id DESC
      LIMIT 200
    `).rows;
  }
  res.status(200).json({ ok: true, activities: rows });
}

async function create(b, res) {
  const contactId = Number(b.contact_id);
  if (!contactId) return res.status(400).json({ ok: false, error: 'missing_contact_id' });
  const campaignId = b.campaign_id ? Number(b.campaign_id) : null;

  const { rows } = await sql`
    INSERT INTO outreach_activities (contact_id, campaign_id, activity_date, type, note, next_follow_up_date)
    VALUES (${contactId}, ${campaignId},
            ${U.dateOrNull(b.activity_date) || new Date().toISOString().slice(0, 10)},
            ${U.str(b.type)}, ${U.str(b.note)}, ${U.dateOrNull(b.next_follow_up_date)})
    RETURNING *
  `;

  // Keep the per-campaign state aligned with what was just logged, when asked.
  if (campaignId && b.set_status && U.CAMPAIGN_STATUSES.indexOf(b.set_status) > -1) {
    await sql`
      INSERT INTO campaign_contacts (campaign_id, contact_id, status, next_follow_up_date)
      VALUES (${campaignId}, ${contactId}, ${b.set_status}, ${U.dateOrNull(b.next_follow_up_date)})
      ON CONFLICT (campaign_id, contact_id) DO UPDATE SET
        status = EXCLUDED.status,
        next_follow_up_date = EXCLUDED.next_follow_up_date,
        updated_at = now()
    `;
  } else if (campaignId && U.dateOrNull(b.next_follow_up_date)) {
    await sql`
      UPDATE campaign_contacts SET next_follow_up_date = ${U.dateOrNull(b.next_follow_up_date)}, updated_at = now()
      WHERE campaign_id = ${campaignId} AND contact_id = ${contactId}
    `;
  }

  res.status(201).json({ ok: true, activity: rows[0] });
}

async function update(b, res) {
  const id = Number(b.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  const existing = (await sql`SELECT * FROM outreach_activities WHERE id = ${id}`).rows[0];
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const has = function (k) { return Object.prototype.hasOwnProperty.call(b, k); };
  const { rows } = await sql`
    UPDATE outreach_activities SET
      activity_date = ${has('activity_date') ? (U.dateOrNull(b.activity_date) || existing.activity_date) : existing.activity_date},
      type = ${has('type') ? U.str(b.type) : existing.type},
      note = ${has('note') ? U.str(b.note) : existing.note},
      next_follow_up_date = ${has('next_follow_up_date') ? U.dateOrNull(b.next_follow_up_date) : existing.next_follow_up_date},
      campaign_id = ${has('campaign_id') ? (b.campaign_id ? Number(b.campaign_id) : null) : existing.campaign_id}
    WHERE id = ${id}
    RETURNING *
  `;
  res.status(200).json({ ok: true, activity: rows[0] });
}

async function remove(req, res) {
  const b = U.parseBody(req);
  const id = Number(b.id || req.query.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  await sql`DELETE FROM outreach_activities WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}
