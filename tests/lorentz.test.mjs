#!/usr/bin/env node
// Numerical checks for src/modules/lorentz/math.js (no DOM).   node tests/lorentz.test.mjs
import * as M from '../src/modules/lorentz/math.js';
import { mat, vec, expSO3, mulberry32, randomUnit3, TAU, signedArea } from '../src/core/la.js';
import { cx, cmat } from '../src/core/complex.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    if (failures.filter((f) => f === name).length < 3) console.log('FAIL', name, extra);
    failures.push(name);
  }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const rng = mulberry32(42);
const rnd = (a, b) => a + (b - a) * rng();
const randVel = (max = 0.95) => {
  const r = max * Math.sqrt(rng());
  const a = TAU * rng();
  return [r * Math.cos(a), r * Math.sin(a)];
};
const deg = (r) => ((r * 180) / Math.PI).toFixed(4) + '°';
const info = (...a) => console.log('   ', ...a);

// =========================================================== 1+1 D
{
  for (const eta of [-2.3, -0.4, 0, 0.7, 1.9, 3.1]) {
    check('Λ(η) = exp(ηX)', mat.almostEqual(M.boost11(eta), mat.expm(mat.scale(M.X11, eta)), 1e-12));
    check('Λ(η) = cosh η + X sinh η', mat.almostEqual(M.boost11(eta), mat.add(mat.scale(mat.eye(2), Math.cosh(eta)), mat.scale(M.X11, Math.sinh(eta))), 1e-14));
    const ev = [rnd(-3, 3), rnd(-3, 3)];
    const bev = M.boostEvent(ev, eta);
    const tx = mat.mulv(M.boost11(eta), [ev[1], ev[0]]); // (t, x)
    check('boostEvent ↔ Λ on (t,x)', close(bev[1], tx[0], 1e-12) && close(bev[0], tx[1], 1e-12));
    check('t² − x² invariant', close(M.interval2(bev), M.interval2(ev), 1e-10));
  }
  check('X² = 1', mat.almostEqual(mat.mul(M.X11, M.X11), mat.eye(2)));
  for (let i = 0; i < 50; i++) {
    const a = rnd(-2, 2);
    const b = rnd(-2, 2);
    check('Λ(a)Λ(b) = Λ(a+b)', mat.almostEqual(mat.mul(M.boost11(a), M.boost11(b)), M.boost11(a + b), 1e-12));
    check('rapidities add ⇔ β = (β₁+β₂)/(1+β₁β₂)', close(Math.tanh(a + b), M.addVelocities(Math.tanh(a), Math.tanh(b)), 1e-12));
    check('|β₁ ⊕ β₂| < 1', Math.abs(M.addVelocities(Math.tanh(a), Math.tanh(b))) < 1);
  }
  // rapidity = twice the hyperbolic sector area
  for (const eta of [0.3, 1, 2.5]) {
    const poly = M.sectorPolygon(0, eta, 4000);
    check('sector area = η/2', close(Math.abs(signedArea(poly)), eta / 2, 1e-6), signedArea(poly));
  }
  // time dilation and length contraction read off the hyperbolas
  const eta = 0.9;
  const tick = M.boostEvent([0, 1], eta);
  check('τ = 1 tick at t = γ', close(tick[1], Math.cosh(eta)) && close(M.interval2(tick), 1));
  // worldline x' = 1: Λ(η)(t', 1); crosses t = 0 at t' = −tanh η, where x = 1/γ
  const cross = M.boostEvent([1, -Math.tanh(eta)], eta);
  check('moving unit rod has length 1/γ', close(cross[1], 0, 1e-12) && close(cross[0], 1 / Math.cosh(eta), 1e-12));
  // simultaneity: the boosted x′ axis has slope tanh η
  const xp = M.boostEvent([1, 0], eta);
  check("x′ axis slope dt/dx = β", close(xp[1] / xp[0], Math.tanh(eta), 1e-12));
  info(`1+1 D: η = 0.9 → β = ${Math.tanh(0.9).toFixed(4)}, γ = ${Math.cosh(0.9).toFixed(4)}; η₁=η₂=1 → β = ${Math.tanh(2).toFixed(4)} (Galilean sum ${(2 * Math.tanh(1)).toFixed(4)})`);
}

