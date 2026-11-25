// Linear Hamiltonian flows on the phase plane R² = {(q, p)}: Sp(2,R) = SL(2,R) and sp(2,R) ≅ sl(2,R) ≅ so(2,1).
// DOM-free (verified by tests/sp2.test.mjs).
//
// Conventions
//   H = ½(a p² + 2b q p + c q²) = ½ zᵀ A z,   z = (q, p),   A = [[c, b], [b, a]]
//   Hamilton: q' = ∂H/∂p = b q + a p,  p' = −∂H/∂q = −c q − b p   ⇒   z' = X z,  X = J A = [[b, a], [−c, −b]]
//   J = [[0, 1], [−1, 0]]  (Poisson bracket {f, g} = ∂_q f ∂_p g − ∂_p f ∂_q g = ∇fᵀ J ∇g)
//   M(t) = e^{tX} ∈ SL(2,R) = Sp(2,R).
//   Δ = b² − ac = −det X = ½ tr X²:  Δ < 0 elliptic, Δ = 0 parabolic, Δ > 0 hyperbolic.
//   Minkowski coordinates (x, y, t) = ((a − c)/2, b, (a + c)/2):  Δ = x² + y² − t²,
//   H = 2(t K0 + x K1 + y K2) with K0 = (p² + q²)/4, K1 = (p² − q²)/4, K2 = qp/2.
//   Matrix convention: X_{f,g} = [X_f, X_g] for the linear flows z' = X z.

import { mat, exp2, signedArea } from '../../core/la.js';

export const J2 = [
  [0, 1],
  [-1, 0],
];

// ------------------------------------------------------------------ the algebra sp(2,R)
/** Generator X of the flow of H(a, b, c). */
export const generator = (h) => [
  [h.b, h.a],
  [-h.c, -h.b],
];
/** Symmetric matrix A with H = ½ zᵀ A z. */
export const quadMatrix = (h) => [
  [h.c, h.b],
  [h.b, h.a],
];
export const energy = (h, q, p) => 0.5 * (h.a * p * p + 2 * h.b * q * p + h.c * q * q);
export const discriminant = (h) => h.b * h.b - h.a * h.c;
export const toMinkowski = (h) => [(h.a - h.c) / 2, h.b, (h.a + h.c) / 2];
export const fromMinkowski = ([x, y, t]) => ({ a: t + x, b: y, c: t - x });
/** Inverse of generator() for a traceless X. */
export const fromGenerator = (X) => ({ a: X[0][1], b: (X[0][0] - X[1][1]) / 2, c: -X[1][0] });
/** Hamiltonian vector field X z at (q, p). */
export const field = (h, q, p) => [h.b * q + h.a * p, -h.c * q - h.b * p];

/** Basis of sp(2,R) as quadratic forms (symmetric matrices S, f = ½ zᵀ S z): K0, K1, K2. */
export const K_FORMS = [
  [
    [0.5, 0],
    [0, 0.5],
  ], // K0 = (p² + q²)/4
  [
    [-0.5, 0],
    [0, 0.5],
  ], // K1 = (p² − q²)/4
  [
    [0, 0.5],
    [0.5, 0],
  ], // K2 = qp/2
];
/** Poisson bracket of two quadratic forms f = ½zᵀFz, g = ½zᵀGz: {f,g} = ½zᵀ(FJG − GJF)z. Returns the matrix. */
export function poissonQuad(F, G) {
  return mat.sub(mat.chain(F, J2, G), mat.chain(G, J2, F));
}
/** Generator matrix X_f = J F of the quadratic form f = ½zᵀFz. */
export const flowMatrix = (F) => mat.mul(J2, F);

/**
 * Classify H. Returns { type: 'elliptic'|'parabolic'|'hyperbolic'|'zero', Delta, omega?, period?, lambda?, sheet }.
 * sheet = sign(a + c): +1 positive (semi)definite H (upper sheet / nappe), −1 negative.
 */
