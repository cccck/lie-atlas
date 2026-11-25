// Complex numbers, complex matrices, Pauli matrices, spin-j matrices, Wigner D.
// No DOM — usable from Node.
// A complex number is a plain object {re, im}. A complex matrix is an array of rows of those.
// Physics conventions (ħ = 1): Hermitian generators, U(θ) = exp(−iθ n̂·J), [J_i, J_j] = i ε_ijk J_k.

import { mat, TAU } from './la.js';

export const C = (re = 0, im = 0) => ({ re, im });
export const I = Object.freeze({ re: 0, im: 1 });
export const ONE = Object.freeze({ re: 1, im: 0 });
export const ZERO = Object.freeze({ re: 0, im: 0 });

const toC = (z) => (typeof z === 'number' ? { re: z, im: 0 } : z);

export const cx = {
  of: toC,
  add: (a, b) => ((a = toC(a)), (b = toC(b)), { re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ((a = toC(a)), (b = toC(b)), { re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ((a = toC(a)), (b = toC(b)), { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    a = toC(a);
    b = toC(b);
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
  neg: (a) => ({ re: -a.re, im: -a.im }),
  conj: (a) => ({ re: a.re, im: -a.im }),
  abs: (a) => Math.hypot(a.re, a.im),
  abs2: (a) => a.re * a.re + a.im * a.im,
  arg: (a) => Math.atan2(a.im, a.re),
  polar: (r, th) => ({ re: r * Math.cos(th), im: r * Math.sin(th) }),
  /** e^{iθ} */
  cis: (th) => ({ re: Math.cos(th), im: Math.sin(th) }),
  exp: (a) => {
    const e = Math.exp(a.re);
    return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
  },
  log: (a) => ({ re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) }),
  sqrt: (a) => {
    const r = Math.hypot(a.re, a.im);
    const re = Math.sqrt((r + a.re) / 2);
    const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2));
    return { re, im };
  },
  pow: (a, n) => {
    const r = Math.pow(Math.hypot(a.re, a.im), n);
    const th = Math.atan2(a.im, a.re) * n;
    return { re: r * Math.cos(th), im: r * Math.sin(th) };
  },
  eq: (a, b, tol = 1e-9) => Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol,
  isInf: (a) => !Number.isFinite(a.re) || !Number.isFinite(a.im),
};

// ------------------------------------------------------------------ complex matrices
export const cmat = {
  zeros: (n, m = n) => Array.from({ length: n }, () => Array.from({ length: m }, () => ({ re: 0, im: 0 }))),
  eye: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 }))),
  /** Real matrix → complex matrix. */
  fromReal: (A) => A.map((r) => r.map((x) => ({ re: x, im: 0 }))),
  /** Build from separate real and imaginary parts. */
  fromParts: (Re, Im) => Re.map((r, i) => r.map((x, j) => ({ re: x, im: Im ? Im[i][j] : 0 }))),
  re: (A) => A.map((r) => r.map((z) => z.re)),
  im: (A) => A.map((r) => r.map((z) => z.im)),
  clone: (A) => A.map((r) => r.map((z) => ({ re: z.re, im: z.im }))),
  add: (A, B) => A.map((r, i) => r.map((z, j) => cx.add(z, B[i][j]))),
  sub: (A, B) => A.map((r, i) => r.map((z, j) => cx.sub(z, B[i][j]))),
  /** Multiply by a real or complex scalar. */
  scale: (A, s) => (typeof s === 'number' ? A.map((r) => r.map((z) => cx.scale(z, s))) : A.map((r) => r.map((z) => cx.mul(z, s)))),
  mul: (A, B) => {
    const n = A.length;
    const m = B[0].length;
    const p = B.length;
    const Cm = cmat.zeros(n, m);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < p; k++) {
        const a = A[i][k];
        if (a.re === 0 && a.im === 0) continue;
        for (let j = 0; j < m; j++) {
          const b = B[k][j];
          Cm[i][j].re += a.re * b.re - a.im * b.im;
          Cm[i][j].im += a.re * b.im + a.im * b.re;
        }
      }
    return Cm;
  },
  chain: (...Ms) => Ms.reduce((acc, M) => cmat.mul(acc, M)),
  /** Apply to a complex column vector (array of {re,im}). */
  apply: (A, v) =>
    A.map((r) =>
      r.reduce(
        (s, z, j) => ({ re: s.re + z.re * v[j].re - z.im * v[j].im, im: s.im + z.re * v[j].im + z.im * v[j].re }),
        { re: 0, im: 0 },
      ),
    ),
  dagger: (A) => A[0].map((_, j) => A.map((r) => cx.conj(r[j]))),
  transpose: (A) => A[0].map((_, j) => A.map((r) => r[j])),
  trace: (A) => A.reduce((s, r, i) => cx.add(s, r[i]), { re: 0, im: 0 }),
  det2: (A) => cx.sub(cx.mul(A[0][0], A[1][1]), cx.mul(A[0][1], A[1][0])),
  comm: (A, B) => cmat.sub(cmat.mul(A, B), cmat.mul(B, A)),
  normF: (A) => Math.sqrt(A.reduce((s, r) => s + r.reduce((t, z) => t + z.re * z.re + z.im * z.im, 0), 0)),
  maxAbs: (A) => Math.max(...A.map((r) => Math.max(...r.map((z) => Math.hypot(z.re, z.im))))),
  almostEqual: (A, B, tol = 1e-9) => A.every((r, i) => r.every((z, j) => cx.eq(z, B[i][j], tol))),
  /** Linear combination Σ c_k A_k with complex or real coefficients. */
  combo: (coeffs, mats) => {
    let R = cmat.zeros(mats[0].length, mats[0][0].length);
    coeffs.forEach((c, k) => {
      R = cmat.add(R, cmat.scale(mats[k], c));
    });
    return R;
  },
  /** Matrix exponential (scaling & squaring + Taylor). */
  expm: (A) => {
    const n = A.length;
    const nrm = Math.max(...A.map((r) => r.reduce((s, z) => s + Math.hypot(z.re, z.im), 0)));
    const s = nrm > 0.5 ? Math.ceil(Math.log2(nrm / 0.5)) : 0;
    const B = cmat.scale(A, 1 / Math.pow(2, s));
    let term = cmat.eye(n);
    let R = cmat.eye(n);
    for (let k = 1; k <= 30; k++) {
      term = cmat.scale(cmat.mul(term, B), 1 / k);
      R = cmat.add(R, term);
      if (cmat.maxAbs(term) < 1e-18) break;
    }
    for (let i = 0; i < s; i++) R = cmat.mul(R, R);
    return R;
  },
};

