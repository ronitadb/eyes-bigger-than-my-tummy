// Receives a story/thought submission (optionally with a single attached file)
// from the "הספרייה המשותפת" (materials) page. Stores it for review and emails
// it to Ronit via Resend. Nothing is published without explicit consent + review.

const { sql } = require('../lib/db');

const RECIPIENT = 'ronit@beityeladim.co.il';
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB raw (~4MB base64, under Vercel's 4.5MB limit)
const ATTRIBUTIONS = ['full', 'first', 'anonymous'];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraphs(text) {
  return String(text)
    .split(/\n\n+/)
    .map(function (p) {
      return '<p style="font-size:16px; line-height:1.8; margin:0 0 14px; text-align:right; direction:rtl; white-space:pre-wrap;">' +
        esc(p) + '</p>';
    })
    .join('\n');
}

const ATTR_LABEL = { full: 'בשם המלא', first: 'בשם פרטי בלבד', anonymous: 'באופן אנונימי' };

function displayName(sender, attribution) {
  const s = (sender || '').trim();
  if (attribution === 'full') return s || 'אנונימי';
  if (attribution === 'first') return s ? s.split(/\s+/)[0] : 'אנונימי';
  return 'אנונימי';
}

// GET /api/story — public feed: published, consented stories, newest first.
// Emails are never exposed. Returns [] gracefully if the table isn't migrated.
async function listPublished(req, res) {
  try {
    const { rows } = await sql`
      SELECT id, sender, title, body, attribution, published_at, created_at
      FROM stories
      WHERE status = 'published' AND consent = true
      ORDER BY COALESCE(published_at, created_at) DESC
    `;
    const stories = rows.map(function (r) {
      return {
        id: r.id,
        title: r.title || '',
        body: r.body || '',
        author: displayName(r.sender, r.attribution),
        date: r.published_at || r.created_at,
      };
    });
    res.status(200).json({ ok: true, stories });
  } catch (err) {
    console.error('GET /api/story error:', err.message);
    res.status(200).json({ ok: true, stories: [] });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return listPublished(req, res);
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const sender = (body.sender || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const title = (body.title || '').toString().trim();
    const story = (body.story || '').toString().trim();
    const consent = body.consent === true || body.consent === 'true' || body.consent === 1 || body.consent === '1';
    const attribution = ATTRIBUTIONS.indexOf(body.attribution) > -1 ? body.attribution : 'anonymous';
    const file = body.file && body.file.data ? body.file : null;

    if (!story && !file) {
      res.status(400).json({ error: 'empty' });
      return;
    }

    if (file) {
      const approxBytes = Math.floor((file.data.length * 3) / 4);
      if (approxBytes > MAX_FILE_BYTES) {
        res.status(413).json({ error: 'toolarge' });
        return;
      }
    }

    // 1) Store for review (durable record). Wrapped so a missing table can't
    //    break submission before the stories migration has been run.
    let dbOk = false;
    try {
      await sql`
        INSERT INTO stories (sender, email, title, body, attribution, consent, status, has_file, file_name)
        VALUES (${sender || null}, ${email || null}, ${title || null}, ${story || null},
                ${attribution}, ${consent}, 'pending', ${!!file}, ${file ? (file.name || null) : null})
      `;
      dbOk = true;
    } catch (dbErr) {
      console.error('stories insert skipped (table may not exist yet):', dbErr.message);
    }

    // 2) Notify Ronit by email (with the attachment, if any).
    let emailOk = false;
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const subject = 'סיפור לספרייה המשותפת' +
          (title ? ' – ' + title : '') +
          (sender ? ' | ' + sender : '');

        const metaRows = [];
        if (sender) metaRows.push('<div><strong>שם:</strong> ' + esc(sender) + '</div>');
        if (email) metaRows.push('<div><strong>מייל לחזרה:</strong> ' + esc(email) + '</div>');
        if (title) metaRows.push('<div><strong>כותרת:</strong> ' + esc(title) + '</div>');
        metaRows.push('<div><strong>פרסום:</strong> ' +
          (consent
            ? 'אושר לפרסום · ייחוס ' + esc(ATTR_LABEL[attribution])
            : 'ללא אישור לפרסום — לרונית בלבד') + '</div>');
        if (file) metaRows.push('<div><strong>קובץ מצורף:</strong> ' + esc(file.name || 'קובץ') + '</div>');

        const metaBlock =
          '<div style="background:#EEF3EF; border:1px solid rgba(34,48,47,.12); border-radius:4px; padding:16px 18px; margin:0 0 22px; font-size:14px; line-height:1.9; color:#3A4744; text-align:right; direction:rtl;">' +
          metaRows.join('\n') + '</div>';

        const storyBlock = story
          ? paragraphs(story)
          : '<p style="font-size:15px; color:#8A9692; text-align:right; direction:rtl;">(ללא טקסט — נשלח קובץ מצורף בלבד.)</p>';

        const note = '<p style="font-size:13px; color:#8A9692; text-align:right; direction:rtl; margin:22px 0 0;">' +
          'הסיפור נשמר לעיון בממשק הניהול. שום דבר אינו מתפרסם באתר עד שתאשרי אותו שם.</p>';

        const html = '<!DOCTYPE html>\n' +
          '<html dir="rtl" lang="he"><head><meta charset="utf-8"></head>\n' +
          '<body style="font-family:-apple-system,sans-serif; color:#22302F; background:#FAF8F4; margin:0; padding:40px 20px; direction:rtl; text-align:right;">\n' +
          '<div dir="rtl" style="max-width:560px; margin:0 auto; direction:rtl; text-align:right;">\n' +
          '<div style="font-size:13px; letter-spacing:.04em; color:#3D7468; font-weight:600; margin-bottom:6px;">הספרייה המשותפת</div>\n' +
          '<div style="font-size:20px; font-weight:700; color:#2F5248; margin-bottom:22px;">סיפור חדש נשלח מהאתר</div>\n' +
          metaBlock + storyBlock + note +
          '</div></body></html>';

        const payload = { from, to: [RECIPIENT], subject, html };
        if (email) payload.reply_to = email;
        if (file) {
          payload.attachments = [{ filename: file.name || 'attachment', content: file.data }];
        }

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (r.ok) {
          emailOk = true;
        } else {
          console.error('Resend error', r.status, await r.text());
        }
      } catch (mailErr) {
        console.error('story email failed:', mailErr);
      }
    } else {
      console.error('RESEND_API_KEY not configured — story stored without email notification');
    }

    if (!dbOk && !emailOk) {
      res.status(502).json({ error: 'send' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('story submit error', e);
    res.status(500).json({ error: 'server' });
  }
};
