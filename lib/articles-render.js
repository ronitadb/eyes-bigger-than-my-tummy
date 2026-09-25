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
];

const IMAGE_LAYOUTS = ['full', 'inset', 'side', 'panel'];

const OPENING_SOURCES = {
  book: 'מתוך ״עיניים גדולות זה לא טוב״',
  library: 'מתוך סיפור שהתקבל בספרייה',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inline marks inside a text block. Deliberately few: links, italics for
// mid-sentence emphasis (bold is reserved for subheadings), and footnote marks.
function inline(text) {
  var out = esc(text);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    function (_, label, url) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + label + '</a>';
    });
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[\^(\d{1,3})\]/g, function (_, n) {
    return '<sup class="fn-ref"><a href="#fn-' + n + '" id="fnref-' + n + '">' + n + '</a></sup>';
  });
  return out;
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
        (b.attribution ? '<cite>' + esc(b.attribution) + '</cite>' : '') +
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

function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(renderBlock).filter(Boolean).join('\n');
}

module.exports = { renderBlocks, renderBlock, motto, BLOCK_TYPES, OPENING_SOURCES, IMAGE_LAYOUTS, esc, inline, paragraphs };
