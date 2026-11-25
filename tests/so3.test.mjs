#!/usr/bin/env node
// Numerical tests for the SO(3) module maths (src/modules/so3/math.js).  Run: node tests/so3.test.mjs
import {
  PI, I3, E, levi, J, Lreal, nDotJ, rodrigues, rotateVec, traceOf, qAxisAngle, rotVec, ballPath, subgroupQ, perpTo,
  loop4pi, loop2pi, bracket, commutatorLoop, CONV, gimbalFrames, eulerToR, eulerAxes, eulerJacobian, eulerDet,
  eulerFromR, liftEuler, flyPast, weakestDirection, unwrapTo,
} from '../src/modules/so3/math.js';
import { mat, vec, quat, hat, vee, expSO3, logSO3, rotX, rotY, rotZ, mulberry32, randomUnit3, randn, TAU } from '../src/core/la.js';
import { cx, cmat, sigma, su2Rotation, spinMatrices } from '../src/core/complex.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(name);
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const rng = mulberry32(2024);
const cI = { re: 0, im: 1 };
const deg = (d) => (d * PI) / 180;

// ------------------------------------------------------------ generators
for (let k = 0; k < 3; k++) {
  check(`J_${k} Hermitian`, cmat.almostEqual(J[k], cmat.dagger(J[k]), 1e-15));
  check(`L_${k} = −i J_${k}`, mat.almostEqual(Lreal[k], cmat.re(cmat.scale(J[k], { re: 0, im: -1 })), 1e-15));
  check(`L_${k} antisymmetric real`, mat.almostEqual(Lreal[k], mat.scale(mat.transpose(Lreal[k]), -1), 1e-15));
}
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 3; j++) {
    const lhs = cmat.comm(J[i], J[j]);
    let rhs = cmat.zeros(3);
    for (let k = 0; k < 3; k++) rhs = cmat.add(rhs, cmat.scale(J[k], { re: 0, im: levi(i, j, k) }));
    check(`[J_${i},J_${j}] = i eps J`, cmat.almostEqual(lhs, rhs, 1e-14));
    const lr = mat.comm(Lreal[i], Lreal[j]);
    const rr = mat.combo([0, 1, 2].map((k) => levi(i, j, k)), Lreal);
    check(`[L_${i},L_${j}] = eps L`, mat.almostEqual(lr, rr, 1e-14));
  }
// Casimir J² = j(j+1) = 2 for the vector (spin-1) representation
{
  let J2 = cmat.zeros(3);
  for (let k = 0; k < 3; k++) J2 = cmat.add(J2, cmat.mul(J[k], J[k]));
  check('Casimir J^2 = 2·1', cmat.almostEqual(J2, cmat.scale(cmat.eye(3), 2), 1e-14));
}
// n·J = i hat(n); eigenvalues {1, 0, −1}: (n·J)^3 = n·J, tr = 0, tr (n·J)^2 = 2; n is the m = 0 eigenvector
for (let r = 0; r < 20; r++) {
  const n = randomUnit3(rng);
  const nJ = nDotJ(n);
  check('n·J = i hat(n)', cmat.almostEqual(nJ, cmat.scale(cmat.fromReal(hat(n)), cI), 1e-14));
  check('(n·J)^3 = n·J', cmat.almostEqual(cmat.chain(nJ, nJ, nJ), nJ, 1e-13));
  check('tr n·J = 0', cx.eq(cmat.trace(nJ), { re: 0, im: 0 }, 1e-14));
  check('tr (n·J)^2 = 2', cx.eq(cmat.trace(cmat.mul(nJ, nJ)), { re: 2, im: 0 }, 1e-13));
  const nv = cmat.apply(nJ, n.map((x) => ({ re: x, im: 0 })));
  check('(n·J) n = 0', nv.every((z) => Math.hypot(z.re, z.im) < 1e-14));
}
// Cartesian J_k are the standard spin-1 matrices in the spherical basis e_{±1} = ∓(e_x ± i e_y)/√2, e_0 = e_z
{
  const s = 1 / Math.sqrt(2);
  const ep = [{ re: -s, im: 0 }, { re: 0, im: -s }, { re: 0, im: 0 }];
  const e0 = [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }];
  const em = [{ re: s, im: 0 }, { re: 0, im: -s }, { re: 0, im: 0 }];
  const U = [0, 1, 2].map((i) => [ep[i], e0[i], em[i]]);
  check('spherical basis unitary', cmat.almostEqual(cmat.mul(cmat.dagger(U), U), cmat.eye(3), 1e-14));
  const S1 = spinMatrices(1);
  const std = [cmat.fromReal(S1.Jx), S1.Jy, cmat.fromReal(S1.Jz)];
  for (let k = 0; k < 3; k++) check(`U† J_${k} U = spin-1 J_${k} (Condon–Shortley)`, cmat.almostEqual(cmat.chain(cmat.dagger(U), J[k], U), std[k], 1e-14));
}

