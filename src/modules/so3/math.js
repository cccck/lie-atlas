// DOM-free maths for the SO(3) module (route #/so3). Verified numerically by tests/so3.test.mjs.
//
// Conventions (site-wide, see docs/ARCHITECTURE.md):
//   ħ = 1. Hermitian generators in the Cartesian (vector) representation: (J_k)_{ij} = −i ε_{kij}.
//   U(θ, n̂) = exp(−iθ n̂·J) is the ACTIVE right-handed rotation by θ about n̂, and
//   −iθ n̂·J = θ K with the real antisymmetric K = hat(n̂) (K v = n̂ × v). Real generators L_k = −i J_k.
//   Quaternions [w, x, y, z]: q = (cos θ/2, sin θ/2 n̂) ↔ rotation by θ about n̂; q and −q are the same rotation.

import { mat, vec, quat, hat, clamp, TAU, rotX, rotY, rotZ } from '../../core/la.js';
import { cmat } from '../../core/complex.js';

export const PI = Math.PI;
export const I3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Basis vectors e_x, e_y, e_z. */
export const E = I3;

/** Levi-Civita symbol ε_{ijk} for indices in {0, 1, 2}. */
export function levi(i, j, k) {
  return ((i - j) * (j - k) * (k - i)) / 2;
}

// ------------------------------------------------------------------ generators
/** Hermitian spin-1 generators in the Cartesian basis, (J_k)_{ij} = −i ε_{kij} (complex 3×3, {re, im}). */
export const J = [0, 1, 2].map((k) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => ({ re: 0, im: -levi(k, i, j) || 0 }))));

/** Real antisymmetric generators L_k = −i J_k, (L_k)_{ij} = −ε_{kij}; exp(θ L_k) = rotation by θ about e_k. */
export const Lreal = [0, 1, 2].map((k) => hat(E[k]));

/** n·J as a complex 3×3 matrix (equals i·hat(n)). */
export const nDotJ = (n) => cmat.combo(n, J);

/** Rodrigues: R(θ, n̂) = 1 + sin θ K + (1 − cos θ) K², K = hat(n̂). A zero axis gives the identity. */
export function rodrigues(n, theta) {
  const u = vec.normalize(n);
  const K = hat(u);
  const K2 = mat.mul(K, K);
  const s = Math.sin(theta);
  const c = 1 - Math.cos(theta);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + s * K[i][j] + c * K2[i][j]));
}

/** Rotate a vector: R(θ, n̂) v = (v·n̂) n̂ + cos θ (v − (v·n̂) n̂) + sin θ (n̂ × v). */
export function rotateVec(n, theta, v) {
  const u = vec.normalize(n);
  const d = vec.dot(v, u);
  const par = vec.scale(u, d);
  const perp = vec.sub(v, par);
  return vec.add(vec.add(par, vec.scale(perp, Math.cos(theta))), vec.scale(vec.cross(u, v), Math.sin(theta)));
}

export const traceOf = (R) => R[0][0] + R[1][1] + R[2][2];

// ------------------------------------------------------------------ quaternions & the π-ball
/** Unit quaternion for the rotation by `theta` about `n` (SU(2)-faithful: q(θ + 2π) = −q(θ)). */
export const qAxisAngle = (n, theta) => quat.fromAxisAngle(vec.norm(n) > 1e-12 ? n : [0, 0, 1], theta);

/** Principal rotation vector ω (|ω| ≤ π) of the rotation represented by the unit quaternion q (q and −q alike). */
export function rotVec(q) {
  let [w, x, y, z] = q;
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-15) return [0, 0, 0];
  const th = 2 * Math.atan2(s, w);
  return [(x / s) * th, (y / s) * th, (z / s) * th];
}

const sgn = (w) => (w < 0 ? -1 : 1);

