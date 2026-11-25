// Small dense linear algebra for visualisations. No DOM — usable from Node.
// Conventions:
//   vectors   : plain arrays [x, y, z]
//   matrices  : arrays of ROWS, A[i][j] = row i, column j
//   quaternion: [w, x, y, z],  q = cos(θ/2) + sin(θ/2) n̂  ↔ rotation by θ about n̂
//   so(3)     : hat(ω) is the real antisymmetric matrix with hat(ω) v = ω × v;
//               expSO3(ω) = rotation by |ω| about ω̂ (right-hand rule).

export const TAU = 2 * Math.PI;
export const EPS = 1e-12;

// ------------------------------------------------------------------ scalars
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (x - a) / (b - a);
export const remap = (x, a0, a1, b0, b1) => b0 + ((x - a0) * (b1 - b0)) / (a1 - a0);
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Ease in-out (cubic) on [0,1]. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Positive modulo: mod(-1, 3) = 2. */
export const mod = (x, m) => ((x % m) + m) % m;
/** Wrap an angle to [-π, π). */
export const wrapPi = (x) => mod(x + Math.PI, TAU) - Math.PI;
/** Wrap an angle to [0, 2π). */
export const wrap2Pi = (x) => mod(x, TAU);
export const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
export const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
export const range = (n) => Array.from({ length: n }, (_, i) => i);
export const sum = (arr) => arr.reduce((s, x) => s + x, 0);
export function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}
export function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
export function binom(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
/** Deterministic PRNG in [0,1). */
export function mulberry32(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Standard normal sample from a uniform rng. */
export function randn(rng = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
/** Uniformly random unit vector in R^3. */
export function randomUnit3(rng = Math.random) {
  const z = 2 * rng() - 1;
  const phi = TAU * rng();
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}

// ------------------------------------------------------------------ vectors
export const vec = {
  add: (a, b) => a.map((x, i) => x + b[i]),
  sub: (a, b) => a.map((x, i) => x - b[i]),
  scale: (a, s) => a.map((x) => x * s),
  neg: (a) => a.map((x) => -x),
  dot: (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  },
  norm: (a) => Math.sqrt(vec.dot(a, a)),
  norm2: (a) => vec.dot(a, a),
  normalize: (a) => {
    const n = vec.norm(a);
    return n > EPS ? a.map((x) => x / n) : a.map(() => 0);
  },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => a.map((x, i) => x + (b[i] - x) * t),
  dist: (a, b) => vec.norm(vec.sub(a, b)),
  zeros: (n) => new Array(n).fill(0),
  axpy: (alpha, x, y) => y.map((yi, i) => alpha * x[i] + yi),
  /** Unsigned angle between two vectors (any dimension). */
  angle: (a, b) => {
    const c = vec.dot(a, b) / (vec.norm(a) * vec.norm(b) || 1);
    return Math.acos(clamp(c, -1, 1));
  },
  /** Some unit vector perpendicular to a 3-vector. */
  perp: (a) => {
    const n = vec.normalize(a);
    const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return vec.normalize(vec.cross(n, t));
  },
  /** Rotate a 2-vector by angle θ. */
  rot2: ([x, y], th) => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)],
};

// ------------------------------------------------------------------ matrices
export const mat = {
  zeros: (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0)),
  eye: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))),
  clone: (A) => A.map((r) => r.slice()),
  diag: (d) => d.map((x, i) => d.map((_, j) => (i === j ? x : 0))),
  transpose: (A) => A[0].map((_, j) => A.map((r) => r[j])),
  add: (A, B) => A.map((r, i) => r.map((x, j) => x + B[i][j])),
  sub: (A, B) => A.map((r, i) => r.map((x, j) => x - B[i][j])),
  scale: (A, s) => A.map((r) => r.map((x) => x * s)),
  /** Linear combination Σ c_k A_k. */
  combo: (coeffs, mats) => {
    const n = mats[0].length;
    const m = mats[0][0].length;
    const R = mat.zeros(n, m);
    coeffs.forEach((c, k) => {
      if (!c) return;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) R[i][j] += c * mats[k][i][j];
    });
    return R;
  },
  mul: (A, B) => {
    const n = A.length;
    const m = B[0].length;
    const p = B.length;
    const C = mat.zeros(n, m);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < p; k++) {
        const a = A[i][k];
        if (a === 0) continue;
        for (let j = 0; j < m; j++) C[i][j] += a * B[k][j];
      }
    return C;
  },
  /** Product of several matrices left to right. */
  chain: (...Ms) => Ms.reduce((acc, M) => mat.mul(acc, M)),
  mulv: (A, x) => A.map((r) => vec.dot(r, x)),
  trace: (A) => A.reduce((s, r, i) => s + r[i], 0),
  /** Commutator [A,B] = AB − BA. */
  comm: (A, B) => mat.sub(mat.mul(A, B), mat.mul(B, A)),
  /** Anticommutator {A,B} = AB + BA. */
  acomm: (A, B) => mat.add(mat.mul(A, B), mat.mul(B, A)),
  normF: (A) => Math.sqrt(A.reduce((s, r) => s + r.reduce((t, x) => t + x * x, 0), 0)),
  normInf: (A) => Math.max(...A.map((r) => r.reduce((s, x) => s + Math.abs(x), 0))),
  maxAbs: (A) => Math.max(...A.map((r) => Math.max(...r.map(Math.abs)))),
  almostEqual: (A, B, tol = 1e-9) => A.every((r, i) => r.every((x, j) => Math.abs(x - B[i][j]) <= tol)),
  outer: (u, v) => u.map((a) => v.map((b) => a * b)),
  col: (A, j) => A.map((r) => r[j]),
  fromCols: (cols) => cols[0].map((_, i) => cols.map((c) => c[i])),
  kron: (A, B) => {
    const R = [];
    for (const ra of A)
      for (const rb of B) {
        const row = [];
        for (const a of ra) for (const b of rb) row.push(a * b);
        R.push(row);
      }
    return R;
  },
  /** LU-based determinant (partial pivoting). */
  det: (A) => {
    const n = A.length;
    if (n === 1) return A[0][0];
    if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
    if (n === 3)
      return (
        A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
      );
    const M = mat.clone(A);
    let d = 1;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return 0;
      if (p !== c) {
        [M[p], M[c]] = [M[c], M[p]];
        d = -d;
      }
      d *= M[c][c];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k < n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return d;
  },
  /** Gauss–Jordan inverse with partial pivoting. Throws if singular. */
  inv: (A) => {
    const n = A.length;
    const M = A.map((r, i) => [...r, ...mat.eye(n)[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) throw new Error('mat.inv: singular matrix');
      [M[p], M[c]] = [M[c], M[p]];
      const piv = M[c][c];
      for (let k = 0; k < 2 * n; k++) M[c][k] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f === 0) continue;
        for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r) => r.slice(n));
  },
  solve: (A, b) => mat.mulv(mat.inv(A), b),
  pow: (A, k) => {
    let R = mat.eye(A.length);
    let B = mat.clone(A);
    let e = k;
    while (e > 0) {
      if (e & 1) R = mat.mul(R, B);
      B = mat.mul(B, B);
      e >>= 1;
    }
    return R;
  },
  /** Matrix exponential: scaling & squaring with a Taylor series (accurate to ~1e-15 for small matrices). */
  expm: (A) => {
    const n = A.length;
    const nrm = mat.normInf(A);
    const s = nrm > 0.5 ? Math.ceil(Math.log2(nrm / 0.5)) : 0;
    const B = mat.scale(A, 1 / Math.pow(2, s));
    let term = mat.eye(n);
    let R = mat.eye(n);
    for (let k = 1; k <= 30; k++) {
      term = mat.scale(mat.mul(term, B), 1 / k);
      R = mat.add(R, term);
      if (mat.maxAbs(term) < 1e-18) break;
    }
    for (let i = 0; i < s; i++) R = mat.mul(R, R);
    return R;
  },
  /** Jacobi eigen-decomposition of a real symmetric matrix.
   *  Returns { values: [...] ascending, vectors: [[...], ...] } with vectors[k] the k-th eigenvector. */
  eigSym: (S) => {
    const n = S.length;
    const A = mat.clone(S);
    const V = mat.eye(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++)
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-300) continue;
          const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k][p];
            const akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k];
            const aqk = A[q][k];
            A[p][k] = c * apk - s * aqk;
            A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p];
            const vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
    }
    const idx = range(n).sort((a, b) => A[a][a] - A[b][b]);
    return { values: idx.map((i) => A[i][i]), vectors: idx.map((i) => V.map((r) => r[i])) };
  },
};

