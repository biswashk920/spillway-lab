/* Method-of-Characteristics water hammer solver (port of python/moc.py). SI units. */
(function (root) {
  const g = 9.81;
  const DEF = { L: 1000, D: 0.3, e: 0.008, E: 200e9, K: 2.2e9, rho: 998, nu: 0.3, support: 'anchored',
                f: 0.02, V0: 1, Hres: 100, Tc: 0, law: 'linear', T: 15, N: 100 };
  function waveSpeed(p) {
    const c1 = p.support === 'free' ? 1 - p.nu / 2 : p.support === 'joints' ? 1 : 1 - p.nu * p.nu;
    return Math.sqrt((p.K / p.rho) / (1 + (p.K / p.E) * (p.D / p.e) * c1));
  }
  function tau(t, Tc, law) {
    if (law === 'none') return 1;
    if (t >= Tc) return 0;
    const s = t / Tc;
    if (law === 'two') return s < 0.3 ? 1 - 0.8 * s / 0.3 : 0.2 * (1 - (s - 0.3) / 0.7);
    return 1 - s;
  }
  function simulate(q) {
    const p = Object.assign({}, DEF, q), a = waveSpeed(p), N = p.N, dx = p.L / N, dt = dx / a;
    const A = Math.PI * p.D * p.D / 4, B = a / (g * A), R = p.f * dx / (2 * g * p.D * A * A), Q0 = p.V0 * A;
    let H = new Float64Array(N + 1), Q = new Float64Array(N + 1).fill(Q0), Hn = new Float64Array(N + 1), Qn = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) H[i] = p.Hres - p.f * (i * dx) / p.D * p.V0 * p.V0 / (2 * g);
    if (H[N] <= 0) throw new Error('Steady head at the valve is not positive: reduce velocity or friction.');
    const k = Q0 / Math.sqrt(H[N]), steps = Math.round(p.T / dt), W = N + 1;
    const field = new Float32Array((steps + 1) * W), Hv = new Float64Array(steps + 1), Hm = new Float64Array(steps + 1), Qv = new Float64Array(steps + 1);
    const rec = (n) => { for (let i = 0; i < W; i++) field[n * W + i] = H[i]; Hv[n] = H[N]; Hm[n] = H[N >> 1]; Qv[n] = Q[N]; };
    rec(0);
    for (let n = 1; n <= steps; n++) {
      for (let i = 1; i < N; i++) {
        const cp = H[i - 1] + B * Q[i - 1] - R * Q[i - 1] * Math.abs(Q[i - 1]);
        const cm = H[i + 1] - B * Q[i + 1] + R * Q[i + 1] * Math.abs(Q[i + 1]);
        Hn[i] = (cp + cm) / 2; Qn[i] = (cp - cm) / (2 * B);
      }
      const cm0 = H[1] - B * Q[1] + R * Q[1] * Math.abs(Q[1]);
      Hn[0] = p.Hres; Qn[0] = (p.Hres - cm0) / B;
      const cpN = H[N - 1] + B * Q[N - 1] - R * Q[N - 1] * Math.abs(Q[N - 1]);
      const c = Math.pow(tau(n * dt, p.Tc, p.law) * k, 2), d = B * B * c * c + 4 * c * cpN;
      Qn[N] = (c > 0 && cpN > 0 && d > 0) ? (-B * c + Math.sqrt(d)) / 2 : 0;
      Hn[N] = cpN - B * Qn[N];
      let t = H; H = Hn; Hn = t; t = Q; Q = Qn; Qn = t;
      rec(n);
    }
    return { p, a, dt, dx, steps, W, field, Hv, Hm, Qv, Q0, A, tArr: (n) => n * dt };
  }
  const api = { simulate, waveSpeed, tau, g, DEF };
  if (typeof module !== 'undefined') module.exports = api; else root.MOC = api;
})(this);
