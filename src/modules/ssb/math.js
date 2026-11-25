// Spontaneous symmetry breaking — pure maths (no DOM), shared by the three tabs.
//
// Mexican hat (tab a): a complex field φ = x + iy, homogeneous mode treated as a unit-mass particle,
//   L = ½|φ̇|² − V,   V(φ) = λ(|φ|² − v²)² − h Re φ,   φ̈ = −∇V − γ φ̇ (+ thermal noise).
//   h = 0: degenerate circle of vacua |φ| = v. Hessian there: ω_ρ² = 8λv² (radial / Higgs), ω_π² = 0 (Goldstone).
//   h > 0: unique vacuum φ0 = r0 > 0 with 4λ r0 (r0² − v²) = h; ω_π² = h/r0 ≈ h/v, ω_ρ² = 8λ r0² + h/r0.
// O(3) model (tab b): n ∈ R³, V = λ(|n|² − v²)², vacuum manifold S² = SO(3)/SO(2).
// Electroweak (tab c): tree-level m_W = g v/2, m_Z = m_W / cos θ_W, e = g sin θ_W.

export const TAU = 2 * Math.PI;
export const PI = Math.PI;
export const wrapPi = (a) => a - TAU * Math.floor((a + PI) / TAU);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------------ Mexican hat
/** V(x, y) = λ(x² + y² − v²)² − h x */
export function hatV(x, y, P) {
  const s = x * x + y * y - P.v * P.v;
  return P.lam * s * s - P.h * x;
}
/** ∇V */
export function hatGrad(x, y, P) {
  const k = 4 * P.lam * (x * x + y * y - P.v * P.v);
  return [k * x - P.h, k * y];
}
/** Hessian ∂²V */
export function hatHess(x, y, P) {
  const a = 4 * P.lam * (x * x + y * y - P.v * P.v);
  const b = 8 * P.lam;
  return [
    [a + b * x * x, b * x * y],
    [b * x * y, a + b * y * y],
  ];
}

/** Radius of the valley floor along the ray at angle th: outer root of ∂V/∂r = 4λr(r² − v²) − h cos th = 0. */
export function troughR(th, P) {
  const c = P.h * Math.cos(th);
  const v2 = P.v * P.v;
  let r = P.v;
  for (let i = 0; i < 40; i++) {
    const f = 4 * P.lam * r * (r * r - v2) - c;
    const df = 4 * P.lam * (3 * r * r - v2);
    if (!(Math.abs(df) > 1e-12)) break;
    const dr = f / df;
    r -= dr;
    if (Math.abs(dr) < 1e-13) break;
  }
  return Number.isFinite(r) && r > 0 ? r : P.v;
}

/** True vacuum radius r0 (on the +Re φ axis when h > 0; = v when h = 0). */
export const vacuumR = (P) => troughR(0, P);

/**
 * Small-oscillation predictions about the vacuum. Undamped ω0 from the Hessian; damped ω = √(ω0² − γ²/4).
 * Returns { r0, wr0, wt0, wr, wt } (wt = 0 for the exact Goldstone).
 */
export function predictions(P, gamma = 0) {
  const r0 = vacuumR(P);
  const wt2 = P.h > 0 ? P.h / r0 : 0; // = 4λ(r0² − v²)
  const wr2 = 8 * P.lam * r0 * r0 + wt2;
  const damp = (w2) => Math.sqrt(Math.max(0, w2 - (gamma * gamma) / 4));
  return { r0, wr0: Math.sqrt(wr2), wt0: Math.sqrt(wt2), wr: damp(wr2), wt: wt2 > 0 ? damp(wt2) : 0 };
}

