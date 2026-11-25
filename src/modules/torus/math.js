// T^2 = U(1) x U(1) maths for the #/torus module. Pure functions, no DOM (tested by tests/torus.test.mjs).
//
// Two uncoupled oscillators in action–angle variables: the angles evolve linearly,
//     theta_1(t) = omega_1 t,   theta_2(t) = phi + omega_2 t      (mod 2 pi),
// i.e. the orbit of the one-parameter subgroup t -> (e^{i omega_1 t}, e^{i omega_2 t}) through (1, e^{i phi}).
// Lie algebra t^2 = R^2, exp(a, b) = (e^{ia}, e^{ib}), kernel 2 pi Z^2.
// The orbit closes iff omega_1/omega_2 = p/q is rational (winding numbers (p, q), period T = 2 pi p/omega_1);
// otherwise it is dense (Kronecker) and equidistributed (Weyl).

export const TAU = 2 * Math.PI;

export const mod = (x, m) => ((x % m) + m) % m;
/** Wrap to (-pi, pi]. */
export function wrapPi(x) {
  let y = mod(x + Math.PI, TAU) - Math.PI;
  if (y <= -Math.PI) y += TAU;
  return y;
}

/** Embedding of the torus in R^3 (z-up): theta_1 runs round the z-axis, theta_2 round the tube. */
export function torusPoint(R, r, t1, t2) {
  const c = R + r * Math.cos(t2);
  return [c * Math.cos(t1), c * Math.sin(t1), r * Math.sin(t2)];
}
/** Tangent vectors dP/dtheta_1, dP/dtheta_2 of the embedding. */
export function torusTangents(R, r, t1, t2) {
  const c = R + r * Math.cos(t2);
  return [
    [-c * Math.sin(t1), c * Math.cos(t1), 0],
    [-r * Math.sin(t2) * Math.cos(t1), -r * Math.sin(t2) * Math.sin(t1), r * Math.cos(t2)],
  ];
}

/** Distance on the flat square torus R^2 / 2 pi Z^2 between angle pairs. */
export const torusDist = (a, b) => Math.hypot(wrapPi(a[0] - b[0]), wrapPi(a[1] - b[1]));

/** Lissajous projection of the torus point to configuration space (unit amplitudes). */
export const lissajous = (t1, t2) => [Math.cos(t1), Math.cos(t2)];

// ------------------------------------------------------------------ continued fractions

/**
 * Partial quotients [a0; a1, a2, ...] of x >= 0. Stops when the convergent reproduces x to `tol`
 * (relative), after maxTerms terms, or when the denominators exceed maxDen (floating-point noise).
 */
export function continuedFraction(x, maxTerms = 14, tol = 1e-12, maxDen = 1e9) {
  if (!Number.isFinite(x) || x < 0) return [];
  const out = [];
  let y = x;
  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(y + 1e-12 * Math.max(1, y));
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    out.push(a);
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    if (Math.abs(x - h1 / k1) <= tol * Math.max(1, x)) break;
    const f = y - a;
    if (f <= 1e-15) break;
    y = 1 / f;
  }
  return out;
}

/** Convergents p_k/q_k of a continued fraction: [{p, q}]. */
export function convergents(cf) {
  const res = [];
  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  for (const a of cf) {
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    res.push({ p: h2, q: k2 });
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
  }
  return res;
}

export function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Frequency ratio analysis for omega_1, omega_2 > 0.
 *  alpha = omega_1/omega_2 (winding ratio: theta_1 turns per theta_2 turn), its continued fraction and convergents,
 *  and, if alpha = p/q exactly (q <= maxDen, to relative tolerance tol), the winding numbers (p, q) and period
 *  T = 2 pi q / omega_2 = 2 pi p / omega_1.
 */
export function ratioInfo(w1, w2, maxDen = 1000, tol = 1e-9) {
  if (!(w1 >= 0) || !(w2 >= 0) || (w1 === 0 && w2 === 0)) return { alpha: NaN, cf: [], conv: [], rational: null };
  if (w2 === 0) return { alpha: Infinity, cf: [], conv: [], rational: { p: 1, q: 0, T: TAU / w1 } };
  const alpha = w1 / w2;
  const cf = continuedFraction(alpha);
  const conv = convergents(cf);
  let rational = null;
  for (const c of conv) {
    if (c.q > maxDen) break;
    if (Math.abs(alpha - c.p / c.q) <= tol * Math.max(1, alpha)) {
      const g = gcd(c.p, c.q) || 1;
      const p = c.p / g;
      const q = c.q / g;
      rational = { p, q, T: (TAU * q) / w2 };
      break;
    }
  }
  return { alpha, cf, conv, rational };
}

// ------------------------------------------------------------------ grid traversal (exact)

