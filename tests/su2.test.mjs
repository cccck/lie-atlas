// Numerical tests for the SU(2) module (node tests/su2.test.mjs).
import {
  CORNERS,
  CUBE_HALF,
  FRAME_SCALE,
  ease,
  diracQuat,
  twistQuat,
  untangleQuat,
  stringQuat,
  cubeAngle,
  stringRest,
  stringPoint,
  trickState,
  su2Coords,
  so3Coords,
  loopQuat,
  loopRotVec,
  otherLift,
  so3FromRotVec,
  perpTo,
  samplePieces,
  larmorU,
  evolve,
  blochAt,
  interferenceIntensity,
  interferenceFromState,
  normalizeSpinor,
} from '../src/modules/su2/math.js';
import { quat, vec, mat, expSO3, TAU, mulberry32, randomUnit3 } from '../src/core/la.js';
import { cx, cmat, sigma, su2FromQuat, so3FromSU2, su2Rotation, blochVector, spinorFromBloch } from '../src/core/complex.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const qClose = (a, b, tol = 1e-9) => a.every((x, i) => close(x, b[i], tol));
const rng = mulberry32(2024);
const grid = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

// ------------------------------------------------------------------ easing
check('s(0)=0', ease(0) === 0);
check('s(1)=1', ease(1) === 1);
{
  let mono = true;
  for (let i = 1; i <= 1000; i++) if (ease(i / 1000) < ease((i - 1) / 1000)) mono = false;
  check('s monotone', mono);
  const h = 1e-6;
  check("s'(0)=0", close((ease(h) - ease(0)) / h, 0, 1e-5));
  check("s'(1)=0", close((ease(1) - ease(1 - h)) / h, 0, 1e-5));
}

// ------------------------------------------------------------------ Dirac's homotopy F(u,t)
let maxNormErr = 0;
for (const u of grid(40))
  for (const t of grid(60)) {
    const F = diracQuat(u, t);
    maxNormErr = Math.max(maxNormErr, Math.abs(quat.norm(F) - 1));
    check('F has no i component', F[1] === 0);
  }
check('|F| = 1', maxNormErr < 1e-14, maxNormErr);
for (const t of grid(100)) {
  check('F(1,t) = cos 2πt + k sin 2πt', qClose(diracQuat(1, t), [Math.cos(TAU * t), 0, 0, Math.sin(TAU * t)], 1e-14));
  check('F(0,t) = 1 (anchors fixed)', qClose(diracQuat(0, t), [1, 0, 0, 0], 1e-15));
  // the cube turns by 4πt about z: rotating a corner equals Rz(4πt)
  const R = quat.toMat3(diracQuat(1, t));
  check('cube rotation = Rz(4πt)', mat.almostEqual(R, expSO3([0, 0, 2 * TAU * t]), 1e-12));
}
for (const u of grid(100)) {
  check('F(u,0) = 1', qClose(diracQuat(u, 0), [1, 0, 0, 0], 1e-15));
  check('F(u,1) = 1 (untangled at the end)', qClose(diracQuat(u, 1), [1, 0, 0, 0], 1e-14));
}
// factorisation F = exp(ρ v(t)) exp(ρ j)
for (let i = 0; i < 200; i++) {
  const u = rng();
  const t = rng();
  const rho = (Math.PI / 2) * ease(u);
  const v = [Math.sin(TAU * t) * Math.sin(rho), -Math.cos(TAU * t), Math.sin(TAU * t) * Math.cos(rho)];
  const lhs = quat.mul(quat.exp(vec.scale(v, rho)), quat.exp([0, rho, 0]));
  check('F = exp(ρv) exp(ρj)', qClose(lhs, diracQuat(u, t), 1e-13));
}
// continuity (Lipschitz bound on a fine grid)
{
  let maxJump = 0;
  const N = 400;
  for (let i = 0; i <= N; i++)
    for (let j = 1; j <= N; j++) {
      const u = i / N;
      maxJump = Math.max(maxJump, quat.norm(quat.neg(diracQuat(u, (j - 1) / N)).map((x, k) => x + diracQuat(u, j / N)[k])));
      maxJump = Math.max(maxJump, quat.norm(quat.neg(diracQuat((j - 1) / N, u)).map((x, k) => x + diracQuat(j / N, u)[k])));
    }
  check('F continuous (max step on 400² grid < 0.03)', maxJump < 0.03, maxJump);
}

