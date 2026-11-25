#!/usr/bin/env node
// Numerical tests for the "reps" module maths (src/modules/reps/*.js).   node tests/reps.test.mjs
// Checks the conventions that the visualisations rely on: ladder elements, Casimir, spherical
// harmonics (Condon–Shortley), the rotation identity f(R⁻¹r) = Σ c'_m Y_lm(r) with c' = D c,
// homomorphism, D¹ ≅ R, Clebsch–Gordan values/orthogonality/eigenvectors, peeling counts.

import { mat, vec, mulberry32, randomUnit3, expSO3, TAU, rotY } from '../src/core/la.js';
import { cx, cmat, spinMatrices, wignerD } from '../src/core/complex.js';
import {
  mValues, dimOf, casimir, ladderN, jPlusElement, jMinusElement, vectorModel, casimirCheck, expect, expectJ, spin,
  assocLegendre, Ylm, ylmAll, evalState, basisState, realOrbital, ORBITALS, normalizeC, randomState,
  eulerMatrix, eulerAngles, rotateCoeffs, sphericalBasis, gaussLegendre, sphereQuadrature, projectionTable, projectOnto,
  cgFloat, cgExact, cgExactValue, multiplets, productBasis, countM, hooks, coupledVector, coupledBasis, totalJ,
  ckron, productRotationY, coupledAmplitudes, character,
} from '../src/modules/reps/math.js';
import { texHalf, textHalf, texSurd, textSurd, texSpinMatrix, texSqrtRational, textSqrtRational, squareFree } from '../src/modules/reps/texfmt.js';
import { phaseRGB, oklchToRgb, phaseStyle, phaseLUT, maxChroma } from '../src/modules/reps/colour.js';

let pass = 0;
let fail = 0;
const sections = [];
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
function section(name) {
  sections.push([name, pass, fail]);
}
const close = (a, b, tol = 1e-10) => Math.abs(a - b) <= tol;
const cclose = (a, b, tol = 1e-10) => Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;
const rng = mulberry32(20261125);
const randAngle = () => TAU * rng();
const randEuler = () => [TAU * rng(), Math.PI * rng(), TAU * rng()];

// ---------------------------------------------------------------- 1. ladder & Casimir
section('ladder');
for (let tj = 0; tj <= 8; tj++) {
  const j = tj / 2;
  const S = spinMatrices(j);
  check(`dim j=${j}`, dimOf(j) === S.dim && mValues(j).length === S.dim);
  check(`basis order m=j..-j j=${j}`, mValues(j)[0] === j && mValues(j)[S.dim - 1] === -j);
  for (let k = 1; k < S.dim; k++) {
    const m = S.ms[k];
    check(`J+ element j=${j} m=${m}`, close(S.Jp[k - 1][k], jPlusElement(j, m), 1e-14));
    check(`J- element j=${j} m=${m - 1 + 1}`, close(S.Jm[k][k - 1], jMinusElement(j, S.ms[k - 1]), 1e-14));
    check(`N integer j=${j} m=${m}`, Number.isInteger(ladderN(j, m)) && close(ladderN(j, m), (j - m) * (j + m + 1), 1e-12));
  }
  check(`J+ annihilates the top j=${j}`, jPlusElement(j, j) === 0);
  check(`J- annihilates the bottom j=${j}`, jMinusElement(j, -j) === 0);
  const { err } = casimirCheck(j);
  check(`J^2 = j(j+1) 1, j=${j}`, err < 1e-12, `err=${err}`);
  // J²|jm⟩ = (J₋J₊ + J_z² + J_z)|jm⟩ ⇒ ‖J₊|jm⟩‖² = j(j+1) − m(m+1)
  for (const m of mValues(j)) check(`norm identity j=${j} m=${m}`, close(jPlusElement(j, m) ** 2, casimir(j) - m * (m + 1), 1e-12));
  check(`[Jz,J+]=J+ j=${j}`, mat.almostEqual(mat.comm(S.Jz, S.Jp), S.Jp, 1e-12));
  check(`[J+,J-]=2Jz j=${j}`, mat.almostEqual(mat.comm(S.Jp, S.Jm), mat.scale(S.Jz, 2), 1e-12));
  // vector model
  for (const m of mValues(j)) {
    const vm = vectorModel(j, m);
    if (j > 0) {
      check(`cone projection j=${j} m=${m}`, close(vm.len * Math.cos(vm.theta), m, 1e-12));
      check(`cone radius j=${j} m=${m}`, close(vm.rho * vm.rho + m * m, casimir(j), 1e-12));
      check(`cone never closes j=${j} m=${m}`, vm.theta > 1e-3 && vm.theta < Math.PI - 1e-3);
    }
  }
  // ⟨J⟩ of |j m⟩ is m ẑ, and ⟨Jx² + Jy²⟩ = j(j+1) − m²
  for (const m of mValues(j)) {
    const c = basisState(Math.round(j) === j ? j : 0, 0); // placeholder for integer path below
    void c;
    const e = Array.from({ length: S.dim }, (_, k) => ({ re: k === j - m ? 1 : 0, im: 0 }));
    const L = expectJ(j, e);
    check(`<J> = m z j=${j} m=${m}`, close(L[0], 0) && close(L[1], 0) && close(L[2], m));
    const X = cmat.fromReal(S.Jx);
    const perp = expect(cmat.add(cmat.mul(X, X), cmat.mul(S.Jy, S.Jy)), e).re;
    check(`<Jx²+Jy²> j=${j} m=${m}`, close(perp, casimir(j) - m * m, 1e-12));
  }
}
check('j=0 is a single state', dimOf(0) === 1 && casimir(0) === 0 && vectorModel(0, 0).len === 0);
check('j=1/2 cone angle 54.7356°', close((vectorModel(0.5, 0.5).theta * 180) / Math.PI, 54.73561031724535, 1e-9));
check('j=4 top cone angle 26.565°', close((vectorModel(4, 4).theta * 180) / Math.PI, 26.56505117707799, 1e-9));

