// Contact form endpoint — emails the message to Ronit via Resend.
// Serves both /contact (book community) and /door (clinical practice).
// No storage, no moderation: this is private correspondence, not published content.
//
// Body fields:
//   name, email, message            — the visitor's details
//   target  "door" | anything else  — chooses recipient SERVER-SIDE (never trust a client address)
//   lang    "en" | "he"             — localized subject + template (RTL Hebrew default)

// Recipient is resolved from the target KEY only — a client-supplied email is never used here.
const RECIPIENTS = {
  door: 'ronit.adiv@gmail.com',
  default: 'ronit@beityeladim.co.nz',
};

// Per-source, per-language branding for the notification email.
const BRAND = {
  door: {
    he: { brand: 'רונית בלנרו-אדיב', head: 'פנייה חדשה דרך הדלת', subject: 'פנייה דרך הדלת' },
    en: { brand: 'Ronit Adiv-Blanario', head: 'New message through your door', subject: 'A message through your door' },
  },
  default: {
    he: { brand: 'עיניים גדולות זה לא טוב', head: 'פנייה חדשה מטופס יצירת הקשר', subject: 'פנייה מהאתר' },
    en: { brand: 'Bigger Eyes Than My Tummy', head: 'New message from the website', subject: 'A message from the website' },
  },
};

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function subjectFor(target, lang, name) {
  const b = (BRAND[target] || BRAND.default)[lang];
  if (!name) return b.subject;
  // Keep the book form's original Hebrew "from" phrasing; everything else uses an em dash.
  if (target !== 'door' && lang === 'he') return b.subject + ' מאת ' + name;
  return b.subject + ' — ' + name;
}

function buildEmail(target, lang, name, email, message) {
  const isEn = lang === 'en';
  const dir = isEn ? 'ltr' : 'rtl';
  const align = isEn ? 'left' : 'right';
  const b = (BRAND[target] || BRAND.default)[lang];

  // Palette follows the source identity: terracotta for the door, teal for the book.
  const isDoor = target === 'door';
  const accent = isDoor ? '#b0604a' : '#3D7468';
  const headColor = isDoor ? '#8a4a32' : '#2F5248';
  const pageBg = isDoor ? '#faf9f5' : '#FAF8F4';
  const inkColor = isDoor ? '#2c2820' : '#22302F';
  const bodyColor = isDoor ? '#3a352d' : '#3A4744';
  const metaBg = isDoor ? '#f0ece4' : '#EEF3EF';

  const labels = isEn ? { name: 'Name', reply: 'Reply-to' } : { name: 'שם', reply: 'מייל לחזרה' };
  const metaRows = [];
  if (name) metaRows.push('<div><strong>' + labels.name + ':</strong> ' + esc(name) + '</div>');
  if (email) metaRows.push('<div><strong>' + labels.reply + ':</strong> ' + esc(email) + '</div>');
  const metaBlock = metaRows.length
    ? '<div style="background:' + metaBg + '; border:1px solid rgba(44,40,32,.12); border-radius:4px; padding:16px 18px; margin:0 0 22px; font-size:14px; line-height:1.9; color:' + bodyColor + '; text-align:' + align + '; direction:' + dir + ';">' +
      metaRows.join('\n') + '</div>'
    : '';
  const messageHtml = '<p style="font-size:16px; line-height:1.8; margin:0; text-align:' + align + '; direction:' + dir + '; white-space:pre-wrap;">' +
    esc(message) + '</p>';

  const html = '<!DOCTYPE html>\n' +
    '<html dir="' + dir + '" lang="' + (isEn ? 'en' : 'he') + '"><head><meta charset="utf-8"></head>\n' +
    '<body style="font-family:-apple-system,sans-serif; color:' + inkColor + '; background:' + pageBg + '; margin:0; padding:40px 20px; direction:' + dir + '; text-align:' + align + ';">\n' +
    '<div dir="' + dir + '" style="max-width:560px; margin:0 auto; direction:' + dir + '; text-align:' + align + ';">\n' +
    '<div style="font-size:13px; letter-spacing:.04em; color:' + accent + '; font-weight:600; margin-bottom:6px;">' + esc(b.brand) + '</div>\n' +
    '<div style="font-size:20px; font-weight:700; color:' + headColor + '; margin-bottom:22px;">' + esc(b.head) + '</div>\n' +
    metaBlock + messageHtml +
    '</div></body></html>';

  return { subject: subjectFor(target, lang, name), html };
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
    const target = body.target === 'door' ? 'door' : 'default';
    const lang = body.lang === 'en' ? 'en' : 'he';

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
    const recipient = RECIPIENTS[target] || RECIPIENTS.default;

    const { subject, html } = buildEmail(target, lang, name, email, message);

    const payload = { from, to: [recipient], subject, html };
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
