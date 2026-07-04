const { sql } = require('../db/connection');
const { checkAdmin } = require('./auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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
      const header = 'שם,אימייל,סטטוס,תאריך הצטרפות,תאריך הסרה,הערות';
      const lines = rows.map(r =>
        [r.name, r.email, r.status, fmtDate(r.joined_at), fmtDate(r.unsubscribed_at), r.notes || '']
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

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}
