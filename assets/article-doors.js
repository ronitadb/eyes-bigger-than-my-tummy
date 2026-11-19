/* דלתות — the doors of a "doors" block (see article.css and lib/articles-render.js).
   First set for ״הכול בסדר?״ (2026-11-19).

   The page arrives with both doorways open and the text in them, so WhatsApp,
   print and a failed script all show the text. This script then:
   - draws each frame in pencil, in the site's illustration hand;
   - hangs Ronit's illustrated door in each doorway — the same picture, the
     second door its mirror, so each is hinged on its outer side;
   - lets the reader open a door: it swings out toward the reader and rests
     against the wall beside the frame, and the light comes in.

   A doorway is as tall as its scene's text, so the picture cannot simply be
   scaled. It is cut into five bands at fixed fractions of its height: the
   bands with detail (top rail + name plate; handle + middle rail; lower hinge
   + bottom rail) keep their proportions, and only the two plain panel bands
   stretch. Past 1.3× a panel band is repeated instead, every other copy
   flipped so the grain runs on without a seam, and always an odd count so it
   ends on the row the next band begins with. The fractions belong to
   zoom-02-door.webp; another picture would need its own. */
(function () {
  var DOOR = '/assets/article/zoom-02-door.webp';
  var BANDS = [[0, .2497, 0], [.2497, .4162, 1], [.4162, .6005, 0], [.6005, .7670, 1], [.7670, 1, 0]];
  var PLATE = { x0: .276, x1: .725, y0: .1605, y1: .229 };
  var FIXED = BANDS.reduce(function (f, b) { return f + (b[2] ? 0 : b[1] - b[0]); }, 0);

  /* ── pencil, for the frames ── */
  var NS = 'http://www.w3.org/2000/svg', INK = '#3B3B39', uid = 0, R;
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function rng(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function J(a) { return (R() - .5) * 2 * a; }
  function line(g, x1, y1, x2, y2, o) {
    o = o || {}; var jit = o.j == null ? .7 : o.j, n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 22));
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, d = '';
    for (var i = 0; i <= n; i++) { var t = i / n, k = J(jit); d += (i ? 'L' : 'M') + (x1 + dx * t + nx * k).toFixed(1) + ' ' + (y1 + dy * t + ny * k).toFixed(1); }
    el('path', { d: d, fill: 'none', stroke: INK, 'stroke-width': o.w || 1, 'stroke-opacity': o.o == null ? .7 : o.o, 'stroke-linecap': 'round' }, g);
  }
  function hatch(svg, g, x0, y0, w, h, ang, gap, op) {
    var id = 'dc' + (++uid), cp = el('clipPath', { id: id }, svg.querySelector('defs'));
    el('rect', { x: x0, y: y0, width: w, height: h }, cp);
    var hg = el('g', { 'clip-path': 'url(#' + id + ')' }, g);
    var cx = x0 + w / 2, cy = y0 + h / 2, D = Math.hypot(w, h) / 2 + 4, a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (var s = -D; s <= D; s += gap * (.8 + R() * .4)) {
      var px = cx - sa * s, py = cy + ca * s;
      line(hg, px - ca * D, py - sa * D, px + ca * D, py + sa * D, { o: op * (.6 + R() * .6), w: .55, j: .5 });
    }
  }
  function box(g, x, y, w, h, o) { line(g, x, y, x + w, y, o); line(g, x + w, y, x + w, y + h, o); line(g, x + w, y + h, x, y + h, o); line(g, x, y + h, x, y, o); }
  function drawFrame(fr) {
    R = rng(11); var w = fr.clientWidth, h = fr.clientHeight; if (!w || !h) return;
    var old = fr.querySelector(':scope > svg.sk'); if (old) old.remove();
    var svg = el('svg', { 'class': 'sk', viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    fr.insertBefore(svg, fr.firstChild);
    var defs = el('defs', {}, svg), fid = 'dp' + (++uid), f = el('filter', { id: fid }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '.8', numOctaves: '2', seed: '3', result: 'n' }, f);
    el('feDisplacementMap', { 'in': 'SourceGraphic', in2: 'n', scale: '1.6' }, f);
    var g = el('g', { filter: 'url(#' + fid + ')' }, svg), t = 16, s = 13, b = 12;
    hatch(svg, g, 0, 0, s, h - b, 88, 3, .30); hatch(svg, g, w - s, 0, s, h - b, 88, 3, .30);
    hatch(svg, g, 0, 0, w, t, 4, 3, .30); hatch(svg, g, 0, h - b, w, b, 8, 2, .45);
    box(g, 0, 0, w, h, { o: .9, w: 1.3 }); box(g, s, t, w - 2 * s, h - t - b, { o: .85, w: 1.1 });
    line(g, 0, h - b, w, h - b, { o: .8, w: 1.1 });
  }

  /* ── the illustrated door ── */
  var IMG = new Image(), ready = false;
  function paint(face, mirror, isBack) {
    var w = face.clientWidth, h = face.clientHeight; if (!w || !h) return null;
    var iw = IMG.naturalWidth, ih = IMG.naturalHeight, s = w / iw, dpr = Math.min(2, window.devicePixelRatio || 1);
    var c = face.querySelector('canvas'); if (!c) { c = document.createElement('canvas'); face.insertBefore(c, face.firstChild); }
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
    var k = Math.max(.05, (h - FIXED * ih * s) / ((1 - FIXED) * ih * s)), y = 0;
    BANDS.forEach(function (b) {
      var sy = b[0] * ih, sh = (b[1] - b[0]) * ih, nat = sh * s;
      if (!b[2]) { x.drawImage(IMG, 0, sy, iw, sh, 0, y, w, nat); y += nat; return; }
      var n = k <= 1.3 ? 1 : Math.max(1, 2 * Math.round((k - 1) / 2) + 1), ph = nat * k / n;
      for (var i = 0; i < n; i++) {
        if (i % 2) { x.save(); x.translate(0, y + ph); x.scale(1, -1); x.drawImage(IMG, 0, sy, iw, sh, 0, 0, w, ph); x.restore(); }
        else x.drawImage(IMG, 0, sy, iw, sh, 0, y, w, ph);
        y += ph;
      }
    });
    if (isBack) {
      // the inside of a door has no name plate: cover it with the panel just
      // below, feathered at its edges so no line shows
      var px = PLATE.x0 * iw, pw = (PLATE.x1 - PLATE.x0) * iw, py = PLATE.y0 * ih, pH = (PLATE.y1 - PLATE.y0) * ih;
      var tmp = document.createElement('canvas'), tw = Math.ceil((pw + 40) * s), th = Math.ceil((pH + 40) * s);
      tmp.width = tw; tmp.height = th; var tx = tmp.getContext('2d');
      tx.drawImage(IMG, px - 20, py + pH + 30, pw + 40, pH + 40, 0, 0, tw, th);
      tx.globalCompositeOperation = 'destination-in';
      var fe = Math.max(4, 14 * s), gx = tx.createLinearGradient(0, 0, tw, 0);
      gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(fe / tw, '#000'); gx.addColorStop(1 - fe / tw, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = gx; tx.fillRect(0, 0, tw, th);
      var gy = tx.createLinearGradient(0, 0, 0, th);
      gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(fe / th, '#000'); gy.addColorStop(1 - fe / th, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = gy; tx.fillRect(0, 0, tw, th);
      x.drawImage(tmp, (px - 20) * s, (py - 20) * s, tw, th);
      x.fillStyle = 'rgba(30,28,24,.05)'; x.fillRect(0, 0, w, h);
    }
    return { top: PLATE.y0 * ih * s, h: (PLATE.y1 - PLATE.y0) * ih * s };
  }

  function hang(door) {
    if (door.querySelector('.a-door-leaf')) return;
    var lab = door.querySelector('.a-door-label');
    var name = lab ? lab.getAttribute('data-name') : '', plate = (lab && lab.getAttribute('data-plate')) || name;
    var leaf = document.createElement('button');
    leaf.type = 'button'; leaf.className = 'a-door-leaf';
    leaf.setAttribute('aria-expanded', 'false');
    leaf.setAttribute('aria-label', 'לפתוח את הדלת: ' + name);
    leaf.innerHTML = '<span class="a-door-face a-door-front"><span class="a-door-plate"></span></span>' +
      '<span class="a-door-face a-door-back"></span><span class="a-door-edge"></span>';
    leaf.querySelector('.a-door-plate').textContent = plate;
    var room = door.querySelector('.a-door-room');
    room.insertAdjacentHTML('afterbegin', '<span class="a-door-shade"></span>');
    door.querySelector('.a-door-opening').insertBefore(leaf, room);
    leaf.addEventListener('click', function () {
      door.classList.add('is-open'); leaf.setAttribute('aria-expanded', 'true');
    });
  }

  function draw() {
    document.querySelectorAll('.a-doors.is-live .a-door').forEach(function (door) {
      var one = door.classList.contains('a-door-one'), front = door.querySelector('.a-door-front');
      if (!front) return;
      // a doorway is never shorter than the picture's fixed bands
      door.querySelector('.a-door-room').style.minHeight =
        Math.ceil(FIXED * IMG.naturalHeight * (front.clientWidth / IMG.naturalWidth) * 1.12) + 'px';
      var m = paint(front, !one, false);
      paint(door.querySelector('.a-door-back'), one, true);
      if (m) {
        var p = front.querySelector('.a-door-plate');
        p.style.top = m.top + 'px'; p.style.height = m.h + 'px'; p.style.fontSize = Math.max(12, m.h * .40) + 'px';
      }
      drawFrame(door.querySelector('.a-door-frame'));
    });
  }

  function init() {
    var sets = document.querySelectorAll('.a-article .a-doors');
    if (!sets.length) return;
    var src = sets[0].getAttribute('data-door') || DOOR;
    IMG.onload = function () {
      ready = true;
      sets.forEach(function (set, i) {
        set.querySelectorAll('.a-door').forEach(hang);
        set.classList.add('is-live');
        if (i === 0) set.querySelector('.a-doors-pair').insertAdjacentHTML('beforebegin',
          '<p class="a-doors-hint">לחצו על דלת כדי לפתוח אותה</p>');
      });
      draw();
    };
    IMG.src = src;
    var tm; window.addEventListener('resize', function () { if (!ready) return; clearTimeout(tm); tm = setTimeout(draw, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (ready) draw(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
