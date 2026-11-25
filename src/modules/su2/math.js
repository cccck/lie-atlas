// SU(2) module maths — DOM-free, tested by tests/su2.test.mjs.
//
// Conventions (docs/ARCHITECTURE.md): quaternions [w,x,y,z], q = cos(θ/2) + sin(θ/2) n̂ ↔ active right-handed
// rotation by θ about n̂; SU(2) ∋ U = w·1 − i(xσx + yσy + zσz) (core complex.js su2FromQuat);
// U(θ, n̂) = exp(−iθ n̂·σ/2); R_ij(U) = ½ tr(σ_i U σ_j U†).

import { quat, vec, clamp, TAU } from '../../core/la.js';
import { cx, cmat, su2Rotation, blochVector } from '../../core/complex.js';

// ====================================================================== (a) Dirac's string trick

/** Cube half-side (side 0.8) and the scale of the anchor frame relative to the cube. */
export const CUBE_HALF = 0.4;
export const FRAME_SCALE = 3.2;

/** The eight cube corners (±h, ±h, ±h). */
export const CORNERS = (() => {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push([sx * CUBE_HALF, sy * CUBE_HALF, sz * CUBE_HALF]);
  return out;
})();

/** Smooth monotone easing on [0,1] with s(0)=0, s(1)=1, s'(0)=s'(1)=0 (cubic smoothstep). */
export function ease(u) {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Dirac's belt homotopy F(u, t) ∈ SU(2) (unit quaternion [w,x,y,z]).
 *   u ∈ [0,1]: position along a string (0 = anchor on the wall, 1 = cube corner); t ∈ [0,1]: time.
 *   ρ = (π/2) s(u):  F = [cos²ρ + sin²ρ cos 2πt, 0, cosρ sinρ (1 − cos 2πt), sinρ sin 2πt].
 * Properties: |F| = 1; F(1,t) = cos 2πt + k sin 2πt (the cube turns by 4πt about z);
 * F(0,t) = 1 (anchors fixed); F(u,0) = F(u,1) = 1 (strings untangled at the start and at the end).
 * Equivalently F = exp(ρ v(t)) exp(ρ j) with the unit pure quaternion v(t) = −cos 2πt j + sin 2πt (sinρ i + cosρ k).
 */
export function diracQuat(u, t) {
  const rho = (Math.PI / 2) * ease(u);
  const c = Math.cos(rho);
  const s = Math.sin(rho);
  const C = Math.cos(TAU * t);
  const S = Math.sin(TAU * t);
  return [c * c + s * s * C, 0, c * s * (1 - C), s * S];
}

/** Naive twist: the shell at parameter u turns by 2π·turns·t·s(u) about z. turns = 1 → the "2π" mode. */
export function twistQuat(u, t, turns = 1) {
  const half = Math.PI * turns * t * ease(u);
  return [Math.cos(half), 0, 0, Math.sin(half)];
}

/**
 * Untangling a 4π twist with the cube held fixed: H(u, τ) = F(1 − τ, s(u)).
 * H(u,0) = rotation by 4π s(u) about z (the doubly twisted strings), H(u,1) = 1, H(0,τ) = H(1,τ) = 1.
 */
export function untangleQuat(u, tau) {
  return diracQuat(1 - clamp(tau, 0, 1), ease(u));
}

/** Motion modes of the string-trick view. */
export const MODES = ['2pi', '4pi', 'untangle'];

/** SU(2) element applied to the string shell at parameter u, time t ∈ [0,1], for a given mode. */
export function stringQuat(mode, u, t) {
  t = clamp(t, 0, 1);
  if (mode === '2pi') return twistQuat(u, t, 1);
  if (mode === 'untangle') return t <= 0.5 ? twistQuat(u, 2 * t, 2) : untangleQuat(u, 2 * t - 1);
  return diracQuat(u, t);
}

/** Total rotation angle θ of the cube (about +z) at time t. The cube's SU(2) element is (cos θ/2, 0, 0, sin θ/2). */
export function cubeAngle(mode, t) {
  t = clamp(t, 0, 1);
  if (mode === '2pi') return TAU * t;
  if (mode === 'untangle') return 2 * TAU * Math.min(1, 2 * t);
  return 2 * TAU * t;
}

/** Rest position of a string point: x0(u) = lerp(anchor, corner, u) with anchor = FRAME_SCALE · corner. */
export function stringRest(corner, u) {
  const k = FRAME_SCALE + (1 - FRAME_SCALE) * u;
  return [corner[0] * k, corner[1] * k, corner[2] * k];
}

/** Position of the string point (corner, u) at time t: rotate(F(u,t), x0(u)). */
export function stringPoint(mode, corner, u, t) {
  return quat.rotate(stringQuat(mode, u, t), stringRest(corner, u));
}

/**
 * Qualitative state of the strings at time t, for the readout.
 * Returns { cubeQ, angle, state: 'untangled' | 'twisted' | 'moving' }.
 * At the end of a 2π twist the cube's lift is −1: the strings cannot be untangled with cube and anchors held.
 */
export function trickState(mode, t) {
  const angle = cubeAngle(mode, t);
  const cubeQ = [Math.cos(angle / 2), 0, 0, Math.sin(angle / 2)];
  let state = 'moving';
  if (t <= 1e-9) state = 'untangled';
  else if (t >= 1 - 1e-9) state = mode === '2pi' ? 'twisted' : 'untangled';
  else if (mode === 'untangle' && Math.abs(t - 0.5) < 1e-9) state = 'twisted';
  return { cubeQ, angle, state };
}

// ====================================================================== (b) SU(2) → SO(3)

/** SU(2) exponential coordinates: ω = θ n̂ with θ ∈ [0, 2π] (the whole sphere |ω| = 2π is the single point −1). */
export const su2Coords = (q) => quat.toRotVec(q);

/** SO(3) coordinates (principal rotation vector, |ω| ≤ π) of the rotation R(q) = R(−q). */
export function so3Coords(q) {
  return quat.toRotVec(q[0] >= 0 ? q : quat.neg(q));
}

/** A unit vector perpendicular to n (used as the direction through which the re-entry point slides). */
export function perpTo(n) {
  return vec.perp(n);
}

/**
 * Loops of rotations about the axis n̂ and the contraction of the 4π loop.
 *   kind '2pi': λ ↦ U(2πλ, n̂) — open in SU(2) (ends at −1), closed in SO(3).
 *   kind '4pi': the homotopy L_h(λ), h ∈ [0, 2]:
 *     h ∈ [0,1]: first half (λ ≤ ½) U(4πλ, n̂) from 1 to −1; second half U(4π(1−λ), m̂) from −1 back to 1, where the
 *                re-entry direction m̂(h) = cos(πh)(−n̂) + sin(πh) p̂ slides from −n̂ to +n̂ (allowed: every point of the
 *                sphere |ω| = 2π is the same element −1).
 *     h ∈ [1,2]: the loop retraces itself (out to angle r along n̂ and back) and r = 2π(2 − h) shrinks to 0.
 * Returns a unit quaternion.
 */
export function loopQuat(kind, n, lambda, h = 0, p = null) {
  const l = clamp(lambda, 0, 1);
  if (kind === '2pi') return quat.fromAxisAngle(n, TAU * l);
  const hh = clamp(h, 0, 2);
  if (hh <= 1) {
    if (l <= 0.5) return quat.fromAxisAngle(n, 2 * TAU * l);
    const pp = p || perpTo(n);
    const m = vec.add(vec.scale(n, -Math.cos(Math.PI * hh)), vec.scale(pp, Math.sin(Math.PI * hh)));
    return quat.fromAxisAngle(m, 2 * TAU * (1 - l));
  }
  const r = TAU * (2 - hh);
  const a = l <= 0.5 ? 2 * r * l : 2 * r * (1 - l);
  return quat.fromAxisAngle(n, a);
}

/**
 * Exact SU(2) exponential coordinates ω (|ω| ≤ 2π) of loopQuat — continuous in λ and free of the arbitrary
 * direction that quat.toRotVec must pick at q = −1. quat.fromRotVec(loopRotVec(…)) = loopQuat(…).
 */
export function loopRotVec(kind, n, lambda, h = 0, p = null) {
  const l = clamp(lambda, 0, 1);
  const nn = vec.normalize(n);
  if (kind === '2pi') return vec.scale(nn, TAU * l);
  const hh = clamp(h, 0, 2);
  if (hh <= 1) {
    if (l <= 0.5) return vec.scale(nn, 2 * TAU * l);
    return vec.scale(vec.normalize(reentryDir(nn, hh, p)), 2 * TAU * (1 - l));
  }
  const r = TAU * (2 - hh);
  return vec.scale(nn, l <= 0.5 ? 2 * r * l : 2 * r * (1 - l));
}

/** Coordinates of the other lift −q, given those of q (ω = θ ω̂ ↦ (2π − θ)(−ω̂)); at ω = 0 it is −1, drawn at −2π n̂. */
export function otherLift(w, n) {
  const th = vec.norm(w);
  if (th < 1e-9) return vec.scale(vec.normalize(n), -TAU);
  return vec.scale(w, -(TAU - th) / th);
}

/** SO(3) principal coordinates (|·| ≤ π) of the rotation with SU(2) coordinates ω: θ ≤ π → ω; θ > π → (2π − θ)(−ω̂). */
export function so3FromRotVec(w) {
  const th = vec.norm(w);
  if (th <= Math.PI) return w.slice();
  return vec.scale(w, -(TAU - th) / th);
}

/** The re-entry direction m̂(h) (for drawing). */
export function reentryDir(n, h, p = null) {
  const pp = p || perpTo(n);
  const hh = clamp(h, 0, 1);
  return vec.add(vec.scale(n, -Math.cos(Math.PI * hh)), vec.scale(pp, Math.sin(Math.PI * hh)));
}

/**
 * Sample a loop as polylines in a ball picture, splitting where the coordinate chart jumps
 * (SU(2): through the boundary sphere |ω| = 2π; SO(3): to the antipode on |ω| = π).
 * coords: q → [x,y,z]; jump: threshold distance (in coordinate units) that counts as a chart jump.
 * Returns { pieces: [[p0, p1, ...], ...], jumps: number of chart jumps }.
 */
export function samplePieces(f, coords, n = 240, jump = 2.0, l0 = 0, l1 = 1) {
  const pieces = [];
  let cur = [];
  let jumps = 0;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const p = coords ? coords(f(l0 + ((l1 - l0) * i) / n)) : f(l0 + ((l1 - l0) * i) / n);
    if (prev && vec.dist(p, prev) > jump) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      jumps++;
    }
    cur.push(p);
    prev = p;
  }
  if (cur.length > 1) pieces.push(cur);
  return { pieces, jumps };
}

