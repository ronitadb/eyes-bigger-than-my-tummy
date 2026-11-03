const { sql } = require('../db');
const { checkAdmin } = require('../auth');
const { isValidType } = require('../participant-types');
const { sendEmail, unsubscribeUrl, renderTemplate } = require('../email');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method === 'PUT') {
    return handlePut(req, res);
  }
  if (req.method === 'POST') {
    return handleAdd(req, res);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const format = req.query.format || 'json';
  const statusFilter = req.query.status || 'all';

  try {
    let rows;
    if (statusFilter === 'active') {
      ({ rows } = await sql`
        SELECT * FROM zoom_participants WHERE status = 'active' ORDER BY joined_at DESC
      `);
    } else if (statusFilter === 'unsubscribed') {
      ({ rows } = await sql`
        SELECT * FROM zoom_participants WHERE status = 'unsubscribed' ORDER BY unsubscribed_at DESC
      `);
    } else {
      ({ rows } = await sql`
        SELECT * FROM zoom_participants ORDER BY joined_at DESC
      `);
    }

    if (format === 'csv') {
      const header = 'שם,אימייל,סדרת מפגשים,סטטוס,תאריך הצטרפות,תאריך הסרה,הערות';
      const lines = rows.map(r =>
        [r.name, r.email, r.participant_type || '', r.status, fmtDate(r.joined_at), fmtDate(r.unsubscribed_at), r.notes || '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = '﻿' + header + '\n' + lines.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="zoom-participants.csv"');
      return res.status(200).send(csv);
    }

    res.status(200).json({ ok: true, participants: rows });
  } catch (err) {
    console.error('admin/participants error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
};

async function handlePut(req, res) {
  const { id, status, participant_type: participantType, first_name: firstName, email } = req.body || {};

  if (!id || (!status && typeof participantType === 'undefined'
      && typeof firstName === 'undefined' && typeof email === 'undefined')) {
    return res.status(400).json({ ok: false, error: 'missing id or a field to change' });
  }

  // Correcting a mistyped address. The unsubscribe link is derived from the
  // address, so an old link stops working once this changes — which is correct:
  // it belonged to an address that was never theirs.
  if (typeof email !== 'undefined') {
    const clean = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      return res.status(400).json({ ok: false, error: 'invalid_email', message: 'כתובת מייל לא תקינה.' });
    }
    try {
      await sql`UPDATE zoom_participants SET email = ${clean} WHERE id = ${id}`;
    } catch (err) {
      if (err && err.code === '23505') {
        return res.status(400).json({ ok: false, error: 'duplicate_email',
          message: 'הכתובת הזו כבר רשומה אצל משתתף אחר.' });
      }
      console.error('admin/participants email update failed:', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }
    if (!status && typeof participantType === 'undefined' && typeof firstName === 'undefined') {
      return res.status(200).json({ ok: true });
    }
  }

  // The greeting name. Blank clears it, which makes the email fall back to the
  // full name rather than greeting nobody.
  if (typeof firstName !== 'undefined') {
    const clean = String(firstName).trim().slice(0, 60) || null;
    try {
      await sql`UPDATE zoom_participants SET first_name = ${clean} WHERE id = ${id}`;
    } catch (err) {
      console.error('admin/participants first_name update failed:', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }
    if (!status && typeof participantType === 'undefined') {
      return res.status(200).json({ ok: true });
    }
  }

  // Group change. Deliberately silent — no confirmation email is sent, since
  // Ronit is already in conversation with anyone who asks to be moved.
  if (typeof participantType !== 'undefined') {
    if (!isValidType(participantType)) {
      return res.status(400).json({ ok: false, error: 'invalid participant_type' });
    }
    try {
      await sql`UPDATE zoom_participants SET participant_type = ${participantType} WHERE id = ${id}`;
    } catch (err) {
      console.error('admin/participants participant_type update failed:', err);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }
    if (!status) return res.status(200).json({ ok: true });
  }

  if (status !== 'active' && status !== 'unsubscribed') {
    return res.status(400).json({ ok: false, error: 'invalid status' });
  }

  try {
    if (status === 'unsubscribed') {
      await sql`
        UPDATE zoom_participants
        SET status = 'unsubscribed', unsubscribed_at = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE zoom_participants
        SET status = 'active', unsubscribed_at = NULL
        WHERE id = ${id}
      `;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin/participants PUT error:', err);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
}

// Registering someone by hand — a person who asked Ronit directly rather than
// filling the form. Same record as a sign-up through api/join.js; the join
// confirmation goes out only if she leaves that box ticked.
async function handleAdd(req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const type = String(b.participant_type || '');
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'invalid_name', message: 'צריך שם.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email', message: 'כתובת מייל לא תקינה.' });
  }
  if (!isValidType(type)) return res.status(400).json({ ok: false, error: 'invalid_type', message: 'צריך לבחור קבוצה.' });
  const firstName = String(b.first_name || '').trim().slice(0, 60) || name.split(/\s+/)[0];

  try {
    const { rows: existing } = await sql`SELECT id, status FROM zoom_participants WHERE email = ${email}`;
    if (existing.length && existing[0].status === 'active') {
      return res.status(400).json({ ok: false, error: 'already_active',
        message: 'הכתובת הזו כבר רשומה ופעילה. אפשר לשנות לה קבוצה ברשימה.' });
    }
    if (existing.length) {
      // Someone who unsubscribed earlier and asked back in.
      await sql`
        UPDATE zoom_participants
        SET status = 'active', name = ${name}, first_name = ${firstName}, participant_type = ${type},
            unsubscribed_at = NULL, joined_at = now()
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO zoom_participants (name, email, first_name, participant_type)
        VALUES (${name}, ${email}, ${firstName}, ${type})
      `;
    }

    let confirmationSent = false;
    if (b.send_confirmation) {
      try {
        const { rows: t } = await sql`
          SELECT subject, body FROM email_templates WHERE template_type = 'join_confirmation'
        `;
        if (t.length) {
          const { subject, html } = renderTemplate(t[0].body, t[0].subject,
            { name, first_name: firstName, unsubscribe_url: unsubscribeUrl(email) });
          await sendEmail({ to: email, subject, html });
          confirmationSent = true;
          await sql`UPDATE zoom_participants SET last_confirmation_sent_at = now() WHERE email = ${email}`;
        }
      } catch (e) {
        console.error('admin/participants add: confirmation failed:', e);
      }
    }
    return res.status(200).json({ ok: true, reactivated: existing.length > 0, confirmation_sent: confirmationSent });
  } catch (err) {
    console.error('admin/participants add error:', err);
    return res.status(500).json({ ok: false, error: 'db_error', message: 'שגיאת שרת.' });
  }
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}
