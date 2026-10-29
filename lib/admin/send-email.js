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
  let meetingId = parseInt(body.meeting_id, 10);
  const templateType = String(body.template_type || '');
  // A specific saved letter. Without it we fall back to type, which is how the
  // reminder cron and join confirmations still resolve.
  const templateId = Number.isInteger(parseInt(body.template_id, 10))
    ? parseInt(body.template_id, 10) : null;
  // A standalone update goes to every active participant and belongs to no
  // meeting, so the meeting-shaped variables simply have nothing to fill them.
  let isStandalone = !meetingId;
  const attachments = Array.isArray(body.attachments) ? body.attachments : null;
  // A personal letter to one named person — e.g. a story's writer, with the
  // private link to her page. It goes out in the same letter design, to that
  // address only, touching nobody on the list.
  const one = body.to_one && typeof body.to_one === 'object' ? body.to_one : null;
  const oneEmail = one ? String(one.email || '').trim() : '';
  if (one && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(oneEmail)) {
    return res.status(400).json({ ok: false, error: 'bad_email', message: 'כתובת המייל אינה תקינה.' });
  }
  // A test send goes to exactly one address and touches nobody on the list.
  const testTo = oneEmail || (typeof body.test_to === 'string' ? body.test_to.trim() : '');
  // Send only to people who never received this particular letter — the group
  // that registered after it went out.
  const onlyMissing = body.only_missing === true || body.only_missing === 'true';
  // Chosen by hand in the send window: registrants ticked one by one, and
  // addresses typed in for people who never registered. When either is given,
  // exactly these people get the email and no group rule is applied.
  const recipientIds = Array.isArray(body.recipient_ids)
    ? body.recipient_ids.map(function (n) { return parseInt(n, 10); }).filter(Number.isInteger)
    : null;
  const extraIn = Array.isArray(body.extra) ? body.extra : [];
  const handPicked = recipientIds !== null || extraIn.length > 0;
  // Render the email for the first recipient and return it — nothing is sent.
  const preview = body.preview === true;

  const extras = [];
  const badExtras = [];
  for (const x of extraIn.slice(0, 300)) {
    const email = String((x && x.email) || '').trim().toLowerCase();
    const name = String((x && x.name) || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { badExtras.push(email || '(ריק)'); continue; }
    if (extras.some(function (e) { return e.email === email; })) continue;
    extras.push({ email: email, name: name });
  }
  if (badExtras.length) {
    return res.status(400).json({ ok: false, error: 'bad_extra',
      message: 'כתובות לא תקינות: ' + badExtras.join(', ') + ' — לא נשלח דבר.' });
  }

  if (!templateType && !templateId) {
    return res.status(400).json({ ok: false, error: 'missing_fields', message: 'template_type required' });
  }

  try {
    const { rows: templates } = templateId
      ? await sql`SELECT * FROM email_templates WHERE id = ${templateId}`
      : await sql`SELECT * FROM email_templates WHERE template_type = ${templateType} ORDER BY updated_at DESC`;
    if (!templates.length) {
      return res.status(404).json({ ok: false, error: 'template_not_found' });
    }
    const template = templates[0];

    // A reminder written for a meeting always goes out with that meeting's
    // details, even if the screen did not say which.
    const ownMeeting = template.fields && parseInt(template.fields.meeting_id, 10);
    if (isStandalone && Number.isInteger(ownMeeting)) {
      meetingId = ownMeeting;
      isStandalone = false;
    }

    let meeting = null;
    if (!isStandalone) {
      const { rows: meetings } = await sql`SELECT * FROM zoom_meetings WHERE id = ${meetingId}`;
      if (!meetings.length) {
        return res.status(404).json({ ok: false, error: 'meeting_not_found' });
      }
      meeting = meetings[0];
    }

    // A personal letter is addressed by hand: Ronit types the name into it. A
    // blank left as ___ means it has not been, so it does not go out.
    if (one && /___/.test(template.body + template.subject)) {
      return res.status(400).json({ ok: false, error: 'blanks_left',
        message: 'במכתב נשארו מקומות ריקים (___). יש להשלים אותם לפני השליחה.' });
    }

    // A personal letter (one with {{link}}) never goes to the list, whatever the
    // screen asked for: a link meant for one writer must not reach fifty people.
    if (/\{\{\s*link\s*\}\}/.test(template.body + template.subject) && !testTo && !preview) {
      return res.status(400).json({ ok: false, error: 'personal_template',
        message: 'זה מכתב אישי — אפשר לשלוח אותו רק לאדם אחד.' });
    }

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
      if (one) {
        const n = String(one.name || '').trim();
        participants = [{ id: null, name: n || participants[0].name,
          first_name: n ? n.split(/\s+/)[0] : participants[0].first_name, email: oneEmail }];
      }
    } else if (handPicked) {
      // Only people still active can be picked; someone who unsubscribed
      // between opening the window and pressing send is left out.
      const active = await getRecipients('all');
      const byId = {};
      const byEmail = {};
      active.forEach(function (p) { byId[p.id] = p; byEmail[String(p.email || '').toLowerCase()] = p; });
      participants = [];
      const taken = {};
      (recipientIds || []).forEach(function (id) {
        const p = byId[id];
        if (p && !taken[p.id]) { taken[p.id] = true; participants.push(p); }
      });
      const taken_email = {};
      participants.forEach(function (p) { taken_email[String(p.email || '').toLowerCase()] = true; });
      extras.forEach(function (x) {
        if (taken_email[x.email]) return;
        taken_email[x.email] = true;
        // A typed address that belongs to a registrant is that registrant,
        // so the send is logged against them and their unsubscribe link works.
        const reg = byEmail[x.email];
        if (reg) { participants.push(reg); return; }
        participants.push({ id: null, external: true, email: x.email,
          name: x.name, first_name: x.name ? x.name.split(/\s+/)[0] : '' });
      });
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

    // Someone typed in with no name: the greeting drops the name rather than
    // greeting an empty space — "שלום {{first_name}}," becomes "שלום,".
    const NAME_RE = /[ \t]*\{\{\s*(first_name|name|שם פרטי)\s*\}\}/g;
    function forRecipient(p) {
      const nameless = p.external && !p.first_name;
      return {
        body: nameless ? template.body.replace(NAME_RE, '') : template.body,
        subject: nameless ? template.subject.replace(NAME_RE, '') : template.subject,
      };
    }

    if (preview) {
      const p = participants[0] || { id: null, name: 'רונית', first_name: 'רונית', email: 'ronit@beityeladim.co.il' };
      const t = forRecipient(p);
      const out = renderTemplate(t.body, t.subject, {
        name: p.name, first_name: p.first_name || p.name,
        title: meeting ? meeting.title : '',
        date: meeting ? formatDate(meeting.meeting_date) : '',
        time: meeting ? formatTime(meeting.meeting_time) : '',
        zoom_link: meeting ? (meeting.zoom_link || '') : '',
        description: meeting ? (meeting.description || '') : '',
        materials: meeting ? (meeting.related_materials || '') : '',
        unsubscribe_url: unsubscribeUrl(p.email),
        link: one ? String(one.link || '') : '',
        personal: !!one,
        external: !!p.external,
      });
      return res.status(200).json({ ok: true, preview: true, subject: out.subject, html: out.html,
        shown_for: p.email, total: participants.length });
    }

    if (!participants.length) {
      return res.status(400).json({ ok: false, error: 'no_recipients', message: 'לא נבחרו נמענים — לא נשלח דבר.' });
    }

    let sent = 0;
    let failed = 0;
    let unlogged = 0;
    let lastSendStartedAt = 0;

    // Someone who never registered has no participant row. Their send is
    // recorded by address, which needs api/db/history-for-outside-addresses.sql
    // to have been run; until then it goes out but is not written down.
    async function logExternal(p, status, error) {
      try {
        await sql`
          INSERT INTO email_logs (participant_id, recipient_email, meeting_id, email_type, status, error, template_id)
          VALUES (NULL, ${p.email}, ${isStandalone ? null : meetingId}, ${template.template_type}, ${status}, ${error || null}, ${template.id})
        `;
      } catch (e) {
        unlogged++;
        console.error('could not log send to outside address (run history-for-outside-addresses.sql):', e.message);
      }
    }

    for (const p of participants) {
      try {
        const t = forRecipient(p);
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
          link: one ? String(one.link || '') : '',
          personal: !!one,
          external: !!p.external,
        };
        const { subject, html } = renderTemplate(t.body, t.subject, vars);

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
        } else if (!testTo && p.external) {
          await logExternal(p, 'sent', null);
        }
        sent++;
      } catch (err) {
        console.error(`Email to ${p.email} failed:`, err);
        if (!testTo && p.id) {
          await sql`
            INSERT INTO email_logs (participant_id, meeting_id, email_type, status, error, template_id)
            VALUES (${p.id}, ${isStandalone ? null : meetingId}, ${template.template_type}, 'failed', ${err.message || 'unknown'}, ${template.id})
          `;
        } else if (!testTo && p.external) {
          await logExternal(p, 'failed', err.message || 'unknown');
        }
        failed++;
      }
    }

    res.status(200).json({ ok: true, sent, failed, total: participants.length, test: !!testTo, unlogged });
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
