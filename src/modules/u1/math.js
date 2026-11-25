// U(1) maths for the #/u1 module. Pure functions, no DOM (tested by tests/u1.test.mjs).
//
// Conventions (site-wide): hbar = 1, Hermitian generators, U(alpha) = exp(-i alpha L).
//   * The group U(1) = { e^{i theta} } is drawn in the complex plane; its Lie algebra u(1) = iR is the
//     tangent line Re z = 1 at the identity z = 1 (the algebra element i theta sits at 1 + i theta).
//   * Real form: z = x + iy <-> (x, y); multiplication by e^{i theta} <-> R(theta) = exp(theta J),
//     J = [[0,-1],[1,0]] (J <-> i, J^2 = -1).  U(1) = SO(2).
//   * Particle on a ring: psi_q(phi) = e^{i q phi}, L = -i d/dphi, L psi_q = q psi_q,
//     U(alpha) = exp(-i alpha L) = exp(-alpha d/dphi):  (U(alpha) psi)(phi) = psi(phi - alpha)  (active rotation)
//     and on an eigenstate U(alpha) psi_q = e^{-i q alpha} psi_q.

export const TAU = 2 * Math.PI;

/** e^{i theta} as [re, im]. */
export const cis = (theta) => [Math.cos(theta), Math.sin(theta)];

/** sin(x)/x, accurate through x = 0. */
export function sinc(x) {
  const a = Math.abs(x);
  if (a < 1e-3) {
    const x2 = x * x;
    return 1 - x2 / 6 + (x2 * x2) / 120;
  }
  return Math.sin(x) / x;
}

/**
 * Point of the "wrapping" curve: the tangent segment from 1 to 1 + i theta bent into a circular arc of
 * curvature s (radius r = 1/s) that stays tangent to the unit circle at z = 1, parametrised by arc length u:
 *     p_s(u) = (1 - r + r cos(u/r), r sin(u/r)),   r = 1/s.
 * s = 0 is the straight algebra segment (1, u); s = 1 is the unit circle (cos u, sin u).
 * Written in a form that is exact as s -> 0:  x = 1 - (u^2 s / 2) sinc^2(u s / 2),  y = u sinc(u s).
 */
export function wrapPoint(s, u) {
  const h = sinc((u * s) / 2);
  return [1 - 0.5 * u * u * s * h * h, u * sinc(u * s)];
}

/** Unit tangent of the wrapping curve at arc length u (the curve has unit speed for every s). */
export const wrapTangent = (s, u) => [-Math.sin(u * s), Math.cos(u * s)];

/** Samples of the wrapping curve for u from 0 to theta (n+1 points). */
export function wrapCurve(s, theta, n = 160) {
  const pts = new Array(n + 1);
  for (let i = 0; i <= n; i++) pts[i] = wrapPoint(s, (theta * i) / n);
  return pts;
}

/** Arc length of a polyline (used to check that wrapping is an isometry). */
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/**
 * Partial sums of the exponential series e^{i theta} = sum_n (i theta)^n / n!.
 * Returns [S_{-1} = 0, S_0, S_1, ..., S_N] as [re, im]; consecutive differences are the terms,
 * each one turned by 90 degrees from the previous (multiplication by i theta / n).
 */
export function seriesPartialSums(theta, N) {
  const pts = [[0, 0]];
  let tr = 1;
  let ti = 0;
  let sr = 0;
  let si = 0;
  for (let n = 0; n <= N; n++) {
    if (n > 0) {
      const f = theta / n;
      const r = -ti * f; // (tr + i ti) * i theta / n
      ti = tr * f;
      tr = r;
    }
    sr += tr;
    si += ti;
    pts.push([sr, si]);
  }
  return pts;
}

/** |e^{i theta} - S_N|. */
export function seriesError(theta, N) {
  const pts = seriesPartialSums(theta, N);
  const [sr, si] = pts[pts.length - 1];
  return Math.hypot(Math.cos(theta) - sr, Math.sin(theta) - si);
}

