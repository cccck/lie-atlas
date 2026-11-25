// Maths for the "loops" module: group commutators of small loops in five physical "worlds",
// the Baker–Campbell–Hausdorff (BCH) series, and parallel transport on the sphere. DOM-free;
// verified by tests/loops.test.mjs.
//
// Conventions (docs/ARCHITECTURE.md). Generators here are REAL (anti-Hermitian) X, with group
// elements e^{tX}; the Hermitian generator is J = iX, so [X_i, X_j] = ε_ijk X_k ⇔ [J_i, J_j] = iε_ijk J_k.
// Rotations are active and right-handed; Lorentz signature (+,−,−) on (t, x, y).
//
// The loop has four legs εX, εY, −εX, −εY.
//   body frame  (right multiplication g ← g·e^{leg}):  g = e^{εX}e^{εY}e^{−εX}e^{−εY} = exp(+ε²[X,Y] + ε³/2([X,[X,Y]]+[Y,[X,Y]]) + O(ε⁴))
//   space frame (left multiplication  g ← e^{leg}·g):  g = e^{−εY}e^{−εX}e^{εY}e^{εX} = exp(−ε²[X,Y] + ε³/2([X,[X,Y]]+[Y,[X,Y]]) + O(ε⁴))
// "Body frame" = each move is made along the object's own current axes (the flows of the
// left-invariant vector fields); "space frame" = along fixed lab axes (right-invariant fields).

import { mat, vec, hat, vee, expSO3, logSO3, clamp } from '../../core/la.js';

// ---------------------------------------------------------------- small helpers (any length)
export const vadd = (a, b) => a.map((x, i) => x + b[i]);
export const vsub = (a, b) => a.map((x, i) => x - b[i]);
export const vscale = (a, k) => a.map((x) => x * k);
export const vnorm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
const sinc = (x) => (Math.abs(x) < 1e-4 ? 1 - (x * x) / 6 + (x * x * x * x) / 120 : Math.sin(x) / x);

// ================================================================ the group "worlds"
// Each world works in algebra coordinates c = [c0, c1, c2] with respect to a basis (E0, E1, E2):
//   identity(), mul(g, h), exp(c) → group element, log(g) → c, bracket(u, v) → c, X, Y (coordinates).
// E2 is chosen along the physically meaningful "third" direction, where [X, Y] points.

/** SO(3), basis (L_x, L_y, L_z) with L_k = hat(e_k): e^{θ L_k} rotates by θ about axis k. [L_x, L_y] = L_z. */
export function rotationWorld(alpha = Math.PI / 2) {
  return {
    id: 'rot',
    X: [1, 0, 0],
    Y: [Math.cos(alpha), Math.sin(alpha), 0],
    identity: () => mat.eye(3),
    mul: mat.mul,
    exp: (c) => expSO3(c),
    log: (R) => logSO3(R),
    matrix: (c) => hat(c),
    coords: (A) => vee(A),
    bracket: (u, v) => vec.cross(u, v),
  };
}