// ------------------------------------------------------------------ vectors in C^n
export const cvec = {
  dot: (u, v) => u.reduce((s, z, i) => cx.add(s, cx.mul(cx.conj(z), v[i])), { re: 0, im: 0 }), // ⟨u|v⟩
  norm: (v) => Math.sqrt(v.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0)),
  normalize: (v) => {
    const n = cvec.norm(v) || 1;
    return v.map((z) => cx.scale(z, 1 / n));
  },
  scale: (v, s) => v.map((z) => (typeof s === 'number' ? cx.scale(z, s) : cx.mul(z, s))),
  add: (u, v) => u.map((z, i) => cx.add(z, v[i])),
};

// ------------------------------------------------------------------ Pauli matrices & SU(2)
const c = (re, im = 0) => ({ re, im });
export const sigmaX = [
  [c(0), c(1)],
  [c(1), c(0)],
];
export const sigmaY = [
  [c(0), c(0, -1)],
  [c(0, 1), c(0)],
];
export const sigmaZ = [
  [c(1), c(0)],
  [c(0), c(-1)],
];
export const sigma = [sigmaX, sigmaY, sigmaZ];

/** n̂·σ for a real 3-vector n. */
export function sigmaDot(n) {
  return cmat.combo(n, sigma);
}

/** Spin-½ rotation U = exp(−iθ n̂·σ/2) = cos(θ/2) − i sin(θ/2) n̂·σ (θ may exceed 2π; U(2π) = −1). */
export function su2Rotation(axis, theta) {
  const n = Math.hypot(...axis) || 1;
  const [x, y, z] = axis.map((a) => a / n);
  const co = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    [c(co, -s * z), c(-s * y, -s * x)],
    [c(s * y, -s * x), c(co, s * z)],
  ];
}

