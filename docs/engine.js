/* Spillway Designer — hydraulics engine (SI units).
 * A line-by-line port of the reference notebook (notebook/spillway_design.ipynb).
 * tests/engine.test.js checks it against the notebook's exported test cases.
 * Works in the browser (window.SpillwayEngine) and in Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpillwayEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const G = 9.81;
  const C0_SI = 2.18;
  // Approximate readings of published charts (preliminary-design accuracy only).
  const CR_TABLE = [[0.0, 0.74], [0.1, 0.78], [0.2, 0.83], [0.4, 0.91], [0.6, 0.96], [0.8, 0.985],
    [1.0, 1.0], [1.2, 1.025], [1.4, 1.05], [1.6, 1.065], [2.0, 1.08]];
  const TYPE3_L_TABLE = [[4.5, 2.8], [6.0, 2.65], [8.0, 2.5], [10.0, 2.4], [13.0, 2.3], [17.0, 2.2]];

  const DEFAULTS = {
    Qd: 900.0, L: 50.0, N: 2, Kp: 0.01, Ka: 0.10, P: 14.0, hdRatio: 1.0, slopeH: 0.8, R: 8.0,
    TW: 7.6, n: 0.014, basin: 'type3', gate: false, gateA: 1.5,
  };

  function interp(x, tbl) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 0; i < tbl.length - 1; i++) {
      const [x0, y0] = tbl[i], [x1, y1] = tbl[i + 1];
      if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return tbl[tbl.length - 1][1];
  }

  // ---- head, discharge ------------------------------------------------------
  function leEff(p, he) {
    return Math.max(p.L - 2.0 * (p.N * p.Kp + p.Ka) * he, 0.2 * p.L);
  }
  function cCoeff(P, Hd, heOverHd) {
    const fLow = 0.78 + 0.22 * Math.min(P / Hd, 1.33) / 1.33;
    return C0_SI * fLow * interp(heOverHd, CR_TABLE);
  }
  function approachHead(Q, h, p) {
    return Q * Q / (2.0 * G * p.L * p.L * Math.pow(p.P + h, 2));
  }
  function designHead(p) {
    let lo = 1e-3, hi = 200.0;
    for (let k = 0; k < 100; k++) {
      const he = 0.5 * (lo + hi);
      const Hd = p.hdRatio * he;
      const Q = cCoeff(p.P, Hd, 1.0 / p.hdRatio) * leEff(p, he) * Math.pow(he, 1.5);
      if (Q < p.Qd) lo = he; else hi = he;
    }
    const He = 0.5 * (lo + hi);
    let h = He;
    for (let k = 0; k < 60; k++) h = He - approachHead(p.Qd, h, p);
    const Hd = p.hdRatio * He;
    return { He, h_d: h, Ha: He - h, Hd, Le: leEff(p, He), C: cCoeff(p.P, Hd, 1.0 / p.hdRatio) };
  }
  function discharge(p, ds, h, gateA) {
    if (gateA === undefined) gateA = null;
    if (h <= 1e-9) return { Q: 0.0, He: 0.0, Qf: 0.0, Qg: null, regime: 'free', Cd: null };
    let he = h, Qf = 0.0, Qg = null, Q = 0.0, cd = null;
    for (let k = 0; k < 100; k++) {
      Qf = cCoeff(p.P, ds.Hd, he / ds.Hd) * leEff(p, he) * Math.pow(he, 1.5);
      Qg = null; cd = null;
      if (gateA !== null && gateA < he) {
        cd = Math.min(0.75, Math.max(0.55, 0.75 - 0.25 * gateA / he));
        Qg = cd * gateA * p.L * Math.sqrt(2.0 * G * (he - 0.5 * gateA));
      }
      Q = (Qg !== null && Qg < Qf) ? Qg : Qf;
      const heNew = h + approachHead(Q, h, p);
      const done = Math.abs(heNew - he) < 1e-12;
      he = heNew;
      if (done) break;
    }
    const regime = (Qg !== null && Qg < Qf) ? 'gate' : 'free';
    return { Q, He: he, Qf, Qg, regime, Cd: cd };
  }

  // ---- geometry -------------------------------------------------------------
  function crestGeometry(p, Hd) {
    const P = p.P, m = p.slopeH, R = p.R;
    const th = Math.atan(1.0 / m);
    const xt = Hd * Math.pow(2.0 / (1.85 * m), 1.0 / 0.85);
    const yt = Math.pow(xt, 1.85) / (2.0 * Math.pow(Hd, 0.85));
    const avail = P - yt;
    const valid = avail > 0.05 * P;
    const xs = [], drops = [], thetas = [];
    const NW = 400;
    let Reff;
    if (valid) {
      Reff = Math.min(R, avail / (1.0 - Math.cos(th)));
      for (let i = 0; i <= NW; i++) {
        const x = xt * i / NW;
        xs.push(x);
        drops.push(Math.pow(x, 1.85) / (2.0 * Math.pow(Hd, 0.85)));
        thetas.push(Math.atan(1.85 * Math.pow(x, 0.85) / (2.0 * Math.pow(Hd, 0.85))));
      }
      const Ay = P - Reff * (1.0 - Math.cos(th));
      const Ax = xt + (Ay - yt) * m;
      const Ls = (Ay - yt) / Math.sin(th);
      const Ns = Math.max(1, Math.ceil(Ls / 0.25));
      for (let i = 1; i <= Ns; i++) {
        const d = yt + (Ay - yt) * i / Ns;
        xs.push(xt + (d - yt) * m);
        drops.push(d);
        thetas.push(th);
      }
      const xc = Ax + Reff * Math.sin(th);
      const NA = 40;
      for (let k = 1; k <= NA; k++) {
        const phi = th * (1.0 - k / NA);
        xs.push(xc - Reff * Math.sin(phi));
        drops.push((P - Reff) + Reff * Math.cos(phi));
        thetas.push(phi);
      }
    } else {
      Reff = 0.0;
      const xf = Math.pow(2.0 * P * Math.pow(Hd, 0.85), 1.0 / 1.85);
      for (let i = 0; i <= NW; i++) {
        const x = xf * i / NW;
        xs.push(x);
        drops.push(Math.pow(x, 1.85) / (2.0 * Math.pow(Hd, 0.85)));
        thetas.push(Math.atan(1.85 * Math.pow(x, 0.85) / (2.0 * Math.pow(Hd, 0.85))));
      }
      drops[drops.length - 1] = P;
    }
    const z = drops.map(d => P - d);
    const s = [0.0];
    for (let i = 1; i < xs.length; i++) s.push(s[s.length - 1] + Math.hypot(xs[i] - xs[i - 1], z[i] - z[i - 1]));
    return { valid, xt, yt, theta: th, Reff, x: xs, z, th: thetas, cth: thetas.map(Math.cos), s,
      x_toe: xs[xs.length - 1], length: s[s.length - 1] };
  }
  function upstreamCurve(Hd, n) {
    if (n === undefined) n = 60;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = -0.270 * Hd * (1.0 - i / n);
      const u = x + 0.270 * Hd;
      const drop = 0.724 * Math.pow(u, 1.85) / Math.pow(Hd, 0.85) + 0.126 * Hd - 0.4315 * Math.pow(Hd, 0.375) * Math.pow(u, 0.625);
      pts.push([x, drop]);
    }
    return pts;
  }

  // ---- flow -----------------------------------------------------------------
  function solveDepth(q, z, cth, beta, E) {
    const bc = beta * cth;
    if (bc < 1e-9) return q / Math.sqrt(2.0 * G * (E - z));
    const dm = Math.pow(q * q / (G * bc), 1.0 / 3.0);
    const f = d => z + d * bc + q * q / (2.0 * G * d * d) - E;
    if (f(dm) > 0.0) return dm;
    let lo = 1e-6, hi = dm;
    for (let k = 0; k < 80; k++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0.0) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  function frictionSlope(q, d, B, n) {
    const V = q / d;
    const Rh = d * B / (B + 2.0 * d);
    return n * n * V * V / Math.pow(Rh, 4.0 / 3.0);
  }
  function stepDepth(q, z, cth, beta, Eline, SfPrev, dsx, B, n) {
    const d1 = solveDepth(q, z, cth, beta, Eline - SfPrev * dsx);
    const Sf1 = frictionSlope(q, d1, B, n);
    const Enew = Eline - 0.5 * (SfPrev + Sf1) * dsx;
    const d2 = solveDepth(q, z, cth, beta, Enew);
    return [d2, Enew, frictionSlope(q, d2, B, n)];
  }
  function chuteFlow(p, geo, Q, He, beta0) {
    const q = Q / p.L, B = p.L, n = p.n;
    const Eres = p.P + He;
    let Eline = Eres;
    const beta = geo.x.map(xi => beta0 + (1.0 - beta0) * Math.min(1.0, xi / geo.xt));
    const d = [solveDepth(q, geo.z[0], geo.cth[0], beta[0], Eline)];
    let Sf = frictionSlope(q, d[0], B, n);
    const Elines = [Eline];
    for (let i = 1; i < geo.s.length; i++) {
      const dsx = geo.s[i] - geo.s[i - 1];
      const r = stepDepth(q, geo.z[i], geo.cth[i], beta[i], Eline, Sf, dsx, B, n);
      d.push(r[0]); Eline = r[1]; Sf = r[2];
      Elines.push(Eline);
    }
    const V = d.map(di => q / di);
    return { q, d, V, E_line: Elines, E_res: Eres, beta0 };
  }
  function seqDepth(d, V) {
    const fr = V / Math.sqrt(G * d);
    return fr <= 1.0 ? d : 0.5 * d * (Math.sqrt(1.0 + 8.0 * fr * fr) - 1.0);
  }
  function floorFlow(p, q, dToe, Eline, y2Toe) {
    const B = p.L, n = p.n, step = 0.25;
    const N = Math.ceil((20.0 * y2Toe + 40.0) / step);
    const xs = [0.0], ds = [dToe], Vs = [q / dToe];
    let Sf = frictionSlope(q, dToe, B, n);
    for (let i = 1; i <= N; i++) {
      const r = stepDepth(q, 0.0, 1.0, 1.0, Eline, Sf, step, B, n);
      Eline = r[1]; Sf = r[2];
      xs.push(i * step); ds.push(r[0]); Vs.push(q / r[0]);
    }
    return { x: xs, d: ds, V: Vs };
  }
  function basinDesign(y1, V1) {
    const fr = V1 / Math.sqrt(G * y1);
    const y2 = seqDepth(y1, V1);
    let jtype;
    if (fr < 1.7) jtype = 'undular';
    else if (fr < 2.5) jtype = 'weak';
    else if (fr < 4.5) jtype = 'oscillating';
    else if (fr <= 9.0) jtype = 'steady';
    else jtype = 'strong';
    const h3 = y1 * (4.0 + fr) / 6.0;
    return {
      Fr: fr, y2, jump_type: jtype,
      L_plain: 6.0 * y2, L_type3: interp(fr, TYPE3_L_TABLE) * y2,
      h_chute: y1, w_chute: y1, s_chute: y1,
      h_baffle: h3, w_baffle: 0.75 * h3, s_baffle: 0.75 * h3, x_baffle: 0.8 * y2,
      h_sill: (5.0 + fr) / 6.0 * y1,
      dE_jump: Math.pow(y2 - y1, 3) / (4.0 * y1 * y2),
      E1: y1 + V1 * V1 / (2.0 * G),
    };
  }

  // ---- analysis -------------------------------------------------------------
  function analyze(p, hOp) {
    if (hOp === undefined) hOp = null;
    const ds = designHead(p);
    const h = hOp === null ? ds.h_d : hOp;
    const gateA = p.gate ? p.gateA : null;
    const dis = discharge(p, ds, h, gateA);
    const geo = crestGeometry(p, ds.Hd);
    const warns = [];
    const res = { p, ds, h, dis, geo, warnings: warns, no_flow: false };

    if (!geo.valid) warns.push('GEOM_INVALID');
    if (p.P / ds.Hd < 1.33) warns.push('LOW_DAM');
    const heHd = dis.He / ds.Hd;
    if (heHd > 1.3) warns.push('HEHD_HIGH');
    else if (heHd > 1.001) warns.push('HEHD_ABOVE');
    if (dis.regime === 'gate') warns.push('GATE_CONTROL');

    if (dis.Q < 1e-6) {
      res.no_flow = true;
      warns.push('NO_FLOW');
      return res;
    }

    const beta0 = dis.regime === 'gate' ? 1.0 : Math.max(0.0, 1.0 - dis.He / ds.Hd);
    const ch = chuteFlow(p, geo, dis.Q, dis.He, beta0);
    const y1 = ch.d[ch.d.length - 1], V1 = ch.V[ch.V.length - 1];
    const bs = basinDesign(y1, V1);
    const Lbasin = p.basin === 'type3' ? bs.L_type3 : bs.L_plain;
    const TW = p.TW;
    const r = TW / bs.y2;
    const state = r < 0.95 ? 'swept' : (r <= 1.10 ? 'toe' : 'drowned');
    const fl = floorFlow(p, ch.q, y1, ch.E_line[ch.E_line.length - 1], bs.y2);
    const jump = { state, ratio: r, L_basin: Lbasin, x_jump: null, z_jump: null, d_jump: null,
      V_jump: null, idx: null, t: null, to_crest: false };

    if (state === 'swept') {
      let prev = bs.y2;
      for (let i = 1; i < fl.x.length; i++) {
        const y2i = seqDepth(fl.d[i], fl.V[i]);
        if (y2i <= TW) {
          const t = (prev - TW) / (prev - y2i);
          jump.x_jump = fl.x[i - 1] + t * (fl.x[i] - fl.x[i - 1]);
          jump.z_jump = 0.0;
          jump.d_jump = fl.d[i - 1] + t * (fl.d[i] - fl.d[i - 1]);
          jump.V_jump = fl.V[i - 1] + t * (fl.V[i] - fl.V[i - 1]);
          jump.idx = i - 1; jump.t = t;
          break;
        }
        prev = y2i;
      }
      warns.push(jump.x_jump !== null ? 'SWEPT' : 'SWEPT_FAR');
    } else if (state === 'drowned') {
      const n = geo.s.length;
      let gNext = null;
      for (let i = n - 1; i >= 0; i--) {
        const gi = seqDepth(ch.d[i], ch.V[i]) + geo.z[i] - TW;
        if (gi >= 0.0) {
          const t = (gNext === null || i === n - 1) ? 0.0 : gi / (gi - gNext);
          const j = Math.min(i + 1, n - 1);
          const lerp = (a, b) => a + t * (b - a);
          jump.x_jump = lerp(geo.x[i], geo.x[j]);
          jump.z_jump = lerp(geo.z[i], geo.z[j]);
          jump.d_jump = lerp(ch.d[i], ch.d[j]);
          jump.V_jump = lerp(ch.V[i], ch.V[j]);
          jump.idx = i; jump.t = t;
          break;
        }
        gNext = gi;
      }
      if (jump.x_jump === null) { jump.to_crest = true; warns.push('DROWNED_CREST'); }
      else warns.push('DROWNED');
    }

    const fr = bs.Fr;
    if (fr < 1.7) warns.push('FR_UNDULAR');
    else if (fr < 2.5) warns.push('FR_WEAK');
    else if (fr < 4.5) warns.push('FR_OSC');
    if (p.basin === 'type3') {
      if (fr < 4.5) warns.push('T3_FR');
      if (V1 > 18.0) warns.push('T3_V');
    }
    if (V1 > 30.0) warns.push('V_HIGH');

    res.chute = ch; res.y1 = y1; res.V1 = V1; res.basin = bs; res.jump = jump; res.floor = fl;
    return res;
  }

  function summary(res) {
    const ds = res.ds, dis = res.dis, geo = res.geo;
    const out = {
      He_d: ds.He, h_d: ds.h_d, Ha_d: ds.Ha, Hd: ds.Hd, Le_d: ds.Le, C_d: ds.C,
      geo_valid: geo.valid, xt: geo.xt, yt: geo.yt, Reff: geo.Reff,
      x_toe: geo.x_toe, bed_length: geo.length, n_nodes: geo.s.length,
      h: res.h, Q: dis.Q, He: dis.He, Qf: dis.Qf, Qg: dis.Qg, regime: dis.regime,
      HeHd: dis.He / ds.Hd, warnings: res.warnings.slice(),
    };
    if (res.no_flow) return out;
    const bs = res.basin, jp = res.jump, ch = res.chute;
    Object.assign(out, {
      q: ch.q, y1: res.y1, V1: res.V1, Fr1: bs.Fr, E_res: ch.E_res,
      E_toe: ch.E_line[ch.E_line.length - 1],
      head_loss_chute: ch.E_res - res.y1 - res.V1 * res.V1 / (2 * G),
      beta0: ch.beta0, d_crest: ch.d[0], d_mid: ch.d[Math.floor(ch.d.length / 2)],
      y2: bs.y2, jump_type: bs.jump_type, L_plain: bs.L_plain, L_type3: bs.L_type3,
      L_basin: jp.L_basin, h_chute: bs.h_chute, h_baffle: bs.h_baffle, w_baffle: bs.w_baffle,
      x_baffle: bs.x_baffle, h_sill: bs.h_sill, dE_jump: bs.dE_jump,
      jump_efficiency: bs.dE_jump / bs.E1, state: jp.state, tw_ratio: jp.ratio,
      x_jump: jp.x_jump, z_jump: jp.z_jump, d_jump: jp.d_jump, jump_to_crest: jp.to_crest,
    });
    return out;
  }

  function smoothstep(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }

  function scene(p, res) {
    const ds = res.ds, geo = res.geo, h = res.h;
    const Hd = ds.Hd, P = p.P;
    const xUp = -0.270 * Hd;
    const up = upstreamCurve(Hd);
    const bed = up.map(([x, dr]) => [x, P - dr]);
    for (let i = 1; i < geo.x.length; i++) bed.push([geo.x[i], geo.z[i]]);
    const dam = [[xUp, 0.0], [xUp, P - 0.126 * Hd]].concat(bed);
    const xl = -(0.8 * P + 3.0 * Hd);
    const zp = P + h;
    const sc = { dam, bed, xl, x_up: xUp, pool: zp, TW: p.TW, baffles: [], surface: [] };
    if (res.no_flow) {
      sc.xr = geo.x_toe + 0.6 * P;
      sc.surface = [[xl, zp], [0.0, zp]];
      sc.zTop = zp + 0.3 * P;
      return sc;
    }
    const ch = res.chute, jp = res.jump, bs = res.basin, fl = res.floor;
    const xToe = geo.x_toe, TW = p.TW, Lb = jp.L_basin;
    let xr = xToe + Math.max(1.6 * Lb, 0.6 * P);
    if (jp.state === 'swept' && jp.x_jump !== null) xr = Math.max(xr, xToe + 1.1 * (jp.x_jump + 6.0 * TW));
    sc.xr = xr;
    const gated = res.dis.regime === 'gate';
    const surf = [[xl, zp]];
    const d0 = ch.d[0];
    if (gated) {
      surf.push([0.0, zp], [0.0, P + d0]);
    } else {
      const Lblend = 2.0 * h + 0.5;
      surf.push([-Lblend, zp]);
      for (let k = 1; k <= 20; k++) {
        const t = k / 20.0;
        surf.push([-Lblend + Lblend * t, zp + (P + d0 - zp) * smoothstep(t)]);
      }
    }
    const n = geo.s.length;
    let last = n - 1;
    if (jp.state === 'drowned' && jp.x_jump !== null) last = jp.idx;
    for (let i = 1; i <= last; i++) {
      const th = geo.th[i];
      surf.push([geo.x[i] + ch.d[i] * Math.sin(th), geo.z[i] + ch.d[i] * Math.cos(th)]);
    }
    if (jp.state === 'toe') {
      const y1 = res.y1;
      for (let k = 1; k <= 30; k++) {
        const t = k / 30.0;
        surf.push([xToe + Lb * t, y1 + (TW - y1) * smoothstep(t)]);
      }
      surf.push([xr, TW]);
    } else if (jp.state === 'swept') {
      for (let i = 1; i < fl.x.length; i++) {
        const xx = xToe + fl.x[i];
        if (xx > xr) break;
        if (jp.x_jump !== null && fl.x[i] > jp.x_jump) break;
        surf.push([xx, fl.d[i]]);
      }
      if (jp.x_jump !== null) {
        const xj = xToe + jp.x_jump, dj = jp.d_jump, Lr = 6.0 * TW;
        surf.push([xj, dj]);
        for (let k = 1; k <= 30; k++) {
          const t = k / 30.0;
          surf.push([xj + Lr * t, dj + (TW - dj) * smoothstep(t)]);
        }
        surf.push([xr, TW]);
      }
    } else {
      if (jp.x_jump !== null) {
        const xj = jp.x_jump, zj = jp.z_jump, dj = jp.d_jump;
        const z0 = zj + dj;
        const Lr = 6.0 * (TW - zj);
        surf.push([xj, z0]);
        for (let k = 1; k <= 30; k++) {
          const t = k / 30.0;
          surf.push([xj + Lr * t, z0 + (TW - z0) * smoothstep(t)]);
        }
        surf.push([Math.max(xr, xj + Lr), TW]);
      } else {
        surf.push([0.0, TW]);
        surf.push([xr, TW]);
      }
    }
    sc.surface = surf;
    if (p.basin === 'type3') {
      const hc = bs.h_chute, wc = bs.w_chute;
      sc.baffles.push([[xToe, 0.0], [xToe, hc], [xToe + wc, hc], [xToe + wc, 0.0]]);
      const xb = xToe + bs.x_baffle, hb = bs.h_baffle, wb = bs.w_baffle;
      sc.baffles.push([[xb, 0.0], [xb, hb], [xb + wb, hb], [xb + wb, 0.0]]);
      const xe = xToe + Lb, hs = bs.h_sill;
      sc.baffles.push([[xe, 0.0], [xe + 0.5 * hs, hs], [xe + 1.2 * hs, hs], [xe + 1.2 * hs, 0.0]]);
    }
    sc.zTop = Math.max(zp, TW) + 0.35 * P;
    return sc;
  }

  function rating(p, ds, n) {
    if (n === undefined) n = 60;
    const hs = [];
    for (let i = 0; i <= n; i++) hs.push(1.6 * ds.h_d * i / n);
    const free = hs.map(h => discharge(p, ds, h, null).Q);
    const gate = p.gate ? hs.map(h => discharge(p, ds, h, p.gateA).Q) : null;
    return { h: hs, free, gate };
  }

  return { DEFAULTS, G, interp, leEff, cCoeff, designHead, discharge, crestGeometry, upstreamCurve,
    solveDepth, chuteFlow, floorFlow, seqDepth, basinDesign, analyze, summary, scene, rating, smoothstep };
});