// ---- SO⁺(2,1): Lorentz group of (t, x, y) with metric diag(+1, −1, −1)
export const KX = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 0],
];
export const KY = [
  [0, 0, 1],
  [0, 0, 0],
  [1, 0, 0],
];
export const LROT = [
  [0, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];
export const G21 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];
/** so(2,1) element η_x K_x + η_y K_y + φ L from coordinates [η_x, η_y, φ]. */
export function so21(c) {
  return [
    [0, c[0], c[1]],
    [c[0], 0, -c[2]],
    [c[1], c[2], 0],
  ];
}
export function so21Coords(A) {
  return [(A[0][1] + A[1][0]) / 2, (A[0][2] + A[2][0]) / 2, (A[2][1] - A[1][2]) / 2];
}
/** Killing-type invariant Δ = φ² − η_x² − η_y²: A³ = −ΔA (Δ > 0 elliptic, < 0 hyperbolic, = 0 parabolic). */
export const so21Delta = (c) => c[2] * c[2] - c[0] * c[0] - c[1] * c[1];
/** Closed-form exponential exp(A) = 1 + s A + k A². */
export function expSO21(c) {
  const A = so21(c);
  const A2 = mat.mul(A, A);
  const D = so21Delta(c);
  let s;
  let k;
  if (Math.abs(D) < 1e-6) {
    s = 1 - D / 6 + (D * D) / 120;
    k = 0.5 - D / 24 + (D * D) / 720;
  } else if (D > 0) {
    const r = Math.sqrt(D);
    s = Math.sin(r) / r;
    k = (1 - Math.cos(r)) / D;
  } else {
    const r = Math.sqrt(-D);
    s = Math.sinh(r) / r;
    k = (Math.cosh(r) - 1) / -D;
  }
  const R = mat.eye(3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] += s * A[i][j] + k * A2[i][j];
  return R;
}
/** Principal logarithm on SO⁺(2,1) (elliptic part with angle < π). Returns [η_x, η_y, φ]. */
export function logSO21(Lm) {
  const Li = mat.mul(mat.mul(G21, mat.transpose(Lm)), G21); // Λ⁻¹ = G Λᵀ G
  const m = so21Coords(mat.scale(mat.sub(Lm, Li), 0.5)); // (Λ − Λ⁻¹)/2 = s·A
  const DM = so21Delta(m); // = s²Δ
  const c = (Lm[0][0] + Lm[1][1] + Lm[2][2] - 1) / 2;
  let f = 1;
  if (DM > 1e-14) {
    const sn = Math.sqrt(DM);
    f = Math.atan2(sn, c) / sn;
  } else if (DM < -1e-14) {
    const sh = Math.sqrt(-DM);
    f = Math.asinh(sh) / sh;
  }
  return vscale(m, f);
}
/** Pure boost with spatial 4-velocity part u = γv (2+1 D). */
export function boostFromU(u) {
  const [ux, uy] = u;
  const g = Math.sqrt(1 + ux * ux + uy * uy);
  const k = 1 / (g + 1);
  return [
    [g, ux, uy],
    [ux, 1 + k * ux * ux, k * ux * uy],
    [uy, k * ux * uy, 1 + k * uy * uy],
  ];
}
/** Polar decomposition Λ = B(v)·R(angle): velocity, γ, rapidity and the (Wigner) rotation angle. */
export function lorentzDecompose(Lm) {
  const g = Lm[0][0];
  const u = [Lm[1][0], Lm[2][0]];
  const R = mat.mul(boostFromU([-u[0], -u[1]]), Lm);
  return { v: [u[0] / g, u[1] / g], gamma: g, rapidity: Math.asinh(Math.hypot(u[0], u[1])), angle: Math.atan2(R[2][1], R[1][1]), R };
}
/** The pure Lorentz transformation in the plane of the unit timelike vectors u, w that maps u to w. */
export function pureBoostBetween(u, w) {
  const mink = (a, b) => a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
  const s = vadd(u, w);
  const d = 1 + mink(u, w);
  const Gu = [u[0], -u[1], -u[2]];
  const Gs = [s[0], -s[1], -s[2]];
  const L = mat.eye(3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) L[i][j] += -(s[i] * Gs[j]) / d + 2 * w[i] * Gu[j];
  return L;
}
/**
 * Thomas precession, exact: a gyroscope is Fermi–Walker transported (a continuous chain of pure boosts in its
 * own rest frame) while its velocity goes once anticlockwise round a circle of rapidity η. Returns the net
 * rotation angle of the gyroscope (expected −2π(cosh η − 1) mod 2π, i.e. −(hyperbolic area enclosed)).
 */