// ---------------------------------------------------------------- 2. exact TeX formatting
section('format');
check('squareFree 12', squareFree(12).a === 2 && squareFree(12).b === 3);
check('squareFree 72', squareFree(72).a === 6 && squareFree(72).b === 2);
check('texSurd 12', texSurd(12) === '2\\sqrt{3}');
check('texSurd 4', texSurd(4) === '2');
check('texSurd 6', texSurd(6) === '\\sqrt{6}');
check('texSurd 3/2', texSurd(3, 2) === '\\tfrac{\\sqrt{3}}{2}');
check('texSurd 4/2', texSurd(4, 2) === '1');
check('texSurd 8/2', texSurd(8, 2) === '\\sqrt{2}');
check('texSurd i/2', texSurd(1, 2, 'i') === '\\tfrac{i}{2}');
check('texSurd i√3/2', texSurd(3, 2, 'i') === '\\tfrac{i\\sqrt{3}}{2}');
check('texSurd 2i/2', texSurd(4, 2, 'i') === 'i');
check('textSurd', textSurd(12) === '2√3' && textSurd(6) === '√6' && textSurd(9) === '3' && textSurd(0) === '0');
check('texHalf', texHalf(1.5) === '\\tfrac{3}{2}' && texHalf(-0.5) === '-\\tfrac{1}{2}' && texHalf(2) === '2' && texHalf(0) === '0');
check('textHalf', textHalf(-1.5) === '−3/2' && textHalf(3) === '3' && textHalf(0.5) === '1/2');
check('J_x spin-1/2 tex', texSpinMatrix(0.5, 'x') === '\\begin{pmatrix} \\cdot & \\tfrac{1}{2} \\\\ \\tfrac{1}{2} & \\cdot \\end{pmatrix}');
check('J_y spin-1/2 tex', texSpinMatrix(0.5, 'y') === '\\begin{pmatrix} \\cdot & -\\tfrac{i}{2} \\\\ \\tfrac{i}{2} & \\cdot \\end{pmatrix}');
check('J_+ spin-1 tex', texSpinMatrix(1, 'p') === '\\begin{pmatrix} \\cdot & \\sqrt{2} & \\cdot \\\\ \\cdot & \\cdot & \\sqrt{2} \\\\ \\cdot & \\cdot & \\cdot \\end{pmatrix}');
check('J_z spin-1 tex keeps 0', texSpinMatrix(1, 'z').includes('\\cdot & 0 & \\cdot'));
check('sqrt rational 1/2', texSqrtRational({ sign: 1, num: 1n, den: 2n }) === '\\tfrac{1}{\\sqrt{2}}');
check('sqrt rational -2/3', texSqrtRational({ sign: -1, num: 2n, den: 3n }) === '-\\sqrt{\\tfrac{2}{3}}');
check('sqrt rational 1/4', texSqrtRational({ sign: 1, num: 1n, den: 4n }) === '\\tfrac{1}{2}');
check('sqrt rational 1', texSqrtRational({ sign: -1, num: 1n, den: 1n }) === '-1');
check('sqrt rational 1/8 (not square-free)', texSqrtRational({ sign: 1, num: 1n, den: 8n }) === '\\sqrt{\\tfrac{1}{8}}');
check('text sqrt rational', textSqrtRational({ sign: -1, num: 2n, den: 3n }) === '−√(2/3)' && textSqrtRational({ sign: 1, num: 1n, den: 2n }) === '1/√2');

