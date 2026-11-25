// Tab (c): the Lie algebra su(3) — Gell-Mann matrices, structure constants, Cartan–Weyl basis,
// and the eight gluons as the adjoint weight diagram (six roots + two Cartan generators).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { clamp, easeInOut, mulberry32 } from '../../core/la.js';
import { rational, texNum } from '../../core/format.js';
import { cmat } from '../../core/complex.js';
import * as M from './math.js';

const IDS = ['I+', 'I-', 'U+', 'U-', 'V+', 'V-', 'T3', 'T8'];
const CYCLE = [
  ['I+', 'U+'],
  ['U+', 'V-'],
  ['I+', 'I-'],
  ['T8', 'U+'],
  ['I+', 'V+'],
  ['V-', 'I+'],
  ['U-', 'U+'],
  ['T3', 'V-'],
];
const QUARK_COLOUR = ['r', 'g', 'b'];
const TILE_CAP = [
  '$T_1=\\tfrac12(I_++I_-)$',
  '$T_2=\\tfrac1{2i}(I_+-I_-)$',
  '$T_3$: Cartan, $=I_3$',
  '$T_4=\\tfrac12(V_++V_-)$',
  '$T_5=\\tfrac1{2i}(V_+-V_-)$',
  '$T_6=\\tfrac12(U_++U_-)$',
  '$T_7=\\tfrac1{2i}(U_+-U_-)$',
  '$T_8$: Cartan, $=\\tfrac{\\sqrt3}{2}Y$',
];
const TILE_ROOTS = [['I+', 'I-'], ['I+', 'I-'], ['T'], ['V+', 'V-'], ['V+', 'V-'], ['U+', 'U-'], ['U+', 'U-'], ['T']];
const LAMBDA_TEX = [
  '\\begin{pmatrix}0&1&0\\\\1&0&0\\\\0&0&0\\end{pmatrix}',
  '\\begin{pmatrix}0&-i&0\\\\i&0&0\\\\0&0&0\\end{pmatrix}',
  '\\begin{pmatrix}1&0&0\\\\0&-1&0\\\\0&0&0\\end{pmatrix}',
  '\\begin{pmatrix}0&0&1\\\\0&0&0\\\\1&0&0\\end{pmatrix}',
  '\\begin{pmatrix}0&0&-i\\\\0&0&0\\\\i&0&0\\end{pmatrix}',
  '\\begin{pmatrix}0&0&0\\\\0&0&1\\\\0&1&0\\end{pmatrix}',
  '\\begin{pmatrix}0&0&0\\\\0&0&-i\\\\0&i&0\\end{pmatrix}',
  '\\tfrac{1}{\\sqrt3}\\!\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&-2\\end{pmatrix}',
];

/** TeX for a real number that is a simple fraction, possibly times √3. */
function texReal(x) {
  if (Math.abs(x) < 1e-12) return '0';
  const r = rational(x, 12, 1e-9);
  if (r && r.exact) return r.q === 1 ? String(r.p) : `${r.p < 0 ? '-' : ''}\\tfrac{${Math.abs(r.p)}}{${r.q}}`;
  const s = rational(x / M.SQ3, 12, 1e-9);
  if (s && s.exact) {
    const sg = s.p < 0 ? '-' : '';
    const a = Math.abs(s.p);
    if (s.q === 1) return `${sg}${a === 1 ? '' : a}\\sqrt3`;
    return `${sg}\\tfrac{${a === 1 ? '' : a}\\sqrt3}{${s.q}}`;
  }
  const t = rational(x * M.SQ3, 12, 1e-9); // 1/√3 multiples
  if (t && t.exact) {
    const sg = t.p < 0 ? '-' : '';
    return `${sg}\\tfrac{${Math.abs(t.p)}}{${t.q === 1 ? '' : t.q}\\sqrt3}`;
  }
  return texNum(x, 3);
}
/** TeX for a complex coefficient. */
function texCoef(z) {
  const re = Math.abs(z.re) < 1e-12 ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-12 ? 0 : z.im;
  if (!im) return texReal(re);
  if (!re) {
    const s = texReal(im);
    return s === '1' ? 'i' : s === '-1' ? '-i' : s + 'i';
  }
  return `(${texReal(re)}${im < 0 ? '-' : '+'}${texReal(Math.abs(im))}i)`;
}
function texTerms(terms) {
  if (!terms.length) return '0';
  return terms
    .map((t, i) => {
      let c = texCoef(t.coef);
      const g = M.GEN_TEX[t.id];
      if (c === '1') c = '';
      else if (c === '-1') c = '-';
      const sign = i > 0 && !c.startsWith('-') ? '+' : '';
      return `${sign}${c}\\,${g}`;
    })
    .join('');
}
function texCMatrix(A) {
  return `\\begin{pmatrix}${A.map((r) => r.map((z) => texCoef(z)).join('&')).join('\\\\')}\\end{pmatrix}`;
}

