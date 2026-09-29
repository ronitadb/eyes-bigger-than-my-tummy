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

// GET /api/story            — the community anthology on /materials
// GET /api/story?article_id=N — הדים: responses published under one article
//
// The two feeds are kept apart. A response written to a particular article
// belongs in that article's context; letting it drift into the general
// anthology would strip the thing it was answering.
//
// Emails are never exposed. Returns [] gracefully if the table isn't migrated.
async function listPublished(req, res) {
  const articleId = parseInt(req.query.article_id, 10);
  // Stories with a page of their own carry their address, so the anthology can
  // link to the page instead of opening the story in a window. The column
  // arrives with migrate-story-pages.sql; until it has run, fall back to the
  // plain feed rather than empty the anthology.
  if (!articleId) {
    try {
      const { rows } = await sql`
        SELECT id, sender, title, body, attribution, accent, published_at, created_at, slug
        FROM stories
        WHERE status = 'published' AND consent = true AND article_id IS NULL
          AND (slug IS NULL OR approved_at IS NOT NULL)
        ORDER BY COALESCE(published_at, created_at) DESC, id DESC
      `;
      return res.status(200).json({ ok: true, stories: rows.map(feedItem) });
    } catch (err) {
      console.error('GET /api/story: story-page columns unavailable, falling back:', err.message);
    }
  }
  try {
    const { rows } = articleId
      ? await sql`
          SELECT id, sender, title, body, attribution, accent, published_at, created_at
          FROM stories
          WHERE status = 'published' AND consent = true AND article_id = ${articleId}
          ORDER BY COALESCE(published_at, created_at) ASC, id ASC
        `
      : await sql`
          SELECT id, sender, title, body, attribution, accent, published_at, created_at
          FROM stories
          WHERE status = 'published' AND consent = true AND article_id IS NULL
          ORDER BY COALESCE(published_at, created_at) DESC, id DESC
        `;
    res.status(200).json({ ok: true, stories: rows.map(feedItem) });
  } catch (err) {
    console.error('GET /api/story error:', err.message);
    res.status(200).json({ ok: true, stories: [] });
  }
}

function feedItem(r) {
  return {
    id: r.id,
    title: r.title || '',
    // ◆ paragraphs are seams on a story's own page, not words of the story
    body: String(r.body || '').replace(/(^|\n\n)[◆◇](?=\n\n|$)/g, '$1').replace(/\n{3,}/g, '\n\n').trim(),
    accent: r.accent || null,
    author: displayName(r.sender, r.attribution),
    date: r.published_at || r.created_at,
    slug: r.slug || null,
  };
}

// ── A story with a page of its own: /voices/<slug> ──────────────────────────
// Public only once published AND approved by the writer. Before that it opens
// for one person only — whoever holds the preview link sent to the writer —
// and is marked noindex. Published pages stay noindex too unless the writer
// asked to be findable in search (library-decisions §14).
const SITE = 'https://www.beityeladim.co.il';
const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
// The date as it was in Israel, whatever the server's own clock: a story sent
// on an evening there should not read as sent the next day.
function hebDate(d) {
  const x = new Date(d); if (isNaN(x.getTime())) return '';
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(x).forEach(function (q) { p[q.type] = q.value; });
  return p.day + ' ב' + MONTHS[parseInt(p.month, 10) - 1] + ' ' + p.year;
}

async function storyPage(req, res) {
  const slug = String(req.query.page || '');
  const token = String(req.query.preview || '');
  let row = null;
  try {
    const { rows } = await sql`
      SELECT id, sender, title, body, attribution, status, consent, published_at, created_at,
             slug, preview_token, indexable, approved_at
      FROM stories WHERE slug = ${slug} AND article_id IS NULL
    `;
    row = rows[0] || null;
  } catch (err) {
    console.error('GET story page error:', err.message);
  }
  const isPublic = row && row.status === 'published' && row.consent && row.approved_at;
  const isPreview = row && !isPublic && token && row.preview_token && token === row.preview_token;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!isPublic && !isPreview) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send(storyShell('הסיפור לא נמצא', '', '', true,
      '<article class="s-page"><p class="s-missing">הדף הזה אינו זמין.</p>' +
      '<p class="s-missing"><a href="/voices">← לסיפורים ששלחתם</a></p></article>'));
  }
  const noindex = isPreview || !row.indexable;
  if (noindex) res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', isPreview ? 'private, no-store' : 'public, max-age=60, stale-while-revalidate=600');

  const author = displayName(row.sender, row.attribution);
  const when = hebDate(row.published_at || row.created_at);
  const text = String(row.body || '').trim();
  const description = text.replace(/\s+/g, ' ').slice(0, 150) + (text.length > 150 ? '…' : '');
  const body =
    (isPreview ? '<div class="s-preview">תצוגה מקדימה · הדף עדיין לא פורסם, ורק מי שקיבל את הקישור יכול לראות אותו</div>' : '') +
    '<div class="a-back"><a href="/voices">← הקהילה</a></div>' +
    '<article class="s-page">' +
      '<div class="s-eyebrow">מן הקהילה</div>' +
      '<h1 class="s-title">' + esc(row.title || '') + '</h1>' +
      // The writer's name as a signature: the gold diamond and a hairline, as
      // the byline in the designed PDF.
      '<div class="s-by" aria-label="' + esc([author, when].filter(Boolean).join(' · ')) + '">' +
        '<b aria-hidden="true"></b><span>' + esc([author, when].filter(Boolean).join(' · ')) + '</span><i aria-hidden="true"></i></div>' +
      '<div class="a-story">' + text.split(/\n{2,}/).map(function (p) {
        p = p.trim();
        // A paragraph that is only ◆ is a seam: where the piece turns, set by
        // Ronit in the stories screen. Structure and breath, never emphasis —
        // no line of the writer's is marked.
        if (/^[◆◇]$/.test(p)) return '<div class="a-seam" aria-hidden="true"><i></i><b></b><i></i></div>';
        return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
      }).join('') + '</div>' +
      // Not a response form: this is someone's own life, not an argument to
      // answer. The invitation is to add a voice, not to comment on hers.
      '<p class="s-invite"><a href="/voices#story-submit-form">גם לך יש סיפור?</a></p>' +
    '</article>';
  return res.status(200).send(storyShell(row.title || 'מן הקהילה', description,
    SITE + '/voices/' + row.slug, noindex, body));
}

