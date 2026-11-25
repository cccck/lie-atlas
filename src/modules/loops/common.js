// Shared UI helpers for the "loops" module: leg styles, TeX formatting, screen-space dials and a
// log–log plot built on plot2d.

import { plot2d } from '../../core/plot2d.js';
import { clamp } from '../../core/la.js';
import { withAlpha } from '../../core/theme.js';

/** The four legs of a loop: X-legs in the x colour, Y-legs in the y colour, return legs dashed. */
export const LEGS = [
  { color: 'x', dash: false, sign: '+', gen: 'X' },
  { color: 'y', dash: false, sign: '+', gen: 'Y' },
  { color: 'x', dash: true, sign: '−', gen: 'X' },
  { color: 'y', dash: true, sign: '−', gen: 'Y' },
];
export const DASH2D = [7, 5];

/** Fraction of leg i completed at progress s ∈ [0, 4]. */
export const legFrac = (s, i) => clamp(s - i, 0, 1);

/** TeX linear combination: texCombo([0.1, 0, −2], ['L_x','L_y','L_z']) → '0.100\,L_x-2.000\,L_z'. */
export function texCombo(c, names, d = 3) {
  const parts = [];
  c.forEach((v, i) => {
    if (Number.isFinite(v) && Math.abs(v) >= 0.5 * 10 ** -d) parts.push([v, names[i]]);
  });
  if (!parts.length) return '0';
  return parts
    .map(([v, n], i) => {
      const sgn = v < 0 ? '-' : i ? '+' : '';
      return `${sgn}${Math.abs(v).toFixed(d)}\\,${n}`;
    })
    .join('');
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** '10⁻³' style label for a decade exponent. */
export const pow10Label = (k) => (k === 0 ? '1' : k === 1 ? '10' : '10' + String(k).split('').map((ch) => SUP[ch] ?? ch).join(''));

/**
 * Draw a dial in SCREEN pixels on a plot2d canvas (call inside draw). o: { cx, cy, r, angle, start (0),
 * pred (angle or null), title, value, colorNeedle ('grp'), showArc (true), label0 }.
 * Angles are mathematical (anticlockwise from +x). The accumulated angle is drawn as a spiral when |angle| > 2π.
 */
export function drawDial(p, o) {
  const c = p.ctx;
  const col = (n) => p.color(n);
  const { cx, cy, r } = o;
  const start = o.start ?? 0;
  c.save();
  // face
  c.beginPath();
  c.arc(cx, cy, r + 10, 0, Math.PI * 2);
  c.fillStyle = col('surface');
  c.globalAlpha = 0.94;
  c.fill();
  c.globalAlpha = 1;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.strokeStyle = col('axis');
  c.lineWidth = 1.2;
  c.stroke();
  // ticks every 30°
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    const r0 = k % 3 === 0 ? r - 7 : r - 4;
    c.beginPath();
    c.moveTo(cx + r0 * Math.cos(a), cy - r0 * Math.sin(a));
    c.lineTo(cx + r * Math.cos(a), cy - r * Math.sin(a));
    c.strokeStyle = col('axis');
    c.lineWidth = 1;
    c.stroke();
  }
  // start direction
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + r * Math.cos(start), cy - r * Math.sin(start));
  c.strokeStyle = col('muted');
  c.lineWidth = 1.4;
  c.stroke();
  c.setLineDash([]);
  // predicted end (tick outside the face)
  if (o.pred !== null && o.pred !== undefined && Number.isFinite(o.pred)) {
    const a = start + o.pred;
    c.beginPath();
    c.moveTo(cx + (r - 2) * Math.cos(a), cy - (r - 2) * Math.sin(a));
    c.lineTo(cx + (r + 9) * Math.cos(a), cy - (r + 9) * Math.sin(a));
    c.strokeStyle = col('brk');
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.stroke();
  }
  // accumulated angle as a (spiral) arc
  const ang = Number.isFinite(o.angle) ? o.angle : 0;
  if (o.showArc !== false && Math.abs(ang) > 1e-4) {
    const turns = Math.abs(ang) / (2 * Math.PI);
    const steps = Math.max(8, Math.ceil(Math.abs(ang) * 24));
    c.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + ang * t;
      const rr = r * 0.42 - Math.min(r * 0.25, 5 * turns * t);
      const X = cx + rr * Math.cos(a);
      const Y = cy - rr * Math.sin(a);
      if (i) c.lineTo(X, Y);
      else c.moveTo(X, Y);
    }
    c.strokeStyle = col('brk');
    c.lineWidth = 2;
    c.stroke();
  }
  // needle
  const a = start + ang;
  const nx = cx + (r - 9) * Math.cos(a);
  const ny = cy - (r - 9) * Math.sin(a);
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(nx, ny);
  c.strokeStyle = col(o.colorNeedle || 'grp');
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.stroke();
  const hx = Math.cos(a);
  const hy = -Math.sin(a);
  c.beginPath();
  c.moveTo(nx + hx * 8, ny + hy * 8);
  c.lineTo(nx - hy * 6, ny + hx * 6);
  c.lineTo(nx + hy * 6, ny - hx * 6);
  c.closePath();
  c.fillStyle = col(o.colorNeedle || 'grp');
  c.fill();
  c.beginPath();
  c.arc(cx, cy, 3.5, 0, Math.PI * 2);
  c.fillStyle = col('ink2');
  c.fill();
  // captions
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.font = '600 11.5px system-ui, "Segoe UI", sans-serif';
  c.fillStyle = col('ink2');
  if (o.title) c.fillText(o.title, cx, cy - r - 14);
  c.textBaseline = 'top';
  c.font = '12.5px ui-monospace, "Cascadia Code", Consolas, monospace';
  c.fillStyle = col('ink');
  if (o.value) c.fillText(o.value, cx, cy + r + 14);
  if (o.value2) {
    c.font = '11.5px system-ui, "Segoe UI", sans-serif';
    c.fillStyle = col('muted');
    c.fillText(o.value2, cx, cy + r + 31);
  }
  c.restore();
}

