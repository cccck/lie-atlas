#!/usr/bin/env node
// Numerical self-tests for the core maths (src/core/la.js, complex.js, format.js).  `npm test`
import { mat, vec, quat, expSO3, logSO3, hat, vee, exp2, eig2, mulberry32, randomUnit3, L, TAU, signedArea } from '../src/core/la.js';
import { cx, cmat, sigma, su2FromQuat, quatFromSU2, su2Rotation, so3FromSU2, spinMatrices, wignerSmallD, wignerD, mobius, blochVector, spinorFromBloch } from '../src/core/complex.js';
import { fmt, texNum, texMatrix, rational, texAngle, texFrac } from '../src/core/format.js';

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
const rng = mulberry32(7);

// --- SO(3)
for (let i = 0; i < 200; i++) {
  const n = randomUnit3(rng);
  const th = i < 20 ? 1e-7 * rng() : i < 40 ? Math.PI - 1e-6 * rng() : Math.PI * rng();
  const w = vec.scale(n, th);
  const R = expSO3(w);
  check('expSO3 orthogonal', mat.almostEqual(mat.mul(R, mat.transpose(R)), mat.eye(3), 1e-12));
  check('expSO3 det=1', close(mat.det(R), 1, 1e-12));
  check('expSO3 = expm(hat)', mat.almostEqual(R, mat.expm(hat(w)), 1e-12));
  const w2 = logSO3(R);
  check('logSO3 roundtrip', mat.almostEqual(expSO3(w2), R, 1e-9), JSON.stringify({ th, w, w2 }));
  if (th < Math.PI - 1e-3) check('logSO3 principal', vec.dist(w, w2) < 1e-7, JSON.stringify({ th, w, w2 }));
  const q = quat.fromRotVec(w);
  check('quat→mat', mat.almostEqual(quat.toMat3(q), R, 1e-12));
  const v = randomUnit3(rng);
  check('quat.rotate', vec.dist(quat.rotate(q, v), mat.mulv(R, v)) < 1e-12);
  const qq = quat.fromMat3(R);
  check('quat.fromMat3', mat.almostEqual(quat.toMat3(qq), R, 1e-10));
  check('hat/vee', vec.dist(vee(hat(w)), w) < 1e-14);
  check('hat = cross', vec.dist(mat.mulv(hat(w), v), vec.cross(w, v)) < 1e-14);
}
// right-hand rule: rotating x by +π/2 about z gives y
check('right-handed', vec.dist(mat.mulv(expSO3([0, 0, Math.PI / 2]), [1, 0, 0]), [0, 1, 0]) < 1e-12);
// [L_x, L_y] = L_z
check('[Lx,Ly]=Lz', mat.almostEqual(mat.comm(L[0], L[1]), L[2], 1e-14));
// quaternion SU(2) coordinates distinguish 2π
const q2pi = quat.fromAxisAngle([0, 0, 1], TAU);
check('q(2π) = −1', close(q2pi[0], -1, 1e-12));
check('toRotVec(q(3π/2)) angle', close(vec.norm(quat.toRotVec(quat.fromAxisAngle([0, 0, 1], 1.5 * Math.PI))), 1.5 * Math.PI, 1e-12));

// --- SU(2)
for (let i = 0; i < 50; i++) {
  const a = quat.fromRotVec(vec.scale(randomUnit3(rng), 4 * Math.PI * rng()));
  const b = quat.fromRotVec(vec.scale(randomUnit3(rng), 4 * Math.PI * rng()));
  check('su2 homomorphism', cmat.almostEqual(su2FromQuat(quat.mul(a, b)), cmat.mul(su2FromQuat(a), su2FromQuat(b)), 1e-12));
  const Ua = su2FromQuat(a);
  check('su2 unitary', cmat.almostEqual(cmat.mul(Ua, cmat.dagger(Ua)), cmat.eye(2), 1e-12));
  check('su2 det 1', cx.eq(cmat.det2(Ua), { re: 1, im: 0 }, 1e-12));
  const back = quatFromSU2(Ua);
  check('quatFromSU2', a.every((x, k) => close(x, back[k], 1e-12)));
  check('so3FromSU2 = quat→mat', mat.almostEqual(so3FromSU2(Ua), quat.toMat3(a), 1e-12));
  const n = randomUnit3(rng);
  const th = 4 * Math.PI * rng();
  const U = su2Rotation(n, th);
  const Uexp = cmat.expm(cmat.scale(cmat.combo(n, sigma), { re: 0, im: -th / 2 }));
  check('su2Rotation = exp(−iθ n·σ/2)', cmat.almostEqual(U, Uexp, 1e-10));
  check('Ad(U) = R(θ,n)', mat.almostEqual(so3FromSU2(U), expSO3(vec.scale(n, th)), 1e-10));
  // Bloch vector rotates with R
  const psi = spinorFromBloch(Math.PI * rng(), TAU * rng());
  const b0 = blochVector(psi);
  const b1 = blochVector(cmat.apply(U, psi));
  check('Bloch rotates by R', vec.dist(b1, mat.mulv(expSO3(vec.scale(n, th)), b0)) < 1e-10);
}
check('U(2π) = −1', cmat.almostEqual(su2Rotation([0, 0, 1], TAU), cmat.scale(cmat.eye(2), -1), 1e-12));