/**
 * Visit every cell of the square grid of spacing h crossed by the straight path x(t) = x0 + vx t, y(t) = y0 + vy t
 * for t in [0, T] (Amanatides–Woo). visit(i, j, tEnter, tExit) receives integer cell indices (unwrapped) and the
 * time interval spent in the cell; zero-length touches are skipped. Exact corner crossings step diagonally.
 */
export function traverse(x0, y0, vx, vy, h, T, visit) {
  if (!(T > 0) || !(h > 0)) return;
  let i = Math.floor(x0 / h);
  let j = Math.floor(y0 / h);
  const sx = vx > 0 ? 1 : vx < 0 ? -1 : 0;
  const sy = vy > 0 ? 1 : vy < 0 ? -1 : 0;
  const dX = sx ? h / Math.abs(vx) : Infinity;
  const dY = sy ? h / Math.abs(vy) : Infinity;
  let tX = sx > 0 ? ((i + 1) * h - x0) / vx : sx < 0 ? (i * h - x0) / vx : Infinity;
  let tY = sy > 0 ? ((j + 1) * h - y0) / vy : sy < 0 ? (j * h - y0) / vy : Infinity;
  let t = 0;
  let guard = 0;
  while (guard++ < 5e7) {
    const tn = Math.min(tX, tY, T);
    if (tn > t) visit(i, j, t, tn);
    if (tn >= T) break;
    if (tX < tY) {
      i += sx;
      t = tX;
      tX += dX;
    } else if (tY < tX) {
      j += sy;
      t = tY;
      tY += dY;
    } else {
      i += sx;
      j += sy;
      t = tX;
      tX += dX;
      tY += dY;
    }
  }
}

/** Coverage of an N x N grid on [0, 2pi)^2 by the orbit (cells visited at least once). */
export class Coverage {
  constructor(N = 60) {
    this.N = N;
    this.h = TAU / N;
    this.cells = new Uint8Array(N * N);
    this.count = 0;
    this.version = 0;
  }
  reset() {
    this.cells.fill(0);
    this.count = 0;
    this.version++;
  }
  get fraction() {
    return this.count / (this.N * this.N);
  }
  /** Add the orbit piece from absolute angles (x0, y0) moving with (w1, w2) for a time dt. */
  add(x0, y0, w1, w2, dt) {
    const N = this.N;
    const cells = this.cells;
    let added = 0;
    traverse(x0, y0, w1, w2, this.h, dt, (i, j) => {
      const k = mod(j, N) * N + mod(i, N);
      if (!cells[k]) {
        cells[k] = 1;
        added++;
      }
    });
    if (added) {
      this.count += added;
      this.version++;
    }
    return added;
  }
}

/**
 * The orbit on the flat torus [0, 2pi)^2 between times ta and tb as straight segments (one per fundamental domain
 * crossed): [{a:[x,y], b:[x,y], ta, tb}] with endpoints on the square's edges where the orbit wraps.
 */
export function flatSegments(t1at0, t2at0, w1, w2, ta, tb) {
  const out = [];
  if (!(tb > ta)) return out;
  const x0 = t1at0 + w1 * ta;
  const y0 = t2at0 + w2 * ta;
  traverse(x0, y0, w1, w2, TAU, tb - ta, (i, j, s0, s1) => {
    const ox = i * TAU;
    const oy = j * TAU;
    out.push({
      a: [x0 + w1 * s0 - ox, y0 + w2 * s0 - oy],
      b: [x0 + w1 * s1 - ox, y0 + w2 * s1 - oy],
      ta: ta + s0,
      tb: ta + s1,
    });
  });
  return out;
}

// ------------------------------------------------------------------ returns to the start

/** Distance from point P to the segment from A to B (2D). */
export function pointSegmentDist(P, A, B) {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const L2 = dx * dx + dy * dy;
  let u = L2 > 0 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return { d: Math.hypot(A[0] + u * dx - P[0], A[1] + u * dy - P[1]), u };
}

/**
 * Closest return of the orbit to its starting point: d(tau) = dist(tau * omega, 2 pi Z^2) minimised over
 * tau in [tauMin, t], with tauMin = pi/|omega| (the orbit has to leave the start first: on the square torus of
 * side 2 pi, d(tau) = |omega| tau for |omega| tau <= pi). Incremental: call update(t) with increasing t.
 * Records lists the successive record holders {m, n, d, tau}: the lattice point 2 pi (m, n) approached, i.e. the
 * orbit has made m turns in theta_1 and n turns in theta_2. These are the convergents of omega_1/omega_2.
 */
