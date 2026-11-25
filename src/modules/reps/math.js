// DOM-free mathematics for the "reps" module (spin multiplets & representations).
//
// Conventions (docs/ARCHITECTURE.md): ħ = 1, Hermitian generators, U(R) = exp(−iθ n̂·J),
// [J_i, J_j] = iε_ijk J_k, active right-handed rotations, z-up. Spin vectors/matrices use the basis
// ordered m = j, j−1, …, −j (vector index k = j − m), exactly like core/complex.js spinMatrices().
//
// Euler angles are ZYZ: R(α,β,γ) = R_z(α) R_y(β) R_z(γ) (active), represented on spin j by
//     D^j(α,β,γ) = e^{−iαJ_z} e^{−iβJ_y} e^{−iγJ_z},   D_{m'm} = e^{−im'α} d^j_{m'm}(β) e^{−imγ}
// (core wignerD). Spherical harmonics carry the Condon–Shortley phase, so L_± act on Y_lm with the
// same positive matrix elements as spinMatrices(l), and rotating a function on the sphere,
//     (U(R) f)(r̂) = f(R⁻¹ r̂),  f = Σ_m c_m Y_lm   ⇔   c'_{m'} = Σ_m D^l_{m'm}(R) c_m ,
// which tests/reps.test.mjs checks at random points and rotations (this pins all the signs).

import { mat, clamp, TAU, factorial, rotY, rotZ } from '../../core/la.js';
import { cmat, spinMatrices, wignerD, wignerSmallD } from '../../core/complex.js';

const EPS = 1e-9;
const C0 = () => ({ re: 0, im: 0 });

// ------------------------------------------------------------------ spin ladder
/** Dimension 2j+1 of the spin-j multiplet. */
export const dimOf = (j) => Math.round(2 * j) + 1;

/** m values in basis order m = j, j−1, …, −j. */
export function mValues(j) {
  const n = dimOf(j);
  return Array.from({ length: n }, (_, k) => j - k);
}

/** Quadratic Casimir eigenvalue j(j+1). */
export const casimir = (j) => j * (j + 1);

/** Integer N = (j−m)(j+m+1) with ⟨j, m+1|J₊|j, m⟩ = √N (zero at the top rung m = j). */
export function ladderN(j, m) {
  return Math.max(0, Math.round((j - m) * (j + m + 1)));
}
/** ⟨j, m+1|J₊|j, m⟩ = √((j−m)(j+m+1)). */
export const jPlusElement = (j, m) => Math.sqrt(ladderN(j, m));
/** ⟨j, m−1|J₋|j, m⟩ = √((j+m)(j−m+1)) = ⟨j, m|J₊|j, m−1⟩ (J₋ = J₊†). */
export const jMinusElement = (j, m) => Math.sqrt(ladderN(j, m - 1));

/**
 * Semiclassical vector model of |j m⟩: a vector of length √(j(j+1)) on a cone about z with
 * projection m, half-angle θ (cos θ = m/√(j(j+1))) and transverse radius √(j(j+1) − m²)
 * (= √⟨J_x² + J_y²⟩, since ⟨J_x⟩ = ⟨J_y⟩ = 0 in |j m⟩).
 */
export function vectorModel(j, m) {
  const len = Math.sqrt(casimir(j));
  if (len < EPS) return { len: 0, theta: 0, rho: 0, z: 0 };
  return { len, theta: Math.acos(clamp(m / len, -1, 1)), rho: Math.sqrt(Math.max(0, len * len - m * m)), z: m };
}

const spinCache = new Map();
/** Memoised core spinMatrices(j) (they are used every frame for expectation values). */
export function spin(j) {
  const key = Math.round(2 * j);
  let s = spinCache.get(key);
  if (!s) {
    s = spinMatrices(key / 2);
    spinCache.set(key, s);
  }
  return s;
}

/** J² = J_x² + J_y² + J_z² from the core matrices and its largest deviation from j(j+1)·1. */
export function casimirCheck(j) {
  const { Jx, Jy, Jz, dim } = spin(j);
  const X = cmat.fromReal(Jx);
  const Z = cmat.fromReal(Jz);
  const J2 = cmat.add(cmat.add(cmat.mul(X, X), cmat.mul(Jy, Jy)), cmat.mul(Z, Z));
  let err = 0;
  for (let a = 0; a < dim; a++)
    for (let b = 0; b < dim; b++) {
      const t = a === b ? casimir(j) : 0;
      err = Math.max(err, Math.hypot(J2[a][b].re - t, J2[a][b].im));
    }
  return { J2, err };
}