export function thomasCircle(eta, N = 4000) {
  const ch = Math.cosh(eta);
  const sh = Math.sinh(eta);
  const U = (t) => [ch, sh * Math.cos(t), sh * Math.sin(t)];
  // start: boosted along +x with no rotation, then go round the circle
  let Lm = boostFromU([sh, 0]);
  let u = U(0);
  for (let k = 1; k <= N; k++) {
    const w = U((2 * Math.PI * k) / N);
    Lm = mat.mul(pureBoostBetween(u, w), Lm);
    u = w;
  }
  return lorentzDecompose(Lm).angle;
}
/** SO⁺(2,1), basis (K_x, K_y, L). [K_x, K_y] = −L: two boosts close into a rotation. */
export function boostWorld(alpha = Math.PI / 2) {
  return {
    id: 'boost',
    X: [1, 0, 0],
    Y: [Math.cos(alpha), Math.sin(alpha), 0],
    identity: () => mat.eye(3),
    mul: mat.mul,
    exp: expSO21,
    log: logSO21,
    matrix: so21,
    coords: so21Coords,
    bracket: (u, v) => so21Coords(mat.comm(so21(u), so21(v))),
  };
}

// ---- Heisenberg group of magnetic translations (symmetric gauge about the start point)
/**
 * Elements (x, y, θ): displacement and transported U(1) phase. Product (parallel transport in the symmetric gauge
 * A = (B/2)(−y, x) relative to the start point, charge q, ħ = 1):
 *   (a, θ)·(b, φ) = (a + b, θ + φ + (qB/2)(a × b)).
 * Exponential coordinates coincide with (x, y, θ). [X, Y] = qB·Z with Z the phase generator, so the body-frame
 * loop gives the Aharonov–Bohm phase e^{+iqΦ}, Φ = B × (oriented area). The left-invariant fields are the
 * covariant translations (kinetic momenta Π = p − qA, [Π_x, Π_y] = iqB); the right-invariant ones ("space frame")
 * are the magnetic translations generated by K = Π − q r × B, with [K_x, K_y] = −iqB.
 */
export function fluxWorld(qB = 1, alpha = Math.PI / 2) {
  return {
    id: 'flux',
    X: [1, 0, 0],
    Y: [Math.cos(alpha), Math.sin(alpha), 0],
    identity: () => [0, 0, 0],
    mul: (g, h) => [g[0] + h[0], g[1] + h[1], g[2] + h[2] + 0.5 * qB * (g[0] * h[1] - g[1] * h[0])],
    exp: (c) => [c[0], c[1], c[2]],
    log: (g) => [g[0], g[1], g[2]],
    bracket: (u, v) => [0, 0, qB * (u[0] * v[1] - u[1] * v[0])],
  };
}

// ---- SE(2): a car. Basis (F, Θ, S) = (drive forward, turn left, slide left), all in the car's own frame.
export function se2(c) {
  return [
    [0, -c[1], c[0]],
    [c[1], 0, c[2]],
    [0, 0, 0],
  ];
}
export function se2Coords(A) {
  return [A[0][2], (A[1][0] - A[0][1]) / 2, A[1][2]];
}
function se2V(w) {
  // V = a·1 + b·J with J the 90° rotation:  a = sin w / w, b = (1 − cos w)/w
  if (Math.abs(w) < 1e-4) return [1 - (w * w) / 6 + (w * w * w * w) / 120, w / 2 - (w * w * w) / 24];
  return [Math.sin(w) / w, (1 - Math.cos(w)) / w];
}
/** exp of the se(2) element with coordinates [v_∥, ω, v_⊥] (forward, turn, sideways). */
export function expSE2(c) {
  const [vx, w, vy] = c;
  const [a, b] = se2V(w);
  const co = Math.cos(w);
  const si = Math.sin(w);
  return [
    [co, -si, a * vx - b * vy],
    [si, co, b * vx + a * vy],
    [0, 0, 1],
  ];
}
export function logSE2(G) {
  const w = Math.atan2(G[1][0], G[0][0]);
  const [a, b] = se2V(w);
  const d = a * a + b * b;
  const tx = G[0][2];
  const ty = G[1][2];
  return [(a * tx + b * ty) / d, w, (-b * tx + a * ty) / d];
}
/** Pose of a car (rear-axle midpoint and heading) from an SE(2) matrix. */
export const se2Pose = (G) => ({ x: G[0][2], y: G[1][2], th: Math.atan2(G[1][0], G[0][0]) });
/**
 * SE(2) for a car: X = drive straight, Y = drive with the wheel turned (path curvature κ): Y = F + κΘ.
 * [F, Θ] = −S, so [X, Y] = −κS: the bracket of two allowed motions is a sideways slide.
 */
