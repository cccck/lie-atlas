// Kepler problem, Laplace–Runge–Lenz vector, hidden SO(4), Fock's projection and hydrogen shells.
// DOM-free (checked by tests/kepler.test.mjs).
//
// Units & conventions: mass m = 1, force constant k = GM (default 1); planar motion in the xy-plane,
// z out of the screen, L = L_z = x v_y − y v_x (L > 0: counter-clockwise).
//   A = p × L − k r̂          (points from the focus to the perihelion, |A| = k e)
//   A' = A / sqrt(2|E|)       (hidden-symmetry generator; {A'_i, A'_j} = ε_ijk L_k for E < 0)
// Hydrogen in atomic units: E_n = −1/(2n²) Hartree.

export const TAU = 2 * Math.PI;
export const HARTREE_EV = 27.211386245988;

const wrapPi = (x) => x - TAU * Math.floor((x + Math.PI) / TAU);

// ------------------------------------------------------------------ potentials
/**
 * A potential V = −k/r + perturbation.  kind:
 *   'kepler'  V = −k/r
 *   'gr'      V = −k/r − δ/r³                 (the 1/r³ term of GR's effective potential; δ = kL²/c²)
 *   'power'   V = −k r^{−(1+δ)}/(1+δ)         (force −k/r^{2+δ}: Bertrand's theorem at work)
 *   'field'   V = −k/r − ε y                  (uniform force ε ŷ: a non-central, classical Stark field)
 * Returns { kind, k, strength, central, V(x,y), acc(x,y,out), dU(r) | null }.
 */
export function makeModel(kind = 'kepler', strength = 0, k = 1) {
  const d = Number.isFinite(strength) ? strength : 0;
  if (kind === 'gr')
    return {
      kind,
      k,
      strength: d,
      central: true,
      V(x, y) {
        const r = Math.sqrt(x * x + y * y);
        return -k / r - d / (r * r * r);
      },
      acc(x, y, out) {
        const r2 = x * x + y * y;
        const r = Math.sqrt(r2);
        const f = -(k / r2 + (3 * d) / (r2 * r2)) / r;
        out[0] = f * x;
        out[1] = f * y;
      },
      dU: (r) => -d / (r * r * r),
    };
  if (kind === 'power') {
    const q = 1 + d;
    return {
      kind,
      k,
      strength: d,
      central: true,
      V(x, y) {
        const r = Math.sqrt(x * x + y * y);
        return (-k * Math.pow(r, -q)) / q;
      },
      acc(x, y, out) {
        const r = Math.sqrt(x * x + y * y);
        const f = -k * Math.pow(r, -q - 2);
        out[0] = f * x;
        out[1] = f * y;
      },
      dU: (r) => (-k * Math.pow(r, -q)) / q + k / r,
    };
  }
  if (kind === 'field')
    return {
      kind,
      k,
      strength: d,
      central: false,
      field: [0, d],
      V(x, y) {
        return -k / Math.sqrt(x * x + y * y) - d * y;
      },
      acc(x, y, out) {
        const r2 = x * x + y * y;
        const f = -k / (r2 * Math.sqrt(r2));
        out[0] = f * x;
        out[1] = f * y + d;
      },
      dU: null,
    };
  return {
    kind: 'kepler',
    k,
    strength: 0,
    central: true,
    V(x, y) {
      return -k / Math.sqrt(x * x + y * y);
    },
    acc(x, y, out) {
      const r2 = x * x + y * y;
      const f = -k / (r2 * Math.sqrt(r2));
      out[0] = f * x;
      out[1] = f * y;
    },
    dU: () => 0,
  };
}

// ------------------------------------------------------------------ conserved quantities (state s = [x, y, vx, vy, …])
export const angMom = (s) => s[0] * s[3] - s[1] * s[2];
export const energy = (model, s) => 0.5 * (s[2] * s[2] + s[3] * s[3]) + model.V(s[0], s[1]);
export const keplerEnergy = (s, k = 1) => 0.5 * (s[2] * s[2] + s[3] * s[3]) - k / Math.hypot(s[0], s[1]);

