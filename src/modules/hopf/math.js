// Hopf fibration S^3 → S^2 and the Berry phase of a spin-½ — pure maths, no DOM (usable from Node).
//
// A qubit state ψ = (α, β) ∈ C², |α|² + |β|² = 1, is stored as a real 4-vector [a, b, c, d] with
// α = a + ib, β = c + id, i.e. a point of S^3 ⊂ R^4.
//   Hopf map      h(ψ) = ⟨ψ|σ|ψ⟩ = (2 Re ᾱβ, 2 Im ᾱβ, |α|² − |β|²)        (= Bloch vector)
//   section       s(θ, φ) = (cos θ/2, e^{iφ} sin θ/2)                       (singular only at the south pole)
//   fibre over n  {e^{iχ} s(n) : χ ∈ [0, 2π)}                               (a great circle of S^3)
//   stereographic (a, b, c, d) ↦ (a, b, c)/(1 − d)                         (pole (0,0,0,1) lies on the fibre over −ẑ)
//   parallel transport (horizontal lift): Im⟨ψ|dψ⟩ = 0  ⇔  ψ = e^{iχ}s with dχ = −Im⟨s|ds⟩.

export const TAU = 2 * Math.PI;
const PI = Math.PI;

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const mod = (x, m) => ((x % m) + m) % m;
/** Wrap to (−π, π]. */
export const wrapPi = (x) => {
  const y = mod(x + PI, TAU) - PI;
  return y === -PI ? PI : y;
};

// ------------------------------------------------------------------ S^2
export const sph = (theta, phi) => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
export function angles(n) {
  const r = Math.hypot(n[0], n[1], n[2]) || 1;
  return { theta: Math.acos(clamp(n[2] / r, -1, 1)), phi: Math.atan2(n[1], n[0]) };
}
const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norm3 = (u) => Math.hypot(u[0], u[1], u[2]);
export const normalize3 = (u) => {
  const r = norm3(u) || 1;
  return [u[0] / r, u[1] / r, u[2] / r];
};
/** Great-circle interpolation between unit vectors. */
export function slerp3(p, q, t) {
  const c = clamp(dot3(p, q), -1, 1);
  const om = Math.acos(c);
  if (om < 1e-9) return p.slice();
  const s = Math.sin(om);
  const wa = Math.sin((1 - t) * om) / s;
  const wb = Math.sin(t * om) / s;
  return normalize3([wa * p[0] + wb * q[0], wa * p[1] + wb * q[1], wa * p[2] + wb * q[2]]);
}
/** Signed solid angle of the geodesic triangle (a, b, c) (Van Oosterom–Strackee); > 0 if counter-clockwise seen from outside. */
export function triangleSolidAngle(a, b, c) {
  const num = dot3(a, cross3(b, c));
  const den = 1 + dot3(a, b) + dot3(b, c) + dot3(c, a);
  return 2 * Math.atan2(num, den);
}
/** Signed solid angle enclosed by a closed polygon on S^2 (points, last ≠ first), as a fan from `centre`. */
export function loopSolidAngle(pts, centre) {
  let om = 0;
  for (let i = 0; i < pts.length; i++) om += triangleSolidAngle(centre, pts[i], pts[(i + 1) % pts.length]);
  return om;
}

// ------------------------------------------------------------------ C² = R^4
/** s(θ, φ) = (cos θ/2, e^{iφ} sin θ/2). */
export function section(theta, phi) {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [c, 0, s * Math.cos(phi), s * Math.sin(phi)];
}
export const sectionAt = (n) => {
  const { theta, phi } = angles(n);
  return section(theta, phi);
};
/** e^{iχ} ψ (global phase). */
export function withPhase(psi, chi) {
  const co = Math.cos(chi);
  const si = Math.sin(chi);
  return [psi[0] * co - psi[1] * si, psi[0] * si + psi[1] * co, psi[2] * co - psi[3] * si, psi[2] * si + psi[3] * co];
}
/** Hopf map = Bloch vector ⟨ψ|σ|ψ⟩. ᾱβ = (ac + bd) + i(ad − bc). */
export function hopf([a, b, c, d]) {
  return [2 * (a * c + b * d), 2 * (a * d - b * c), a * a + b * b - c * c - d * d];
}
/** ⟨p|q⟩ as [re, im]. */
export function inner(p, q) {
  return [p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3], p[0] * q[1] - p[1] * q[0] + p[2] * q[3] - p[3] * q[2]];
}
/** Rotation of S^3 by τ in the (a, d)-plane, applied before projecting (equivalently: moves the projection point). */
export function rotAD(psi, tau) {
  if (!tau) return psi;
  const co = Math.cos(tau);
  const si = Math.sin(tau);
  return [psi[0] * co - psi[3] * si, psi[1], psi[2], psi[0] * si + psi[3] * co];
}
/** Base point whose fibre passes through the projection point after rotAD(·, τ): h(R⁻¹ e_d) = (0, sin 2τ, −cos 2τ). */
export const poleFibreBase = (tau) => [0, Math.sin(2 * tau), -Math.cos(2 * tau)];