// ---------------------------------------------------------------- 3. spherical harmonics
section('Ylm');
{
  const th = 0.7;
  const ph = 1.9;
  const s = Math.sin(th);
  const c = Math.cos(th);
  const P = Math.PI;
  check('Y00', cclose(Ylm(0, 0, th, ph), { re: 1 / Math.sqrt(4 * P), im: 0 }, 1e-14));
  check('Y10', cclose(Ylm(1, 0, th, ph), { re: Math.sqrt(3 / (4 * P)) * c, im: 0 }, 1e-14));
  check('Y11 (Condon–Shortley sign)', cclose(Ylm(1, 1, th, ph), cx.scale(cx.cis(ph), -Math.sqrt(3 / (8 * P)) * s), 1e-14));
  check('Y1-1', cclose(Ylm(1, -1, th, ph), cx.scale(cx.cis(-ph), Math.sqrt(3 / (8 * P)) * s), 1e-14));
  check('Y20', cclose(Ylm(2, 0, th, ph), { re: 0.25 * Math.sqrt(5 / P) * (3 * c * c - 1), im: 0 }, 1e-14));
  check('Y21', cclose(Ylm(2, 1, th, ph), cx.scale(cx.cis(ph), -0.5 * Math.sqrt(15 / (2 * P)) * s * c), 1e-14));
  check('Y22', cclose(Ylm(2, 2, th, ph), cx.scale(cx.cis(2 * ph), 0.25 * Math.sqrt(15 / (2 * P)) * s * s), 1e-14));
  check('Y33', cclose(Ylm(3, 3, th, ph), cx.scale(cx.cis(3 * ph), -0.125 * Math.sqrt(35 / P) * s ** 3), 1e-14));
  check('Y40', cclose(Ylm(4, 0, th, ph), { re: (3 / 16) * Math.sqrt(1 / P) * (35 * c ** 4 - 30 * c * c + 3), im: 0 }, 1e-14));
  check('P_2^1 with CS phase', close(assocLegendre(2, 1, c), -3 * c * s, 1e-14));
  for (let l = 0; l <= 4; l++) {
    const all = ylmAll(l, th, ph);
    for (let m = -l; m <= l; m++) check(`ylmAll l=${l} m=${m}`, cclose(all[l - m], Ylm(l, m, th, ph), 1e-14));
  }
}
// orthonormality by Gauss–Legendre × trapezoid quadrature (exact for these degrees)
{
  const q = sphereQuadrature(12, 24);
  let maxErr = 0;
  for (let l1 = 0; l1 <= 4; l1++)
    for (let m1 = -l1; m1 <= l1; m1++)
      for (let l2 = 0; l2 <= 4; l2++)
        for (let m2 = -l2; m2 <= l2; m2++) {
          let re = 0;
          let im = 0;
          for (let i = 0; i < q.n; i++) {
            const a = Ylm(l1, m1, q.thetas[i], q.phis[i]);
            const b = Ylm(l2, m2, q.thetas[i], q.phis[i]);
            re += q.weights[i] * (a.re * b.re + a.im * b.im);
            im += q.weights[i] * (a.re * b.im - a.im * b.re);
          }
          const t = l1 === l2 && m1 === m2 ? 1 : 0;
          maxErr = Math.max(maxErr, Math.hypot(re - t, im));
        }
  check('orthonormality <Y_l1m1|Y_l2m2> = δδ (l ≤ 4)', maxErr < 1e-13, `maxErr=${maxErr}`);
  const wsum = q.weights.reduce((s, w) => s + w, 0);
  check('quadrature weights sum to 4π', close(wsum, 4 * Math.PI, 1e-12));
}
{
  const { x, w } = gaussLegendre(6);
  for (let k = 0; k <= 11; k++) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += w[i] * x[i] ** k;
    check(`Gauss–Legendre ∫x^${k}`, close(s, k % 2 ? 0 : 2 / (k + 1), 1e-13));
  }
}
// addition theorem (Unsöld): Σ_m |Y_lm|² = (2l+1)/4π
for (let l = 0; l <= 4; l++)
  for (let t = 0; t < 10; t++) {
    const th = Math.PI * rng();
    const ph = randAngle();
    const s = ylmAll(l, th, ph).reduce((a, z) => a + z.re * z.re + z.im * z.im, 0);
    check(`Unsöld l=${l}`, close(s, (2 * l + 1) / (4 * Math.PI), 1e-13));
  }
// L₊ Y_lm = √((l−m)(l+m+1)) Y_l,m+1 with L₊ = e^{iφ}(∂_θ + i cot θ ∂_φ): the CS phase is the one
// that makes the differential operators reproduce the positive matrix elements of spinMatrices(l).
// Also L_z = −i∂_φ.
for (let l = 1; l <= 4; l++)
  for (let m = -l; m <= l; m++)
    for (let t = 0; t < 3; t++) {
      const th = 0.3 + 2.4 * rng();
      const ph = randAngle();
      const h = 1e-5;
      const Y = (a, b) => Ylm(l, m, a, b);
      const dth = cx.scale(cx.sub(Y(th + h, ph), Y(th - h, ph)), 1 / (2 * h));
      const dph = cx.scale(cx.sub(Y(th, ph + h), Y(th, ph - h)), 1 / (2 * h));
      const Lp = cx.mul(cx.cis(ph), cx.add(dth, cx.mul({ re: 0, im: 1 / Math.tan(th) }, dph)));
      const rhs = cx.scale(Ylm(l, m + 1, th, ph), jPlusElement(l, m));
      check(`L+ Y_${l}${m} (CS phase)`, cclose(Lp, rhs, 1e-6), JSON.stringify({ Lp, rhs }));
      const Lz = cx.mul({ re: 0, im: -1 }, dph);
      check(`Lz Y_${l}${m}`, cclose(Lz, cx.scale(Y(th, ph), m), 1e-6));
    }

