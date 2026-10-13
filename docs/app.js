/* Spillway Designer — UI, animation and drawing. Hydraulics live in engine.js. */
(function () {
  'use strict';
  const E = window.SpillwayEngine;
  const $ = (s, r) => (r || document).querySelector(s);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { p: Object.assign({}, E.DEFAULTS), hFrac: 1.0, view: 'all', playing: !reduceMotion, speed: 1 };
  let ds, res, sc, rt, field, hOp;
  let t = 0, last = 0, colors = null;

  // ---------------------------------------------------------------- controls
  const GROUPS = [
    { title: 'Flood and crest', items: [
      { k: 'Qd', label: 'Design flood', unit: 'm³/s', min: 50, max: 6000, step: 10 },
      { k: 'L', label: 'Clear crest length', unit: 'm', min: 10, max: 200, step: 1 },
      { k: 'N', label: 'Piers', unit: '', min: 0, max: 8, step: 1 },
      { special: 'nose' },
      { k: 'hdRatio', label: 'Design head ÷ flood head', unit: '', min: 0.6, max: 1, step: 0.01, dec: 2 },
    ] },
    { title: 'Dam and chute', items: [
      { k: 'P', label: 'Dam height (crest above basin floor)', unit: 'm', min: 5, max: 80, step: 0.5 },
      { k: 'slopeH', label: 'Face slope (horizontal per 1 vertical)', unit: '', min: 0.5, max: 1.5, step: 0.05, dec: 2 },
      { k: 'R', label: 'Toe radius', unit: 'm', min: 1, max: 40, step: 0.5 },
      { k: 'n', label: 'Manning n of the concrete', unit: '', min: 0.010, max: 0.025, step: 0.001, dec: 3 },
    ] },
    { title: 'Tailwater and basin', items: [
      { k: 'TW', label: 'Tailwater depth above basin floor', unit: 'm', min: 0, max: 40, step: 0.1, dec: 1 },
      { special: 'twpresets' },
      { special: 'basin' },
    ] },
    { title: 'Gate', items: [
      { special: 'gate' },
      { k: 'gateA', label: 'Gate opening', unit: 'm', min: 0, max: 12, step: 0.05, dec: 2, id: 'gateA' },
    ] },
  ];
  const inputs = {};   // key -> {num, range}

  function fmtIn(c, v) { return c.dec !== undefined ? Number(v).toFixed(c.dec) : String(v); }

  function buildRail() {
    const rail = $('#rail');
    let html = '<div class="group"><h2>Reservoir level</h2>' +
      '<div class="ctl"><label for="hfrac">Pool level above the crest</label><span class="num"><output id="hout">4.09</output><span class="unit">m</span></span>' +
      '<input type="range" id="hfrac" min="5" max="160" step="1" value="100"></div>' +
      '<p class="hint" id="hhint"></p>' +
      '<div class="row"><button class="btn" type="button" id="hdesign">Design flood</button><button class="btn" type="button" id="hhalf">Half the head</button><button class="btn" type="button" id="hover">130% of Hd</button></div></div>';
    GROUPS.forEach((g, gi) => {
      html += '<div class="group"><h2>' + g.title + '</h2>';
      g.items.forEach(c => {
        if (c.special === 'nose') {
          html += '<div class="ctl"><label for="nose">Pier nose</label><select id="nose"><option value="0.02">Square (Kp 0.02)</option><option value="0.01" selected>Rounded (Kp 0.01)</option><option value="0">Pointed (Kp 0)</option></select></div>';
        } else if (c.special === 'twpresets') {
          html += '<div class="row"><span class="lbl">Set tailwater to</span><button class="btn" type="button" data-tw="1.0">y₂</button><button class="btn" type="button" data-tw="0.9">0.9 y₂</button><button class="btn" type="button" data-tw="1.4">1.4 y₂</button></div>';
        } else if (c.special === 'basin') {
          html += '<div class="row"><span class="lbl">Basin</span><div class="seg" role="group" aria-label="Basin type"><button type="button" data-basin="plain" aria-pressed="false">Plain</button><button type="button" data-basin="type3" aria-pressed="true">Type III with baffles</button></div></div>';
        } else if (c.special === 'gate') {
          html += '<label class="check"><input type="checkbox" id="gateOn"> Add a radial gate on the crest</label>';
        } else {
          const id = c.id || ('c_' + c.k);
          html += '<div class="ctl" id="wrap_' + c.k + '"><label for="' + id + '">' + c.label + '</label>' +
            '<span class="num"><input type="number" id="' + id + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '"><span class="unit">' + c.unit + '</span></span>' +
            '<input type="range" id="' + id + '_r" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" aria-label="' + c.label + '"></div>';
        }
      });
      html += '</div>';
    });
    rail.innerHTML = html;
    GROUPS.forEach(g => g.items.forEach(c => {
      if (!c.k) return;
      const id = c.id || ('c_' + c.k);
      const num = $('#' + id), range = $('#' + id + '_r');
      inputs[c.k] = { num, range, c };
      const onIn = (src) => {
        const v = parseFloat(src.value);
        if (!isFinite(v)) return;
        state.p[c.k] = Math.min(c.max, Math.max(c.min, v));
        sync(c.k); update();
      };
      num.addEventListener('input', () => onIn(num));
      range.addEventListener('input', () => onIn(range));
    }));
    $('#nose').addEventListener('change', e => { state.p.Kp = parseFloat(e.target.value); update(); });
    $('#gateOn').addEventListener('change', e => { state.p.gate = e.target.checked; syncGate(); update(); });
    $('#hfrac').addEventListener('input', e => { state.hFrac = parseFloat(e.target.value) / 100; update(); });
    $('#hdesign').addEventListener('click', () => setH(1));
    $('#hhalf').addEventListener('click', () => setH(0.5));
    $('#hover').addEventListener('click', () => setH(1.3 * ds.Hd / ds.h_d));
    rail.querySelectorAll('[data-tw]').forEach(b => b.addEventListener('click', () => {
      if (!res || res.no_flow) return;
      state.p.TW = Math.round(parseFloat(b.dataset.tw) * res.basin.y2 * 10) / 10;
      state.p.TW = Math.min(inputs.TW.c.max, state.p.TW);
      sync('TW'); update();
    }));
    rail.querySelectorAll('[data-basin]').forEach(b => b.addEventListener('click', () => { state.p.basin = b.dataset.basin; syncBasin(); update(); }));
  }
  function setH(frac) { state.hFrac = Math.min(1.6, Math.max(0.05, frac)); $('#hfrac').value = Math.round(state.hFrac * 100); update(); }
  function sync(k) {
    const i = inputs[k]; if (!i) return;
    const v = state.p[k];
    if (document.activeElement !== i.num) i.num.value = fmtIn(i.c, v);
    i.range.value = v;
  }
  function syncAll() { Object.keys(inputs).forEach(sync); $('#nose').value = String(state.p.Kp); $('#gateOn').checked = state.p.gate; syncGate(); syncBasin(); $('#hfrac').value = Math.round(state.hFrac * 100); }
  function syncGate() { ['gateA', 'gateA_r'].forEach(id => { $('#' + id).disabled = !state.p.gate; }); $('#wrap_gateA').style.opacity = state.p.gate ? 1 : 0.45; }
  function syncBasin() { document.querySelectorAll('[data-basin]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basin === state.p.basin))); }

  // ---------------------------------------------------------------- shareable link
  const KEYS = ['Qd', 'L', 'N', 'Kp', 'hdRatio', 'P', 'slopeH', 'R', 'n', 'TW', 'gateA'];
  function saveHash() {
    try {
      const q = new URLSearchParams();
      KEYS.forEach(k => q.set(k, state.p[k]));
      q.set('basin', state.p.basin); q.set('gate', state.p.gate ? '1' : '0'); q.set('h', state.hFrac.toFixed(3)); q.set('view', state.view);
      history.replaceState(null, '', '#' + q.toString());
    } catch (e) { /* storage or history blocked: ignore */ }
  }
  function loadHash() {
    try {
      const q = new URLSearchParams(location.hash.slice(1));
      KEYS.forEach(k => { if (q.has(k) && isFinite(parseFloat(q.get(k)))) state.p[k] = parseFloat(q.get(k)); });
      if (q.get('basin') === 'plain' || q.get('basin') === 'type3') state.p.basin = q.get('basin');
      if (q.has('gate')) state.p.gate = q.get('gate') === '1';
      if (q.has('h') && isFinite(parseFloat(q.get('h')))) state.hFrac = Math.min(1.6, Math.max(0.05, parseFloat(q.get('h'))));
      if (['all', 'crest', 'basin'].includes(q.get('view'))) state.view = q.get('view');
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- flow field for drawing
  function interp1(xs, zs, x) {
    const n = xs.length;
    if (x <= xs[0]) return zs[0];
    if (x >= xs[n - 1]) return zs[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const d = xs[hi] - xs[lo];
    return d <= 0 ? zs[hi] : zs[lo] + (zs[hi] - zs[lo]) * (x - xs[lo]) / d;
  }
  function makeField() {
    const p = state.p, Hd = ds.Hd, P = p.P;
    const sx = [], sz = [];
    sc.surface.forEach((pt, i) => { sx.push(i === 0 ? pt[0] : Math.max(pt[0], sx[i - 1] + 1e-9)); sz.push(pt[1]); });
    const bx = sc.bed.map(a => a[0]), bz = sc.bed.map(a => a[1]);
    const xUp = sc.x_up, xToe = res.geo.x_toe, top = P - 0.126 * Hd;
    const surf = x => interp1(sx, sz, x);
    const bed = x => (x >= xUp ? (x >= xToe ? 0 : interp1(bx, bz, x)) : Math.max(0, top - 0.55 * (xUp - x)));
    const dep = x => Math.max(surf(x) - bed(x), 0.05);
    let jz = null, q = 0;
    if (!res.no_flow) {
      q = res.chute.q;
      const jp = res.jump;
      if (jp.state === 'toe') jz = [xToe, xToe + jp.L_basin];
      else if (jp.state === 'swept' && jp.x_jump !== null) jz = [xToe + jp.x_jump, xToe + jp.x_jump + 6 * p.TW];
      else if (jp.state === 'drowned' && jp.x_jump !== null) jz = [jp.x_jump, jp.x_jump + 6 * (p.TW - jp.z_jump)];
    }
    return { surf, bed, dep, q, jz, x0: Math.max(sc.xl, xUp - 2.0 * P), xr: sc.xr };
  }

  // ---------------------------------------------------------------- particles
  let parts = [], roller = [], foam = [];
  const NLINES = 7, PER = 34;
  function initParticles() {
    parts = [];
    for (let k = 0; k < NLINES; k++) for (let i = 0; i < PER; i++) parts.push({ f: (k + 0.5) / NLINES, x: 0, u: Math.random() });
    roller = []; for (let i = 0; i < 30; i++) roller.push({ a: Math.random() * 6.283, r: 0.25 + 0.75 * Math.random() });
    foam = []; for (let i = 0; i < 26; i++) foam.push({ u: Math.random(), w: Math.random(), s: 0.5 + Math.random() });
  }
  function placeParticles() { parts.forEach(pt => { pt.x = field.x0 + pt.u * (field.xr - field.x0); }); }
  function vDisp(x) { return 0.9 * Math.pow(field.q / field.dep(x), 0.6); }
  function stepParticles(dt) {
    if (!field || res.no_flow) return;
    parts.forEach(pt => {
      pt.x += vDisp(pt.x) * dt * state.speed;
      if (pt.x > field.xr) { pt.x = field.x0 + Math.random() * 0.02 * (field.xr - field.x0); }
    });
    roller.forEach(r => { r.a += 1.7 * dt * state.speed; });
  }

  // ---------------------------------------------------------------- drawing
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue(n).trim();
    colors = {};
    ['sky', 'water-top', 'water-deep', 'water-line', 'concrete', 'concrete-line', 'rock', 'rock-line', 'gate', 'block', 'foam', 'dim', 'ink', 'muted', 'line', 'panel', 'accent'].forEach(n => { colors[n] = g('--' + n); });
  }
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w: r.width, h: r.height, dpr };
  }
  function getView() {
    const p = state.p, Hd = ds.Hd, P = p.P, xToe = res.geo.x_toe;
    if (state.view === 'crest') {
      const Hg = ds.h_d + 0.8;
      return { x0: sc.x_up - 3.5 * Hd - (p.gate ? 1.5 * Hd : 0), x1: res.geo.xt + 3.2 * Hd, z0: P - 3.4 * Hd, z1: P + Math.max(hOp, p.gate ? Hg : 0) + 1.7 * Hd };
    }
    if (state.view === 'basin' && !res.no_flow) {
      const y2 = res.basin.y2, jp = res.jump;
      let x1 = xToe + Math.max(jp.L_basin * 1.45, 4 * y2);
      if (jp.state === 'swept' && jp.x_jump !== null) x1 = Math.max(x1, xToe + jp.x_jump + 6 * p.TW + 4);
      return { x0: xToe - 3.2 * y2 - 4, x1, z0: -0.35 * y2, z1: Math.max(p.TW, y2) * 1.9 + 1.5 };
    }
    return { x0: sc.xl, x1: sc.xr, z0: -0.14 * P, z1: sc.zTop };
  }
  function makeXf(view, cw, ch) {
    const m = 12;
    const s = Math.min((cw - 2 * m) / (view.x1 - view.x0), (ch - 2 * m) / (view.z1 - view.z0));
    const ox = m + ((cw - 2 * m) - s * (view.x1 - view.x0)) / 2;
    const oy = ch - m - ((ch - 2 * m) - s * (view.z1 - view.z0)) / 2;
    return { s, w: cw, X: x => ox + (x - view.x0) * s, Y: z => oy - (z - view.z0) * s, view };
  }
  function poly(ctx, pts, xf) { ctx.beginPath(); pts.forEach((a, i) => { const X = xf.X(a[0]), Y = xf.Y(a[1]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); }

  function animatedSurface() {
    const jz = field.jz;
    return sc.surface.map(([x, z]) => {
      const dep = field.dep(x);
      let a = 0.010 * dep + 0.004;
      if (jz && x >= jz[0] - 0.5 && x <= jz[1]) a += 0.055 * dep * Math.min(1, (x - jz[0] + 0.5) / Math.max(1, 0.15 * (jz[1] - jz[0])));
      const lam = Math.max(0.6, 1.1 * dep);
      return [x, z + a * Math.sin(6.283 * (x / lam - t * 0.55 * state.speed * Math.min(3, 0.4 + Math.sqrt(field.q || 1) / 4)))];
    });
  }

  let hatch = null;
  function hatchPattern(ctx) {
    if (hatch) return hatch;
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const g = c.getContext('2d'); g.strokeStyle = colors['rock-line']; g.globalAlpha = 0.55; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 10); g.lineTo(10, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
    hatch = ctx.createPattern(c, 'repeat'); return hatch;
  }

  function drawGate(ctx, xf) {
    const P = state.p.P, a = state.p.gateA, Hg = ds.h_d + 0.8, Rg = 1.3 * Hg, b0 = 35 * Math.PI / 180;
    const xT = Rg * Math.cos(b0), zT = P + Rg * Math.sin(b0);
    const sinLip = Math.max(-1, Math.min(1, Math.sin(b0) - a / Rg));
    const delta = b0 - Math.asin(sinLip);
    const bTop = Math.asin(Math.max(-1, Math.min(1, Math.sin(b0) - Hg / Rg))) - delta;
    const bLip = Math.asin(sinLip);
    const pt = b => [xT - Rg * Math.cos(b), zT - Rg * Math.sin(b)];
    ctx.strokeStyle = colors.gate; ctx.lineWidth = Math.max(3, 0.18 * xf.s); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const q = pt(bTop + (bLip - bTop) * i / 24); const X = xf.X(q[0]), Y = xf.Y(q[1]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 0.07 * xf.s);
    [bTop, bLip].forEach(b => { const q = pt(b); ctx.beginPath(); ctx.moveTo(xf.X(q[0]), xf.Y(q[1])); ctx.lineTo(xf.X(xT), xf.Y(zT)); ctx.stroke(); });
    ctx.fillStyle = colors.gate; ctx.beginPath(); ctx.arc(xf.X(xT), xf.Y(zT), Math.max(3, 0.16 * xf.s), 0, 6.283); ctx.fill();
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.font = (opts.size || 12) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = opts.align || 'left'; ctx.textBaseline = opts.base || 'alphabetic';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0)';
    ctx.fillStyle = colors.ink; ctx.fillText(text, x, y);
    return w;
  }
  function dimV(ctx, xf, x, z0, z1, text, side) {
    const X = xf.X(x), Y0 = xf.Y(z0), Y1 = xf.Y(z1);
    ctx.strokeStyle = colors.dim; ctx.fillStyle = colors.dim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X, Y0); ctx.lineTo(X, Y1); ctx.moveTo(X - 4, Y0); ctx.lineTo(X + 4, Y0); ctx.moveTo(X - 4, Y1); ctx.lineTo(X + 4, Y1); ctx.stroke();
    ctx.font = '12px "Segoe UI", system-ui, sans-serif'; ctx.textBaseline = 'middle';
    if (side === 'right' && X + 10 + ctx.measureText(text).width > xf.w) side = 'left';
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    ctx.fillText(text, X + (side === 'left' ? -7 : 7), (Y0 + Y1) / 2);
  }

  function drawScene() {
    const cv = $('#scene'), ctx = cv.getContext('2d');
    const view = getView();
    const wantH = Math.round(Math.min(Math.max(280, cv.getBoundingClientRect().width * (view.z1 - view.z0) / (view.x1 - view.x0) + 30), Math.max(260, 0.68 * window.innerHeight), 640));
    if (Math.abs(parseFloat(cv.style.height || 0) - wantH) > 1) cv.style.height = wantH + 'px';
    const { w, h, dpr } = sizeCanvas(cv);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.sky; ctx.fillRect(0, 0, w, h);
    const xf = makeXf(view, w, h);
    const geo = res.geo, p = state.p, xToe = geo.x_toe;

    // water
    const surf = animatedSurface();
    const bedRev = sc.bed.slice().reverse();
    const water = surf.concat([[sc.xr + 50, 0], [xToe, 0]], bedRev, [[sc.x_up, 0], [sc.xl - 50, 0]]);
    const grad = ctx.createLinearGradient(0, xf.Y(Math.max(sc.pool, p.TW)), 0, xf.Y(0));
    grad.addColorStop(0, colors['water-top']); grad.addColorStop(1, colors['water-deep']);
    ctx.fillStyle = grad; poly(ctx, water, xf); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = colors['water-line']; ctx.lineWidth = 1.6; poly(ctx, surf, xf); ctx.stroke();

    // foundation and dam
    ctx.fillStyle = colors.rock; ctx.fillRect(0, xf.Y(0), w, h);
    ctx.fillStyle = hatchPattern(ctx); ctx.fillRect(0, xf.Y(0), w, h);
    ctx.strokeStyle = colors['rock-line']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, xf.Y(0)); ctx.lineTo(w, xf.Y(0)); ctx.stroke();
    ctx.fillStyle = colors.concrete; ctx.strokeStyle = colors['concrete-line']; ctx.lineWidth = 1.4;
    poly(ctx, sc.dam, xf); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colors.block;
    sc.baffles.forEach(b => { poly(ctx, b, xf); ctx.closePath(); ctx.fill(); });

    // particles (clipped to the water)
    if (!res.no_flow) {
      ctx.save();
      poly(ctx, water, xf); ctx.closePath(); ctx.clip();
      ctx.strokeStyle = colors.foam; ctx.lineCap = 'round';
      parts.forEach(pt => {
        const x = pt.x, v = vDisp(x), d = field.dep(x), b = field.bed(x);
        const tail = Math.max(0.12, v * 0.28);
        const x2 = x - tail, d2 = field.dep(x2), b2 = field.bed(x2);
        const al = Math.min(1, (x - field.x0) / (0.06 * (field.xr - field.x0) + 1e-6));
        ctx.globalAlpha = 0.55 * al; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(xf.X(x2), xf.Y(b2 + pt.f * d2)); ctx.lineTo(xf.X(x), xf.Y(b + pt.f * d)); ctx.stroke();
      });
      const jz = field.jz;
      if (jz) {
        const len = jz[1] - jz[0], cx = jz[0] + 0.30 * len;
        const dd = field.dep(cx), cz = field.surf(cx) - 0.42 * dd;
        const rx = Math.min(0.24 * len, 1.6 * dd), rz = 0.38 * dd;
        ctx.fillStyle = colors.foam;
        roller.forEach(r => {
          ctx.globalAlpha = 0.75;
          ctx.beginPath(); ctx.arc(xf.X(cx + rx * r.r * Math.cos(r.a)), xf.Y(cz + rz * r.r * Math.sin(r.a)), 1.8, 0, 6.283); ctx.fill();
        });
        foam.forEach(f => {
          const x = jz[0] + f.u * len * 0.9 + 0.4 * Math.sin(t * 2 * f.s + f.w * 9);
          const dpt = field.dep(x);
          ctx.globalAlpha = 0.55; ctx.beginPath();
          ctx.arc(xf.X(x), xf.Y(field.surf(x) - (0.04 + 0.12 * f.w) * dpt), 1.5 + 1.8 * f.w, 0, 6.283); ctx.fill();
        });
        ctx.globalAlpha = 0.7; ctx.strokeStyle = colors.foam; ctx.lineWidth = 3;
        ctx.beginPath(); let started = false;
        surf.forEach(([x, z]) => { if (x >= jz[0] && x <= jz[1]) { const X = xf.X(x), Y = xf.Y(z); if (started) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); started = true; } } });
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (p.gate) drawGate(ctx, xf);

    // tailwater level and dimensions
    ctx.setLineDash([5, 4]); ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
    const xTW0 = Math.max(view.x0, xToe + 1);
    ctx.beginPath(); ctx.moveTo(xf.X(xTW0 + (view.x1 - xTW0) * 0.55), xf.Y(p.TW)); ctx.lineTo(xf.X(view.x1), xf.Y(p.TW)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '12px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = colors.dim; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('tailwater ' + p.TW.toFixed(1) + ' m', xf.X(view.x1) - 6, xf.Y(p.TW) - 3);

    const xd = sc.x_up - Math.max(1.0 * ds.Hd, 14 / xf.s);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = colors.dim; ctx.beginPath(); ctx.moveTo(xf.X(xd), xf.Y(p.P)); ctx.lineTo(xf.X(0), xf.Y(p.P)); ctx.stroke(); ctx.setLineDash([]);
    dimV(ctx, xf, xd, p.P, sc.pool, 'h ' + hOp.toFixed(2) + ' m', 'left');
    dimV(ctx, xf, xd, 0, p.P, 'P ' + p.P.toFixed(1) + ' m', 'left');

    if (!res.no_flow) {
      const y1 = res.y1, V1 = res.V1;
      const Xt = xf.X(xToe), Yt = xf.Y(y1);
      ctx.strokeStyle = colors.dim; ctx.fillStyle = colors.dim; ctx.lineWidth = 1.2;
      const tw0 = 22, by0 = Math.max(44, Yt - 18 - tw0 - 34);
      ctx.beginPath(); ctx.moveTo(Xt, Yt); ctx.lineTo(Xt, by0 + tw0); ctx.stroke();
      ctx.beginPath(); ctx.arc(Xt, Yt, 3, 0, 6.283); ctx.fill();
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      const txt = 'toe  y₁ ' + y1.toFixed(2) + ' m   V₁ ' + V1.toFixed(1) + ' m/s   Fr ' + res.basin.Fr.toFixed(1);
      const tw = ctx.measureText(txt).width + 16, bx = Math.max(8, Math.min(w - tw - 8, Xt + tw + 12 < w ? Xt + 8 : Xt - tw - 8)), by = by0;
      ctx.fillStyle = colors.panel; ctx.globalAlpha = 0.92; ctx.fillRect(bx, by, tw, 22); ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 21);
      ctx.fillStyle = colors.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 8, by + 11);
      const jz = field.jz;
      if (jz) {
        const xe = jz[1] + 0.012 * (view.x1 - view.x0);
        dimV(ctx, xf, xe, 0, res.basin.y2, 'y₂ ' + res.basin.y2.toFixed(2) + ' m', 'right');
      }
    }
  }

  // ---------------------------------------------------------------- rating chart
  function drawRating() {
    const cv = $('#rating'), ctx = cv.getContext('2d');
    const { w, h, dpr } = sizeCanvas(cv);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.sky; ctx.fillRect(0, 0, w, h);
    const m = { l: 52, r: 14, t: 12, b: 38 };
    const qmax = Math.max(...rt.free, ...(rt.gate || [0]), state.p.Qd) * 1.05, hmax = rt.h[rt.h.length - 1] * 1.02;
    const X = q => m.l + (q / qmax) * (w - m.l - m.r), Y = hh => h - m.b - (hh / hmax) * (h - m.t - m.b);
    ctx.font = '12px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = colors.muted; ctx.strokeStyle = colors.line; ctx.lineWidth = 1;
    const nice = (max, n) => { const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag; };
    const sq = nice(qmax, 5), sh = nice(hmax, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let q = 0; q <= qmax; q += sq) { ctx.beginPath(); ctx.moveTo(X(q), Y(0)); ctx.lineTo(X(q), Y(hmax)); ctx.stroke(); ctx.fillText(String(Math.round(q)), X(q), Y(0) + 5); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let hh = 0; hh <= hmax; hh += sh) { ctx.beginPath(); ctx.moveTo(X(0), Y(hh)); ctx.lineTo(X(qmax), Y(hh)); ctx.stroke(); ctx.fillText(hh.toFixed(sh < 1 ? 1 : 0), X(0) - 6, Y(hh)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('discharge (m³/s)', (m.l + w - m.r) / 2, h - 4);
    ctx.save(); ctx.translate(12, (m.t + h - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.fillText('pool level above crest (m)', 0, 0); ctx.restore();
    const line = (qs, color, wd) => { ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.beginPath(); qs.forEach((q, i) => { const x = X(q), y = Y(rt.h[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    line(rt.free, colors['water-line'], 2.4);
    if (rt.gate) line(rt.gate, colors.gate, 2.4);
    // design point (hollow) and operating point (filled)
    ctx.strokeStyle = colors.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(state.p.Qd), Y(ds.h_d), 5, 0, 6.283); ctx.stroke();
    const Q = res.dis.Q;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = colors.dim; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(Q), Y(0)); ctx.lineTo(X(Q), Y(hOp)); ctx.lineTo(X(0), Y(hOp)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = colors.dim; ctx.beginPath(); ctx.arc(X(Q), Y(hOp), 5, 0, 6.283); ctx.fill();
    $('#ratingLegend').innerHTML = '<span><i style="background:' + colors['water-line'] + '"></i>free overflow</span>' +
      (rt.gate ? '<span><i style="background:' + colors.gate + '"></i>gate opening ' + state.p.gateA.toFixed(2) + ' m</span>' : '') +
      '<span>hollow ring: design flood</span><span>filled dot: now</span>';
  }

  // ---------------------------------------------------------------- results
  const f = (x, d) => (x === null || x === undefined || !isFinite(x)) ? 'n/a' : Number(x).toFixed(d === undefined ? 2 : d);
  const MESSAGES = {
    GEOM_INVALID: ['warn', () => 'The dam is too low for this face slope: the WES curve reaches the basin floor before the straight slope begins, so the toe arc is dropped. Raise the dam height or use a flatter slope.'],
    LOW_DAM: ['warn', () => 'The dam height is less than 1.33 times the design head. This is a low dam: the discharge coefficient is reduced with an approximate factor and the approach velocity matters more.'],
    HEHD_ABOVE: ['info', () => 'The pool is above the design head, so pressures on the crest are below atmospheric. That is normal up to about 1.3 Hd.'],
    HEHD_HIGH: ['warn', () => 'The head is more than 1.3 times the design head. Expect strongly negative crest pressures and a risk of cavitation. Raise the design head ratio toward 1 or limit the flood.'],
    GATE_CONTROL: ['info', () => 'The gate controls the flow: at this pool level it passes less than the free crest would (' + f(res.dis.Qf, 0) + ' m³/s). Raise the gate to let the crest take over.'],
    NO_FLOW: ['info', () => 'No flow. The pool is at the crest level or the gate is shut.'],
    SWEPT: ['warn', () => 'Tailwater is lower than the sequent depth, so the jump is swept out of the basin. It forms about ' + f(res.jump.x_jump, 0) + ' m below the toe, where the flow has slowed down. Raise the tailwater, lower the basin floor or add an end sill.'],
    SWEPT_FAR: ['warn', () => 'Tailwater is far below the sequent depth. The flow stays supercritical across the whole computed reach (20 y₂ + 40 m) and no jump forms. Expect heavy scour downstream.'],
    DROWNED: ['info', () => 'Tailwater is more than 10% above the sequent depth, so the jump is drowned and its toe moves up the chute. It is stable but dissipates less energy per metre of basin; the basin floor can often be raised.'],
    DROWNED_CREST: ['warn', () => 'Tailwater would drown the jump all the way up to the crest. The spillway is submerged and this model no longer applies.'],
    FR_UNDULAR: ['warn', () => 'Froude number below 1.7: only an undular jump forms and the basin dissipates little energy.'],
    FR_WEAK: ['warn', () => 'Froude number between 1.7 and 2.5: a weak jump with little energy loss.'],
    FR_OSC: ['warn', () => 'Froude number between 2.5 and 4.5: an oscillating jump that sends waves downstream. Baffle blocks are not recommended in this range.'],
    T3_FR: ['warn', () => 'USBR Type III basins are intended for entrance Froude numbers above 4.5.'],
    T3_V: ['warn', () => 'Entrance velocity is above 18 m/s, the usual upper limit for Type III baffle blocks. Consider a Type II basin or a lower dam.'],
    V_HIGH: ['warn', () => 'Velocity above 30 m/s. Check cavitation and consider chute aerators; this model has no air entrainment.'],
  };
  function row(dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; }

  function renderResults() {
    const p = state.p, dis = res.dis, bs = res.basin, jp = res.jump;
    let html = '';
    if (res.no_flow) {
      html += '<div class="hero"><div><span>Discharge</span><b>0<small>m³/s</small></b></div></div>';
    } else {
      html += '<div class="hero">' +
        '<div><span>Discharge now</span><b>' + f(dis.Q, 0) + '<small>m³/s</small></b></div>' +
        '<div><span>Toe velocity</span><b>' + f(res.V1, 1) + '<small>m/s</small></b></div>' +
        '<div><span>Froude number at toe</span><b>' + f(bs.Fr, 1) + '<small>' + bs.jump_type + ' jump</small></b></div>' +
        '<div><span>Sequent depth y₂</span><b>' + f(bs.y2, 2) + '<small>m</small></b></div></div>';
    }
    html += '<div class="sec"><h3>Flow now</h3><dl>' +
      row('Pool level above crest', f(hOp, 2) + ' <small>m</small>') +
      row('Total head He', f(dis.He, 2) + ' <small>m (' + f(dis.He / ds.Hd, 2) + ' Hd)</small>') +
      row('Controlled by', dis.regime === 'gate' ? 'the gate' : 'the crest') +
      (p.gate ? row('Free crest would pass', f(dis.Qf, 0) + ' <small>m³/s</small>') : '') + '</dl></div>';
    html += '<div class="sec"><h3>Crest design (at the design flood)</h3><dl>' +
      row('Design head Hd', f(ds.Hd, 2) + ' <small>m</small>') +
      row('Pool level at design flood', f(ds.h_d, 2) + ' <small>m</small>') +
      row('Effective crest length', f(ds.Le, 1) + ' <small>m</small>') +
      row('Discharge coefficient C', f(ds.C, 3) + ' <small>(SI)</small>') +
      row('WES curve ends at', f(res.geo.xt, 1) + ' m across, ' + f(res.geo.yt, 1) + ' m down') +
      row('Toe radius used', f(res.geo.Reff, 1) + ' <small>m</small>') +
      row('Toe lies', f(res.geo.x_toe, 1) + ' <small>m from the crest</small>') + '</dl></div>';
    if (!res.no_flow) {
      const E = res.chute;
      html += '<div class="sec"><h3>Chute and toe</h3><dl>' +
        row('Unit discharge q', f(E.q, 2) + ' <small>m²/s</small>') +
        row('Depth at the toe y₁', f(res.y1, 2) + ' <small>m</small>') +
        row('Energy lost to friction', f(E.E_res - res.y1 - res.V1 * res.V1 / 19.62, 2) + ' <small>m (' + f(100 * (E.E_res - res.y1 - res.V1 * res.V1 / 19.62) / E.E_res, 1) + '%)</small>') + '</dl></div>';
      const status = jp.state === 'toe' ? 'jump at the toe' : jp.state === 'swept' ? 'jump swept out' : 'jump drowned';
      html += '<div class="sec"><h3>Jump and basin</h3><dl>' +
        row('Tailwater ÷ y₂', f(jp.ratio, 2) + ' <small>(' + status + ')</small>') +
        row(p.basin === 'type3' ? 'Type III basin length' : 'Plain basin length', f(jp.L_basin, 1) + ' <small>m</small>') +
        row('Energy removed by the jump', f(100 * bs.dE_jump / bs.E1, 0) + ' <small>% of E₁</small>') + '</dl></div>';
      if (p.basin === 'type3') {
        html += '<div class="sec"><h3>Type III blocks</h3><dl>' +
          row('Chute blocks (height, width, gap)', f(bs.h_chute, 2) + ' <small>m each</small>') +
          row('Baffle blocks (height × width)', f(bs.h_baffle, 2) + ' × ' + f(bs.w_baffle, 2) + ' <small>m</small>') +
          row('Baffle row from the toe', f(bs.x_baffle, 1) + ' <small>m</small>') +
          row('End sill height', f(bs.h_sill, 2) + ' <small>m</small>') + '</dl></div>';
      }
    }
    html += '<div class="notes" id="notes">';
    res.warnings.forEach(code => { const m = MESSAGES[code]; if (m) html += '<div class="note ' + (m[0] === 'warn' ? 'warn' : '') + '">' + m[1]() + '</div>'; });
    html += '</div><div class="downloads"><button class="btn" type="button" id="dlProfile">Crest profile (CSV)</button><button class="btn" type="button" id="dlRating">Rating curve (CSV)</button><button class="btn" type="button" id="dlLink">Copy link to this design</button></div>';
    $('#results').innerHTML = html;
    $('#dlProfile').onclick = () => download('profile.csv', 'x_m,elevation_above_floor_m\n' + sc.bed.map(a => a[0].toFixed(4) + ',' + a[1].toFixed(4)).join('\n') + '\n');
    $('#dlRating').onclick = () => download('rating_curve.csv', 'h_m,Q_free_m3s' + (rt.gate ? ',Q_gate_m3s' : '') + '\n' + rt.h.map((h, i) => h.toFixed(4) + ',' + rt.free[i].toFixed(3) + (rt.gate ? ',' + rt.gate[i].toFixed(3) : '')).join('\n') + '\n');
    $('#dlLink').onclick = () => { saveHash(); if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => flash('#dlLink', 'Link copied'), () => flash('#dlLink', 'Copy the address bar')); else flash('#dlLink', 'Copy the address bar'); };
  }
  function flash(sel, text) { const b = $(sel); if (!b) return; const old = b.textContent; b.textContent = text; setTimeout(() => { b.textContent = old; }, 1600); }
  function download(name, text) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function renderChips() {
    const p = state.p, chips = [];
    chips.push(res.dis.regime === 'gate' ? ['Gate controls the flow', false] : [p.gate ? 'Gate raised clear, crest controls' : 'Free overflow', false]);
    if (!res.no_flow) {
      const jp = res.jump;
      chips.push([jp.state === 'toe' ? 'Jump forms in the basin' : jp.state === 'swept' ? 'Jump swept out of the basin' : 'Jump drowned', jp.state !== 'toe']);
    }
    if (res.warnings.includes('HEHD_HIGH')) chips.push(['Head above 1.3 Hd', true]);
    $('#chips').innerHTML = chips.map(c => '<span class="chip' + (c[1] ? ' warn' : '') + '">' + c[0] + '</span>').join('');
    $('#live').textContent = chips.map(c => c[0]).join('. ') + (res.no_flow ? '' : '. Discharge ' + f(res.dis.Q, 0) + ' cubic metres per second, toe velocity ' + f(res.V1, 1) + ' metres per second.');
    $('#scene').setAttribute('aria-label', 'Spillway profile. ' + $('#live').textContent);
  }

  // ---------------------------------------------------------------- update loop
  let pending = false;
  function update() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; recompute(); }); } }
  function recompute() {
    const p = state.p;
    if (!Object.keys(p).every(k => typeof p[k] !== 'number' || isFinite(p[k]))) return;
    ds = E.designHead(p);
    hOp = state.hFrac * ds.h_d;
    res = E.analyze(p, hOp);
    sc = E.scene(p, res);
    rt = E.rating(p, ds, 60);
    field = makeField();
    if (!parts.length) initParticles();
    if (!parts[0].placed) { placeParticles(); parts[0].placed = true; }
    parts.forEach(pt => { if (pt.x < field.x0 || pt.x > field.xr) pt.x = field.x0 + pt.u * (field.xr - field.x0); });
    $('#hout').textContent = hOp.toFixed(2);
    $('#hhint').textContent = Math.round(state.hFrac * 100) + '% of the design pool level (' + ds.h_d.toFixed(2) + ' m at ' + p.Qd.toFixed(0) + ' m³/s)';
    $('#gateA').max = $('#gateA_r').max = Math.max(12, Math.ceil(ds.h_d * 1.6));
    renderResults(); renderChips(); drawRating(); drawScene(); saveHash();
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (state.playing && res && field) { t += dt; stepParticles(dt); }
    if (res && field) drawScene();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- start
  function init() {
    loadHash(); readColors(); buildRail(); syncAll();
    document.querySelectorAll('#views button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      b.addEventListener('click', () => { state.view = b.dataset.view; document.querySelectorAll('#views button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); saveHash(); });
    });
    const play = $('#play');
    const syncPlay = () => { play.textContent = state.playing ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(state.playing)); };
    play.addEventListener('click', () => { state.playing = !state.playing; syncPlay(); });
    syncPlay();
    $('#speed').addEventListener('change', e => { state.speed = parseFloat(e.target.value); });
    $('#reset').addEventListener('click', () => { state.p = Object.assign({}, E.DEFAULTS); state.hFrac = 1; syncAll(); update(); });
    window.addEventListener('resize', () => { if (res) { drawRating(); drawScene(); } });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { hatch = null; readColors(); if (res) { drawRating(); drawScene(); } });
    recompute();
    requestAnimationFrame(frame);
  }
  init();
  window.__spillway = { state, update, setH, get res() { return res; } };   // handle for tests
})();
