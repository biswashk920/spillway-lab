// Checks the JavaScript engine against the notebook's exported reference cases.
// Run: node tests/engine.test.js   (after running the notebook once, or using the committed outputs)
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../web/engine.js');

const file = path.join(__dirname, '..', 'notebook', 'outputs', 'test_cases.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const TOL = data.tolerance_rel;
let checks = 0, failures = 0;

function close(a, b) {
  return Math.abs(a - b) <= 1e-9 + TOL * Math.max(Math.abs(a), Math.abs(b));
}
function eq(label, got, want) {
  checks++;
  let ok;
  if (typeof want === 'number' && typeof got === 'number') ok = close(got, want);
  else if (Array.isArray(want)) ok = Array.isArray(got) && got.length === want.length && want.every((w, i) => (typeof w === 'number' ? close(got[i], w) : got[i] === w));
  else ok = got === want;
  if (!ok) { failures++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
}

for (const c of data.cases) {
  const p = c.params;
  const ds = E.designHead(p);
  const hOp = c.h_op;
  const res = E.analyze(p, hOp);
  const sum = E.summary(res);
  for (const k of Object.keys(c.expected)) {
    if (!(k in sum)) { failures++; checks++; console.log('FAIL', c.name, 'missing key', k); continue; }
    eq(c.name + ' :: ' + k, sum[k], c.expected[k]);
  }
  for (const k of Object.keys(sum)) {
    if (!(k in c.expected)) { failures++; checks++; console.log('FAIL', c.name, 'extra key', k); }
  }
  // rating curve samples
  const rt = E.rating(p, ds, 60);
  const idx = []; for (let i = 0; i <= 60; i += 6) idx.push(i);
  eq(c.name + ' :: rating.h', idx.map(i => rt.h[i]), c.rating.h);
  eq(c.name + ' :: rating.free', idx.map(i => rt.free[i]), c.rating.free);
  if (c.rating.gate) eq(c.name + ' :: rating.gate', idx.map(i => rt.gate[i]), c.rating.gate);
  else eq(c.name + ' :: rating.gate null', rt.gate, null);
  // scene
  const sc = E.scene(p, res);
  const sm = c.scene, mid = a => a[Math.floor(a.length / 2)];
  eq(c.name + ' :: scene.n_surface', sc.surface.length, sm.n_surface);
  eq(c.name + ' :: scene.n_dam', sc.dam.length, sm.n_dam);
  eq(c.name + ' :: scene.n_baffles', sc.baffles.length, sm.n_baffles);
  eq(c.name + ' :: scene.surface_first', sc.surface[0], sm.surface_first);
  eq(c.name + ' :: scene.surface_last', sc.surface[sc.surface.length - 1], sm.surface_last);
  eq(c.name + ' :: scene.surface_mid', mid(sc.surface), sm.surface_mid);
  eq(c.name + ' :: scene.dam_mid', mid(sc.dam), sm.dam_mid);
  eq(c.name + ' :: scene.xl', sc.xl, sm.xl);
  eq(c.name + ' :: scene.xr', sc.xr, sm.xr);
  eq(c.name + ' :: scene.zTop', sc.zTop, sm.zTop);
  // chute samples
  if (c.chute_samples) {
    eq(c.name + ' :: chute.d', c.chute_samples.idx.map(i => res.chute.d[i]), c.chute_samples.d);
    eq(c.name + ' :: chute.V', c.chute_samples.idx.map(i => res.chute.V[i]), c.chute_samples.V);
  }
}
console.log(`${checks - failures} of ${checks} comparisons match the notebook across ${data.cases.length} cases (rel. tol ${TOL})`);
process.exit(failures ? 1 : 0);
