// SU(3) representation theory without the DOM: weights, multiplicities (Freudenthal),
// tensor products, Gell-Mann matrices, structure constants and hadron data.
//
// Weights are stored EXACTLY as integer Dynkin labels [a, b]:  μ = a ω1 + b ω2.
//   physical charges   I3 = a/2,   Y = (a + 2b)/3
//   Cartan generators  T3 = I3,    T8 = (√3/2) Y          ("plane" coordinates (T3, T8))
// In the (T3, T8) plane the Killing metric is Euclidean, all six roots have length 1 and the
// hexagons are regular. Quarks: u = ω1 = (½, ⅓), d = (−½, ⅓), s = (0, −⅔) in (I3, Y).
// Simple roots: α1 = [2,−1] = I₊ = (1, 0),  α2 = [−1,2] = U₊ = (−½, 1),  α1+α2 = [1,1] = V₊ = (½, 1).
// Highest weight of the irrep (p, q) is Λ = p ω1 + q ω2 = [p, q].

import { cx, cmat } from '../../core/complex.js';

export const SQ3 = Math.sqrt(3);

// ------------------------------------------------------------------ coordinates
export const key = (m) => m[0] + ',' + m[1];
export const unkey = (k) => k.split(',').map(Number);
export const toIY = ([a, b]) => [a / 2, (a + 2 * b) / 3];
/** (T3, T8) coordinates: the Euclidean picture (regular hexagons). */
export const toPlane = ([a, b]) => [a / 2, (a + 2 * b) / (2 * SQ3)];
export const fromIY = ([I3, Y]) => {
  const a = Math.round(2 * I3);
  return [a, Math.round((3 * Y - a) / 2)];
};
/** Electric charge Q = I3 + Y/2 (Gell-Mann–Nishijima). */
export const charge = (m) => {
  const [I3, Y] = toIY(m);
  return I3 + Y / 2;
};
export const add = (m, n) => [m[0] + n[0], m[1] + n[1]];
export const sub = (m, n) => [m[0] - n[0], m[1] - n[1]];
export const neg = (m) => [-m[0], -m[1]];
export const eq = (m, n) => m[0] === n[0] && m[1] === n[1];

/** Integer form B(μ,ν) = 6⟨μ,ν⟩ where ⟨,⟩ is the Euclidean product in the (T3, T8) plane. */
export const B = (m, n) => 2 * m[0] * n[0] + m[0] * n[1] + m[1] * n[0] + 2 * m[1] * n[1];
/** ⟨μ,ν⟩ in the (T3,T8) metric (roots have length 1). */
export const ip = (m, n) => B(m, n) / 6;
/** ρ-height used to order weights: ⟨μ, ρ⟩ ∝ a + b (ρ = ω1 + ω2 = α1 + α2 is strictly dominant). */
export const height = (m) => m[0] + m[1];

export const QUARKS = {
  u: [1, 0],
  d: [-1, 1],
  s: [0, -1],
};

/** The six roots = charges of the ladder operators (and of the six charged gluons). */
export const ROOTS = [
  { id: 'I+', dyn: [2, -1], tex: 'I_+', pair: 'I-', sub: 'I', sign: 1, ij: [0, 1], colour: 'r\\bar g' },
  { id: 'I-', dyn: [-2, 1], tex: 'I_-', pair: 'I+', sub: 'I', sign: -1, ij: [1, 0], colour: 'g\\bar r' },
  { id: 'U+', dyn: [-1, 2], tex: 'U_+', pair: 'U-', sub: 'U', sign: 1, ij: [1, 2], colour: 'g\\bar b' },
  { id: 'U-', dyn: [1, -2], tex: 'U_-', pair: 'U+', sub: 'U', sign: -1, ij: [2, 1], colour: 'b\\bar g' },
  { id: 'V+', dyn: [1, 1], tex: 'V_+', pair: 'V-', sub: 'V', sign: 1, ij: [0, 2], colour: 'r\\bar b' },
  { id: 'V-', dyn: [-1, -1], tex: 'V_-', pair: 'V+', sub: 'V', sign: -1, ij: [2, 0], colour: 'b\\bar r' },
];
export const POSITIVE_ROOTS = [
  [2, -1],
  [-1, 2],
  [1, 1],
];
/** The three su(2) subalgebras: direction (positive root) and the coroot pairing ⟨μ, α^∨⟩ = 2m. */
export const SU2S = {
  I: { root: [2, -1], label: (m) => m[0], tex: 'I' },
  U: { root: [-1, 2], label: (m) => m[1], tex: 'U' },
  V: { root: [1, 1], label: (m) => m[0] + m[1], tex: 'V' },
};

