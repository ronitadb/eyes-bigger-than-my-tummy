// Public article endpoint. Two jobs, one function (Hobby caps us at 12):
//   GET /api/article            -> JSON list for the library index cards
//   GET /api/article?slug=x     -> the full article page as HTML
//
// The page is SERVER-rendered, and the deciding reason is WhatsApp: it does not
// run JavaScript, so a client-rendered article forwards as a bare grey link with
// no title and no image. Forwarding is how this site actually reaches people.
// The same argument covers Google and the "published first = canonical" logic.
//
// `chain` and `notes` are private (מאחורי הקלעים) and are never selected here,
// so they cannot leak into the source. Hidden-with-CSS would still be in ⌘U.

const { sql } = require('../lib/db');
const { renderBlocks, esc } = require('../lib/articles-render');

const SITE = 'https://www.beityeladim.co.il';
const PUBLIC_COLUMNS = `id, slug, title_lead, title_topic, summary, blocks,
  term_name, hero_image, hero_credit, external_pubs, related_ids,
  status, published_at, sort_order`;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const slug = (req.query.slug || '').trim();
  return slug ? page(slug, res) : list(res);
};

// The index: planned titles are shown too — ten titles together are the outline
// of the whole argument, not a placeholder.
async function list(res) {
  try {
    const { rows } = await sql`
      SELECT id, slug, title_lead, title_topic, summary, status, published_at,
             sort_order, external_url
      FROM articles
      WHERE status IN ('planned','published')
      ORDER BY sort_order, id
    `;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.status(200).json({ ok: true, articles: rows });
  } catch (err) {
    console.error('GET /api/article list error:', err.message);
    res.status(200).json({ ok: true, articles: [] });
  }
}

async function page(slug, res) {
  let article;
  try {
    const { rows } = await sql`
      SELECT id, slug, title_lead, title_topic, summary, blocks, term_name,
             hero_image, hero_credit, external_pubs, related_ids, status, published_at
      FROM articles WHERE slug = ${slug}
    `;
    article = rows[0];
  } catch (err) {
    console.error('GET /api/article page error:', err.message);
    return html(res, 500, errorPage('שגיאה זמנית. נסו שוב בעוד רגע.'));
  }

  if (!article || article.status !== 'published') {
    return html(res, 404, errorPage('המאמר הזה עדיין לא פורסם.'));
  }

  let related = [];
  try {
    const ids = Array.isArray(article.related_ids) ? article.related_ids : [];
    if (ids.length) {
      const { rows } = await sql`
        SELECT slug, title_lead, title_topic FROM articles
        WHERE id = ANY(${ids}) AND status = 'published'
      `;
      related = rows;
    }
  } catch (err) {
    console.error('related articles lookup failed:', err.message);
  }

  // הדים — responses Ronit has chosen to publish under this article.
  let echoes = [];
  try {
    const { rows } = await sql`
      SELECT sender, body, attribution, published_at, created_at
      FROM stories
      WHERE article_id = ${article.id} AND status = 'published' AND consent = true
      ORDER BY COALESCE(published_at, created_at) ASC
    `;
    echoes = rows;
  } catch (err) {
    console.error('echoes lookup failed:', err.message);
  }

  return html(res, 200, articlePage(article, related, echoes));
}

function html(res, code, body) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (code === 200) res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.status(code).send(body);
}

// The sender chooses how they are named; nothing else about them is shown.
function displayName(sender, attribution) {
  const t = (sender || '').trim();
  if (attribution === 'full') return t || 'אנונימי';
  if (attribution === 'first') return t ? t.split(/\s+/)[0] : 'אנונימי';
  return 'אנונימי';
}

function titleText(a) {
  return [a.title_lead, a.title_topic].filter(Boolean).join(' — ') || 'הספרייה המשותפת';
}

function shell(title, description, canonical, image, body) {
  return '<!DOCTYPE html>\n<html lang="he" dir="rtl">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n' +
    (description ? '<meta name="description" content="' + esc(description) + '">\n' : '') +
    (canonical ? '<link rel="canonical" href="' + esc(canonical) + '">\n' : '') +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    (description ? '<meta property="og:description" content="' + esc(description) + '">\n' : '') +
    (canonical ? '<meta property="og:url" content="' + esc(canonical) + '">\n' : '') +
    (image ? '<meta property="og:image" content="' + esc(image) + '">\n' : '') +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Assistant:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n' +
    '<link rel="stylesheet" href="/assets/article.css">\n' +
    '<style>body{margin:0;background:#FAF8F4;padding:clamp(28px,6vw,64px) 0 80px}' +
    '.a-back{max-width:34em;margin:0 auto 26px;padding:0 clamp(20px,5vw,32px);' +
    'direction:rtl;text-align:right;font-family:\'Assistant\',sans-serif;font-size:15px}' +
    '.a-back a{color:#2F5248;text-decoration:none}.a-back a:hover{text-decoration:underline}' +
    '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>';
}

