#!/usr/bin/env node
// Numerical checks for src/modules/sp2/math.js (Sp(2,R), sp(2,R) ≅ so(2,1), FODO, Mathieu, damping).
//   node tests/sp2.test.mjs
import {
  generator, quadMatrix, energy, discriminant, toMinkowski, fromMinkowski, fromGenerator, field, K_FORMS, poissonQuad,
  flowMatrix, classify, flow, conjugate, rot, squeeze, classifyElement, multipliers, realEigenvectors, symEig2, levelSet,
  levelFamily, discPolygon, mapPoints, polygonArea, thinLens, drift, cellMatrix, fodoMatrix, traceRay, twiss, betaFunction,
  csInvariant, csEllipse, mathieuMonodromy, mathieuTrajectory, floquet, dampedGenerator, splitTrace, traceDetType, J2,
} from '../src/modules/sp2/math.js';
import { mat, exp2, mulberry32 } from '../src/core/la.js';
import { cx, cmat } from '../src/core/complex.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const rng = mulberry32(2024);
const rnd = (a = -2, b = 2) => a + (b - a) * rng();
const randH = () => ({ a: rnd(), b: rnd(), c: rnd() });
const randSL2 = () => {
  // product of random exponentials (covers all of the identity component)
  let M = mat.eye(2);
  for (let k = 0; k < 3; k++) M = mat.mul(M, flow(randH(), rnd(-1, 1)));
  return M;
};

// ---------------------------------------------------------------- Hamilton's equations and the generator
for (let i = 0; i < 200; i++) {
  const h = randH();
  const q = rnd();
  const p = rnd();
  const e = 1e-6;
  const dHdq = (energy(h, q + e, p) - energy(h, q - e, p)) / (2 * e);
  const dHdp = (energy(h, q, p + e) - energy(h, q, p - e)) / (2 * e);
  const X = generator(h);
  const v = mat.mulv(X, [q, p]);
  check("Hamilton q' = ∂H/∂p", close(v[0], dHdp, 1e-7));
  check("Hamilton p' = −∂H/∂q", close(v[1], -dHdq, 1e-7));
  check('field = X z', close(field(h, q, p)[0], v[0]) && close(field(h, q, p)[1], v[1]));
  check('X = J A', mat.almostEqual(X, mat.mul(J2, quadMatrix(h)), 1e-14));
  check('H = ½ zᵀAz', close(energy(h, q, p), 0.5 * (q * (quadMatrix(h)[0][0] * q + quadMatrix(h)[0][1] * p) + p * (quadMatrix(h)[1][0] * q + quadMatrix(h)[1][1] * p))));
  check('tr X = 0', Math.abs(mat.trace(X)) < 1e-15);
  const D = discriminant(h);
  check('Δ = −det X', close(D, -mat.det(X)));
  check('Δ = ½ tr X²', close(D, 0.5 * mat.trace(mat.mul(X, X))));
  check('X² = Δ 1', mat.almostEqual(mat.mul(X, X), mat.scale(mat.eye(2), D), 1e-12));
  const [x, y, t] = toMinkowski(h);
  check('Δ = x² + y² − t²', close(D, x * x + y * y - t * t, 1e-12));
  const h2 = fromMinkowski([x, y, t]);
  check('Minkowski roundtrip', close(h2.a, h.a, 1e-14) && close(h2.b, h.b, 1e-14) && close(h2.c, h.c, 1e-14));
  const h3 = fromGenerator(X);
  check('fromGenerator', close(h3.a, h.a, 1e-14) && close(h3.b, h.b, 1e-14) && close(h3.c, h.c, 1e-14));
  // H = 2(t K0 + x K1 + y K2)
  const Kq = K_FORMS.map((F) => 0.5 * (F[0][0] * q * q + 2 * F[0][1] * q * p + F[1][1] * p * p));
  check('H = 2(tK0 + xK1 + yK2)', close(energy(h, q, p), 2 * (t * Kq[0] + x * Kq[1] + y * Kq[2]), 1e-12));
}