// =========================================================== 2+1 D boosts
{
  const G = M.G3;
  check('[B_x,B_y] = −L', mat.almostEqual(mat.comm(M.BX3, M.BY3), mat.scale(M.L3, -1), 1e-15));
  check('[L,B_x] = B_y', mat.almostEqual(mat.comm(M.L3, M.BX3), M.BY3, 1e-15));
  check('[L,B_y] = −B_x', mat.almostEqual(mat.comm(M.L3, M.BY3), mat.scale(M.BX3, -1), 1e-15));
  for (let i = 0; i < 200; i++) {
    const u = randVel(0.98);
    const v = randVel(0.98);
    const Bu = M.boost3(u);
    check('Bᵀ G B = G', mat.almostEqual(mat.chain(mat.transpose(Bu), G, Bu), G, 1e-9));
    check('B(u)e₀ = (γ, γu)', vec.dist(mat.col(Bu, 0), M.fourVelocity(u)) < 1e-9);
    const sp = Math.hypot(...u);
    const eta = Math.atanh(sp);
    const phi = Math.atan2(u[1], u[0]);
    check('B(u) = exp(η n̂·B)', mat.almostEqual(Bu, mat.expm(mat.combo([eta * Math.cos(phi), eta * Math.sin(phi)], [M.BX3, M.BY3])), 1e-8));
    check('boostRapidity3 = boost3', mat.almostEqual(M.boostRapidity3(eta, phi), Bu, 1e-8));
    check('Λ⁻¹ = GΛᵀG', mat.almostEqual(mat.mul(M.lorentzInv3(Bu), Bu), mat.eye(3), 1e-9));

    const c = M.composeBoosts(u, v);
    const w = M.einsteinAdd(u, v);
    check('u⊕v (formula) = velocity of B(u)B(v)e₀', vec.dist(w, c.w) < 1e-9, JSON.stringify({ u, v, w, cw: c.w }));
    check('|u⊕v| < 1', Math.hypot(...w) < 1);
    // R = B(w)^-1 Λ is a pure rotation
    const R = c.R;
    check('R e₀ = e₀', Math.abs(R[0][0] - 1) < 1e-8 && Math.abs(R[1][0]) < 1e-8 && Math.abs(R[2][0]) < 1e-8 && Math.abs(R[0][1]) < 1e-8 && Math.abs(R[0][2]) < 1e-8);
    check('R = rot(ε)', mat.almostEqual(R, M.rot3(c.angle), 1e-8));
    check('Λ = B(w) R', mat.almostEqual(c.L, mat.mul(M.boost3(c.w), M.rot3(c.angle)), 1e-8));
    // closed form
    check('ε (decomposition) = closed form', Math.abs(c.angle - M.wignerAngle(u, v)) < 1e-7, JSON.stringify({ u, v, a: c.angle, b: M.wignerAngle(u, v) }));
    // u⊕v = R(ε)(v⊕u), same magnitude
    const w2 = M.einsteinAdd(v, u);
    check('|u⊕v| = |v⊕u|', close(Math.hypot(...w), Math.hypot(...w2), 1e-9));
    const rw2 = [Math.cos(c.angle) * w2[0] - Math.sin(c.angle) * w2[1], Math.sin(c.angle) * w2[0] + Math.cos(c.angle) * w2[1]];
    check('u⊕v = R(ε)(v⊕u)', vec.dist(rw2, w) < 1e-9);
    // Wigner angle = −(oriented area) of the velocity-space triangle 0, u, u⊕v
    const tri = M.hypTriangle([0, 0], u, w);
    check('ε = −orientation · area(0, u, u⊕v)', Math.abs(c.angle + tri.orientation * tri.area) < 1e-7, JSON.stringify({ u, v, eps: c.angle, area: tri.area, o: tri.orientation }));
    // triangle side lengths are the rapidities |η_u|, |η_v|, |η_w|; angle at u is π − ∠(u,v)
    check('side 0→u = η_u', close(tri.sides[2], Math.atanh(Math.hypot(...u)), 1e-7));
    check('side u→u⊕v = η_v', close(tri.sides[0], Math.atanh(Math.hypot(...v)), 1e-7));
    if (Math.hypot(...u) > 0.05 && Math.hypot(...v) > 0.05) check('angle at u = π − ∠(u,v)', Math.abs(tri.angles[1] - (Math.PI - vec.angle(u, v))) < 1e-6);
    // hyperbolic law of cosines for the angle at the origin
    const [a, b, cc] = tri.sides;
    const cosA = (Math.cosh(b) * Math.cosh(cc) - Math.cosh(a)) / (Math.sinh(b) * Math.sinh(cc));
    if (b > 0.05 && cc > 0.05) check('law of cosines', Math.abs(Math.cos(tri.angles[0]) - cosA) < 1e-7);
  }
  // perpendicular boosts: cos ε = (γu + γv)/(1 + γuγv); classic example 0.8 x̂, 0.8 ŷ
  for (const [s1, s2] of [
    [0.8, 0.8],
    [0.5, 0.9],
    [0.99, 0.3],
  ]) {
    const gu = 1 / Math.sqrt(1 - s1 * s1);
    const gv = 1 / Math.sqrt(1 - s2 * s2);
    const c = M.composeBoosts([s1, 0], [0, s2]);
    check('⊥ boosts: cos ε = (γu+γv)/(1+γuγv)', close(Math.cos(c.angle), (gu + gv) / (1 + gu * gv), 1e-10));
    check('⊥ boosts: x then y turns clockwise (ε < 0)', c.angle < 0);
    check('⊥ boosts: γ_w = γuγv', close(M.gammaOfVel(c.w), gu * gv, 1e-9));
  }
  const ex = M.composeBoosts([0.8, 0], [0, 0.8]);
  info(`B(0.8x̂)B(0.8ŷ): w = (${ex.w.map((x) => x.toFixed(4)).join(', ')}), ε = ${deg(ex.angle)} (expected −28.0725°)`);
  check('example ε = −28.07°', Math.abs((ex.angle * 180) / Math.PI + 28.0725) < 1e-3);
  // small velocities: ε ≈ −½ (u × v)   (BCH with [B_x,B_y] = −L)
  for (const s of [1e-2, 3e-3]) {
    const c = M.composeBoosts([s, 0], [0, s]);
    check('small boosts: ε ≈ −uv/2', Math.abs(c.angle / (-0.5 * s * s) - 1) < 5 * s * s, `${c.angle} vs ${-0.5 * s * s}`);
  }
  // collinear boosts commute: no rotation
  for (let i = 0; i < 10; i++) {
    const u = randVel(0.9);
    const k = rnd(-0.9, 0.9) / Math.max(1e-9, Math.hypot(...u));
    const v = M.clampVel([u[0] * k, u[1] * k], 0.9);
    check('collinear: ε = 0', Math.abs(M.composeBoosts(u, v).angle) < 1e-9);
  }
  // group commutator of small boosts = rotation by −ε² (BCH: e^{εX}e^{εY}e^{−εX}e^{−εY} ≈ e^{ε²[X,Y]})
  {
    const e = 1e-3;
    const C = mat.chain(M.boost3([Math.tanh(e), 0]), M.boost3([0, Math.tanh(e)]), M.boost3([-Math.tanh(e), 0]), M.boost3([0, -Math.tanh(e)]));
    const d = M.decompose3(C);
    check('group commutator ≈ exp(ε²[B_x,B_y]) = rotation by −ε²', Math.abs(d.angle / -(e * e) - 1) < 1e-2 && Math.hypot(...d.w) < 2e-6, `${d.angle}`);
  }
  // degenerate inputs
  check('boost3(0) = 1', mat.almostEqual(M.boost3([0, 0]), mat.eye(3), 1e-15));
  check('boost3(|u|≥1) finite', M.boost3([1.5, 0]).flat().every(Number.isFinite));
  check('wignerAngle(0, v) = 0', Math.abs(M.wignerAngle([0, 0], [0.5, 0.2])) < 1e-12);
}