function articlePage(a, related, echoes) {
  const canonical = SITE + '/library/' + a.slug;
  const description = a.summary || a.title_topic || '';
  const image = a.hero_image
    ? (a.hero_image.startsWith('http') ? a.hero_image : SITE + a.hero_image)
    : SITE + '/assets/beityeladim-email-banner.jpg';

  let body = '<div class="a-back no-print"><a href="/materials">← הספרייה המשותפת</a></div>\n';

  body += '<article class="a-article">\n<header class="a-title">' +
    (a.title_lead ? '<h1 class="a-title-lead">' + esc(a.title_lead) + '</h1>' : '') +
    (a.title_topic ? '<p class="a-title-topic">' + esc(a.title_topic) + '</p>' : '') +
    '</header>\n';

  if (a.hero_image) {
    body += '<figure class="a-figure"><img src="' + esc(a.hero_image) + '" alt="">' +
      (a.hero_credit ? '<figcaption>' + esc(a.hero_credit) + '</figcaption>' : '') +
      '</figure>\n';
  }

  body += renderBlocks(a.blocks) + '\n</article>\n';

  // The landing. When the last domino falls the reader should feel it land, and
  // then the apparatus arrives as a distinctly separate zone.
  // ── הדים ──────────────────────────────────────────────────────────────────
  // Visitors see only what has been published, and cannot reply to each other.
  // A collection of voices, not a conversation between strangers — which is
  // what makes a pile-on structurally impossible rather than merely discouraged.
  if (Array.isArray(echoes) && echoes.length) {
    body += '<section class="a-echoes"><h2>הדים</h2>' +
      echoes.map(function (e) {
        return '<article class="a-echo">' +
          renderBlocks([{ type: 'text', body: e.body || '' }]) +
          '<div class="a-echo-by">' +
          esc(displayName(e.sender, e.attribution)) + '</div></article>';
      }).join('') + '</section>\n';
  }

  body += echoForm(a.id);

  const pubs = Array.isArray(a.external_pubs) ? a.external_pubs : [];
  let landing = '';
  if (a.term_name) {
    landing += '<h3>המונח</h3><ul><li>' + esc(a.term_name) + '</li></ul>';
  }
  if (related.length) {
    landing += '<h3>לקריאה נוספת</h3><ul>' + related.map(function (r) {
      return '<li><a href="/library/' + esc(r.slug) + '">' +
        esc(r.title_lead || r.title_topic) + '</a></li>';
    }).join('') + '</ul>';
  }
  if (pubs.length) {
    landing += '<h3>פורסם גם ב־</h3><ul>' + pubs.map(function (p) {
      const label = esc(p.name || p.url);
      return '<li>' + (p.url
        ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + label + '</a>'
        : label) + (p.date ? ' · ' + esc(p.date) : '') + '</li>';
    }).join('') + '</ul>';
  }
  if (landing) {
    body += '<aside class="a-landing no-print">' +
      '<div class="a-landing-bar" aria-hidden="true"><i></i><b></b></div>' +
      landing + '</aside>\n';
  }

  return shell(titleText(a), description, canonical, image, body);
}

// The invitation shapes what arrives more than any rule enforced afterwards,
// so the question is "מה זה עורר בך?" and never "הוסף תגובה".
function echoForm(id) {
  return '<section class="a-echo-form no-print" id="echo">' +
    '<h2>מה זה עורר בך?</h2>' +
    '<p class="a-echo-why">התגובות כאן עוברות דרכי. אני קוראת כל מה שנשלח ובוחרת מה ומתי לפרסם — ' +
    'לא כדי לסנן דעות, אלא כדי שיהיה אפשר לומר כאן דברים אישיים בלי להיחשף יותר ממה שרצית. ' +
    'שיחה ישירה בין המשתתפים מתקיימת ב<a href="/zoom">מפגשי הזום</a>.</p>' +
    '<form id="echoForm">' +
    '<div class="a-echo-two">' +
      '<input type="text" name="sender" placeholder="שם (לא חובה)">' +
      '<input type="email" name="email" placeholder="אימייל לחזרה (לא חובה)">' +
    '</div>' +
    '<textarea name="story" rows="6" placeholder="מה עלה בך כשקראת?"></textarea>' +
    '<label class="a-echo-consent">' +
      '<input type="checkbox" name="consent" value="1">' +
      '<span>אני מאשר/ת שהדברים יצטרפו לספרייה. ללא סימון — הם יגיעו לרונית בלבד.</span>' +
    '</label>' +
    '<div class="a-echo-attr">אם יפורסם — כיצד לייחס אליי?' +
      ['<label><input type="radio" name="attribution" value="full"> בשמי המלא</label>',
       '<label><input type="radio" name="attribution" value="first"> בשם פרטי בלבד</label>',
       '<label><input type="radio" name="attribution" value="anonymous" checked> באופן אנונימי</label>'
      ].join('') + '</div>' +
    '<button type="submit">שליחה</button>' +
    '<div id="echoMsg"></div>' +
    '<p class="a-echo-note">תגובות מתפרסמות כמה ימים לאחר קבלתן — יש זמן לחשוב שוב. ' +
    'אפשר לבטל בכל רגע, גם אחרי הפרסום, בלי צורך בהסבר.</p>' +
    '</form></section>\n' +
    '<script>(function(){var f=document.getElementById("echoForm");if(!f)return;' +
    'f.addEventListener("submit",function(e){e.preventDefault();' +
    'var d=new FormData(f),m=document.getElementById("echoMsg");' +
    'if(!String(d.get("story")||"").trim()){m.textContent="עוד לא נכתב דבר.";return}' +
    'm.textContent="שולח…";' +
    'fetch("/api/story",{method:"POST",headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({article_id:' + id + ',sender:d.get("sender"),email:d.get("email"),' +
    'story:d.get("story"),consent:d.get("consent")==="1",attribution:d.get("attribution")})})' +
    '.then(function(r){return r.json()}).then(function(){' +
    'f.innerHTML="<p class=\'a-echo-thanks\'>הדברים הגיעו לרונית. תודה.</p>"})' +
    '.catch(function(){m.textContent="השליחה נכשלה. אפשר לנסות שוב."})});})();<\/script>';
}

function errorPage(message) {
  return shell('הספרייה המשותפת', '', '', '',
    '<article class="a-article"><header class="a-title">' +
    '<h1 class="a-title-lead">' + esc(message) + '</h1></header>' +
    '<p><a href="/materials">← חזרה לספרייה המשותפת</a></p></article>');
}