// ---------------------------------------------------------------- flows
for (let i = 0; i < 200; i++) {
  const h = randH();
  const s = rnd(-2, 2);
  const t = rnd(-2, 2);
  const Ms = flow(h, s);
  const Mt = flow(h, t);
  check('det M = 1', close(mat.det(Mt), 1, 1e-11));
  check('M(s)M(t) = M(s+t)', mat.almostEqual(mat.mul(Ms, Mt), flow(h, s + t), 1e-9 * Math.max(1, mat.maxAbs(flow(h, s + t)))));
  check('exp2 = expm', mat.almostEqual(Mt, mat.expm(mat.scale(generator(h), t)), 1e-9 * Math.max(1, mat.maxAbs(Mt))));
  const e = 1e-6;
  const dM = mat.scale(mat.sub(flow(h, t + e), flow(h, t - e)), 1 / (2 * e));
  check("M' = X M", mat.almostEqual(dM, mat.mul(generator(h), Mt), 1e-5 * Math.max(1, mat.maxAbs(dM))));
  const z = [rnd(), rnd()];
  const z2 = mat.mulv(Mt, z);
  check('energy conserved', close(energy(h, ...z), energy(h, ...z2), 1e-9 * Math.max(1, mat.maxAbs(Mt) ** 2)));
  // tr e^{X} ≥ −2 for every X ∈ sl(2,R)
  check('tr exp(X) ≥ −2', mat.trace(flow(h, 10 * t)) >= -2 - 1e-9);
}
// oscillator: clockwise rotation with period 2π
{
  const osc = { a: 1, b: 0, c: 1 };
  const c = classify(osc);
  check('oscillator elliptic', c.type === 'elliptic' && close(c.omega, 1) && close(c.period, 2 * Math.PI) && c.sheet === 1);
  check('oscillator flow = rot(t)', mat.almostEqual(flow(osc, 0.7), rot(0.7), 1e-14));
  const z = mat.mulv(flow(osc, 0.1), [1, 0]);
  check('oscillator turns clockwise (p decreases from (1,0))', z[1] < 0);
  check('M(π) = −1', mat.almostEqual(flow(osc, Math.PI), mat.scale(mat.eye(2), -1), 1e-14));
  check('free particle parabolic', classify({ a: 1, b: 0, c: 0 }).type === 'parabolic');
  check('free particle shear', mat.almostEqual(flow({ a: 1, b: 0, c: 0 }, 1.5), [[1, 1.5], [0, 1]], 1e-14));
  const inv = classify({ a: 1, b: 0, c: -1 });
  check('inverted oscillator hyperbolic, λ = 1', inv.type === 'hyperbolic' && close(inv.lambda, 1));
  check('squeezer H = qp', mat.almostEqual(flow({ a: 0, b: 1, c: 0 }, 0.3), squeeze(0.3), 1e-14));
  check('rotating frame on lower sheet', classify({ a: -1, b: 0, c: -1 }).sheet === -1);
  check('rotating frame runs anticlockwise', mat.mulv(flow({ a: -1, b: 0, c: -1 }, 0.1), [1, 0])[1] > 0);
  check('zero H', classify({ a: 0, b: 0, c: 0 }).type === 'zero');
  // squeezer and inverted oscillator are conjugate by a 45° rotation (same orbit)
  const h45 = conjugate({ a: 1, b: 0, c: -1 }, rot(Math.PI / 4));
  check('inverted oscillator ~ ±squeezer', close(Math.abs(h45.b), 1, 1e-12) && Math.abs(h45.a) < 1e-12 && Math.abs(h45.c) < 1e-12, JSON.stringify(h45));
}

// ---------------------------------------------------------------- symplectic = unimodular in 2D
for (let i = 0; i < 50; i++) {
  const A = [[rnd(), rnd()], [rnd(), rnd()]];
  check('AᵀJA = det(A) J', mat.almostEqual(mat.chain(mat.transpose(A), J2, A), mat.scale(J2, mat.det(A)), 1e-12));
  const M = randSL2();
  check('flows are symplectic: MᵀJM = J', mat.almostEqual(mat.chain(mat.transpose(M), J2, M), J2, 1e-9 * Math.max(1, mat.maxAbs(M) ** 2)));
}