/** Quaternion [w,x,y,z] ↔ SU(2): q ↦ w·1 − i(xσx + yσy + zσz). (Algebra homomorphism; i,j,k ↦ −iσx, −iσy, −iσz.) */
export function su2FromQuat([w, x, y, z]) {
  return [
    [c(w, -z), c(-y, -x)],
    [c(y, -x), c(w, z)],
  ];
}
export function quatFromSU2(U) {
  // U = [[w − iz, −y − ix], [y − ix, w + iz]]
  const w = (U[0][0].re + U[1][1].re) / 2;
  const z = (U[1][1].im - U[0][0].im) / 2;
  const y = (U[1][0].re - U[0][1].re) / 2;
  const x = -(U[0][1].im + U[1][0].im) / 2;
  return [w, x, y, z];
}

/** Adjoint map SU(2) → SO(3): R_ij = ½ tr(σ_i U σ_j U†). */
export function so3FromSU2(U) {
  const Ud = cmat.dagger(U);
  const R = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) R[i][j] = cmat.trace(cmat.chain(sigma[i], U, sigma[j], Ud)).re / 2;
  return R;
}

/** Bloch vector ⟨ψ|σ|ψ⟩ of a normalised spinor ψ = [α, β]. */
export function blochVector([a, b]) {
  const ab = cx.mul(cx.conj(a), b);
  return [2 * ab.re, 2 * ab.im, cx.abs2(a) - cx.abs2(b)];
}
/** Spinor for Bloch angles (θ polar, φ azimuth): (cos θ/2, e^{iφ} sin θ/2). */
export function spinorFromBloch(theta, phi) {
  return [c(Math.cos(theta / 2)), cx.polar(Math.sin(theta / 2), phi)];
}

// ------------------------------------------------------------------ spin-j matrices
/**
 * Spin-j matrices in the basis |j m⟩ ordered m = j, j−1, …, −j (index k = j − m).
 * Returns { j, dim, ms, Jz, Jp, Jm, Jx } as REAL matrices and Jy as a COMPLEX matrix.
 * J₊|j m⟩ = √(j(j+1) − m(m+1)) |j m+1⟩.
 */
export function spinMatrices(j) {
  const dim = Math.round(2 * j + 1);
  const ms = Array.from({ length: dim }, (_, k) => j - k);
  const Jz = mat.diag(ms);
  const Jp = mat.zeros(dim);
  for (let k = 1; k < dim; k++) {
    const m = ms[k];
    Jp[k - 1][k] = Math.sqrt(j * (j + 1) - m * (m + 1));
  }
  const Jm = mat.transpose(Jp);
  const Jx = mat.scale(mat.add(Jp, Jm), 0.5);
  // Jy = (J₊ − J₋)/(2i) = −i(J₊ − J₋)/2
  const D = mat.scale(mat.sub(Jp, Jm), -0.5);
  const Jy = D.map((r) => r.map((x) => ({ re: 0, im: x })));
  return { j, dim, ms, Jz, Jp, Jm, Jx, Jy };
}

/** Wigner small-d matrix d^j(β) = exp(−iβ J_y) (real), indices ordered m = j…−j. */
export function wignerSmallD(j, beta) {
  const { Jp, Jm } = spinMatrices(j);
  return mat.expm(mat.scale(mat.sub(Jp, Jm), -beta / 2));
}

/** Wigner D-matrix D^j(α,β,γ) = e^{−iαJz} e^{−iβJy} e^{−iγJz} (complex), entries D_{m'm}. */
export function wignerD(j, alpha, beta, gamma) {
  const d = wignerSmallD(j, beta);
  const dim = d.length;
  const ms = Array.from({ length: dim }, (_, k) => j - k);
  return d.map((row, a) => row.map((x, b) => cx.polar(x, -ms[a] * alpha - ms[b] * gamma)));
}

/** Möbius transformation z ↦ (az + b)/(cz + d) for a complex 2×2 matrix. ∞ is {re: Infinity, im: 0}. */
export function mobius(M, z) {
  const [[a, b], [cc, d]] = M;
  if (cx.isInf(z)) {
    if (cx.abs(cc) < 1e-15) return { re: Infinity, im: 0 };
    return cx.div(a, cc);
  }
  const num = cx.add(cx.mul(a, z), b);
  const den = cx.add(cx.mul(cc, z), d);
  if (cx.abs(den) < 1e-15) return { re: Infinity, im: 0 };
  return cx.div(num, den);
}

export { TAU };
