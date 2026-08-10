// /api/admin/import — CSV import in two passes.
//
//   POST {mode:'preview', rows:[...]}  -> per-row duplicate warnings, writes nothing
//   POST {mode:'commit',  rows:[...]}  -> creates the rows the user approved
//
// The CSV is parsed and column-mapped in the browser, so this endpoint only ever
// sees already-mapped field objects. Vercel caps a request body at ~4.5 MB, so
// the client sends batches (see IMPORT_BATCH in admin/network.js) — each call is
// independent and safe to retry.

const { checkAdmin } = require('../auth');
const U = require('../outreach-common');
const sql = U.sql;

const MAX_ROWS = 500;

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const b = U.parseBody(req);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'no_rows' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ ok: false, error: 'too_many_rows', max: MAX_ROWS });

    const index = await U.loadDuplicateIndex();

    if (b.mode === 'preview') {
      const results = rows.map(function (raw, i) {
        const values = U.mergeContactValues(raw, null);
        if (!values.name) return { index: i, error: 'missing_name', duplicates: [] };
        return { index: i, name: values.name, duplicates: U.findDuplicates(values, index, null) };
      });
      return res.status(200).json({ ok: true, mode: 'preview', results: results });
    }

    // commit
    const campaignId = b.campaign_id ? Number(b.campaign_id) : null;
    const campaignStatus = U.CAMPAIGN_STATUSES.indexOf(b.campaign_status) > -1
      ? b.campaign_status : 'not_contacted';

    const created = [];
    const skipped = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const values = U.mergeContactValues(raw, null);
      if (!values.name) { skipped.push({ index: i, reason: 'missing_name' }); continue; }

      // Re-check against rows created earlier in this same batch, so a file that
      // repeats a contact twice doesn't sneak past the first-pass preview.
      if (!raw.force) {
        const dupes = U.findDuplicates(values, index, null);
        if (dupes.length) { skipped.push({ index: i, reason: 'duplicate', name: values.name, duplicates: dupes }); continue; }
      }

      const contact = await U.insertContact(values);
      index.push(contact);

      const tags = Array.isArray(raw.tags)
        ? raw.tags
        : String(raw.tags || '').split(/[;,|]/);
      await U.setContactTags(contact.id, tags);

      if (campaignId) {
        await sql`
          INSERT INTO campaign_contacts (campaign_id, contact_id, status)
          VALUES (${campaignId}, ${contact.id}, ${campaignStatus})
          ON CONFLICT (campaign_id, contact_id) DO NOTHING
        `;
      }
      created.push({ index: i, id: contact.id, name: contact.name });
    }

    res.status(200).json({ ok: true, mode: 'commit', created: created, skipped: skipped });
  } catch (err) {
    if (U.isMissingTable(err)) {
      return res.status(200).json({ ok: false, error: 'migration_needed' });
    }
    console.error('admin/import error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};