// ---------------------------------------------------------------- Liouville
for (let i = 0; i < 50; i++) {
  const M = randSL2();
  const poly = discPolygon([rnd(), rnd()], 0.3 + rng(), 64);
  check('area preserved by SL(2)', close(polygonArea(mapPoints(M, poly)), polygonArea(poly), 1e-9));
  const g = rnd(-1, 1);
  const w2 = rnd(-2, 2);
  const t = rnd(0, 2);
  const E = exp2(mat.scale(dampedGenerator(g, w2), t));
  check('damped: area × e^{−γt}', close(polygonArea(mapPoints(E, poly)), polygonArea(poly) * Math.exp(-g * t), 1e-9));
  check('det e^{tX} = e^{−γt}', close(mat.det(E), Math.exp(-g * t), 1e-10));
  const { scalar, X0 } = splitTrace(dampedGenerator(g, w2));
  check('tr X = −γ', close(2 * scalar, -g, 1e-14));
  check('e^{tX} = e^{−γt/2} e^{tX₀}', mat.almostEqual(E, mat.scale(exp2(mat.scale(X0, t)), Math.exp(scalar * t)), 1e-9 * Math.max(1, mat.maxAbs(E))));
}

// ---------------------------------------------------------------- sp(2,R) ≅ so(2,1): Poisson brackets
{
  const [K0, K1, K2] = K_FORMS;
  check('{K0,K1} = K2', mat.almostEqual(poissonQuad(K0, K1), K2, 1e-15));
  check('{K0,K2} = −K1', mat.almostEqual(poissonQuad(K0, K2), mat.scale(K1, -1), 1e-15));
  check('{K1,K2} = −K0', mat.almostEqual(poissonQuad(K1, K2), mat.scale(K0, -1), 1e-15));
  // finite-difference Poisson brackets at random points
  const f = (F) => (q, p) => 0.5 * (F[0][0] * q * q + 2 * F[0][1] * q * p + F[1][1] * p * p);
  for (let i = 0; i < 50; i++) {
    const q = rnd();
    const p = rnd();
    const e = 1e-5;
    const pb = (F, G) => {
      const df = f(F);
      const dg = f(G);
      const fq = (df(q + e, p) - df(q - e, p)) / (2 * e);
      const fp = (df(q, p + e) - df(q, p - e)) / (2 * e);
      const gq = (dg(q + e, p) - dg(q - e, p)) / (2 * e);
      const gp = (dg(q, p + e) - dg(q, p - e)) / (2 * e);
      return fq * gp - fp * gq;
    };
    check('FD {K0,K1} = K2', close(pb(K0, K1), f(K2)(q, p), 1e-7));
    check('FD {K1,K2} = −K0', close(pb(K1, K2), -f(K0)(q, p), 1e-7));
    const A = quadMatrix(randH());
    const B = quadMatrix(randH());
    check('FD {f,g} = poissonQuad', close(pb(A, B), f(poissonQuad(A, B))(q, p), 1e-6));
    check('X_{f,g} = [X_f, X_g]', mat.almostEqual(flowMatrix(poissonQuad(A, B)), mat.comm(flowMatrix(A), flowMatrix(B)), 1e-12));
  }
  // Killing form tr(X_i X_j) ∝ diag(−1, +1, +1): K0 timelike
  const X = K_FORMS.map(flowMatrix);
  check('Killing signature', close(mat.trace(mat.mul(X[0], X[0])), -0.5) && close(mat.trace(mat.mul(X[1], X[1])), 0.5) && close(mat.trace(mat.mul(X[2], X[2])), 0.5));
  check('Killing orthogonal', Math.abs(mat.trace(mat.mul(X[0], X[1]))) < 1e-15 && Math.abs(mat.trace(mat.mul(X[1], X[2]))) < 1e-15);
}

// ---------------------------------------------------------------- adjoint orbits = canonical changes of variables
for (let i = 0; i < 100; i++) {
  const h = randH();
  const S = randSL2();
  const h2 = conjugate(h, S);
  check('Δ invariant under conjugation', close(discriminant(h2), discriminant(h), 1e-8 * Math.max(1, mat.maxAbs(S) ** 4)));
  const z = [rnd(), rnd()];
  const Si = mat.inv(S);
  check("H'(z) = H(S⁻¹z)", close(energy(h2, ...z), energy(h, ...mat.mulv(Si, z)), 1e-8 * Math.max(1, mat.maxAbs(S) ** 4)));
  const c1 = classify(h);
  const c2 = classify(h2);
  if (c1.type === 'elliptic' && Math.abs(discriminant(h)) > 1e-3) check('elliptic sheet preserved', c1.sheet === c2.sheet);
}