export function carWorld(kappa = 1) {
  return {
    id: 'car',
    X: [1, 0, 0],
    Y: [1, kappa, 0],
    identity: () => mat.eye(3),
    mul: mat.mul,
    exp: expSE2,
    log: logSE2,
    matrix: se2,
    coords: se2Coords,
    bracket: (u, v) => se2Coords(mat.comm(se2(u), se2(v))),
  };
}

// ================================================================ the loop
export function loopLegs(W, eps) {
  return [vscale(W.X, eps), vscale(W.Y, eps), vscale(W.X, -eps), vscale(W.Y, -eps)];
}
const compose = (W, g, h, frame) => (frame === 'space' ? W.mul(h, g) : W.mul(g, h));

/** Group elements at the five corners of the loop: g0 = 1, g1, …, g4 = net. */
export function loopNodes(W, eps, frame = 'body') {
  const legs = loopLegs(W, eps);
  const nodes = [W.identity()];
  for (let i = 0; i < 4; i++) nodes.push(compose(W, nodes[i], W.exp(legs[i]), frame));
  return nodes;
}
/** g(s) for s ∈ [0, 4] (leg ⌊s⌋, fraction s − ⌊s⌋). Pass precomputed nodes to save work. */
export function loopAt(W, eps, s, frame = 'body', nodes = null) {
  const sc = clamp(Number.isFinite(s) ? s : 0, 0, 4);
  const k = Math.min(3, Math.floor(sc));
  const f = sc - k;
  const nd = nodes || loopNodes(W, eps, frame);
  const legs = loopLegs(W, eps);
  return compose(W, nd[k], W.exp(vscale(legs[k], f)), frame);
}
export const loopNet = (W, eps, frame = 'body') => loopNodes(W, eps, frame)[4];
/** Leading-order prediction for log(net): ±ε²[X,Y] (+ body frame, − space frame). */
export function loopPrediction(W, eps, frame = 'body') {
  return vscale(W.bracket(W.X, W.Y), (frame === 'space' ? -1 : 1) * eps * eps);
}
/** Next order, the same in both frames: (ε³/2)([X,[X,Y]] + [Y,[X,Y]]). */
export function loopThirdOrder(W, eps) {
  const b = W.bracket(W.X, W.Y);
  return vscale(vadd(W.bracket(W.X, b), W.bracket(W.Y, b)), (eps * eps * eps) / 2);
}

// ================================================================ parallel transport on the sphere
// Unit sphere (R = 1, Gaussian curvature K = 1). Latitude λ, longitude φ. Tangent frame (east, north),
// angles α measured from east towards north (anticlockwise seen from outside).
export function sphereBasis(lat, lon) {
  const cl = Math.cos(lat);
  const sl = Math.sin(lat);
  const co = Math.cos(lon);
  const so = Math.sin(lon);
  return { p: [cl * co, cl * so, sl], east: [-so, co, 0], north: [-sl * co, -sl * so, cl] };
}
/** A small "square": east by ε (arc length along the starting latitude), north by ε, back west, back south. */
export function sphereLoop(lat0, eps, lon0 = 0) {
  return { lat0, lon0, dLat: eps, dLon: eps / Math.cos(lat0), eps };
}
/**
 * State at s ∈ [0, 4]: position and the parallel-transported vector V = cos α·east + sin α·north.
 * Meridians are geodesics (α constant); along a latitude λ, dα/dφ = −sin λ.
 */