/** ⟨c|A|c⟩ for a real or complex matrix A and a complex vector c. Returns {re, im}. */
export function expect(A, c) {
  let re = 0;
  let im = 0;
  for (let a = 0; a < c.length; a++) {
    const ca = c[a];
    for (let b = 0; b < c.length; b++) {
      const e = A[a][b];
      const er = typeof e === 'number' ? e : e.re;
      const ei = typeof e === 'number' ? 0 : e.im;
      if (er === 0 && ei === 0) continue;
      // conj(ca) · e · cb
      const tr = er * c[b].re - ei * c[b].im;
      const ti = er * c[b].im + ei * c[b].re;
      re += ca.re * tr + ca.im * ti;
      im += ca.re * ti - ca.im * tr;
    }
  }
  return { re, im };
}

/** Expectation value ⟨J⟩ = (⟨J_x⟩, ⟨J_y⟩, ⟨J_z⟩) of a normalised spin-j (or orbital-l) state c. */
export function expectJ(j, c) {
  const { Jx, Jy, Jz } = spin(j);
  return [expect(Jx, c).re, expect(Jy, c).re, expect(Jz, c).re];
}

// ------------------------------------------------------------------ spherical harmonics
/** Associated Legendre function P_l^m(x), 0 ≤ m ≤ l, INCLUDING the Condon–Shortley phase (−1)^m. */
export function assocLegendre(l, m, x) {
  if (m < 0 || m > l) return 0;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  let pmm = 1;
  for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s; // (−1)^m (2m−1)!! (1−x²)^{m/2}
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pm1;
  let pl = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pl = (x * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1;
    pm1 = pl;
  }
  return pl;
}

/** Normalisation √((2l+1)/(4π) · (l−|m|)!/(l+|m|)!). */
export function ylmNorm(l, m) {
  const a = Math.abs(m);
  return Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - a) / factorial(l + a)));
}

/** Y_lm(θ, φ) with the Condon–Shortley phase; Y_{l,−m} = (−1)^m conj(Y_lm). Returns {re, im}. */
export function Ylm(l, m, theta, phi) {
  const a = Math.abs(m);
  if (a > l) return C0();
  const v = ylmNorm(l, a) * assocLegendre(l, a, Math.cos(theta));
  let re = v * Math.cos(a * phi);
  let im = v * Math.sin(a * phi);
  if (m < 0) {
    const sg = a % 2 ? -1 : 1;
    re *= sg;
    im *= -sg;
  }
  return { re, im };
}

/** All 2l+1 harmonics at (θ, φ) in basis order m = l … −l. */
export function ylmAll(l, theta, phi) {
  const out = new Array(2 * l + 1);
  const x = Math.cos(theta);
  for (let m = 0; m <= l; m++) {
    const v = ylmNorm(l, m) * assocLegendre(l, m, x);
    const c = Math.cos(m * phi);
    const s = Math.sin(m * phi);
    out[l - m] = { re: v * c, im: v * s };
    if (m > 0) {
      const sg = m % 2 ? -1 : 1;
      out[l + m] = { re: sg * v * c, im: -sg * v * s };
    }
  }
  return out;
}

/** (θ, φ) of a non-zero 3-vector. */
export function anglesOf([x, y, z]) {
  const r = Math.hypot(x, y, z) || 1;
  return [Math.acos(clamp(z / r, -1, 1)), Math.atan2(y, x)];
}

/** f(r̂) = Σ_m c_m Y_lm(r̂) for a direction vector (need not be normalised). */
export function evalState(l, c, dir) {
  const [th, ph] = anglesOf(dir);
  const Y = ylmAll(l, th, ph);
  let re = 0;
  let im = 0;
  for (let k = 0; k < Y.length; k++) {
    re += c[k].re * Y[k].re - c[k].im * Y[k].im;
    im += c[k].re * Y[k].im + c[k].im * Y[k].re;
  }
  return { re, im };
}