// ------------------------------------------------------------ Rodrigues & exponential map
for (let r = 0; r < 60; r++) {
  const n = randomUnit3(rng);
  const th = (r < 10 ? 1e-6 : 4 * PI) * rng();
  const R = rodrigues(n, th);
  check('Rodrigues = expSO3', mat.almostEqual(R, expSO3(vec.scale(n, th)), 1e-12));
  const U = cmat.expm(cmat.scale(nDotJ(n), { re: 0, im: -th }));
  check('Rodrigues = exp(−iθ n·J) (real)', mat.almostEqual(cmat.re(U), R, 1e-10) && mat.maxAbs(cmat.im(U)) < 1e-10);
  check('R orthogonal', mat.almostEqual(mat.mul(R, mat.transpose(R)), I3, 1e-12));
  check('det R = 1', close(mat.det(R), 1, 1e-12));
  check('tr R = 1 + 2 cos θ', close(traceOf(R), 1 + 2 * Math.cos(th), 1e-12));
  check('R n = n', vec.dist(mat.mulv(R, n), n) < 1e-12);
  const v = randomUnit3(rng);
  check('rotateVec = R v', vec.dist(rotateVec(n, th, v), mat.mulv(R, v)) < 1e-12);
  check('R(θ+2π) = R(θ)', mat.almostEqual(rodrigues(n, th + TAU), R, 1e-12));
  check('R(θ, −n) = R(−θ, n)', mat.almostEqual(rodrigues(vec.neg(n), th), rodrigues(n, -th), 1e-12));
  // infinitesimal rotation is a cross product: (−iε n·J) v = ε n × v
  const Kv = cmat.apply(cmat.scale(nDotJ(n), { re: 0, im: -1 }), v.map((x) => ({ re: x, im: 0 })));
  check('−i(n·J) v = n × v', vec.dist(Kv.map((z) => z.re), vec.cross(n, v)) < 1e-14 && Kv.every((z) => Math.abs(z.im) < 1e-14));
  // adjoint action R (n·J) R^{-1} = (R n)·J
  const m = randomUnit3(rng);
  const Rc = cmat.fromReal(R);
  check('Ad: R (m·J) Rᵀ = (R m)·J', cmat.almostEqual(cmat.chain(Rc, nDotJ(m), cmat.fromReal(mat.transpose(R))), nDotJ(mat.mulv(R, m)), 1e-12));
  // conjugation: R R(φ, m) R^{-1} = R(φ, R m)
  const phi = TAU * rng();
  check('R R(φ,m) R⁻¹ = R(φ, Rm)', mat.almostEqual(mat.chain(R, rodrigues(m, phi), mat.transpose(R)), rodrigues(mat.mulv(R, m), phi), 1e-12));
}
// right-handedness: R(π/2, z) e_x = e_y
check('active right-handed: R_z(90°) e_x = e_y', vec.dist(mat.mulv(rodrigues([0, 0, 1], PI / 2), E[0]), E[1]) < 1e-15);
// antipodes: R(π, n) = R(π, −n)
for (let r = 0; r < 10; r++) {
  const n = randomUnit3(rng);
  check('R(π, n) = R(π, −n)', mat.almostEqual(rodrigues(n, PI), rodrigues(vec.neg(n), PI), 1e-12));
  check('R(π, n) symmetric (an involution)', mat.almostEqual(rodrigues(n, PI), mat.transpose(rodrigues(n, PI)), 1e-12));
  const q1 = qAxisAngle(n, PI);
  const q2 = qAxisAngle(vec.neg(n), PI);
  check('q(π, n) = −q(π, −n) in SU(2)', q1.every((x, i) => close(x, -q2[i], 1e-12)));
}
// (1,1,1) by 2π/3 cyclically permutes the axes: e_x → e_y → e_z → e_x
{
  const R = rodrigues([1, 1, 1], (2 * PI) / 3);
  check('(1,1,1),120°: e_x → e_y', vec.dist(mat.mulv(R, E[0]), E[1]) < 1e-14);
  check('(1,1,1),120°: e_y → e_z', vec.dist(mat.mulv(R, E[1]), E[2]) < 1e-14);
  check('(1,1,1),120°: e_z → e_x', vec.dist(mat.mulv(R, E[2]), E[0]) < 1e-14);
  check('(1,1,1),120°: tr R = 0', close(traceOf(R), 0, 1e-14));
}
// quaternion conventions
for (let r = 0; r < 30; r++) {
  const n = randomUnit3(rng);
  const th = 4 * PI * rng();
  const q = qAxisAngle(n, th);
  check('quat ↔ Rodrigues', mat.almostEqual(quat.toMat3(q), rodrigues(n, th), 1e-12));
  const q2 = qAxisAngle(n, th + TAU);
  check('q(θ + 2π) = −q(θ)', q.every((x, i) => close(x, -q2[i], 1e-12)));
  // rotVec is the principal logarithm
  const R = quat.toMat3(q);
  const w = rotVec(q);
  check('rotVec |ω| ≤ π', vec.norm(w) <= PI + 1e-12);
  check('exp(rotVec) = R', mat.almostEqual(expSO3(w), R, 1e-10));
  check('rotVec(q) = rotVec(−q)', vec.dist(rotVec(q), rotVec(quat.neg(q))) < 1e-12);
  if (vec.norm(logSO3(R)) < PI - 1e-6) check('rotVec = logSO3', vec.dist(w, logSO3(R)) < 1e-9);
}
// vector operators: U† σ_i U = R_ij σ_j (finite form of [J_i, V_j] = i ε_ijk V_k) for spin ½, J = σ/2
for (let r = 0; r < 10; r++) {
  const n = randomUnit3(rng);
  const th = TAU * rng();
  const U = su2Rotation(n, th);
  const R = rodrigues(n, th);
  for (let i = 0; i < 3; i++) {
    const lhs = cmat.chain(cmat.dagger(U), sigma[i], U);
    const rhs = cmat.combo(R[i], sigma);
    check('U† σ_i U = R_ij σ_j', cmat.almostEqual(lhs, rhs, 1e-12));
  }
}
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 3; j++) {
    const lhs = cmat.comm(cmat.scale(sigma[i], 0.5), sigma[j]);
    let rhs = cmat.zeros(2);
    for (let k = 0; k < 3; k++) rhs = cmat.add(rhs, cmat.scale(sigma[k], { re: 0, im: levi(i, j, k) }));
    check('[σ_i/2, σ_j] = i ε_ijk σ_k', cmat.almostEqual(lhs, rhs, 1e-14));
  }
