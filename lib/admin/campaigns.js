// /api/admin/campaigns — campaigns and their per-campaign outreach state.
//
// campaign_contacts is deliberately the ONLY place a status lives: editing a
// contact's status here never touches the permanent contacts record.
//
//   GET    ?          -> campaigns + counts per status
//   GET    ?id=N      -> one campaign + its contacts with their state
//   POST              -> create a campaign
//   POST   {action}   -> membership ops: add | set_status | remove
//   PUT               -> update a campaign
//   DELETE            -> delete a campaign

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      return req.query.id ? detail(req, res) : list(req, res);
    }
    if (req.method === 'POST') {
      const b = U.parseBody(req);
      if (b.action) return membership(b, res);
      return create(b, res);
    }
    if (req.method === 'PUT') return update(U.parseBody(req), res);
    if (req.method === 'DELETE') return remove(req, res);

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    if (U.isMissingTable(err)) {
      console.error('admin/campaigns: tables missing, run migrate-distribution.sql');
      return res.status(200).json({ ok: true, campaigns: [], migration_needed: true });
    }
    console.error('admin/campaigns error:', err);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
};

async function list(req, res) {
  const campaigns = (await sql`SELECT * FROM campaigns ORDER BY status ASC, created_at DESC`).rows;
  const counts = (await sql`
    SELECT campaign_id, status, count(*)::int AS n FROM campaign_contacts GROUP BY campaign_id, status
  `).rows;

  const byId = {};
  campaigns.forEach(function (c) { c.counts = {}; c.total = 0; byId[c.id] = c; });
  counts.forEach(function (r) {
    if (!byId[r.campaign_id]) return;
    byId[r.campaign_id].counts[r.status] = r.n;
    byId[r.campaign_id].total += r.n;
  });

  res.status(200).json({ ok: true, campaigns: campaigns });
}

async function detail(req, res) {
  const id = Number(req.query.id);
  const { rows } = await sql`SELECT * FROM campaigns WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
  const campaign = rows[0];

  const members = (await sql`
    SELECT cc.id AS link_id, cc.status, cc.next_follow_up_date, cc.notes AS campaign_notes,
           cc.added_at,
           c.id, c.name, c.record_type, c.organisation, c.kibbutz, c.country,
           c.city_region, c.category, c.subcategory_role, c.gatekeeper_name,
           c.email, c.phone, c.whatsapp, c.facebook_url, c.website,
           c.preferred_method, c.relevance
    FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
    WHERE cc.campaign_id = ${id}
    ORDER BY lower(c.name) ASC
  `).rows;

  const lastAct = (await sql`
    SELECT contact_id, max(activity_date) AS last_activity
    FROM outreach_activities WHERE campaign_id = ${id} GROUP BY contact_id
  `).rows;
  const last = {};
  lastAct.forEach(function (r) { last[r.contact_id] = r.last_activity; });
  members.forEach(function (m) { m.last_activity = last[m.id] || null; });

  campaign.counts = {};
  members.forEach(function (m) { campaign.counts[m.status] = (campaign.counts[m.status] || 0) + 1; });
  campaign.total = members.length;

  res.status(200).json({ ok: true, campaign: campaign, members: members });
}

async function create(b, res) {
  const name = U.str(b.name);
  if (!name) return res.status(400).json({ ok: false, error: 'missing_name' });
  const { rows } = await sql`
    INSERT INTO campaigns (name, description, start_date, end_date, target_audience, main_link, flyer_ref, notes, status)
    VALUES (${name}, ${U.str(b.description)}, ${U.dateOrNull(b.start_date)}, ${U.dateOrNull(b.end_date)},
            ${U.str(b.target_audience)}, ${U.str(b.main_link)}, ${U.str(b.flyer_ref)}, ${U.str(b.notes)},
            ${b.status === 'archived' ? 'archived' : 'active'})
    RETURNING *
  `;
  res.status(201).json({ ok: true, campaign: rows[0] });
}

async function update(b, res) {
  const id = Number(b.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  const existing = (await sql`SELECT * FROM campaigns WHERE id = ${id}`).rows[0];
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const pick = function (k, fallbackFn) {
    return Object.prototype.hasOwnProperty.call(b, k) ? fallbackFn(b[k]) : existing[k];
  };
  const { rows } = await sql`
    UPDATE campaigns SET
      name = ${pick('name', U.str) || existing.name},
      description = ${pick('description', U.str)},
      start_date = ${pick('start_date', U.dateOrNull)},
      end_date = ${pick('end_date', U.dateOrNull)},
      target_audience = ${pick('target_audience', U.str)},
      main_link = ${pick('main_link', U.str)},
      flyer_ref = ${pick('flyer_ref', U.str)},
      notes = ${pick('notes', U.str)},
      status = ${pick('status', function (v) { return v === 'archived' ? 'archived' : 'active'; })},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  res.status(200).json({ ok: true, campaign: rows[0] });
}