export function classify(h, tol = 1e-9) {
  const D = discriminant(h);
  const scale = h.a * h.a + 2 * h.b * h.b + h.c * h.c;
  const t = (h.a + h.c) / 2;
  if (!(scale > 1e-20)) return { type: 'zero', Delta: 0, sheet: 0 };
  if (Math.abs(D) <= tol * scale) return { type: 'parabolic', Delta: D, sheet: Math.sign(t) || 1 };
  if (D < 0) {
    const omega = Math.sqrt(-D);
    return { type: 'elliptic', Delta: D, omega, period: (2 * Math.PI) / omega, sheet: Math.sign(t) };
  }
  return { type: 'hyperbolic', Delta: D, lambda: Math.sqrt(D), sheet: 0 };
}

/** M(t) = exp(t X_H). */
export const flow = (h, t) => exp2(mat.scale(generator(h), t));

/** Conjugate H by a symplectic S: H' = H∘S⁻¹, X' = S X S⁻¹ (canonical change of coordinates z → S z). */
export function conjugate(h, S) {
  const X = generator(h);
  const Si = mat.inv(S);
  return fromGenerator(mat.chain(S, X, Si));
}

// ------------------------------------------------------------------ the group Sp(2,R) = SL(2,R)
export const rot = (th) => [
  [Math.cos(th), Math.sin(th)],
  [-Math.sin(th), Math.cos(th)],
]; // = exp(θ J): the oscillator flow (clockwise in the q–p plane)
export const squeeze = (r) => [
  [Math.exp(r), 0],
  [0, Math.exp(-r)],
]; // = exp(r diag(1,−1)): the flow of H = qp

/**
 * Classify M ∈ SL(2,R) by its trace. Returns { tr, type, isExp } where isExp tells whether M = e^X for some
 * X ∈ sl(2,R): that holds iff tr M > −2 or M = −1 (tr e^X ≥ −2 always).
 */
export function classifyElement(M, tol = 1e-9) {
  const tr = M[0][0] + M[1][1];
  const minusI = Math.abs(M[0][0] + 1) < tol && Math.abs(M[1][1] + 1) < tol && Math.abs(M[0][1]) < tol && Math.abs(M[1][0]) < tol;
  let type;
  if (Math.abs(Math.abs(tr) - 2) <= tol) type = 'parabolic';
  else if (Math.abs(tr) < 2) type = 'elliptic';
  else type = 'hyperbolic';
  return { tr, type, isExp: tr > -2 + tol || minusI };
}

/** Real 2×2 eigen-decomposition summary for M ∈ SL(2,R): multipliers λ, 1/λ (or e^{±iμ}). */
export function multipliers(M) {
  const tr = M[0][0] + M[1][1];
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const disc = tr * tr - 4 * det;
  if (disc < 0) {
    const mu = Math.atan2(Math.sqrt(-disc) / 2, tr / 2);
    return { real: false, mu, l1: { re: tr / 2, im: Math.sqrt(-disc) / 2 }, l2: { re: tr / 2, im: -Math.sqrt(-disc) / 2 } };
  }
  const s = Math.sqrt(disc);
  return { real: true, l1: { re: (tr + s) / 2, im: 0 }, l2: { re: (tr - s) / 2, im: 0 } };
}

/** Eigenvectors of a real 2×2 matrix with real eigenvalues (unit, or null). */
export function realEigenvectors(M) {
  const [[a, b], [c, d]] = M;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const out = [];
  for (const l of [(tr + s) / 2, (tr - s) / 2]) {
    // (M − l) v = 0
    let v = Math.abs(b) > Math.abs(c) ? [b, l - a] : [l - d, c];
    if (Math.hypot(v[0], v[1]) < 1e-14) v = Math.abs(a - l) > 1e-14 || Math.abs(b) > 1e-14 ? [-b, a - l] : [1, 0];
    const n = Math.hypot(v[0], v[1]) || 1;
    out.push({ value: l, vec: [v[0] / n, v[1] / n] });
  }
  return out;
}

// ------------------------------------------------------------------ level sets of quadratic forms
/**
 * Eigen-decomposition of a symmetric 2×2 matrix [[α, β], [β, γ]]: λ₊ ≥ λ₋ with unit eigenvectors e₊, e₋.
 */