function storyShell(title, description, canonical, noindex, body) {
  return '<!DOCTYPE html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + ' — מן הקהילה</title>\n' +
    (noindex ? '<meta name="robots" content="noindex">\n' : '') +
    (description ? '<meta name="description" content="' + esc(description) + '">\n' : '') +
    (canonical ? '<link rel="canonical" href="' + esc(canonical) + '">\n' : '') +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    (description ? '<meta property="og:description" content="' + esc(description) + '">\n' : '') +
    (canonical ? '<meta property="og:url" content="' + esc(canonical) + '">\n' : '') +
    '<meta property="og:image" content="' + SITE + '/assets/beityeladim-email-banner.jpg">\n' +
    '<link rel="icon" href="/favicon.ico?v=2" sizes="any">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/article.css">\n' +
    '<style>body{margin:0;background:#FAF8F4;padding:0 0 80px}' +
    '.s-preview{background:#F1EBDE;color:#5E706B;font-family:Assistant,sans-serif;font-size:14px;text-align:center;padding:10px 16px;border-bottom:1px solid rgba(34,48,47,.1)}' +
    '.a-back,.s-page{max-width:34em;margin:0 auto;padding:0 clamp(20px,5vw,32px);direction:rtl;text-align:right}' +
    '.a-back{margin-top:clamp(28px,6vw,56px);margin-bottom:26px;font-family:Assistant,sans-serif;font-size:15px}' +
    '.a-back a{color:#2F5248;text-decoration:none}.a-back a:hover{text-decoration:underline}' +
    // A voice, not an article: the eyebrow says whose it is before anything else.
    '.s-eyebrow{font-family:Assistant,sans-serif;font-size:13px;font-weight:700;letter-spacing:.14em;color:#A8801F;margin:0 0 14px}' +
    '.s-title{font-family:Assistant,sans-serif;font-weight:300;font-size:clamp(28px,4.6vw,40px);line-height:1.25;color:#2F5248;margin:0 0 12px;text-wrap:balance}' +
    '.s-by{display:flex;align-items:center;gap:12px;font-family:Assistant,sans-serif;font-size:15px;color:#6E7C78;margin:0 0 38px}' +
    '.s-by b{width:6px;height:6px;background:#EDA72E;transform:rotate(45deg);flex:none}' +
    '.s-by span{flex:none}.s-by i{flex:1 1 auto;height:1px;background:#EAE4D6;min-width:20px}' +
    '.s-page .a-seam{margin:40px 0 34px}' +
    '.s-page .a-story{max-width:none;padding:0;margin:0}' +
    '.s-invite{margin:48px 0 0;padding-top:20px;border-top:1px solid #EAE4D6;font-family:Assistant,sans-serif;font-size:16px}' +
    '.s-invite a{color:#2F5248}.s-missing{font-family:Assistant,sans-serif;font-size:17px;color:#5E706B;margin:60px 0 10px}' +
    '.s-missing a{color:#2F5248}' +
    '@media print{.s-preview,.a-back,.s-invite{display:none}}' +
    '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>';
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    if (req.query && req.query.page) return storyPage(req, res);
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
    // Present when this was written at the foot of an article (הדים).
    const articleId = Number.isInteger(parseInt(body.article_id, 10))
      ? parseInt(body.article_id, 10) : null;

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
      if (articleId) {
        await sql`
          INSERT INTO stories (sender, email, title, body, attribution, consent, status, has_file, file_name, article_id)
          VALUES (${sender || null}, ${email || null}, ${title || null}, ${story || null},
                  ${attribution}, ${consent}, 'pending', ${!!file}, ${file ? (file.name || null) : null},
                  ${articleId})
        `;
      } else {
        await sql`
          INSERT INTO stories (sender, email, title, body, attribution, consent, status, has_file, file_name)
          VALUES (${sender || null}, ${email || null}, ${title || null}, ${story || null},
                  ${attribution}, ${consent}, 'pending', ${!!file}, ${file ? (file.name || null) : null})
        `;
      }
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
        const subject = (articleId ? 'הד למאמר' : 'סיפור לספרייה המשותפת') +
          (title ? ' – ' + title : '') +
          (sender ? ' | ' + sender : '');

        const metaRows = [];
        if (articleId) metaRows.push('<div><strong>נכתב בתגובה למאמר:</strong> ' +
          '<a href="https://www.beityeladim.co.il/admin/articles">מספר ' + articleId + '</a></div>');
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
          '<div style="font-size:20px; font-weight:700; color:#2F5248; margin-bottom:22px;">' +
          (articleId ? 'הד חדש נשלח מהאתר' : 'סיפור חדש נשלח מהאתר') + '</div>\n' +
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