/** Stereographic projection S^3 → R^3 from (0,0,0,1): (a, b, c)/(1 − d). */
export function stereo4(p) {
  const k = 1 - p[3];
  if (k < 1e-12) return [Infinity, Infinity, Infinity];
  return [p[0] / k, p[1] / k, p[2] / k];
}
export const project = (psi, tau = 0) => stereo4(rotAD(psi, tau));

/** Fibre over the base point of ψ, through ψ: χ ↦ e^{iχ} ψ. */
export const fibrePoint = (psi, chi, tau = 0) => project(withPhase(psi, chi), tau);

/** Torus of revolution swept by the fibres over the latitude θ: core radius 1/cos(θ/2), tube radius tan(θ/2). */
export const latitudeTorus = (theta) => ({ R: 1 / Math.cos(theta / 2), r: Math.tan(theta / 2) });

// ------------------------------------------------------------------ clipped adaptive sampling
const rad = (p) => (Number.isFinite(p[0]) ? Math.hypot(p[0], p[1], p[2]) : Infinity);

function crossing(f, tOut, tIn, rClip) {
  // bisection for |f(t)| = rClip between an outside and an inside parameter
  let a = tOut;
  let b = tIn;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (rad(f(m)) > rClip) a = m;
    else b = m;
  }
  return [b, f(b)];
}

function refine(f, a, pa, b, pb, out, tol, depth) {
  const ra = rad(pa);
  const rb = rad(pb);
  const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
  if (depth >= 7 || d <= tol * (1 + 0.12 * Math.max(ra, rb))) return;
  const m = (a + b) / 2;
  const pm = f(m);
  refine(f, a, pa, m, pm, out, tol, depth + 1);
  out.push(pm);
  refine(f, m, pm, b, pb, out, tol, depth + 1);
}

/**
 * Sample a closed curve f(t) → R^3, t ∈ [0, 1), clipping it at radius rClip (the far arc of a projected
 * circle is one contiguous piece) and refining segments that are long on screen.
 * Returns { pts, closed } — closed curves repeat their first point at the end.
 */
export function sampleClosed(f, { n = 144, rClip = 14, tol = 0.06 } = {}) {
  const T = new Array(n);
  const P = new Array(n);
  const R = new Array(n);
  let iMax = 0;
  for (let i = 0; i < n; i++) {
    T[i] = i / n;
    P[i] = f(T[i]);
    R[i] = rad(P[i]);
    if (R[i] > R[iMax]) iMax = i;
  }
  const closed = R[iMax] <= rClip;
  const start = closed ? 0 : iMax;
  const out = [];
  for (let j = 0; j < n; j++) {
    const i0 = (start + j) % n;
    const i1 = (start + j + 1) % n;
    const t0 = start + j < n ? T[i0] : T[i0] + 1;
    const t1 = start + j + 1 < n ? T[i1] : T[i1] + 1;
    const g = (t) => f(t % 1);
    const in0 = R[i0] <= rClip;
    const in1 = R[i1] <= rClip;
    if (!in0 && !in1) continue;
    let a = t0;
    let pa = P[i0];
    let b = t1;
    let pb = P[i1];
    if (!in0) [a, pa] = crossing(g, t0, t1, rClip);
    if (!in1) [b, pb] = crossing(g, t1, t0, rClip);
    if (!out.length) out.push(pa);
    refine(g, a, pa, b, pb, out, tol, 0);
    out.push(pb);
  }
  return { pts: out, closed };
}