// ====================================================================== (c) Spin in a magnetic field

/** Larmor evolution U = exp(−i φ B̂·σ/2), φ = ωt (rotation by φ about B̂; U(2π) = −1). */
export function larmorU(Bhat, phi) {
  return su2Rotation(Bhat, phi);
}

/** ψ(φ) = U(φ) ψ0. */
export function evolve(psi0, Bhat, phi) {
  return cmat.apply(larmorU(Bhat, phi), psi0);
}

/** Bloch vector of the evolved state (precesses about B̂, right-handed). */
export function blochAt(psi0, Bhat, phi) {
  return blochVector(evolve(psi0, Bhat, phi));
}

/**
 * Neutron interferometer: beam I passes the field region (spin rotated by a about B̂), beam II does not.
 * Normalised intensity I(a) = |ψ + U(a)ψ|²/4 = (1 + Re⟨ψ|U(a)|ψ⟩)/2 = (1 + cos(a/2))/2, independent of ψ and B̂.
 */
export function interferenceIntensity(a) {
  return (1 + Math.cos(a / 2)) / 2;
}
export function interferenceFromState(psi, Bhat, a) {
  const out = evolve(psi, Bhat, a);
  const s0 = cx.add(psi[0], out[0]);
  const s1 = cx.add(psi[1], out[1]);
  return (cx.abs2(s0) + cx.abs2(s1)) / 4;
}

/** Spinor normalised so that ⟨ψ|ψ⟩ = 1; returns null for a zero vector. */
export function normalizeSpinor(psi) {
  const n = Math.sqrt(cx.abs2(psi[0]) + cx.abs2(psi[1]));
  if (!(n > 1e-12)) return null;
  return [cx.scale(psi[0], 1 / n), cx.scale(psi[1], 1 / n)];
}