export function sphereAt(P, s, alpha0 = 0) {
  const sc = clamp(Number.isFinite(s) ? s : 0, 0, 4);
  const k = Math.min(3, Math.floor(sc));
  const f = sc - k;
  const { lat0, lon0, dLat, dLon } = P;
  const lat1 = lat0 + dLat;
  const a1 = alpha0 - Math.sin(lat0) * dLon; // after leg 0
  const a3 = a1 + Math.sin(lat1) * dLon; // after leg 2
  let lat;
  let lon;
  let alpha;
  if (k === 0) {
    lat = lat0;
    lon = lon0 + f * dLon;
    alpha = alpha0 - Math.sin(lat0) * f * dLon;
  } else if (k === 1) {
    lat = lat0 + f * dLat;
    lon = lon0 + dLon;
    alpha = a1;
  } else if (k === 2) {
    lat = lat1;
    lon = lon0 + dLon * (1 - f);
    alpha = a1 + Math.sin(lat1) * f * dLon;
  } else {
    lat = lat1 - f * dLat;
    lon = lon0;
    alpha = a3;
  }
  const B = sphereBasis(lat, lon);
  const V = vadd(vscale(B.east, Math.cos(alpha)), vscale(B.north, Math.sin(alpha)));
  return { lat, lon, alpha, leg: k, f, ...B, V };
}
/** Exact holonomy of the loop = enclosed area (Gauss–Bonnet, K = 1). */
export const sphereHolonomy = (P) => P.dLon * (Math.sin(P.lat0 + P.dLat) - Math.sin(P.lat0));
/** Rotate v about the unit axis n by angle a (Rodrigues). */
export function rotateAbout(v, n, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d = vec.dot(n, v);
  const x = vec.cross(n, v);
  return [0, 1, 2].map((i) => v[i] * c + x[i] * s + n[i] * d * (1 - c));
}
/** Parallel transport of the tangent vector V0 at p0 along the great circle to p (unit sphere). */
export function geodesicTransport(p0, p, V0) {
  const ax = vec.cross(p0, p);
  const sn = vec.norm(ax);
  if (sn < 1e-14) return V0.slice();
  return rotateAbout(V0, vscale(ax, 1 / sn), Math.atan2(sn, vec.dot(p0, p)));
}
/**
 * "Radial gauge" angle of the transported vector at a point of the loop: the angle from the reference vector
 * (V0 carried straight along the geodesic from the start) to the actually transported V, anticlockwise about
 * the outward normal. Equals K × (area enclosed by the path so far, closed by the geodesic back to p0);
 * at the end of the loop it is the holonomy.
 */
export function sphereRadialAngle(p0, V0, st) {
  const W = geodesicTransport(p0, st.p, V0);
  return Math.atan2(vec.dot(st.p, vec.cross(W, st.V)), vec.dot(W, st.V));
}
/** Normal (exponential) coordinates of p about p0, in the (east, north) frame at p0. */
export function sphereNormalCoords(B0, p) {
  const d = vsub(p, vscale(B0.p, vec.dot(p, B0.p)));
  const sn = vec.norm(d);
  if (sn < 1e-14) return [0, 0];
  const ang = Math.atan2(sn, vec.dot(p, B0.p));
  const u = vscale(d, ang / sn);
  return [vec.dot(u, B0.east), vec.dot(u, B0.north)];
}
/** Numerical parallel transport (RK4 on dV/dt = −(V·ṅ) n, n = p) along a path p(t), t ∈ [0, 1]. For tests. */
export function transportNumeric(path, V0, steps = 2000) {
  let V = V0.slice();
  const h = 1 / steps;
  const dpath = (t) => {
    const e = 1e-6;
    return vscale(vsub(path(Math.min(1, t + e)), path(Math.max(0, t - e))), 1 / (Math.min(1, t + e) - Math.max(0, t - e)));
  };
  const f = (t, v) => {
    const n = vec.normalize(path(t));
    const nd = dpath(t);
    return vscale(n, -vec.dot(v, nd));
  };
  for (let i = 0; i < steps; i++) {
    const t = i * h;
    const k1 = f(t, V);
    const k2 = f(t + h / 2, vadd(V, vscale(k1, h / 2)));
    const k3 = f(t + h / 2, vadd(V, vscale(k2, h / 2)));
    const k4 = f(t + h, vadd(V, vscale(k3, h)));
    V = vadd(V, vscale(vadd(vadd(k1, vscale(k2, 2)), vadd(vscale(k3, 2), k4)), h / 6));
  }
  return V;
}