export function mountAlgebra(pg, scope, ctx) {
  const S = (ctx.state.c ??= { x: 'I+', y: 'U+', playing: true, quarks: true, tile: -1 });
  let ready = false;
  let phase = S.playing ? 0 : 1; // animation phase of the current bracket (0 → 1)
  let cyc = Math.max(0, CYCLE.findIndex(([a, b]) => a === S.x && b === S.y));
  let hold = 0;
  let clickTurn = 0;

  // ------------------------------------------------------------ root diagram
  const v = pg.view({ title: 'Root diagram of $\\su(3)$ = the eight gluons', hint: 'click two generators to bracket them', height: 'min(62vh, 560px)' });
  const p = plot2d(v.body, scope, { x: [-1.75, 1.75], y: [-1.42, 1.42], grid: false, axes: false, pan: false, zoom: false, draw });

  const gens = IDS.map((id) => ({ id, pt: M.chargeOf(id) }));

  function draw(p) {
    if (!ready) return;
    // axes
    p.line(
      [
        [-1.6, 0],
        [1.6, 0],
      ],
      { color: 'axis', width: 1, alpha: 0.7 },
    );
    p.line(
      [
        [0, -1.3],
        [0, 1.3],
      ],
      { color: 'axis', width: 1, alpha: 0.7 },
    );
    p.tex('T_3', [1.6, 0], { key: 'ax3', offset: [4, -11], small: true, color: 'muted', align: 'left' });
    p.tex('T_8', [0, 1.3], { key: 'ax8', offset: [8, 2], small: true, color: 'muted', align: 'left' });
    // hexagon (Weyl orbit of the roots)
    const hex = M.outline(1, 1);
    p.polygon(hex, { fill: 'grp', alpha: 0.05, stroke: 'grp', width: 1.3, strokeAlpha: 0.6 });
    // quark triplet: roots are differences of quark weights
    if (S.quarks) {
      const tri = M.outline(1, 0);
      p.polygon(tri, { stroke: 'muted', width: 1, dash: [4, 4], strokeAlpha: 0.8 });
      [M.QUARKS.u, M.QUARKS.d, M.QUARKS.s].forEach((q, i) => {
        const pt = M.toPlane(q);
        p.dot(pt, { r: 4, fill: 'muted' });
        p.tex(`${QUARK_COLOUR[i]}\\,(${'uds'[i]})`, pt, { key: 'q' + i, offset: [0, i === 2 ? 14 : -13], small: true, color: 'muted' });
      });
      const r = M.ROOTS.find((x) => x.id === S.x);
      if (r && phase > 0.2) {
        const qs = [M.QUARKS.u, M.QUARKS.d, M.QUARKS.s].map(M.toPlane);
        const from = qs[r.ij[1]];
        const to = qs[r.ij[0]];
        const sh = 0.07;
        const d = [to[0] - from[0], to[1] - from[1]];
        p.arrow([from[0] + d[0] * sh, from[1] + d[1] * sh], [to[0] - d[0] * sh, to[1] - d[1] * sh], { color: 'alg', width: 1.3, dash: [4, 3], head: 7, alpha: 0.8 });
      }
    }
    // tile highlight
    if (S.tile >= 0) {
      for (const id of TILE_ROOTS[S.tile]) {
        const pt = id === 'T' ? [0, 0] : M.chargeOf(id);
        p.circle(pt, 15 / p.scale, { color: 'hi', width: 2.2 });
      }
    }
    // the eight generators
    for (const g of gens) {
      if (g.id === 'T8') continue;
      if (g.id === 'T3') {
        p.dot([0, 0], { r: 5.5, fill: 'alg' });
        p.circle([0, 0], 9.5 / p.scale, { color: 'alg', width: 1.6 });
        p.tex('T_3,\\,T_8', [0, 0], { key: 'gT', offset: [13, 14], small: true, color: 'alg', align: 'left' });
        continue;
      }
      const r = M.ROOTS.find((x) => x.id === g.id);
      p.dot(g.pt, { r: 6, fill: 'alg' });
      const out = [g.pt[0] * 1.27, g.pt[1] * 1.27];
      p.tex(r.tex, out, { key: 'g' + g.id, color: 'alg' });
      p.tex(r.colour, out, { key: 'gc' + g.id, offset: [0, 15], small: true, color: 'muted' });
    }
    drawBracket(p);
  }

  function drawBracket(p) {
    const X = S.x;
    const Y = S.y;
    const a = M.chargeOf(X);
    const b = M.chargeOf(Y);
    const s = [a[0] + b[0], a[1] + b[1]];
    const { terms } = M.bracket(X, Y);
    const e1 = easeInOut(clamp(phase / 0.35, 0, 1));
    const e2 = easeInOut(clamp((phase - 0.35) / 0.3, 0, 1));
    const e3 = easeInOut(clamp((phase - 0.65) / 0.3, 0, 1));
    const isCartan = (id) => id === 'T3' || id === 'T8';
    const pad = 9 / p.scale;
    const shorten = (A, B, r1 = pad, r2 = pad) => {
      const d = [B[0] - A[0], B[1] - A[1]];
      const L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return null;
      return [
        [A[0] + (d[0] / L) * r1, A[1] + (d[1] / L) * r1],
        [B[0] - (d[0] / L) * r2, B[1] - (d[1] / L) * r2],
      ];
    };
    // X: arrow from the origin to its charge
    if (!isCartan(X)) {
      const tip = [a[0] * e1, a[1] * e1];
      const seg = shorten([0, 0], tip, pad, 2 / p.scale);
      if (seg) p.arrow(seg[0], seg[1], { color: 'alg', width: 3, head: 11 });
    } else {
      p.circle([0, 0], 16 / p.scale, { color: 'alg', width: 2.5, alpha: e1 });
    }
    // Y: first from the origin, then translated to the tip of X
    if (!isCartan(Y)) {
      const o = isCartan(X) ? [0, 0] : [a[0] * e2, a[1] * e2];
      const seg = shorten(o, [o[0] + b[0], o[1] + b[1]], o[0] === 0 && o[1] === 0 ? pad : 3 / p.scale, pad * 0.8);
      if (seg && phase > 0.05) p.arrow(seg[0], seg[1], { color: 'alg', width: 2.2, head: 10, dash: [6, 4], alpha: 0.85 });
    }
    // result
    if (e3 <= 0) return;
    const resultIsRoot = M.ROOTS.some((r) => Math.hypot(M.chargeOf(r.id)[0] - s[0], M.chargeOf(r.id)[1] - s[1]) < 1e-9);
    const atZero = Math.hypot(s[0], s[1]) < 1e-9;
    if (!terms.length) {
      // the sum of charges is not a root (or two Cartans): the bracket vanishes
      if (!atZero) {
        const r = 7 / p.scale;
        p.line(
          [
            [s[0] - r, s[1] - r],
            [s[0] + r, s[1] + r],
          ],
          { color: 'brk', width: 2.5, alpha: e3 },
        );
        p.line(
          [
            [s[0] - r, s[1] + r],
            [s[0] + r, s[1] - r],
          ],
          { color: 'brk', width: 2.5, alpha: e3 },
        );
        p.tex('\\text{not a root}\\Rightarrow[X,Y]=0', s, { key: 'res', offset: [0, -18], small: true, color: 'brk' });
      } else p.tex('[T_3,T_8]=0', [0, 0], { key: 'res', offset: [0, -26], small: true, color: 'brk' });
      return;
    }
    if (atZero) {
      p.circle([0, 0], 21 / p.scale, { color: 'brk', width: 2.5, alpha: e3 });
      p.tex(`[X,Y]=${texTerms(terms)}`, [0, 0], { key: 'res', offset: [0, -32], small: true, color: 'brk' });
    } else if (resultIsRoot) {
      const seg = shorten([0, 0], [s[0] * e3, s[1] * e3], pad, 1 / p.scale);
      if (seg) p.arrow(seg[0], seg[1], { color: 'brk', width: 3, head: 11 });
      p.circle(s, 13 / p.scale, { color: 'brk', width: 2.2, alpha: e3 });
    }
  }

  // clicking generators
  p.on('click', (pos) => {
    let best = null;
    let bd = 22;
    for (const g of gens) {
      const d = Math.hypot(p.sx(g.pt[0]) - pos.px, p.sy(g.pt[1]) - pos.py);
      if (d < bd) {
        bd = d;
        best = g.id;
      }
    }
    if (!best) return;
    if (best === 'T3' && (S.x === 'T3' || S.y === 'T3') && clickTurn === 1) best = 'T8';
    if (clickTurn === 0) setPair(best, S.y);
    else setPair(S.x, best);
    clickTurn = 1 - clickTurn;
  });
  p.on('hover', (pos) => {
    const near = gens.some((g) => Math.hypot(p.sx(g.pt[0]) - pos.px, p.sy(g.pt[1]) - pos.py) < 22);
    p.canvas.style.cursor = near ? 'pointer' : '';
  });

  // ------------------------------------------------------------ Gell-Mann card (HTML)
  const card = ui.h('div', { class: 'view su3-card' });
  card.appendChild(ui.h('div', { class: 'view-title', html: 'Gell-Mann matrices $\\lambda_a$, generators $T_a=\\lambda_a/2$ — click one' }));
  const grid = ui.h('div', { class: 'gm-grid' });
  const tiles = LAMBDA_TEX.map((src, i) => {
    const b = ui.h('button', { type: 'button', class: 'gm-tile', html: `$\\lambda_${i + 1}=${src}$<span class="cap">${TILE_CAP[i]}</span>` });
    b.addEventListener('click', () => {
      S.tile = S.tile === i ? -1 : i;
      paintTiles();
      p.invalidate();
    });
    grid.appendChild(b);
    return b;
  });
  card.appendChild(grid);
  pg.stage.appendChild(card);
  function paintTiles() {
    tiles.forEach((t, i) => t.classList.toggle('on', i === S.tile));
  }
  paintTiles();

  // ------------------------------------------------------------ panel
  const secB = pg.section('Bracket $[X,Y]$');
  const opt = IDS.map((id) => ({ value: id, label: `$${M.GEN_TEX[id]}$` }));
  const segX = ui.segmented(secB, { label: '$X$', options: opt, value: S.x, onChange: (x) => setPair(x, S.y) });
  const segY = ui.segmented(secB, { label: '$Y$', options: opt, value: S.y, onChange: (y) => setPair(S.x, y) });
  const play = ui.playButton(secB, {
    playing: S.playing,
    labels: ['▶ Cycle brackets', '❚❚ Pause'],
    onToggle: (x) => {
      S.playing = x;
      hold = 0;
      if (!x) phase = 1;
      p.invalidate();
    },
  });
  ui.toggle(secB, { label: 'Quark (colour) triplet', value: S.quarks, onChange: (x) => ((S.quarks = x), p.invalidate()) });
  const brOut = ui.readout(secB, {});
  const chOut = ui.readout(secB, {});
  const matOut = ui.readout(secB, { label: 'As $3\\times3$ matrices on $(r,g,b)$' });
  ui.legend(secB, [
    { color: 'alg', label: 'generators (gluons) and their charges' },
    { color: 'brk', label: 'the bracket $[X,Y]$' },
    { color: 'grp', label: 'Weyl orbit (hexagon)' },
  ]);

  const secF = pg.section('Structure constants $[T_a,T_b]=i f_{abc}T_c$');
  const fgrid = ui.h('div', { class: 'fgrid' });
  for (const [a, b, c, val] of M.F_TABLE) fgrid.appendChild(ui.h('span', { html: `$f_{${a}${b}${c}}=${texReal(val)}$` }));
  secF.appendChild(fgrid);
  ui.note(secF, 'All other $f_{abc}$ vanish or follow by antisymmetry.');
  const checks = verify();
  ui.keyValue(secF, [
    ['$\\max|[T_a,T_b]-if_{abc}T_c|$', `${sci(checks.comm)} ✓`],
    ['$\\max|\\mathrm{tr}(T_aT_b)-\\tfrac12\\delta_{ab}|$', `${sci(checks.trace)} ✓`],
    ['$\\sum_a T_aT_a$', `$\\tfrac43\\,\\id$ ✓ (${sci(checks.cas)})`],
    ['Jacobi identity', `${sci(checks.jacobi)} ✓`],
  ]);

  const secT = pg.section('Try this');
  ui.experiments(secT, [
    {
      title: 'Charges add: $[I_+,U_+]=V_+$',
      text: 'By the Jacobi identity $[T_3,[X,Y]]=[[T_3,X],Y]+[X,[T_3,Y]]$, so a bracket carries the sum of the charges. $\\alpha_1+\\alpha_2$ is a root, and the bracket is exactly the ladder operator living there.',
      apply: () => setPair('I+', 'U+'),
    },
    {
      title: 'A ladder and its partner: $[I_+,I_-]=2T_3$',
      text: 'Opposite charges cancel, so the bracket lands at the origin, in the Cartan subalgebra: $E_{\\pm\\alpha}$ and $[E_\\alpha,E_{-\\alpha}]$ form an $\\su(2)$ — isospin here, U- and V-spin for the other pairs.',
      apply: () => setPair('I+', 'I-'),
    },
    {
      title: 'Measuring a charge: $[T_8,U_+]$',
      text: '$[T_8,E_\\alpha]=\\alpha_8E_\\alpha$: a Cartan generator does not move $E_\\alpha$, it reads off its charge. $U_+$ has $\\alpha_8=\\tfrac{\\sqrt3}{2}$, i.e. hypercharge $Y=1$.',
      apply: () => setPair('T8', 'U+'),
    },
    {
      title: 'Forbidden: $[I_+,V_+]=0$',
      text: '$2\\alpha_1+\\alpha_2$ would carry $I_3=\\tfrac32$, $Y=1$ — no generator has that charge, so the bracket must vanish. Charge conservation alone fixes most of the algebra.',
      apply: () => setPair('I+', 'V+'),
    },
    {
      title: 'A gluon changes colour',
      text: 'With the triplet shown, $E_{I_+}=E_{12}$ maps $\\ket g\\to\\ket r$: the gluon $r\\bar g$ carries colour charge $r-g$, exactly its root. In QCD vertices colour is conserved because the bracket conserves charge.',
      apply: () => {
        S.quarks = true;
        setPair('I+', 'U+');
      },
    },
    {
      title: 'Two neutral gluons, not three',
      text: '$\\lambda_3$ and $\\lambda_8$ sit at the origin: $\\tfrac1{\\sqrt2}(r\\bar r-g\\bar g)$ and $\\tfrac1{\\sqrt6}(r\\bar r+g\\bar g-2b\\bar b)$. The fully neutral $\\tfrac1{\\sqrt3}(r\\bar r+g\\bar g+b\\bar b)$ is the identity — a U(1), not in SU(3) — so there are 8 gluons, not 9.',
      apply: () => {
        S.tile = 7;
        paintTiles();
        setPair('T3', 'T8');
      },
    },
  ]);

  notes(pg);

  // ------------------------------------------------------------ logic
  function setPair(x, y, fromCycle = false) {
    S.x = x;
    S.y = y;
    segX.set(x, { silent: true });
    segY.set(y, { silent: true });
    if (!fromCycle) {
      play.set(false);
      phase = 1;
    } else phase = 0;
    refresh();
  }

  function refresh() {
    const { M: Mx, terms } = M.bracket(S.x, S.y);
    const X = M.GEN_TEX[S.x];
    const Y = M.GEN_TEX[S.y];
    brOut.set(`[${X},${Y}]=\\brk{${texTerms(terms)}}`);
    const a = M.chargeOf(S.x);
    const b = M.chargeOf(S.y);
    const fmtPt = (q) => `(${texReal(q[0])},\\,${texReal((q[1] * 2) / M.SQ3)})`;
    const sum = [a[0] + b[0], a[1] + b[1]];
    chOut.set(`(I_3,Y):\\;${fmtPt(a)}+${fmtPt(b)}=${fmtPt(sum)}`);
    matOut.set(`${texCMatrix(M.generator(S.x))}\\,,\\;${texCMatrix(M.generator(S.y))}\\;\\to\\;\\brk{${texCMatrix(Mx)}}`);
    p.invalidate();
  }

  scope.frame((dt) => {
    if (!play.playing) return;
    if (phase < 1) {
      phase = Math.min(1, phase + dt / 1.6);
      p.invalidate();
      return;
    }
    hold += dt;
    if (hold > 1.7) {
      hold = 0;
      cyc = (cyc + 1) % CYCLE.length;
      setPair(CYCLE[cyc][0], CYCLE[cyc][1], true);
    }
  });

  ready = true;
  refresh();
}