// ------------------------------------------------------------------ parallel transport (Berry)
/**
 * Horizontal lift of a closed loop of base points ns[0..N−1] (ns[N] ≡ ns[0] implied).
 * ψ_0 = s(n_0); ψ_k = s(n_k)·⟨s_k|ψ_{k−1}⟩/|…| (discrete parallel transport: ⟨ψ_{k−1}|ψ_k⟩ > 0).
 * Returns { psi: [ψ_0 … ψ_N], chi: [χ_0 … χ_N] (phase of ψ_k relative to s(n_k), unwrapped), gamma }
 * where gamma = arg⟨ψ_0|ψ_N⟩ ∈ (−π, π] is the holonomy (gauge invariant).
 */
export function horizontalLift(ns) {
  const N = ns.length;
  const psi = new Array(N + 1);
  const chi = new Array(N + 1);
  let prevS = sectionAt(ns[0]);
  psi[0] = prevS;
  chi[0] = 0;
  for (let k = 1; k <= N; k++) {
    const sk = sectionAt(ns[k % N]);
    const z = inner(sk, psi[k - 1]);
    const r = Math.hypot(z[0], z[1]) || 1;
    psi[k] = withPhase(sk, Math.atan2(z[1], z[0]));
    void r;
    // χ_k − χ_{k−1} = arg⟨s_k|s_{k−1}⟩ (small step), accumulated without wrapping
    const w = inner(sk, prevS);
    chi[k] = chi[k - 1] + Math.atan2(w[1], w[0]);
    prevS = sk;
  }
  const g = inner(psi[0], psi[N]);
  return { psi, chi, gamma: Math.atan2(g[1], g[0]) };
}

// ------------------------------------------------------------------ loops on the Bloch sphere
/** Closed loops n(u), u ∈ [0, 1). Each returns { pts, centre, omegaExact, label }. */
export function makeLoop(kind, theta0, N = 1440) {
  const pts = [];
  if (kind === 'latitude') {
    for (let i = 0; i < N; i++) pts.push(sph(theta0, (TAU * i) / N));
    return { pts, centre: [0, 0, 1], omegaExact: TAU * (1 - Math.cos(theta0)), vertices: null };
  }
  if (kind === 'triangle') {
    // geodesic triangle: north pole → (θ0, 0) → (θ0, π/2) → back; θ0 = π/2 is the octant x̂ŷẑ
    const V = [
      [0, 0, 1],
      sph(theta0, 0),
      sph(theta0, PI / 2),
    ];
    const per = Math.floor(N / 3);
    for (let e = 0; e < 3; e++) for (let i = 0; i < per; i++) pts.push(slerp3(V[e], V[(e + 1) % 3], i / per));
    const centre = normalize3([V[0][0] + V[1][0] + V[2][0], V[0][1] + V[1][1] + V[2][1], V[0][2] + V[1][2] + V[2][2]]);
    return { pts, centre, omegaExact: triangleSolidAngle(V[0], V[1], V[2]), vertices: V };
  }
  // figure-eight (lemniscate of Gerono in the tangent plane at x̂, gnomonic): lobes of opposite orientation
  const L = Math.tan(theta0);
  for (let i = 0; i < N; i++) {
    const u = (TAU * i) / N;
    const y = L * Math.sin(u);
    const z = L * Math.sin(u) * Math.cos(u) * 1.25;
    pts.push(normalize3([1, y, z]));
  }
  return { pts, centre: [1, 0, 0], omegaExact: 0, vertices: null };
}

/** Lobe-resolved fan pieces for drawing the enclosed flux: per edge i the signed solid angle of (centre, p_i, p_{i+1}). */
export function fanSigns(pts, centre) {
  return pts.map((p, i) => Math.sign(triangleSolidAngle(centre, p, pts[(i + 1) % pts.length])));
}

/** Continuous closed lift along a base circle given as unit vectors ns (closing phase spread uniformly). */
export function closedLift(ns) {
  const { psi, gamma } = horizontalLift(ns);
  const N = ns.length;
  return psi.slice(0, N).map((p, k) => withPhase(p, (-gamma * k) / N));
}