// ================================================================ BCH
/** so(3) bracket in R³: [x, y] = x × y. */
export const brSO3 = (x, y) => vec.cross(x, y);
/** Heisenberg algebra h₃ in coordinates (a, b, c) of aX + bY + cZ with [X, Y] = Z central. */
export const brH3 = (u, v) => [0, 0, u[0] * v[1] - u[1] * v[0]];

/**
 * Cumulative BCH truncations [Z1, …, Z5] of log(e^x e^y) for any bracket on arrays:
 *   Z = x + y + ½[x,y] + 1/12([x,[x,y]] + [y,[y,x]]) − 1/24 [y,[x,[x,y]]]
 *       − 1/720([y,[y,[y,[y,x]]]] + [x,[x,[x,[x,y]]]]) + 1/360([x,[y,[y,[y,x]]]] + [y,[x,[x,[x,y]]]])
 *       + 1/120([y,[x,[y,[x,y]]]] + [x,[y,[x,[y,x]]]]) + O(6).
 * Also returns the homogeneous pieces `terms` (degree 1…5).
 */
export function bchTruncations(x, y, br) {
  const xy = br(x, y);
  const yx = vscale(xy, -1);
  const xxy = br(x, xy);
  const yyx = br(y, yx);
  const t1 = vadd(x, y);
  const t2 = vscale(xy, 1 / 2);
  const t3 = vscale(vadd(xxy, yyx), 1 / 12);
  const t4 = vscale(br(y, xxy), -1 / 24);
  const yyyx = br(y, yyx);
  const yyyyx = br(y, yyyx);
  const xxxy = br(x, xxy);
  const xxxxy = br(x, xxxy);
  const xyyyx = br(x, yyyx);
  const yxxxy = br(y, xxxy);
  const yxyxy = br(y, br(x, br(y, xy)));
  const xyxyx = br(x, br(y, br(x, yx)));
  const t5 = vadd(vadd(vscale(vadd(yyyyx, xxxxy), -1 / 720), vscale(vadd(xyyyx, yxxxy), 1 / 360)), vscale(vadd(yxyxy, xyxyx), 1 / 120));
  const terms = [t1, t2, t3, t4, t5];
  const Z = [];
  let acc = vscale(t1, 0);
  for (const t of terms) {
    acc = vadd(acc, t);
    Z.push(acc);
  }
  return { Z, terms };
}
/** Exact log(e^x e^y) in so(3) (principal logarithm, |Z| ≤ π). */
export const bchExactSO3 = (x, y) => logSO3(mat.mul(expSO3(x), expSO3(y)));
/** Exact log(e^x e^y) in h₃: the series stops, Z = x + y + ½[x, y]. */
export const bchExactH3 = (x, y) => vadd(vadd(x, y), vscale(brH3(x, y), 0.5));

// ================================================================ generic real matrix log (tests, gl(n))
/** Principal square root by the Denman–Beavers iteration. */
export function sqrtm(A) {
  const n = A.length;
  let Y = mat.clone(A);
  let Z = mat.eye(n);
  for (let i = 0; i < 60; i++) {
    const Yn = mat.scale(mat.add(Y, mat.inv(Z)), 0.5);
    const Zn = mat.scale(mat.add(Z, mat.inv(Y)), 0.5);
    const d = mat.maxAbs(mat.sub(Yn, Y));
    Y = Yn;
    Z = Zn;
    if (d < 1e-16) break;
  }
  return Y;
}
/** Principal matrix logarithm (inverse scaling and squaring + Mercator series). */
export function logm(A) {
  const n = A.length;
  const I = mat.eye(n);
  let M = mat.clone(A);
  let k = 0;
  while (mat.normInf(mat.sub(M, I)) > 0.05 && k < 50) {
    M = sqrtm(M);
    k++;
  }
  const E = mat.sub(M, I);
  let term = mat.clone(E);
  let L = mat.zeros(n);
  for (let j = 1; j <= 40; j++) {
    L = mat.add(L, mat.scale(term, (j % 2 ? 1 : -1) / j));
    term = mat.mul(term, E);
    if (mat.maxAbs(term) < 1e-20) break;
  }
  return mat.scale(L, Math.pow(2, k));
}

export { sinc };
