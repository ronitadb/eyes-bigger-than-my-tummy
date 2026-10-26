// Turns an article's blocks into HTML.
//
// Used by BOTH the public page (api/article.js) and the admin preview, so what
// Ronit sees while writing is the same code path that publishes. A preview that
// renders separately from the page always drifts eventually.
//
// Private fields (chain, notes) never reach here. They are not passed in.

const BLOCK_TYPES = [
  'opening', 'domino', 'text', 'subheading', 'quote',
  'term', 'image', 'list', 'fact', 'divider', 'footnotes', 'motto', 'voices', 'keyline',
  'part', 'unit', 'sidenotes', 'sources', 'jbox', 'scan',
];

const IMAGE_LAYOUTS = ['full', 'inset', 'side', 'panel', 'float', 'margin'];

// Set by renderBlocks while it renders an article that carries a הערות צד
// block. In that article [^n] marks a side note in the margin rather than a
// footnote at the foot of the page.
var SIDENOTES = false;

const OPENING_SOURCES = {
  book: 'מתוך ״עיניים גדולות זה לא טוב״',
  library: 'מתוך סיפור שהתקבל בספרייה',
};

// Kana, kanji and the Japanese marks between them.
const JA_RUN = /[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inline marks inside a text block. Deliberately few: links, italics for
// mid-sentence emphasis, bold where the author's own text has it, and
// footnote marks.
//
// A link to another article, [מאמר 2](/library/article-02), stays an ordinary
// link in the HTML; article-notes.js gives it a popover with the title.
function inline(text) {
  var out = esc(text);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
    function (_, label, url) {
      var lib = url.match(/^\/library\/([a-z0-9-]+)$/);
      if (lib) {
        return '<a class="a-xref" href="' + esc(url) + '" data-slug="' + lib[1] + '">' + label + '</a>';
      }
      if (url.charAt(0) === '/') return '<a href="' + esc(url) + '">' + label + '</a>';
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + label + '</a>';
    });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Japanese is marked as Japanese, so the browser draws the Japanese forms of
  // the characters (not the Chinese ones) in a Japanese face.
  out = out.replace(JA_RUN, '<span class="a-ja" lang="ja">$&</span>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  if (SIDENOTES) {
    // The marker hugs the word it annotates: a space typed before it would
    // stand between the word and its number.
    out = out.replace(/\s?\[\^(\d{1,3})\]/g, function (_, n) {
      return '<sup class="sn-ref"><a href="#sn-' + n + '" data-sn="' + n + '"' +
        ' aria-label="הערת צד ' + n + '">' + n + '</a></sup>';
    });
  }
  out = out.replace(/\[\^(\d{1,3})\]/g, function (_, n) {
    return '<sup class="fn-ref"><a href="#fn-' + n + '" id="fnref-' + n + '">' + n + '</a></sup>';
  });
  return out;
}

// The article's literary title. A source in brackets at its end, as in
// ״…״ (בראשית מד, ל), is set small after the line rather than at its size.
function titleLead(text) {
  var m = String(text || '').match(/^(.*\S)\s+(\([^()]+\))\s*$/);
  if (!m) return esc(text);
  return esc(m[1]) + ' <span class="a-title-cite">' + esc(m[2]) + '</span>';
}

// A blank line starts a new paragraph; a single newline is a line break.
function paragraphs(text, cls) {
  var klass = cls ? ' class="' + cls + '"' : '';
  return String(text || '')
    .split(/\n{2,}/)
    .map(function (p) { return p.trim(); })
    .filter(Boolean)
    .map(function (p) { return '<p' + klass + '>' + inline(p).replace(/\n/g, '<br>') + '</p>'; })
    .join('\n');
}

