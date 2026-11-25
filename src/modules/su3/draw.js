// Canvas helpers shared by the SU(3) tabs (plot2d API). Coordinates are the (T3, T8) plane.

import { rational } from '../../core/format.js';
import * as M from './math.js';

/** Plain-text fraction for canvas labels: 0.5 → '½', −2/3 → '−⅔', 1.5 → '3/2'. */
export function fracText(x) {
  const r = rational(x, 12, 1e-9);
  if (!r || !r.exact) return String(+x.toFixed(2)).replace('-', '−');
  const sgn = r.p < 0 ? '−' : '';
  const p = Math.abs(r.p);
  if (r.q === 1) return sgn + p;
  const special = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/6': '⅙', '5/6': '⅚' };
  return sgn + (special[`${p}/${r.q}`] || `${p}/${r.q}`);
}

/** TeX pair (I3, Y) with fractions. */
export function texIY(dyn, texFrac) {
  const [I3, Y] = M.toIY(dyn);
  return `(${texFrac(I3)},\\,${texFrac(Y)})`;
}

/** A weight with multiplicity m: a dot and m−1 concentric rings (pixel radii). colors[i] per state. */
export function ringStack(p, pt, mult, o = {}) {
  const r0 = o.r0 ?? 4.5;
  const gap = o.gap ?? 3.6;
  const k = p.scale;
  const col = (i) => (o.colors ? o.colors[i] : i === 0 ? o.fill ?? o.color ?? 'ink' : o.ringColor ?? o.color ?? 'ink');
  p.dot(pt, { r: r0, fill: col(0), alpha: o.alpha ?? 1 });
  for (let i = 1; i < mult; i++) p.circle(pt, (r0 + i * gap) / k, { color: col(i), width: o.width ?? 1.3, alpha: o.alpha ?? 1 });
}

/** Outer radius in px of a ring stack. */
export const stackRadius = (mult, o = {}) => (o.r0 ?? 4.5) + Math.max(0, mult - 1) * (o.gap ?? 3.6);

/** Filled weight polygon (Weyl orbit of the highest weight). */
export function outlinePoly(p, pq, st = {}) {
  const pts = M.outline(pq[0], pq[1]);
  if (pts.length < 3) return;
  p.polygon(pts, { fill: st.fill ?? 'grp', alpha: st.fillAlpha ?? 0.06, stroke: st.stroke ?? 'grp', width: st.width ?? 1.3, strokeAlpha: st.strokeAlpha ?? 0.7, dash: st.dash });
}

/** Translate a polygon. */
export const shift = (pts, d) => pts.map((q) => [q[0] + d[0], q[1] + d[1]]);

/** World bounding box of a set of plane points. */
export function bounds(pts) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { x0, x1, y0, y1 };
}

/** Thin arrowed axis line with a TeX label at the end. */
export function axisArrow(p, a, b, label, o = {}) {
  p.arrow(a, b, { color: 'axis', width: 1.2, head: 7 });
  if (label) p.tex(label, b, { key: o.key, offset: o.offset || [0, -12], small: true, color: 'muted', align: o.align || 'center' });
}

/** A star (highest-weight marker), radius in px. */
export function star(p, pt, r, st = {}) {
  const ctx = p.ctx;
  const X = p.sx(pt[0]);
  const Y = p.sy(pt[1]);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = X + rr * Math.cos(ang);
    const y = Y + rr * Math.sin(ang);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.globalAlpha = st.alpha ?? 1;
  ctx.fillStyle = p.color(st.fill ?? 'hi');
  ctx.fill();
  ctx.globalAlpha = 1;
}
