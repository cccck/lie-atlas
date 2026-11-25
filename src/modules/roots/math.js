// Root systems of the simple Lie algebras, built from their Cartan matrices. No DOM.
//
// Conventions
//   Cartan matrix  A_ij = 2⟨α_i,α_j⟩/⟨α_j,α_j⟩ = ⟨α_i, α_j^∨⟩   (row i, column j; Bourbaki numbering)
//   long roots have |α|² = 2.  A double/triple bond i–j with i long: A_ij = −2/−3, A_ji = −1.
//   Roots are stored by their INTEGER coefficients in the simple-root basis (exact), and as Euclidean
//   vectors v = Σ c_i α_i where the simple roots are the rows of the Cholesky factor of the Gram matrix.
//   Simple reflection on coefficients:  s_k(c) = c − (Σ_j c_j A_jk) e_k.
//   Coxeter element (bipartite): w = (Π_{i∈black} s_i)(Π_{j∈white} s_j); h = #roots / rank.

import { mat, vec } from '../../core/la.js';

// ------------------------------------------------------------------ Dynkin data
/** Node list with |α|² and bonds (i, j, m) 0-based; m = bond multiplicity, the longer root first when m > 1. */
export function dynkin(type, n) {
  const L = new Array(n).fill(2);
  const bonds = [];
  const chain = (k) => {
    for (let i = 0; i < k - 1; i++) bonds.push([i, i + 1, 1]);
  };
  switch (type) {
    case 'A':
      chain(n);
      break;
    case 'B': // α_n short
      chain(n - 1);
      L[n - 1] = 1;
      if (n >= 2) bonds.push([n - 2, n - 1, 2]);
      break;
    case 'C': // α_1 … α_{n−1} short, α_n long
      chain(n - 1);
      for (let i = 0; i < n - 1; i++) L[i] = 1;
      if (n >= 2) bonds.push([n - 1, n - 2, 2]);
      break;
    case 'D':
      chain(n - 1);
      if (n >= 3) bonds.push([n - 3, n - 1, 1]);
      break;
    case 'E': // Bourbaki: 1–3–4–5–6(–7–8), 2 attached to 4
      bonds.push([0, 2, 1], [2, 3, 1], [1, 3, 1]);
      for (let i = 3; i < n - 1; i++) bonds.push([i, i + 1, 1]);
      break;
    case 'F': // 1–2⇒3–4, α1, α2 long
      L[2] = L[3] = 1;
      bonds.push([0, 1, 1], [1, 2, 2], [2, 3, 1]);
      break;
    case 'G': // α1 short, α2 long, triple bond
      L[0] = 2 / 3;
      bonds.push([1, 0, 3]);
      break;
    default:
      throw new Error('unknown type ' + type);
  }
  return { type, n, lengths: L, bonds };
}

/** Cartan matrix A_ij = 2⟨α_i,α_j⟩/⟨α_j,α_j⟩ from Dynkin data (integers). */
export function cartanFromDynkin({ n, bonds }) {
  const A = mat.zeros(n);
  for (let i = 0; i < n; i++) A[i][i] = 2;
  for (const [i, j, m] of bonds) {
    // i is the longer root (or equal): A_ij = −m, A_ji = −1
    A[i][j] = -m;
    A[j][i] = -1;
  }
  return A;
}
export const cartan = (type, n) => cartanFromDynkin(dynkin(type, n));

/** Gram matrix ⟨α_i,α_j⟩ = A_ij |α_j|²/2 (symmetric, positive definite for finite types). */
export function gram(A, lengths) {
  const n = A.length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (A[i][j] * lengths[j]) / 2));
}

/** Symmetriser from the Cartan matrix alone: d_i ∝ |α_i|²/2 with A_ij d_j = A_ji d_i, long roots → |α|² = 2. */
export function rootLengthsFromCartan(A) {
  const n = A.length;
  const d = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    if (d[s]) continue;
    d[s] = 1;
    const queue = [s];
    while (queue.length) {
      const i = queue.shift();
      for (let j = 0; j < n; j++)
        if (j !== i && A[i][j] !== 0 && !d[j]) {
          d[j] = (A[j][i] * d[i]) / A[i][j];
          queue.push(j);
        }
    }
  }
  const mx = Math.max(...d);
  return d.map((x) => (2 * x) / mx);
}