// orbital angular momentum: [L_i, x_j] = i ε_ijk x_k with L = r × p, p = −i∇ (finite differences on a test function)
{
  const f = ([x, y, z]) => Math.exp(0.3 * x - 0.2 * y * y + 0.5 * Math.sin(z)) + x * y * z;
  const h = 1e-4;
  // G_i[g](r) = ε_ilm x_l ∂_m g  (so that L_i g = −i G_i[g])
  const G = (i, g, r) => {
    let s = 0;
    for (let l = 0; l < 3; l++)
      for (let m = 0; m < 3; m++) {
        const e = levi(i, l, m);
        if (!e) continue;
        const rp = r.slice();
        const rm = r.slice();
        rp[m] += h;
        rm[m] -= h;
        s += e * r[l] * (g(rp) - g(rm)) / (2 * h);
      }
    return s;
  };
  for (let t = 0; t < 5; t++) {
    const r0 = [randn(rng), randn(rng), randn(rng)];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        // [L_i, x_j] f = −i (G_i[x_j f] − x_j G_i[f]); expected i ε_ijk x_k f  ⇒  G_i[x_j f] − x_j G_i[f] = −ε_ijk x_k f
        const lhs = G(i, (r) => r[j] * f(r), r0) - r0[j] * G(i, f, r0);
        let rhs = 0;
        for (let k = 0; k < 3; k++) rhs -= levi(i, j, k) * r0[k] * f(r0);
        check(`[L_${i}, x_${j}] = i ε x`, Math.abs(lhs - rhs) < 1e-6 * (1 + Math.abs(rhs)), `${lhs} vs ${rhs}`);
      }
  }
}
// Killing form B(a, b) = tr(ad_a ad_b) = −2 a·b (negative definite ⇒ compact)
for (let r = 0; r < 10; r++) {
  const a = randomUnit3(rng).map((x) => x * 2 * rng());
  const b = randomUnit3(rng).map((x) => x * 2 * rng());
  check('Killing form = −2 a·b', close(mat.trace(mat.mul(hat(a), hat(b))), -2 * vec.dot(a, b), 1e-12));
  // bracket ↔ cross product, Jacobi identity
  check('[hat a, hat b] = hat(a×b)', mat.almostEqual(mat.comm(hat(a), hat(b)), hat(bracket(a, b)), 1e-12));
  const lhs = cmat.comm(nDotJ(a), nDotJ(b));
  check('[a·J, b·J] = i (a×b)·J', cmat.almostEqual(lhs, cmat.scale(nDotJ(vec.cross(a, b)), cI), 1e-12));
  const c = randomUnit3(rng);
  const jac = vec.add(vec.add(vec.cross(a, vec.cross(b, c)), vec.cross(b, vec.cross(c, a))), vec.cross(c, vec.cross(a, b)));
  check('Jacobi identity', vec.norm(jac) < 1e-12);
}
// Haar measure: uniformly random rotations (uniform unit quaternions) have mean angle π/2 + 2/π
{
  let s = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const q = quat.normalize([randn(rng), randn(rng), randn(rng), randn(rng)]);
    s += 2 * Math.acos(Math.min(1, Math.abs(q[0])));
  }
  const mean = s / N;
  check('Haar: mean rotation angle = π/2 + 2/π', Math.abs(mean - (PI / 2 + 2 / PI)) < 0.006, `${mean} vs ${PI / 2 + 2 / PI}`);
}