/**
 * Sample a continuous SU(2) path q(t), t ∈ [t0, t1], into the π-ball picture of SO(3): principal rotation
 * vectors, split into segments wherever the path crosses the boundary |ω| = π (the scalar part w of the
 * continuous lift changes sign). There the path leaves the ball at `exit` and re-enters at the antipodal
 * point `entry` = −exit, which is the same rotation.
 * Returns { segments: [[ω…]…], jumps: [{ exit, entry, t }], qEnd }.
 */
export function ballPath(qf, t0, t1, n = 128) {
  const segments = [];
  const jumps = [];
  let q0 = qf(t0);
  let tPrev = t0;
  let seg = [rotVec(q0)];
  const steps = Math.max(1, Math.round(n));
  for (let i = 1; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const q1 = qf(t);
    if (sgn(q0[0]) !== sgn(q1[0])) {
      let a = tPrev;
      let b = t;
      let qa = q0;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        const qm = qf(m);
        if (sgn(qm[0]) === sgn(qa[0])) {
          a = m;
          qa = qm;
        } else b = m;
      }
      const tc = (a + b) / 2;
      const qc = qf(tc);
      let dir = vec.normalize([qc[1], qc[2], qc[3]]);
      if (vec.norm(dir) < 0.5) dir = [0, 0, 1];
      const exit = vec.scale(dir, sgn(q0[0]) * PI);
      const entry = vec.neg(exit);
      seg.push(exit);
      segments.push(seg);
      jumps.push({ exit, entry, t: tc });
      seg = [entry];
    }
    seg.push(rotVec(q1));
    q0 = q1;
    tPrev = t;
  }
  segments.push(seg);
  return { segments, jumps, qEnd: q0 };
}

/** The one-parameter subgroup t ↦ exp(−i tθ n̂·J) as an SU(2) path. */
export const subgroupQ = (n, theta) => (t) => qAxisAngle(n, t * theta);

