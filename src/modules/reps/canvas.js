// Small pixel-space drawing helpers for the reps module's plot2d canvases. The plots are created
// with a [0,1]×[0,1] world (equal: false, no pan/zoom) so world ↔ CSS px is a plain scaling;
// layout is done in CSS pixels and KaTeX labels are placed via px().

/** plot2d options for a pixel-layout canvas. */
export const PIXEL_PLOT = { x: [0, 1], y: [0, 1], equal: false, pan: false, zoom: false, grid: false, axes: false };

/** World point for a CSS-pixel position (p = plot2d api). */
export const px = (p, x, y) => [x / p.width, 1 - y / p.height];

/** Quadratic Bézier from (x0,y0) via (cx,cy) to (x1,y1) with an arrowhead at the end. */
export function qArrow(g, x0, y0, cx, cy, x1, y1, st = {}) {
  const w = st.width ?? 1.5;
  g.save();
  g.globalAlpha = st.alpha ?? 1;
  g.strokeStyle = st.color;
  g.fillStyle = st.color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.setLineDash(st.dash || []);
  // stop the stroke short of the tip so the head stays sharp
  const tx = x1 - cx;
  const ty = y1 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = st.head ?? Math.max(6, 3 + w * 2.2);
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy, x1 - ux * head * 0.7, y1 - uy * head * 0.7);
  g.stroke();
  g.setLineDash([]);
  if (st.noHead !== true) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
    g.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Point on a quadratic Bézier at parameter t. */
export function qPoint(x0, y0, cx, cy, x1, y1, t) {
  const a = (1 - t) * (1 - t);
  const b = 2 * t * (1 - t);
  const c = t * t;
  return [a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1];
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Filled circle (optionally stroked). */
export function disc(g, x, y, r, fill, st = {}) {
  if (!(r > 0)) return;
  g.save();
  g.globalAlpha = st.alpha ?? 1;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (st.stroke) {
    g.lineWidth = st.width ?? 1.5;
    g.strokeStyle = st.stroke;
    g.setLineDash(st.dash || []);
    g.stroke();
  }
  g.restore();
}

/** Phase dial: a small circle with a hand at angle φ (counter-clockwise from +x), scaled by mag ∈ [0,1]. */
export function dial(g, x, y, r, phase, mag, st = {}) {
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = st.ring;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  if (mag > 0.02) {
    g.globalAlpha = 1;
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    g.strokeStyle = st.hand;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + r * Math.cos(phase), y - r * Math.sin(phase));
    g.stroke();
  }
  g.restore();
}

/** Canvas text in CSS px. st: {color, size, weight, align, baseline, alpha, font} */
export function text(g, s, x, y, st = {}) {
  g.save();
  g.globalAlpha = st.alpha ?? 1;
  g.font = `${st.weight || 400} ${st.size || 12}px ${st.font || 'system-ui, "Segoe UI", sans-serif'}`;
  g.fillStyle = st.color;
  g.textAlign = st.align || 'left';
  g.textBaseline = st.baseline || 'middle';
  g.fillText(String(s), x, y);
  g.restore();
}

/** Straight line segment in px. */
export function seg(g, x0, y0, x1, y1, st = {}) {
  g.save();
  g.globalAlpha = st.alpha ?? 1;
  g.strokeStyle = st.color;
  g.lineWidth = st.width ?? 1;
  g.lineCap = st.cap || 'round';
  g.setLineDash(st.dash || []);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.restore();
}