// ------------------------------------------------------------------ Weyl group (S3)
export const s1 = ([a, b]) => [-a, a + b];
export const s2 = ([a, b]) => [a + b, -b];
/** All six Weyl group elements as functions on Dynkin labels. */
export const WEYL = [(m) => m, s1, s2, (m) => s1(s2(m)), (m) => s2(s1(m)), (m) => s1(s2(s1(m)))];

export function dominant(m) {
  let x = m;
  for (let i = 0; i < 12; i++) {
    if (x[0] < 0) x = s1(x);
    else if (x[1] < 0) x = s2(x);
    else return x;
  }
  return x;
}

/** Is μ a weight of the irrep with highest weight Λ = [p, q]? (dominant conjugate test) */
export function isWeightOf(m, L) {
  const d = dominant(m);
  const x = L[0] - d[0];
  const y = L[1] - d[1];
  const n1 = 2 * x + y;
  const n2 = x + 2 * y;
  return n1 >= 0 && n2 >= 0 && n1 % 3 === 0 && n2 % 3 === 0;
}

// ------------------------------------------------------------------ irreps
export const dim = (p, q) => ((p + 1) * (q + 1) * (p + q + 2)) / 2;
/** Quadratic Casimir with tr(T_a T_b) = δ_ab/2 in the 3: C2(3) = 4/3, C2(8) = 3. */
export const casimir = (p, q) => (p * p + q * q + p * q + 3 * p + 3 * q) / 3;
export const triality = (p, q) => (((p - q) % 3) + 3) % 3;
/** Dynkin index T(R) with tr_R(T_a T_b) = T(R) δ_ab: T(3) = 1/2, T(8) = 3. */
export const dynkinIndex = (p, q) => (dim(p, q) * casimir(p, q)) / 8;

/** TeX name of an irrep: 3, \bar 3, 8, 10, 15′ … */
export function irrepTex(p, q) {
  const d = dim(p, q);
  const prime = (p === 4 && q === 0) || (p === 0 && q === 4) ? "'" : '';
  const body = `\\mathbf{${d}}${prime}`;
  return p < q ? `\\overline{${body}}` : body;
}
export function irrepText(p, q) {
  const d = dim(p, q);
  const prime = (p === 4 && q === 0) || (p === 0 && q === 4) ? '′' : '';
  return p < q ? `${d}${prime}̄` : `${d}${prime}`;
}

const cache = new Map();
/**
 * Weights of the irrep (p, q) with multiplicities from Freudenthal's recursion
 *   (|Λ+ρ|² − |μ+ρ|²) m(μ) = 2 Σ_{α>0} Σ_{k≥1} m(μ+kα) ⟨μ+kα, α⟩,
 * evaluated with the exact integer form B (the overall scale cancels).
 * Returns [{ dyn, mult, iy:[I3,Y], pt:[T3,T8], depth }] sorted by Y (desc) then I3 (asc).
 */
