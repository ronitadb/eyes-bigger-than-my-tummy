// היסטוריית שליחות — what was sent, when, to whom, and what failed.
//
// Reads email_logs, which is written a row at a time as each message goes out.
// That record survives whatever the screen did — it is the reason we could tell
// that 46 of 46 landed after the result message had already erased itself.
//
// Lives outside /api, so it costs no serverless function.
//
// It reports what THIS SITE did: whether Resend accepted each message. Whether
// the message then reached the person is Resend's to know, not ours.

const { sql } = require('../db');
const { checkAdmin } = require('../auth');

module.exports = async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // ?missing=<template_id> — active participants with no successful send of
  // that letter. People register between mailings, so after every send there is
  // a small group who never got it, and nothing until now showed who.
  const missingFor = parseInt(req.query.missing, 10);
  if (Number.isInteger(missingFor)) {
    try {
      const { rows } = await sql`
        SELECT p.id, p.name, p.first_name, p.email, p.joined_at
        FROM zoom_participants p
        WHERE p.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM email_logs l
            WHERE l.participant_id = p.id
              AND l.template_id = ${missingFor}
              AND l.status = 'sent'
          )
        ORDER BY p.joined_at DESC
      `;
      return res.status(200).json({ ok: true, missing: rows });
    } catch (err) {
      console.error('admin/send-log missing error:', err);
      return res.status(500).json({ ok: false, error: 'db_error', message: err.message });
    }
  }

  try {
    // Participant details come along so a failure can be acted on directly
    // rather than sending the reader back to another screen to look up who.
    const { rows } = await sql`
      SELECT l.id, l.email_type, l.meeting_id, l.sent_at, l.status, l.error,
             p.name, p.first_name, p.email,
             m.title AS meeting_title, t.name AS template_name
      FROM email_logs l
      LEFT JOIN zoom_participants p ON p.id = l.participant_id
      LEFT JOIN zoom_meetings     m ON m.id = l.meeting_id
      LEFT JOIN email_templates   t ON t.id = l.template_id
      ORDER BY l.sent_at DESC
      LIMIT 2000
    `;
    res.status(200).json({ ok: true, logs: rows });
  } catch (err) {
    console.error('admin/send-log error:', err);
    res.status(500).json({ ok: false, error: 'db_error', message: err.message });
  }
};