// =========================================================== geodesics & models
{
  for (let i = 0; i < 40; i++) {
    const a = randVel(0.95);
    const b = randVel(0.95);
    const g = M.geodesic(a, b, 30);
    check('geodesic endpoints', vec.dist(g[0], a) < 1e-9 && vec.dist(g[30], b) < 1e-9);
    // Klein: straight chord
    let maxDev = 0;
    for (const p of g) maxDev = Math.max(maxDev, Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])));
    check('Klein geodesics are straight', maxDev < 1e-9);
    // arc length additivity
    const d = M.hypDistance(a, b);
    check('d(a,m)+d(m,b) = d(a,b)', close(M.hypDistance(a, g[11]) + M.hypDistance(g[11], b), d, 1e-7));
    const p = M.kleinToPoincare(a);
    check('Poincaré ↔ Klein', vec.dist(M.poincareToKlein(p), a) < 1e-12);
    check('Poincaré radius = tanh(η/2)', close(Math.hypot(...p), Math.tanh(Math.atanh(Math.hypot(...a)) / 2), 1e-12));
  }
}

// =========================================================== Thomas precession
{
  for (const beta of [0.1, 0.6, Math.sqrt(3) / 2, 0.95]) {
    const g = 1 / Math.sqrt(1 - beta * beta);
    for (const N of [6, 24, 96]) {
      const t = M.thomasCompose(beta, N);
      const A = M.orbitPolygonArea(beta, N);
      check(`N=${N} boosts: rotation = −area of geodesic N-gon (β=${beta.toFixed(3)})`, Math.abs(t.angle + A) < 1e-8 * Math.max(1, A), `${t.angle} vs ${-A}`);
      check('after one orbit the velocity is back', vec.dist(M.velocityOf(mat.col(t.L, 0)), M.orbitVelocity(beta, 0)) < 1e-9);
    }
    const tN = M.thomasCompose(beta, 6000);
    const expected = -TAU * (g - 1);
    check(`Thomas: rotation per orbit → −2π(γ−1) (β=${beta.toFixed(3)})`, Math.abs(tN.angle / expected - 1) < 1e-5, `${tN.angle} vs ${expected}`);
    check('disk area 2π(γ−1) = limit of N-gon area', Math.abs(M.orbitPolygonArea(beta, 6000) / M.hypDiskArea(beta) - 1) < 1e-5);
    // animation stepper (gyroscope), several orbits
    const gy = M.gyroInit(beta, 0);
    for (let k = 0; k < 600; k++) M.gyroAdvance(gy, beta, (2 * TAU) / 600, TAU / 2000);
    check('gyroscope stepper: two orbits = −4π(γ−1)', Math.abs(gy.angle / (2 * expected) - 1) < 5e-5, `${gy.angle} vs ${2 * expected}`);
    // frame stays a Lorentz matrix
    check('gyro frame is Lorentz', mat.almostEqual(mat.chain(mat.transpose(gy.L), M.G3, gy.L), M.G3, 1e-9));
    info(`Thomas β=${beta.toFixed(3)}: γ=${g.toFixed(4)}, 6000 boosts → ${deg(tN.angle)} per orbit, −2π(γ−1) = ${deg(expected)}; 6 boosts → ${deg(M.thomasCompose(beta, 6).angle)}`);
  }
  // small β: precession angle per orbit ≈ −πβ²  (rate (γ−1)Ω ≈ ½β²Ω: the Thomas half)
  const b = 0.01;
  check('small β: ≈ −πβ²', Math.abs(M.thomasCompose(b, 2000).angle / (-Math.PI * b * b) - 1) < 1e-3);
  // clockwise orbit gives the opposite sense
  {
    let L = M.boost3(M.orbitVelocity(0.6, 0));
    let acc = 0;
    let prev = 0;
    for (let k = 1; k <= 3000; k++) {
      const u = M.orbitVelocity(0.6, (-TAU * k) / 3000);
      const U = M.fourVelocity(u);
      const Up = mat.mulv(M.lorentzInv3(L), U);
      const Mm = mat.mul(L, M.boost3([Up[1] / Up[0], Up[2] / Up[0]]));
      const a = M.decompose3(Mm).angle;
      L = mat.mul(M.boost3(u), M.rot3(a));
      acc += Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
      prev = a;
    }
    check('clockwise orbit: +2π(γ−1)', Math.abs(acc / (TAU * 0.25) - 1) < 1e-5, `${acc}`);
  }
}

