// Contact form on /contact — emails the message straight to Ronit via Resend.
// No storage, no moderation: this is private correspondence, not published content.

const RECIPIENT = 'ronit.adiv@beteladim.co.il';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const message = (body.message || '').toString().trim();

    if (!message) {
      return res.status(400).json({ ok: false, error: 'empty' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'bad_email' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured — contact message not sent');
      return res.status(500).json({ ok: false, error: 'noconfig' });
    }
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const subject = 'פנייה מהאתר' + (name ? ' מאת ' + name : '');

    const metaRows = [];
    if (name) metaRows.push('<div><strong>שם:</strong> ' + esc(name) + '</div>');
    if (email) metaRows.push('<div><strong>מייל לחזרה:</strong> ' + esc(email) + '</div>');
    const metaBlock = metaRows.length
      ? '<div style="background:#EEF3EF; border:1px solid rgba(34,48,47,.12); border-radius:4px; padding:16px 18px; margin:0 0 22px; font-size:14px; line-height:1.9; color:#3A4744; text-align:right; direction:rtl;">' +
        metaRows.join('\n') + '</div>'
      : '';

    const messageHtml = '<p style="font-size:16px; line-height:1.8; margin:0; text-align:right; direction:rtl; white-space:pre-wrap;">' +
      esc(message) + '</p>';

    const html = '<!DOCTYPE html>\n' +
      '<html dir="rtl" lang="he"><head><meta charset="utf-8"></head>\n' +
      '<body style="font-family:-apple-system,sans-serif; color:#22302F; background:#FAF8F4; margin:0; padding:40px 20px; direction:rtl; text-align:right;">\n' +
      '<div dir="rtl" style="max-width:560px; margin:0 auto; direction:rtl; text-align:right;">\n' +
      '<div style="font-size:13px; letter-spacing:.04em; color:#3D7468; font-weight:600; margin-bottom:6px;">עיניים גדולות זה לא טוב</div>\n' +
      '<div style="font-size:20px; font-weight:700; color:#2F5248; margin-bottom:22px;">פנייה חדשה מטופס יצירת הקשר</div>\n' +
      metaBlock + messageHtml +
      '</div></body></html>';

    const payload = { from, to: [RECIPIENT], subject, html };
    if (email) payload.reply_to = email;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'send' });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact submit error', e);
    res.status(500).json({ ok: false, error: 'server' });
  }
};