/** Draw a small filled arrow head + shaft in screen px (canvas 2D). */
export function screenArrow(c, x0, y0, x1, y1, color, width = 2, head = 8) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const h = Math.min(head, len * 0.6);
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.stroke();
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - ux * h - uy * h * 0.45, y1 - uy * h + ux * h * 0.45);
  c.lineTo(x1 - ux * h + uy * h * 0.45, y1 - uy * h - ux * h * 0.45);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

/**
 * Log–log plot of positive quantities against ε. World coordinates are (log10 ε, log10 y).
 *   opts: { x: [lo, hi] decades, y: [lo, hi] decades, xLabel, yLabel }
 * setCurves([{ xs, ys, color, width, dash, label, labelAt: 'end'|'start'|index, labelOffset }]), setMarker(ε | null),
 * setNotes([{ text, x, y (world), color }]), setRange({x, y}).
 */
export function logLogPlot(container, scope, opts = {}) {
  let xr = opts.x || [-2, 0.3];
  let yr = opts.y || [-7, 1];
  let curves = [];
  let marker = null;
  let notes = [];
  const p = plot2d(container, scope, {
    x: xr,
    y: yr,
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    padding: 0,
    draw,
  });
  const L = () => Math.log10;
  void L;
  function frame() {
    // inner data rectangle in px
    const left = 50;
    const right = 14;
    const top = 30;
    const bottom = 30;
    return { left, right, top, bottom };
  }
  function draw(pp) {
    const c = pp.ctx;
    const W = pp.width;
    const H = pp.height;
    const f = frame();
    const X = (lx) => f.left + ((lx - xr[0]) / (xr[1] - xr[0])) * (W - f.left - f.right);
    const Y = (ly) => H - f.bottom - ((ly - yr[0]) / (yr[1] - yr[0])) * (H - f.top - f.bottom);
    const col = (n) => pp.color(n);
    c.save();
    // grid & ticks
    c.font = '11px system-ui, "Segoe UI", sans-serif';
    c.lineWidth = 1;
    const ystep = yr[1] - yr[0] > 9 ? 2 : 1;
    for (let k = Math.ceil(yr[0]); k <= Math.floor(yr[1]); k++) {
      const yy = Math.round(Y(k)) + 0.5;
      c.strokeStyle = col('grid');
      c.beginPath();
      c.moveTo(f.left, yy);
      c.lineTo(W - f.right, yy);
      c.stroke();
      if ((k - Math.ceil(yr[0])) % ystep === 0 || k === 0) {
        c.fillStyle = col('muted');
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(pow10Label(k), f.left - 6, yy);
      }
    }
    for (let k = Math.ceil(xr[0]); k <= Math.floor(xr[1]); k++) {
      const xx = Math.round(X(k)) + 0.5;
      c.strokeStyle = col('grid');
      c.beginPath();
      c.moveTo(xx, f.top);
      c.lineTo(xx, H - f.bottom);
      c.stroke();
      c.fillStyle = col('muted');
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillText(pow10Label(k), xx, H - f.bottom + 5);
    }
    // frame
    c.strokeStyle = col('axis');
    c.strokeRect(f.left + 0.5, f.top + 0.5, W - f.left - f.right - 1, H - f.top - f.bottom - 1);
    // axis titles
    c.fillStyle = col('ink2');
    c.font = '12px system-ui, "Segoe UI", sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'top';
    if (opts.xLabel) c.fillText(opts.xLabel, W - f.right - 4, H - f.bottom + 5);
    // clip to the data rectangle
    c.beginPath();
    c.rect(f.left, f.top, W - f.left - f.right, H - f.top - f.bottom);
    c.clip();
    for (const cv of curves) {
      if (!cv.xs || cv.xs.length < 2) continue;
      c.beginPath();
      let pen = false;
      for (let i = 0; i < cv.xs.length; i++) {
        const yv = cv.ys[i];
        if (!(yv > 0) || !Number.isFinite(yv)) {
          pen = false;
          continue;
        }
        const px = X(Math.log10(cv.xs[i]));
        const py = Y(Math.log10(yv));
        if (cv.breakAt && i > 0 && cv.breakAt(i)) pen = false;
        if (!pen) {
          c.moveTo(px, py);
          pen = true;
        } else c.lineTo(px, py);
      }
      c.strokeStyle = col(cv.color || 'ink');
      c.lineWidth = cv.width ?? 2;
      c.globalAlpha = cv.alpha ?? 1;
      c.setLineDash(cv.dash || []);
      c.lineJoin = 'round';
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    // marker
    if (marker !== null && Number.isFinite(marker) && marker > 0) {
      const mx = Math.round(X(Math.log10(marker))) + 0.5;
      c.strokeStyle = col('hi');
      c.lineWidth = 1.2;
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(mx, f.top);
      c.lineTo(mx, H - f.bottom);
      c.stroke();
      c.setLineDash([]);
      for (const cv of curves) {
        if (!cv.markerValue) continue;
        const v = cv.markerValue(marker);
        if (!(v > 0) || !Number.isFinite(v)) continue;
        c.beginPath();
        c.arc(mx, Y(Math.log10(v)), 4, 0, Math.PI * 2);
        c.fillStyle = col(cv.color || 'ink');
        c.fill();
        c.strokeStyle = col('surface');
        c.lineWidth = 1.5;
        c.stroke();
      }
    }
    c.restore();
    // curve labels (outside the clip so they may sit on the frame edge)
    c.save();
    c.font = '11.5px system-ui, "Segoe UI", sans-serif';
    for (const cv of curves) {
      if (!cv.label || !cv.xs || !cv.xs.length) continue;
      let i = cv.labelAt === 'start' ? 0 : typeof cv.labelAt === 'number' ? cv.labelAt : cv.xs.length - 1;
      // walk inwards until a finite, in-range point is found
      const dir = i === 0 ? 1 : -1;
      while (i >= 0 && i < cv.xs.length && !(cv.ys[i] > 0 && Math.log10(cv.ys[i]) > yr[0] && Math.log10(cv.ys[i]) < yr[1])) i += dir;
      if (i < 0 || i >= cv.xs.length) continue;
      const px = X(Math.log10(cv.xs[i])) + (cv.labelOffset?.[0] ?? 0);
      const py = Y(Math.log10(cv.ys[i])) + (cv.labelOffset?.[1] ?? 0);
      c.textAlign = cv.labelAlign || 'right';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = withAlpha(col('surface'), 0.9);
      c.strokeText(cv.label, px, py);
      c.fillStyle = col(cv.labelColor || cv.color || 'ink');
      c.fillText(cv.label, px, py);
    }
    for (const nt of notes) {
      c.textAlign = nt.align || 'left';
      c.textBaseline = 'middle';
      const px = nt.px !== undefined ? nt.px : X(nt.x);
      const py = nt.py !== undefined ? nt.py : Y(nt.y);
      c.lineWidth = 3;
      c.strokeStyle = withAlpha(col('surface'), 0.9);
      c.strokeText(nt.text, px, py);
      c.fillStyle = col(nt.color || 'ink2');
      c.fillText(nt.text, px, py);
    }
    // y title
    if (opts.yLabel) {
      c.font = '12px system-ui, "Segoe UI", sans-serif';
      c.fillStyle = col('ink2');
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(opts.yLabel, f.left + 2, f.top - 13);
    }
    c.restore();
  }
  return {
    plot: p,
    frame,
    setCurves(cs) {
      curves = cs;
      p.invalidate();
    },
    setMarker(e) {
      marker = e;
      p.invalidate();
    },
    setNotes(ns) {
      notes = ns || [];
      p.invalidate();
    },
    setRange(r) {
      if (r.x) xr = r.x;
      if (r.y) yr = r.y;
      p.invalidate();
    },
    get range() {
      return { x: xr, y: yr };
    },
  };
}