/**
 * Table of Y_lm on a list of (θ, φ) pairs: { re, im } Float64Arrays of length n(2l+1),
 * entry [v(2l+1) + k] for vertex v and basis index k = l − m.
 */
export function ylmTable(l, thetas, phis) {
  const n = thetas.length;
  const d = 2 * l + 1;
  const re = new Float64Array(n * d);
  const im = new Float64Array(n * d);
  for (let v = 0; v < n; v++) {
    const Y = ylmAll(l, thetas[v], phis[v]);
    for (let k = 0; k < d; k++) {
      re[v * d + k] = Y[k].re;
      im[v * d + k] = Y[k].im;
    }
  }
  return { re, im, d, n };
}

// ------------------------------------------------------------------ states of definite l
/** Basis vector |l m⟩ (complex coefficient array in order m = l … −l). */
export function basisState(l, m) {
  const c = Array.from({ length: 2 * l + 1 }, C0);
  c[l - m] = { re: 1, im: 0 };
  return c;
}

/**
 * Real ("chemist's") orbital: m = 0 → Y_l0; type 'c' → (Y_{l,−m} + (−1)^m Y_lm)/√2 ∝ cos mφ;
 * type 's' → i(Y_{l,−m} − (−1)^m Y_lm)/√2 ∝ sin mφ (both with a positive leading polynomial,
 * e.g. p_x ∝ +x, d_xy ∝ +xy).
 */
export function realOrbital(l, m, type = 'c') {
  const c = Array.from({ length: 2 * l + 1 }, C0);
  if (m === 0) {
    c[l] = { re: 1, im: 0 };
    return c;
  }
  const sg = m % 2 ? -1 : 1;
  const r = Math.SQRT1_2;
  if (type === 'c') {
    c[l + m] = { re: r, im: 0 }; // Y_{l,−m}
    c[l - m] = { re: sg * r, im: 0 }; // Y_{l,m}
  } else {
    c[l + m] = { re: 0, im: r };
    c[l - m] = { re: 0, im: -sg * r };
  }
  return c;
}

/**
 * Named real orbitals per l: { id, tex, m, type, poly(x,y,z) } — poly is a Cartesian polynomial the
 * orbital is proportional to (with a positive constant) on the unit sphere (used by the tests).
 */
export const ORBITALS = {
  0: [{ id: 's', tex: 's', m: 0, type: 'c', poly: () => 1 }],
  1: [
    { id: 'pz', tex: 'p_z', m: 0, type: 'c', poly: (x, y, z) => z },
    { id: 'px', tex: 'p_x', m: 1, type: 'c', poly: (x) => x },
    { id: 'py', tex: 'p_y', m: 1, type: 's', poly: (x, y) => y },
  ],
  2: [
    { id: 'dz2', tex: 'd_{z^2}', m: 0, type: 'c', poly: (x, y, z) => 3 * z * z - 1 },
    { id: 'dxz', tex: 'd_{xz}', m: 1, type: 'c', poly: (x, y, z) => x * z },
    { id: 'dyz', tex: 'd_{yz}', m: 1, type: 's', poly: (x, y, z) => y * z },
    { id: 'dx2y2', tex: 'd_{x^2-y^2}', m: 2, type: 'c', poly: (x, y) => x * x - y * y },
    { id: 'dxy', tex: 'd_{xy}', m: 2, type: 's', poly: (x, y) => x * y },
  ],
  3: [
    { id: 'fz3', tex: 'f_{z^3}', m: 0, type: 'c', poly: (x, y, z) => z * (5 * z * z - 3) },
    { id: 'fxz2', tex: 'f_{xz^2}', m: 1, type: 'c', poly: (x, y, z) => x * (5 * z * z - 1) },
    { id: 'fyz2', tex: 'f_{yz^2}', m: 1, type: 's', poly: (x, y, z) => y * (5 * z * z - 1) },
    { id: 'fzx2y2', tex: 'f_{z(x^2-y^2)}', m: 2, type: 'c', poly: (x, y, z) => z * (x * x - y * y) },
    { id: 'fxyz', tex: 'f_{xyz}', m: 2, type: 's', poly: (x, y, z) => x * y * z },
    { id: 'fx3', tex: 'f_{x(x^2-3y^2)}', m: 3, type: 'c', poly: (x, y) => x * (x * x - 3 * y * y) },
    { id: 'fy3', tex: 'f_{y(3x^2-y^2)}', m: 3, type: 's', poly: (x, y) => y * (3 * x * x - y * y) },
  ],
  4: [
    { id: 'gz4', tex: 'g_{z^4}', m: 0, type: 'c', poly: (x, y, z) => 35 * z ** 4 - 30 * z * z + 3 },
    { id: 'gxz3', tex: 'g_{xz^3}', m: 1, type: 'c', poly: (x, y, z) => x * z * (7 * z * z - 3) },
    { id: 'gyz3', tex: 'g_{yz^3}', m: 1, type: 's', poly: (x, y, z) => y * z * (7 * z * z - 3) },
    { id: 'gz2x2y2', tex: 'g_{z^2(x^2-y^2)}', m: 2, type: 'c', poly: (x, y, z) => (x * x - y * y) * (7 * z * z - 1) },
    { id: 'gxyz2', tex: 'g_{xyz^2}', m: 2, type: 's', poly: (x, y, z) => x * y * (7 * z * z - 1) },
    { id: 'gxz', tex: 'g_{xz(x^2-3y^2)}', m: 3, type: 'c', poly: (x, y, z) => x * z * (x * x - 3 * y * y) },
    { id: 'gyz', tex: 'g_{yz(3x^2-y^2)}', m: 3, type: 's', poly: (x, y, z) => y * z * (3 * x * x - y * y) },
    { id: 'gx4', tex: 'g_{x^4-6x^2y^2+y^4}', m: 4, type: 'c', poly: (x, y) => x ** 4 - 6 * x * x * y * y + y ** 4 },
    { id: 'gxy', tex: 'g_{xy(x^2-y^2)}', m: 4, type: 's', poly: (x, y) => x * y * (x * x - y * y) },
  ],
};

