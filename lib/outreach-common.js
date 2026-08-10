// Shared helpers for the distribution & outreach admin handlers.
// Lives outside /api so it is bundled as an import and does not count against
// the Vercel Hobby 12-function limit.

const { sql } = require('./db');

// Every writable column on `contacts`, in one place. Only `name` is required.
const CONTACT_FIELDS = [
  'name', 'record_type', 'organisation', 'kibbutz', 'country', 'city_region',
  'category', 'subcategory_role', 'gatekeeper_name', 'gatekeeper_position',
  'email', 'phone', 'whatsapp', 'website', 'facebook_url', 'instagram_url',
  'other_url', 'preferred_method', 'relevance', 'source', 'source_url',
  'source_notes', 'notes'
];

// Statuses currently in use. Kept as a plain list (no DB CHECK constraint) so
// new ones can be added here without a migration.
const CAMPAIGN_STATUSES = [
  'not_contacted', 'ready', 'contacted', 'follow_up_needed', 'replied',
  'agreed_to_share', 'shared', 'declined', 'no_response', 'not_relevant',
  'do_not_contact'
];

function parseBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return typeof req.body === 'object' && req.body !== null ? req.body : {};
}

// True when the failure is just "the migration hasn't been run yet", so callers
// can degrade to an empty-but-working screen instead of a 500.
function isMissingTable(err) {
  if (!err) return false;
  if (err.code === '42P01' || err.code === '42703') return true;
  return /relation .* does not exist|column .* does not exist/i.test(err.message || '');
}