// ------------------------------------------------------------------ 2×2 real
/** Eigenvalues of [[a,b],[c,d]] as complex numbers {re, im}; plus trace, det, discriminant. */
export function eig2([[a, b], [c, d]]) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return { tr, det, disc, l1: { re: (tr + s) / 2, im: 0 }, l2: { re: (tr - s) / 2, im: 0 }, real: true };
  }
  const s = Math.sqrt(-disc);
  return { tr, det, disc, l1: { re: tr / 2, im: s / 2 }, l2: { re: tr / 2, im: -s / 2 }, real: false };
}

/** Closed-form exp of a real 2×2 matrix (exact; stable through the parabolic case). */
export function exp2(A) {
  const [[a, b], [c, d]] = A;
  const h = (a + d) / 2;
  // N = A − h I is traceless with N² = δ I, δ = −det N
  const n00 = a - h;
  const n11 = d - h;
  const delta = -(n00 * n11 - b * c);
  let C;
  let S;
  if (Math.abs(delta) < 1e-14) {
    C = 1 + delta / 2;
    S = 1 + delta / 6;
  } else if (delta > 0) {
    const r = Math.sqrt(delta);
    C = Math.cosh(r);
    S = Math.sinh(r) / r;
  } else {
    const r = Math.sqrt(-delta);
    C = Math.cos(r);
    S = Math.sin(r) / r;
  }
  const e = Math.exp(h);
  return [
    [e * (C + S * n00), e * S * b],
    [e * S * c, e * (C + S * n11)],
  ];
}