/** Laplace–Runge–Lenz vector A = p × L − k r̂ (planar, m = 1). */
export function lrl(s, k = 1) {
  const L = angMom(s);
  const r = Math.hypot(s[0], s[1]) || 1e-300;
  return [s[3] * L - (k * s[0]) / r, -s[2] * L - (k * s[1]) / r];
}

/** Osculating Kepler elements from a state: { E, L, A, e, a, omega (perihelion angle), C = sqrt(k a) }. */
export function elements(s, k = 1) {
  const E = keplerEnergy(s, k);
  const L = angMom(s);
  const A = lrl(s, k);
  const e = Math.hypot(A[0], A[1]) / k;
  const a = E < 0 ? -k / (2 * E) : Infinity;
  return { E, L, A, e, a, omega: Math.atan2(A[1], A[0]), C: E < 0 ? Math.sqrt(k * a) : NaN };
}

/** Hodograph circle of the osculating orbit: centre (ẑ × A)/L, radius k/|L|. Null when L ≈ 0. */
export function hodograph(s, k = 1) {
  const L = angMom(s);
  if (!(Math.abs(L) > 1e-9)) return null;
  const A = lrl(s, k);
  return { c: [-A[1] / L, A[0] / L], R: k / Math.abs(L) };
}

// ------------------------------------------------------------------ integrator
/**
 * Planar orbit integrator: classical RK4 in a Sundman time s with dt/ds = r^{3/2}.
 * Fixed steps in s are adaptive in t (small near the focus), so near-collision orbits (L → 0, e.g.
 * in a Stark field) stay accurate. State: [x, y, vx, vy, t].
 * Events: perihelion passages (radial velocity − → +) with the unwrapped polar angle, used to measure
 * the precession; 'gr' plunges (captured = true); exact collisions are regularised by a bounce.
 */
export class OrbitSim {
  constructor(model, init, opts = {}) {
    this.ds = opts.ds ?? 0.004;
    this.s = new Float64Array(5);
    this._k = [new Float64Array(5), new Float64Array(5), new Float64Array(5), new Float64Array(5)];
    this._tmp = new Float64Array(5);
    this._acc = new Float64Array(2);
    this.model = model;
    this.reset(init);
  }

  setModel(model) {
    this.model = model;
    this._capture();
  }

  reset(init) {
    const s = this.s;
    s[0] = init[0];
    s[1] = init[1];
    s[2] = init[2];
    s[3] = init[3];
    s[4] = 0;
    this.phi = Math.atan2(s[1], s[0]);
    this._phiRaw = this.phi;
    this.rdot = s[0] * s[2] + s[1] * s[3];
    this.perihelia = []; // { t, phi (unwrapped polar angle at perihelion), L }
    this.captured = false;
    this.bounces = 0;
    this.steps = 0;
    this._capture();
  }

  // radius below which a 'gr' orbit has passed the centrifugal barrier and plunges
  _capture() {
    const m = this.model;
    this.rCap = 0;
    if (m.kind !== 'gr' || !(m.strength > 0)) return;
    const L = angMom(this.s);
    const L4 = L * L * L * L;
    const disc = L4 - 12 * m.k * m.strength;
    if (disc > 0) this.rCap = Math.max(0.85 * ((L * L - Math.sqrt(disc)) / (2 * m.k)), 1e-6);
    else this.rCap = 0.5 * Math.sqrt((3 * m.strength) / m.k);
  }

  _deriv(y, out) {
    const x = y[0];
    const yy = y[1];
    const r = Math.sqrt(x * x + yy * yy);
    const g = r * Math.sqrt(r);
    this.model.acc(x, yy, this._acc);
    out[0] = g * y[2];
    out[1] = g * y[3];
    out[2] = g * this._acc[0];
    out[3] = g * this._acc[1];
    out[4] = g;
  }

