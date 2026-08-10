// /api/admin/contacts — the permanent contact/channel records.
//
//   GET    ?                 -> every contact, with tags, campaign states and
//                               last-activity folded in (the client filters)
//   GET    ?id=N             -> one contact + tags + campaigns + full history
//   GET    ?format=csv       -> CSV export of everything
//   POST                     -> create (warns on duplicates unless confirm:true)
//   POST   {check_only:true} -> duplicate check without writing
//   PUT                      -> partial update
//   DELETE                   -> remove
//
// Filtering/search happens in the browser on the full list: this is an internal
// notebook with a few thousand rows at most, and it keeps the SQL free of any
// dynamic query building (@vercel/postgres only gives us tagged templates).

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query.id) return detail(req, res);
      if (req.query.format === 'csv') return exportCsv(req, res);
      return list(req, res);
    }
    if (req.method === 'POST') return create(req, res);
    if (req.method === 'PUT') return update(req, res);
    if (req.method === 'DELETE') return remove(req, res);

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    if (U.isMissingTable(err)) {
      console.error('admin/contacts: tables missing, run migrate-distribution.sql');
      return res.status(200).json({ ok: true, contacts: [], tags: [], campaigns: [], migration_needed: true });
    }
    console.error('admin/contacts error:', err);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
};

async function list(req, res) {
  const contacts = (await sql`SELECT * FROM contacts ORDER BY lower(name) ASC`).rows;

  const tagRows = (await sql`
    SELECT ct.contact_id, t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
  `).rows;

  const ccRows = (await sql`
    SELECT cc.contact_id, cc.campaign_id, cc.status, cc.next_follow_up_date, c.name AS campaign_name
    FROM campaign_contacts cc JOIN campaigns c ON c.id = cc.campaign_id
  `).rows;

  const actRows = (await sql`
    SELECT contact_id, max(activity_date) AS last_activity, count(*)::int AS activity_count
    FROM outreach_activities GROUP BY contact_id
  `).rows;

  const allTags = (await sql`SELECT id, name FROM tags ORDER BY name ASC`).rows;
  const campaigns = (await sql`SELECT id, name, status FROM campaigns ORDER BY created_at DESC`).rows;

  const byId = {};
  contacts.forEach(function (c) {
    c.tags = []; c.campaigns = []; c.last_activity = null; c.activity_count = 0;
    byId[c.id] = c;
  });
  tagRows.forEach(function (r) { if (byId[r.contact_id]) byId[r.contact_id].tags.push(r.name); });
  ccRows.forEach(function (r) {
    if (!byId[r.contact_id]) return;
    byId[r.contact_id].campaigns.push({
      campaign_id: r.campaign_id, campaign_name: r.campaign_name,
      status: r.status, next_follow_up_date: r.next_follow_up_date
    });
  });
  actRows.forEach(function (r) {
    if (!byId[r.contact_id]) return;
    byId[r.contact_id].last_activity = r.last_activity;
    byId[r.contact_id].activity_count = r.activity_count;
  });

  res.status(200).json({ ok: true, contacts: contacts, tags: allTags, campaigns: campaigns });
}