// ------------------------------------------------------------------ so(3), SO(3)
/** hat(ω): R^3 → so(3), hat(ω) v = ω × v. */
export const hat = ([x, y, z]) => [
  [0, -z, y],
  [z, 0, -x],
  [-y, x, 0],
];
/** vee: so(3) → R^3 (inverse of hat; uses the antisymmetric part). */
export const vee = (W) => [(W[2][1] - W[1][2]) / 2, (W[0][2] - W[2][0]) / 2, (W[1][0] - W[0][1]) / 2];

/** Real generators of rotations about x, y, z: (L_k)_{ij} = −ε_{kij}, so exp(θ L_k) rotates by θ. */
export const L = [hat([1, 0, 0]), hat([0, 1, 0]), hat([0, 0, 1])];

/** Rodrigues: rotation by |ω| about ω̂. */
export function expSO3(w) {
  const th2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2];
  const th = Math.sqrt(th2);
  let A;
  let B;
  if (th < 1e-5) {
    A = 1 - th2 / 6;
    B = 0.5 - th2 / 24;
  } else {
    A = Math.sin(th) / th;
    B = (1 - Math.cos(th)) / th2;
  }
  const K = hat(w);
  const K2 = mat.mul(K, K);
  const R = mat.eye(3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] += A * K[i][j] + B * K2[i][j];
  return R;
}