/** Lower-triangular Cholesky factor L with G = L Lᵀ. */
export function cholesky(G) {
  const n = G.length;
  const Lm = mat.zeros(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = G[i][j];
      for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
      if (i === j) {
        if (s <= 1e-12) throw new Error('cholesky: matrix not positive definite');
        Lm[i][i] = Math.sqrt(s);
      } else Lm[i][j] = s / Lm[j][j];
    }
  return Lm;
}

// ------------------------------------------------------------------ root systems
const ckey = (c) => c.join(',');

/** Reflect integer coefficients c in the simple root k. */
export function reflectCoeffs(c, k, A) {
  let p = 0;
  for (let j = 0; j < c.length; j++) p += c[j] * A[j][k];
  const out = c.slice();
  out[k] -= p;
  return out;
}

/** Root system from a Cartan matrix and root lengths (|α|² per simple root, long = 2). meta is copied in. */
export function buildSystem(A, lengths, meta = {}) {
  const n = A.length;
  const G = gram(A, lengths);
  const Lc = cholesky(G);
  const seen = new Map();
  const queue = [];
  for (let i = 0; i < n; i++) {
    const c = new Array(n).fill(0);
    c[i] = 1;
    seen.set(ckey(c), c);
    queue.push(c);
  }
  while (queue.length) {
    const c = queue.shift();
    for (let k = 0; k < n; k++) {
      const r = reflectCoeffs(c, k, A);
      const kk = ckey(r);
      if (!seen.has(kk)) {
        seen.set(kk, r);
        queue.push(r);
      }
    }
  }
  const roots = [...seen.values()].map((c) => {
    const v = new Array(n).fill(0);
    for (let i = 0; i < n; i++) if (c[i]) for (let j = 0; j < n; j++) v[j] += c[i] * Lc[i][j];
    const len2 = vec.dot(v, v);
    return { c, v, len2, pos: c.every((x) => x >= 0), height: c.reduce((s, x) => s + x, 0), long: len2 > 1.5, key: ckey(c) };
  });
  roots.sort((a, b) => b.height - a.height || (a.key < b.key ? -1 : 1));
  const positive = roots.filter((r) => r.pos);
  const maxH = Math.max(...positive.map((r) => r.height));
  const highest = positive.find((r) => r.height === maxH);
  const h = maxH + 1;
  // exponents from the height partition (Kostant): multiplicity of k = n_k − n_{k+1}
  const nk = new Array(h + 2).fill(0);
  for (const r of positive) nk[r.height]++;
  const exponents = [];
  for (let k = 1; k < h; k++) for (let j = 0; j < nk[k] - nk[k + 1]; j++) exponents.push(k);
  const weylOrder = exponents.reduce((s, m) => s * (m + 1), 1);
  const simple = Lc.map((r) => r.slice());
  // fundamental weights: <ω_i, α_j^∨> = δ_ij  ⇒  ω_i = column i of K^{-1}, K rows = coroots
  const K = simple.map((a, i) => vec.scale(a, 2 / lengths[i]));
  const Kinv = mat.inv(K);
  const fundamental = Array.from({ length: n }, (_, i) => Kinv.map((r) => r[i]));
  const sys = { bonds: [], ...meta, n, A, lengths, G, simple, roots, positive, highest, h, exponents, weylOrder, dim: n + roots.length, fundamental };
  sys.coxeter = coxeterElement(sys);
  return sys;
}