// ---------------------------------------------------------------- exp is not surjective
{
  const M = [
    [-2, 0],
    [0, -0.5],
  ];
  const c = classifyElement(M);
  check('−diag(2,½): tr = −2.5', close(c.tr, -2.5));
  check('−diag(2,½) not an exponential', c.isExp === false);
  check('−1 is an exponential', classifyElement([[-1, 0], [0, -1]]).isExp === true);
  check('−diag(2,½) = e^{πJ} e^{ln2 K}', mat.almostEqual(mat.mul(flow({ a: 1, b: 0, c: 1 }, Math.PI), squeeze(Math.log(2))), M, 1e-14));
  let minTr = Infinity;
  for (let i = 0; i < 2000; i++) minTr = Math.min(minTr, mat.trace(exp2(mat.scale(generator(randH()), 5 * rng()))));
  check('min tr exp ≥ −2 over samples', minTr >= -2 - 1e-12, String(minTr));
  check('rot classification', classifyElement(rot(1)).type === 'elliptic' && classifyElement(squeeze(1)).type === 'hyperbolic');
  const mu = multipliers(rot(0.8));
  check('multipliers e^{±iμ}', !mu.real && close(Math.abs(mu.mu), 0.8));
  const ev = realEigenvectors(flow({ a: 1, b: 0, c: -1 }, 1));
  check('inverted osc eigvec (1,1)/√2', ev && close(Math.abs(ev[0].vec[0]), Math.SQRT1_2, 1e-12) && close(ev[0].vec[0] * ev[0].vec[1], 0.5, 1e-12));
}

// ---------------------------------------------------------------- level sets
for (let i = 0; i < 60; i++) {
  const h = randH();
  const A = quadMatrix(h);
  const { lp, lm, ep, em } = symEig2(A);
  check('symEig2', mat.almostEqual(mat.add(mat.scale(mat.outer(ep, ep), lp), mat.scale(mat.outer(em, em), lm)), A, 1e-12));
  const R = 3;
  for (const L of levelFamily(h, R, 0.4, 5)) {
    let ok = true;
    let inside = true;
    for (const z of L.pts) {
      if (!z) continue;
      if (L.h !== 0 && !close(energy(h, ...z), L.h, 1e-7)) ok = false;
      if (L.h === 0 && Math.abs(energy(h, ...z)) > 1e-9) ok = false;
      if (Math.hypot(...z) > R * (1 + 1e-6)) inside = false;
    }
    check('level set on H = h', ok, JSON.stringify({ h, level: L.h }));
    check('level set inside R', inside);
  }
}
{
  // an ellipse fully inside is closed; a hyperbola ends on |z| = R
  const ell = levelSet([[1, 0], [0, 1]], 0.5, 3);
  check('circle closed', ell.length > 50 && ell.every(Boolean) && Math.hypot(ell[0][0] - ell.at(-1)[0], ell[0][1] - ell.at(-1)[1]) < 1e-9);
  const hyp = levelSet([[-1, 0], [0, 1]], 0.5, 3).filter(Boolean);
  const radii = hyp.map((z) => Math.hypot(...z));
  check('hyperbola reaches R', close(Math.max(...radii), 3, 1e-6));
}

