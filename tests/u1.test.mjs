#!/usr/bin/env node
// Numerical checks for src/modules/u1/math.js:  node tests/u1.test.mjs
import {
  TAU,
  cis,
  sinc,
  wrapPoint,
  wrapTangent,
  wrapCurve,
  polylineLength,
  seriesPartialSums,
  seriesError,
  seriesErrorBound,
  rot2,
  J2,
  principal,
  wrapPi,
  ringPhase,
  psi,
  seam,
  ringEnergy,
  applyL,
  cmul,
  clipSegment,
  bbox,
  wrapTimeline,
} from '../src/modules/u1/math.js';
import { mat, mulberry32 } from '../src/core/la.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const closeV = (a, b, tol = 1e-12) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);
const rng = mulberry32(11);
const rand = (a, b) => a + (b - a) * rng();

// ---------------------------------------------------------------- exp: iR -> U(1)
for (let i = 0; i < 200; i++) {
  const a = rand(-15, 15);
  const b = rand(-15, 15);
  // homomorphism of (R,+) onto U(1): e^{ia} e^{ib} = e^{i(a+b)}
  check('exp homomorphism', closeV(cmul(cis(a), cis(b)), cis(a + b), 1e-12));
  // unit modulus
  check('|e^{ia}| = 1', close(Math.hypot(...cis(a)), 1, 1e-15));
  // kernel 2 pi Z: theta and theta + 2 pi k give the same element
  const k = Math.round(rand(-3, 3));
  check('kernel 2piZ', closeV(cis(a + k * TAU), cis(a), 1e-12));
  // real form: R(theta) = exp(theta J), acting like multiplication by e^{i theta}
  const R = rot2(a);
  check('R = expm(theta J)', mat.almostEqual(R, mat.expm(mat.scale(J2, a)), 1e-11), JSON.stringify(a));
  const v = [rand(-2, 2), rand(-2, 2)];
  check('R(theta) v = e^{i theta} z', closeV(mat.mulv(R, v), cmul(cis(a), v), 1e-12));
  check('SO(2) law', mat.almostEqual(mat.mul(rot2(a), rot2(b)), rot2(a + b), 1e-12));
  check('det R = 1', close(mat.det(R), 1, 1e-14));
  // principal value
  const { theta0, k: kk } = principal(a);
  check('principal range', theta0 > -Math.PI - 1e-15 && theta0 <= Math.PI + 1e-15, String(theta0));
  check('principal decomposition', close(theta0 + TAU * kk, a, 1e-12));
}
check('J^2 = -1', mat.almostEqual(mat.mul(J2, J2), mat.scale(mat.eye(2), -1), 0));
check('principal(pi) = pi', close(principal(Math.PI).theta0, Math.PI, 1e-15) && principal(Math.PI).k === 0);
check('principal(-pi) = pi, k=-1', close(principal(-Math.PI).theta0, Math.PI, 1e-15) && principal(-Math.PI).k === -1);
check('principal(2pi) = 0, k=1', close(principal(TAU).theta0, 0, 1e-15) && principal(TAU).k === 1);
check('wrapPi(3pi) = pi', close(wrapPi(3 * Math.PI), Math.PI, 1e-12));
// the abelian bracket: [X, Y] = 0 for any X = a J, Y = b J
check('[aJ, bJ] = 0', mat.almostEqual(mat.comm(mat.scale(J2, 1.3), mat.scale(J2, -0.4)), mat.zeros(2), 0));

