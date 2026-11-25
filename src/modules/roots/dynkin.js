// Dynkin diagrams as SVG strings (no DOM, theme-aware via CSS variables).
// Conventions: Bourbaki numbering; a multiple bond carries a chevron pointing towards the SHORTER root;
// short-root nodes are drawn filled.

import { dynkin } from './math.js';

/**
 * dynkinSVG(type, n, opts) → '<svg …>'.
 * opts: { spacing (30), r (5.5), labels (true) | array, ellipsis (false: draw the generic family with "…"),
 *         nodeColor(i) → CSS colour, stroke ('var(--ink-2)'), title }
 */
export function dynkinSVG(type, n, opts = {}) {
  const sp = opts.spacing ?? 30;
  const r = opts.r ?? 5.5;
  const stroke = opts.stroke ?? 'var(--ink-2)';
  const { pos, bonds, short, labels, dashed } = layout(type, n, !!opts.ellipsis);
  const pad = 12;
  const xs = pos.map((p) => p[0] * sp);
  const ys = pos.map((p) => p[1] * sp);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const W = Math.max(...xs) - Math.min(...xs) + 2 * pad;
  const showLabels = opts.labels !== false;
  const H = Math.max(...ys) - Math.min(...ys) + 2 * pad + (showLabels ? 11 : 0);
  const P = (i) => [pos[i][0] * sp - x0, pos[i][1] * sp - y0];
  let s = '';
  for (const [i, j, m] of bonds) {
    const [ax, ay] = P(i);
    const [bx, by] = P(j);
    const L = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / L;
    const uy = (by - ay) / L;
    const vx = -uy;
    const vy = ux;
    const offs = m === 1 ? [0] : m === 2 ? [-2.3, 2.3] : [-3.2, 0, 3.2];
    const isDashed = dashed.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
    for (const o of offs)
      s += `<line x1="${f(ax + ux * r + vx * o)}" y1="${f(ay + uy * r + vy * o)}" x2="${f(bx - ux * r + vx * o)}" y2="${f(by - uy * r + vy * o)}" stroke="${stroke}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="2 3"' : ''}/>`;
    if (m > 1) {
      // chevron from the long root i towards the short root j
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const d = 4.2;
      const w = m === 2 ? 5.2 : 6.4;
      s += `<polyline points="${f(mx - ux * d + vx * w)},${f(my - uy * d + vy * w)} ${f(mx + ux * d)},${f(my + uy * d)} ${f(mx - ux * d - vx * w)},${f(my - uy * d - vy * w)}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
  }
  pos.forEach((_, i) => {
    const [x, y] = P(i);
    const col = opts.nodeColor ? opts.nodeColor(i) : null;
    const fill = short[i] ? col || stroke : 'var(--surface)';
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" stroke="${col || stroke}" stroke-width="1.6"/>`;
    if (showLabels) {
      const lab = Array.isArray(opts.labels) ? opts.labels[i] : labels[i];
      s += `<text x="${f(x)}" y="${f(y + r + 10.5)}" text-anchor="middle" font-size="9.5" fill="var(--muted)" font-family="var(--font)">${lab}</text>`;
    }
  });
  const title = opts.title ? `<title>${opts.title}</title>` : '';
  return `<svg class="dynkin" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}" role="img" aria-label="Dynkin diagram ${type}${n}">${title}${s}</svg>`;
}

const f = (x) => (Math.round(x * 10) / 10).toString();

/** Node positions (grid units), bonds [i, j, m] with i the longer root, short flags, labels, dashed bonds. */
function layout(type, n, ellipsis) {
  if (ellipsis && ['A', 'B', 'C', 'D'].includes(type)) return familyLayout(type);
  const dk = dynkin(type, n);
  const short = dk.lengths.map((l) => l < 1.5);
  let pos;
  if (type === 'D') {
    pos = [];
    for (let i = 0; i < n - 2; i++) pos.push([i, 0]);
    pos.push([n - 3 + 0.87, -0.55], [n - 3 + 0.87, 0.55]);
  } else if (type === 'E') {
    // 1–3–4–5–6–7–8 in a row, 2 hanging below 4
    const order = [0, 2, 3, 4, 5, 6, 7].filter((i) => i < n);
    pos = new Array(n);
    order.forEach((node, k) => (pos[node] = [k, 0]));
    pos[1] = [2, 1];
  } else pos = Array.from({ length: n }, (_, i) => [i, 0]);
  return { pos, bonds: dk.bonds, short, labels: Array.from({ length: n }, (_, i) => String(i + 1)), dashed: [] };
}

/** Generic member of a classical family: 1 – 2 ⋯ n−1 – n (with the family's special end). */
function familyLayout(type) {
  if (type === 'D') {
    return {
      pos: [
        [0, 0],
        [1, 0],
        [2.2, 0],
        [3.07, -0.55],
        [3.07, 0.55],
      ],
      bonds: [
        [0, 1, 1],
        [1, 2, 1],
        [2, 3, 1],
        [2, 4, 1],
      ],
      short: [false, false, false, false, false],
      labels: ['1', '2', 'n−2', 'n−1', 'n'],
      dashed: [[1, 2]],
    };
  }
  const pos = [
    [0, 0],
    [1, 0],
    [2.2, 0],
    [3.2, 0],
  ];
  const bonds = [
    [0, 1, 1],
    [1, 2, 1],
  ];
  let short = [false, false, false, false];
  if (type === 'A') bonds.push([2, 3, 1]);
  if (type === 'B') {
    bonds.push([2, 3, 2]);
    short = [false, false, false, true];
  }
  if (type === 'C') {
    bonds.push([3, 2, 2]);
    short = [true, true, true, false];
  }
  return { pos, bonds, short, labels: ['1', '2', 'n−1', 'n'], dashed: [[1, 2]] };
}