export function weights(p, q) {
  const k0 = p + ',' + q;
  if (cache.has(k0)) return cache.get(k0);
  const L = [p, q];
  const rho = [1, 1];
  const Lr = add(L, rho);
  const nL = B(Lr, Lr);
  const mult = new Map([[key(L), 1]]);
  const out = [{ dyn: L, mult: 1, depth: 0 }];
  const maxDepth = 2 * (p + q);
  for (let d = 1; d <= maxDepth; d++) {
    for (let n1 = 0; n1 <= d; n1++) {
      const n2 = d - n1;
      const m = [p - 2 * n1 + n2, q + n1 - 2 * n2];
      if (!isWeightOf(m, L)) continue;
      let s = 0;
      for (const a of POSITIVE_ROOTS) {
        for (let k = 1; ; k++) {
          const v = [m[0] + k * a[0], m[1] + k * a[1]];
          const mv = mult.get(key(v));
          if (mv === undefined) break; // α-strings are unbroken
          s += mv * B(v, a);
        }
      }
      const mr = add(m, rho);
      const den = nL - B(mr, mr);
      const val = (2 * s) / den;
      const mm = Math.round(val);
      if (!(den > 0) || Math.abs(val - mm) > 1e-9 || mm < 1) throw new Error(`Freudenthal failed at ${key(m)} in (${p},${q}): ${val}`);
      mult.set(key(m), mm);
      out.push({ dyn: m, mult: mm, depth: d });
    }
  }
  for (const w of out) {
    w.iy = toIY(w.dyn);
    w.pt = toPlane(w.dyn);
  }
  out.sort((u, v) => v.iy[1] - u.iy[1] || u.iy[0] - v.iy[0]);
  cache.set(k0, out);
  return out;
}

/** Map key → multiplicity for the irrep (p, q). */
export function weightMap(p, q) {
  return new Map(weights(p, q).map((w) => [key(w.dyn), w.mult]));
}

/** Corners of the weight polygon (Weyl orbit of Λ) in (T3,T8), counter-clockwise. 1, 3 or 6 points. */
export function outline(p, q) {
  const seen = new Map();
  for (const w of WEYL) {
    const m = w([p, q]);
    seen.set(key(m), m);
  }
  const pts = [...seen.values()].map(toPlane);
  pts.sort((u, v) => Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]));
  return pts;
}

/** Shell k of (p,q) = outline of Λ − kρ (k = 0 … min(p,q)); inside those the diagram is a triangle. */
export function shells(p, q) {
  const out = [];
  for (let k = 0; k <= Math.min(p, q); k++) out.push({ k, mult: k + 1, pts: outline(p - k, q - k) });
  // remaining triangular shells (multiplicity stays min(p,q)+1)
  const r = Math.abs(p - q);
  const big = p >= q;
  for (let j = 1; 3 * j <= r; j++) {
    const n = r - 3 * j;
    out.push({ k: Math.min(p, q) + j, mult: Math.min(p, q) + 1, pts: big ? outline(n, 0) : outline(0, n), triangle: true });
  }
  return out;
}

// ------------------------------------------------------------------ tensor products
/** Multiset (Map key→mult) of an irrep. */
export const irrepMultiset = (p, q) => weightMap(p, q);

/** Minkowski sum of two weight multisets (the weights of the tensor product). */
export function productMultiset(A, Bm) {
  const out = new Map();
  for (const [ka, ma] of A) {
    const a = unkey(ka);
    for (const [kb, mb] of Bm) {
      const b = unkey(kb);
      const k = key(add(a, b));
      out.set(k, (out.get(k) || 0) + ma * mb);
    }
  }
  return out;
}

/**
 * Decompose a weight multiset into irreps by peeling: the weight with the largest ⟨μ,ρ⟩ is a highest
 * weight; its multiplicity is the number of copies. Returns [{ p, q, n }] in peel order, plus the
 * individual copies (for colouring) as `copies: [{p,q}]`.
 */
export function decompose(M) {
  const R = new Map(M);
  const parts = [];
  for (let guard = 0; guard < 400 && R.size; guard++) {
    let best = null;
    for (const [k, m] of R) {
      if (m <= 0) continue;
      const mu = unkey(k);
      // ties in ρ-height are broken by Y then I3 so the order is deterministic
      if (!best || height(mu) > height(best) || (height(mu) === height(best) && (mu[0] > best[0] || (mu[0] === best[0] && mu[1] > best[1])))) best = mu;
    }
    if (!best) break;
    if (best[0] < 0 || best[1] < 0) throw new Error('decompose: top weight not dominant ' + key(best));
    const n = R.get(key(best));
    for (const w of weights(best[0], best[1])) {
      const k = key(w.dyn);
      const left = (R.get(k) || 0) - n * w.mult;
      if (left < 0) throw new Error('decompose: negative multiplicity at ' + k);
      if (left === 0) R.delete(k);
      else R.set(k, left);
    }
    parts.push({ p: best[0], q: best[1], n });
  }
  for (const [k, m] of R) if (m !== 0) throw new Error('decompose: leftover ' + k);
  const copies = [];
  for (const pt of parts) for (let i = 0; i < pt.n; i++) copies.push({ p: pt.p, q: pt.q });
  return { parts, copies };
}