// ---------------------------------------------------------------- 4. rotations of functions
section('rotation identity');
// Euler angles round trip, including the gimbal cases
for (let t = 0; t < 200; t++) {
  let e = randEuler();
  if (t < 20) e = [randAngle(), 0, randAngle()];
  else if (t < 40) e = [randAngle(), Math.PI, randAngle()];
  else if (t < 60) e = [randAngle(), 1e-12 * rng(), randAngle()];
  const R = eulerMatrix(...e);
  const e2 = eulerAngles(R);
  check('euler roundtrip', mat.almostEqual(eulerMatrix(...e2), R, 1e-9), JSON.stringify({ e, e2 }));
  check('euler ranges', e2[0] >= 0 && e2[0] < TAU && e2[1] >= 0 && e2[1] <= Math.PI && e2[2] >= 0 && e2[2] < TAU);
}
check('R(α,0,0) = R_z(α) is active', vec.dist(mat.mulv(eulerMatrix(Math.PI / 2, 0, 0), [1, 0, 0]), [0, 1, 0]) < 1e-12);
check('R(0,β,0) = R_y(β): z → x at 90°', vec.dist(mat.mulv(eulerMatrix(0, Math.PI / 2, 0), [0, 0, 1]), [1, 0, 0]) < 1e-12);
// THE identity: (U(R) f)(r̂) = f(R⁻¹ r̂) = Σ_m' c'_m' Y_lm'(r̂) with c' = D^l(α,β,γ) c
{
  let maxErr = 0;
  for (let l = 0; l <= 4; l++)
    for (let t = 0; t < 40; t++) {
      const c = randomState(2 * l + 1, rng);
      const e = randEuler();
      const R = eulerMatrix(...e);
      const Rinv = mat.transpose(R);
      const { c: c2 } = rotateCoeffs(l, c, ...e);
      for (let p = 0; p < 6; p++) {
        const r = randomUnit3(rng);
        const lhs = evalState(l, c, mat.mulv(Rinv, r));
        const rhs = evalState(l, c2, r);
        maxErr = Math.max(maxErr, Math.hypot(lhs.re - rhs.re, lhs.im - rhs.im));
      }
    }
  check('f(R⁻¹r) = Σ (D c)_m Y_lm(r) for l ≤ 4, random R, r, c', maxErr < 1e-12, `maxErr=${maxErr}`);
}
// Specific: rotate p_z by 90° about y → p_x (coefficients exactly)
{
  const pz = realOrbital(1, 0);
  const px = realOrbital(1, 1, 'c');
  const { c } = rotateCoeffs(1, pz, 0, Math.PI / 2, 0);
  check('R_y(90°) p_z = p_x', c.every((z, k) => cclose(z, px[k], 1e-12)), JSON.stringify(c));
  check('p_x coefficients (−1/√2, 0, 1/√2)', close(px[0].re, -Math.SQRT1_2) && close(px[1].re, 0) && close(px[2].re, Math.SQRT1_2));
  const { c: c3 } = rotateCoeffs(1, px, Math.PI / 2, 0, 0);
  const py = realOrbital(1, 1, 's');
  check('R_z(90°) p_x = p_y', c3.every((z, k) => cclose(z, py[k], 1e-12)), JSON.stringify(c3));
  const { c: c4 } = rotateCoeffs(2, realOrbital(2, 2, 'c'), Math.PI / 4, 0, 0);
  check('R_z(45°) d_{x²−y²} = d_xy', c4.every((z, k) => cclose(z, realOrbital(2, 2, 's')[k], 1e-12)));
}
// z-rotations are diagonal phases e^{−imα}
for (let l = 0; l <= 4; l++) {
  const a = randAngle();
  const D = wignerD(l, a, 0, 0);
  let ok = true;
  mValues(l).forEach((m, i) =>
    mValues(l).forEach((mp, k) => {
      const t = i === k ? cx.cis(-m * a) : { re: 0, im: 0 };
      if (!cclose(D[i][k], t, 1e-12)) ok = false;
    }),
  );
  check(`D(α,0,0) = diag(e^{−imα}) l=${l}`, ok);
  check(`D(2π) = 1 for integer l=${l}`, cmat.almostEqual(wignerD(l, 0, TAU, 0), cmat.eye(2 * l + 1), 1e-10));
}
check('D^{1/2}(2π) = −1 (spinor)', cmat.almostEqual(wignerD(0.5, 0, TAU, 0), cmat.scale(cmat.eye(2), -1), 1e-10));
// homomorphism D(R1 R2) = D(R1) D(R2)
for (const j of [0.5, 1, 1.5, 2, 3, 3.5, 4])
  for (let t = 0; t < 15; t++) {
    const e1 = randEuler();
    const e2 = randEuler();
    const e12 = eulerAngles(mat.mul(eulerMatrix(...e1), eulerMatrix(...e2)));
    const lhs = wignerD(j, ...e12);
    const rhs = cmat.mul(wignerD(j, ...e1), wignerD(j, ...e2));
    // for half-integer j the product may differ by the sign of the double cover
    const ok = cmat.almostEqual(lhs, rhs, 1e-9) || (j % 1 !== 0 && cmat.almostEqual(lhs, cmat.scale(rhs, -1), 1e-9));
    check(`homomorphism j=${j}`, ok);
    if (j % 1 === 0) check(`homomorphism (single-valued) j=${j}`, cmat.almostEqual(lhs, rhs, 1e-9));
    const D = wignerD(j, ...e1);
    check(`unitary j=${j}`, cmat.almostEqual(cmat.mul(D, cmat.dagger(D)), cmat.eye(D.length), 1e-10));
  }