/** Normalise a complex vector (returns a new array; the zero vector becomes |l, m=top⟩-free zero). */
export function normalizeC(c) {
  const n = Math.sqrt(c.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0));
  if (!(n > 1e-300)) return c.map(C0);
  return c.map((z) => ({ re: z.re / n, im: z.im / n }));
}

/** Seeded random normalised complex vector of length d (Gaussian components). */
export function randomState(d, rng) {
  const g = () => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
  };
  return normalizeC(Array.from({ length: d }, () => ({ re: g(), im: g() })));
}

// ------------------------------------------------------------------ rotations
/** Active rotation R(α,β,γ) = R_z(α) R_y(β) R_z(γ). */
export const eulerMatrix = (a, b, g) => mat.chain(rotZ(a), rotY(b), rotZ(g));

/**
 * ZYZ Euler angles of a rotation matrix: α, γ ∈ [0, 2π), β ∈ [0, π]. In the gimbal cases
 * (β = 0 or π) γ is set to 0. eulerMatrix(...eulerAngles(R)) = R.
 */
export function eulerAngles(R) {
  const sb = Math.hypot(R[0][2], R[1][2]);
  const beta = Math.atan2(sb, clamp(R[2][2], -1, 1));
  let alpha;
  let gamma;
  if (sb > 1e-10) {
    alpha = Math.atan2(R[1][2], R[0][2]);
    gamma = Math.atan2(R[2][1], -R[2][0]);
  } else if (R[2][2] > 0) {
    alpha = Math.atan2(R[1][0], R[0][0]);
    gamma = 0;
  } else {
    alpha = Math.atan2(-R[1][0], -R[0][0]);
    gamma = 0;
  }
  const w = (x) => {
    const y = x % TAU;
    return y < 0 ? y + TAU : y;
  };
  return [w(alpha), beta, w(gamma)];
}

/** c' = D^l(α,β,γ) c. Returns { D, c }. */
export function rotateCoeffs(l, c, a, b, g) {
  const D = wignerD(l, a, b, g);
  return { D, c: cmat.apply(D, c) };
}