/** One RK4 step of φ̈ = −∇V − γφ̇ for the state s = [x, y, vx, vy] (returns a new array). */
export function hatStep(s, dt, P, gamma) {
  const f = (x, y, vx, vy) => {
    const g = hatGrad(x, y, P);
    return [vx, vy, -g[0] - gamma * vx, -g[1] - gamma * vy];
  };
  const k1 = f(s[0], s[1], s[2], s[3]);
  const k2 = f(s[0] + (dt / 2) * k1[0], s[1] + (dt / 2) * k1[1], s[2] + (dt / 2) * k1[2], s[3] + (dt / 2) * k1[3]);
  const k3 = f(s[0] + (dt / 2) * k2[0], s[1] + (dt / 2) * k2[1], s[2] + (dt / 2) * k2[2], s[3] + (dt / 2) * k2[3]);
  const k4 = f(s[0] + dt * k3[0], s[1] + dt * k3[1], s[2] + dt * k3[2], s[3] + dt * k3[3]);
  return s.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Total mechanical energy above the true vacuum. */
export function hatEnergy(s, P) {
  const r0 = vacuumR(P);
  return 0.5 * (s[2] * s[2] + s[3] * s[3]) + hatV(s[0], s[1], P) - hatV(r0, 0, P);
}

/** Standard normal deviate (Box–Muller). */
export function gauss(rng = Math.random) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
}

/**
 * Frequency meter from successive extrema of a sampled signal (parabolic interpolation of each extremum).
 * For x = A e^{−γt/2} cos(ω t + φ) consecutive extrema are exactly π/ω apart, so ω = π / ⟨Δt⟩.
 */
export class ExtremaMeter {
  constructor({ minAmp = 1e-3, keep = 7 } = {}) {
    this.minAmp = minAmp;
    this.keep = keep;
    this.reset();
  }
  reset() {
    this.buf = [];
    this.ext = [];
  }
  push(t, x) {
    if (!Number.isFinite(x)) return;
    const b = this.buf;
    if (b.length && t <= b[b.length - 1][0]) return;
    b.push([t, x]);
    if (b.length > 3) b.shift();
    if (b.length < 3) return;
    const [[t0, x0], [t1, x1], [t2, x2]] = b;
    const d1 = x1 - x0;
    const d2 = x2 - x1;
    const type = d1 > 0 && d2 <= 0 ? 1 : d1 < 0 && d2 >= 0 ? -1 : 0;
    if (!type) return;
    // vertex of the parabola through the three samples
    let tv = t1;
    let xv = x1;
    const den = (t0 - t1) * (t0 - t2) * (t1 - t2);
    if (Math.abs(den) > 1e-18) {
      const A = (t2 * (x1 - x0) + t1 * (x0 - x2) + t0 * (x2 - x1)) / den;
      const B = (t2 * t2 * (x0 - x1) + t1 * t1 * (x2 - x0) + t0 * t0 * (x1 - x2)) / den;
      if (Math.abs(A) > 1e-18) {
        const tc = -B / (2 * A);
        if (tc > t0 && tc < t2) {
          tv = tc;
          const C = x1 - A * t1 * t1 - B * t1;
          xv = A * tc * tc + B * tc + C;
        }
      }
    }
    const e = this.ext;
    const last = e[e.length - 1];
    if (last && last.type === type) {
      if (type * (xv - last.x) > 0) e[e.length - 1] = { t: tv, x: xv, type };
      return;
    }
    if (last && Math.abs(xv - last.x) < this.minAmp) {
      e.pop(); // a tiny wiggle: discard the pair
      return;
    }
    e.push({ t: tv, x: xv, type });
    if (e.length > this.keep) e.shift();
  }
  /** ω from the stored extrema, or NaN if there are too few or the last one is stale. */
  omega(now) {
    const e = this.ext;
    if (e.length < 3) return NaN;
    const half = (e[e.length - 1].t - e[0].t) / (e.length - 1);
    if (!(half > 0)) return NaN;
    if (now - e[e.length - 1].t > Math.max(2.5, 2.2 * half)) return NaN;
    return PI / half;
  }
  /** Peak-to-peak amplitude/2 of the last swing (NaN if unknown). */
  amplitude() {
    const e = this.ext;
    if (e.length < 2) return NaN;
    return Math.abs(e[e.length - 1].x - e[e.length - 2].x) / 2;
  }
}