// D¹ is the vector representation in the spherical basis: D¹_{m'm} = e_{m'}† R e_m
{
  const E = sphericalBasis();
  for (let t = 0; t < 30; t++) {
    const e = randEuler();
    const R = eulerMatrix(...e);
    const D = wignerD(1, ...e);
    let err = 0;
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        const Re = [0, 1, 2].map((i) => ({ re: R[i].reduce((s, x, k) => s + x * E[b][k].re, 0), im: R[i].reduce((s, x, k) => s + x * E[b][k].im, 0) }));
        let re = 0;
        let im = 0;
        for (let i = 0; i < 3; i++) {
          re += E[a][i].re * Re[i].re + E[a][i].im * Re[i].im;
          im += E[a][i].re * Re[i].im - E[a][i].im * Re[i].re;
        }
        err = Math.max(err, Math.hypot(re - D[a][b].re, im - D[a][b].im));
      }
    check('D¹ = U† R U (spherical basis)', err < 1e-12, `err=${err}`);
  }
  // Y_1m(r̂) = √(3/4π) e_m · r̂
  for (let t = 0; t < 10; t++) {
    const r = randomUnit3(rng);
    const [th, ph] = [Math.acos(r[2]), Math.atan2(r[1], r[0])];
    for (let a = 0; a < 3; a++) {
      const dot = { re: E[a].reduce((s, z, i) => s + z.re * r[i], 0), im: E[a].reduce((s, z, i) => s + z.im * r[i], 0) };
      check('Y_1m = √(3/4π) e_m·r̂', cclose(Ylm(1, 1 - a, th, ph), cx.scale(dot, Math.sqrt(3 / (4 * Math.PI))), 1e-13));
    }
  }
}
// Y_lm(θ, φ) = √((2l+1)/4π) conj(D^l_{m0}(φ, θ, 0))
for (let l = 0; l <= 4; l++)
  for (let t = 0; t < 8; t++) {
    const th = Math.PI * rng();
    const ph = randAngle();
    const D = wignerD(l, ph, th, 0);
    for (let m = -l; m <= l; m++) {
      const rhs = cx.scale(cx.conj(D[l - m][l]), Math.sqrt((2 * l + 1) / (4 * Math.PI)));
      check(`Y_lm = √((2l+1)/4π) D*_m0 l=${l} m=${m}`, cclose(Ylm(l, m, th, ph), rhs, 1e-12));
    }
  }
// ⟨L⟩ transforms as a vector: ⟨L⟩' = R ⟨L⟩ (U† L_i U = R_ij L_j); ⟨L²⟩ invariant
for (let l = 1; l <= 4; l++)
  for (let t = 0; t < 12; t++) {
    const c = randomState(2 * l + 1, rng);
    const e = randEuler();
    const { c: c2 } = rotateCoeffs(l, c, ...e);
    const L1 = expectJ(l, c);
    const L2 = expectJ(l, c2);
    check(`<L>' = R<L> l=${l}`, vec.dist(L2, mat.mulv(eulerMatrix(...e), L1)) < 1e-11, JSON.stringify({ L1, L2 }));
    const n2 = c2.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0);
    check(`norm preserved l=${l}`, close(n2, 1, 1e-12));
  }
// Real orbitals: real-valued, ∝ their Cartesian polynomial with a positive constant, ⟨L⟩ = 0
for (let l = 0; l <= 4; l++) {
  check(`orbital count l=${l}`, ORBITALS[l].length === 2 * l + 1);
  const seen = new Set();
  for (const o of ORBITALS[l]) {
    seen.add(o.m + o.type);
    const c = realOrbital(l, o.m, o.type);
    let ratio = null;
    let ok = true;
    let realOk = true;
    for (let t = 0; t < 25; t++) {
      const r = randomUnit3(rng);
      const f = evalState(l, c, r);
      if (Math.abs(f.im) > 1e-12) realOk = false;
      const p = o.poly(...r);
      if (Math.abs(p) < 1e-3) continue;
      const q = f.re / p;
      if (ratio === null) ratio = q;
      else if (!close(q, ratio, 1e-10 * Math.max(1, Math.abs(ratio)))) ok = false;
    }
    check(`orbital ${o.id} is real`, realOk);
    check(`orbital ${o.id} ∝ polynomial`, ok && ratio > 0, `ratio=${ratio}`);
    const L = expectJ(l, c);
    check(`orbital ${o.id} has <L> = 0`, Math.hypot(...L) < 1e-12);
  }
  check(`orbitals distinct l=${l}`, seen.size === 2 * l + 1);
}
// Projection by quadrature: the rotated function has weight only in its own l, and the projected
// coefficients equal D c (independent check of the representation)
{
  const quad = sphereQuadrature(10, 20);
  const tab = projectionTable(4, quad);
  for (let l = 0; l <= 4; l++)
    for (let t = 0; t < 6; t++) {
      const c = randomState(2 * l + 1, rng);
      const e = randEuler();
      const Rinv = mat.transpose(eulerMatrix(...e));
      const values = quad.dirs.map((d) => evalState(l, c, mat.mulv(Rinv, d)));
      const { coeffs, weight } = projectOnto(tab, values);
      const { c: c2 } = rotateCoeffs(l, c, ...e);
      check(`l-content after rotation l=${l}`, weight.every((w, lp) => close(w, lp === l ? 1 : 0, 1e-12)), JSON.stringify(weight));
      check(`quadrature coefficients = D c l=${l}`, coeffs[l].every((z, k) => cclose(z, c2[k], 1e-12)));
    }
}
check('normalizeC zero-safe', normalizeC([{ re: 0, im: 0 }]).every((z) => z.re === 0 && z.im === 0));