/** Spherical basis e_{+1} = −(e_x + i e_y)/√2, e_0 = e_z, e_{−1} = (e_x − i e_y)/√2 (order m = 1, 0, −1). */
export function sphericalBasis() {
  const r = Math.SQRT1_2;
  return [
    [{ re: -r, im: 0 }, { re: 0, im: -r }, { re: 0, im: 0 }],
    [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }],
    [{ re: r, im: 0 }, { re: 0, im: -r }, { re: 0, im: 0 }],
  ];
}

// ------------------------------------------------------------------ quadrature on the sphere
/** Gauss–Legendre nodes and weights on [−1, 1] (exact for polynomials of degree ≤ 2n−1). */
export function gaussLegendre(n) {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 1;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let k = 1; k <= n; k++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * k - 1) * z * p2 - (k - 1) * p3) / k;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const dz = p1 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}

/**
 * Product rule on S²: Gauss–Legendre in cos θ × equally spaced φ. Exact for Y*_{l'm'} Y_{lm}
 * products when nTheta > l + l' and nPhi > |m − m'|. Returns { dirs, thetas, phis, weights, n }.
 */
export function sphereQuadrature(nTheta = 10, nPhi = 20) {
  const { x, w } = gaussLegendre(nTheta);
  const dirs = [];
  const thetas = [];
  const phis = [];
  const weights = [];
  for (let i = 0; i < nTheta; i++) {
    const ct = x[i];
    const st = Math.sqrt(Math.max(0, 1 - ct * ct));
    for (let j = 0; j < nPhi; j++) {
      const ph = (TAU * j) / nPhi;
      dirs.push([st * Math.cos(ph), st * Math.sin(ph), ct]);
      thetas.push(Math.acos(ct));
      phis.push(ph);
      weights.push((w[i] * TAU) / nPhi);
    }
  }
  return { dirs, thetas, phis, weights, n: dirs.length };
}

/**
 * Project a function on the sphere onto Y_{l'm'} for l' = 0 … lmax by quadrature.
 * f(dir, q) → {re, im}. Returns { coeffs: [l'] → array (m' = l' … −l') of {re, im}, weight: [l'] → Σ|c|² }.
 * Pass a cached table from projectionTable() for speed.
 */
export function projectionTable(lmax, quad) {
  const tabs = [];
  for (let l = 0; l <= lmax; l++) tabs.push(ylmTable(l, quad.thetas, quad.phis));
  return { lmax, quad, tabs };
}
export function projectOnto(table, values) {
  const { lmax, quad, tabs } = table;
  const coeffs = [];
  const weight = [];
  for (let l = 0; l <= lmax; l++) {
    const T = tabs[l];
    const d = 2 * l + 1;
    const cl = Array.from({ length: d }, C0);
    for (let q = 0; q < quad.n; q++) {
      const fr = values[q].re;
      const fi = values[q].im;
      const wq = quad.weights[q];
      for (let k = 0; k < d; k++) {
        const yr = T.re[q * d + k];
        const yi = T.im[q * d + k];
        // conj(Y) f
        cl[k].re += wq * (yr * fr + yi * fi);
        cl[k].im += wq * (yr * fi - yi * fr);
      }
    }
    coeffs.push(cl);
    weight.push(cl.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0));
  }
  return { coeffs, weight };
}

// ------------------------------------------------------------------ Clebsch–Gordan coefficients
const near = (x) => Math.abs(x - Math.round(x)) < EPS;
/** |m| ≤ j and j − m integer. */
export const validJM = (j, m) => Math.abs(m) <= j + EPS && near(j - m) && near(2 * j);
/** Triangle rule |j1 − j2| ≤ J ≤ j1 + j2 with j1 + j2 + J integer. */
export const triangle = (j1, j2, J) => J >= Math.abs(j1 - j2) - EPS && J <= j1 + j2 + EPS && near(j1 + j2 + J);

function racahRange(j1, m1, j2, m2, J) {
  const I = Math.round;
  return [Math.max(0, I(j2 - J - m1), I(j1 - J + m2)), Math.min(I(j1 + j2 - J), I(j1 - m1), I(j2 + m2))];
}

/**
 * ⟨j1 m1; j2 m2 | J M⟩ in the Condon–Shortley convention (Racah's closed formula), double precision.
 * Zero unless M = m1 + m2 and the triangle rule holds.
 */