function str(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function dateOrNull(v) {
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Normalisers used only for duplicate detection — never for storage.
function normText(v) {
  const s = str(v);
  return s ? s.toLowerCase().replace(/\s+/g, ' ') : '';
}

function normPhone(v) {
  const s = str(v);
  if (!s) return '';
  const digits = s.replace(/\D/g, '').replace(/^972/, '').replace(/^0+/, '');
  return digits.length >= 7 ? digits.slice(-9) : '';
}

function normUrl(v) {
  const s = str(v);
  if (!s) return '';
  return s.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

// Warn, never merge. Returns the existing records a candidate might duplicate,
// each with the human-readable reasons it matched.
function findDuplicates(candidate, existingRows, excludeId) {
  const cEmail = normText(candidate.email);
  const cPhones = [normPhone(candidate.phone), normPhone(candidate.whatsapp)].filter(Boolean);
  const cUrls = [candidate.website, candidate.facebook_url, candidate.instagram_url, candidate.other_url]
    .map(normUrl).filter(Boolean);
  const cFb = normUrl(candidate.facebook_url);
  const cName = normText(candidate.name);
  const cOrg = normText(candidate.organisation);

  const out = [];
  existingRows.forEach(function (row) {
    if (excludeId && row.id === Number(excludeId)) return;
    const reasons = [];

    if (cEmail && normText(row.email) === cEmail) reasons.push('אותה כתובת מייל');

    const rPhones = [normPhone(row.phone), normPhone(row.whatsapp)].filter(Boolean);
    if (cPhones.some(function (p) { return rPhones.indexOf(p) > -1; })) reasons.push('אותו מספר טלפון');

    const rFb = normUrl(row.facebook_url);
    if (cFb && rFb === cFb) reasons.push('אותו עמוד פייסבוק');

    const rUrls = [row.website, row.facebook_url, row.instagram_url, row.other_url]
      .map(normUrl).filter(Boolean);
    if (cUrls.some(function (u) { return rUrls.indexOf(u) > -1; }) && reasons.indexOf('אותו עמוד פייסבוק') < 0) {
      reasons.push('אותו קישור');
    }

    if (cName && normText(row.name) === cName) {
      if (cOrg && normText(row.organisation) === cOrg) reasons.push('אותו שם ואותו ארגון');
      else reasons.push('שם זהה');
    }

    if (reasons.length) {
      out.push({
        id: row.id, name: row.name, organisation: row.organisation,
        kibbutz: row.kibbutz, email: row.email, phone: row.phone,
        category: row.category, reasons: reasons
      });
    }
  });
  return out;
}

// The lean projection used for duplicate checks (avoids pulling every column).
async function loadDuplicateIndex() {
  const { rows } = await sql`
    SELECT id, name, organisation, kibbutz, category, email, phone, whatsapp,
           website, facebook_url, instagram_url, other_url
    FROM contacts
  `;
  return rows;
}

// Replaces a contact's tags with the given names, creating tags as needed.
async function setContactTags(contactId, tagNames) {
  const names = (Array.isArray(tagNames) ? tagNames : [])
    .map(str).filter(Boolean)
    .filter(function (n, i, a) { return a.indexOf(n) === i; });

  await sql`DELETE FROM contact_tags WHERE contact_id = ${contactId}`;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    await sql`INSERT INTO tags (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
    const { rows } = await sql`SELECT id FROM tags WHERE name = ${name}`;
    if (rows.length) {
      await sql`
        INSERT INTO contact_tags (contact_id, tag_id) VALUES (${contactId}, ${rows[0].id})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  return names;
}

async function insertContact(v) {
  const { rows } = await sql`
    INSERT INTO contacts (
      name, record_type, organisation, kibbutz, country, city_region,
      category, subcategory_role, gatekeeper_name, gatekeeper_position,
      email, phone, whatsapp, website, facebook_url, instagram_url,
      other_url, preferred_method, relevance, source, source_url,
      source_notes, notes
    ) VALUES (
      ${v.name}, ${v.record_type || 'person'}, ${v.organisation}, ${v.kibbutz}, ${v.country}, ${v.city_region},
      ${v.category}, ${v.subcategory_role}, ${v.gatekeeper_name}, ${v.gatekeeper_position},
      ${v.email}, ${v.phone}, ${v.whatsapp}, ${v.website}, ${v.facebook_url}, ${v.instagram_url},
      ${v.other_url}, ${v.preferred_method}, ${v.relevance}, ${v.source}, ${v.source_url},
      ${v.source_notes}, ${v.notes}
    )
    RETURNING *
  `;
  return rows[0];
}

async function updateContact(id, v) {
  const { rows } = await sql`
    UPDATE contacts SET
      name = ${v.name}, record_type = ${v.record_type || 'person'},
      organisation = ${v.organisation}, kibbutz = ${v.kibbutz},
      country = ${v.country}, city_region = ${v.city_region},
      category = ${v.category}, subcategory_role = ${v.subcategory_role},
      gatekeeper_name = ${v.gatekeeper_name}, gatekeeper_position = ${v.gatekeeper_position},
      email = ${v.email}, phone = ${v.phone}, whatsapp = ${v.whatsapp},
      website = ${v.website}, facebook_url = ${v.facebook_url},
      instagram_url = ${v.instagram_url}, other_url = ${v.other_url},
      preferred_method = ${v.preferred_method}, relevance = ${v.relevance},
      source = ${v.source}, source_url = ${v.source_url},
      source_notes = ${v.source_notes}, notes = ${v.notes},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0];
}

// Merges a partial body over an existing row so PUT can be partial while the
// UPDATE statement stays a fixed, non-dynamic column list.
function mergeContactValues(body, existing) {
  const v = {};
  CONTACT_FIELDS.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(body, f)) v[f] = str(body[f]);
    else v[f] = existing ? (existing[f] === undefined ? null : existing[f]) : null;
  });
  return v;
}

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// BOM prefix so Hebrew opens correctly in Excel.
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach(function (r) { lines.push(r.map(csvCell).join(',')); });
  return '﻿' + lines.join('\r\n');
}

module.exports = {
  sql, CONTACT_FIELDS, CAMPAIGN_STATUSES,
  parseBody, isMissingTable, str, dateOrNull,
  normText, normPhone, normUrl,
  findDuplicates, loadDuplicateIndex, setContactTags,
  insertContact, updateContact, mergeContactValues,
  toCsv
};