// ---------------------------------------------------------------- 5. Clebsch–Gordan
section('Clebsch–Gordan');
const h = 0.5;
check('½⊗½ singlet ⟨↑↓|00⟩ = 1/√2', close(cgFloat(h, h, h, -h, 0, 0), Math.SQRT1_2, 1e-14));
check('½⊗½ singlet ⟨↓↑|00⟩ = −1/√2', close(cgFloat(h, -h, h, h, 0, 0), -Math.SQRT1_2, 1e-14));
check('½⊗½ triplet M=0', close(cgFloat(h, h, h, -h, 1, 0), Math.SQRT1_2, 1e-14) && close(cgFloat(h, -h, h, h, 1, 0), Math.SQRT1_2, 1e-14));
check('½⊗½ triplet M=1', close(cgFloat(h, h, h, h, 1, 1), 1, 1e-14));
check('1⊗½ ⟨1 0;½ ½|3/2 ½⟩ = √(2/3)', close(cgFloat(1, 0, h, h, 1.5, 0.5), Math.sqrt(2 / 3), 1e-14));
check('1⊗½ ⟨1 1;½ −½|3/2 ½⟩ = √(1/3)', close(cgFloat(1, 1, h, -h, 1.5, 0.5), Math.sqrt(1 / 3), 1e-14));
check('1⊗½ ⟨1 1;½ −½|½ ½⟩ = √(2/3)', close(cgFloat(1, 1, h, -h, 0.5, 0.5), Math.sqrt(2 / 3), 1e-14));
check('1⊗½ ⟨1 0;½ ½|½ ½⟩ = −√(1/3)', close(cgFloat(1, 0, h, h, 0.5, 0.5), -Math.sqrt(1 / 3), 1e-14));
check('1⊗1 ⟨1 0;1 0|1 0⟩ = 0', close(cgFloat(1, 0, 1, 0, 1, 0), 0, 1e-14));
check('1⊗1 ⟨1 0;1 0|0 0⟩ = −1/√3', close(cgFloat(1, 0, 1, 0, 0, 0), -1 / Math.sqrt(3), 1e-14));
check('1⊗1 ⟨1 1;1 −1|0 0⟩ = 1/√3', close(cgFloat(1, 1, 1, -1, 0, 0), 1 / Math.sqrt(3), 1e-14));
check('1⊗1 ⟨1 0;1 0|2 0⟩ = √(2/3)', close(cgFloat(1, 0, 1, 0, 2, 0), Math.sqrt(2 / 3), 1e-14));
check('2⊗1 ⟨2 1;1 0|2 1⟩ = 1/√6', close(cgFloat(2, 1, 1, 0, 2, 1), 1 / Math.sqrt(6), 1e-14));
check('selection M = m1+m2', cgFloat(1, 1, 1, 0, 2, 0) === 0 && cgFloat(1, 1, 1, 1, 3, 2) === 0);
check('exact singlet', textSqrtRational(cgExact(h, -h, h, h, 0, 0)) === '−1/√2');
check('exact 1⊗½', texSqrtRational(cgExact(1, 0, h, h, 1.5, 0.5)) === '\\sqrt{\\tfrac{2}{3}}');
check('exact zero', cgExact(1, 0, 1, 0, 1, 0).sign === 0);
// Condon–Shortley convention: ⟨j1 j1; j2 (J − j1)|J J⟩ > 0
for (let a = 0; a <= 7; a++)
  for (let b = 0; b <= 7; b++) {
    const j1 = a / 2;
    const j2 = b / 2;
    for (const J of multiplets(j1, j2)) check(`CS phase ${j1}⊗${j2} J=${J}`, cgFloat(j1, j1, j2, J - j1, J, J) > 0);
  }
