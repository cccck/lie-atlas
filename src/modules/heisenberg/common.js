// Shared canvas helpers for the Heisenberg module: signed-area shading, oriented loops, phase dials, hue wheel.
import { withAlpha } from '../../core/theme.js';
import * as M from './math.js';

const TAU = M.TAU;

/** Phase → CSS colour (hue = arg, 0 = red, π/2 = yellow-green, π = cyan, 3π/2 = violet). */
export function hue(arg, light = 56, sat = 74) {
  const d = ((((arg * 180) / Math.PI) % 360) + 360) % 360;
  return `hsl(${d.toFixed(1)}, ${sat}%, ${light}%)`;
}

/**
 * Shade the winding-number field of a closed polygon: w > 0 (counter-clockwise) in `pos`, w < 0 in `neg`,
 * darker where |w| > 1. Rows are 1–2 CSS px high, spans are exact in x.
 */
export function shadeSignedArea(p, c2, pts, o = {}) {
  if (!pts || pts.length < 3) return;
  const row = o.row ?? 2;
  const a = o.alpha ?? 0.22;
  const pos = p.color(o.pos ?? 'brk');
  const neg = p.color(o.neg ?? 'c1');
  const fp = [1, 2, 3].map((w) => withAlpha(pos, Math.min(0.75, a * (1 + 0.8 * (w - 1)))));
  const fn = [1, 2, 3].map((w) => withAlpha(neg, Math.min(0.75, a * (1 + 0.8 * (w - 1)))));
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    if (q[1] < y0) y0 = q[1];
    if (q[1] > y1) y1 = q[1];
  }
  const py0 = Math.max(0, Math.floor(p.sy(y1)));
  const py1 = Math.min(p.height, Math.ceil(p.sy(y0)));
  for (let py = py0; py < py1; py += row) {
    const spans = M.windingSpans(pts, p.wy(py + row / 2));
    for (const [x0, x1, w] of spans) {
      const X0 = p.sx(x0);
      const X1 = p.sx(x1);
      c2.fillStyle = (w > 0 ? fp : fn)[Math.min(3, Math.abs(w)) - 1];
      c2.fillRect(X0, py, X1 - X0, row);
    }
  }
}

/** Areas and centroids of the counter-clockwise (+) and clockwise (−) parts, on a world grid (cached by caller). */
export function lobes(pts, dy = 0.01) {
  const out = { plus: { area: 0, c: [0, 0] }, minus: { area: 0, c: [0, 0] } };
  if (!pts || pts.length < 3) return out;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    if (q[1] < y0) y0 = q[1];
    if (q[1] > y1) y1 = q[1];
  }
  const acc = { plus: [0, 0, 0], minus: [0, 0, 0] };
  for (let y = y0 + dy / 2; y < y1; y += dy) {
    for (const [x0, x1, w] of M.windingSpans(pts, y)) {
      const t = w > 0 ? acc.plus : acc.minus;
      const dA = (x1 - x0) * dy * Math.abs(w);
      t[0] += dA;
      t[1] += dA * 0.5 * (x0 + x1);
      t[2] += dA * y;
    }
  }
  for (const k of ['plus', 'minus']) {
    const [A, X, Y] = acc[k];
    out[k] = { area: k === 'plus' ? A : -A, c: A > 1e-9 ? [X / A, Y / A] : [0, 0] };
  }
  return out;
}

/** Small filled arrowhead at world point z pointing along unit tangent t (world). */
export function arrowHead(p, c2, z, t, color, size = 9, alpha = 1) {
  const X = p.sx(z[0]);
  const Y = p.sy(z[1]);
  let ux = t[0] * p.scale;
  let uy = -t[1] * p.scaleY;
  const m = Math.hypot(ux, uy) || 1;
  ux /= m;
  uy /= m;
  c2.beginPath();
  c2.moveTo(X + ux * size * 0.65, Y + uy * size * 0.65);
  c2.lineTo(X - ux * size * 0.45 - uy * size * 0.5, Y - uy * size * 0.45 + ux * size * 0.5);
  c2.lineTo(X - ux * size * 0.45 + uy * size * 0.5, Y - uy * size * 0.45 - ux * size * 0.5);
  c2.closePath();
  c2.fillStyle = p.color(color);
  c2.globalAlpha = alpha;
  c2.fill();
  c2.globalAlpha = 1;
}

/** Closed loop with orientation arrowheads. */
export function drawLoop(p, c2, loop, o = {}) {
  const col = o.color ?? 'grp';
  p.line([...loop.pts, loop.pts[0]], { color: col, width: o.width ?? 2.25, alpha: o.alpha ?? 1, dash: o.dash });
  const n = o.arrows ?? 4;
  for (let i = 0; i < n; i++) {
    const at = M.loopAt(loop, (i + 0.5) / n);
    arrowHead(p, c2, at.z, at.t, col, o.head ?? 10, o.alpha ?? 1);
  }
}

/**
 * Phase dial in screen coordinates. o: { cx, cy, r, angle (unwrapped phase, drawn as a spiral) | null,
 * z: [re, im] (needle; default e^{i·angle}), color, arc, label (TeX), key, sub (plain text) }.
 */
