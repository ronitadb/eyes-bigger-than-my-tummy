// Side notes and article popovers, for the library's article pages.
//
// Loaded by the public page (api/article.js) and by the admin preview, which
// calls ArticleNotes.init() each time it re-renders. One script for both, so
// the preview behaves as the page does.
//
// הערות צד: where the page has a margin, each note stands in it, level with
// its marker, on the side nearer the marker's place in its line. Lines break
// differently on every screen, so the side is measured here, and measured
// again whenever the article changes size or the fonts arrive. Where there is
// no margin, tapping the number opens the note in a popover.
//
// A link to another article ([מאמר 2](/library/article-02)) opens the same
// popover with that article's title: on hover with a mouse, on the first tap
// on a phone. The second tap follows the link.
//
// Without this script the notes stand as a numbered list at their place in
// the article, and article links are ordinary links.
(function () {
  if (window.ArticleNotes) return;

  var GAP = 56;        // between the column and a note; clears the closing band's bleed
  var MAX_W = 250;     // a note wider than this reads as a second column
  var MIN_W = 170;     // narrower than this, the margin is not worth using
  var STACK = 14;      // space between two notes pushed down on the same side
  var FIG_W = 290;     // an image in the margin may be a little wider than a note
  var FIG_GAP = 28;    // and wants more air around it

  var tracked = [];    // { art, ro }
  var pop = null, popFor = null, hideTimer = null, showTimer = null;
  var lastPointer = 'mouse';
  var articlesReq = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── layout ────────────────────────────────────────────────────────────────

  function layout(art) {
    var notes = art.querySelectorAll('.a-sn');
    var figs = art.querySelectorAll('.a-figure-margin');
    if (!notes.length && !figs.length) return;

    var bounds = (art.parentElement || document.body).getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var ar = art.getBoundingClientRect();
    var cs = getComputedStyle(art);
    var colL = ar.left + parseFloat(cs.paddingLeft);
    var colR = ar.right - parseFloat(cs.paddingRight);
    var space = Math.min(colL - Math.max(bounds.left, 0), Math.min(bounds.right, vw) - colR) - GAP - 12;
    var w = Math.min(MAX_W, Math.floor(space));
    var fw = Math.min(FIG_W, Math.floor(space));

    if (w < MIN_W) {
      art.classList.remove('sn-margin');
      art.classList.add('sn-pop');
      Array.prototype.forEach.call(notes, function (n) { n.style.top = ''; n.style.left = ''; });
      Array.prototype.forEach.call(figs, function (f) { f.style.top = ''; f.style.left = ''; });
      return;
    }
    if (pop && !pop.hidden && popFor && art.contains(popFor) && popFor.closest('.sn-ref')) hide();
    art.classList.remove('sn-pop');
    art.classList.add('sn-margin');
    art.style.setProperty('--sn-w', w + 'px');
    art.style.setProperty('--fig-w', fw + 'px');

    // The notes are positioned against the article itself.
    var box = art.querySelector('.a-sidenotes');
    if (box && box.parentElement !== art) art.appendChild(box);

    var items = [];
    Array.prototype.forEach.call(notes, function (note) {
      var ref = art.querySelector('.sn-ref a[data-sn="' + note.getAttribute('data-sn') + '"]');
      note.classList.toggle('sn-orphan', !ref);
      if (!ref) return;
      var rr = ref.getBoundingClientRect();
      // The side is decided against the block the marker sits in: a marker in
      // the right half of its line takes the right margin.
      var host = ref.closest('p, li, blockquote, figure, .a-keyline') || art;
      var hr = host.getBoundingClientRect();
      var right = (rr.left + rr.right) / 2 >= (hr.left + hr.right) / 2;
      items.push({ el: note, top: rr.top - ar.top - 7, right: right, h: note.offsetHeight, gap: STACK });
    });

    // An image has no marker, so no side of its own. It stands level with its
    // place in the text, on the side whose notes it would crowd least; on a
    // tie, the side opposite the image before it, so they alternate.
    var lastRight = true;
    Array.prototype.forEach.call(figs, function (fig) {
      fig.classList.add('is-measuring');
      var top = fig.getBoundingClientRect().top - ar.top + 6;
      fig.classList.remove('is-measuring');
      var h = fig.offsetHeight;
      function crowd(right) {
        var c = 0;
        items.forEach(function (it) {
          if (it.right !== right) return;
          c += Math.max(0, Math.min(top + h, it.top + it.h) - Math.max(top, it.top) + FIG_GAP);
        });
        return c;
      }
      var cl = crowd(false), cr = crowd(true);
      var right = cl === cr ? !lastRight : cr < cl;
      lastRight = right;
      items.push({ el: fig, top: top, right: right, h: h, gap: FIG_GAP, fig: true });
    });

    items.sort(function (a, b) { return a.top - b.top; });
    var floor = { left: -Infinity, right: -Infinity };
    items.forEach(function (it) {
      var side = it.right ? 'right' : 'left';
      var width = it.fig ? fw : w;
      var top = Math.max(it.top, floor[side] + it.gap);
      it.el.style.top = Math.round(top) + 'px';
      it.el.style.left = Math.round(it.right
        ? colR - ar.left + GAP
        : colL - ar.left - GAP - width) + 'px';
      floor[side] = top + it.el.offsetHeight + (it.fig ? FIG_GAP - it.gap : 0);
    });
  }

  var pending = null;
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = null;
      tracked = tracked.filter(function (t) {
        if (document.contains(t.art)) return true;
        if (t.ro) t.ro.disconnect();
        return false;
      });
      tracked.forEach(function (t) { layout(t.art); });
    });
  }

  function track(art) {
    for (var i = 0; i < tracked.length; i++) if (tracked[i].art === art) return;
    var t = { art: art, ro: null };
    // Lazy images, fonts and late styles all change the article's height,
    // and with it every marker's place.
    if (window.ResizeObserver) { t.ro = new ResizeObserver(schedule); t.ro.observe(art); }
    tracked.push(t);
  }

  function init(root) {
    root = root || document;
    var arts = root.matches && root.matches('.a-article') ? [root] :
      Array.prototype.slice.call(root.querySelectorAll('.a-article'));
    arts.forEach(function (art) {
      if (art.querySelector('.a-sn, .a-figure-margin')) {
        art.classList.add('sn-pop');   // until measured
        track(art);
      }
    });
    schedule();
  }

  // ── popover ───────────────────────────────────────────────────────────────

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'a-pop';
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    pop.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', laterHide);
    document.body.appendChild(pop);
    return pop;
  }

  function place() {
    if (!pop || pop.hidden || !popFor) return;
    var r = popFor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, vw - w - 12));
    var top = r.bottom + 8;
    if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
    pop.style.left = Math.round(left + window.pageXOffset) + 'px';
    pop.style.top = Math.round(top + window.pageYOffset) + 'px';
  }

  function show(trigger, html) {
    clearTimeout(hideTimer);
    ensurePop();
    if (popFor && popFor !== trigger) popFor.setAttribute('aria-expanded', 'false');
    pop.innerHTML = html;
    pop.hidden = false;
    popFor = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    place();
  }

  function hide() {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    if (popFor) popFor.setAttribute('aria-expanded', 'false');
    popFor = null;
  }
  function laterHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 260); }

  function noteHtml(ref) {
    var art = ref.closest('.a-article');
    var note = art && art.querySelector('.a-sn[data-sn="' + ref.getAttribute('data-sn') + '"]');
    return note ? '<div>' + note.innerHTML + '</div>' : '';
  }

  // The titles come from the library's own index, so the popover shows the
  // title as it stands today, not as it was when this article was written.
  function articles() {
    if (!articlesReq) {
      articlesReq = fetch('/api/article').then(function (r) { return r.json(); })
        .then(function (d) { return (d && d.articles) || []; })
        .catch(function () { articlesReq = null; return []; });
    }
    return articlesReq;
  }

  function xrefHtml(a, href) {
    if (!a) return '<a class="a-pop-link" href="' + esc(href) + '">למאמר ←</a>';
    var html = '<span class="a-pop-title">' + esc(a.title_lead || a.title_topic) + '</span>' +
      (a.title_lead && a.title_topic ? '<span class="a-pop-topic">' + esc(a.title_topic) + '</span>' : '');
    if (a.status === 'published') {
      html += '<a class="a-pop-link" href="' + esc(href) + '">לקריאת המאמר ←</a>';
    }
    return html;
  }

  function showXref(link) {
    var slug = link.getAttribute('data-slug');
    var href = link.getAttribute('href');
    show(link, '<span class="a-pop-wait">…</span>');
    articles().then(function (list) {
      if (popFor !== link) return;
      var a = null;
      for (var i = 0; i < list.length; i++) if (list[i].slug === slug) { a = list[i]; break; }
      pop.innerHTML = xrefHtml(a, href);
      place();
    });
  }

  function flash(ref, on) {
    var art = ref.closest('.a-article');
    var note = art && art.querySelector('.a-sn[data-sn="' + ref.getAttribute('data-sn') + '"]');
    if (note) note.classList.toggle('is-hot', on);
    ref.classList.toggle('is-hot', on);
    return note;
  }

  function inMargin(ref) {
    var art = ref.closest('.a-article');
    return !!(art && art.classList.contains('sn-margin'));
  }

  // ── events, delegated once for every article on the page ───────────────

  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);

  document.addEventListener('click', function (e) {
    var t = e.target;
    var ref = t.closest && t.closest('.a-article .sn-ref a');
    if (ref) {
      e.preventDefault();
      if (inMargin(ref)) {
        var note = flash(ref, true);
        setTimeout(function () { flash(ref, false); }, 1600);
        if (note) {
          var r = note.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) note.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        return;
      }
      // With a mouse, hovering has usually opened it already, and a click
      // that closed it again would read as broken. A tap toggles.
      clearTimeout(showTimer);
      if (popFor === ref && !pop.hidden && lastPointer !== 'mouse') hide();
      else show(ref, noteHtml(ref));
      return;
    }
    var link = t.closest && t.closest('.a-article a.a-xref');
    if (link) {
      // A touch has no hover: the first tap shows where the link goes.
      if (lastPointer !== 'mouse' && popFor !== link) { e.preventDefault(); showXref(link); }
      return;
    }
    if (pop && !pop.hidden && !pop.contains(t)) hide();
  });

  document.addEventListener('mouseover', function (e) {
    if (lastPointer !== 'mouse') return;
    var t = e.target;
    var ref = t.closest && t.closest('.a-article .sn-ref a');
    if (ref) {
      if (inMargin(ref)) { flash(ref, true); return; }
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { show(ref, noteHtml(ref)); }, 120);
      return;
    }
    var link = t.closest && t.closest('.a-article a.a-xref');
    if (link) {
      clearTimeout(showTimer);
      showTimer = setTimeout(function () { if (popFor !== link) showXref(link); else clearTimeout(hideTimer); }, 120);
    }
  });

  document.addEventListener('mouseout', function (e) {
    var t = e.target;
    var ref = t.closest && t.closest('.a-article .sn-ref a');
    if (ref && inMargin(ref)) { flash(ref, false); return; }
    if (ref || (t.closest && t.closest('.a-article a.a-xref'))) {
      clearTimeout(showTimer);
      if (popFor) laterHide();
    }
  });

  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t.matches && t.matches('.a-article a.a-xref')) showXref(t);
    else if (t.matches && t.matches('.a-article .sn-ref a')) {
      if (inMargin(t)) flash(t, true); else show(t, noteHtml(t));
    }
  });
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.matches && t.matches('.a-article .sn-ref a') && inMargin(t)) flash(t, false);
    else if (popFor === t) laterHide();
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', function () { place(); schedule(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  window.addEventListener('load', schedule);
  // An image's height is unknown until it loads, and one in the margin does
  // not change the article's size, so the ResizeObserver cannot see it.
  document.addEventListener('load', function (e) {
    if (e.target && e.target.tagName === 'IMG' && e.target.closest('.a-figure-margin')) schedule();
  }, true);

  window.ArticleNotes = { init: init, layout: schedule };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
})();
