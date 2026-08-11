/* Phone-friendly header. Under 768px, collapse the nav behind a ☰ button and
   hide the side thumbnail; desktop (>768px) is untouched. Built to survive the
   x-dc re-render: the CSS lives in <head>, the injected elements are re-ensured
   whenever the DOM changes, and the toggle uses document-level delegation.
   Loaded on the pages that have the shared <header id="top">. No-op elsewhere. */
(function () {
  'use strict';

  if (!document.getElementById('mnav-style')) {
    var s = document.createElement('style');
    s.id = 'mnav-style';
    s.textContent =
      '.mnav-btn{display:none;background:none;border:0;padding:8px;margin-inline-start:auto;cursor:pointer;color:#3D7468;line-height:0}' +
      '.mnav-yael{display:none !important}' +
      '@media(max-width:768px){' +
        '#top{position:relative}' +
        '.mnav-btn{display:inline-flex;align-items:center}' +
        '#top a[href="/yael"]:not(.mnav-yael){display:none !important}' +
        '#top nav{display:none !important;position:absolute;top:100%;inset-inline:0;flex-direction:column;gap:0 !important;background:#FAF8F4;border-bottom:1px solid rgba(34,48,47,.12);box-shadow:0 16px 32px rgba(34,48,47,.12);z-index:60;padding:6px 0}' +
        '#top.mnav-open nav{display:flex !important}' +
        '#top nav a{padding:14px 24px !important;font-size:17px !important}' +
        '#top nav .mnav-yael{display:block !important}' +
      '}' +
      // On phones the "text overlaps side image" sections stack into one column,
      // so their desktop overhang (negative margin-inline + paper text-shadow halo)
      // just pushes RTL line-ends off the left edge. Neutralize it under 768px.
      '@media(max-width:768px){[style*="clamp(-150px,"]{margin-inline-start:0 !important;margin-inline-end:0 !important;text-shadow:none !important}}';
    document.head.appendChild(s);
  }

  // Add the ☰ button and a text "יעל" item into the menu (so mobile keeps
  // access to the page whose thumbnail we hide). Re-runs if x-dc rebuilds #top.
  function ensure() {
    var top = document.getElementById('top');
    if (!top) return;
    if (!top.querySelector('.mnav-btn')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mnav-btn';
      b.setAttribute('aria-label', 'תפריט ניווט');
      b.setAttribute('aria-expanded', 'false');
      b.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
      top.appendChild(b);
    }
    var nav = top.querySelector('nav');
    if (nav && !nav.querySelector('.mnav-yael')) {
      var y = document.createElement('a');
      y.className = 'mnav-yael';
      y.href = '/yael';
      y.textContent = 'יעל';
      y.style.color = '#445049';
      y.style.textDecoration = 'none';
      nav.appendChild(y);
    }
  }

  document.addEventListener('click', function (e) {
    var top = document.getElementById('top');
    if (!top) return;
    var btn = e.target.closest && e.target.closest('.mnav-btn');
    if (btn) {
      var open = top.classList.toggle('mnav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      e.preventDefault();
      return;
    }
    // Tapping a link inside the menu, or anywhere outside the header, closes it.
    if (top.classList.contains('mnav-open') &&
        (e.target.closest('#top nav a') || !e.target.closest('#top'))) {
      top.classList.remove('mnav-open');
    }
  });

  ensure();
  document.addEventListener('DOMContentLoaded', ensure);
  window.addEventListener('load', ensure);

  // x-dc may build the header after our first pass — poll briefly until the
  // button is in place, then stop.
  var tries = 0;
  var iv = setInterval(function () {
    ensure();
    if ((document.getElementById('top') && document.querySelector('.mnav-btn')) || ++tries > 40) {
      clearInterval(iv);
    }
  }, 100);

  // And keep it in place if the framework rebuilds the header later.
  var raf = false;
  new MutationObserver(function () {
    if (raf) return;
    raf = true;
    requestAnimationFrame(function () { raf = false; ensure(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