async function detail(req, res) {
  const id = Number(req.query.id);
  const { rows } = await sql`SELECT * FROM contacts WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
  const contact = rows[0];

  contact.tags = (await sql`
    SELECT t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = ${id}
    ORDER BY t.name
  `).rows.map(function (r) { return r.name; });

  contact.campaigns = (await sql`
    SELECT cc.campaign_id, cc.status, cc.next_follow_up_date, cc.notes, c.name AS campaign_name
    FROM campaign_contacts cc JOIN campaigns c ON c.id = cc.campaign_id
    WHERE cc.contact_id = ${id}
    ORDER BY c.created_at DESC
  `).rows;

  const activities = (await sql`
    SELECT a.*, c.name AS campaign_name
    FROM outreach_activities a LEFT JOIN campaigns c ON c.id = a.campaign_id
    WHERE a.contact_id = ${id}
    ORDER BY a.activity_date DESC, a.id DESC
  `).rows;

  res.status(200).json({ ok: true, contact: contact, activities: activities });
}

async function create(req, res) {
  const b = U.parseBody(req);
  const values = U.mergeContactValues(b, null);
  if (!values.name) return res.status(400).json({ ok: false, error: 'missing_name' });

  if (!b.confirm || b.check_only) {
    const duplicates = U.findDuplicates(values, await U.loadDuplicateIndex(), null);
    if (b.check_only) return res.status(200).json({ ok: true, duplicates: duplicates });
    if (duplicates.length) {
      return res.status(200).json({ ok: false, error: 'duplicates', duplicates: duplicates });
    }
  }

  const contact = await U.insertContact(values);
  contact.tags = await U.setContactTags(contact.id, b.tags);

  // Optional: drop the new contact straight into a campaign from the quick-add form.
  if (b.campaign_id) {
    await sql`
      INSERT INTO campaign_contacts (campaign_id, contact_id, status)
      VALUES (${Number(b.campaign_id)}, ${contact.id}, ${b.campaign_status || 'not_contacted'})
      ON CONFLICT (campaign_id, contact_id) DO NOTHING
    `;
  }

  res.status(201).json({ ok: true, contact: contact });
}

async function update(req, res) {
  const b = U.parseBody(req);
  const id = Number(b.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });

  const existing = (await sql`SELECT * FROM contacts WHERE id = ${id}`).rows[0];
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const values = U.mergeContactValues(b, existing);
  if (!values.name) return res.status(400).json({ ok: false, error: 'missing_name' });

  const contact = await U.updateContact(id, values);
  if (Object.prototype.hasOwnProperty.call(b, 'tags')) {
    contact.tags = await U.setContactTags(id, b.tags);
  }
  res.status(200).json({ ok: true, contact: contact });
}

async function remove(req, res) {
  const b = U.parseBody(req);
  const id = Number(b.id || req.query.id);
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' });
  await sql`DELETE FROM contacts WHERE id = ${id}`;
  res.status(200).json({ ok: true });
}

const CSV_HEADERS = [
  'id', 'name', 'record_type', 'organisation', 'kibbutz', 'country', 'city_region',
  'category', 'subcategory_role', 'gatekeeper_name', 'gatekeeper_position',
  'email', 'phone', 'whatsapp', 'website', 'facebook_url', 'instagram_url',
  'other_url', 'preferred_method', 'relevance', 'source', 'source_url',
  'source_notes', 'notes', 'tags', 'campaigns', 'last_activity'
];

async function exportCsv(req, res) {
  const contacts = (await sql`SELECT * FROM contacts ORDER BY lower(name) ASC`).rows;
  const tagRows = (await sql`
    SELECT ct.contact_id, t.name FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
  `).rows;
  const ccRows = (await sql`
    SELECT cc.contact_id, cc.status, c.name AS campaign_name
    FROM campaign_contacts cc JOIN campaigns c ON c.id = cc.campaign_id
  `).rows;
  const actRows = (await sql`
    SELECT contact_id, max(activity_date) AS last_activity FROM outreach_activities GROUP BY contact_id
  `).rows;

  const tags = {}, camps = {}, last = {};
  tagRows.forEach(function (r) { (tags[r.contact_id] = tags[r.contact_id] || []).push(r.name); });
  ccRows.forEach(function (r) { (camps[r.contact_id] = camps[r.contact_id] || []).push(r.campaign_name + ': ' + r.status); });
  actRows.forEach(function (r) { last[r.contact_id] = r.last_activity; });

  const rows = contacts.map(function (c) {
    return CSV_HEADERS.map(function (h) {
      if (h === 'tags') return (tags[c.id] || []).join('; ');
      if (h === 'campaigns') return (camps[c.id] || []).join('; ');
      if (h === 'last_activity') return last[c.id] ? String(last[c.id]).slice(0, 10) : '';
      const v = c[h];
      return v instanceof Date ? v.toISOString().slice(0, 10) : v;
    });
  });

  const csv = U.toCsv(CSV_HEADERS, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.status(200).send(csv);
}