export function symEig2(A) {
  const al = A[0][0];
  const be = A[0][1];
  const ga = A[1][1];
  const m = (al + ga) / 2;
  const r = Math.hypot((al - ga) / 2, be);
  const phi = 0.5 * Math.atan2(2 * be, al - ga);
  return { lp: m + r, lm: m - r, ep: [Math.cos(phi), Math.sin(phi)], em: [-Math.sin(phi), Math.cos(phi)], phi };
}

/**
 * Polyline(s) of the level set ½ zᵀ A z = h inside the disc |z| ≤ R, as an array of points with `null` breaks
 * (plot2d.line skips nulls). Exact points, adaptive in arc length (max segment ≈ R/maxSegDiv).
 */
export function levelSet(A, h, R, opts = {}) {
  const n = opts.samples ?? 360;
  const maxSeg = R / (opts.maxSegDiv ?? 60);
  const { lp, lm, ep, em } = symEig2(A);
  const out = [];
  if (Math.abs(h) < 1e-15) {
    // separatrices: lines through the origin along the directions where Q(θ) = 0
    const lines = [];
    if (lp > 0 && lm < 0) {
      const th = Math.atan(Math.sqrt(-lp / lm));
      lines.push(th, -th);
    } else if (Math.abs(lm) < 1e-12 * Math.max(1, Math.abs(lp))) lines.push(Math.PI / 2);
    else if (Math.abs(lp) < 1e-12 * Math.max(1, Math.abs(lm))) lines.push(0);
    for (const th of lines) {
      const d = [Math.cos(th) * ep[0] + Math.sin(th) * em[0], Math.cos(th) * ep[1] + Math.sin(th) * em[1]];
      out.push([-R * d[0], -R * d[1]], [R * d[0], R * d[1]], null);
    }
    return out;
  }
  const Q = (th) => lp * Math.cos(th) ** 2 + lm * Math.sin(th) ** 2;
  const s = (th) => (Q(th) * R * R) / (2 * h) - 1; // ≥ 0 ⇔ the level set point in direction θ lies inside the disc
  const point = (th) => {
    const q = Q(th);
    const rho = Math.sqrt(Math.max(0, (2 * h) / q));
    const c = Math.cos(th) * rho;
    const sn = Math.sin(th) * rho;
    return [c * ep[0] + sn * em[0], c * ep[1] + sn * em[1]];
  };
  const boundary = (t0, t1) => {
    // s changes sign between t0 and t1: bisect for s = 0 (|z| = R)
    let a = t0;
    let b = t1;
    const sa = s(a);
    for (let i = 0; i < 48; i++) {
      const m = (a + b) / 2;
      if (s(m) >= 0 === sa >= 0) a = m;
      else b = m;
    }
    return sa >= 0 ? a : b;
  };
  const refine = (t0, p0, t1, p1, depth) => {
    // push points strictly after p0 up to and including p1
    if (depth < 10 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > maxSeg) {
      const tm = (t0 + t1) / 2;
      const pm = point(tm);
      refine(t0, p0, tm, pm, depth + 1);
      refine(tm, pm, t1, p1, depth + 1);
    } else out.push(p1);
  };
  // start at a direction outside the drawn set if there is one, so curves are not split at θ = 0
  let start = 0;
  let found = false;
  for (let k = 0; k < n; k++) {
    const th = (k / n) * 2 * Math.PI;
    if (s(th) < 0) {
      start = th;
      found = true;
      break;
    }
  }
  let prevT = start;
  let prevIn = s(start) >= 0;
  let prevP = prevIn ? point(start) : null;
  if (prevIn) out.push(prevP);
  for (let k = 1; k <= n; k++) {
    const th = start + (k / n) * 2 * Math.PI;
    const inside = s(th) >= 0;
    if (inside && prevIn) {
      const p = point(th);
      refine(prevT, prevP, th, p, 0);
      prevP = p;
    } else if (inside && !prevIn) {
      const tb = boundary(prevT, th);
      const pb = point(tb);
      out.push(pb);
      const p = point(th);
      refine(tb, pb, th, p, 0);
      prevP = p;
    } else if (!inside && prevIn) {
      const tb = boundary(prevT, th);
      const pb = point(tb);
      refine(prevT, prevP, tb, pb, 0);
      out.push(null);
      prevP = null;
    }
    prevT = th;
    prevIn = inside;
  }
  if (!found && out.length) out.push(out[0]); // closed ellipse fully inside: close it
  return out;
}