export function drawDial(p, c2, o) {
  const { cx, cy, r } = o;
  c2.beginPath();
  c2.arc(cx, cy, r + 9, 0, TAU);
  c2.fillStyle = withAlpha(p.color('surface'), 0.88);
  c2.fill();
  c2.lineWidth = 1;
  c2.strokeStyle = p.color('border');
  c2.stroke();
  // unit circle and quarter ticks
  c2.beginPath();
  c2.arc(cx, cy, r, 0, TAU);
  c2.strokeStyle = p.color('axis');
  c2.lineWidth = 1.25;
  c2.stroke();
  c2.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    c2.moveTo(cx + Math.cos(a) * (r - 4), cy - Math.sin(a) * (r - 4));
    c2.lineTo(cx + Math.cos(a) * (r + 4), cy - Math.sin(a) * (r + 4));
  }
  c2.stroke();
  // phase 0 reference
  c2.beginPath();
  c2.moveTo(cx, cy);
  c2.lineTo(cx + r, cy);
  c2.setLineDash([2, 3]);
  c2.strokeStyle = p.color('muted');
  c2.lineWidth = 1;
  c2.stroke();
  c2.setLineDash([]);
  // accumulated phase as a spiral (one extra ring per turn)
  const ang = Number.isFinite(o.angle) ? o.angle : null;
  if (ang !== null && Math.abs(ang) > 1e-3) {
    const N = Math.max(8, Math.min(600, Math.ceil(Math.abs(ang) / 0.04)));
    c2.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (ang * i) / N;
      const rr = r * Math.min(0.9, 0.36 + (0.14 * Math.abs(a)) / TAU);
      const X = cx + rr * Math.cos(a);
      const Y = cy - rr * Math.sin(a);
      if (i) c2.lineTo(X, Y);
      else c2.moveTo(X, Y);
    }
    c2.strokeStyle = p.color(o.arc ?? 'brk');
    c2.lineWidth = 2;
    c2.stroke();
  }
  // needle
  const z = o.z ?? (ang !== null ? [Math.cos(ang), Math.sin(ang)] : [1, 0]);
  const zx = Number.isFinite(z[0]) ? z[0] : 1;
  const zy = Number.isFinite(z[1]) ? z[1] : 0;
  const X1 = cx + r * zx;
  const Y1 = cy - r * zy;
  const len = Math.hypot(X1 - cx, Y1 - cy);
  const col = p.color(o.color ?? 'hi');
  if (len > 2) {
    c2.beginPath();
    c2.moveTo(cx, cy);
    c2.lineTo(X1, Y1);
    c2.strokeStyle = col;
    c2.lineWidth = 2.5;
    c2.lineCap = 'round';
    c2.stroke();
  }
  c2.beginPath();
  c2.arc(X1, Y1, 4, 0, TAU);
  c2.fillStyle = col;
  c2.fill();
  c2.beginPath();
  c2.arc(cx, cy, 2.2, 0, TAU);
  c2.fillStyle = p.color('ink2');
  c2.fill();
  if (o.label) p.tex(o.label, [p.wx(cx), p.wy(cy + r + 20)], { key: (o.key || 'dial') + 'L', small: true, align: 'center' });
  if (o.sub) {
    c2.font = '11px system-ui, "Segoe UI", sans-serif';
    c2.fillStyle = p.color('muted');
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillText(o.sub, cx, cy - r - 17);
  }
}

/** Hue wheel legend (screen coordinates) for phase colouring. */
export function drawHueWheel(p, c2, cx, cy, r, key = 'hw') {
  const seg = 48;
  for (let i = 0; i < seg; i++) {
    const a0 = (TAU * i) / seg;
    const a1 = (TAU * (i + 1)) / seg + 0.01;
    c2.beginPath();
    c2.arc(cx, cy, r, -a1, -a0);
    c2.arc(cx, cy, r * 0.55, -a0, -a1, true);
    c2.closePath();
    c2.fillStyle = hue(0.5 * (a0 + a1));
    c2.fill();
  }
  p.tex('0', [p.wx(cx + r + 9), p.wy(cy)], { key: key + '0', small: true, align: 'left' });
  p.tex('\\tfrac{\\pi}{2}', [p.wx(cx), p.wy(cy - r - 9)], { key: key + '1', small: true });
  p.tex('\\pi', [p.wx(cx - r - 8), p.wy(cy)], { key: key + '2', small: true, align: 'right' });
  p.tex('\\arg\\psi', [p.wx(cx), p.wy(cy + r + 12)], { key: key + '3', small: true });
}

/** Simple play-state machine for "go once round the loop, hold, repeat". */
export function loopClock(S, { duration = 7, hold = 1.6 } = {}) {
  let wait = 0;
  return {
    restart() {
      S.s = 0;
      wait = 0;
    },
    /** Advance; returns true when s changed. */
    step(dt, speed = 1) {
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) S.s = 0;
        return true;
      }
      S.s = Math.min(1, (S.s || 0) + (dt * speed) / duration);
      if (S.s >= 1) wait = hold;
      return true;
    },
    get holding() {
      return wait > 0;
    },
  };
}