// A quotation set as a heading or a verse, with its source under it in small
// type. With a source the marks are the renderer's, as in motto(): any the
// author typed are stripped first, so none are doubled.
function quoted(text, cite) {
  var t = String(text || '').trim();
  if (!String(cite || '').trim()) return inline(t).replace(/\n/g, '<br>');
  t = t.replace(/^["״“”]+|["״“”]+$/g, '').trim();
  return '״' + inline(t).replace(/\n/g, '<br>') + '״';
}
function citeLine(cite, cls) {
  var c = String(cite || '').trim();
  return c ? '<p class="' + cls + '">' + inline(c).replace(/\n/g, '<br>') + '</p>' : '';
}

// A line of verse under a heading, with its source. Used on its own under the
// article title, and inside a domino between the heading and the first
// paragraph — one look for both, so they cannot drift apart.
// The line is always quoted and its source follows on the same line, so the
// marks are added here rather than typed: typed ones would drift between
// articles. Any the author did type are stripped first, so none are doubled.
function motto(text, by) {
  var t = String(text || '').trim().replace(/^["״“”]+|["״“”]+$/g, '').trim();
  if (!t) return '';
  return '<div class="a-motto"><p>' +
    '״' + inline(t).replace(/\n/g, '<br>') + '״' +
    (by ? ' <cite>— ' + esc(by) + '</cite>' : '') +
    '</p></div>';
}