// ------------------------------------------------------------ π-ball paths and loops
const countJumps = (qf, n = 400) => ballPath(qf, 0, 1, n).jumps.length;
for (let r = 0; r < 8; r++) {
  const n = randomUnit3(rng);
  check('subgroup θ < π: no jump', countJumps(subgroupQ(n, PI - 0.01)) === 0);
  check('subgroup θ = 1.5π: 1 jump', countJumps(subgroupQ(n, 1.5 * PI)) === 1);
  check('subgroup θ = 2π: 1 jump', countJumps(subgroupQ(n, TAU)) === 1);
  check('subgroup θ = 3.5π: 2 jumps', countJumps(subgroupQ(n, 3.5 * PI)) === 2);
  check('subgroup θ = 4π: 2 jumps', countJumps(subgroupQ(n, 2 * TAU)) === 2);
  const bp = ballPath(subgroupQ(n, TAU), 0, 1, 200);
  const jmp = bp.jumps[0];
  check('2π loop exits at +πn', vec.dist(jmp.exit, vec.scale(n, PI)) < 1e-6);
  check('… re-enters at −πn', vec.dist(jmp.entry, vec.scale(n, -PI)) < 1e-6);
  check('2π loop ends at q = −1', close(bp.qEnd[0], -1, 1e-12));
  // all sampled points lie in the closed π-ball and represent the right rotations
  const pts = bp.segments.flat();
  check('path inside π-ball', pts.every((w) => vec.norm(w) <= PI + 1e-9));
  const p = perpTo(n);
  check('perpTo ⊥ unit', close(vec.dot(p, n), 0, 1e-12) && close(vec.norm(p), 1, 1e-12));
  for (const s of [0, 0.15, 0.3, 0.45]) {
    const qf = loop4pi(n, p, s);
    check(`4π family s=${s}: 2 jumps`, countJumps(qf) === 2, String(countJumps(qf)));
    check(`4π family s=${s}: loop at identity`, close(qf(0)[0], 1, 1e-12) && close(qf(1)[0], 1, 1e-12));
  }
  for (const s of [0.55, 0.7, 0.85, 1]) check(`4π family s=${s}: 0 jumps`, countJumps(loop4pi(n, p, s)) === 0);
  check('4π family s=0 is the 4π rotation', mat.almostEqual(quat.toMat3(loop4pi(n, p, 0)(0.3)), rodrigues(n, 0.3 * 2 * TAU), 1e-12));
  check('4π family s=1 is constant', [0.1, 0.37, 0.8].every((t) => mat.almostEqual(quat.toMat3(loop4pi(n, p, 1)(t)), I3, 1e-12)));
  for (const s of [0, 0.3, 0.6, 1]) {
    const qf = loop2pi(n, p, s);
    check(`2π family s=${s}: exactly 1 jump`, countJumps(qf) === 1);
    check(`2π family s=${s}: lift ends at −1`, close(qf(1)[0], -1, 1e-12));
  }
}