// ------------------------------------------------------------------ strings never intersect
function minStringDistance(mode, t, nU = 64) {
  const pts = CORNERS.map((c) => grid(nU).map((u) => stringPoint(mode, c, u, t)));
  let dmin = Infinity;
  for (let a = 0; a < pts.length; a++)
    for (let b = a + 1; b < pts.length; b++)
      for (const p of pts[a]) for (const q of pts[b]) dmin = Math.min(dmin, vec.dist(p, q));
  return dmin;
}
{
  // Exact argument: points at equal radius have equal u, hence the same rotation, so they keep their distance;
  // points at different radii are distinct. Numerically: the clearance between different strings never
  // drops below 0.1 (strings at different radii pass each other), i.e. the drawn tubes (radius ≤ 0.03) never touch.
  const d0 = minStringDistance('4pi', 0);
  check('initial clearance = 0.8 (neighbouring corners)', close(d0, 2 * CUBE_HALF, 1e-12), d0);
  for (const mode of ['4pi', '2pi', 'untangle']) {
    let worst = Infinity;
    for (const t of grid(50)) worst = Math.min(worst, minStringDistance(mode, t, 48));
    check(`${mode}: strings never intersect (clearance ${worst.toFixed(3)} > 0.1)`, worst > 0.1, worst);
  }
  // equal radius ⇔ equal u (same shell), and the shell rotates rigidly
  for (let i = 0; i < 100; i++) {
    const u = rng();
    const t = rng();
    const a = CORNERS[i % 8];
    const b = CORNERS[(i * 3 + 1) % 8];
    const pa = stringPoint('4pi', a, u, t);
    const pb = stringPoint('4pi', b, u, t);
    check('shell rotates rigidly', close(vec.dist(pa, pb), vec.dist(stringRest(a, u), stringRest(b, u)), 1e-12));
    check('radius preserved', close(vec.norm(pa), vec.norm(stringRest(a, u)), 1e-12));
  }
  // strings stay outside the cube's circumscribed sphere (so they never pass through the cube)
  let rmin = Infinity;
  for (const t of grid(40)) for (const c of CORNERS) for (const u of grid(50)) rmin = Math.min(rmin, vec.norm(stringPoint('4pi', c, u, t)));
  check('strings outside the cube', rmin >= CUBE_HALF * Math.sqrt(3) - 1e-12, rmin);
  // the string ends: anchor at FRAME_SCALE·corner, the other end on the rotated cube corner
  for (const t of grid(20))
    for (const c of CORNERS) {
      check('anchor fixed', vec.dist(stringPoint('4pi', c, 0, t), vec.scale(c, FRAME_SCALE)) < 1e-12);
      const corner = mat.mulv(expSO3([0, 0, cubeAngle('4pi', t)]), c);
      check('string ends on the cube corner', vec.dist(stringPoint('4pi', c, 1, t), corner) < 1e-12);
    }
}

// ------------------------------------------------------------------ 2π twist vs 4π
{
  // 2π mode: the cube returns (R = 1) but its SU(2) path ends at −1; strings remain twisted (u ↦ F2(u,1) ≠ const)
  const qc = twistQuat(1, 1, 1);
  check('2π: cube lift ends at −1', qClose(qc, [-1, 0, 0, 0], 1e-14));
  check('2π: R(cube) = 1', mat.almostEqual(quat.toMat3(qc), mat.eye(3), 1e-14));
  check('2π: strings still twisted (mid-string turned by π)', qClose(twistQuat(0.5, 1, 1), [0, 0, 0, 1], 1e-14));
  check('trickState 2π end twisted', trickState('2pi', 1).state === 'twisted');
  check('trickState 4π end untangled', trickState('4pi', 1).state === 'untangled');
  check('cube angle 2π mode', close(cubeAngle('2pi', 1), TAU));
  check('cube angle 4π mode', close(cubeAngle('4pi', 1), 2 * TAU));
  check('cube angle untangle mode', close(cubeAngle('untangle', 0.5), 2 * TAU) && close(cubeAngle('untangle', 0.9), 2 * TAU));
  // cube quaternion in every mode matches (cos θ/2, 0, 0, sin θ/2)
  for (const mode of ['2pi', '4pi', 'untangle'])
    for (const t of grid(50)) {
      const th = cubeAngle(mode, t);
      check(`cube q matches θ (${mode})`, qClose(stringQuat(mode, 1, t), [Math.cos(th / 2), 0, 0, Math.sin(th / 2)], 1e-12));
      check(`anchors fixed (${mode})`, qClose(stringQuat(mode, 0, t), [1, 0, 0, 0], 1e-14));
    }
  // untangle mode: continuous at t = ½ (doubly twisted), untangled at t = 1, cube fixed during the second phase
  for (const u of grid(50)) {
    check('untangle continuous at ½', qClose(stringQuat('untangle', u, 0.5 - 1e-9), stringQuat('untangle', u, 0.5 + 1e-9), 1e-6));
    check('untangle H(u,0) = 4π twist', qClose(untangleQuat(u, 0), twistQuat(u, 1, 2), 1e-13));
    check('untangle ends untangled', qClose(stringQuat('untangle', u, 1), [1, 0, 0, 0], 1e-13));
  }
  for (const t of grid(20)) check('untangle: cube held fixed', qClose(untangleQuat(1, t), [1, 0, 0, 0], 1e-13));
}