  /** One RK4 step of size ds in Sundman time. */
  step() {
    const s = this.s;
    const [k1, k2, k3, k4] = this._k;
    const tmp = this._tmp;
    const h = this.ds;
    const tPrev = s[4];
    const xPrev = s[0];
    const yPrev = s[1];
    this._deriv(s, k1);
    for (let i = 0; i < 5; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
    this._deriv(tmp, k2);
    for (let i = 0; i < 5; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
    this._deriv(tmp, k3);
    for (let i = 0; i < 5; i++) tmp[i] = s[i] + h * k3[i];
    this._deriv(tmp, k4);
    for (let i = 0; i < 5; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    this.steps++;
    const raw = Math.atan2(s[1], s[0]);
    const phiPrev = this.phi;
    this.phi += wrapPi(raw - this._phiRaw);
    this._phiRaw = raw;
    const r = Math.hypot(s[0], s[1]);
    const rdot = s[0] * s[2] + s[1] * s[3];
    if (this.rCap > 0 && r < this.rCap) {
      this.captured = true;
      return;
    }
    if (r < 1e-7 && rdot < 0) {
      // exact collision orbit: the regularised flow bounces straight back
      s[2] = -s[2];
      s[3] = -s[3];
      this.bounces++;
    }
    if (this.rdot < 0 && rdot >= 0) {
      const f = this.rdot / (this.rdot - rdot || 1);
      this.perihelia.push({
        t: tPrev + f * (s[4] - tPrev),
        phi: phiPrev + f * (this.phi - phiPrev),
        x: xPrev + f * (s[0] - xPrev),
        y: yPrev + f * (s[1] - yPrev),
        L: angMom(s),
      });
      if (this.perihelia.length > 64) this.perihelia.shift();
    }
    this.rdot = s[0] * s[2] + s[1] * s[3];
  }

  /** Advance physical time by dt (stops early after maxSteps or a capture). Returns the number of steps. */
  advance(dt, maxSteps = 8000) {
    const t1 = this.s[4] + dt;
    let n = 0;
    while (this.s[4] < t1 && n < maxSteps && !this.captured) {
      this.step();
      n++;
    }
    return n;
  }

  /** Precession per radial period (rad, prograde positive) from the last two perihelia, or NaN. */
  precession() {
    const P = this.perihelia;
    if (P.length < 2) return NaN;
    const a = P[P.length - 2];
    const b = P[P.length - 1];
    const sg = Math.sign(b.L) || 1;
    return sg * (b.phi - a.phi) - TAU;
  }
}

/**
 * First-order perihelion advance per radial period caused by a small central perturbation δU(r)
 * (Landau–Lifshitz §15, m = 1):   Δϖ = ∂/∂L [ (2/L) ∫₀^π r(φ)² δU(r(φ)) dφ ],  r = p/(1 + e cos φ),
 * evaluated on the Kepler orbit with energy E and |L| (derivative at fixed E). Prograde positive.
 */
export function precessionFirstOrder(dU, E, L, k = 1, n = 800) {
  const Labs = Math.abs(L);
  if (!dU || !(E < 0) || !(Labs > 0)) return NaN;
  const f = (Lv) => {
    const p = (Lv * Lv) / k;
    const e = Math.sqrt(Math.max(0, 1 + (2 * E * Lv * Lv) / (k * k)));
    if (e >= 0.999) return NaN;
    const h = Math.PI / n;
    let I = 0;
    for (let i = 0; i <= n; i++) {
      const ph = i * h;
      const r = p / (1 + e * Math.cos(ph));
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      I += w * r * r * dU(r);
    }
    return ((2 / Lv) * I * h) / 3;
  };
  const dL = 1e-4 * Labs;
  return (f(Labs + dL) - f(Labs - dL)) / (2 * dL);
}

/** Near-circular apsidal advance for the force law F = −k/r^{2+δ}: 2π(1/√(1−δ) − 1) per radial period. */
export const powerLawCircularPrecession = (d) => TAU * (1 / Math.sqrt(1 - d) - 1);

/**
 * Secular (orbit-averaged) Stark dynamics for a weak uniform force F (m = 1): ⟨r⟩ = −(3a/2k) A, so
 * dL/dt = (3a/2k)(F × A)_z and dA/dt = (3a/2k)·2|E|·(F × L ẑ). The pair (L, A'_⊥) rotates at
 * ω_S = (3/2)|F| sqrt(a/k). Returns { dLdt, dAdt, omegaS }.
 */
export function starkSecular(F, L, A, E, k = 1) {
  const a = -k / (2 * E);
  const c = (3 * a) / (2 * k);
  return {
    dLdt: c * (F[0] * A[1] - F[1] * A[0]),
    dAdt: [c * 2 * -E * F[1] * L, c * 2 * -E * -F[0] * L],
    omegaS: 1.5 * Math.hypot(F[0], F[1]) * Math.sqrt(a / k),
  };
}

// ------------------------------------------------------------------ Kepler orbits of fixed energy (hidden SO(4) tab)
/** Solve Kepler's equation E − e sin E = M for E ∈ [0, 2π) (safeguarded Newton; any e ∈ [0, 1]). */
export function solveKepler(M, e) {
  let m = M - TAU * Math.floor(M / TAU);
  if (e <= 0) return m;
  let lo = 0;
  let hi = TAU;
  let E = m + 0.85 * e * Math.sign(Math.sin(m) || 1);
  if (!(E > lo && E < hi)) E = m;
  for (let i = 0; i < 80; i++) {
    const f = E - e * Math.sin(E) - m;
    if (Math.abs(f) < 1e-14) break;
    if (f > 0) hi = E;
    else lo = E;
    const fp = 1 - e * Math.cos(E);
    let En = fp > 1e-12 ? E - f / fp : NaN;
    if (!(En > lo && En < hi)) En = 0.5 * (lo + hi);
    if (Math.abs(En - E) < 1e-15) {
      E = En;
      break;
    }
    E = En;
  }
  return E;
}

/**
 * The orbit with energy E = −k/(2a), hidden angle χ ∈ [0, π] and perihelion direction ω:
 *   e = sin χ,  L = C cos χ,  A' = C sin χ (cos ω, sin ω),  C = sqrt(k a).
 * At eccentric anomaly Ecc returns position r, velocity v and the Fock point ξ ∈ S² of the momentum:
 *   ξ = R_z(ω) (−sin Ecc, cos χ cos Ecc, sin χ cos Ecc)  — a great circle traversed uniformly in Ecc,
 *   regular even for the collision orbit χ = π/2.
 */
export function orbitPoint(a, chi, omega, Ecc, k = 1) {
  const e = Math.abs(Math.sin(chi));
  const cc = Math.cos(chi);
  const ce = Math.cos(Ecc);
  const se = Math.sin(Ecc);
  const x = a * (ce - e);
  const y = a * cc * se;
  const n = Math.sqrt(k / (a * a * a));
  const den = Math.max(1 - e * ce, 1e-12);
  const vx = (-a * n * se) / den;
  const vy = (a * n * cc * ce) / den;
  const co = Math.cos(omega);
  const so = Math.sin(omega);
  const fx = -se;
  const fy = cc * ce;
  return {
    r: [co * x - so * y, so * x + co * y],
    v: [co * vx - so * vy, so * vx + co * vy],
    fock: [co * fx - so * fy, so * fx + co * fy, e * ce],
  };
}

/** Position on the (a, χ, ω) orbit at time t, starting at perihelion at t = t0 (same period for every χ). */
export function orbitAtTime(a, chi, omega, t, k = 1, t0 = 0) {
  const n = Math.sqrt(k / (a * a * a));
  const e = Math.abs(Math.sin(chi));
  const E = solveKepler(n * (t - t0), e);
  return { ...orbitPoint(a, chi, omega, E, k), Ecc: E };
}

/** Conserved data of the (a, χ, ω) orbit: { E, C, L, Ap: [A'_x, A'_y], e, p0, T, N: pole of the Fock great circle }. */
export function orbitInvariants(a, chi, omega, k = 1) {
  const C = Math.sqrt(k * a);
  const s = Math.sin(chi);
  const c = Math.cos(chi);
  return {
    E: -k / (2 * a),
    C,
    L: C * c,
    Ap: [C * s * Math.cos(omega), C * s * Math.sin(omega)],
    e: Math.abs(s),
    p0: Math.sqrt(k / a),
    T: TAU * Math.sqrt((a * a * a) / k),
    N: [s * Math.sin(omega), -s * Math.cos(omega), c],
  };
}

/** Inverse of the pole map: N ∈ S² → { chi ∈ [0, π], omega }. */
export function chiOmegaFromPole(N) {
  const n = Math.hypot(N[0], N[1], N[2]) || 1;
  const chi = Math.acos(Math.max(-1, Math.min(1, N[2] / n)));
  const omega = Math.hypot(N[0], N[1]) > 1e-12 ? Math.atan2(N[0], -N[1]) : 0;
  return { chi, omega };
}

/** Inverse stereographic projection R² → S² (from the north pole): Fock's map of p/p0. */
export function fockFromMomentum(p, p0) {
  const u = p[0] / p0;
  const v = p[1] / p0;
  const r2 = u * u + v * v;
  return [(2 * u) / (1 + r2), (2 * v) / (1 + r2), (r2 - 1) / (r2 + 1)];
}

/** Stereographic projection S² → R² (from the north pole), scaled by p0. */
export function momentumFromFock(xi, p0) {
  const d = 1 - xi[2];
  const k = Math.abs(d) < 1e-12 ? 1e12 : 1 / d;
  return [xi[0] * k * p0, xi[1] * k * p0];
}

/** Hodograph circle (in velocity space) of the (a, χ, ω) orbit: centre p0 tan χ (ẑ × Â), radius p0/|cos χ|. */
export function hodographOf(a, chi, omega, k = 1) {
  const p0 = Math.sqrt(k / a);
  const c = Math.cos(chi);
  const t = Math.sin(chi) / (Math.abs(c) > 1e-12 ? c : 1e-12);
  return { c: [-p0 * t * Math.sin(omega), p0 * t * Math.cos(omega)], R: p0 / Math.max(Math.abs(c), 1e-12), p0 };
}

// ------------------------------------------------------------------ 3D Poisson brackets (used by the tests)
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/** L and A in 3D from (r, p) with m = 1. */
export function LA3(r, p, k = 1) {
  const L = cross(r, p);
  const rn = Math.hypot(r[0], r[1], r[2]);
  const pL = cross(p, L);
  return { L, A: [pL[0] - (k * r[0]) / rn, pL[1] - (k * r[1]) / rn, pL[2] - (k * r[2]) / rn], H: 0.5 * (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - k / rn };
}
/** Numerical Poisson bracket {f, g} at z = [r, p] (central differences). */
export function poisson(f, g, z, h = 1e-5) {
  const grad = (F) => {
    const out = new Array(6);
    for (let i = 0; i < 6; i++) {
      const zp = z.slice();
      const zm = z.slice();
      zp[i] += h;
      zm[i] -= h;
      out[i] = (F(zp) - F(zm)) / (2 * h);
    }
    return out;
  };
  const df = grad(f);
  const dg = grad(g);
  let s = 0;
  for (let i = 0; i < 3; i++) s += df[i] * dg[i + 3] - df[i + 3] * dg[i];
  return s;
}

// ------------------------------------------------------------------ hydrogen (atomic units)
export const SPECTRO = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k'];
/** Asymptotic quantum defects of sodium (Rydberg–Ritz leading terms), l = s, p, d, f, … */
export const NA_DEFECTS = [1.35, 0.86, 0.01, 0];
export const quantumDefect = (l) => NA_DEFECTS[l] ?? 0;

/** Effective principal quantum number n* = n − s·δ_l (s = core screening 0…1). */
export const nEff = (n, l, s = 0) => n - s * quantumDefect(l);
/** E_{n,l} = −1/(2 n*²) in Hartree. */
export const levelEnergy = (n, l, s = 0) => -1 / (2 * nEff(n, l, s) ** 2);

/**
 * The SO(4) ≅ SU(2)×SU(2)/Z₂ multiplet of shell n: (j, j) with j = (n−1)/2, states |m₁ m₂⟩.
 * Each state is assigned to the l-multiplet that carries its weight m = m₁ + m₂ when the grid is peeled
 * into nested hooks with corners on m = 0 (one state of each |m| ≤ l per hook):
 *   l = n − 1 − min(i, n − 1 − k),  i = m₁ + j, k = m₂ + j.
 * The true |l m⟩ are Clebsch–Gordan combinations along each m-diagonal; the hooks get the counting right.
 */
export function so4Multiplet(n) {
  const j = (n - 1) / 2;
  const out = [];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      const m1 = i - j;
      const m2 = k - j;
      out.push({ i, k, m1, m2, m: Math.round(m1 + m2), l: n - 1 - Math.min(i, n - 1 - k) });
    }
  return out;
}
