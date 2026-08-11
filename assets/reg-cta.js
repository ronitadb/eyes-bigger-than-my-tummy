/* Floating "register" shortcut for the Zoom page. The sign-up form sits far
   down a long page, so once the visitor scrolls past the intro we show a pinned
   pill at the top-centre that jumps straight to the form. It hides again when
   the form itself is on screen. Loaded only on zoom.html; no-op without a
   #join-form. Appended to <body> (outside the x-dc content) so it always sticks. */
(function () {
  'use strict';

  if (!document.getElementById('reg-cta-style')) {
    var s = document.createElement('style');
    s.id = 'reg-cta-style';
    s.textContent =
      '#reg-cta{position:fixed;top:14px;left:50%;z-index:80;display:inline-flex;align-items:center;gap:8px;' +
      'background:#3D7468;color:#F4F8F4;font-family:Assistant,sans-serif;font-weight:700;font-size:15px;' +
      'text-decoration:none;padding:12px 24px;border-radius:999px;box-shadow:0 8px 24px rgba(34,48,47,.28);' +
      'transform:translate(-50%,-200%);transition:transform .28s ease;white-space:nowrap;cursor:pointer;' +
      '-webkit-tap-highlight-color:transparent}' +
      '#reg-cta.show{transform:translate(-50%,0)}' +
      '@media(prefers-reduced-motion:reduce){#reg-cta{transition:none}}';
    document.head.appendChild(s);
  }

  function ensure() {
    if (document.getElementById('reg-cta')) return;
    if (!document.getElementById('join-form')) return; // registration page only
    var a = document.createElement('a');
    a.id = 'reg-cta';
    a.href = '#join-form';
    a.innerHTML = 'להרשמה למפגשים <span aria-hidden="true">↓</span>';
    document.body.appendChild(a);
  }

  function onScroll() {
    var cta = document.getElementById('reg-cta');
    if (!cta) return;
    var form = document.getElementById('join-form');
    var formTop = form ? form.getBoundingClientRect().top : 999999;
    // Show after the visitor has scrolled past the hero, hide once the form is
    // near the top of the viewport (they've arrived).
    cta.classList.toggle('show', window.scrollY > 500 && formTop > 220);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#reg-cta');
    if (!a) return;
    e.preventDefault();
    var form = document.getElementById('join-form');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () {
      var n = document.getElementById('join-name');
      if (n) n.focus({ preventScroll: true });
    }, 450);
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  ensure(); onScroll();
  // x-dc may build the page after our first pass — poll briefly until ready.
  var tries = 0;
  var iv = setInterval(function () {
    ensure(); onScroll();
    if (document.getElementById('reg-cta') || ++tries > 40) clearInterval(iv);
  }, 100);
})();
