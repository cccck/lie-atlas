// Numerical tests for the spontaneous-symmetry-breaking module (node tests/ssb.test.mjs).
// Mexican hat: derivatives, vacuum, Higgs/Goldstone masses, and the frequencies a simulated particle
// actually oscillates at. O(3) → O(2): Goldstone counting. Electroweak: tree-level relations.
import {
  TAU,
  PI,
  wrapPi,
  hatV,
  hatGrad,
  hatHess,
  troughR,
  vacuumR,
  predictions,
  hatStep,
  hatEnergy,
  gauss,
  ExtremaMeter,
  v3,
  tangentFrame,
  genAction,
  rotate,
  alongGreatCircle,
  rank3,
  o3Hessian,
  EW,
  EW_g,
  electroweak,
  disp,
} from '../src/modules/ssb/math.js';
import { mulberry32, randomUnit3, mat } from '../src/core/la.js';
const eigSym = mat.eigSym;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    if (fails.length < 25) fails.push(msg);
  }
}
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} (tol ${tol})`);
const nearV = (u, v, tol, msg) => ok(u.every((x, i) => Math.abs(x - v[i]) <= tol), `${msg}: got [${u}], want [${v}]`);
const rng = mulberry32(4242);
const rnd = (a, b) => a + (b - a) * rng();
const eig2 = (M) => {
  const tr = M[0][0] + M[1][1];
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const d = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return [tr / 2 - d, tr / 2 + d];
};

// ------------------------------------------------------------------ Mexican hat: derivatives
for (let t = 0; t < 200; t++) {
  const P = { lam: rnd(0.1, 2), v: rnd(0.4, 1.6), h: rng() < 0.3 ? 0 : rnd(0, 0.4) };
  const x = rnd(-2, 2);
  const y = rnd(-2, 2);
  const e = 1e-5;
  const g = hatGrad(x, y, P);
  nearV(g, [(hatV(x + e, y, P) - hatV(x - e, y, P)) / (2 * e), (hatV(x, y + e, P) - hatV(x, y - e, P)) / (2 * e)], 1e-5 * (1 + Math.hypot(...g)), '∇V = finite differences of V');
  const H = hatHess(x, y, P);
  const gx = (a, b) => hatGrad(a, b, P);
  const Hfd = [
    [(gx(x + e, y)[0] - gx(x - e, y)[0]) / (2 * e), (gx(x, y + e)[0] - gx(x, y - e)[0]) / (2 * e)],
    [(gx(x + e, y)[1] - gx(x - e, y)[1]) / (2 * e), (gx(x, y + e)[1] - gx(x, y - e)[1]) / (2 * e)],
  ];
  const sc = 1 + Math.abs(H[0][0]) + Math.abs(H[1][1]);
  nearV(H.flat(), Hfd.flat(), 1e-5 * sc, 'Hessian = finite differences of ∇V');
}

// ------------------------------------------------------------------ h = 0: circle of vacua, Goldstone + Higgs
for (const P of [{ lam: 0.5, v: 1, h: 0 }, { lam: 1.7, v: 0.6, h: 0 }, { lam: 0.2, v: 1.4, h: 0 }]) {
  near(vacuumR(P), P.v, 1e-12, 'h = 0: vacuum radius v');
  for (let k = 0; k < 12; k++) {
    const th = (TAU * k) / 12;
    const x = P.v * Math.cos(th);
    const y = P.v * Math.sin(th);
    nearV(hatGrad(x, y, P), [0, 0], 1e-12, 'every point of |φ| = v is a vacuum');
    near(hatV(x, y, P), 0, 1e-12, 'degenerate vacuum energy');
    near(troughR(th, P), P.v, 1e-12, 'valley floor at r = v in every direction');
    const [w0, w1] = eig2(hatHess(x, y, P));
    near(w0, 0, 1e-12, 'Goldstone: zero curvature along the valley');
    near(w1, 8 * P.lam * P.v * P.v, 1e-10, 'Higgs: ω_ρ² = 8λv²');
    // the massless direction is the symmetry direction (tangent to the circle)
    const Ht = hatHess(x, y, P);
    const tdir = [-Math.sin(th), Math.cos(th)];
    const Hv = [Ht[0][0] * tdir[0] + Ht[0][1] * tdir[1], Ht[1][0] * tdir[0] + Ht[1][1] * tdir[1]];
    nearV(Hv, [0, 0], 1e-12, 'Goldstone mode = generator direction iφ');
  }
  const p = predictions(P);
  near(p.wt0, 0, 0, 'h = 0: exact Goldstone');
  near(p.wr0, Math.sqrt(8 * P.lam) * P.v, 1e-12, 'h = 0: Higgs frequency');
  // origin is a local maximum (unstable symmetric point)
  const [a0, a1] = eig2(hatHess(0, 0, P));
  ok(a0 < 0 && a1 < 0, 'symmetric point φ = 0 is a maximum');
}

// ------------------------------------------------------------------ h > 0: explicit breaking, pseudo-Goldstone
// The valley exists in every direction only while h < h_c = (8 / 3√3) λ v³ (beyond that the tilt wipes out
// the uphill side and troughR has no outer root). The page uses v = 1, λ ∈ [0.3, 1.5], h ∈ [0, 0.3]:
const hCrit = (lam, v) => (8 / (3 * Math.sqrt(3))) * lam * v ** 3;
ok(0.3 < hCrit(0.3, 1), 'the whole slider range of the page stays below h_c (valley everywhere)');
for (let t = 0; t < 60; t++) {
  const P = { lam: rnd(0.3, 1.5), v: rnd(0.8, 1.3), h: rnd(0.001, 0.3) };
  if (P.h > 0.9 * hCrit(P.lam, P.v)) continue;
  const r0 = vacuumR(P);
  near(4 * P.lam * r0 * (r0 * r0 - P.v * P.v), P.h, 1e-10, 'h > 0: 4λ r0 (r0² − v²) = h');
  ok(r0 > P.v, 'tilt pushes the vacuum outwards');
  nearV(hatGrad(r0, 0, P), [0, 0], 1e-10, 'vacuum is stationary');
  const p = predictions(P);
  const [w0, w1] = eig2(hatHess(r0, 0, P));
  near(w0, p.wt0 * p.wt0, 1e-9, 'pseudo-Goldstone ω_π² = h/r0 (Hessian)');
  near(w1, p.wr0 * p.wr0, 1e-9, 'Higgs ω_ρ² = 8λr0² + h/r0 (Hessian)');
  // the unique vacuum is the global minimum along the valley
  for (const th of [0.5, 1.5, PI, -2]) ok(hatV(troughR(th, P) * Math.cos(th), troughR(th, P) * Math.sin(th), P) > hatV(r0, 0, P), 'tilted vacuum is the lowest point of the valley');
  // valley floor: radial stationary and radially stable in every direction
  for (const th of [0.3, 2, -1.2]) {
    const r = troughR(th, P);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dVdr = (rr) => (hatV((rr + 1e-6) * c, (rr + 1e-6) * s, P) - hatV((rr - 1e-6) * c, (rr - 1e-6) * s, P)) / 2e-6;
    near(dVdr(r), 0, 1e-6, 'valley floor is radially stationary');
    ok(dVdr(r + 1e-3) > 0 && dVdr(r - 1e-3) < 0, 'valley floor is a radial minimum');
  }
}
{
  // small tilt: the pseudo-Goldstone mass² is linear in the explicit breaking, ω_π² ≈ h/v (GMOR-like)
  const P = { lam: 1, v: 1, h: 1e-6 };
  near(predictions(P).wt0 ** 2 / P.h, 1 / P.v, 1e-5, 'ω_π² ≈ h/v for small h');
  const damped = predictions({ lam: 1, v: 1, h: 0.1 }, 0.4);
  near(damped.wr, Math.sqrt(damped.wr0 ** 2 - 0.04), 1e-12, 'damped frequency √(ω0² − γ²/4)');
}

// ------------------------------------------------------------------ dynamics: RK4, energy, measured frequencies
{
  const P = { lam: 0.8, v: 1, h: 0.08 };
  // energy is conserved without damping, decreases with damping
  let s = [1.4, 0.3, 0, 0.5];
  const E0 = hatEnergy(s, P);
  for (let i = 0; i < 20000; i++) s = hatStep(s, 0.002, P, 0);
  near(hatEnergy(s, P), E0, 1e-8 * (1 + E0), 'RK4 conserves energy (γ = 0)');
  let sd = [1.4, 0.3, 0, 0.5];
  let Eprev = hatEnergy(sd, P);
  let monotone = true;
  for (let i = 0; i < 4000; i++) {
    sd = hatStep(sd, 0.005, P, 0.3);
    const E = hatEnergy(sd, P);
    if (E > Eprev + 1e-12) monotone = false;
    Eprev = E;
  }
  ok(monotone, 'damping only removes energy');
  ok(hatEnergy(sd, P) < 0.05 * E0, 'damped particle settles towards the vacuum');

  // the frequencies a particle actually oscillates at, measured the way the page does (ExtremaMeter)
  const p = predictions(P);
  const r0 = p.r0;
  const measure = (s0, pick, gamma, T = 60, dt = 0.002) => {
    const m = new ExtremaMeter({ minAmp: 1e-6, keep: 9 });
    let st = s0;
    let t = 0;
    for (let i = 0; i < T / dt; i++) {
      st = hatStep(st, dt, P, gamma);
      t += dt;
      m.push(t, pick(st));
    }
    return m.omega(t);
  };
  // radial (Higgs) mode: small kick along Re φ
  near(measure([r0 + 1e-3, 0, 0, 0], (st) => st[0] - r0, 0), p.wr0, 2e-3 * p.wr0, 'measured Higgs frequency = √(8λr0² + h/r0)');
  // angular (pseudo-Goldstone) mode: small kick along the valley
  near(measure([r0, 1e-3, 0, 0], (st) => st[1], 0, 200), p.wt0, 2e-3 * p.wt0, 'measured pseudo-Goldstone frequency = √(h/r0)');
  // damped
  near(measure([r0 + 1e-3, 0, 0, 0], (st) => st[0] - r0, 0.2, 30), p.wr0 && predictions(P, 0.2).wr, 3e-3 * p.wr0, 'measured damped Higgs frequency');
}
{
  // ExtremaMeter on a clean damped cosine
  const m = new ExtremaMeter({ minAmp: 1e-6 });
  const w = 2.3;
  for (let t = 0; t < 20; t += 0.004) m.push(t, Math.exp(-0.1 * t) * Math.cos(w * t + 0.4));
  near(m.omega(20), Math.sqrt(w * w), 1e-3, 'ExtremaMeter recovers ω from extrema spacing');
  ok(Number.isNaN(new ExtremaMeter().omega(1)), 'ExtremaMeter: no data → NaN');
  // Box–Muller: mean 0, variance 1
  const g = Array.from({ length: 40000 }, () => gauss(rng));
  const mean = g.reduce((a, b) => a + b, 0) / g.length;
  const vari = g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length;
  near(mean, 0, 0.02, 'gauss mean');
  near(vari, 1, 0.03, 'gauss variance');
}

// ------------------------------------------------------------------ O(3) → O(2): two Goldstones
for (let t = 0; t < 100; t++) {
  const n = randomUnit3(rng);
  const [eth, eph] = tangentFrame(n);
  near(v3.norm(eth), 1, 1e-12, 'e_θ unit');
  near(v3.norm(eph), 1, 1e-12, 'e_φ unit');
  near(v3.dot(eth, eph), 0, 1e-12, 'e_θ ⟂ e_φ');
  near(v3.dot(eth, n), 0, 1e-12, 'e_θ tangent');
  near(v3.dot(eph, n), 0, 1e-12, 'e_φ tangent');
  nearV(v3.cross(eth, eph), n, 1e-12, 'e_θ × e_φ = n');
  // generators move the vacuum tangentially; exactly one combination (rotation about n) leaves it fixed
  const X = genAction(n);
  for (const Xn of X) near(v3.dot(Xn, n), 0, 1e-12, 'X_a n is tangent to the vacuum sphere');
  ok(rank3(X) === 2, 'broken generators: rank 2 → dim G − dim H = 3 − 1 = 2 Goldstones');
  const fixed = [n[0], n[1], n[2]].reduce((acc, c, a) => v3.add(acc, v3.scale(X[a], c)), [0, 0, 0]);
  nearV(fixed, [0, 0, 0], 1e-12, 'the unbroken generator n·X fixes the vacuum (SO(2) stabiliser)');
  // X_a = derivative of the rotation about ê_a (active, right-handed)
  for (let a = 0; a < 3; a++) {
    const e = [0, 0, 0];
    e[a] = 1;
    const h = 1e-6;
    const d = v3.scale(v3.sub(rotate(n, e, h), rotate(n, e, -h)), 1 / (2 * h));
    nearV(d, X[a], 1e-8, `X_${a} n = d/dt R_${a}(t) n`);
  }
  // rotations and great-circle moves stay on the sphere
  near(v3.norm(rotate(n, randomUnit3(rng), rnd(-3, 3))), 1, 1e-12, 'rotation preserves |n|');
  near(v3.norm(alongGreatCircle(n, eth, rnd(-3, 3))), 1, 1e-12, 'great-circle step stays on S²');
  // Hessian at a vacuum: eigenvalues {0, 0, 8λv²}, the zero modes are the tangent (Goldstone) directions
  const lam = rnd(0.2, 2);
  const v = rnd(0.5, 1.5);
  const nv = v3.scale(n, v);
  const H = o3Hessian(nv, lam, v);
  const { values } = eigSym(H);
  const ev = [...values].sort((a, b) => a - b);
  nearV(ev, [0, 0, 8 * lam * v * v], 1e-9 * (1 + 8 * lam * v * v), 'O(3) Hessian spectrum {0, 0, 8λv²}');
  const Ht = [0, 1, 2].map((i) => v3.dot(H[i], eth));
  nearV(Ht, [0, 0, 0], 1e-10, 'tangent direction is a zero mode');
}
ok(rank3([[1, 0, 0], [0, 1, 0], [0, 0, 1]]) === 3 && rank3([[1, 0, 0], [2, 0, 0], [0, 0, 0]]) === 1 && rank3([[0, 0, 0], [0, 0, 0], [0, 0, 0]]) === 0, 'rank3 basics');

// ------------------------------------------------------------------ electroweak (tree level)
{
  const sw2 = EW.sin2;
  const th = Math.asin(Math.sqrt(sw2));
  const ew = electroweak(th);
  near(ew.mW, EW.mWexp, 1e-12, 'm_W = g v / 2 reproduces the input W mass');
  near(EW_g, 0.6528, 5e-4, 'g ≈ 0.653');
  near(ew.mZ, ew.mW / Math.cos(th), 1e-12, 'm_Z = m_W / cos θ_W');
  near(ew.mZ, EW.mZexp, 0.01 * EW.mZexp, 'tree-level m_Z within 1 % of experiment');
  near(ew.rho, 1, 1e-12, 'ρ = m_W² / (m_Z² cos²θ_W) = 1 at tree level (custodial symmetry)');
  near(ew.mA, 0, 0, 'photon stays massless (unbroken U(1)_em)');
  near(ew.e, ew.g * Math.sin(th), 1e-15, 'e = g sin θ_W');
  near(ew.e, ew.gp * Math.cos(th), 1e-12, "e = g' cos θ_W");
  near(1 / (ew.e * ew.e), 1 / (ew.g * ew.g) + 1 / (ew.gp * ew.gp), 1e-9, "1/e² = 1/g² + 1/g'²");
  near(1 / ew.alpha, 128, 2, 'α(m_Z) ≈ 1/128');
  const zero = electroweak(0);
  near(zero.mZ, zero.mW, 1e-12, 'θ_W = 0: Z and W degenerate (no hypercharge mixing)');
  near(zero.e, 0, 0, 'θ_W = 0: electromagnetism decouples');
}

// ------------------------------------------------------------------ dispersion relations
{
  near(disp.higgs(0, 1.3), 1.3, 1e-15, 'Higgs branch is gapped: ω(0) = m');
  near(disp.higgs(5, 0), 5, 1e-15, 'massless limit is relativistic');
  near(disp.typeA(0), 0, 0, 'type-A Goldstone is gapless');
  near(disp.typeA(-2, 0.7), 1.4, 1e-15, 'type-A: ω = c|k|');
  near(disp.typeB(2, 0.5), 2, 1e-15, 'type-B: ω = D k² (e.g. ferromagnetic magnon)');
  for (const x of [-7, -PI, 0, 2, 9]) {
    const w = wrapPi(x);
    ok(w >= -PI - 1e-15 && w < PI + 1e-15, `wrapPi(${x}) in [−π, π)`);
    near(Math.cos(w), Math.cos(x), 1e-12, `wrapPi(${x}) same angle`);
  }
}

// ------------------------------------------------------------------ report
for (const f of fails) console.log('FAIL', f);
console.log(`ssb: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