// ---------------------------------------------------------------- strong focusing
for (let i = 0; i < 100; i++) {
  const f = 0.3 + 2 * rng();
  const L = 4 * rng() * f;
  const M = fodoMatrix(L, f);
  check('FODO closed form = D Q(−f) D Q(f)', mat.almostEqual(M, mat.chain(drift(L), thinLens(-f), drift(L), thinLens(f)), 1e-12));
  check('FODO = cellMatrix', mat.almostEqual(M, cellMatrix('fodo', L, f), 1e-12));
  check('det FODO = 1', close(mat.det(M), 1, 1e-12));
  check('tr = 2 − L²/f²', close(mat.trace(M), 2 - (L * L) / (f * f), 1e-12));
  check('stable ⇔ L < 2f', (Math.abs(mat.trace(M)) < 2) === (L < 2 * f) || Math.abs(L - 2 * f) < 1e-9);
  const My = cellMatrix('fodo', L, f, 'y');
  check('tr M_y = tr M_x', close(mat.trace(My), mat.trace(M), 1e-12));
  check('D only unstable', mat.trace(cellMatrix('dd', L, f)) > 2 || L < 1e-9);
  const tw = twiss(M);
  if (L < 2 * f - 1e-6 && L > 1e-6) {
    check('cos μ = 1 − L²/2f²', close(Math.cos(tw.mu), 1 - (L * L) / (2 * f * f), 1e-12));
    check('sin(μ/2) = L/2f', close(Math.sin(Math.abs(tw.mu) / 2), L / (2 * f), 1e-10));
    check('βγ − α² = 1', close(tw.beta * tw.gamma - tw.alpha * tw.alpha, 1, 1e-9));
    const Jcs = [[tw.alpha, tw.beta], [-tw.gamma, -tw.alpha]];
    check('M = cos μ + sin μ J', mat.almostEqual(M, mat.add(mat.scale(mat.eye(2), Math.cos(tw.mu)), mat.scale(Jcs, Math.sin(tw.mu))), 1e-10));
    let z = [rnd(-1, 1), rnd(-1, 1)];
    const I0 = csInvariant(tw, z);
    let ok = true;
    for (let n = 0; n < 200; n++) {
      z = mat.mulv(M, z);
      if (!close(csInvariant(tw, z), I0, 1e-8)) ok = false;
    }
    check('Courant–Snyder invariant conserved', ok);
    const ell = csEllipse(tw, I0);
    check('CS ellipse on invariant', ell.every((p) => close(csInvariant(tw, p), I0, 1e-9)));
  }
  // betatron function: periodic, larger at the focusing lens than at the defocusing one; envelope bounds rays
  if (L < 2 * f - 1e-3 && L > 1e-3) {
    const bf = betaFunction('fodo', L, f, 'x', 2, 16);
    check('β periodic', close(bf[0][1], bf[32][1], 1e-9) && close(bf[0][1], bf.at(-1)[1], 1e-9));
    check('β(F) > β(D)', bf[0][1] > bf[16][1]);
    const by = betaFunction('fodo', L, f, 'y', 1, 16);
    check('β_y(F_x) = β_x(D)', close(by[0][1], bf[16][1], 1e-9));
    const tw0 = twiss(M);
    const zr = [rnd(-1, 1), rnd(-1, 1)];
    const eps = csInvariant(tw0, zr);
    const rayPts = traceRay('fodo', L, f, zr, 2);
    // ray points at drift ends: s = L, 2L, 3L, 4L ↔ β-samples 16, 32, 48, 64
    check('|x| ≤ √(εβ)', rayPts.every(([s, x], i) => i === 0 || Math.abs(x) <= Math.sqrt(eps * bf[i * 16][1]) * (1 + 1e-9) + 1e-12));
  }
  // ray tracing agrees with the matrix
  const z0 = [rnd(-1, 1), rnd(-1, 1)];
  const ray = traceRay('fodo', L, f, z0, 3);
  const z3 = mat.mulv(mat.pow(M, 3), z0);
  check('traceRay x after 3 cells', close(ray.at(-1)[1], z3[0], 1e-9 * Math.max(1, Math.abs(z3[0]))));
}

// ---------------------------------------------------------------- Mathieu equation
{
  // Abramowitz & Stegun Table 20.1, q = 1: characteristic values (period π: tr = +2; period 2π: tr = −2)
  const chars = [
    ['a0', -0.455138604, 2],
    ['b1', -0.110248816, -2],
    ['a1', 1.859108072, -2],
    ['b2', 3.917024772, 2],
    ['a2', 4.371300982, 2],
  ];
  for (const [name, A, tr] of chars) {
    const M = mathieuMonodromy(A, 1, 1200);
    check(`Mathieu ${name}(1): tr M = ${tr}`, Math.abs(mat.trace(M) - tr) < 2e-6, String(mat.trace(M)));
  }
  const trAt = (A, e) => mat.trace(mathieuMonodromy(A, e, 400));
  check('stable between a0 and b1 (A < 0!)', Math.abs(trAt(-0.3, 1)) < 2);
  check('first tongue: tr < −2', trAt(0.8, 1) < -2);
  check('stable between a1 and b2', Math.abs(trAt(2.8, 1)) < 2);
  check('second tongue: tr > 2', trAt(4.1, 1) > 2);
  check('static A < 0 unstable', trAt(-0.3, 0) > 2);
  // small pumping: tongue 1 − ε < A < 1 + ε
  check('ε = 0.1: A = 0.88 stable', Math.abs(trAt(0.88, 0.1)) < 2);
  check('ε = 0.1: A = 1 unstable', trAt(1, 0.1) < -2);
  check('ε = 0.1: A = 1.12 stable', Math.abs(trAt(1.12, 0.1)) < 2);
  // ε = 0 is the oscillator: tr = 2 cos(π√A)
  check('ε = 0: tr = 2cos(π√A)', close(trAt(2.3, 0), 2 * Math.cos(Math.PI * Math.sqrt(2.3)), 1e-9));
  // growth rate in the first tongue ≈ ε/2 per unit time at A = 1 (|λ| ≈ e^{πε/2})
  const fq = floquet(mathieuMonodromy(1, 0.05, 400));
  check('growth ≈ πε/2', close(fq.growth, (Math.PI * 0.05) / 2, 2e-2), String(fq.growth));
  for (let i = 0; i < 30; i++) {
    const M = mathieuMonodromy(rnd(-2, 10), rnd(0, 3), 96);
    check('Mathieu det = 1', close(mat.det(M), 1, 1e-10));
  }
  const tr = mathieuTrajectory(1.3, 0.4, [1, 0], 5, 200);
  const M = mathieuMonodromy(1.3, 0.4, 200);
  let z = [1, 0];
  let ok = true;
  for (let n = 1; n <= 5; n++) {
    z = mat.mulv(M, z);
    if (!(close(tr.strobe[n][0], z[0], 1e-9) && close(tr.strobe[n][1], z[1], 1e-9))) ok = false;
  }
  check('stroboscopic map = monodromy powers', ok);
}

