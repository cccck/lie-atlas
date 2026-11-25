// Programmatic Dynkin diagrams as SVG strings (theme-aware via CSS variables).
// Bonds are [i, j, m] with i the longer root when m > 1; the chevron points to the shorter root.

export function layoutFor(type, n) {
  const pos = [];
  if (type === 'D' && n >= 4) {
    for (let i = 0; i <= n - 3; i++) pos[i] = [i, 0];
    pos[n - 2] = [n - 3 + 0.8, -0.62];
    pos[n - 1] = [n - 3 + 0.8, 0.62];
  } else if (type === 'E') {
    const chain = [0, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => i < n);
    chain.forEach((i, k) => (pos[i] = [k, 0]));
    if (n > 1) pos[1] = [2, -1];
  } else if (type === 'A1xA1') {
    pos[0] = [0, 0];
    pos[1] = [1.4, 0];
  } else for (let i = 0; i < n; i++) pos[i] = [i, 0];
  return pos;
}

/**
 * d: { type, n, bonds, lengths }. o: { unit, r, faded(i) → bool, dashedBond (index), labels (true), long: colour, short: colour }
 */
export function dynkinSVG(d, o = {}) {
  const u = o.unit ?? 30;
  const r = o.r ?? 6.5;
  const pad = o.pad ?? 12;
  const pos = o.pos || layoutFor(d.type, d.n);
  const faded = o.faded || (() => false);
  const idx = [...Array(d.n).keys()].filter((i) => pos[i]);
  const xs = idx.map((i) => pos[i][0]);
  const ys = idx.map((i) => pos[i][1]);
  const minx = Math.min(...xs);
  const miny = Math.min(...ys);
  const W = Math.round((Math.max(...xs) - minx) * u + 2 * pad);
  const H = Math.round((Math.max(...ys) - miny) * u + 2 * pad + (o.labels === false ? 0 : 10));
  const P = (i) => [pad + (pos[i][0] - minx) * u, pad + (pos[i][1] - miny) * u];
  const longC = o.long || 'var(--alg)';
  const shortC = o.short || 'var(--c3)';
  let s = `<svg class="dynkin" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="Dynkin diagram">`;
  d.bonds.forEach(([i, j, m], bi) => {
    if (!pos[i] || !pos[j]) return;
    const [x1, y1] = P(i);
    const [x2, y2] = P(j);
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / L;
    const dy = (y2 - y1) / L;
    const nx = -dy;
    const ny = dx;
    const op = faded(i) || faded(j) ? 0.22 : 1;
    const dash = o.dashedBond === bi ? ' stroke-dasharray="2 3"' : '';
    const offs = m === 1 ? [0] : m === 2 ? [-2.4, 2.4] : [-3.2, 0, 3.2];
    for (const k of offs)
      s += `<line x1="${(x1 + nx * k + dx * r).toFixed(1)}" y1="${(y1 + ny * k + dy * r).toFixed(1)}" x2="${(x2 + nx * k - dx * r).toFixed(1)}" y2="${(y2 + ny * k - dy * r).toFixed(1)}" stroke="var(--ink-2)" stroke-width="1.4" opacity="${op}"${dash}/>`;
    if (m > 1) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const tip = [mx + dx * 4.5, my + dy * 4.5];
      const w1 = [mx - dx * 3.5 + nx * 6.5, my - dy * 3.5 + ny * 6.5];
      const w2 = [mx - dx * 3.5 - nx * 6.5, my - dy * 3.5 - ny * 6.5];
      s += `<path d="M${w1[0].toFixed(1)} ${w1[1].toFixed(1)} L${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${w2[0].toFixed(1)} ${w2[1].toFixed(1)}" fill="none" stroke="var(--ink-2)" stroke-width="1.4" opacity="${op}"/>`;
    }
  });
  for (const i of idx) {
    const [x, y] = P(i);
    const short = d.lengths && d.lengths[i] < 1.99;
    const op = faded(i) ? 0.25 : 1;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="var(--surface)" stroke="${short ? shortC : longC}" stroke-width="2" opacity="${op}"/>`;
    if (short) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${shortC}" opacity="${op}"/>`;
    if (o.labels !== false)
      s += `<text x="${x.toFixed(1)}" y="${(y + r + 11).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--muted)" opacity="${op}">${i + 1}</text>`;
  }
  return s + '</svg>';
}

/** Bonds of the E_n chain in Bourbaki numbering (n = 3 … 10): 1–3–4–…–n with 2 attached to 4. */
export function eBonds(n) {
  const b = [];
  if (n >= 3) b.push([0, 2, 1]);
  if (n >= 4) b.push([2, 3, 1], [1, 3, 1]);
  for (let i = 3; i < n - 1; i++) b.push([i, i + 1, 1]);
  return b;
}