/** Principal logarithm: rotation vector ω with |ω| ∈ [0, π] and expSO3(ω) = R. Robust near 0 and π. */
export function logSO3(R) {
  const tr = R[0][0] + R[1][1] + R[2][2];
  const c = clamp((tr - 1) / 2, -1, 1);
  const v = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]]; // 2 sinθ n
  const th = Math.atan2(vec.norm(v) / 2, c); // well-conditioned for all θ ∈ [0, π]
  if (th < 1e-5) return vec.scale(v, 0.5 * (1 + (th * th) / 6));
  if (Math.PI - th < 1e-3) {
    // R + Rᵀ = 2cosθ I + 2(1 − cosθ) n nᵀ
    const B = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (R[i][j] + R[j][i]) / 2 - (i === j ? c : 0)));
    let k = 0;
    if (B[1][1] > B[k][k]) k = 1;
    if (B[2][2] > B[k][k]) k = 2;
    const nk = Math.sqrt(Math.max(B[k][k], 0) / (1 - c));
    let n = [0, 1, 2].map((j) => (j === k ? nk : B[k][j] / ((1 - c) * nk)));
    n = vec.normalize(n);
    if (vec.dot(n, v) < 0) n = vec.neg(n);
    return vec.scale(n, th);
  }
  return vec.scale(v, th / (2 * Math.sin(th)));
}

export const rotAxisAngle = (axis, angle) => expSO3(vec.scale(vec.normalize(axis), angle));
export const rotX = (a) => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
export const rotY = (a) => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
export const rotZ = (a) => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];
/** { axis, angle } with angle ∈ [0, π]. */
export function axisAngleOf(R) {
  const w = logSO3(R);
  const angle = vec.norm(w);
  return { axis: angle > 1e-12 ? vec.scale(w, 1 / angle) : [0, 0, 1], angle };
}
/** Re-orthonormalise a nearly-orthogonal 3×3 matrix (Gram–Schmidt on columns). */
export function orthonormalize3(R) {
  const c0 = vec.normalize(mat.col(R, 0));
  let c1 = mat.col(R, 1);
  c1 = vec.normalize(vec.sub(c1, vec.scale(c0, vec.dot(c0, c1))));
  const c2 = vec.cross(c0, c1);
  return mat.fromCols([c0, c1, c2]);
}