// =========================================================== 3+1 D algebra
{
  const { L, B } = M.realGenerators4();
  const { J, K } = M.hermitianGenerators4();
  const eps = (i, j, k) => ((i - j) * (j - k) * (k - i)) / 2;
  const iC = { re: 0, im: 1 };
  const miC = { re: 0, im: -1 };
  const csum = (coef, mats) => cmat.combo(coef, mats);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const e = [0, 1, 2].map((k) => eps(i, j, k));
      check('[J_i,J_j] = iε J_k', cmat.almostEqual(cmat.comm(J[i], J[j]), cmat.scale(csum(e, J), iC), 1e-14));
      check('[J_i,K_j] = iε K_k', cmat.almostEqual(cmat.comm(J[i], K[j]), cmat.scale(csum(e, K), iC), 1e-14));
      check('[K_i,K_j] = −iε J_k', cmat.almostEqual(cmat.comm(K[i], K[j]), cmat.scale(csum(e, J), miC), 1e-14));
      check('[L_i,L_j] = ε L_k', mat.almostEqual(mat.comm(L[i], L[j]), mat.combo(e, L), 1e-14));
      check('[B_i,B_j] = −ε L_k', mat.almostEqual(mat.comm(B[i], B[j]), mat.scale(mat.combo(e, L), -1), 1e-14));
    }
  for (let i = 0; i < 3; i++) {
    check('J_i Hermitian', cmat.almostEqual(cmat.dagger(J[i]), J[i]));
    check('K_i anti-Hermitian (non-compact: no finite unitary rep)', cmat.almostEqual(cmat.dagger(K[i]), cmat.scale(K[i], -1)));
  }
  // exp(−iηK_x) = boost with velocity +tanh η along x
  const eta = 0.83;
  const U = cmat.expm(cmat.scale(K[0], { re: 0, im: -eta }));
  check('exp(−iηK_x) = active boost along +x', cmat.almostEqual(U, cmat.fromReal(M.boost4(Math.tanh(eta), [1, 0, 0])), 1e-10));
  const Rz = cmat.expm(cmat.scale(J[2], { re: 0, im: -0.7 }));
  const Rz3 = expSO3([0, 0, 0.7]);
  check('exp(−iθJ_z) = right-handed rotation', [0, 1, 2].every((a) => [0, 1, 2].every((b) => Math.abs(Rz[1 + a][1 + b].re - Rz3[a][b]) < 1e-12)));
  // Casimirs in the vector rep (½,½): J² − K² = 3, J·K = 0; and the two commuting sl(2) copies
  const sq = (Ms) => Ms.reduce((acc, X) => cmat.add(acc, cmat.mul(X, X)), cmat.zeros(4));
  check('J² − K² = 3 (vector rep)', cmat.almostEqual(cmat.sub(sq(J), sq(K)), cmat.scale(cmat.eye(4), 3), 1e-12));
  const JK = [0, 1, 2].reduce((acc, i) => cmat.add(acc, cmat.mul(J[i], K[i])), cmat.zeros(4));
  check('J·K = 0 (vector rep)', cmat.maxAbs(JK) < 1e-12);
  const Ap = [0, 1, 2].map((i) => cmat.scale(cmat.add(J[i], cmat.scale(K[i], iC)), 0.5));
  const Am = [0, 1, 2].map((i) => cmat.scale(cmat.sub(J[i], cmat.scale(K[i], iC)), 0.5));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const e = [0, 1, 2].map((k) => eps(i, j, k));
      check('N⁺ = (J+iK)/2 closes su(2)', cmat.almostEqual(cmat.comm(Ap[i], Ap[j]), cmat.scale(csum(e, Ap), iC), 1e-13));
      check('N⁻ = (J−iK)/2 closes su(2)', cmat.almostEqual(cmat.comm(Am[i], Am[j]), cmat.scale(csum(e, Am), iC), 1e-13));
      check('[N⁺,N⁻] = 0', cmat.maxAbs(cmat.comm(Ap[i], Am[j])) < 1e-13);
    }
  check('(N⁺)² = (N⁻)² = ¾ → vector = (½,½)', cmat.almostEqual(sq(Ap), cmat.scale(cmat.eye(4), 0.75), 1e-12) && cmat.almostEqual(sq(Am), cmat.scale(cmat.eye(4), 0.75), 1e-12));
  for (let i = 0; i < 30; i++) {
    const Lam = M.lorentz4(randomUnit3(rng).map((x) => x * rnd(0, 3)), randomUnit3(rng).map((x) => x * rnd(0, 2)));
    check('ΛᵀGΛ = G', mat.almostEqual(mat.chain(mat.transpose(Lam), M.G4, Lam), M.G4, 1e-8));
    check('det Λ = 1, Λ⁰₀ ≥ 1', close(mat.det(Lam), 1, 1e-8) && Lam[0][0] >= 1 - 1e-12);
  }
}

