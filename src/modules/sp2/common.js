// Shared UI helpers for the sp2 module (type colours, small formatting helpers, split views).
import * as ui from '../../core/ui.js';
import { texNum } from '../../core/format.js';

/** Colour role per stability type (same in canvases, 3D and badges). */
export const TYPE_COLOR = { elliptic: 'c3', parabolic: 'hi', hyperbolic: 'c8', zero: 'muted' };
export const TYPE_BADGE = { elliptic: 'good', parabolic: 'warn', hyperbolic: 'bad', zero: '' };
export const TYPE_LABEL = {
  elliptic: 'elliptic · stable',
  parabolic: 'parabolic · marginal',
  hyperbolic: 'hyperbolic · unstable',
  zero: 'H = 0',
};

/** TeX for H = ½(a p² + 2b qp + c q²) with numbers, dropping zero terms. */
export function texHamiltonian(h, d = 2) {
  const terms = [];
  const add = (coef, sym) => {
    if (Math.abs(coef) < 0.5 * Math.pow(10, -d)) return;
    const s = texNum(Math.abs(coef), d);
    const c = s === texNum(1, d) ? '' : s + '\\,';
    terms.push({ neg: coef < 0, t: c + sym });
  };
  add(h.a, 'p^2');
  add(2 * h.b, 'qp');
  add(h.c, 'q^2');
  if (!terms.length) return 'H = 0';
  const body = terms.map((x, i) => (i === 0 ? (x.neg ? '-' : '') + x.t : (x.neg ? ' - ' : ' + ') + x.t)).join('');
  return `H = \\tfrac12\\left(${body}\\right)`;
}

/**
 * Split a view body into stacked or side-by-side panes. Returns the pane elements (position: relative).
 * sizes: array of flex weights.
 */
export function splitPanes(body, sizes, dir = 'column') {
  body.style.display = 'flex';
  body.style.flexDirection = dir;
  return sizes.map((w) => {
    const el = ui.h('div', { style: { position: 'relative', flex: `${w} 1 0`, minHeight: '0', minWidth: '0' } });
    body.appendChild(el);
    return el;
  });
}

/**
 * Place a perspective camera of a scene3d kit along `dir` (from `target`) at the distance where a sphere of
 * `radius` fits both the horizontal and the vertical field of view.
 */
export function fitCamera(k, radius, dir, target = [0, 0, 0]) {
  const { width, height } = k.size;
  const vfov = (k.camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (width / Math.max(1, height)));
  const D = radius / Math.sin(Math.min(vfov, hfov) / 2);
  const n = Math.hypot(...dir) || 1;
  k.setCamera(
    dir.map((c, i) => target[i] + (c / n) * D),
    target,
  );
}

/** Axis labels that stay clear of the view-title chip (top-left) and the hint (bottom-right). */
export function axisLabels(p, xLab, yLab) {
  const X0 = p.sx(0);
  const Y0 = p.sy(0);
  if (Y0 > 30 && Y0 < p.height - 24) p.tex(xLab, [p.wx(p.width - 12), 0], { key: '__xl', align: 'right', offset: [0, -11], small: true });
  if (X0 > 0 && X0 < p.width - 20) p.tex(yLab, [0, p.wy(52)], { key: '__yl', align: 'left', offset: [7, 0], small: true });
}

/** A throttle gate: returns true at most every `ms` milliseconds (or when forced). */
export function throttle(ms) {
  let last = -Infinity;
  return (force = false) => {
    const now = performance.now();
    if (force || now - last >= ms) {
      last = now;
      return true;
    }
    return false;
  };
}