function renderBlock(b) {
  if (!b || BLOCK_TYPES.indexOf(b.type) < 0) return '';

  switch (b.type) {

    // The literary entry. Carries its source, because Ronit quotes clinical and
    // reader material and the label is the ethics, not decoration.
    case 'opening': {
      var label = b.source === 'free'
        ? (b.source_text || '')
        : (OPENING_SOURCES[b.source] || '');
      return '<section class="a-opening">' +
        (label ? '<div class="a-opening-src">' + esc(label) + '</div>' : '') +
        paragraphs(b.body) +
        '</section>';
    }

    // One domino: the seam, then the heading, then its paragraphs.
    // The heading is a statement, never a label, and never numbered.
    case 'domino':
      return '<div class="a-seam" aria-hidden="true"><i></i><b></b><i></i></div>' +
        '<section class="a-domino">' +
        (b.heading ? '<h2>' + inline(b.heading) + '</h2>' : '') +
        motto(b.motto, b.motto_by) +
        paragraphs(b.body) +
        '</section>';

    case 'text':
      return '<section class="a-text">' + paragraphs(b.body) + '</section>';

    // Body font, bold, but in the heading green — colour and spacing separate
    // it from emphasis without introducing a fourth size.
    case 'subheading':
      return '<h3 class="a-sub">' + esc(b.text || '') + '</h3>';

    case 'quote':
      return '<blockquote class="a-quote">' + paragraphs(b.body) +
        (b.attribution ? '<cite>' + inline(b.attribution) + '</cite>' : '') +
        '</blockquote>';

    // Introduces a term in THIS article's context. The canonical definition
    // lives in the מילון; this box will link to it once that exists.
    case 'term':
      return '<aside class="a-term">' +
        '<div class="a-term-name">' + esc(b.name || '') +
          (b.name_en ? '<span> · ' + esc(b.name_en) + '</span>' : '') + '</div>' +
        paragraphs(b.body) +
        (b.link ? '<a class="a-term-link" href="' + esc(b.link) +
          '" target="_blank" rel="noopener">להגדרה המלאה ←</a>' : '') +
        '</aside>';

    // Four treatments, because one does not fit every photograph. A landscape
    // archive shot wants the full column; a portrait at that width becomes a
    // wall. 'side' and 'panel' reproduce the boxes from the designed PDF, where
    // an image sits beside its text rather than interrupting it.
    case 'image': {
      if (!b.src) return '';
      const layout = IMAGE_LAYOUTS.indexOf(b.layout) > -1 ? b.layout : 'full';
      const img = '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">';
      const cap = b.credit ? '<figcaption>' + esc(b.credit) + '</figcaption>' : '';
      if (layout === 'panel') {
        // The credit rides on the image itself, so the media column can fill its
        // whole height instead of being pushed up by a caption beneath it.
        return '<figure class="a-figure a-figure-panel' + (b.wide ? ' a-figure-panel-wide' : '') + '">' +
          '<div class="a-figure-media">' + img + cap + '</div>' +
          '<div class="a-figure-text">' +
            '<div class="a-figure-accent" aria-hidden="true"><b></b><i></i></div>' +
            (b.title ? '<div class="a-figure-label">' + esc(b.title) + '</div>' : '') +
            paragraphs(b.body || '') +
          '</div>' +
          '</figure>';
      }
      if (layout === 'side') {
        return '<figure class="a-figure a-figure-side">' +
          '<div class="a-figure-media">' + img + cap + '</div>' +
          (b.body ? '<div class="a-figure-text">' + paragraphs(b.body) + '</div>' : '') +
          '</figure>';
      }
      return '<figure class="a-figure a-figure-' + layout + '">' + img + cap + '</figure>';
    }

    // The bullet is the gold diamond, tying lists to the divider motif.
    case 'list': {
      var items = (Array.isArray(b.items) ? b.items : [])
        .filter(function (i) { return String(i || '').trim(); })
        .map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('');
      if (!items) return '';
      // A run of parallel lines that steps out past the column's reading
      // edge, each hung on a green diamond.
      if (b.style === 'hang') return '<ul class="a-list a-list-hang">' + items + '</ul>';
      return b.ordered
        ? '<ol class="a-list a-list-num">' + items + '</ol>'
        : '<ul class="a-list">' + items + '</ul>';
    }

    case 'fact':
      return '<aside class="a-fact">' +
        (b.title ? '<div class="a-fact-title">' + esc(b.title) + '</div>' : '') +
        paragraphs(b.body) + '</aside>';

    case 'motto':
      return motto(b.body, b.attribution);

    // A sentence set larger in the running text, to break a long stretch of
    // prose. Not a heading: light, not bold, and carrying no structure.
    // Centred in the text by default; 'box' sets one or more short paragraphs
    // in the white card, in their own place in the text, never repeated.
    case 'keyline':
      if (!String(b.body || '').trim()) return '';
      if (b.style === 'box') {
        return '<div class="a-keyline a-keyline-box">' + paragraphs(b.body) + '</div>';
      }
      // A closing: the cream band that steps out past the column, for the
      // paragraphs that end the whole article.
      if (b.style === 'band') {
        return '<div class="a-keyline a-keyline-band">' +
          '<div class="a-band-mark" aria-hidden="true"><i></i><b></b><i></i></div>' +
          paragraphs(b.body) + '</div>';
      }
      return '<p class="a-keyline">' + inline(String(b.body).trim()).replace(/\n/g, '<br>') + '</p>';

    // Several voices in a row — the design's own treatment, ported from
    // article.dc.html: the name in gold at the start of the first paragraph,
    // thin rules between them. Six quote panels in a row would be a wall.
    case 'voices': {
      var voices = (Array.isArray(b.items) ? b.items : [])
        .filter(function (v) { return v && String(v.body || '').trim(); })
        .map(function (v) {
          var html = paragraphs(v.body);
          if (v.name) {
            html = html.replace('<p>', '<p><span class="a-voice-name">' + esc(v.name) + '</span> ');
          }
          return '<div class="a-voice">' + html + '</div>';
        }).join('');
      if (!voices) return '';
      return '<section class="a-voices">' +
        (b.source ? '<div class="a-voices-src">' + esc(b.source) + '</div>' : '') +
        voices + '</section>';
    }

    case 'divider':
      return '<div class="a-seam" aria-hidden="true"><i></i><b></b><i></i></div>';

    // A part of the article, opened by a large heading (it may run over two
    // lines) and an optional line under it. Everything after it, up to the
    // next part, belongs to it: renderBlocks wraps them in its section, so
    // this returns the section OPEN.
    case 'part': {
      var ph = String(b.heading || '').trim();
      if (!ph) return '';
      return '<div class="a-seam" aria-hidden="true"><i></i><b></b><i></i></div>' +
        '<section class="a-part"><header class="a-part-head">' +
        '<h2 class="a-part-title">' + quoted(ph, b.cite) + '</h2>' +
        citeLine(b.cite, 'a-part-cite') +
        (String(b.sub || '').trim() ? '<p class="a-part-sub">' + inline(String(b.sub).trim()) + '</p>' : '') +
        '</header>';
    }

    // A unit inside a part, opened by a verse (centred) or by a heading. It
    // runs until the next unit, part or divider, and the design shows that
    // reach: the opener is the top of the unit, not a pause between
    // paragraphs. Returned OPEN, like a part. An empty unit opens nothing; it
    // only closes the one before it.
    case 'unit': {
      var verse = String(b.verse || '').trim();
      var uh = String(b.heading || '').trim();
      if (verse) {
        return '<section class="a-unit a-unit-verse"><header class="a-unit-head">' +
          '<p class="a-verse">' + quoted(verse, b.cite) + '</p>' +
          citeLine(b.cite, 'a-verse-cite') +
          '<div class="a-unit-mark" aria-hidden="true"><i></i><b></b><i></i></div>' +
          '</header>';
      }
      if (uh) {
        return '<section class="a-unit a-unit-heading"><header class="a-unit-head">' +
          '<h3 class="a-unit-title">' + inline(uh) + '</h3></header>';
      }
      return '';
    }

    // הערות צד. In the margin beside their marker on a wide screen, in a
    // popover on a phone — article-notes.js does both. Without the script,
    // and on paper, they stand here as a numbered list.
    case 'sidenotes': {
      var sn = (Array.isArray(b.items) ? b.items : [])
        .filter(function (i) { return i && (String(i.label || '').trim() || String(i.body || '').trim()); })
        .map(function (it, i) {
          var n = i + 1;
          var label = String(it.label || '').trim();
          var body = String(it.body || '').trim();
          // The closing reference is Latin inside Hebrew. Isolated, it keeps
          // its own order and its brackets when the line breaks inside it.
          // A note may end in a working marker in bold brackets, after the
          // reference; the reference is still the one isolated.
          var src = body.match(/^([\s\S]*?)\s*(\([^()]*[A-Za-z][^()]*\))(\s*\*\*\[[^\]]*\]\*\*)?\s*$/);
          return '<li class="a-sn" id="sn-' + n + '" data-sn="' + n + '">' +
            '<span class="a-sn-num">' + n + '</span>' +
            (label ? '<b class="a-sn-label">' + inline(label) + '</b>' + (body ? ' – ' : '') : '') +
            (src ? inline(src[1]) + ' <span class="a-sn-src" dir="ltr">' + inline(src[2]) + '</span>' +
                   (src[3] ? ' ' + inline(src[3].trim()) : '')
                 : inline(body)) + '</li>';
        }).join('');
      if (!sn) return '';
      return '<section class="a-sidenotes" aria-label="הערות צד"><ol>' + sn + '</ol></section>';
    }

    // The sources at the end: small, and part of the article. A reference
    // list (items, APA) is set left to right with hanging indents under its
    // Hebrew title; a plain body stays a single line.
    case 'sources': {
      var refs = (Array.isArray(b.items) ? b.items : [])
        .filter(function (i) { return String(i || '').trim(); })
        .map(function (i) { return '<li>' + inline(String(i).trim()) + '</li>'; }).join('');
      if (refs) {
        return '<section class="a-refs"><h3 class="a-refs-title">' +
          esc(String(b.title || '').trim() || 'מקורות') + '</h3>' +
          '<ul dir="ltr" lang="en">' + refs + '</ul></section>';
      }
      if (!String(b.body || '').trim()) return '';
      return '<p class="a-sources">' + inline(String(b.body).trim()) + '</p>';
    }

    // תיבה יפנית: a term, a few terms, or a paragraph from Japanese culture.
    // Each term carries its characters in a red-ink seal (a hanko) that runs
    // the height of its entry; a fine line in the same ink stands just outside
    // the box's reading edge, with a diamond at its middle.
    case 'jbox': {
      var rows = (Array.isArray(b.items) ? b.items : [])
        .filter(function (it) { return it && (String(it.name || '').trim() || String(it.body || '').trim()); })
        .map(function (it) {
          var seal = String(it.seal || '').trim();
          return '<div class="a-jbox-row' + (seal ? '' : ' a-jbox-noseal') + '">' +
            (seal ? '<div class="a-jbox-seal" lang="ja">' + esc(seal) + '</div>' : '') +
            '<div class="a-jbox-entry">' +
              (String(it.name || '').trim() ? '<div class="a-jbox-name">' + inline(String(it.name).trim()) + '</div>' : '') +
              paragraphs(it.body) +
            '</div></div>';
        }).join('');
      var jt = String(b.title || '').trim();
      var jl = String(b.lead || '').trim();
      var jb = String(b.body || '').trim();
      if (!rows && !jl && !jb) return '';
      return '<aside class="a-jbox">' +
        (jt ? '<div class="a-jbox-title">' + inline(jt) + '</div>' : '') +
        (jl ? paragraphs(jl, 'a-jbox-lead') : '') +
        paragraphs(jb) + rows +
        '</aside>';
    }

    // A page scanned from the book. Until the scan is in, an empty frame
    // holds its place; the passage's text waits in the block (b.text) and is
    // not shown.
    case 'scan': {
      if (!b.src) return '<div class="a-scan a-scan-empty" aria-hidden="true"></div>';
      return '<figure class="a-scan"><img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">' +
        (b.credit ? '<figcaption>' + esc(b.credit) + '</figcaption>' : '') + '</figure>';
    }

    case 'footnotes': {
      var notes = (Array.isArray(b.items) ? b.items : [])
        .filter(function (i) { return String(i || '').trim(); })
        .map(function (t, i) {
          var n = i + 1;
          return '<li id="fn-' + n + '"><span class="fn-num">' + n + '</span>' +
            inline(t) + ' <a class="fn-back" href="#fnref-' + n + '">↩</a></li>';
        }).join('');
      if (!notes) return '';
      return '<section class="a-footnotes"><ol>' + notes + '</ol></section>';
    }
  }
  return '';
}