/**
 * A family of level sets of H for display: levels spaced so that the curves cross the stiffest principal
 * axis at multiples of `spacing`. Returns [{ h, pts, sign }].
 */
export function levelFamily(h, R, spacing, count = 8) {
  const A = quadMatrix(h);
  const { lp, lm } = symEig2(A);
  const big = Math.max(Math.abs(lp), Math.abs(lm));
  if (!(big > 1e-12)) return [];
  const levels = [];
  const tiny = 1e-9 * big;
  if (lp > tiny && lm < -tiny) {
    for (let k = 1; k <= count; k++) {
      levels.push({ h: (lp * (k * spacing) ** 2) / 2, sign: 1 });
      levels.push({ h: (lm * (k * spacing) ** 2) / 2, sign: -1 });
    }
    levels.push({ h: 0, sign: 0 });
  } else {
    const stiff = Math.abs(lp) >= Math.abs(lm) ? lp : lm;
    for (let k = 1; k <= count; k++) levels.push({ h: (stiff * (k * spacing) ** 2) / 2, sign: Math.sign(stiff) });
    levels.push({ h: 0, sign: 0 }); // line of fixed points in the parabolic case (nothing otherwise)
  }
  return levels.map((L) => ({ ...L, pts: levelSet(A, L.h, R) }));
}