// ------------------------------------------------------------------ SU(2) → SO(3)
for (let i = 0; i < 300; i++) {
  const n = randomUnit3(rng);
  const a = 2 * TAU * rng();
  const q = quat.fromAxisAngle(n, a);
  const w = su2Coords(q);
  check('su2 coords in 2π-ball', vec.norm(w) <= TAU + 1e-12);
  check('su2 coords invert', qClose(quat.fromRotVec(w), q, 1e-9) || vec.norm(w) > TAU - 1e-9);
  const wm = su2Coords(quat.neg(q));
  check('two lifts: |ω(q)| + |ω(−q)| = 2π', close(vec.norm(w) + vec.norm(wm), TAU, 1e-9));
  if (vec.norm(w) > 1e-6 && vec.norm(wm) > 1e-6) check('two lifts on opposite sides', close(vec.dot(vec.normalize(w), vec.normalize(wm)), -1, 1e-9));
  const s = so3Coords(q);
  check('so3 coords in π-ball', vec.norm(s) <= Math.PI + 1e-12);
  check('so3 coords give R(q)', mat.almostEqual(expSO3(s), quat.toMat3(q), 1e-9));
  check('R(q) = R(−q)', mat.almostEqual(quat.toMat3(q), quat.toMat3(quat.neg(q)), 1e-12));
  // R_ij = ½ tr(σ_i U σ_j U†) is the same map
  check('adjoint map = quat.toMat3', mat.almostEqual(so3FromSU2(su2FromQuat(q)), quat.toMat3(q), 1e-12));
}
// homomorphism and kernel {±1}
for (let i = 0; i < 100; i++) {
  const a = quat.fromRotVec(vec.scale(randomUnit3(rng), 2 * TAU * rng()));
  const b = quat.fromRotVec(vec.scale(randomUnit3(rng), 2 * TAU * rng()));
  const Ra = so3FromSU2(su2FromQuat(a));
  const Rb = so3FromSU2(su2FromQuat(b));
  check('R(UV) = R(U)R(V)', mat.almostEqual(so3FromSU2(su2FromQuat(quat.mul(a, b))), mat.mul(Ra, Rb), 1e-11));
}
check('kernel: R(−1) = 1', mat.almostEqual(so3FromSU2(su2FromQuat([-1, 0, 0, 0])), mat.eye(3), 1e-14));
// boundary sphere of the 2π-ball is the single element −1
for (let i = 0; i < 20; i++) check('|ω| = 2π ↦ −1', qClose(quat.fromRotVec(vec.scale(randomUnit3(rng), TAU)), [-1, 0, 0, 0], 1e-12));
// the 4π loop re-enters from the −n side after 2π
{
  const n = vec.normalize([0.3, -0.5, 0.8]);
  const w = su2Coords(quat.fromAxisAngle(n, 2.5 * Math.PI));
  check('after 2π the SU(2) point re-enters along −n', close(vec.dot(vec.normalize(w), n), -1, 1e-12) && close(vec.norm(w), 1.5 * Math.PI, 1e-12));
}