/** Tensor product of a list of irreps [[p,q], …]: stages of the Minkowski sum and the decomposition. */
export function tensorProduct(factors) {
  let M = irrepMultiset(...factors[0]);
  const stages = [M];
  for (let i = 1; i < factors.length; i++) {
    M = productMultiset(M, irrepMultiset(...factors[i]));
    stages.push(M);
  }
  const { parts, copies } = decompose(M);
  const total = [...M.values()].reduce((s, m) => s + m, 0);
  const tri = factors.reduce((s, [p, q]) => s + triality(p, q), 0) % 3;
  return { factors, stages, multiset: M, parts, copies, total, triality: tri, singlets: parts.filter((x) => x.p === 0 && x.q === 0).reduce((s, x) => s + x.n, 0) };
}

/** Products offered in the "Building hadrons" tab. */
export const PRODUCTS = [
  {
    id: '3x3b',
    factors: [
      [1, 0],
      [0, 1],
    ],
    label: '3 ⊗ 3̄ (quark + antiquark)',
    tex: '\\mathbf 3\\otimes\\overline{\\mathbf 3}',
    kind: 'mesons',
  },
  {
    id: '3x3',
    factors: [
      [1, 0],
      [1, 0],
    ],
    label: '3 ⊗ 3 (two quarks)',
    tex: '\\mathbf 3\\otimes\\mathbf 3',
    kind: 'diquark',
  },
  {
    id: '3x3x3',
    factors: [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    label: '3 ⊗ 3 ⊗ 3 (three quarks)',
    tex: '\\mathbf 3\\otimes\\mathbf 3\\otimes\\mathbf 3',
    kind: 'baryons',
  },
  {
    id: '8x8',
    factors: [
      [1, 1],
      [1, 1],
    ],
    label: '8 ⊗ 8 (two octets / two gluons)',
    tex: '\\mathbf 8\\otimes\\mathbf 8',
    kind: 'octets',
  },
  {
    id: '3x8',
    factors: [
      [1, 0],
      [1, 1],
    ],
    label: '3 ⊗ 8 (quark + gluon)',
    tex: '\\mathbf 3\\otimes\\mathbf 8',
    kind: 'quark-gluon',
  },
  {
    id: '6x3',
    factors: [
      [2, 0],
      [1, 0],
    ],
    label: '6 ⊗ 3 (symmetric diquark + quark)',
    tex: '\\mathbf 6\\otimes\\mathbf 3',
    kind: 'decuplet',
  },
];

// ------------------------------------------------------------------ hadron data (PDG masses, MeV)
// Each multiplet: list of { dyn, tex (name), q (quark content TeX), m (MeV) }.
const P = (I3, Y, tex, q, m, extra = {}) => ({ dyn: fromIY([I3, Y]), tex, q, m, ...extra });
export const MULTIPLETS = {
  quarks: {
    pq: [1, 0],
    title: 'Quark triplet $\\mathbf 3$',
    jp: '\\tfrac12^+',
    particles: [P(0.5, 1 / 3, 'u', 'Q=+\\tfrac23', null), P(-0.5, 1 / 3, 'd', 'Q=-\\tfrac13', null), P(0, -2 / 3, 's', 'Q=-\\tfrac13', null)],
  },
  antiquarks: {
    pq: [0, 1],
    title: 'Antiquark triplet $\\overline{\\mathbf 3}$',
    jp: '\\tfrac12^-',
    particles: [P(-0.5, -1 / 3, '\\bar u', 'Q=-\\tfrac23', null), P(0.5, -1 / 3, '\\bar d', 'Q=+\\tfrac13', null), P(0, 2 / 3, '\\bar s', 'Q=+\\tfrac13', null)],
  },
  baryons: {
    pq: [1, 1],
    title: 'Baryon octet $J^P=\\tfrac12^+$',
    jp: '\\tfrac12^+',
    particles: [
      P(0.5, 1, 'p', 'uud', 938.3),
      P(-0.5, 1, 'n', 'udd', 939.6),
      P(1, 0, '\\Sigma^+', 'uus', 1189.4),
      P(0, 0, '\\Sigma^0', 'uds', 1192.6, { side: 1, isospin: 1 }),
      P(0, 0, '\\Lambda', 'uds', 1115.7, { side: -1, isospin: 0 }),
      P(-1, 0, '\\Sigma^-', 'dds', 1197.4),
      P(0.5, -1, '\\Xi^0', 'uss', 1314.9),
      P(-0.5, -1, '\\Xi^-', 'dss', 1321.7),
    ],
    rows: [
      { Y: 1, tex: 'N', m: (938.3 + 939.6) / 2 },
      { Y: 0, tex: '\\Sigma', m: (1189.4 + 1192.6 + 1197.4) / 3, tex2: '\\Lambda', m2: 1115.7 },
      { Y: -1, tex: '\\Xi', m: (1314.9 + 1321.7) / 2 },
    ],
  },
  mesons: {
    pq: [1, 1],
    title: 'Pseudoscalar meson octet $J^P=0^-$',
    jp: '0^-',
    particles: [
      P(0.5, 1, 'K^+', 'u\\bar s', 493.7),
      P(-0.5, 1, 'K^0', 'd\\bar s', 497.6),
      P(1, 0, '\\pi^+', 'u\\bar d', 139.6),
      P(0, 0, '\\pi^0', '\\tfrac{u\\bar u-d\\bar d}{\\sqrt2}', 135.0, { side: 1, isospin: 1 }),
      P(0, 0, '\\eta', '\\tfrac{u\\bar u+d\\bar d-2s\\bar s}{\\sqrt6}', 547.9, { side: -1, isospin: 0 }),
      P(-1, 0, '\\pi^-', 'd\\bar u', 139.6),
      P(0.5, -1, '\\bar K^0', 's\\bar d', 497.6),
      P(-0.5, -1, 'K^-', 's\\bar u', 493.7),
    ],
    rows: [
      { Y: 1, tex: 'K', m: (493.7 + 497.6) / 2 },
      { Y: 0, tex: '\\pi', m: (139.6 * 2 + 135.0) / 3, tex2: '\\eta', m2: 547.9 },
      { Y: -1, tex: '\\bar K', m: (493.7 + 497.6) / 2 },
    ],
  },
  decuplet: {
    pq: [3, 0],
    title: 'Baryon decuplet $J^P=\\tfrac32^+$',
    jp: '\\tfrac32^+',
    particles: [
      P(-1.5, 1, '\\Delta^-', 'ddd', 1232),
      P(-0.5, 1, '\\Delta^0', 'udd', 1232),
      P(0.5, 1, '\\Delta^+', 'uud', 1232),
      P(1.5, 1, '\\Delta^{++}', 'uuu', 1232),
      P(-1, 0, '\\Sigma^{*-}', 'dds', 1385),
      P(0, 0, '\\Sigma^{*0}', 'uds', 1385),
      P(1, 0, '\\Sigma^{*+}', 'uus', 1385),
      P(-0.5, -1, '\\Xi^{*-}', 'dss', 1530),
      P(0.5, -1, '\\Xi^{*0}', 'uss', 1530),
      P(0, -2, '\\Omega^-', 'sss', 1672, { omega: true }),
    ],
    rows: [
      { Y: 1, tex: '\\Delta', m: 1232 },
      { Y: 0, tex: '\\Sigma^*', m: 1385 },
      { Y: -1, tex: '\\Xi^*', m: 1530 },
      { Y: -2, tex: '\\Omega^-', m: 1672, omega: true },
    ],
  },
};

/** Which particle multiplet (if any) belongs to (p,q); for (1,1) the caller chooses baryons/mesons. */
export function multipletFor(p, q, octet = 'baryons') {
  if (p === 1 && q === 0) return MULTIPLETS.quarks;
  if (p === 0 && q === 1) return MULTIPLETS.antiquarks;
  if (p === 1 && q === 1) return MULTIPLETS[octet] || MULTIPLETS.baryons;
  if (p === 3 && q === 0) return MULTIPLETS.decuplet;
  return null;
}

/** Equal-spacing (Gell-Mann–Okubo for the decuplet) prediction of the Ω⁻ from Σ* and Ξ*. */
export function omegaPrediction() {
  const r = MULTIPLETS.decuplet.rows;
  const step1 = r[1].m - r[0].m; // Σ* − Δ
  const step2 = r[2].m - r[1].m; // Ξ* − Σ*
  return { step1, step2, mean: (r[2].m - r[0].m) / 2, predicted: r[2].m + step2, observed: r[3].m };
}

/** Gell-Mann–Okubo for the baryon octet: 2(m_N + m_Ξ) = 3 m_Λ + m_Σ. */
export function gmoOctet() {
  const r = MULTIPLETS.baryons.rows;
  const lhs = 2 * (r[0].m + r[2].m);
  const rhs = 3 * r[1].m2 + r[1].m;
  return { lhs, rhs, rel: (lhs - rhs) / rhs };
}

/** su(2) spin content of a string of states along direction α: multiplicities by 2m → list of spins j. */
export function spinContent(mults) {
  // mults: Map 2m → multiplicity
  const out = [];
  const keys = [...mults.keys()];
  if (!keys.length) return out;
  const top = Math.max(...keys);
  for (let twoj = top; twoj >= 0; twoj -= 2) {
    const n = (mults.get(twoj) || 0) - (mults.get(twoj + 2) || 0);
    for (let i = 0; i < n; i++) out.push(twoj / 2);
  }
  return out;
}

/** Lines of states for one su(2) subalgebra: [{ states:[{dyn,mult,twoM}], spins:[j…] }]. */
export function su2Strings(p, q, which) {
  const S = SU2S[which];
  const a = S.root;
  const lines = new Map();
  // a weight's line is labelled by an invariant of translations along a: B(μ, a⊥) — use the coroot pairing of the
  // orthogonal direction; simplest is to project out: μ ↦ μ − (label/2)·a has zero pairing with α^∨.
  for (const w of weights(p, q)) {
    const twoM = S.label(w.dyn);
    // base point = μ − m α (exact because 2m·a/2; use doubled coordinates)
    const base = [2 * w.dyn[0] - twoM * a[0], 2 * w.dyn[1] - twoM * a[1]];
    const k = key(base);
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push({ dyn: w.dyn, mult: w.mult, twoM });
  }
  const out = [];
  for (const states of lines.values()) {
    states.sort((u, v) => u.twoM - v.twoM);
    const mm = new Map(states.map((s) => [s.twoM, s.mult]));
    out.push({ states, spins: spinContent(mm) });
  }
  return out;
}

// ------------------------------------------------------------------ the algebra: Gell-Mann matrices
const c = (re, im = 0) => ({ re, im });
const cm = (rows) => rows.map((r) => r.map((e) => (typeof e === 'number' ? c(e) : e)));
const I_ = c(0, 1);
const MI = c(0, -1);
/** Gell-Mann matrices λ1 … λ8 (index 0 … 7). */
export const LAMBDA = [
  cm([
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ]),
  cm([
    [0, MI, 0],
    [I_, 0, 0],
    [0, 0, 0],
  ]),
  cm([
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 0],
  ]),
  cm([
    [0, 0, 1],
    [0, 0, 0],
    [1, 0, 0],
  ]),
  cm([
    [0, 0, MI],
    [0, 0, 0],
    [I_, 0, 0],
  ]),
  cm([
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ]),
  cm([
    [0, 0, 0],
    [0, 0, MI],
    [0, I_, 0],
  ]),
  cm([
    [1 / SQ3, 0, 0],
    [0, 1 / SQ3, 0],
    [0, 0, -2 / SQ3],
  ]),
];
/** Generators T_a = λ_a / 2 (Hermitian, tr T_a T_b = δ_ab/2). */
export const TGEN = LAMBDA.map((L) => cmat.scale(L, 0.5));
/** Hypercharge Y = (2/√3) T8 = diag(1/3, 1/3, −2/3). */
export const YGEN = cmat.scale(TGEN[7], 2 / SQ3);

