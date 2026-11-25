// Numerical tests for the Heisenberg-group module (node tests/heisenberg.test.mjs).
// The group law, loop holonomy and coherent-state formulas are checked against the displacement
// operators themselves, acting on wavefunctions:  (D(q0,p0)ψ)(x) = e^{i p0 x − i q0 p0/2} ψ(x − q0).
import {
  TAU,
  PI,
  omega,
  hmul,
  hinv,
  groupCommutator,
  signedArea,
  makeLoop,
  loopAt,
  loopPrefix,
  sampleLoop,
  presetPoints,
  anchorAt,
  reversePts,
  resampleClosed,
  windingSpans,
  coherentPsi,
  coherentOverlap,
  wignerCoherent,
  abIntensity,
  wrapPi,
} from '../src/modules/heisenberg/math.js';
import { mulberry32 } from '../src/core/la.js';

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
const nearV = (u, v, tol, msg) => ok(u.length === v.length && u.every((x, i) => Math.abs(x - v[i]) <= tol), `${msg}: got [${u}], want [${v}]`);
const rng = mulberry32(31415);
const rnd = (a = -2, b = 2) => a + (b - a) * rng();

// ------------------------------------------------------------------ complex wavefunctions
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cexp = (ph) => [Math.cos(ph), Math.sin(ph)];
const psi0 = (x) => [Math.pow(PI, -0.25) * Math.exp(-0.5 * x * x), 0];
/** D(q0,p0) as an operator on functions x ↦ [re, im]. */
const D = ([q0, p0]) => (f) => (x) => cmul(cexp(p0 * x - 0.5 * q0 * p0), f(x - q0));
const phase = (ph) => (f) => (x) => cmul(cexp(ph), f(x));
const XS = Array.from({ length: 41 }, (_, i) => -6 + (12 * i) / 40);
function sameState(f, g, tol, msg) {
  let err = 0;
  for (const x of XS) {
    const a = f(x);
    const b = g(x);
    err = Math.max(err, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  ok(err <= tol, `${msg} (max deviation ${err})`);
}
/** ∫ f(x) dx by composite Simpson on [−L, L]. */
function integrate(f, L = 12, n = 4000) {
  const h = (2 * L) / n;
  let s = f(-L) + f(L);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(-L + i * h);
  return (s * h) / 3;
}

// ------------------------------------------------------------------ group H_3
for (let t = 0; t < 300; t++) {
  const a = [rnd(), rnd(), rnd()];
  const b = [rnd(), rnd(), rnd()];
  const c = [rnd(), rnd(), rnd()];
  nearV(hmul(hmul(a, b), c), hmul(a, hmul(b, c)), 1e-12, 'H_3 is associative');
  nearV(hmul(a, [0, 0, 0]), a, 0, 'identity (right)');
  nearV(hmul([0, 0, 0], a), a, 0, 'identity (left)');
  nearV(hmul(a, hinv(a)), [0, 0, 0], 1e-15, 'inverse');
  // the centre: (0,0,φ) commutes with everything
  nearV(hmul(a, [0, 0, 0.7]), hmul([0, 0, 0.7], a), 1e-15, 'central phase commutes');
  // group commutator a b a⁻¹ b⁻¹ = (0, 0, ω(a,b)): the Lie bracket [X_q, X_p] = Z, all else central
  nearV(hmul(hmul(hmul(a, b), hinv(a)), hinv(b)), [0, 0, omega(a, b)], 1e-12, 'aba⁻¹b⁻¹ = (0,0,ω(a,b))');
  near(omega(a, b), -omega(b, a), 1e-15, 'ω is antisymmetric');
}
for (const eps of [1e-3, 0.1, 0.5, 2]) nearV(groupCommutator(eps), [0, 0, eps * eps], 1e-15, `groupCommutator(${eps}) = (0,0,ε²)`);

// ------------------------------------------------------------------ the representation D(q, p)
for (let t = 0; t < 40; t++) {
  const a = [rnd(-1.5, 1.5), rnd(-1.5, 1.5)];
  const b = [rnd(-1.5, 1.5), rnd(-1.5, 1.5)];
  // D(a) D(b) = e^{−(i/2) ω(a,b)} D(a+b)   (the projective / Weyl relation)
  sameState(D(a)(D(b)(psi0)), phase(-0.5 * omega(a, b))(D([a[0] + b[0], a[1] + b[1]])(psi0)), 1e-12, 'D(a)D(b) = e^{−iω/2} D(a+b)');
  // applying D(δ) to the state labelled (z, φ) gives the label (z, φ)·(δ, 0)
  const phi = rnd(-3, 3);
  const [q2, p2, phi2] = hmul([a[0], a[1], phi], [b[0], b[1], 0]);
  sameState(D(b)(phase(phi)(D(a)(psi0))), phase(phi2)(D([q2, p2])(psi0)), 1e-12, 'label law (z,φ)·(δ,0) matches the operators');
}
// generator: d/dε D(ε q0, ε p0) ψ |₀ = i(p0 x̂ − q0 p̂) ψ, with p̂ = −i d/dx  (so D = exp(i(p0 x − q0 p)))
{
  const q0 = 0.7;
  const p0 = -1.3;
  const h = 1e-5;
  for (const x of [-1.2, -0.3, 0.4, 1.7]) {
    const fp = D([q0 * h, p0 * h])(psi0)(x);
    const fm = D([-q0 * h, -p0 * h])(psi0)(x);
    const deriv = [(fp[0] - fm[0]) / (2 * h), (fp[1] - fm[1]) / (2 * h)];
    const f = psi0(x)[0];
    const df = -x * f; // ψ0' = −x ψ0
    // i p0 x ψ − q0 ψ'  (p̂ψ = −iψ', so −i q0 p̂ ψ = −q0 ψ')
    nearV(deriv, [-q0 * df, p0 * x * f], 1e-8, `generator of D at x=${x}`);
  }
}

// ------------------------------------------------------------------ loops and areas
const exactPolyArea = (pts) => signedArea(pts);
{
  // presets: orientation and area against closed forms
  const s = 1;
  const sq = presetPoints('square', s);
  near(signedArea(sq), (2 * 1.15 * s) ** 2, 1e-12, 'square area');
  const tri = presetPoints('triangle', s);
  near(signedArea(tri), ((3 * Math.sqrt(3)) / 4) * (1.35 * s) ** 2, 1e-12, 'equilateral triangle area');
  const N = 240;
  const R = 1.25 * s;
  const circ = presetPoints('circle', s);
  near(signedArea(circ), (N / 2) * R * R * Math.sin(TAU / N), 1e-12, 'circle (240-gon) area');
  near(signedArea(circ), PI * R * R, 2e-3, 'circle area ≈ πR²');
  near(signedArea(presetPoints('eight', s)), 0, 1e-12, 'figure-eight: lobes cancel');
  for (const kind of ['square', 'triangle', 'circle']) {
    const P = presetPoints(kind, 0.8);
    ok(signedArea(P) > 0, `${kind} preset is counter-clockwise`);
    near(signedArea(reversePts(P)), -signedArea(P), 1e-12, `${kind} reversed flips the sign`);
    nearV(reversePts(P)[0], P[0], 0, `${kind} reversed keeps its start`);
    const A = anchorAt(P, [0.4, -0.3]);
    nearV(A[0], [0.4, -0.3], 1e-15, `${kind} anchorAt moves the start`);
    near(signedArea(A), signedArea(P), 1e-12, `${kind} area is translation invariant`);
  }
}
{
  // the horizontal lift ends exactly A above its start, for loops anywhere in the plane
  for (const kind of ['square', 'triangle', 'circle', 'eight']) {
    const P = anchorAt(presetPoints(kind, 0.9), [rnd(-1, 1), rnd(-1, 1)]);
    const L = makeLoop(P);
    near(L.area, exactPolyArea(P), 1e-12, `${kind}: makeLoop area = shoelace area`);
    near(loopAt(L, 1).phi, L.area, 1e-12, `${kind}: φ(1) = A`);
    near(loopAt(L, 0).phi, 0, 0, `${kind}: φ(0) = 0`);
    nearV(loopAt(L, 0).z, P[0], 0, `${kind}: starts at the first vertex`);
    nearV(loopAt(L, 1).z, P[0], 1e-12, `${kind}: ends where it started`);
    // the same answer from the group: compose the steps (z, φ)·(δ_k, 0) around the loop
    let g = [P[0][0], P[0][1], 0];
    for (let k = 0; k < P.length; k++) {
      const a = P[k];
      const b = P[(k + 1) % P.length];
      g = hmul(g, [b[0] - a[0], b[1] - a[1], 0]);
    }
    nearV(g, [P[0][0], P[0][1], L.area], 1e-10, `${kind}: group holonomy = (z0, A)`);
  }
  // and from the operators: transporting a coherent state around a loop multiplies it by e^{+iA}
  const P = anchorAt(presetPoints('triangle', 0.7), [0.3, 0.2]);
  const steps = P.map((a, k) => {
    const b = P[(k + 1) % P.length];
    return [b[0] - a[0], b[1] - a[1]];
  });
  const start = D(P[0])(psi0);
  let f = start;
  for (const d of steps) f = D(d)(f);
  sameState(f, phase(signedArea(P))(start), 1e-9, 'operators around a loop give e^{+iA}');
  // the doubled-back loop (out and back along the same path) encloses nothing
  const there = [
    [0, 0],
    [1, 0.5],
    [1.5, -0.2],
  ];
  const back = [...there, ...there.slice(1, -1).reverse()];
  near(makeLoop(back).area, 0, 1e-15, 'retraced path encloses zero area');
}
{
  // loopAt is arc-length parametrised and φ is monotone along a convex counter-clockwise loop
  const L = makeLoop(presetPoints('square', 1));
  const mid = loopAt(L, 0.5);
  const quarter = loopAt(L, 0.25);
  near(mid.seg, L.n / 2, 1, 'half-way by arc length is half the vertices on a square');
  ok(Math.abs(Math.hypot(...quarter.t) - 1) < 1e-12, 'unit tangent');
  const S = sampleLoop(L, 200);
  ok(S.length >= 201, 'sampleLoop returns at least m+1 samples');
  near(S[S.length - 1].phi, L.area, 1e-12, 'sampleLoop ends at φ = A');
  let mono = true;
  for (let i = 1; i < S.length; i++) if (S[i].phi < S[i - 1].phi - 1e-12) mono = false;
  ok(mono, 'φ grows monotonically around a convex loop about the origin');
  const pre = loopPrefix(L, 0.37);
  nearV(pre[pre.length - 1], loopAt(L, 0.37).z, 0, 'loopPrefix ends at the current point');
  // degenerate input is replaced by a tiny triangle instead of crashing
  ok(makeLoop([[0, 0]]).n === 3, 'degenerate loop falls back to a tiny triangle');
  ok(makeLoop([[0, 0], [1, 0], [0, 1], [0, 0]]).n === 3, 'duplicated closing point is dropped');
}
{
  // freehand resampling keeps the area; winding-number scanlines integrate to the signed area
  const raw = presetPoints('circle', 1).filter((_, i) => i % 3 === 0);
  const res = resampleClosed(raw, 220);
  ok(res.length === 220, 'resampleClosed returns m points');
  near(signedArea(res), signedArea(raw), 0.02 * Math.abs(signedArea(raw)), 'resampling keeps the area');
  for (const kind of ['circle', 'triangle', 'eight']) {
    const P = presetPoints(kind, 1);
    const ys = P.map((p) => p[1]);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const n = 3000;
    let A = 0;
    for (let i = 0; i < n; i++) {
      const y = y0 + ((i + 0.5) * (y1 - y0)) / n;
      for (const [xa, xb, w] of windingSpans(P, y)) A += (xb - xa) * w * ((y1 - y0) / n);
    }
    near(A, signedArea(P), 2e-3 * (1 + Math.abs(signedArea(P))), `${kind}: ∫ winding dq dp = signed area`);
  }
  // figure-eight: the two lobes have winding numbers of opposite sign
  const E = presetPoints('eight', 1);
  const wRight = windingSpans(E, 0.3).filter(([a, b]) => (a + b) / 2 > 0).map((s) => s[2]);
  const wLeft = windingSpans(E, 0.3).filter(([a, b]) => (a + b) / 2 < 0).map((s) => s[2]);
  ok(wRight.length && wLeft.length && Math.sign(wRight[0]) === -Math.sign(wLeft[0]), 'figure-eight lobes wind oppositely');
  ok(wRight[0] < 0, 'right lobe of the figure-eight is clockwise (as documented)');
}

// ------------------------------------------------------------------ coherent states
for (let t = 0; t < 12; t++) {
  const q = rnd(-2, 2);
  const p = rnd(-2, 2);
  const th = rnd(-3, 3);
  const f = (x) => coherentPsi(x, q, p, th);
  // it is e^{iθ} D(q,p) ψ0
  sameState(f, phase(th)(D([q, p])(psi0)), 1e-13, 'coherentPsi = e^{iθ} D(q,p)|0⟩');
  near(integrate((x) => {
    const z = f(x);
    return z[0] * z[0] + z[1] * z[1];
  }), 1, 1e-10, 'coherent state is normalised');
  near(integrate((x) => {
    const z = f(x);
    return x * (z[0] * z[0] + z[1] * z[1]);
  }), q, 1e-9, '⟨x⟩ = q');
  // ⟨p⟩ = ∫ ψ* (−i ψ') dx = ∫ (Re ψ Im ψ' − Im ψ Re ψ') dx
  const hh = 1e-5;
  near(integrate((x) => {
    const z = f(x);
    const a = f(x + hh);
    const b = f(x - hh);
    const d = [(a[0] - b[0]) / (2 * hh), (a[1] - b[1]) / (2 * hh)];
    return z[0] * d[1] - z[1] * d[0];
  }), p, 1e-6, '⟨p⟩ = p');
  // overlap ⟨D(zs)0 | e^{iθ} D(z) 0⟩ against direct integration
  const zs = [rnd(-1.5, 1.5), rnd(-1.5, 1.5)];
  const g = (x) => coherentPsi(x, zs[0], zs[1], 0);
  const re = integrate((x) => {
    const a = g(x);
    const b = f(x);
    return a[0] * b[0] + a[1] * b[1];
  });
  const im = integrate((x) => {
    const a = g(x);
    const b = f(x);
    return a[0] * b[1] - a[1] * b[0];
  });
  nearV(coherentOverlap(zs, [q, p], th), [re, im], 1e-9, 'coherentOverlap matches ∫ψ*φ');
  // Wigner function: its p-marginal is |ψ(q)|²
  const xq = rnd(-2, 2);
  const marg = integrate((pp) => wignerCoherent(xq, pp, q, p));
  const z = f(xq);
  near(marg, z[0] * z[0] + z[1] * z[1], 1e-10, '∫ W dp = |ψ(q)|²');
}

// ------------------------------------------------------------------ Aharonov–Bohm
{
  const k = 3.1;
  for (const y of [-1, -0.2, 0, 0.5, 1.3]) {
    near(abIntensity(y, k, 0.8 + TAU), abIntensity(y, k, 0.8), 1e-12, 'pattern is periodic in qΦ with period 2π (flux quantum)');
    // a flux qΦ shifts the fringes rigidly by Δy = −qΦ/(k d/L)
    near(abIntensity(y, k, 1.1), abIntensity(y + 1.1 / k, k, 0), 1e-12, 'flux shifts the fringes rigidly');
  }
  near(abIntensity(0, k, 0), 1, 1e-15, 'no flux: bright central fringe');
  near(abIntensity(0, k, PI), 0, 1e-15, 'half a flux quantum: dark centre');
  for (const x of [-7, -PI, -1, 0, 1, PI, 4, 13]) {
    const w = wrapPi(x);
    ok(w > -PI - 1e-15 && w <= PI + 1e-15, `wrapPi(${x}) in (−π, π]`);
    near(Math.cos(w), Math.cos(x), 1e-12, `wrapPi(${x}) same angle`);
  }
}

// ------------------------------------------------------------------ report
for (const f of fails) console.log('FAIL', f);
console.log(`heisenberg: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