// loops: closedness, continuity, homotopy endpoints
{
  const n = vec.normalize([0.2, 0.4, 0.9]);
  const qDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
  check('2π loop open in SU(2)', qClose(loopQuat('2pi', n, 1), [-1, 0, 0, 0], 1e-12));
  check('2π loop closed in SO(3)', mat.almostEqual(quat.toMat3(loopQuat('2pi', n, 1)), mat.eye(3), 1e-12));
  let maxStep = 0;
  for (const h of grid(200)) {
    const hh = 2 * h;
    check('4π family closed: L_h(0) = 1', qClose(loopQuat('4pi', n, 0, hh), [1, 0, 0, 0], 1e-12));
    check('4π family closed: L_h(1) = 1', qClose(loopQuat('4pi', n, 1, hh), [1, 0, 0, 0], 1e-12));
    for (let i = 1; i <= 400; i++) maxStep = Math.max(maxStep, qDist(loopQuat('4pi', n, i / 400, hh), loopQuat('4pi', n, (i - 1) / 400, hh)));
  }
  check('loops continuous in λ', maxStep < 0.04, maxStep);
  let maxH = 0;
  for (let i = 0; i <= 200; i++)
    for (let j = 1; j <= 400; j++) maxH = Math.max(maxH, qDist(loopQuat('4pi', n, i / 200, (2 * j) / 400), loopQuat('4pi', n, i / 200, (2 * (j - 1)) / 400)));
  check('homotopy continuous in h', maxH < 0.05, maxH);
  for (const l of grid(50)) {
    check('h = 0 is the 4π rotation', qClose(loopQuat('4pi', n, l, 0), quat.fromAxisAngle(n, 2 * TAU * l), 1e-12));
    check('h = 2 is the constant loop', qClose(loopQuat('4pi', n, l, 2), [1, 0, 0, 0], 1e-12));
  }
  // boundary crossings in the SO(3) π-ball: odd for the 2π loop (non-contractible), even along the whole 4π family
  const so3Jumps = (f) => samplePieces(f, so3Coords, 2000, Math.PI).jumps;
  check('2π loop crosses the SO(3) boundary once', so3Jumps((l) => loopQuat('2pi', n, l)) === 1);
  check('4π loop crosses it twice', so3Jumps((l) => loopQuat('4pi', n, l, 0)) === 2);
  let parityOK = true;
  for (const h of [0.1, 0.3, 0.5, 0.7, 0.9, 0.97, 1.2, 1.4, 1.6, 1.8, 1.99]) if (so3Jumps((l) => loopQuat('4pi', n, l, h)) % 2 !== 0) parityOK = false;
  check('crossing number even along the contraction', parityOK);
  check('crossings annihilated once r < π', so3Jumps((l) => loopQuat('4pi', n, l, 1.6)) === 0);
  // exact coordinates used for drawing agree with the quaternion loops
  const p = perpTo(n);
  for (const kind of ['2pi', '4pi'])
    for (const h of [0, 0.25, 0.5, 0.75, 1, 1.3, 1.5, 1.8, 2])
      for (const l of grid(64)) {
        const w = loopRotVec(kind, n, l, h, p);
        const q = loopQuat(kind, n, l, h, p);
        check('loopRotVec within the 2π-ball', vec.norm(w) <= TAU + 1e-12);
        check('fromRotVec(loopRotVec) = loopQuat', qClose(quat.fromRotVec(w), q, 1e-12));
        const wo = otherLift(w, n);
        check('other lift = −q', qClose(quat.fromRotVec(wo), quat.neg(q), 1e-12));
        const s = so3FromRotVec(w);
        check('so3FromRotVec in the π-ball', vec.norm(s) <= Math.PI + 1e-12);
        check('so3FromRotVec gives R(q)', mat.almostEqual(expSO3(s), quat.toMat3(q), 1e-12));
      }
  // exit and re-entry points of the 4π loop: +2πn and −2πn (h = 0), both the element −1
  check('4π loop exits at +2πn', vec.dist(loopRotVec('4pi', n, 0.5, 0), vec.scale(n, TAU)) < 1e-12);
  check('4π loop re-enters at −2πn', vec.dist(loopRotVec('4pi', n, 0.5 + 1e-12, 0), vec.scale(n, -TAU)) < 1e-9);
  check('after sliding (h = 1) it re-enters at +2πn', vec.dist(loopRotVec('4pi', n, 0.5 + 1e-12, 1, p), vec.scale(n, TAU)) < 1e-9);
  check('SO(3) crossings from exact coords: 2π loop', samplePieces((l) => so3FromRotVec(loopRotVec('2pi', n, l)), null, 2000, Math.PI).jumps === 1);
  check('SO(3) crossings from exact coords: 4π loop', samplePieces((l) => so3FromRotVec(loopRotVec('4pi', n, l)), null, 2000, Math.PI).jumps === 2);
}

