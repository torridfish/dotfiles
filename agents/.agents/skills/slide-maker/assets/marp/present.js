// Presenting tools for slides.sh --html, on top of Marp's own HTML template (bespoke), in the spirit of
// reveal.js's chalkboard plugin. Bespoke's own keys come first and are left alone (← → / Space / PgUp PgDn /
// Home End, o / Esc / Enter for the overview, f / F11 fullscreen, p presenter view); this adds, on keys
// bespoke does not use:
//   click the left / right third of the screen   previous / next slide
//   l   laser pointer on / off (a red dot)                   d   pen on / off: draw on the slide
//   u   undo the last stroke (or erase) on this slide         e   erase this slide's drawing
//   ?   show these keys
// Drawings stay per slide, in slide coordinates, for as long as the page is open. Only the audience view
// gets the tools: bespoke's overview, presenter view and its previews load this page again in a frame or
// window with ?view=…
(() => {
  'use strict';
  const slides = () => Array.from(document.querySelectorAll('svg[data-marpit-svg]'));
  const active = () => slides().findIndex((s) => s.classList.contains('bespoke-marp-active'));
  if (!slides().length || window !== window.top || new URLSearchParams(location.search).has('view')) return;

  const css = document.createElement('style');
  css.textContent = `
    .rs-canvas { position: fixed; inset: 0; z-index: 9; pointer-events: none; }
    .rs-canvas.pen { pointer-events: auto; cursor: crosshair; }
    .rs-laser { position: fixed; z-index: 10; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
      background: rgba(255, 30, 30, .9); box-shadow: 0 0 10px 4px rgba(255, 30, 30, .55); pointer-events: none; display: none; }
    body.rs-laser-on, body.rs-laser-on * { cursor: none !important; }
    .rs-help { position: fixed; z-index: 11; left: 50%; top: 50%; transform: translate(-50%, -50%); display: none;
      background: rgba(20, 20, 20, .92); color: #fff; font: 15px/1.6 system-ui, sans-serif; padding: 18px 24px; border-radius: 8px; }
    .rs-help kbd { display: inline-block; min-width: 1.6em; text-align: center; background: #444; border-radius: 3px; padding: 0 5px; margin-right: 8px; }
    .rs-mode { position: fixed; z-index: 11; right: 12px; top: 10px; font: 12px system-ui, sans-serif; color: #fff;
      background: rgba(200, 30, 30, .85); padding: 2px 8px; border-radius: 10px; display: none; }`;
  document.head.appendChild(css);
  const canvas = Object.assign(document.createElement('canvas'), { className: 'rs-canvas' });
  const laser = Object.assign(document.createElement('div'), { className: 'rs-laser' });
  const badge = Object.assign(document.createElement('div'), { className: 'rs-mode' });
  const help = Object.assign(document.createElement('div'), { className: 'rs-help' });
  help.innerHTML = [['← →', 'previous / next (or click the left / right third)'], ['l', 'laser pointer'], ['d', 'pen (draw)'],
    ['u', 'undo on this slide'], ['e', 'erase this slide'], ['f', 'fullscreen'], ['o / Esc', 'overview'],
    ['p', 'presenter view'], ['?', 'this help']].map(([k, v]) => `<div><kbd>${k}</kbd>${v}</div>`).join('');
  document.body.append(canvas, laser, badge, help);
  const ctx = canvas.getContext('2d');

  // per slide: a list of actions, each a stroke {points: [[x, y] in 0..1 of the slide]} or {clear: true}
  const drawings = new Map();
  const actions = (i) => drawings.get(i) || drawings.set(i, []).get(i);
  let mode = null, stroke = null;

  const rect = () => { const s = slides()[active()]; return s ? s.getBoundingClientRect() : null; };
  function redraw() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const r = rect();
    if (!r) return;
    const list = actions(active());
    const from = list.map((a) => !!a.clear).lastIndexOf(true) + 1;   // an erase hides everything before it
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = Math.max(2, r.width / 320);
    for (const a of list.slice(from)) {
      ctx.beginPath();
      a.points.forEach(([x, y], k) => ctx[k ? 'lineTo' : 'moveTo'](r.left + x * r.width, r.top + y * r.height));
      if (a.points.length === 1) ctx.lineTo(r.left + a.points[0][0] * r.width + 0.1, r.top + a.points[0][1] * r.height);
      ctx.stroke();
    }
  }
  function setMode(m) {
    mode = mode === m ? null : m;
    canvas.classList.toggle('pen', mode === 'pen');
    document.body.classList.toggle('rs-laser-on', mode === 'laser');
    laser.style.display = 'none';
    badge.style.display = mode ? 'block' : 'none';
    badge.textContent = mode === 'pen' ? 'pen' : 'laser';
  }
  const point = (e) => { const r = rect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };

  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'pen' || !rect()) return;
    canvas.setPointerCapture(e.pointerId);
    stroke = { points: [point(e)] };
    actions(active()).push(stroke);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => { if (stroke) { stroke.points.push(point(e)); redraw(); } });
  const end = () => { stroke = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  document.addEventListener('pointermove', (e) => {
    if (mode !== 'laser') return;
    laser.style.display = 'block';
    laser.style.left = e.clientX + 'px'; laser.style.top = e.clientY + 'px';
  });

  const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  // only keys bespoke leaves free are taken
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'l') { take(); setMode('laser'); }
    else if (e.key === 'd') { take(); setMode('pen'); }
    else if (e.key === 'u') { take(); actions(active()).pop(); redraw(); }
    else if (e.key === 'e') { take(); const a = actions(active()); if (a.length && !a[a.length - 1].clear) a.push({ clear: true }); redraw(); }
    else if (e.key === '?') { take(); help.style.display = help.style.display === 'block' ? 'none' : 'block'; }
  });
  document.addEventListener('click', (e) => {
    if (mode === 'pen' || e.target.closest('a, video, button, input, .bespoke-marp-osc')) return;
    const x = e.clientX / innerWidth;
    if (x < 1 / 3) key('ArrowLeft');
    else if (x > 2 / 3) key('ArrowRight');
  });

  addEventListener('resize', redraw);
  addEventListener('hashchange', redraw);
  new MutationObserver(redraw).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  redraw();
})();