// ------------------------------------------------------------------ shapes & Liouville
/** Polygon approximating a disc. */
export function discPolygon([cx, cy], r, n = 160) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
/** Polygon of a circular sector (centre + arc from a0 to a1). */
export function sectorPolygon([cx, cy], r, a0, a1, n = 40) {
  const pts = [[cx, cy]];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
export const mapPoints = (M, pts) => pts.map((z) => (z ? [M[0][0] * z[0] + M[0][1] * z[1], M[1][0] * z[0] + M[1][1] * z[1]] : z));
export const polygonArea = (pts) => signedArea(pts);

// ------------------------------------------------------------------ strong focusing (thin-lens FODO)
/** Thin lens of focal length f (f > 0 focusing, f < 0 defocusing): x' → x' − x/f. */
export const thinLens = (f) => [
  [1, 0],
  [-1 / f, 1],
];
/** Drift of length L: x → x + L x'. */
export const drift = (L) => [
  [1, L],
  [0, 1],
];
/**
 * Elements of one lattice cell in the order the particle meets them.
 * kind 'fodo': F(f) · drift · D(−f) · drift;  'dd': D, D;  'ff': F, F.  plane 'y' swaps F ↔ D (quadrupoles).
 */
export function cellElements(kind, L, f, plane = 'x') {
  const s = plane === 'y' ? -1 : 1;
  let f1 = f;
  let f2 = -f;
  if (kind === 'ff') f2 = f;
  if (kind === 'dd') {
    f1 = -f;
    f2 = -f;
  }
  return [
    { type: 'lens', f: s * f1, at: 0 },
    { type: 'drift', L, at: 0 },
    { type: 'lens', f: s * f2, at: L },
    { type: 'drift', L, at: L },
  ];
}
/** One-cell transfer matrix (later elements multiply on the left). */
export function cellMatrix(kind, L, f, plane = 'x') {
  let M = mat.eye(2);
  for (const e of cellElements(kind, L, f, plane)) M = mat.mul(e.type === 'lens' ? thinLens(e.f) : drift(e.L), M);
  return M;
}
/** M = D(L) Q(−f) D(L) Q(f) in closed form (tr M = 2 − L²/f²). */
export const fodoMatrix = (L, f) => [
  [1 - L / f - (L * L) / (f * f), 2 * L + (L * L) / f],
  [-L / (f * f), 1 + L / f],
];

/** Ray x(s) through n cells: array of [s, x] at element boundaries (straight lines in between). */
export function traceRay(kind, L, f, z0, nCells, plane = 'x') {
  const els = cellElements(kind, L, f, plane);
  let [x, xp] = z0;
  let s = 0;
  const pts = [[s, x]];
  for (let c = 0; c < nCells; c++) {
    for (const e of els) {
      if (e.type === 'lens') xp -= x / e.f;
      else {
        x += e.L * xp;
        s += e.L;
        pts.push([s, x]);
      }
    }
  }
  return pts;
}

/** Courant–Snyder (Twiss) parameters of a stable one-turn map: M = cos μ 1 + sin μ [[α, β], [−γ, −α]]. */
export function twiss(M) {
  const tr = M[0][0] + M[1][1];
  const c = tr / 2;
  if (!(Math.abs(c) < 1)) return null;
  const sn = (M[0][1] >= 0 ? 1 : -1) * Math.sqrt(1 - c * c);
  if (Math.abs(sn) < 1e-14) return null;
  const beta = M[0][1] / sn;
  const alpha = (M[0][0] - M[1][1]) / (2 * sn);
  const gamma = -M[1][0] / sn;
  const mu = Math.atan2(sn, c);
  return { mu, tune: Math.abs(mu) / (2 * Math.PI), alpha, beta, gamma };
}
/**
 * Betatron function β(s) through nCells cells of a stable lattice (periodic Twiss solution), sampled along the
 * drifts: [[s, β], ...]. Thin lens: α → α + β/f; drift of length ℓ: β → β − 2αℓ + γℓ², α → α − γℓ.
 * Returns null for an unstable lattice.
 */
export function betaFunction(kind, L, f, plane = 'x', nCells = 1, perDrift = 24) {
  const tw = twiss(cellMatrix(kind, L, f, plane));
  if (!tw) return null;
  let { alpha, beta, gamma } = tw;
  const out = [[0, beta]];
  let s = 0;
  for (let c = 0; c < nCells; c++) {
    for (const e of cellElements(kind, L, f, plane)) {
      if (e.type === 'lens') {
        alpha += beta / e.f;
        gamma = (1 + alpha * alpha) / beta;
      } else {
        for (let i = 1; i <= perDrift; i++) {
          const ds = (e.L * i) / perDrift;
          out.push([s + ds, beta - 2 * alpha * ds + gamma * ds * ds]);
        }
        const b = beta - 2 * alpha * e.L + gamma * e.L * e.L;
        alpha -= gamma * e.L;
        beta = b;
        s += e.L;
      }
    }
  }
  return out;
}

/** Courant–Snyder invariant γx² + 2αxx' + βx'². */
export const csInvariant = (tw, [x, xp]) => tw.gamma * x * x + 2 * tw.alpha * x * xp + tw.beta * xp * xp;
/** Points on the Courant–Snyder ellipse with invariant ε (as the quadratic form [[γ, α], [α, β]] = 2ε level set). */
export function csEllipse(tw, eps, n = 180) {
  // ½ zᵀ (2 G) z = ε with G = [[γ, α], [α, β]]
  const G = [
    [2 * tw.gamma, 2 * tw.alpha],
    [2 * tw.alpha, 2 * tw.beta],
  ];
  const { lp, lm, ep, em } = symEig2(G);
  if (!(lm > 0) || !(eps > 0)) return [];
  const u = Math.sqrt((2 * eps) / lp);
  const v = Math.sqrt((2 * eps) / lm);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const cu = u * Math.cos(a);
    const sv = v * Math.sin(a);
    pts.push([cu * ep[0] + sv * em[0], cu * ep[1] + sv * em[1]]);
  }
  return pts;
}

// ------------------------------------------------------------------ Mathieu equation q'' + (A − 2ε cos 2t) q = 0
const G1 = 0.5 - Math.sqrt(3) / 6;
const G2 = 0.5 + Math.sqrt(3) / 6;
const SQ3_12 = Math.sqrt(3) / 12;

/** One 4th-order Magnus (Gauss–Legendre) step of z' = [[0,1],[−k(t),0]] z from t to t+h; exactly in SL(2,R). */
function magnusStep(k, t, h) {
  const k1 = k(t + G1 * h);
  const k2 = k(t + G2 * h);
  // Ω = h/2 (A1 + A2) + (√3 h²/12) [A2, A1],  [A2, A1] = diag(k2 − k1, k1 − k2)
  const d = SQ3_12 * h * h * (k2 - k1);
  return exp2([
    [d, h],
    [(-h * (k1 + k2)) / 2, -d],
  ]);
}
const mul2 = (A, B) => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
];