// exact = float, orthonormality, completeness, exchange symmetry, eigenvectors of J² and J_z
let exactErr = 0;
for (let a = 0; a <= 7; a++)
  for (let b = 0; b <= 7; b++) {
    const j1 = a / 2;
    const j2 = b / 2;
    const B = coupledBasis(j1, j2);
    const { dim } = productBasis(j1, j2);
    check(`basis size ${j1}⊗${j2}`, B.length === dim);
    check(`dimension count ${j1}⊗${j2}`, multiplets(j1, j2).reduce((s, J) => s + 2 * J + 1, 0) === dim);
    // orthonormality of the coupled states
    let oErr = 0;
    for (let p = 0; p < B.length; p++)
      for (let q = p; q < B.length; q++) {
        let s = 0;
        for (let i = 0; i < dim; i++) s += B[p].v[i] * B[q].v[i];
        oErr = Math.max(oErr, Math.abs(s - (p === q ? 1 : 0)));
      }
    check(`orthonormal ${j1}⊗${j2}`, oErr < 1e-12, `err=${oErr}`);
    // completeness: Σ_{JM} |JM⟩⟨JM| = 1
    let cErr = 0;
    for (let i = 0; i < dim; i++)
      for (let k = 0; k < dim; k++) {
        let s = 0;
        for (const st of B) s += st.v[i] * st.v[k];
        cErr = Math.max(cErr, Math.abs(s - (i === k ? 1 : 0)));
      }
    check(`complete ${j1}⊗${j2}`, cErr < 1e-12);
    // eigenvectors of total J² and J_z
    const T = totalJ(j1, j2);
    let eErr = 0;
    for (const st of B) {
      const v = Array.from(st.v);
      const J2v = mat.mulv(T.J2, v);
      const Jzv = mat.mulv(T.Jz, v);
      for (let i = 0; i < dim; i++) eErr = Math.max(eErr, Math.abs(J2v[i] - casimir(st.J) * v[i]), Math.abs(Jzv[i] - st.M * v[i]));
      // J₋|J M⟩ = √((J+M)(J−M+1)) |J M−1⟩ with positive CG-consistent phase
      if (st.M > -st.J) {
        const Jmv = mat.mulv(T.Jm, v);
        const below = coupledVector(j1, j2, st.J, st.M - 1);
        const f = jMinusElement(st.J, st.M);
        for (let i = 0; i < dim; i++) eErr = Math.max(eErr, Math.abs(Jmv[i] - f * below[i]));
      }
    }
    check(`|J M⟩ eigenvectors of J², J_z; J₋ ladder ${j1}⊗${j2}`, eErr < 1e-11, `err=${eErr}`);
    // exact vs float and exchange symmetry ⟨j2 m2; j1 m1|J M⟩ = (−1)^{j1+j2−J} ⟨j1 m1; j2 m2|J M⟩
    for (const J of multiplets(j1, j2))
      for (const M of mValues(J))
        for (const m1 of mValues(j1)) {
          const m2 = M - m1;
          if (Math.abs(m2) > j2 + 1e-9) continue;
          const f = cgFloat(j1, m1, j2, m2, J, M);
          exactErr = Math.max(exactErr, Math.abs(cgExactValue(cgExact(j1, m1, j2, m2, J, M)) - f));
          const sg = Math.round(j1 + j2 - J) % 2 ? -1 : 1;
          check('exchange symmetry', close(cgFloat(j2, m2, j1, m1, J, M), sg * f, 1e-12));
          check('m → −m symmetry', close(cgFloat(j1, -m1, j2, -m2, J, -M), sg * f, 1e-12));
        }
  }
check('exact = float (all j1, j2 ≤ 7/2)', exactErr < 1e-12, `err=${exactErr}`);
// rotation covariance: (D^{j1} ⊗ D^{j2}) |J M⟩ = Σ_{M'} D^J_{M'M} |J M'⟩  (so J is never changed)
for (const [j1, j2] of [[0.5, 0.5], [1, 0.5], [1, 1], [1.5, 1], [2, 1.5], [3.5, 3]])
  for (let t = 0; t < 4; t++) {
    const e = randEuler();
    const U = ckron(wignerD(j1, ...e), wignerD(j2, ...e));
    for (const J of multiplets(j1, j2)) {
      const DJ = wignerD(J, ...e);
      for (const M of mValues(J)) {
        const v = Array.from(coupledVector(j1, j2, J, M), (x) => ({ re: x, im: 0 }));
        const lhs = cmat.apply(U, v);
        let err = 0;
        const rhs = lhs.map(() => ({ re: 0, im: 0 }));
        mValues(J).forEach((Mp, a) => {
          const w = coupledVector(j1, j2, J, Mp);
          const coef = DJ[a][Math.round(J - M)];
          for (let i = 0; i < w.length; i++) {
            rhs[i].re += coef.re * w[i];
            rhs[i].im += coef.im * w[i];
          }
        });
        for (let i = 0; i < lhs.length; i++) err = Math.max(err, Math.hypot(lhs[i].re - rhs[i].re, lhs[i].im - rhs[i].im));
        check(`D⊗D |JM⟩ = Σ D^J |JM'⟩ ${j1}⊗${j2} J=${J}`, err < 1e-10, `err=${err}`);
      }
    }
  }