/** Some unit vector perpendicular to n (continuous away from the switch-over region). */
export function perpTo(n) {
  const u = vec.normalize(n);
  const t = Math.abs(u[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  return vec.normalize(vec.cross(u, t));
}

/**
 * Null-homotopy of the 4π loop. H_s(t) = R(2πt, n̂) R(2πt, m̂_s), m̂_s = cos(πs) n̂ + sin(πs) p̂ (p̂ ⊥ n̂).
 * s = 0: the 4π rotation about n̂; s = 1: m̂ = −n̂, so H_1(t) = 1 for all t. Every H_s is a loop at the identity
 * whose SU(2) lift ends at +1 (two antipodal jumps for s < ½, none for s > ½).
 */
export function loop4pi(n, p, s) {
  const m = vec.add(vec.scale(n, Math.cos(PI * s)), vec.scale(p, Math.sin(PI * s)));
  return (t) => quat.mul(qAxisAngle(n, TAU * t), qAxisAngle(m, TAU * t));
}

/**
 * A family of deformations of the 2π loop: during the loop the axis tilts away from n̂ (by up to `A`·s,
 * turning about n̂ as it goes). The rotation angle is still 2πt, so every member crosses the boundary
 * exactly once and its SU(2) lift ends at −1: the jump can move but never disappear.
 */
export function loop2pi(n, p, s, A = 1.15) {
  const w = vec.cross(n, p);
  return (t) => {
    const tilt = A * s * Math.sin(PI * t);
    const ph = PI * t;
    const d = vec.add(vec.scale(p, Math.cos(ph)), vec.scale(w, Math.sin(ph)));
    const axis = vec.add(vec.scale(n, Math.cos(tilt)), vec.scale(d, Math.sin(tilt)));
    return qAxisAngle(axis, TAU * t);
  };
}

// ------------------------------------------------------------------ commutators
/** Lie bracket in so(3) ≅ (R³, ×): [a·J, b·J] = i (a × b)·J, i.e. [hat a, hat b] = hat(a × b). */
export const bracket = (a, b) => vec.cross(a, b);

/**
 * Group-commutator loop for rotation vectors a, b scaled by eps, performed in the time order
 * +a, +b, −a, −b. frame 'body': each rotation is about the body-fixed axis (right multiplication),
 * so the result is C = e^{εA} e^{εB} e^{−εA} e^{−εB} ≈ exp(ε² hat(a×b)).
 * frame 'space': each rotation is about the space-fixed axis (left multiplication), so the result is
 * e^{−εB} e^{−εA} e^{εB} e^{εA} ≈ exp(−ε² hat(a×b)).
 * Returns { qf(u), u ∈ [0, 4] (one unit per leg), end (quaternion), net (principal rotation vector) }.
 */
export function commutatorLoop(a, b, eps, frame = 'body') {
  const legs = [a, b, vec.neg(a), vec.neg(b)];
  const body = frame !== 'space';
  const pre = [[1, 0, 0, 0]];
  for (let i = 0; i < 4; i++) {
    const s = quat.fromRotVec(vec.scale(legs[i], eps));
    pre.push(body ? quat.mul(pre[i], s) : quat.mul(s, pre[i]));
  }
  const qf = (u) => {
    const i = Math.min(3, Math.max(0, Math.floor(u)));
    const f = clamp(u - i, 0, 1);
    const s = quat.fromRotVec(vec.scale(legs[i], eps * f));
    return body ? quat.mul(pre[i], s) : quat.mul(s, pre[i]);
  };
  return { qf, end: pre[4], net: rotVec(pre[4]) };
}

// ------------------------------------------------------------------ Euler angles & gimbals
/**
 * Conventions: 'zyx' (Tait–Bryan yaw ψ, pitch θ, roll φ): R = R_z(ψ) R_y(θ) R_x(φ);
 *              'zyz' (Euler α, β, γ as in Wigner's D-matrices): R = R_z(α) R_y(β) R_z(γ).
 * Both are intrinsic sequences = nested gimbals: the outer ring turns about the fixed z axis, the middle
 * ring about the outer ring's y axis, the inner ring about the middle ring's x (zyx) or z (zyz) axis.
 */
export const CONV = {
  zyx: { axes: [2, 1, 0], lockBodyAxis: 0 },
  zyz: { axes: [2, 1, 2], lockBodyAxis: 2 },
};

export const rotE = (k, a) => (k === 0 ? rotX(a) : k === 1 ? rotY(a) : rotZ(a));

/** Frames of the outer, middle and inner gimbal ring; the inner frame is the body orientation R. */
export function gimbalFrames(conv, ang) {
  const ax = CONV[conv].axes;
  const F0 = rotE(ax[0], ang[0]);
  const F1 = mat.mul(F0, rotE(ax[1], ang[1]));
  const F2 = mat.mul(F1, rotE(ax[2], ang[2]));
  return [F0, F1, F2];
}

export const eulerToR = (conv, ang) => gimbalFrames(conv, ang)[2];

/**
 * Space-frame instantaneous rotation axes a_k (the columns of the Jacobian): the angular velocity is
 * ω = a_1 ȧ_1 + a_2 ȧ_2 + a_3 ȧ_3, e.g. for zyx: a_1 = e_z, a_2 = R_z(ψ) e_y, a_3 = R_z(ψ) R_y(θ) e_x.
 */
export function eulerAxes(conv, ang) {
  const ax = CONV[conv].axes;
  const [F0, F1] = gimbalFrames(conv, ang);
  return [E[ax[0]].slice(), mat.mulv(F0, E[ax[1]]), mat.mulv(F1, E[ax[2]])];
}

export const eulerJacobian = (conv, ang) => mat.fromCols(eulerAxes(conv, ang));
/** det J = −cos θ (zyx) or −sin β (zyz). It vanishes exactly at gimbal lock. */
export const eulerDet = (conv, ang) => mat.det(eulerJacobian(conv, ang));

/**
 * Euler angles of R: both solutions [principal, alternate]. In the singular set only one combination of the
 * outer and inner angle is determined (zyx: ψ ∓ φ at θ = ±π/2; zyz: α ± γ at β = 0, π); there the outer
 * angle is taken from `ref` (or 0).
 */
export function eulerFromR(conv, R, ref) {
  const chi = Math.atan2(-R[0][1], R[1][1]);
  if (conv === 'zyx') {
    const s = clamp(-R[2][0], -1, 1);
    const th = Math.asin(s);
    if (Math.cos(th) < 1e-9) {
      const psi = ref ? ref[0] : 0;
      const phi = s > 0 ? psi - chi : chi - psi;
      return [[psi, th, phi]];
    }
    const psi = Math.atan2(R[1][0], R[0][0]);
    const phi = Math.atan2(R[2][1], R[2][2]);
    return [
      [psi, th, phi],
      [psi + PI, PI - th, phi + PI],
    ];
  }
  const cb = clamp(R[2][2], -1, 1);
  const be = Math.acos(cb);
  if (Math.sin(be) < 1e-9) {
    const al = ref ? ref[0] : 0;
    const ga = cb > 0 ? chi - al : al - chi;
    return [[al, be, ga]];
  }
  const al = Math.atan2(R[1][2], R[0][2]);
  const ga = Math.atan2(R[2][1], -R[2][0]);
  return [
    [al, be, ga],
    [al + PI, -be, ga + PI],
  ];
}

/** x shifted by a multiple of 2π to lie within π of ref. */
export const unwrapTo = (x, ref) => x + TAU * Math.round((ref - x) / TAU);

/** Continuous lift of a path of rotations to Euler angles (what a physical gimbal must do). */
export function liftEuler(conv, Rs) {
  const out = [];
  let prev = null;
  for (const R of Rs) {
    const cands = eulerFromR(conv, R, prev);
    let best = cands[0];
    if (prev) {
      let bestD = Infinity;
      for (const c of cands) {
        const u = c.map((x, i) => unwrapTo(x, prev[i]));
        const d = (u[0] - prev[0]) ** 2 + (u[1] - prev[1]) ** 2 + (u[2] - prev[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
    }
    out.push(best);
    prev = best;
  }
  return out;
}

/**
 * A smooth rotation at constant angular velocity that passes within `delta` (rad) of gimbal lock, twice per
 * turn: the body axis whose vertical alignment causes lock (x for zyx, z for zyz) starts horizontal and is
 * swept along a great circle that misses the vertical by delta. Path parameter φ = Ωt ∈ [0, 2π].
 */
export function flyPast(conv, delta, N = 1440) {
  const R0 = conv === 'zyx' ? I3 : rotX(-PI / 2);
  const u = conv === 'zyx' ? [0, Math.cos(delta), Math.sin(delta)] : [Math.cos(delta), 0, Math.sin(delta)];
  const q0 = quat.fromMat3(R0);
  const ts = [];
  const qs = [];
  const Rs = [];
  for (let i = 0; i <= N; i++) {
    const phi = (TAU * i) / N;
    const q = quat.mul(qAxisAngle(u, phi), q0);
    ts.push(phi);
    qs.push(q);
    Rs.push(quat.toMat3(q));
  }
  const angles = liftEuler(conv, Rs);
  const dets = angles.map((a) => eulerDet(conv, a));
  return { u, R0, ts, qs, Rs, angles, dets };
}

/** Direction of space rotations that no change of the Euler angles can produce (left singular vector of J with the smallest singular value). */
export function weakestDirection(conv, ang) {
  const Jm = eulerJacobian(conv, ang);
  const { values, vectors } = mat.eigSym(mat.mul(Jm, mat.transpose(Jm)));
  return { dir: vectors[0], sigmaMin: Math.sqrt(Math.max(0, values[0])) };
}