// --- spin-j
for (const j of [0.5, 1, 1.5, 2, 3.5]) {
  const { Jx, Jy, Jz, Jp, Jm, dim } = spinMatrices(j);
  const JxC = cmat.fromReal(Jx);
  const JzC = cmat.fromReal(Jz);
  const lhs = cmat.comm(JxC, Jy);
  const rhs = cmat.scale(JzC, { re: 0, im: 1 });
  check(`[Jx,Jy]=iJz j=${j}`, cmat.almostEqual(lhs, rhs, 1e-12));
  const J2 = cmat.add(cmat.add(cmat.mul(JxC, JxC), cmat.mul(Jy, Jy)), cmat.mul(JzC, JzC));
  check(`J²=j(j+1) j=${j}`, cmat.almostEqual(J2, cmat.scale(cmat.eye(dim), j * (j + 1)), 1e-12));
  check(`[Jz,J+]=J+ j=${j}`, mat.almostEqual(mat.comm(Jz, Jp), Jp, 1e-12));
  check(`[J+,J-]=2Jz j=${j}`, mat.almostEqual(mat.comm(Jp, Jm), mat.scale(Jz, 2), 1e-12));
  const beta = 1.234;
  const d = wignerSmallD(j, beta);
  check(`d^j orthogonal j=${j}`, mat.almostEqual(mat.mul(d, mat.transpose(d)), mat.eye(dim), 1e-12));
  const dExp = cmat.expm(cmat.scale(Jy, { re: 0, im: -beta }));
  check(`d^j = exp(−iβJy) j=${j}`, cmat.almostEqual(cmat.fromReal(d), dExp, 1e-10));
}
{
  const b = 0.7;
  const d1 = wignerSmallD(1, b); // basis m = 1, 0, −1
  check('d1_00 = cos β', close(d1[1][1], Math.cos(b), 1e-12));
  check('d1_11 = (1+cos β)/2', close(d1[0][0], (1 + Math.cos(b)) / 2, 1e-12));
  check('d1_10 = −sin β/√2', close(d1[0][1], -Math.sin(b) / Math.SQRT2, 1e-12));
  const dh = wignerSmallD(0.5, b);
  check('d½ = [[c,−s],[s,c]]', close(dh[0][0], Math.cos(b / 2)) && close(dh[0][1], -Math.sin(b / 2)) && close(dh[1][0], Math.sin(b / 2)));
  const D = wignerD(1, 0.3, b, 0.5);
  check('wignerD phase', cx.eq(D[0][2], cx.polar(d1[0][2], -1 * 0.3 - -1 * 0.5), 1e-12));
}

// --- 2×2 closed form
for (let i = 0; i < 300; i++) {
  const A = [
    [4 * rng() - 2, 4 * rng() - 2],
    [4 * rng() - 2, 4 * rng() - 2],
  ];
  check('exp2 = expm', mat.almostEqual(exp2(A), mat.expm(A), 1e-9), JSON.stringify(A));
  check('det e^A = e^{tr A}', close(mat.det(exp2(A)), Math.exp(mat.trace(A)), 1e-9));
}
check('exp2 parabolic', mat.almostEqual(exp2([[0, 1], [0, 0]]), [[1, 1], [0, 1]], 1e-14));
check('exp2 rotation', mat.almostEqual(exp2([[0, -Math.PI], [Math.PI, 0]]), [[-1, 0], [0, -1]], 1e-12));
const e = eig2([[0, -1], [1, 0]]);
check('eig2 complex', !e.real && close(e.l1.im, 1) && close(e.l1.re, 0));

// --- generic matrices
for (let i = 0; i < 50; i++) {
  const n = 2 + (i % 5);
  const A = Array.from({ length: n }, () => Array.from({ length: n }, () => 2 * rng() - 1));
  const Ai = mat.inv(A);
  check('inv', mat.almostEqual(mat.mul(A, Ai), mat.eye(n), 1e-8));
  check('det(AB)=detA detB', close(mat.det(mat.mul(A, Ai)), 1, 1e-8));
  const S = mat.add(A, mat.transpose(A));
  const { values, vectors } = mat.eigSym(S);
  for (let k = 0; k < n; k++) check('eigSym', vec.dist(mat.mulv(S, vectors[k]), vec.scale(vectors[k], values[k])) < 1e-9);
  check('expm(A)expm(-A)=I', mat.almostEqual(mat.mul(mat.expm(A), mat.expm(mat.scale(A, -1))), mat.eye(n), 1e-10));
}
check('signedArea ccw square', close(signedArea([[0, 0], [1, 0], [1, 1], [0, 1]]), 1));

// --- Möbius
const M = [
  [{ re: 1, im: 0 }, { re: 1, im: 0 }],
  [{ re: 0, im: 0 }, { re: 1, im: 0 }],
];
check('mobius translate', cx.eq(mobius(M, { re: 2, im: 3 }), { re: 3, im: 3 }));
check('mobius ∞', !Number.isFinite(mobius(M, { re: Infinity, im: 0 }).re));

// --- format
check('fmt minus', fmt(-1.5, 1) === '−1.5');
check('fmt -0', fmt(-0.0001, 2) === '0.00');
check('texNum', texNum(-0.5, 2) === '-0.50');
check('texMatrix', texMatrix([[1, 0], [0, 1]], 0) === '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}');
check('rational', rational(0.75).p === 3 && rational(0.75).q === 4);
check('texAngle', texAngle(Math.PI / 2) === '\\tfrac{\\pi}{2}' && texAngle(2 * Math.PI) === '2\\pi');
check('texFrac', texFrac(-0.5) === '-\\tfrac{1}{2}');

console.log(`core tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