export const mathieuK = (A, eps) => (t) => A - 2 * eps * Math.cos(2 * t);

/** Monodromy (one drive period π) of the Mathieu equation. */
export function mathieuMonodromy(A, eps, steps = 128) {
  const k = mathieuK(A, eps);
  const h = Math.PI / steps;
  let M = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < steps; i++) M = mul2(magnusStep(k, i * h, h), M);
  return M;
}

/**
 * Trajectory of the Mathieu equation from z0 = (q, q') over `periods` drive periods.
 * Returns { t: [], q: [], p: [], strobe: [[q, p] at t = nπ] }.
 */
export function mathieuTrajectory(A, eps, z0, periods, stepsPerPeriod = 96) {
  const k = mathieuK(A, eps);
  const h = Math.PI / stepsPerPeriod;
  let [q, p] = z0;
  const T = [0];
  const Q = [q];
  const P = [p];
  const strobe = [[q, p]];
  for (let n = 0; n < periods; n++) {
    for (let i = 0; i < stepsPerPeriod; i++) {
      const t = n * Math.PI + i * h;
      const S = magnusStep(k, t, h);
      const q2 = S[0][0] * q + S[0][1] * p;
      p = S[1][0] * q + S[1][1] * p;
      q = q2;
      T.push(t + h);
      Q.push(q);
      P.push(p);
    }
    strobe.push([q, p]);
  }
  return { t: T, q: Q, p: P, strobe };
}

/** Classify a Floquet monodromy: 'stable' | 'unstable+' (tr > 2) | 'unstable−' (tr < −2), growth per period. */
export function floquet(M) {
  const tr = M[0][0] + M[1][1];
  if (Math.abs(tr) < 2) return { tr, kind: 'stable', mu: Math.acos(tr / 2), growth: 0 };
  const a = Math.abs(tr) / 2;
  const lam = a + Math.sqrt(a * a - 1);
  return { tr, kind: tr > 0 ? 'unstable+' : 'unstable-', lambda: tr > 0 ? lam : -lam, growth: Math.log(lam) };
}

// ------------------------------------------------------------------ damping: gl(2,R) = R·1 ⊕ sl(2,R)
/** Damped oscillator q'' + γ q' + ω² q = 0 as z' = X z, z = (q, q'). */
export const dampedGenerator = (gamma, omega2) => [
  [0, 1],
  [-omega2, -gamma],
];
/** Split X = (tr X / 2) 1 + X₀ with X₀ traceless (the Hamiltonian part). */
export function splitTrace(X) {
  const h = (X[0][0] + X[1][1]) / 2;
  return {
    scalar: h,
    X0: [
      [X[0][0] - h, X[0][1]],
      [X[1][0], X[1][1] - h],
    ],
  };
}
/**
 * Classify a linear flow z' = X z by trace τ and determinant D (the trace–determinant plane).
 * Returns { key, label, stable }.
 */
export function traceDetType(tau, det, tol = 1e-9) {
  const disc = tau * tau - 4 * det;
  const s = Math.max(1, Math.abs(tau), Math.abs(det));
  const t0 = Math.abs(tau) <= tol * s;
  if (Math.abs(det) <= tol * s) {
    if (t0) return { key: 'zero', label: 'degenerate (double zero eigenvalue)', stable: null };
    return { key: 'line', label: tau < 0 ? 'line of fixed points (attracting)' : 'line of fixed points (repelling)', stable: null };
  }
  if (det < 0) return { key: 'saddle', label: 'saddle', stable: false };
  if (t0) return { key: 'centre', label: 'centre (Hamiltonian)', stable: true };
  const side = tau < 0 ? 'sink' : 'source';
  if (Math.abs(disc) <= tol * s * s) return { key: 'degenerate-' + side, label: tau < 0 ? 'degenerate node (stable)' : 'degenerate node (unstable)', stable: tau < 0 };
  if (disc < 0) return { key: 'spiral-' + side, label: tau < 0 ? 'stable spiral' : 'unstable spiral', stable: tau < 0 };
  return { key: 'node-' + side, label: tau < 0 ? 'stable node' : 'unstable node', stable: tau < 0 };
}