// ---------------------------------------------------------------- wrapping curve
check('sinc(0) = 1', sinc(0) === 1);
for (const x of [1e-8, 1e-4, 9e-4, 1.1e-3, 0.3, 2, -5]) check('sinc ' + x, close(sinc(x), x === 0 ? 1 : Math.sin(x) / x, 1e-15));
for (let i = 0; i < 300; i++) {
  const u = rand(-13, 13);
  const s = i < 30 ? 0 : i < 60 ? 1 : i < 90 ? rand(0, 1e-7) : rand(0, 1);
  const p = wrapPoint(s, u);
  if (s === 0) check('s=0 is the tangent line (1, u)', closeV(p, [1, u], 0));
  if (s === 1) check('s=1 is the unit circle', closeV(p, [Math.cos(u), Math.sin(u)], 1e-12));
  if (s > 1e-6) {
    // p lies on the circle of radius 1/s centred at (1 - 1/s, 0), tangent to the unit circle at 1
    const r = 1 / s;
    check('on circle of curvature s', close(Math.hypot(p[0] - (1 - r), p[1]), r, 1e-9 * r), JSON.stringify({ s, u, p }));
    // explicit formula from the spec
    const q = [1 - r + r * Math.cos(u / r), r * Math.sin(u / r)];
    check('matches p_s(u) formula', closeV(p, q, 1e-9 * Math.max(1, r)), JSON.stringify({ s, u, p, q }));
  }
  // unit-speed parametrisation: |dp/du| = 1 and tangent formula
  const h = 1e-6;
  const a = wrapPoint(s, u + h);
  const b = wrapPoint(s, u - h);
  const d = [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
  check('unit speed', close(Math.hypot(...d), 1, 1e-6), JSON.stringify({ s, u, d }));
  check('tangent', closeV(d, wrapTangent(s, u), 1e-6));
}
// small-s limit is continuous (no cancellation)
check('s -> 0 limit', closeV(wrapPoint(1e-12, 7), [1, 7], 1e-10));
// wrapping is an isometry: the curve always has length |theta|
for (const th of [0.5, Math.PI, TAU, 4 * Math.PI, -3]) {
  for (const s of [0, 0.25, 0.5, 1]) {
    const L = polylineLength(wrapCurve(s, th, 4000));
    check('arc length = |theta|', close(L, Math.abs(th), 1e-5), JSON.stringify({ th, s, L }));
  }
}
// endpoint at s = 1 is the group element e^{i theta}
for (const th of [0.7, -2.2, TAU, 3 * Math.PI]) check('wrap endpoint = e^{i theta}', closeV(wrapPoint(1, th), cis(th), 1e-12));
// the start of the curve is always the identity, with tangent i (vertical)
for (const s of [0, 0.3, 1]) {
  check('starts at 1', closeV(wrapPoint(s, 0), [1, 0], 0));
  check('tangent at 1 is i', closeV(wrapTangent(s, 0), [-0, 1], 0));
}

// ---------------------------------------------------------------- exponential series
for (let i = 0; i < 200; i++) {
  const th = rand(-4 * Math.PI, 4 * Math.PI);
  const N = Math.floor(rand(0, 26));
  const pts = seriesPartialSums(th, N);
  check('N+2 points', pts.length === N + 2);
  check('S_0 = 1', closeV(pts[1], [1, 0], 0));
  // each term is turned by +90 degrees from the previous one (factor i theta / n, theta > 0) or -90 (theta < 0)
  for (let n = 2; n < pts.length; n++) {
    const tPrev = [pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]];
    const t = [pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]];
    const dot = tPrev[0] * t[0] + tPrev[1] * t[1];
    const crs = tPrev[0] * t[1] - tPrev[1] * t[0];
    const scale = Math.hypot(...tPrev) * Math.hypot(...t);
    if (scale > 1e-200) {
      check('terms orthogonal', Math.abs(dot) <= 1e-12 * scale);
      check('turn sign = sign theta', Math.sign(crs) === Math.sign(th));
    }
  }
  const err = seriesError(th, N);
  check('Lagrange bound', err <= seriesErrorBound(th, N) * (1 + 1e-9) + 1e-12, JSON.stringify({ th, N, err }));
}
check('series converges (theta = pi, N = 25)', seriesError(Math.PI, 25) < 1e-15 * 50);
check('Euler: S_30(i pi) -> -1', closeV(seriesPartialSums(Math.PI, 30).at(-1), [-1, 0], 1e-14));
check('series slow for 4pi at N=25', seriesError(4 * Math.PI, 25) > 1);
check('N = 0 error is |e^{i theta} - 1|', close(seriesError(1.1, 0), Math.hypot(Math.cos(1.1) - 1, Math.sin(1.1)), 1e-15));

