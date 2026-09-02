const { sql } = require('../db');
const { checkAdmin } = require('../auth');
const { sendEmail, unsubscribeUrl, formatDate, formatTime, renderTemplate } = require('../email');

// Resend's free plan allows 2 requests per second. A tight await-loop over 41
// recipients runs faster than that and starts collecting 429s, which would
// silently leave some people without the email. Pace the sends instead.
const MIN_INTERVAL_MS = 550;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const meetingId = parseInt(body.meeting_id, 10);
  const templateType = String(body.template_type || '');
  // A specific saved letter. Without it we fall back to type, which is how the
  // reminder cron and join confirmations still resolve.
  const templateId = Number.isInteger(parseInt(body.template_id, 10))
    ? parseInt(body.template_id, 10) : null;
  // A standalone update goes to every active participant and belongs to no
  // meeting, so the meeting-shaped variables simply have nothing to fill them.
  const isStandalone = !meetingId;
  const attachments = Array.isArray(body.attachments) ? body.attachments : null;
  // A test send goes to exactly one address and touches nobody on the list.
  const testTo = typeof body.test_to === 'string' ? body.test_to.trim() : '';
  // Send only to people who never received this particular letter — the group
  // that registered after it went out.
  const onlyMissing = body.only_missing === true || body.only_missing === 'true';

  if (!templateType && !templateId) {
    return res.status(400).json({ ok: false, error: 'missing_fields', message: 'template_type required' });
  }

  try {
    let meeting = null;
    if (!isStandalone) {
      const { rows: meetings } = await sql`SELECT * FROM zoom_meetings WHERE id = ${meetingId}`;
      if (!meetings.length) {
        return res.status(404).json({ ok: false, error: 'meeting_not_found' });
      }
      meeting = meetings[0];
    }

    const { rows: templates } = templateId
      ? await sql`SELECT * FROM email_templates WHERE id = ${templateId}`
      : await sql`SELECT * FROM email_templates WHERE template_type = ${templateType} ORDER BY updated_at DESC`;
    if (!templates.length) {
      return res.status(404).json({ ok: false, error: 'template_not_found' });
    }
    const template = templates[0];

    // Guard against a meeting-specific template being sent with no meeting: the
    // placeholders would render as blanks and nobody would know when to turn up.
    if (isStandalone && /\{\{\s*(title|date|time|zoom_link)\s*\}\}/.test(template.body + template.subject)) {
      return res.status(400).json({
        ok: false, error: 'template_needs_meeting',
        message: 'התבנית משתמשת בפרטי מפגש ({{title}}, {{date}} וכו׳) — יש לבחור מפגש.'
      });
    }

    let participants;
    if (testTo) {
      // Prefer the real row if this address is already registered, so the test
      // is byte-for-byte what that person would receive. Otherwise synthesise
      // one — never invent a participant record in the database for a test.
      const { rows } = await sql`
        SELECT id, name, email, first_name FROM zoom_participants WHERE email = ${testTo}
      `;
      participants = rows.length
        ? rows
        : [{ id: null, name: 'רונית', first_name: 'רונית', email: testTo }];
    } else {
      participants = isStandalone
        ? await getRecipients('all')
        : await getRecipients(meeting.audience);

      if (onlyMissing && template.id) {
        const { rows: already } = await sql`
          SELECT participant_id FROM email_logs
          WHERE template_id = ${template.id} AND status = 'sent'
        `;
        const seen = {};
        already.forEach(function (r) { seen[r.participant_id] = true; });
        participants = participants.filter(function (p) { return !seen[p.id]; });
      }
    }

    let sent = 0;
    let failed = 0;
    let lastSendStartedAt = 0;

    for (const p of participants) {
      try {
        const vars = {
          name: p.name,
          // Falls back to the full name, so a template using {{first_name}}
          // never greets an empty space if the column is unset.
          first_name: p.first_name || p.name,
          // Empty on a standalone update, which has no meeting behind it.
          title: meeting ? meeting.title : '',
          date: meeting ? formatDate(meeting.meeting_date) : '',
          time: meeting ? formatTime(meeting.meeting_time) : '',
          zoom_link: meeting ? (meeting.zoom_link || '') : '',
          description: meeting ? (meeting.description || '') : '',
          materials: meeting ? (meeting.related_materials || '') : '',
          unsubscribe_url: unsubscribeUrl(p.email),
        };
        const { subject, html } = renderTemplate(template.body, template.subject, vars);

        // Only pace a real run; a test send is a single message.
        if (!testTo) {
          const wait = MIN_INTERVAL_MS - (Date.now() - lastSendStartedAt);
          if (wait > 0) await sleep(wait);
          lastSendStartedAt = Date.now();
        }

        try {
          await sendEmail({ to: p.email, subject, html, attachments });
        } catch (err) {
          // One retry if we were throttled anyway — a dropped send means a
          // person simply never hears from her.
          if (/\b429\b|rate.?limit/i.test(err.message || '')) {
            await sleep(1200);
            await sendEmail({ to: p.email, subject, html, attachments });
          } else {
            throw err;
          }
        }

        if (!testTo && p.id) {
          await sql`
            INSERT INTO email_logs (participant_id, meeting_id, email_type, status, template_id)
            VALUES (${p.id}, ${isStandalone ? null : meetingId}, ${template.template_type}, 'sent', ${template.id})
          `;
        }
        sent++;
      } catch (err) {
        console.error(`Email to ${p.email} failed:`, err);
        if (!testTo && p.id) {
          await sql`
            INSERT INTO email_logs (participant_id, meeting_id, email_type, status, error, template_id)
            VALUES (${p.id}, ${isStandalone ? null : meetingId}, ${template.template_type}, 'failed', ${err.message || 'unknown'}, ${template.id})
          `;
        }
        failed++;
      }
    }

    res.status(200).json({ ok: true, sent, failed, total: participants.length, test: !!testTo });
  } catch (err) {
    console.error('admin/send-email error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};

// Active participants for the meeting's audience:
//   'parents'  -> parents series + those who chose to join both groups
//   'children' -> children series + those who chose to join both groups
//   'all' (or column missing) -> everyone
async function getRecipients(audience) {
  if (audience === 'parents' || audience === 'children') {
    const like = audience === 'parents' ? '%להורים%' : '%לילדי%';
    const bothLike = '%שתי הקבוצות%'; // people who asked to join both groups
    try {
      const { rows } = await sql`
        SELECT id, name, email, first_name FROM zoom_participants
        WHERE status = 'active'
          AND (participant_type LIKE ${like} OR participant_type LIKE ${bothLike})
      `;
      return rows;
    } catch (e) {
      console.error('group filter failed, sending to all active:', e.message);
    }
  }
  // first_name may not exist yet; fall back rather than fail to send at all.
  try {
    const { rows } = await sql`
      SELECT id, name, email, first_name FROM zoom_participants WHERE status = 'active'
    `;
    return rows;
  } catch (e) {
    console.error('first_name column missing, selecting without it:', e.message);
    const { rows } = await sql`
      SELECT id, name, email FROM zoom_participants WHERE status = 'active'
    `;
    return rows;
  }
}

// Reused by the automatic reminder cron (api/reminders.js).
module.exports.getRecipients = getRecipients;