function sci(x) {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(x));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(1)}×10<sup>${e}</sup>`.replace('-', '−');
}

/** Live numerical verification of the defining relations (shown in the panel). */
function verify() {
  let comm = 0;
  let trace = 0;
  for (let a = 0; a < 8; a++)
    for (let b = 0; b < 8; b++) {
      let rhs = cmat.zeros(3);
      for (let c = 0; c < 8; c++) if (M.F[a][b][c]) rhs = cmat.add(rhs, cmat.scale(M.TGEN[c], { re: 0, im: M.F[a][b][c] }));
      comm = Math.max(comm, cmat.maxAbs(cmat.sub(cmat.comm(M.TGEN[a], M.TGEN[b]), rhs)));
      const t = cmat.trace(cmat.mul(M.TGEN[a], M.TGEN[b]));
      trace = Math.max(trace, Math.hypot(t.re - (a === b ? 0.5 : 0), t.im));
    }
  let C = cmat.zeros(3);
  for (const T of M.TGEN) C = cmat.add(C, cmat.mul(T, T));
  const cas = cmat.maxAbs(cmat.sub(C, cmat.scale(cmat.eye(3), 4 / 3)));
  const rng = mulberry32(3);
  const mk = () => M.TGEN.reduce((A, T) => cmat.add(A, cmat.scale(T, rng() * 2 - 1)), cmat.zeros(3));
  let jacobi = 0;
  for (let i = 0; i < 10; i++) {
    const X = mk();
    const Y = mk();
    const Z = mk();
    const J = cmat.add(cmat.add(cmat.comm(X, cmat.comm(Y, Z)), cmat.comm(Y, cmat.comm(Z, X))), cmat.comm(Z, cmat.comm(X, Y)));
    jacobi = Math.max(jacobi, cmat.maxAbs(J));
  }
  return { comm: comm || 1e-17, trace: trace || 1e-17, cas: cas || 1e-17, jacobi: jacobi || 1e-17 };
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>The adjoint representation: the eight generators placed at their own charges under $(T_3,T_8)$, i.e. at the eigenvalues of
  $\\ad_{T_3}$ and $\\ad_{T_8}$. Six ladder operators $E_\\alpha$ sit on a hexagon at the <b>roots</b> $\\alpha$; the two Cartan generators sit at the
  origin. This is the octet weight diagram — the gluons of QCD, or the $\\pi,K,\\eta$ octet of flavour.</p>
  <p>Brackets are drawn as vector addition: $[E_\\alpha,E_\\beta]$ lives at $\\alpha+\\beta$. If that is a root the bracket is (a multiple of)
  $E_{\\alpha+\\beta}$; if it is zero the bracket is in the Cartan subalgebra; otherwise it vanishes.</p>`);
  pg.note(`<h2>The physics: gluons</h2>
  <p>Colour SU(3) is gauged, so there is one gauge field per generator: $A_\\mu=A_\\mu^aT_a$, eight gluons. A quark of colour $j$ absorbs or
  emits a gluon $E_{ij}$ and comes out with colour $i$; the gluon’s colour charge is the root $w_i-w_j$, a difference of quark weights. Since
  the gluons themselves are charged (the roots are non-zero), they couple to each other — the $f_{abc}$ in
  $G^a_{\\mu\\nu}=\\partial_\\mu A^a_\\nu-\\partial_\\nu A^a_\\mu+g f_{abc}A^b_\\mu A^c_\\nu$ — unlike the neutral photon of U(1).</p>
  <div class="callout physics"><span class="callout-title">Why 8, not 9</span>$U(3)=SU(3)\\times U(1)$ (up to a finite quotient) would add the generator $\\propto\\id$,
  a ninth, completely colour-neutral “gluon” that would mediate a long-range force between colour singlets. It is not seen: the gauge group is $SU(3)$.</div>`);
  pg.note(`<h2>The mathematics</h2>
  <p>With $T_a=\\lambda_a/2$: $\\;\\mathrm{tr}(T_aT_b)=\\tfrac12\\delta_{ab}$, $[T_a,T_b]=if_{abc}T_c$ with $f_{abc}$ totally antisymmetric,
  $\\{T_a,T_b\\}=\\tfrac13\\delta_{ab}\\id+d_{abc}T_c$, and $\\sum_a T_aT_a=\\tfrac43\\id$ in the triplet. The non-zero structure constants are</p>
  <table><thead><tr><th>$abc$</th><th>123</th><th>147</th><th>156</th><th>246</th><th>257</th><th>345</th><th>367</th><th>458</th><th>678</th></tr></thead>
  <tbody><tr><td>$f_{abc}$</td><td>1</td><td>½</td><td>−½</td><td>½</td><td>½</td><td>½</td><td>−½</td><td>$\\tfrac{\\sqrt3}2$</td><td>$\\tfrac{\\sqrt3}2$</td></tr></tbody></table>
  <p>The <b>Cartan–Weyl basis</b> trades $T_{1,2}$, $T_{4,5}$, $T_{6,7}$ for $I_\\pm=T_1\\pm iT_2$, $V_\\pm=T_4\\pm iT_5$, $U_\\pm=T_6\\pm iT_7$ — the matrix
  units $E_{ij}$. In this basis $[H,E_\\alpha]=\\alpha(H)E_\\alpha$ for every $H$ in the Cartan subalgebra, and the whole algebra is encoded in the root diagram.
  Hypercharge is $Y=\\tfrac2{\\sqrt3}T_8=\\diag(\\tfrac13,\\tfrac13,-\\tfrac23)$ and the electric charge of quarks is $Q=T_3+\\tfrac12Y=\\diag(\\tfrac23,-\\tfrac13,-\\tfrac13)$.</p>`);
  pg.note(`<h2>Going further</h2>
  <ul>
  <li>The anti-Hermitian convention $X_a=-iT_a$ gives $[X_a,X_b]=f_{abc}X_c$ (real structure constants); $e^{-i\\theta^aT_a}=e^{\\theta^aX_a}$.</li>
  <li>Every simple Lie algebra has such a root diagram; their rigidity yields the complete list $A_n,B_n,C_n,D_n,E_{6,7,8},F_4,G_2$: <a href="#/roots">roots &amp; classification</a>.</li>
  <li>The three $\\su(2)$ subalgebras (I, U, V) are the three ways of embedding spin in SU(3); compare <a href="#/su2">SU(2)</a> and <a href="#/reps">spin multiplets</a>.</li>
  </ul>`);
}