/** Lagrange remainder bound for the cos and sin Taylor series combined: sqrt(2) |theta|^{N+1}/(N+1)!. */
export function seriesErrorBound(theta, N) {
  let b = Math.SQRT2;
  for (let k = 1; k <= N + 1; k++) b *= Math.abs(theta) / k;
  return b;
}

/** Real 2x2 form of e^{i theta}: R(theta) = exp(theta J). */
export const rot2 = (theta) => [
  [Math.cos(theta), -Math.sin(theta)],
  [Math.sin(theta), Math.cos(theta)],
];
export const J2 = [
  [0, -1],
  [1, 0],
];

/** Principal value of an angle in (-pi, pi] and the winding k with theta = theta0 + 2 pi k. */
export function principal(theta) {
  let k = Math.round(theta / TAU);
  let t0 = theta - k * TAU;
  if (t0 <= -Math.PI) {
    t0 += TAU;
    k -= 1;
  } else if (t0 > Math.PI) {
    t0 -= TAU;
    k += 1;
  }
  return { theta0: t0, k };
}

/** Wrap an angle to (-pi, pi]. */
export const wrapPi = (x) => principal(x).theta0;

// ------------------------------------------------------------------ charge on a ring

/** Phase of the displayed state U(alpha) psi_q at phi in [0, 2 pi):  q (phi - alpha). */
export const ringPhase = (q, phi, alpha) => q * (phi - alpha);

/** psi_q(phi) = e^{i q phi} as [re, im] (defined on phi in [0, 2pi) — the seam sits at phi = 0 = 2 pi). */
export const psi = (q, phi) => cis(q * phi);

/**
 * Single-valuedness: psi(2 pi^-) / psi(0) = e^{2 pi i q}.  Returns the mismatch angle in (-pi, pi]
 * (0 iff q is an integer), the holonomy e^{2 pi i q}, and whether the state is single-valued.
 */
export function seam(q, tol = 1e-9) {
  const mismatch = wrapPi(TAU * q);
  const n = Math.round(q);
  return { mismatch, holonomy: cis(TAU * q), singleValued: Math.abs(q - n) < tol, nearest: n };
}

/** Kinetic energy of a particle on a ring with moment of inertia I (hbar = 1): E_q = q^2 / (2 I). */
export const ringEnergy = (q, I = 1) => (q * q) / (2 * I);

/**
 * Apply L = -i d/dphi numerically (central difference) to a function f(phi) -> [re, im].
 * Used by the tests to check L psi_q = q psi_q.
 */
export function applyL(f, phi, h = 1e-5) {
  const a = f(phi + h);
  const b = f(phi - h);
  const dre = (a[0] - b[0]) / (2 * h);
  const dim = (a[1] - b[1]) / (2 * h);
  // -i (dre + i dim) = dim - i dre
  return [dim, -dre];
}

/** Multiply complex numbers given as [re, im]. */
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

// ------------------------------------------------------------------ drawing helpers (pure)

/**
 * Liang–Barsky clip of the segment a-b to the box [x0,x1] x [y0,y1]. Returns [a', b'] or null.
 * Lets us draw series terms that are astronomically large without handing the canvas huge numbers.
 */
export function clipSegment(a, b, [x0, x1], [y0, y1]) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** Bounding box [[xmin, xmax], [ymin, ymax]] of points (finite ones only). */
export function bbox(points) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return [
    [x0, x1],
    [y0, y1],
  ];
}

/** Smooth ease used by the wrap animation. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Wrap animation timeline (period 9 s): hold straight, wrap, hold wrapped, unwrap.
 * Returns s in [0, 1] for a time t >= 0.
 */
export function wrapTimeline(t) {
  const P = 9;
  const x = ((t % P) + P) % P;
  if (x < 1) return 0;
  if (x < 4) return easeInOut((x - 1) / 3);
  if (x < 6.5) return 1;
  if (x < 8.5) return 1 - easeInOut((x - 6.5) / 2);
  return 0;
}