export function cgFloat(j1, m1, j2, m2, J, M) {
  if (Math.abs(m1 + m2 - M) > EPS || !triangle(j1, j2, J) || !validJM(j1, m1) || !validJM(j2, m2) || !validJM(J, M)) return 0;
  const f = (x) => factorial(Math.round(x));
  const pre =
    Math.sqrt(((2 * J + 1) * f(J + j1 - j2) * f(J - j1 + j2) * f(j1 + j2 - J)) / f(j1 + j2 + J + 1)) *
    Math.sqrt(f(J + M) * f(J - M) * f(j1 - m1) * f(j1 + m1) * f(j2 - m2) * f(j2 + m2));
  const [k0, k1] = racahRange(j1, m1, j2, m2, J);
  let s = 0;
  for (let k = k0; k <= k1; k++)
    s += (k % 2 ? -1 : 1) / (f(k) * f(j1 + j2 - J - k) * f(j1 - m1 - k) * f(j2 + m2 - k) * f(J - j2 + m1 + k) * f(J - j1 - m2 + k));
  return pre * s;
}

const bigFacts = [1n];
function bigFact(n) {
  for (let i = bigFacts.length; i <= n; i++) bigFacts[i] = bigFacts[i - 1] * BigInt(i);
  return bigFacts[n];
}
function bgcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Exact Clebsch–Gordan coefficient: { sign ∈ {−1, 0, 1}, num, den } (BigInt) with
 * ⟨j1 m1; j2 m2 | J M⟩ = sign · √(num/den), num/den in lowest terms.
 */
export function cgExact(j1, m1, j2, m2, J, M) {
  const zero = { sign: 0, num: 0n, den: 1n };
  if (Math.abs(m1 + m2 - M) > EPS || !triangle(j1, j2, J) || !validJM(j1, m1) || !validJM(j2, m2) || !validJM(J, M)) return zero;
  const F = (x) => bigFact(Math.round(x));
  const [k0, k1] = racahRange(j1, m1, j2, m2, J);
  let sN = 0n;
  let sD = 1n;
  for (let k = k0; k <= k1; k++) {
    const D = F(k) * F(j1 + j2 - J - k) * F(j1 - m1 - k) * F(j2 + m2 - k) * F(J - j2 + m1 + k) * F(J - j1 - m2 + k);
    sN = sN * D + (k % 2 ? -1n : 1n) * sD;
    sD *= D;
    const g = bgcd(sN, sD);
    if (g > 1n) {
      sN /= g;
      sD /= g;
    }
  }
  if (sN === 0n) return zero;
  let num = BigInt(Math.round(2 * J + 1)) * F(J + j1 - j2) * F(J - j1 + j2) * F(j1 + j2 - J);
  num *= F(J + M) * F(J - M) * F(j1 - m1) * F(j1 + m1) * F(j2 - m2) * F(j2 + m2) * sN * sN;
  let den = F(j1 + j2 + J + 1) * sD * sD;
  const g = bgcd(num, den);
  num /= g;
  den /= g;
  return { sign: sN > 0n ? 1 : -1, num, den };
}
/** Exact value as a double (for checks). */
export const cgExactValue = (e) => (e.sign === 0 ? 0 : e.sign * Math.sqrt(Number(e.num) / Number(e.den)));

/** Multiplets in j1 ⊗ j2, from the top: [j1+j2, j1+j2−1, …, |j1−j2|]. */
export function multiplets(j1, j2) {
  const out = [];
  const n = Math.round(2 * Math.min(j1, j2)) + 1;
  for (let k = 0; k < n; k++) out.push(j1 + j2 - k);
  return out;
}

/**
 * Product basis |j1 m1⟩|j2 m2⟩ in Kronecker order (index = i1·d2 + i2, i = j − m), each with
 * M = m1 + m2 and its "hook" k = min(j1 − m1, j2 + m2): the k-th multiplet J = j1 + j2 − k in the
 * peeling (counting) picture — one dot per diagonal M ∈ [−J, J].
 */
export function productBasis(j1, j2) {
  const d1 = dimOf(j1);
  const d2 = dimOf(j2);
  const list = [];
  for (let i1 = 0; i1 < d1; i1++)
    for (let i2 = 0; i2 < d2; i2++) {
      const m1 = j1 - i1;
      const m2 = j2 - i2;
      list.push({ i1, i2, idx: i1 * d2 + i2, m1, m2, M: m1 + m2, hook: Math.round(Math.min(j1 - m1, j2 + m2)) });
    }
  return { d1, d2, dim: d1 * d2, list };
}