// ------------------------------------------------------------------ spin in a magnetic field
// Pauli algebra: [σ_i/2, σ_j/2] = i ε_ijk σ_k/2
{
  const eps = (i, j, k) => ((i - j) * (j - k) * (k - i)) / 2;
  const half = sigma.map((s) => cmat.scale(s, 0.5));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let rhs = cmat.zeros(2);
      for (let k = 0; k < 3; k++) rhs = cmat.add(rhs, cmat.scale(half[k], { re: 0, im: eps(i, j, k) }));
      check(`[σ${i}/2, σ${j}/2] = iε σ/2`, cmat.almostEqual(cmat.comm(half[i], half[j]), rhs, 1e-15));
    }
}
for (let i = 0; i < 100; i++) {
  const B = randomUnit3(rng);
  const psi = spinorFromBloch(Math.PI * rng(), TAU * rng());
  check('U(2π) = −1', cmat.almostEqual(larmorU(B, TAU), cmat.scale(cmat.eye(2), -1), 1e-12));
  check('U(4π) = +1', cmat.almostEqual(larmorU(B, 2 * TAU), cmat.eye(2), 1e-12));
  const p2 = evolve(psi, B, TAU);
  check('ψ → −ψ after one precession', cx.eq(p2[0], cx.neg(psi[0]), 1e-12) && cx.eq(p2[1], cx.neg(psi[1]), 1e-12));
  check('Bloch vector back after one precession', vec.dist(blochAt(psi, B, TAU), blochVector(psi)) < 1e-12);
  const phi = TAU * rng();
  check('Bloch vector precesses: n(φ) = R(φ,B) n(0)', vec.dist(blochAt(psi, B, phi), mat.mulv(expSO3(vec.scale(B, phi)), blochVector(psi))) < 1e-12);
  // dn/dφ = B × n (right-handed precession about B for U = exp(−iφ B·σ/2))
  const h = 1e-6;
  const dn = vec.scale(vec.sub(blochAt(psi, B, phi + h), blochAt(psi, B, phi - h)), 1 / (2 * h));
  check('dn/dφ = B × n', vec.dist(dn, vec.cross(B, blochAt(psi, B, phi))) < 1e-8);
  // U = exp(−iφ B·σ/2) exactly
  const U = larmorU(B, phi);
  const Uexp = cmat.expm(cmat.scale(cmat.combo(B, sigma), { re: 0, im: -phi / 2 }));
  check('U = exp(−iφB·σ/2)', cmat.almostEqual(U, Uexp, 1e-10));
  // interference: independent of state and field direction, period 4π
  const a = 3 * TAU * rng();
  check('I(a) = (1 + cos a/2)/2', close(interferenceFromState(psi, B, a), interferenceIntensity(a), 1e-12));
  check('I has period 4π', close(interferenceIntensity(a + 2 * TAU), interferenceIntensity(a), 1e-12));
  check('I(a + 2π) = 1 − I(a)', close(interferenceIntensity(a + TAU), 1 - interferenceIntensity(a), 1e-12));
}
check('I(0) = 1, I(2π) = 0', close(interferenceIntensity(0), 1) && close(interferenceIntensity(TAU), 0, 1e-15));
check('normalizeSpinor(0) = null', normalizeSpinor([cx.of(0), cx.of(0)]) === null);
{
  const p = normalizeSpinor([cx.of(3), { re: 0, im: 4 }]);
  check('normalizeSpinor', close(cx.abs2(p[0]) + cx.abs2(p[1]), 1, 1e-15));
}
// su2Rotation(z, θ) = diag(e^{−iθ/2}, e^{iθ/2})
{
  const th = 1.234;
  const U = su2Rotation([0, 0, 1], th);
  check('U_z(θ) diagonal phases', cx.eq(U[0][0], cx.cis(-th / 2), 1e-14) && cx.eq(U[1][1], cx.cis(th / 2), 1e-14));
}

console.log(`su2 tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
