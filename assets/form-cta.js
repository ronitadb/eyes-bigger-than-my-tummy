/* Floating shortcut to a page's main form. Long pages (Zoom sign-up, library
   story submission) bury the form far down; once the visitor scrolls past the
   intro we show a pinned top-centre pill that jumps straight to the form and
   focuses its first field. It hides at the top and once the form is on screen.
   Loaded on the relevant pages; it uses whichever known form is present. */
(function () {
  'use strict';

  var TARGETS = [
    { form: 'join-form',         focus: '#join-name',                         label: 'להרשמה למפגשים' },
    { form: 'story-submit-form', focus: '#story-submit-form [name="sender"]', label: 'לשליחת סיפור' }
  ];

  function target() {
    for (var i = 0; i < TARGETS.length; i++) {
      if (document.getElementById(TARGETS[i].form)) return TARGETS[i];
    }
    return null;
  }

  if (!document.getElementById('form-cta-style')) {
    var s = document.createElement('style');
    s.id = 'form-cta-style';
    s.textContent =
      '#form-cta{position:fixed;top:14px;left:50%;z-index:80;display:inline-flex;align-items:center;gap:8px;' +
      'background:#3D7468;color:#F4F8F4;font-family:Assistant,sans-serif;font-weight:700;font-size:15px;' +
      'text-decoration:none;padding:12px 24px;border-radius:999px;box-shadow:0 8px 24px rgba(34,48,47,.28);' +
      'transform:translate(-50%,-200%);transition:transform .28s ease;white-space:nowrap;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
      '#form-cta.show{transform:translate(-50%,0)}' +
      // On a phone the top-centre position covers the line being read and sits
      // outside the thumb's reach, so it moves to the bottom edge instead.
      '@media(max-width:768px){' +
        '#form-cta{top:auto;bottom:calc(14px + env(safe-area-inset-bottom,0px));' +
        'transform:translate(-50%,200%)}' +
        '#form-cta.show{transform:translate(-50%,0)}' +
      '}' +
      '@media(prefers-reduced-motion:reduce){#form-cta{transition:none}}';
    document.head.appendChild(s);
  }

  function ensure() {
    if (document.getElementById('form-cta')) return;
    var t = target();
    if (!t) return;
    var a = document.createElement('a');
    a.id = 'form-cta';
    a.href = '#' + t.form;
    a.innerHTML = t.label + ' <span aria-hidden="true">↓</span>';
    document.body.appendChild(a);
  }

  function onScroll() {
    var cta = document.getElementById('form-cta');
    if (!cta) return;
    var t = target();
    var form = t ? document.getElementById(t.form) : null;
    var formTop = form ? form.getBoundingClientRect().top : 999999;
    // Appear at the end of the first screen rather than the second, and stand
    // down as soon as any part of the form is actually on screen — which is the
    // right test whether the pill is pinned top (desktop) or bottom (phone).
    cta.classList.toggle('show', window.scrollY > 250 && formTop > window.innerHeight);
  }

  // Also drives the inline button near the top of the page, so both routes to
  // the form scroll smoothly and land with the first field focused.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#form-cta, [data-cta="join"]');
    if (!a) return;
    e.preventDefault();
    var t = target();
    var form = t ? document.getElementById(t.form) : null;
    if (!form) return;
    var y = form.getBoundingClientRect().top + window.scrollY - 80; // leave room above
    var from = window.scrollY;
    window.scrollTo({ top: y, behavior: 'smooth' });
    // If smooth scrolling is a no-op (reduced-motion settings, older engines),
    // the tap would otherwise do nothing at all — jump instead.
    setTimeout(function () {
      if (Math.abs(window.scrollY - from) < 4) window.scrollTo(0, y);
    }, 400);
    if (t.focus) {
      setTimeout(function () {
        var f = document.querySelector(t.focus);
        if (f) f.focus({ preventScroll: true });
      }, 480);
    }
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  ensure(); onScroll();
  var tries = 0;
  var iv = setInterval(function () {
    ensure(); onScroll();
    if (document.getElementById('form-cta') || ++tries > 40) clearInterval(iv);
  }, 100);
})();