// ---------------------------------------------------------------- charge on a ring
for (let i = 0; i < 100; i++) {
  const q = i < 50 ? Math.round(rand(-3, 3)) : rand(-3, 3);
  const phi = rand(0.2, TAU - 0.2);
  const f = (x) => psi(q, x);
  // generator: L psi = q psi with L = -i d/dphi
  const Lpsi = applyL(f, phi);
  check('L psi = q psi', closeV(Lpsi, [q * f(phi)[0], q * f(phi)[1]], 1e-8), JSON.stringify({ q, phi, Lpsi }));
  // U(alpha) = exp(-i alpha L) acts on the eigenstate as the phase e^{-i q alpha}
  const alpha = rand(-5, 5);
  check(
    'U(alpha) psi = e^{-iq alpha} psi',
    closeV(cis(ringPhase(q, phi, alpha)), cmul(cis(-q * alpha), f(phi)), 1e-12),
  );
  // |psi|^2 is invariant (global phase is unobservable)
  check('|U psi|^2 = |psi|^2', close(Math.hypot(...cis(ringPhase(q, phi, alpha))), 1, 1e-15));
  // single-valuedness
  const sm = seam(q);
  check('seam iff non-integer', sm.singleValued === Number.isInteger(q), JSON.stringify({ q, sm }));
  check('holonomy = psi(2pi)/psi(0)', closeV(sm.holonomy, cmul(psi(q, TAU), [psi(q, 0)[0], -psi(q, 0)[1]]), 1e-12));
  if (Number.isInteger(q)) {
    check('integer q: mismatch 0', close(sm.mismatch, 0, 1e-12));
    // translation = phase: psi(phi - alpha) (periodically extended) = e^{-i q alpha} psi(phi)
    const shifted = ((phi - alpha) % TAU + TAU) % TAU;
    check('integer q: rotation = phase', closeV(psi(q, shifted), cmul(cis(-q * alpha), psi(q, phi)), 1e-10));
  }
}
check('q = 1/2: psi(2pi) = -psi(0)', closeV(seam(0.5).holonomy, [-1, 0], 1e-15) && close(Math.abs(seam(0.5).mismatch), Math.PI, 1e-12));
check('q = 1/2 rotation != phase', (() => {
  const q = 0.5;
  const phi = 0.3;
  const alpha = 1.0; // phi - alpha < 0 crosses the seam
  const shifted = ((phi - alpha) % TAU + TAU) % TAU;
  return !closeV(psi(q, shifted), cmul(cis(-q * alpha), psi(q, phi)), 1e-6);
})());
// orthonormality of the characters (Fourier series on the ring): (1/2pi) int conj(chi_m) chi_n = delta_mn
for (let m = -3; m <= 3; m++)
  for (let n = -3; n <= 3; n++) {
    let re = 0;
    let im = 0;
    const M = 512;
    for (let k = 0; k < M; k++) {
      const x = (TAU * k) / M;
      const a = psi(m, x);
      const b = psi(n, x);
      re += a[0] * b[0] + a[1] * b[1];
      im += a[0] * b[1] - a[1] * b[0];
    }
    re /= M;
    im /= M;
    check(`<chi_${m}|chi_${n}>`, close(re, m === n ? 1 : 0, 1e-12) && close(im, 0, 1e-12));
  }
check('E_q = q^2/2', close(ringEnergy(3), 4.5, 0) && close(ringEnergy(-1, 2), 0.25, 0));

// ---------------------------------------------------------------- helpers
{
  const c = clipSegment([0, 0], [10, 0], [-1, 1], [-1, 1]);
  check('clip horizontal', c && closeV(c[0], [0, 0]) && closeV(c[1], [1, 0]));
  check('clip outside', clipSegment([2, 2], [3, 3], [-1, 1], [-1, 1]) === null);
  const d = clipSegment([-1e9, -1e9], [1e9, 1e9], [-1, 1], [-2, 2]);
  check('clip huge diagonal', d && closeV(d[0], [-1, -1], 1e-6) && closeV(d[1], [1, 1], 1e-6));
  const e = clipSegment([0.5, 0.5], [0.2, -0.3], [-1, 1], [-1, 1]);
  check('clip inside unchanged', e && closeV(e[0], [0.5, 0.5]) && closeV(e[1], [0.2, -0.3]));
  const bb = bbox([[0, 1], [2, -3], [NaN, 5], null, [-1, 0]]);
  check('bbox', closeV(bb[0], [-1, 2]) && closeV(bb[1], [-3, 1]));
  check('timeline holds', wrapTimeline(0.5) === 0 && wrapTimeline(5) === 1 && wrapTimeline(8.8) === 0);
  let mono = true;
  for (let t = 1; t < 4; t += 0.01) if (wrapTimeline(t + 0.01) < wrapTimeline(t) - 1e-15) mono = false;
  check('timeline monotone while wrapping', mono);
}

console.log(`u1 maths: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