/** Non-zero structure constants f_abc with a < b < c (1-based), totally antisymmetric. */
export const F_TABLE = [
  [1, 2, 3, 1],
  [1, 4, 7, 0.5],
  [1, 5, 6, -0.5],
  [2, 4, 6, 0.5],
  [2, 5, 7, 0.5],
  [3, 4, 5, 0.5],
  [3, 6, 7, -0.5],
  [4, 5, 8, SQ3 / 2],
  [6, 7, 8, SQ3 / 2],
];
/** Full antisymmetric f[a][b][c] (0-based). */
export const F = (() => {
  const f = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => new Array(8).fill(0)));
  for (const [a, b, cc, v] of F_TABLE) {
    const idx = [a - 1, b - 1, cc - 1];
    const perms = [
      [0, 1, 2, 1],
      [1, 2, 0, 1],
      [2, 0, 1, 1],
      [1, 0, 2, -1],
      [0, 2, 1, -1],
      [2, 1, 0, -1],
    ];
    for (const [i, j, k, s] of perms) f[idx[i]][idx[j]][idx[k]] = s * v;
  }
  return f;
})();

/** f_abc extracted numerically: f_abc = −2i tr([T_a,T_b] T_c). */
export function fNumeric(a, b, cc) {
  const t = cmat.trace(cmat.mul(cmat.comm(TGEN[a], TGEN[b]), TGEN[cc]));
  return 2 * t.im; // −2i·(i f/2) = f; the trace is purely imaginary
}