// ---------------------------------------------------------------- trace–determinant classification
{
  const T = (g, w2) => traceDetType(-g, w2).key;
  check('underdamped = stable spiral', T(0.3, 1) === 'spiral-sink');
  check('critical = degenerate node', T(2, 1) === 'degenerate-sink');
  check('overdamped = stable node', T(3, 1) === 'node-sink');
  check('antidamped = unstable spiral', T(-0.3, 1) === 'spiral-source');
  check('saddle', T(0.3, -1) === 'saddle');
  check('Hamiltonian = centre', T(0, 1) === 'centre');
}

// ---------------------------------------------------------------- quantum: metaplectic representation (truncated Fock space)
{
  const N = 44;
  const a = mat.zeros(N);
  for (let n = 1; n < N; n++) a[n - 1][n] = Math.sqrt(n);
  const ad = mat.transpose(a);
  const s2 = Math.SQRT1_2;
  const X = cmat.fromReal(mat.scale(mat.add(a, ad), s2));
  const P = cmat.scale(cmat.fromReal(mat.scale(mat.sub(a, ad), s2)), { re: 0, im: -1 });
  const XX = cmat.mul(X, X);
  const PP = cmat.mul(P, P);
  const K0 = cmat.scale(cmat.add(PP, XX), 0.25);
  const K1 = cmat.scale(cmat.sub(PP, XX), 0.25);
  const K2 = cmat.scale(cmat.add(cmat.mul(X, P), cmat.mul(P, X)), 0.25);
  const block = (Mx, n = N - 6) => Mx.slice(0, n).map((r) => r.slice(0, n));
  const iTimes = (Mx) => cmat.scale(Mx, { re: 0, im: 1 });
  check('[K0,K1] = iK2', cmat.almostEqual(block(cmat.comm(K0, K1)), block(iTimes(K2)), 1e-10));
  check('[K0,K2] = −iK1', cmat.almostEqual(block(cmat.comm(K0, K2)), block(cmat.scale(iTimes(K1), -1)), 1e-10));
  check('[K1,K2] = −iK0', cmat.almostEqual(block(cmat.comm(K1, K2)), block(cmat.scale(iTimes(K0), -1)), 1e-10));
  const C = cmat.sub(cmat.sub(cmat.mul(K0, K0), cmat.mul(K1, K1)), cmat.mul(K2, K2));
  check('Casimir = −3/16 (k = 1/4, 3/4)', cmat.almostEqual(block(C, N - 8), block(cmat.scale(cmat.eye(N), -3 / 16), N - 8), 1e-9));
  // K0 = (n + ½)/2 on |n⟩; a full classical turn (time 2π of H = 2K0) is represented by −1
  let ok = true;
  for (let n = 0; n < N - 6; n++) {
    if (!close(K0[n][n].re, (n + 0.5) / 2, 1e-10)) ok = false;
    const ph = cx.cis(-2 * Math.PI * 2 * K0[n][n].re);
    if (!cx.eq(ph, { re: -1, im: 0 }, 1e-9)) ok = false;
  }
  check('metaplectic: e^{−2πi·2K0} = −1', ok);
}

console.log(`sp2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
