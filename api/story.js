// Receives a story/thought submission (optionally with a single attached file)
// from the "הספרייה המשותפת" (materials) page and emails it to Ronit via Resend.

const RECIPIENT = 'ronit.adiv@beteladim.co.il';
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB raw (~4MB base64, under Vercel's 4.5MB limit)

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
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

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'noconfig' });
      return;
    }
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const subject = 'סיפור לספרייה המשותפת' +
      (title ? ' – ' + title : '') +
      (sender ? ' | ' + sender : '');

    const metaRows = [];
    if (sender) metaRows.push('<div><strong>שם:</strong> ' + esc(sender) + '</div>');
    if (email) metaRows.push('<div><strong>מייל לחזרה:</strong> ' + esc(email) + '</div>');
    if (title) metaRows.push('<div><strong>כותרת:</strong> ' + esc(title) + '</div>');
    if (file) metaRows.push('<div><strong>קובץ מצורף:</strong> ' + esc(file.name || 'קובץ') + '</div>');

    const metaBlock = metaRows.length
      ? '<div style="background:#EEF3EF; border:1px solid rgba(34,48,47,.12); border-radius:4px; padding:16px 18px; margin:0 0 22px; font-size:14px; line-height:1.9; color:#3A4744; text-align:right; direction:rtl;">' +
        metaRows.join('\n') + '</div>'
      : '';

    const storyBlock = story
      ? paragraphs(story)
      : '<p style="font-size:15px; color:#8A9692; text-align:right; direction:rtl;">(ללא טקסט — נשלח קובץ מצורף בלבד.)</p>';

    const html = '<!DOCTYPE html>\n' +
      '<html dir="rtl" lang="he"><head><meta charset="utf-8"></head>\n' +
      '<body style="font-family:-apple-system,sans-serif; color:#22302F; background:#FAF8F4; margin:0; padding:40px 20px; direction:rtl; text-align:right;">\n' +
      '<div dir="rtl" style="max-width:560px; margin:0 auto; direction:rtl; text-align:right;">\n' +
      '<div style="font-size:13px; letter-spacing:.04em; color:#3D7468; font-weight:600; margin-bottom:6px;">הספרייה המשותפת</div>\n' +
      '<div style="font-size:20px; font-weight:700; color:#2F5248; margin-bottom:22px;">סיפור חדש נשלח מהאתר</div>\n' +
      metaBlock +
      storyBlock +
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

    if (!r.ok) {
      const t = await r.text();
      console.error('Resend error', r.status, t);
      res.status(502).json({ error: 'send' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('story submit error', e);
    res.status(500).json({ error: 'server' });
  }
};