/** Number of product states with m1 + m2 = M. */
export function countM(j1, j2, M) {
  let n = 0;
  for (const m1 of mValues(j1)) {
    const m2 = M - m1;
    if (validJM(j2, m2)) n++;
  }
  return n;
}

/** The hooks (peeling order): [{ J, k, states (product states sorted by M descending) }]. */
export function hooks(j1, j2) {
  const { list } = productBasis(j1, j2);
  return multiplets(j1, j2).map((J, k) => ({
    J,
    k,
    states: list.filter((s) => s.hook === k).sort((a, b) => b.M - a.M),
  }));
}

/** |J M⟩ as a real vector in the product basis (CG coefficients, Kronecker order). */
export function coupledVector(j1, j2, J, M) {
  const d1 = dimOf(j1);
  const d2 = dimOf(j2);
  const v = new Float64Array(d1 * d2);
  if (!triangle(j1, j2, J) || !validJM(J, M)) return v;
  for (let i1 = 0; i1 < d1; i1++) {
    const m1 = j1 - i1;
    const m2 = M - m1;
    if (!validJM(j2, m2)) continue;
    const i2 = Math.round(j2 - m2);
    v[i1 * d2 + i2] = cgFloat(j1, m1, j2, m2, J, M);
  }
  return v;
}

const coupledCache = new Map();
/** All coupled states of j1 ⊗ j2: [{ J, M, k, v }] ordered J = j1+j2 … |j1−j2|, M = J … −J (cached). */
export function coupledBasis(j1, j2) {
  const key = `${Math.round(2 * j1)},${Math.round(2 * j2)}`;
  let out = coupledCache.get(key);
  if (out) return out;
  out = [];
  multiplets(j1, j2).forEach((J, k) => {
    for (const M of mValues(J)) out.push({ J, M, k, v: coupledVector(j1, j2, J, M) });
  });
  coupledCache.set(key, out);
  return out;
}

/** Total angular momentum on the product space: J = J⁽¹⁾⊗1 + 1⊗J⁽²⁾ (real matrices Jz, Jp, Jm, J2). */
export function totalJ(j1, j2) {
  const A = spin(j1);
  const B = spin(j2);
  const I1 = mat.eye(A.dim);
  const I2 = mat.eye(B.dim);
  const Jz = mat.add(mat.kron(A.Jz, I2), mat.kron(I1, B.Jz));
  const Jp = mat.add(mat.kron(A.Jp, I2), mat.kron(I1, B.Jp));
  const Jm = mat.transpose(Jp);
  const J2 = mat.add(mat.add(mat.mul(Jm, Jp), mat.mul(Jz, Jz)), Jz); // J² = J₋J₊ + J_z² + J_z
  return { Jz, Jp, Jm, J2 };
}

/** Kronecker product of complex matrices (A ⊗ B), index (a·dB + b). */
export function ckron(A, B) {
  const out = [];
  for (const ra of A)
    for (const rb of B) {
      const row = [];
      for (const a of ra) for (const b of rb) row.push({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
      out.push(row);
    }
  return out;
}

/** d^{j1}(β) ⊗ d^{j2}(β): the rotation R_y(β) of both subsystems (real). */
export function productRotationY(j1, j2, beta) {
  return mat.kron(wignerSmallD(j1, beta), wignerSmallD(j2, beta));
}

/** Amplitudes ⟨J' M'|ψ⟩ of a real product-basis vector ψ on the coupled basis: [{ J, M, k, a }]. */
export function coupledAmplitudes(j1, j2, psi) {
  return coupledBasis(j1, j2).map(({ J, M, k, v }) => {
    let a = 0;
    for (let i = 0; i < v.length; i++) a += v[i] * psi[i];
    return { J, M, k, a };
  });
}

/** Character of the spin-j representation for a rotation by θ: Σ_m e^{−imθ} = sin((2j+1)θ/2)/sin(θ/2). */
export function character(j, theta) {
  let s = 0;
  for (const m of mValues(j)) s += Math.cos(m * theta);
  return s;
}