// ------------------------------------------------------------ non-commutativity
{
  const A = mat.mul(rotY(PI / 2), rotX(PI / 2)); // x first, then y (space-fixed axes)
  const B = mat.mul(rotX(PI / 2), rotY(PI / 2)); // y first, then x
  check('R_y R_x ≠ R_x R_y', !mat.almostEqual(A, B, 1e-3));
  check('R_y(90°)R_x(90°) = R(120°, (1,1,−1)/√3)', mat.almostEqual(A, rodrigues([1, 1, -1], (2 * PI) / 3), 1e-12));
  check('R_x(90°)R_y(90°) = R(120°, (1,1,1)/√3)', mat.almostEqual(B, rodrigues([1, 1, 1], (2 * PI) / 3), 1e-12));
  // intrinsic (body-fixed) x-then-y equals extrinsic (space-fixed) y-then-x
  const Rx = rotX(PI / 2);
  const bodyY = mat.mulv(Rx, E[1]); // the body y axis after the first step
  const intrinsic = mat.mul(rodrigues(bodyY, PI / 2), Rx);
  check('body-fixed x then y = R_x R_y', mat.almostEqual(intrinsic, B, 1e-12));
}
// small loops: C(ε) = R_x(ε) R_y(ε) R_x(−ε) R_y(−ε) ≈ R_z(+ε²)
for (const eps of [0.2, 0.1, 0.05, 0.02, 0.01]) {
  const body = commutatorLoop(E[0], E[1], eps, 'body');
  const space = commutatorLoop(E[0], E[1], eps, 'space');
  const Cmat = mat.chain(rotX(eps), rotY(eps), rotX(-eps), rotY(-eps));
  check(`body loop = R_x R_y R_x⁻¹ R_y⁻¹ (ε=${eps})`, mat.almostEqual(quat.toMat3(body.end), Cmat, 1e-12));
  check(`body loop ≈ +ε² z (ε=${eps})`, vec.dist(body.net, [0, 0, eps * eps]) < 1.5 * eps ** 3, JSON.stringify(body.net));
  check(`space loop ≈ −ε² z (ε=${eps})`, vec.dist(space.net, [0, 0, -eps * eps]) < 1.5 * eps ** 3, JSON.stringify(space.net));
  check(`net angle / ε² → 1 (ε=${eps})`, Math.abs(vec.norm(body.net) / eps ** 2 - 1) < 2 * eps);
  // the loop path: legs 1..4 are continuous and start at the identity
  check('loop starts at identity', close(body.qf(0)[0], 1, 1e-15));
  check('loop leg continuity', [1, 2, 3].every((u) => quat.dot(body.qf(u - 1e-9), body.qf(u + 1e-9)) > 1 - 1e-12));
  check('loop end matches qf(4)', quat.dot(body.qf(4), body.end) > 1 - 1e-12);
}
// general generators: net rotation vector ≈ ±ε² a×b; parallel generators commute exactly
for (let r = 0; r < 10; r++) {
  const a = randomUnit3(rng);
  const b = randomUnit3(rng);
  const eps = 0.01;
  const net = commutatorLoop(a, b, eps, 'body').net;
  check('net ≈ ε² a×b', vec.dist(net, vec.scale(vec.cross(a, b), eps * eps)) < 3 * eps ** 3);
  const net2 = commutatorLoop(a, vec.scale(a, 0.7), 0.8, 'body').net;
  check('parallel generators: loop closes', vec.norm(net2) < 1e-12);
}