// ------------------------------------------------------------------ quaternions
export const quat = {
  identity: () => [1, 0, 0, 0],
  mul: ([aw, ax, ay, az], [bw, bx, by, bz]) => [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ],
  conj: ([w, x, y, z]) => [w, -x, -y, -z],
  neg: (q) => q.map((v) => -v),
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
  norm: (q) => Math.hypot(q[0], q[1], q[2], q[3]),
  normalize: (q) => {
    const n = quat.norm(q) || 1;
    return q.map((v) => v / n);
  },
  inverse: (q) => {
    const n2 = quat.dot(q, q) || 1;
    return quat.conj(q).map((v) => v / n2);
  },
  /** Unit quaternion for a rotation by `angle` about `axis` (angle may exceed 2π: SU(2) remembers mod 4π). */
  fromAxisAngle: (axis, angle) => {
    const n = vec.normalize(axis);
    const s = Math.sin(angle / 2);
    return [Math.cos(angle / 2), n[0] * s, n[1] * s, n[2] * s];
  },
  /** Rotation vector θn̂ → unit quaternion (θ = |ω|). */
  fromRotVec: (w) => {
    const th = vec.norm(w);
    if (th < 1e-12) return [1, w[0] / 2, w[1] / 2, w[2] / 2];
    return quat.fromAxisAngle(w, th);
  },
  /** SU(2) exponential coordinates: returns ω = θn̂ with θ ∈ [0, 2π] such that fromRotVec(ω) = q.
   *  q and −q give different results (|ω| and 2π − |ω| about opposite axes). */
  toRotVec: (q) => {
    const [w, x, y, z] = quat.normalize(q);
    const s = Math.hypot(x, y, z);
    if (s < 1e-12) return w > 0 ? [0, 0, 0] : [TAU, 0, 0];
    const th = 2 * Math.atan2(s, w);
    return [(x / s) * th, (y / s) * th, (z / s) * th];
  },
  /** Pure-vector exponential e^{v} = (cos|v|, sin|v| v̂). Note: fromRotVec(ω) = exp(ω/2). */
  exp: (v) => {
    const a = vec.norm(v);
    if (a < 1e-12) return [1, v[0], v[1], v[2]];
    const s = Math.sin(a) / a;
    return [Math.cos(a), v[0] * s, v[1] * s, v[2] * s];
  },
  /** Inverse of quat.exp on unit quaternions, |v| ∈ [0, π]. */
  log: (q) => {
    const [w, x, y, z] = quat.normalize(q);
    const s = Math.hypot(x, y, z);
    if (s < 1e-12) return [0, 0, 0];
    const a = Math.atan2(s, w);
    return [(x / s) * a, (y / s) * a, (z / s) * a];
  },
  /** Rotate a 3-vector: q v q*. */
  rotate: (q, v) => {
    const p = quat.mul(quat.mul(q, [0, v[0], v[1], v[2]]), quat.conj(q));
    return [p[1], p[2], p[3]];
  },
  toMat3: (q) => {
    const [w, x, y, z] = quat.normalize(q);
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
  },
  /** Rotation matrix → unit quaternion with w ≥ 0 (Shepperd). */
  fromMat3: (R) => {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let q;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q = [0.25 * s, (R[2][1] - R[1][2]) / s, (R[0][2] - R[2][0]) / s, (R[1][0] - R[0][1]) / s];
    } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
      const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
      q = [(R[2][1] - R[1][2]) / s, 0.25 * s, (R[0][1] + R[1][0]) / s, (R[0][2] + R[2][0]) / s];
    } else if (R[1][1] > R[2][2]) {
      const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
      q = [(R[0][2] - R[2][0]) / s, (R[0][1] + R[1][0]) / s, 0.25 * s, (R[1][2] + R[2][1]) / s];
    } else {
      const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
      q = [(R[1][0] - R[0][1]) / s, (R[0][2] + R[2][0]) / s, (R[1][2] + R[2][1]) / s, 0.25 * s];
    }
    q = quat.normalize(q);
    return q[0] < 0 ? quat.neg(q) : q;
  },
  /** Spherical linear interpolation along the great circle from a to b (no sign flipping: SU(2)-faithful). */
  slerp: (a, b, t) => {
    let c = clamp(quat.dot(a, b), -1, 1);
    if (c > 0.9995) return quat.normalize(a.map((v, i) => v + (b[i] - v) * t));
    const th = Math.acos(c);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return a.map((v, i) => wa * v + wb * b[i]);
  },
};

// ------------------------------------------------------------------ misc geometry
/** Stereographic projection of a point on S^n ⊂ R^{n+1} from the pole e_last = +1 onto R^n. */
export function stereo(p) {
  const n = p.length - 1;
  const d = 1 - p[n];
  const k = Math.abs(d) < 1e-9 ? 1e9 : 1 / d;
  return p.slice(0, n).map((x) => x * k);
}
/** Inverse stereographic projection R^n → S^n (pole e_last). */
export function invStereo(x) {
  const r2 = vec.norm2(x);
  return [...x.map((v) => (2 * v) / (1 + r2)), (r2 - 1) / (r2 + 1)];
}
/** Spherical → Cartesian, θ polar from +z, φ azimuth. */
export const sph = (theta, phi, r = 1) => [
  r * Math.sin(theta) * Math.cos(phi),
  r * Math.sin(theta) * Math.sin(phi),
  r * Math.cos(theta),
];
/** Cartesian → { r, theta, phi }. */
export function toSph([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return { r, theta: r > 0 ? Math.acos(clamp(z / r, -1, 1)) : 0, phi: Math.atan2(y, x) };
}

/** Classic RK4 step for y' = f(t, y) with y an array. */
export function rk4(f, t, y, h) {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k1[i]));
  const k3 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k2[i]));
  const k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Area enclosed by a closed polygon (signed, counter-clockwise positive). */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