const SYSTEMS = new Map();
/** Root system of type (X, n) (cached). Roots: [{ c (integer coefficients), v (Euclidean), len2, pos, height, long }]. */
export function rootSystem(type, n) {
  const k0 = type + n;
  if (SYSTEMS.has(k0)) return SYSTEMS.get(k0);
  const dk = dynkin(type, n);
  const sys = buildSystem(cartanFromDynkin(dk), dk.lengths, { type, n, name: algebraName(type, n), bonds: dk.bonds });
  SYSTEMS.set(k0, sys);
  return sys;
}
/** The reducible rank-2 system A1 × A1 = so(4). */
export function rootSystemA1A1() {
  if (!SYSTEMS.has('A1A1')) SYSTEMS.set('A1A1', buildSystem([[2, 0], [0, 2]], [2, 2], { type: 'A1xA1', n: 2, name: 'A_1	imes A_1', bonds: [] }));
  return SYSTEMS.get('A1A1');
}

/** Euclidean reflection matrix in the hyperplane ⟂ a. */
export function reflectionMatrix(a) {
  const n = a.length;
  const a2 = vec.dot(a, a);
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - (2 * a[i] * a[j]) / a2));
}

/** Two-colouring of the Dynkin diagram (it is a tree). */
export function bipartition(sys) {
  const n = sys.n;
  const col = new Array(n).fill(-1);
  for (let s = 0; s < n; s++) {
    if (col[s] >= 0) continue;
    col[s] = 0;
    const q = [s];
    while (q.length) {
      const i = q.shift();
      for (let j = 0; j < n; j++)
        if (j !== i && sys.A[i][j] !== 0 && col[j] < 0) {
          col[j] = 1 - col[i];
          q.push(j);
        }
    }
  }
  return col;
}

/** Bipartite Coxeter element as a Euclidean matrix: w = (Π_{black} s_i)(Π_{white} s_j). Also its simple-root word. */
export function coxeterElement(sys) {
  const col = bipartition(sys);
  const black = [];
  const white = [];
  col.forEach((c, i) => (c === 0 ? black : white).push(i));
  const word = [...black, ...white]; // w = s_{word[0]} s_{word[1]} … (rightmost acts first)
  let W = mat.eye(sys.n);
  for (const i of word) W = mat.mul(W, reflectionMatrix(sys.simple[i]));
  return { matrix: W, word, black, white };
}

/** Apply the Coxeter element to integer root coefficients (rightmost reflection first). */
export function coxeterOnCoeffs(sys, c) {
  let r = c;
  const w = sys.coxeter.word;
  for (let k = w.length - 1; k >= 0; k--) r = reflectCoeffs(r, w[k], sys.A);
  return r;
}

/** Orbits of the Coxeter element on the roots (each of size h). Returns arrays of root indices in order. */
export function coxeterOrbits(sys) {
  const idx = new Map(sys.roots.map((r, i) => [r.key, i]));
  const done = new Array(sys.roots.length).fill(false);
  const orbits = [];
  for (let i = 0; i < sys.roots.length; i++) {
    if (done[i]) continue;
    const orb = [];
    let c = sys.roots[i].c;
    let j = i;
    while (!done[j]) {
      done[j] = true;
      orb.push(j);
      c = coxeterOnCoeffs(sys, c);
      j = idx.get(ckey(c));
    }
    orbits.push(orb);
  }
  return orbits;
}

/** Deterministic generic vector (irrational-ish components). */
export function genericVector(n, seed = 1) {
  return Array.from({ length: n }, (_, i) => Math.sin(1.7 * (i + 1) * seed + 0.37) + 0.31 * Math.cos(2.9 * (i + 1) + seed));
}

/**
 * Coxeter plane: z = P v with P = (1/h) Σ_k e^{−2πik/h} w^k (projector on the e^{2πi/h} eigenspace);
 * the plane is span(Re z, Im z). Returns orthonormal { x, y } and diagnostics.
 */
