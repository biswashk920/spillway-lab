const { simulate } = require('./moc.js'), ref = require('../python/ref_case.json');
const r = simulate(Object.assign({}, ref.p)); let m1 = 0, m2 = 0;
if (r.Hv.length !== ref.Hv.length) throw new Error('length mismatch');
for (let i = 0; i < ref.Hv.length; i++) { m1 = Math.max(m1, Math.abs(r.Hv[i] - ref.Hv[i])); m2 = Math.max(m2, Math.abs(r.Hm[i] - ref.Hm[i])); }
console.log('max |JS - Python| valve:', m1.toExponential(2), ' midpoint:', m2.toExponential(2));
if (m1 > 1e-8 || m2 > 1e-8) { console.error('FAIL'); process.exit(1); } console.log('PASS JS matches Python reference');