// =========================================================== SL(2,C) → SO⁺(1,3), the sky
{
  const randSL = () => cmat.mul(M.slBoost(rnd(0, 2.5), randomUnit3(rng)), M.slRotation(rnd(0, 4 * Math.PI), randomUnit3(rng)));
  for (let i = 0; i < 60; i++) {
    const x = [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)];
    const X = M.toHerm(x);
    check('det X = t² − |x|²', close(M.detHerm(X), x[0] ** 2 - x[1] ** 2 - x[2] ** 2 - x[3] ** 2, 1e-12));
    check('x ↔ X', vec.dist(M.fromHerm(X), x) < 1e-12);
    const A = randSL();
    const Bm = randSL();
    check('det A = 1', cx.eq(cmat.det2(A), { re: 1, im: 0 }, 1e-9));
    const LA = M.lorentzOf(A);
    check('Λ(A)x = AXA†', vec.dist(mat.mulv(LA, x), M.fromHerm(cmat.chain(A, X, cmat.dagger(A)))) < 1e-8);
    check('Λ(A) ∈ SO⁺(1,3)', mat.almostEqual(mat.chain(mat.transpose(LA), M.G4, LA), M.G4, 1e-8) && close(mat.det(LA), 1, 1e-8) && LA[0][0] >= 1);
    check('homomorphism Λ(AB) = Λ(A)Λ(B)', mat.almostEqual(M.lorentzOf(cmat.mul(A, Bm)), mat.mul(LA, M.lorentzOf(Bm)), 1e-7));
    check('2:1  Λ(−A) = Λ(A)', mat.almostEqual(M.lorentzOf(cmat.scale(A, -1)), LA, 1e-10));
    // Möbius action on the sky agrees with the Lorentz action on null rays
    const n = randomUnit3(rng);
    const tdir = M.transformDirection(LA, n);
    const z1 = M.skyZeta(tdir.n);
    const z2 = M.mobiusSky(A, M.skyZeta(n));
    if (Number.isFinite(z1.re) && Math.hypot(z1.re, z1.im) < 1e4) check('sky: Λ on null rays = Möbius ζ ↦ (c+dζ)/(a+bζ)', cx.eq(z1, z2, 1e-7 * Math.max(1, cx.abs(z1))), JSON.stringify({ z1, z2 }));
    check('transformed direction is a unit vector', close(vec.norm(tdir.n), 1, 1e-10));
    check('ζ ↔ n̂', vec.dist(M.zetaToDir(M.skyZeta(n)), n) < 1e-10);
    // circles on the sky stay circles (Penrose–Terrell): transformed points stay coplanar
    const circ = M.skyCircle(randomUnit3(rng), rnd(0.05, 0.8), 24).map((p) => M.transformDirection(LA, p).n);
    const nrm = vec.normalize(vec.cross(vec.sub(circ[6], circ[0]), vec.sub(circ[12], circ[0])));
    const dev = Math.max(...circ.map((p) => Math.abs(vec.dot(vec.sub(p, circ[0]), nrm))));
    check('circles on the sky map to circles', dev < 1e-8, dev);
  }
  // explicit generators
  for (const eta of [0.4, 1.47]) {
    const n = randomUnit3(rng);
    check('Λ(exp(ηn̂·σ/2)) = boost(tanh η, n̂)', mat.almostEqual(M.lorentzOf(M.slBoost(eta, n)), M.boost4(Math.tanh(eta), n), 1e-9));
    const z = { re: rnd(-2, 2), im: rnd(-2, 2) };
    check('z-boost: ζ ↦ e^{−η}ζ', cx.eq(M.mobiusSky(M.slBoost(eta, [0, 0, 1]), z), cx.scale(z, Math.exp(-eta)), 1e-12));
    check('rotation about z: ζ ↦ e^{iφ}ζ', cx.eq(M.mobiusSky(M.slRotation(eta, [0, 0, 1]), z), cx.mul(cx.cis(eta), z), 1e-12));
    check('slBoost(η, ẑ) = diag(e^{η/2}, e^{−η/2})', cx.eq(M.slBoost(eta, [0, 0, 1])[0][0], { re: Math.exp(eta / 2), im: 0 }, 1e-12) && cx.eq(M.slBoost(eta, [0, 0, 1])[1][1], { re: Math.exp(-eta / 2), im: 0 }, 1e-12));
  }
  for (let i = 0; i < 20; i++) {
    const n = randomUnit3(rng);
    const ph = rnd(-7, 7);
    const R = M.lorentzOf(M.slRotation(ph, n));
    const R3 = expSO3(vec.scale(n, ph));
    check('Λ(exp(−iφn̂·σ/2)) = active rotation by φ about n̂', [0, 1, 2].every((a) => [0, 1, 2].every((b) => Math.abs(R[1 + a][1 + b] - R3[a][b]) < 1e-10)) && Math.abs(R[0][0] - 1) < 1e-12);
  }
  check('2π rotation: A = −1, Λ = 1', cmat.almostEqual(M.slRotation(TAU, [0, 1, 0]), cmat.scale(cmat.eye(2), -1), 1e-12) && mat.almostEqual(M.lorentzOf(M.slRotation(TAU, [0, 1, 0])), mat.eye(4), 1e-12));
  // aberration & Doppler for an observer moving along +z
  let ahead = 0;
  let aheadTheory = 0;
  const NS = 4000;
  for (let i = 0; i < NS; i++) {
    const beta = i < 200 ? rnd(0, 0.99) : 0.9;
    const n = randomUnit3(rng);
    const r = M.transformDirection(M.boost4(beta, [0, 0, 1]), n);
    check('cos θ′ = (cos θ + β)/(1 + β cos θ)', close(r.n[2], M.aberrationCos(n[2], beta), 1e-10));
    const g = 1 / Math.sqrt(1 - beta * beta);
    check('D = γ(1 + β cos θ) = 1/(γ(1 − β cos θ′))', close(r.D, g * (1 + beta * n[2]), 1e-10) && close(r.D, M.dopplerObserved(r.n[2], beta), 1e-9));
    check('azimuth unchanged', Math.abs(Math.atan2(r.n[1], r.n[0]) - Math.atan2(n[1], n[0])) < 1e-9 || Math.hypot(n[0], n[1]) < 1e-9);
    if (i >= 200) {
      if (r.n[2] > 0) ahead++;
      if (n[2] > -0.9) aheadTheory++;
    }
  }
  check('stars ahead: cos θ′ > 0 ⇔ cos θ > −β', ahead === aheadTheory);
  info(`sky β=0.9: ${(100 * ahead / (NS - 200)).toFixed(1)}% of a random sky ahead (theory (1+β)/2 = 95%); D ahead = ${Math.exp(Math.atanh(0.9)).toFixed(3)}`);
  // tan(θ′/2) = e^{−η} tan(θ/2)
  const th = 1.1;
  const beta = 0.7;
  const thp = Math.acos(M.aberrationCos(Math.cos(th), beta));
  check('tan(θ′/2) = e^{−η} tan(θ/2)', close(Math.tan(thp / 2), Math.exp(-Math.atanh(beta)) * Math.tan(th / 2), 1e-12));
  // vector field of the boost generator on the sky: v(ζ) = −ζ for M = σ_z/2
  {
    const n = randomUnit3(rng);
    const Mg = cmat.scale(cmat.combo(n, [M.SIG4[1], M.SIG4[2], M.SIG4[3]]), 0.5);
    const z = { re: 0.3, im: -0.7 };
    const h = 1e-6;
    const zp = M.mobiusSky(cmat.expm(cmat.scale(Mg, h)), z);
    const zm = M.mobiusSky(cmat.expm(cmat.scale(Mg, -h)), z);
    const num = cx.scale(cx.sub(zp, zm), 1 / (2 * h));
    check('sky vector field of a generator', cx.eq(num, M.skyField(Mg, z), 1e-6));
    const Mz = cmat.scale(M.SIG4[3], 0.5);
    check('boost generator along z acts as −ζ ∂_ζ', cx.eq(M.skyField(Mz, z), cx.scale(z, -1), 1e-14));
  }
}