// ------------------------------------------------------------ Euler angles & gimbal lock
for (let r = 0; r < 40; r++) {
  const ang = [PI * (2 * rng() - 1), (PI / 2) * (2 * rng() - 1), PI * (2 * rng() - 1)];
  const R = eulerToR('zyx', ang);
  check('zyx: R = R_z R_y R_x', mat.almostEqual(R, mat.chain(rotZ(ang[0]), rotY(ang[1]), rotX(ang[2])), 1e-14));
  const angZ = [PI * (2 * rng() - 1), PI * rng(), PI * (2 * rng() - 1)];
  check('zyz: R = R_z R_y R_z', mat.almostEqual(eulerToR('zyz', angZ), mat.chain(rotZ(angZ[0]), rotY(angZ[1]), rotZ(angZ[2])), 1e-14));
  for (const [conv, a] of [['zyx', ang], ['zyz', angZ]]) {
    // Jacobian columns are the space-frame angular velocities: (∂R/∂a_k) Rᵀ = hat(a_k)
    const axes = eulerAxes(conv, a);
    const h = 1e-6;
    for (let k = 0; k < 3; k++) {
      const ap = a.slice();
      const am = a.slice();
      ap[k] += h;
      am[k] -= h;
      const dR = mat.scale(mat.sub(eulerToR(conv, ap), eulerToR(conv, am)), 1 / (2 * h));
      const W = mat.mul(dR, mat.transpose(eulerToR(conv, a)));
      check(`${conv}: column ${k} of J = vee(∂R Rᵀ)`, vec.dist(vee(W), axes[k]) < 1e-8);
    }
    const d = eulerDet(conv, a);
    check(`${conv}: det J closed form`, close(d, conv === 'zyx' ? -Math.cos(a[1]) : -Math.sin(a[1]), 1e-12));
    // inverse: every candidate reproduces R
    const Rk = eulerToR(conv, a);
    for (const c of eulerFromR(conv, Rk)) check(`${conv}: eulerFromR round trip`, mat.almostEqual(eulerToR(conv, c), Rk, 1e-10));
    // gimbal frames nest: inner frame = body orientation
    const F = gimbalFrames(conv, a);
    check(`${conv}: inner gimbal frame = R`, mat.almostEqual(F[2], Rk, 1e-14));
  }
}
// lock degeneracies: only one combination of the outer and inner angles survives
for (let r = 0; r < 10; r++) {
  const psi = TAU * rng();
  const phi = TAU * rng();
  const c = TAU * rng();
  check('zyx θ=+90°: only ψ−φ matters', mat.almostEqual(eulerToR('zyx', [psi + c, PI / 2, phi + c]), eulerToR('zyx', [psi, PI / 2, phi]), 1e-12));
  check('zyx θ=−90°: only ψ+φ matters', mat.almostEqual(eulerToR('zyx', [psi + c, -PI / 2, phi - c]), eulerToR('zyx', [psi, -PI / 2, phi]), 1e-12));
  check('zyz β=0: only α+γ matters', mat.almostEqual(eulerToR('zyz', [psi + c, 0, phi - c]), eulerToR('zyz', [psi, 0, phi]), 1e-12));
  check('zyz β=π: only α−γ matters', mat.almostEqual(eulerToR('zyz', [psi + c, PI, phi + c]), eulerToR('zyz', [psi, PI, phi]), 1e-12));
  // at lock J has rank 2; the unreachable direction is horizontal, (cos ψ, sin ψ, 0) for zyx
  const wd = weakestDirection('zyx', [psi, PI / 2, phi]);
  check('zyx lock: σ_min = 0', wd.sigmaMin < 1e-7);
  check('zyx lock: lost direction (cos ψ, sin ψ, 0)', Math.abs(Math.abs(vec.dot(wd.dir, [Math.cos(psi), Math.sin(psi), 0])) - 1) < 1e-9);
  check('zyx lock: det J = 0', Math.abs(eulerDet('zyx', [psi, PI / 2, phi])) < 1e-12);
  check('zyz lock at identity: det J = 0', Math.abs(eulerDet('zyz', [psi, 0, phi])) < 1e-12);
  // singular branch of eulerFromR still reproduces R
  for (const conv of ['zyx', 'zyz']) {
    const a = conv === 'zyx' ? [psi, PI / 2, phi] : [psi, 0, phi];
    const sol = eulerFromR(conv, eulerToR(conv, a), [0.3, 0, 0]);
    check(`${conv}: singular inverse reproduces R`, mat.almostEqual(eulerToR(conv, sol[0]), eulerToR(conv, a), 1e-9));
  }
}
// The same orientation that locks one convention is regular in the other
{
  const R = eulerToR('zyx', [0.4, PI / 2, -0.3]);
  const zyz = eulerFromR('zyz', R)[0];
  check('zyx-locked orientation is regular in zyz', Math.abs(eulerDet('zyz', zyz)) > 0.5);
}
// Flying past the singularity: a smooth path whose continuous Euler lift swings ψ and φ by ≈180°
for (const conv of ['zyx', 'zyz']) {
  for (const dlt of [deg(2), deg(5), deg(15)]) {
    const fp = flyPast(conv, dlt, 1440);
    const maxErr = Math.max(...fp.angles.map((a, i) => mat.maxAbs(mat.sub(eulerToR(conv, a), fp.Rs[i]))));
    check(`${conv} δ=${(dlt * 180 / PI).toFixed(0)}°: lift reproduces the path`, maxErr < 1e-9, String(maxErr));
    let maxStep = 0;
    for (let i = 1; i < fp.angles.length; i++) for (let k = 0; k < 3; k++) maxStep = Math.max(maxStep, Math.abs(fp.angles[i][k] - fp.angles[i - 1][k]));
    check(`${conv} δ=${(dlt * 180 / PI).toFixed(0)}°: lift is continuous`, maxStep < 0.5, String(maxStep));
    const minDet = Math.min(...fp.dets.map(Math.abs));
    check(`${conv}: min |det J| ≈ sin δ`, Math.abs(minDet - Math.sin(dlt)) < 2e-3, `${minDet} vs ${Math.sin(dlt)}`);
    const outer = fp.angles.map((a) => a[0]);
    const swing = Math.max(...outer) - Math.min(...outer);
    check(`${conv}: outer angle swings by ≥ 180°`, swing > PI - 0.2, String(swing));
    // the quaternion path is smooth (constant angular speed): consecutive samples are equally close
    const dots = fp.qs.slice(1).map((q, i) => quat.dot(q, fp.qs[i]));
    check(`${conv}: quaternion path uniform`, Math.max(...dots) - Math.min(...dots) < 1e-12);
    // middle angle stays in the open chart (never crosses lock)
    if (conv === 'zyx') check('zyx: |θ| < 90° along the path', fp.angles.every((a) => Math.cos(a[1]) > 0));
    else check('zyz: 0 < β < 180° along the path', fp.angles.every((a) => Math.sin(a[1]) > 0));
  }
  // rates diverge like 1/δ: peak outer-angle rate scales ∝ 1/δ
  const peak = (dlt) => {
    const fp = flyPast(conv, dlt, 2880);
    let m = 0;
    for (let i = 1; i < fp.angles.length; i++) m = Math.max(m, Math.abs(fp.angles[i][0] - fp.angles[i - 1][0]) / (fp.ts[i] - fp.ts[i - 1]));
    return m;
  };
  const r1 = peak(deg(4)) * deg(4);
  const r2 = peak(deg(8)) * deg(8);
  check(`${conv}: peak rate ∝ 1/δ`, Math.abs(r1 / r2 - 1) < 0.1, `${r1} ${r2}`);
}
check('unwrapTo', close(unwrapTo(3 * PI - 0.1, 0.2), PI - 0.1, 1e-12));
check('CONV axes', CONV.zyx.axes.join() === '2,1,0' && CONV.zyz.axes.join() === '2,1,2');
check('eulerJacobian at zero (zyx) = [e_z e_y e_x]', mat.almostEqual(eulerJacobian('zyx', [0, 0, 0]), mat.fromCols([E[2], E[1], E[0]]), 1e-15));

console.log(`\nso3 tests: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log('Failures:', [...new Set(failures)].join(' | '));
  process.exit(1);
}