// ------------------------------------------------------------------ O(3) → O(2)
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize(a) {
    const n = Math.hypot(a[0], a[1], a[2]);
    return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 1];
  },
  combo: (a, sa, b, sb) => [a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, a[2] * sa + b[2] * sb],
};

/** Orthonormal tangent frame at the unit vector n: (e_θ, e_φ) with e_θ × e_φ = n (spherical-coordinate frame). */
export function tangentFrame(n) {
  const u = v3.normalize(n);
  const th = Math.acos(clamp(u[2], -1, 1));
  const ph = Math.hypot(u[0], u[1]) > 1e-9 ? Math.atan2(u[1], u[0]) : 0;
  const eth = [Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph), -Math.sin(th)];
  const eph = [-Math.sin(ph), Math.cos(ph), 0];
  return [eth, eph];
}

/** Real generators X_a = −iJ_a act on vectors as X_a n = ê_a × n (active right-handed rotation). */
export const genAction = (n) => [v3.cross([1, 0, 0], n), v3.cross([0, 1, 0], n), v3.cross([0, 0, 1], n)];

/** Rodrigues: rotate p about the unit axis a by angle t. */
export function rotate(p, a, t) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const axp = v3.cross(a, p);
  const adp = v3.dot(a, p);
  return [p[0] * c + axp[0] * s + a[0] * adp * (1 - c), p[1] * c + axp[1] * s + a[1] * adp * (1 - c), p[2] * c + axp[2] * s + a[2] * adp * (1 - c)];
}

/** Point reached from the unit vector n by moving an angle b along the unit tangent e (great circle). */
export const alongGreatCircle = (n, e, b) => v3.combo(n, Math.cos(b), e, Math.sin(b));

/** Numerical rank of a 3×3 matrix (columns given), via the Gram matrix eigen-free test. */
export function rank3(cols, tol = 1e-9) {
  const [a, b, c] = cols;
  const det = v3.dot(a, v3.cross(b, c));
  if (Math.abs(det) > tol) return 3;
  const cr = [v3.cross(a, b), v3.cross(b, c), v3.cross(a, c)].map(v3.norm);
  if (Math.max(...cr) > tol) return 2;
  return Math.max(v3.norm(a), v3.norm(b), v3.norm(c)) > tol ? 1 : 0;
}

/** Hessian of λ(|n|² − v²)² at n: 8λ n nᵀ + 4λ(|n|² − v²) 1. */
export function o3Hessian(n, lam, v) {
  const a = 4 * lam * (v3.dot(n, n) - v * v);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => 8 * lam * n[i] * n[j] + (i === j ? a : 0)));
}

// ------------------------------------------------------------------ electroweak (tree level)
export const EW = {
  v: 246.22, // GeV, Higgs vev (G_F)
  mWexp: 80.37, // GeV
  mZexp: 91.19, // GeV
  mH: 125.1, // GeV
  sin2: 0.2312, // MS-bar sin²θ_W(m_Z)
};
export const EW_g = (2 * EW.mWexp) / EW.v; // SU(2)_L coupling fixed by m_W = g v / 2

/** Tree-level electroweak spectrum for Weinberg angle th at fixed g. */
export function electroweak(th, g = EW_g, v = EW.v) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const gp = g * Math.tan(th);
  const e = g * s;
  const mW = (g * v) / 2;
  const mZ = c > 1e-9 ? mW / c : Infinity;
  return { g, gp, e, alpha: (e * e) / (4 * PI), mW, mZ, mA: 0, rho: c > 1e-9 ? (mW * mW) / (mZ * mZ * c * c) : 1, c, s };
}

// ------------------------------------------------------------------ dispersion relations (tab b)
export const disp = {
  higgs: (k, m) => Math.sqrt(m * m + k * k),
  typeA: (k, c = 1) => c * Math.abs(k),
  typeB: (k, D = 0.5) => D * k * k,
};