async function remove(req, res) {
  const b = U.parseBody(req);
  const id = Number(b.id || req.query.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  await sql`DELETE FROM campaigns WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

async function membership(b, res) {
  const campaignId = Number(b.campaign_id);
  if (!campaignId) return res.status(400).json({ ok: false, error: 'missing_campaign_id' });

  if (b.action === 'add') {
    const ids = (Array.isArray(b.contact_ids) ? b.contact_ids : [b.contact_id])
      .map(Number).filter(Boolean);
    const status = U.CAMPAIGN_STATUSES.indexOf(b.status) > -1 ? b.status : 'not_contacted';
    let added = 0;
    for (let i = 0; i < ids.length; i++) {
      const r = await sql`
        INSERT INTO campaign_contacts (campaign_id, contact_id, status)
        VALUES (${campaignId}, ${ids[i]}, ${status})
        ON CONFLICT (campaign_id, contact_id) DO NOTHING
        RETURNING id
      `;
      if (r.rows.length) added++;
    }
    return res.status(200).json({ ok: true, added: added, skipped: ids.length - added });
  }

  if (b.action === 'set_status') {
    const contactId = Number(b.contact_id);
    if (!contactId) return res.status(400).json({ ok: false, error: 'missing_contact_id' });
    const status = U.CAMPAIGN_STATUSES.indexOf(b.status) > -1 ? b.status : null;
    if (!status) return res.status(400).json({ ok: false, error: 'bad_status' });

    // Resolve the partial update in JS: an omitted field keeps whatever is
    // already stored, so setting a status never silently clears a follow-up date.
    const prev = (await sql`
      SELECT * FROM campaign_contacts WHERE campaign_id = ${campaignId} AND contact_id = ${contactId}
    `).rows[0] || {};
    const nextFollow = Object.prototype.hasOwnProperty.call(b, 'next_follow_up_date')
      ? U.dateOrNull(b.next_follow_up_date)
      : (prev.next_follow_up_date || null);
    const notes = Object.prototype.hasOwnProperty.call(b, 'notes')
      ? U.str(b.notes)
      : (prev.notes || null);

    const { rows } = await sql`
      INSERT INTO campaign_contacts (campaign_id, contact_id, status, next_follow_up_date, notes)
      VALUES (${campaignId}, ${contactId}, ${status}, ${nextFollow}, ${notes})
      ON CONFLICT (campaign_id, contact_id) DO UPDATE SET
        status = EXCLUDED.status,
        next_follow_up_date = EXCLUDED.next_follow_up_date,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `;
    return res.status(200).json({ ok: true, link: rows[0] });
  }

  if (b.action === 'remove') {
    const contactId = Number(b.contact_id);
    if (!contactId) return res.status(400).json({ ok: false, error: 'missing_contact_id' });
    await sql`DELETE FROM campaign_contacts WHERE campaign_id = ${campaignId} AND contact_id = ${contactId}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: 'bad_action' });
}