// Parts and units are opened by their block and closed here, by whatever
// comes next: a unit by the next unit, part, domino or divider; a part by the
// next part or a divider. The editor stays a flat list of blocks.
function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  var out = [], inPart = false, inUnit = false;
  function closeUnit() { if (inUnit) { out.push('</section>'); inUnit = false; } }
  function closePart() { closeUnit(); if (inPart) { out.push('</section>'); inPart = false; } }

  SIDENOTES = blocks.some(function (b) {
    return b && b.type === 'sidenotes' && Array.isArray(b.items) && b.items.length;
  });
  try {
    blocks.forEach(function (b) {
      if (!b || BLOCK_TYPES.indexOf(b.type) < 0) return;
      var html;
      if (b.type === 'part') {
        closePart();
        html = renderBlock(b);
        if (html) { out.push(html); inPart = true; }
        return;
      }
      if (b.type === 'unit') {
        closeUnit();
        html = renderBlock(b);
        if (html) { out.push(html); inUnit = true; }
        return;
      }
      if (b.type === 'domino') closeUnit();
      if (b.type === 'divider') closePart();
      html = renderBlock(b);
      if (html) out.push(html);
    });
    closePart();
  } finally {
    SIDENOTES = false;
  }
  return out.join('\n');
}

module.exports = { renderBlocks, renderBlock, motto, BLOCK_TYPES, OPENING_SOURCES, IMAGE_LAYOUTS, esc, inline, paragraphs, titleLead };