export class ReturnTracker {
  constructor(w1, w2) {
    this.w1 = w1;
    this.w2 = w2;
    this.speed = Math.hypot(w1, w2);
    this.tauMin = this.speed > 0 ? Math.PI / this.speed : Infinity;
    this.best = null; // {m, n, d, tau}
    this.records = [];
    this.kDone = null;
    this.t = 0;
  }
  update(t) {
    const { w1, w2 } = this;
    if (!(this.speed > 0) || !(t > this.tauMin)) {
      this.t = t;
      return this.best;
    }
    const major = Math.abs(w1) >= Math.abs(w2) ? 0 : 1;
    const wM = major === 0 ? w1 : w2;
    const wm = major === 0 ? w2 : w1;
    const A = [w1 * this.tauMin, w2 * this.tauMin];
    const B = [w1 * t, w2 * t];
    const cA = (major === 0 ? A[0] : A[1]) / TAU;
    const cB = (major === 0 ? B[0] : B[1]) / TAU;
    let kLo = Math.floor(Math.min(cA, cB)) - 1;
    const kHi = Math.ceil(Math.max(cA, cB)) + 1;
    if (this.kDone !== null) kLo = Math.max(kLo, this.kDone - 2);
    for (let k = kLo; k <= kHi; k++) {
      const c = (k * wm) / wM; // minor coordinate (in turns) where the line crosses major = k turns
      const n0 = Math.floor(c);
      for (let n = n0 - 1; n <= n0 + 2; n++) {
        if (k === 0 && n === 0) continue; // the start itself
        const P = major === 0 ? [k * TAU, n * TAU] : [n * TAU, k * TAU];
        const { d, u } = pointSegmentDist(P, A, B);
        if (!this.best || d < this.best.d - 1e-15) {
          const tau = this.tauMin + u * (t - this.tauMin);
          const m = major === 0 ? k : n;
          const nn = major === 0 ? n : k;
          if (!this.best || this.best.m !== m || this.best.n !== nn) this.records.push({ m, n: nn, d, tau });
          else Object.assign(this.records[this.records.length - 1], { d, tau });
          this.best = { m, n: nn, d, tau };
        }
      }
    }
    this.kDone = Math.floor(Math.max(cA, cB));
    this.t = t;
    return this.best;
  }
}

// ------------------------------------------------------------------ quantum spectrum

/** E(n1, n2) = omega_1 (n1 + 1/2) + omega_2 (n2 + 1/2)  (hbar = 1). */
export const energy = (w1, w2, n1, n2) => w1 * (n1 + 0.5) + w2 * (n2 + 0.5);

/** Number of (n1, n2) >= 0 with p n1 + q n2 = K (degeneracy of a level when omega_1 : omega_2 = p : q). */
export function degeneracy(p, q, K) {
  let c = 0;
  for (let n1 = 0; p * n1 <= K; n1++) if ((K - p * n1) % q === 0) c++;
  return c;
}

/** Levels below Emax as [{E, states: [[n1, n2], ...]}], grouping exact (to tol) degeneracies. */
export function spectrum(w1, w2, Emax, tol = 1e-9) {
  const list = [];
  for (let n1 = 0; energy(w1, w2, n1, 0) <= Emax + tol; n1++)
    for (let n2 = 0; energy(w1, w2, n1, n2) <= Emax + tol; n2++) list.push({ E: energy(w1, w2, n1, n2), n: [n1, n2] });
  list.sort((a, b) => a.E - b.E);
  const levels = [];
  for (const s of list) {
    const last = levels[levels.length - 1];
    if (last && Math.abs(last.E - s.E) <= tol * Math.max(1, s.E)) last.states.push(s.n);
    else levels.push({ E: s.E, states: [s.n] });
  }
  return levels;
}

// ------------------------------------------------------------------ torus knots

/** Crossing number of the (p, q) torus knot (p, q coprime); 0 for the unknot. */
export function torusKnotCrossings(p, q) {
  p = Math.abs(p);
  q = Math.abs(q);
  if (Math.min(p, q) <= 1) return 0;
  return Math.min(p * (q - 1), q * (p - 1));
}

/** Human name of the closed orbit with winding numbers (p, q). */
export function torusKnotName(p, q) {
  const c = torusKnotCrossings(p, q);
  if (c === 0) return 'unknot';
  const a = Math.min(p, q);
  const b = Math.max(p, q);
  if (a === 2 && b === 3) return 'trefoil';
  if (a === 2 && b === 5) return 'cinquefoil';
  return `torus knot, ${c} crossings`;
}

// ------------------------------------------------------------------ small helpers

/** Log-scale slider mapping: u in [0,1] -> value in [lo, hi] and back. */
export const logMap = (u, lo, hi) => lo * Math.pow(hi / lo, u);
export const logInv = (v, lo, hi) => Math.log(v / lo) / Math.log(hi / lo);