export function coxeterPlane(sys, v = genericVector(sys.n)) {
  const n = sys.n;
  const h = sys.h;
  if (n === 1 || h <= 2) {
    // no Coxeter plane (eigenvalue −1 is real): use the first one or two coordinate axes
    const x = new Array(n).fill(0);
    const y = new Array(n).fill(0);
    x[0] = 1;
    if (n > 1) y[1] = 1;
    return { x, y, normRe: 1, normIm: n > 1 ? 1 : 0, dot: 0, degenerate: true };
  }
  const W = sys.coxeter.matrix;
  const re = new Array(n).fill(0);
  const im = new Array(n).fill(0);
  let wk = v.slice();
  for (let k = 0; k < h; k++) {
    const a = (-2 * Math.PI * k) / h;
    for (let i = 0; i < n; i++) {
      re[i] += (Math.cos(a) * wk[i]) / h;
      im[i] += (Math.sin(a) * wk[i]) / h;
    }
    wk = mat.mulv(W, wk);
  }
  const nr = vec.norm(re);
  const ni = vec.norm(im);
  return { x: vec.scale(re, 1 / nr), y: vec.scale(im, 1 / ni), normRe: nr, normIm: ni, dot: vec.dot(re, im) / (nr * ni) };
}

/** Project roots onto a plane {x, y}: returns [[px, py], …]. */
export const project = (sys, plane) => sys.roots.map((r) => [vec.dot(r.v, plane.x), vec.dot(r.v, plane.y)]);

/** Edges between nearest roots: pairs with |β − γ| = d_min (for simply-laced: ⟨β,γ⟩ = 1). */
export function nearestEdges(sys, tol = 1e-6) {
  const R = sys.roots;
  let d2min = Infinity;
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const d2 = vec.norm2(vec.sub(R[i].v, R[j].v));
      if (d2 > 1e-9 && d2 < d2min) d2min = d2;
    }
  const edges = [];
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const d2 = vec.norm2(vec.sub(R[i].v, R[j].v));
      if (Math.abs(d2 - d2min) < tol) edges.push([i, j]);
    }
  return { edges, d2min };
}

// ------------------------------------------------------------------ Weyl group
/** |W| by enumerating the orbit of ρ = (1,…,1) in Dynkin-label coordinates (exact integers). */
export function weylOrbitSize(A, limit = 2e6) {
  const n = A.length;
  const start = new Array(n).fill(1);
  const seen = new Set([start.join(',')]);
  const queue = [start];
  while (queue.length) {
    const lam = queue.pop();
    for (let i = 0; i < n; i++) {
      const out = lam.slice();
      for (let j = 0; j < n; j++) out[j] = lam[j] - lam[i] * A[i][j];
      const k = out.join(',');
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(out);
        if (seen.size > limit) return Infinity;
      }
    }
  }
  return seen.size;
}

/**
 * All Weyl group elements (rank ≤ 4) as Euclidean matrices with shortest words.
 * word [i1, …, ik] means w = s_{i1} s_{i2} … s_{ik}. Built by BFS with LEFT multiplication w → s_i w.
 */
export function weylElements(sys) {
  const n = sys.n;
  const S = sys.simple.map(reflectionMatrix);
  const probe = sys.fundamental.reduce((acc, w, i) => vec.add(acc, vec.scale(w, 1 + 0.37 * i)), new Array(n).fill(0));
  const keyOf = (M) =>
    mat
      .mulv(M, probe)
      .map((x) => Math.round(x * 1e6))
      .join(',');
  const els = [{ M: mat.eye(n), word: [], key: keyOf(mat.eye(n)) }];
  const index = new Map([[els[0].key, 0]]);
  for (let q = 0; q < els.length; q++) {
    const e = els[q];
    for (let i = 0; i < n; i++) {
      const M2 = mat.mul(S[i], e.M);
      const k = keyOf(M2);
      if (!index.has(k)) {
        index.set(k, els.length);
        els.push({ M: M2, word: [i, ...e.word], key: k });
      }
    }
    if (els.length > 20000) break;
  }
  for (const e of els) e.det = e.word.length % 2 ? -1 : 1;
  return { els, index, keyOf, S, probe };
}