// singlet invariance and J-content under a common R_y(β)
for (let t = 0; t < 10; t++) {
  const beta = 4 * Math.PI * rng();
  const psi = mat.mulv(productRotationY(0.5, 0.5, beta), Array.from(coupledVector(0.5, 0.5, 0, 0)));
  const s0 = Array.from(coupledVector(0.5, 0.5, 0, 0));
  check('singlet is rotation invariant', psi.every((x, i) => close(x, s0[i], 1e-12)));
  for (const [j1, j2, J, M] of [[1, 0.5, 1.5, 0.5], [1, 1, 1, 0], [2, 1, 2, -1], [3.5, 2.5, 3, 2]]) {
    const v = mat.mulv(productRotationY(j1, j2, beta), Array.from(coupledVector(j1, j2, J, M)));
    const amps = coupledAmplitudes(j1, j2, v);
    const inJ = amps.filter((x) => Math.abs(x.J - J) < 1e-9).reduce((s, x) => s + x.a * x.a, 0);
    const out = amps.filter((x) => Math.abs(x.J - J) > 1e-9).reduce((s, x) => s + x.a * x.a, 0);
    check(`J preserved by rotation ${j1}⊗${j2} J=${J}`, close(inJ, 1, 1e-11) && out < 1e-22);
  }
}
// half-integer total J changes sign under 2π, integer J does not
{
  const v = Array.from(coupledVector(1, 0.5, 1.5, 0.5));
  const w = mat.mulv(productRotationY(1, 0.5, TAU), v);
  check('2π on J = 3/2 gives −1', w.every((x, i) => close(x, -v[i], 1e-11)));
  const u = Array.from(coupledVector(1, 1, 2, 1));
  const u2 = mat.mulv(productRotationY(1, 1, TAU), u);
  check('2π on J = 2 gives +1', u2.every((x, i) => close(x, u[i], 1e-11)));
}
// counting: n(M), hooks (one dot per diagonal), characters χ_{j1}χ_{j2} = Σ χ_J
for (let a = 0; a <= 7; a++)
  for (let b = 0; b <= 7; b++) {
    const j1 = a / 2;
    const j2 = b / 2;
    const Js = multiplets(j1, j2);
    for (let M = -(j1 + j2); M <= j1 + j2 + 1e-9; M += 1)
      check(`n(M) = #{J ≥ |M|} ${j1}⊗${j2} M=${M}`, countM(j1, j2, M) === Js.filter((J) => J >= Math.abs(M) - 1e-9).length);
    const H = hooks(j1, j2);
    check(`hooks partition ${j1}⊗${j2}`, H.reduce((s, x) => s + x.states.length, 0) === dimOf(j1) * dimOf(j2));
    for (const hk of H) {
      const Ms = hk.states.map((s) => s.M);
      const want = mValues(hk.J);
      check(`hook ${hk.k} has one dot per M ${j1}⊗${j2}`, Ms.length === want.length && Ms.every((x, i) => close(x, want[i], 1e-9)));
      check(`hook top is (j1 − k, j2) ${j1}⊗${j2}`, close(hk.states[0].m1, j1 - hk.k) && close(hk.states[0].m2, j2));
    }
    const th = 0.37 + rng();
    check(`characters ${j1}⊗${j2}`, close(character(j1, th) * character(j2, th), Js.reduce((s, J) => s + character(J, th), 0), 1e-11));
  }
check('character formula', close(character(1.5, 0.8), Math.sin(4 * 0.4) / Math.sin(0.4), 1e-12));

// ---------------------------------------------------------------- 6. phase colours
section('colours');
for (const dark of [true, false]) {
  const { L, C } = phaseStyle(dark);
  let okGamut = true;
  for (let i = 0; i < 360; i += 5) { const c = Math.min(C, 0.985 * maxChroma(L, i)); if (!oklchToRgb(L, c, i).inGamut || c < 0.08) okGamut = false; }
  check(`phase map in sRGB gamut (dark=${dark})`, okGamut);
  const a = phaseRGB(0, dark);
  const b = phaseRGB(TAU - 1e-9, dark);
  check(`phase map cyclic (dark=${dark})`, a.every((x, i) => close(x, b[i], 1e-6)));
  const p = phaseRGB(0, dark);
  const n = phaseRGB(Math.PI, dark);
  check(`+ is blue, − is amber (dark=${dark})`, p[2] > p[0] && n[0] > n[2]);
  const lut = phaseLUT(64, dark);
  check('LUT index wraps', lut.index(-1e-9) === 0 && lut.index(TAU) === 0 && lut.index(Math.PI) === 32);
  // smooth: constant lightness, chroma a continuous function of hue (gamut-mapped only near cyan),
  // and no large jumps between neighbouring LUT entries even in gamma-encoded sRGB
  let maxDC = 0;
  for (let hh = 0; hh < 360; hh++) {
    const c1 = Math.min(C, 0.985 * maxChroma(L, hh));
    const c2 = Math.min(C, 0.985 * maxChroma(L, hh + 1));
    maxDC = Math.max(maxDC, Math.abs(c1 - c2));
  }
  check(`chroma continuous in hue (dark=${dark})`, maxDC < 0.006, `dC=${maxDC}`);
  let maxJump = 0;
  for (let i = 0; i < 64; i++) {
    const j = (i + 1) % 64;
    maxJump = Math.max(maxJump, Math.hypot(lut.rgb[3 * i] - lut.rgb[3 * j], lut.rgb[3 * i + 1] - lut.rgb[3 * j + 1], lut.rgb[3 * i + 2] - lut.rgb[3 * j + 2]));
  }
  check(`phase LUT neighbours close (dark=${dark})`, maxJump < 0.15, `jump=${maxJump}`);
}
void spin;
void rotY;
void expSO3;

section('end');
for (let i = 0; i < sections.length - 1; i++) {
  const [name, p0, f0] = sections[i];
  const [, p1, f1] = sections[i + 1];
  console.log(`  ${name.padEnd(20)} ${String(p1 - p0).padStart(6)} passed  ${f1 - f0 ? f1 - f0 + ' FAILED' : ''}`);
}
console.log(`reps tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