// =========================================================== momentum orbits & little groups (2+1 D)
{
  for (let i = 0; i < 100; i++) {
    const p = [rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)];
    const W = M.littleGenerator(p);
    check('W_p p = 0', vec.norm(mat.mulv(W, p)) < 1e-12);
    check('W_p ∈ so(2,1)', mat.almostEqual(mat.add(mat.mul(M.G3, W), mat.transpose(mat.mul(M.G3, W))), mat.zeros(3), 1e-14));
    const m2 = M.mdot3(p, p);
    check('W_p³ = −m² W_p', mat.almostEqual(mat.mul(W, mat.mul(W, W)), mat.scale(W, -m2), 1e-9));
    const s = rnd(-1.5, 1.5);
    check('expSO21 = expm', mat.almostEqual(M.expSO21(W, s), mat.expm(mat.scale(W, s)), 1e-8));
    // equivariance: Λ W_p Λ⁻¹ = W_{Λp}
    const Lam = mat.mul(M.rot3(rnd(0, TAU)), M.boost3(randVel(0.9)));
    check('Λ W_p Λ⁻¹ = W_{Λp} (adjoint orbit = momentum orbit)', mat.almostEqual(mat.chain(Lam, W, M.lorentzInv3(Lam)), M.littleGenerator(mat.mulv(Lam, p)), 1e-9));
  }
  for (const type of M.ORBIT_TYPES) {
    const m = 0.8;
    const pref = M.refMomentum(type, m);
    const m2 = M.mdot3(pref, pref);
    check(`ref momentum type (${type})`, M.classify(pref).type === type);
    const Wr = M.littleGenerator(pref);
    for (const fam of M.littleFlowFamilies(type, m)) {
      for (const t of [-1.3, -0.2, 0.4, 1.7]) {
        if (t < fam.tau[0] || t > fam.tau[1]) continue;
        const q = fam.f(t);
        check(`flow line on orbit (${type})`, close(M.mdot3(q, q), m2, 1e-10));
        const h = 1e-6;
        const dq = vec.scale(vec.sub(fam.f(t + h), fam.f(t - h)), 1 / (2 * h));
        const Wq = mat.mulv(Wr, q);
        if (fam.line) check(`ruling is invariant (${type})`, Math.abs(Wq[0] * dq[2] - Wq[2] * dq[0]) + Math.abs(Wq[1]) < 1e-6);
        else check(`flow line is an integral curve of W, direction ok (${type})`, vec.dist(Wq, vec.scale(dq, fam.dir * fam.rate)) < 1e-6, JSON.stringify({ Wq, dq, dir: fam.dir }));
        check(`q·p constant on flow line (${type})`, close(M.mdot3(q, pref), M.mdot3(fam.f(fam.tau[0] + 0.1 * (fam.tau[1] - fam.tau[0])), pref), 1e-9));
      }
    }
    for (let i = 0; i < 20; i++) {
      const chi = rnd(-1.5, 1.5);
      const phi = rnd(-3, 3);
      const p = M.orbitMomentum(type, m, chi, phi);
      check(`orbitMomentum stays on orbit (${type})`, close(M.mdot3(p, p), m2, 1e-9));
      const back = M.orbitParams(type, m, p);
      check(`orbitParams roundtrip (${type})`, vec.dist(M.orbitMomentum(type, m, back.chi, back.phi), p) < 1e-9);
      // ray hits land on the orbit
      const o = [rnd(-4, 4), rnd(-4, 4), rnd(0, 4)];
      const tgt = [p[1], p[2], p[0]];
      const d = vec.normalize(vec.sub(tgt, o));
      const t = M.rayHitOrbit(o, d, m2, type === 'tachyonic' ? 0 : 1);
      if (t !== null) {
        const hp = vec.add(o, vec.scale(d, t));
        check(`ray hit on orbit (${type})`, close(hp[2] ** 2 - hp[0] ** 2 - hp[1] ** 2, m2, 1e-8));
      }
    }
  }
  const W0 = M.littleGenerator([1, 0, 0]);
  check('rest frame little group = rotations', mat.almostEqual(W0, M.L3));
  check('tachyon (0,μ,0): little group = boosts along y', mat.almostEqual(M.littleGenerator([0, 1, 0]), mat.scale(M.BY3, -1)));
  const Wn = M.littleGenerator([1, 1, 0]);
  check('null momentum: W nilpotent (null rotation)', mat.maxAbs(mat.mul(Wn, mat.mul(Wn, Wn))) < 1e-15 && mat.maxAbs(mat.mul(Wn, Wn)) > 0.5);
  check('classify vacuum', M.classify([0, 0, 0]).type === 'vacuum');
}

console.log(`lorentz tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