// ------------------------------------------------------------------ names & physics
export function algebraName(type, n) {
  if (type === 'E' || type === 'F' || type === 'G') return `${type}_${n}`;
  return `${type}_{${n}}`;
}
/** Compact simply connected group / common name, TeX. */
export function compactGroup(type, n) {
  switch (type) {
    case 'A':
      return `SU(${n + 1})`;
    case 'B':
      return `SO(${2 * n + 1})`;
    case 'C':
      return `Sp(${n})`;
    case 'D':
      return `SO(${2 * n})`;
    default:
      return algebraName(type, n);
  }
}
export function liealgName(type, n) {
  switch (type) {
    case 'A':
      return `\\su(${n + 1})`;
    case 'B':
      return `\\so(${2 * n + 1})`;
    case 'C':
      return `\\sp(${2 * n})`;
    case 'D':
      return `\\so(${2 * n})`;
    default:
      return `\\mathfrak{${type.toLowerCase()}}_{${n}}`;
  }
}
/** Closed forms used to cross-check the computation. */
export const EXPECTED = {
  roots: (t, n) => ({ A: n * (n + 1), B: 2 * n * n, C: 2 * n * n, D: 2 * n * (n - 1), E: { 6: 72, 7: 126, 8: 240 }[n], F: 48, G: 12 })[t],
  h: (t, n) => ({ A: n + 1, B: 2 * n, C: 2 * n, D: 2 * n - 2, E: { 6: 12, 7: 18, 8: 30 }[n], F: 12, G: 6 })[t],
  weyl: (t, n) => {
    const f = (k) => (k <= 1 ? 1 : k * f(k - 1));
    return { A: f(n + 1), B: 2 ** n * f(n), C: 2 ** n * f(n), D: 2 ** (n - 1) * f(n), E: { 6: 51840, 7: 2903040, 8: 696729600 }[n], F: 1152, G: 12 }[t];
  },
  dim: (t, n) => ({ A: n * (n + 2), B: n * (2 * n + 1), C: n * (2 * n + 1), D: n * (2 * n - 1), E: { 6: 78, 7: 133, 8: 248 }[n], F: 52, G: 14 })[t],
};

/** The gallery: every simple algebra up to rank 8 (with the usual low-rank coincidences skipped or noted). */
export const GALLERY = (() => {
  const L = [];
  for (let n = 1; n <= 8; n++) L.push(['A', n]);
  for (let n = 2; n <= 8; n++) L.push(['B', n]);
  for (let n = 3; n <= 8; n++) L.push(['C', n]);
  for (let n = 4; n <= 8; n++) L.push(['D', n]);
  L.push(['E', 6], ['E', 7], ['E', 8], ['F', 4], ['G', 2]);
  return L;
})();

// ------------------------------------------------------------------ positivity ("why only these diagrams")
/** Classify a (symmetrisable) generalised Cartan matrix by the signature of its symmetrised form. */
export function classifyCartan(A) {
  const lengths = rootLengthsFromCartan(A);
  const G = gram(A, lengths);
  const { values } = mat.eigSym(G);
  const min = Math.min(...values);
  const det = mat.det(G);
  const kind = min > 1e-9 ? 'finite' : min > -1e-9 ? 'affine' : 'indefinite';
  return { kind, min, det, values, G };
}

/** Generalised Cartan matrix from a list of bonds (i, j, m) with i the longer root when m > 1. */
export function cartanFromBonds(n, bonds) {
  return cartanFromDynkin({ n, bonds });
}

// ------------------------------------------------------------------ SU(5) grand unification
/** The 20 roots e_i − e_j of SU(5) with their Standard-Model type. Indices 0,1,2 = colour, 3,4 = weak isospin. */
export function su5Roots() {
  const out = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      if (i === j) continue;
      const v = [0, 0, 0, 0, 0];
      v[i] = 1;
      v[j] = -1;
      const ci = i < 3;
      const cj = j < 3;
      const type = ci && cj ? 'gluon' : !ci && !cj ? 'W' : 'XY';
      out.push({ i, j, v, type });
    }
  return out;
}
export const SU5_CHARGES = {
  T3c: [0.5, -0.5, 0, 0, 0],
  T8c: [1, 1, -2, 0, 0].map((x) => x / (2 * Math.sqrt(3))),
  T3w: [0, 0, 0, 0.5, -0.5],
  Y: [-1 / 3, -1 / 3, -1 / 3, 0.5, 0.5],
};
