// Small DOM-free helpers shared by the SO(3) tabs (geometry for drawing, formatting, throttling).

import { vec } from '../../core/la.js';
import { texNum } from '../../core/format.js';
import { perpTo, rotateVec } from './math.js';

/** Returns run(fn, force): runs fn at most every `ms` milliseconds unless force is true. */
export function throttle(ms) {
  let last = -Infinity;
  return (fn, force = false) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (force || now - last >= ms) {
      last = now;
      fn();
      return true;
    }
    return false;
  };
}

/** Points of the orbit of v under rotations about n̂ (a circle), for angles a ∈ [a0, a1]. */
export function orbitArc(n, v, a0, a1, seg = 96) {
  const pts = [];
  const m = Math.max(2, Math.ceil(seg * Math.min(1, Math.abs(a1 - a0) / (2 * Math.PI)) + 2));
  for (let i = 0; i <= m; i++) pts.push(rotateVec(n, a0 + ((a1 - a0) * i) / m, v));
  return pts;
}

/** Distance of v from the axis n̂ (radius of its orbit). */
export const orbitRadius = (n, v) => vec.norm(vec.sub(v, vec.scale(vec.normalize(n), vec.dot(v, vec.normalize(n)))));

/**
 * Helix showing an angle about the axis n̂: radius r, centred at distance c along n̂, rising by `pitch` per turn
 * (so angles beyond 2π stay readable). Returns { pts, end, tangent }.
 */
export function angleHelix(n, angle, { r = 0.26, c = 1.18, pitch = 0.09, ref } = {}) {
  const u0 = vec.normalize(n);
  let u = ref ? vec.sub(ref, vec.scale(u0, vec.dot(ref, u0))) : null;
  if (!u || vec.norm(u) < 1e-3) u = perpTo(u0);
  u = vec.normalize(u);
  const w = vec.cross(u0, u);
  const P = (a) => vec.add(vec.scale(u0, c + (pitch * a) / (2 * Math.PI)), vec.add(vec.scale(u, r * Math.cos(a)), vec.scale(w, r * Math.sin(a))));
  const seg = Math.max(4, Math.ceil((48 * Math.abs(angle)) / Math.PI));
  const pts = [];
  for (let i = 0; i <= seg; i++) pts.push(P((angle * i) / seg));
  const end = P(angle);
  const tangent = vec.normalize(
    vec.add(vec.add(vec.scale(u, -Math.sin(angle)), vec.scale(w, Math.cos(angle))), vec.scale(u0, pitch / (2 * Math.PI * r))),
  );
  return { pts, end, tangent: angle >= 0 ? tangent : vec.neg(tangent) };
}

/** Great-circle arc on the sphere of radius |a| from a to b (b ≈ −a allowed: goes through the direction `via`). */
export function sphereArc(a, b, via, seg = 64) {
  const R = vec.norm(a) || 1;
  const ua = vec.normalize(a);
  let p = vec.sub(via, vec.scale(ua, vec.dot(via, ua)));
  if (vec.norm(p) < 1e-6) p = perpTo(ua);
  p = vec.normalize(p);
  // angle from a to b measured in the (ua, p) plane
  const ub = vec.normalize(b);
  const ang = Math.atan2(vec.dot(ub, p), vec.dot(ub, ua));
  const total = ang < 0 ? ang + 2 * Math.PI : ang;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = (total * i) / seg;
    pts.push(vec.scale(vec.add(vec.scale(ua, Math.cos(t)), vec.scale(p, Math.sin(t))), R));
  }
  return pts;
}

/** TeX tuple with fixed digits. */
export const texTup = (v, d = 2) => `(${v.map((x) => texNum(x, d)).join(',\\,')})`;

/** Angle in radians as TeX "k\pi" with 2 decimals of the multiple of π plus degrees. */
export function texPiDeg(rad, dPi = 2, dDeg = 1) {
  return `${texNum(rad / Math.PI, dPi)}\\pi=${texNum((rad * 180) / Math.PI, dDeg)}^\\circ`;
}

export const deg = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;
/** Wrap to (−π, π]. */
export const wrapPi = (x) => {
  const t = (((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return t - Math.PI;
};