/** Matrix unit E_ij (0-based). */
export function unit(i, j) {
  const M = cmat.zeros(3);
  M[i][j] = c(1);
  return M;
}
/** Generators by id: ladder operators (E_α = matrix units) and the Cartan T3, T8. */
export function generator(id) {
  const r = ROOTS.find((x) => x.id === id);
  if (r) return unit(r.ij[0], r.ij[1]);
  if (id === 'T3') return TGEN[2];
  if (id === 'T8') return TGEN[7];
  if (/^l[1-8]$/.test(id)) return TGEN[Number(id[1]) - 1];
  throw new Error('unknown generator ' + id);
}
/** Root (weight under (T3,T8)) of a generator id, in plane coordinates; Cartan → [0,0]. */
export function chargeOf(id) {
  const r = ROOTS.find((x) => x.id === id);
  return r ? toPlane(r.dyn) : [0, 0];
}
export const GEN_TEX = {
  'I+': 'I_+',
  'I-': 'I_-',
  'U+': 'U_+',
  'U-': 'U_-',
  'V+': 'V_+',
  'V-': 'V_-',
  T3: 'T_3',
  T8: 'T_8',
};

/**
 * Express a traceless 3×3 complex matrix M in the basis {E_ij (i≠j), T3, T8}:
 * returns [{ id, coef: {re,im} }] (non-zero terms only).
 */
export function expand(M, tol = 1e-12) {
  const terms = [];
  for (const r of ROOTS) {
    const z = M[r.ij[0]][r.ij[1]];
    if (Math.hypot(z.re, z.im) > tol) terms.push({ id: r.id, coef: z });
  }
  // diagonal part: coefficients 2 tr(T_a M) for T3, T8
  for (const [id, T] of [
    ['T3', TGEN[2]],
    ['T8', TGEN[7]],
  ]) {
    const t = cmat.trace(cmat.mul(T, M));
    const z = { re: 2 * t.re, im: 2 * t.im };
    if (Math.hypot(z.re, z.im) > tol) terms.push({ id, coef: z });
  }
  return terms;
}

/** Residual of M − Σ terms (should vanish for traceless M). */
export function rebuild(terms) {
  let R = cmat.zeros(3);
  for (const t of terms) R = cmat.add(R, cmat.scale(generator(t.id), t.coef));
  return R;
}

/** Commutator of two generators by id, expanded. */
export function bracket(x, y) {
  const M = cmat.comm(generator(x), generator(y));
  return { M, terms: expand(M) };
}

export { cx, cmat };
