// Tab (d): classification (Dynkin diagrams), the E-series down to the Standard Model, and the 24 gauge bosons of SU(5).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { mat } from '../../core/la.js';
import * as R from './math.js';
import { dynkinSVG, eBonds, layoutFor } from './dynkin-svg.js';

const FAMILIES = [
  { d: { type: 'A', n: 5 }, name: 'A_n', group: 'SU(n+1)', dim: 'n(n+2)', dashed: 2, phys: 'SU(2) spin & weak isospin, SU(3) colour, SU(5) GUT' },
  { d: { type: 'B', n: 4 }, name: 'B_n', group: 'SO(2n+1)', dim: 'n(2n+1)', dashed: 1, phys: 'SO(3) rotations, SO(5) de Sitter, Spin(9) in M-theory' },
  { d: { type: 'C', n: 4 }, name: 'C_n', group: 'Sp(n)', dim: 'n(2n+1)', dashed: 1, phys: 'real form Sp(2n,ℝ): canonical transformations' },
  { d: { type: 'D', n: 5 }, name: 'D_n', group: 'SO(2n)', dim: 'n(2n-1)', dashed: 1, phys: 'SO(4) = SU(2)×SU(2), SO(10) GUT, SO(32) string; SO(3,1) is a real form of D₂' },
  { d: { type: 'E', n: 6 }, name: 'E_6', group: 'E_6', dim: '78', phys: 'GUT group, 27 = 16 + 10 + 1' },
  { d: { type: 'E', n: 7 }, name: 'E_7', group: 'E_7', dim: '133', phys: 'U-duality of N = 8 supergravity' },
  { d: { type: 'E', n: 8 }, name: 'E_8', group: 'E_8', dim: '248', phys: 'E₈ × E₈ heterotic string' },
  { d: { type: 'F', n: 4 }, name: 'F_4', group: 'F_4', dim: '52', phys: 'exceptional Jordan algebra' },
  { d: { type: 'G', n: 2 }, name: 'G_2', group: 'G_2', dim: '14', phys: 'octonions; G₂-holonomy 7-manifolds' },
];

const LADDER = {
  3: { g: 'SU(3)\\times SU(2)', dim: 11, txt: 'The Standard Model’s non-abelian part. The deleted nodes leave a $U(1)$: hypercharge. $8+3+1=12$ gauge bosons.' },
  4: { g: 'SU(5)', dim: 24, txt: 'Georgi–Glashow: $\\mathbf{24}=(\\mathbf 8,\\mathbf 1)\\oplus(\\mathbf 1,\\mathbf 3)\\oplus(\\mathbf 1,\\mathbf 1)\\oplus(\\mathbf 3,\\mathbf 2)\\oplus(\\overline{\\mathbf 3},\\mathbf 2)$ — 12 new X, Y bosons mediate proton decay.' },
  5: { g: 'SO(10)', dim: 45, txt: '$E_5=D_5$. One whole generation, with a right-handed neutrino, fits in the spinor $\\mathbf{16}$.' },
  6: { g: 'E_6', dim: 78, txt: 'The $\\mathbf{27}$ contains $\\mathbf{16}\\oplus\\mathbf{10}\\oplus\\mathbf 1$ of $SO(10)$; natural in Calabi–Yau compactifications.' },
  7: { g: 'E_7', dim: 133, txt: 'Has a pseudoreal $\\mathbf{56}$; $E_{7(7)}$ is the duality group of maximal supergravity in 4D.' },
  8: { g: 'E_8', dim: 248, txt: 'The end of the finite list: the adjoint is the smallest representation. $E_8\\times E_8$ heterotic string.' },
  9: { g: '\\text{(affine } \\tilde E_8)', dim: Infinity, txt: '$\\det A=0$: the Gram matrix is only positive semi-definite. Infinite-dimensional affine (loop) algebra — current algebras of 2D conformal field theory.' },
  10: { g: '\\text{(hyperbolic } E_{10})', dim: Infinity, txt: '$\\det A<0$: indefinite. A Kac–Moody algebra conjectured to underlie 11D supergravity near a spacelike singularity.' },
};

export function mountClassify(pg, scope, ctx) {
  const S = (ctx.state.cls ??= { n: 4, playing: true, labels: true });
  let ready = false;

  // ------------------------------------------------------------ SU(5) roots, linear map e_i → P_i
  const v = pg.view({ title: 'The 24 gauge bosons of $SU(5)$: roots $e_i-e_j$, colour indices $1,2,3$ and weak indices $4,5$', hint: 'a linear projection of the 20 roots; 4 Cartan generators at the centre' });
  const ang = [90, 210, 330].map((a) => (a * Math.PI) / 180);
  const P = [...ang.map((a) => [-0.95 + 0.55 * Math.cos(a), 0.55 * Math.sin(a)]), [0.95, 0.47], [0.95, -0.47]];
  const roots = R.su5Roots().map((r) => ({ ...r, pt: [P[r.i][0] - P[r.j][0], P[r.i][1] - P[r.j][1]] }));
  const COL = { gluon: 'c3', W: 'c1', XY: 'c8' };
  const p = plot2d(v.body, scope, { x: [-2.6, 2.6], y: [-1.45, 1.45], grid: false, axes: false, pan: false, zoom: false, draw });
  function draw(p) {
    if (!ready) return;
    // hexagon of colour roots and the two clusters
    p.polygon(
      roots.filter((r) => r.type === 'gluon').map((r) => r.pt).sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])),
      { fill: 'c3', alpha: 0.05, stroke: 'c3', width: 1, strokeAlpha: 0.4 },
    );
    for (const r of roots) {
      p.arrow([0, 0], r.pt, { color: COL[r.type], width: r.type === 'XY' ? 1.4 : 2, head: 8, alpha: r.type === 'XY' ? 0.6 : 0.9 });
      p.dot(r.pt, { r: 4.5, fill: COL[r.type] });
    }
    p.circle([0, 0], 10 / p.scale, { color: 'alg', width: 2 });
    p.dot([0, 0], { r: 4, fill: 'alg' });
    if (S.labels) {
      p.tex('\\text{4 Cartan: } T_3^c,T_8^c,T_3^w,Y', [0, 0], { key: 'cart', offset: [0, 34], small: true, color: 'alg' });
      p.tex('W^+', [0, 0.94], { key: 'wp', offset: [16, -4], color: 'c1' });
      p.tex('W^-', [0, -0.94], { key: 'wm', offset: [16, 4], color: 'c1' });
      p.tex('\\text{gluons }(\\mathbf 8,\\mathbf 1)_0', [0.95, 0], { key: 'gl', offset: [6, -26], small: true, color: 'c3', align: 'left' });
      p.tex('X^{-4/3},\\,Y^{-1/3}:\\;(\\mathbf 3,\\overline{\\mathbf 2})_{-5/6}', [-1.9, 0], { key: 'xy1', offset: [0, -58], small: true, color: 'c8' });
      p.tex('X^{+4/3},\\,Y^{+1/3}:\\;(\\overline{\\mathbf 3},\\mathbf 2)_{+5/6}', [1.9, 0], { key: 'xy2', offset: [0, -58], small: true, color: 'c8' });
      p.tex('E_{ij}:\\ \\text{weak index }j\\to\\text{colour }i', [-1.9, 0], { key: 'xy3', offset: [0, 56], small: true, color: 'muted' });
      p.tex('E_{ij}:\\ \\text{colour }j\\to\\text{weak index }i', [1.9, 0], { key: 'xy4', offset: [0, 56], small: true, color: 'muted' });
    }
  }

  // ------------------------------------------------------------ E-series card
  const card = ui.h('div', { class: 'view roots-card' });
  card.appendChild(ui.h('div', { class: 'view-title', html: 'The $E_n$ series: delete nodes from $E_8$ and arrive at the Standard Model' }));
  const ladderSvg = ui.h('div', { class: 'ladder-svg' });
  const ladderTxt = ui.h('div', { class: 'ladder-txt' });
  card.append(ladderSvg, ladderTxt);
  pg.stage.appendChild(card);

  // ------------------------------------------------------------ families card
  const fam = ui.h('div', { class: 'view roots-card' });
  fam.appendChild(ui.h('div', { class: 'view-title', html: 'All compact simple Lie groups: four infinite families and five exceptions' }));
  const grid = ui.h('div', { class: 'fam-grid' });
  for (const F of FAMILIES) {
    const dk = R.dynkin(F.d.type, F.d.n);
    const svg = dynkinSVG(dk, { unit: 30, r: 6, labels: false, dashedBond: F.dashed });
    grid.appendChild(
      ui.h(
        'div',
        { class: 'fam' },
        ui.h('div', { class: 'fam-head', html: `$${F.name}$ <span class="tx-muted">·</span> $${F.group}$ <span class="tx-muted">· dim $${F.dim}$</span>` }),
        ui.h('div', { class: 'fam-svg', html: svg }),
        ui.h('div', { class: 'fam-phys', text: F.phys }),
      ),
    );
  }
  fam.appendChild(grid);
  pg.stage.appendChild(fam);

  // ------------------------------------------------------------ panel
  const secL = pg.section('The $E_n$ ladder');
  const sl = ui.slider(secL, { label: 'Number of nodes $n$', min: 3, max: 10, step: 1, value: S.n, format: (x) => String(x), onInput: (x) => ((S.n = x), play.set(false), ladder()) });
  const play = ui.playButton(secL, { playing: S.playing, labels: ['▶ Climb the ladder', '❚❚ Pause'], onToggle: (x) => (S.playing = x) });
  const lkv = ui.keyValue(secL, [
    ['Algebra', ''],
    ['$\\det A_{E_n}=9-n$', ''],
    ['Type', ''],
  ]);
  const secG = pg.section('Grand unification');
  ui.toggle(secG, { label: 'Labels on the SU(5) roots', value: S.labels, onChange: (x) => ((S.labels = x), p.invalidate()) });
  ui.keyValue(secG, [
    ['$SU(3)\\times SU(2)\\times U(1)$', '$8+3+1=12$'],
    ['$SU(5)$ adjoint', '$24=12+12$ (X, Y)'],
    ['Charge of X, Y', '$\\pm\\tfrac43,\\ \\pm\\tfrac13$'],
  ]);
  ui.legend(secG, [
    { color: 'c3', label: 'gluons (colour roots)' },
    { color: 'c1', label: '$W^\\pm$ (weak roots)' },
    { color: 'c8', label: 'X, Y leptoquark bosons' },
    { color: 'alg', label: 'Cartan: $T^c_3,T^c_8,T^w_3,Y$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Which algebra is the Standard Model’s?',
      text: '$\\su(3)\\oplus\\su(2)\\oplus\\uu(1)$ — not simple: $A_2\\oplus A_1$ plus an abelian factor. Set $n=3$: the $E$-series diagram with five nodes deleted is exactly $A_2\\sqcup A_1$, and each deleted node adjacent to the rest leaves a $U(1)$.',
      apply: () => setN(3),
    },
    {
      title: '$SU(5)$: $24=8+3+1+12$',
      text: 'In the picture, the colour roots form the gluon hexagon, the weak roots are $W^\\pm$, and the 12 roots joining a colour index to a weak index are the X, Y bosons with hypercharge $\\mp\\tfrac56$ (convention $Q=T_3+Y$). They turn quarks into leptons, so the proton can decay — not yet seen, $\\tau_p>10^{34}$ yr.',
      apply: () => setN(4),
    },
    {
      title: 'Why the list stops: positivity',
      text: 'Step $n$ from 8 to 10: $\\det A=9-n$ hits zero at $E_9$ (affine) and turns negative at $E_{10}$. A Dynkin diagram gives a finite-dimensional algebra only if its symmetrised Cartan matrix is positive definite — that single condition yields $A,B,C,D,E_{6,7,8},F_4,G_2$.',
      apply: () => setN(9),
    },
    {
      title: '$E_8\\times E_8$ and $SO(32)$',
      text: 'Green and Schwarz: the 10D superstring is anomaly-free only for a 496-dimensional gauge group, $SO(32)$ or $E_8\\times E_8$ ($2\\times248$). See the 240 roots in the Coxeter-plane tab.',
      apply: () => setN(8),
    },
  ]);

  notes(pg);

  function setN(n) {
    S.n = n;
    sl.set(n, { silent: true });
    play.set(false);
    ladder();
  }
  function ladder() {
    const n = S.n;
    const full = { type: 'E', n: 10, bonds: eBonds(10), lengths: new Array(10).fill(2) };
    ladderSvg.innerHTML = dynkinSVG(full, { unit: 40, r: 7, faded: (i) => i >= n, pos: layoutFor('E', 10) });
    const L = LADDER[n];
    ladderTxt.innerHTML = '';
    ladderTxt.appendChild(ui.h('div', { class: 'ladder-head', html: `$E_{${n}}${n <= 8 ? '=' + L.g : ''}$ ${n <= 8 ? `<span class="tx-muted">· dim ${L.dim}</span>` : `<span class="tx-muted">$${L.g}$</span>`}` }));
    ladderTxt.appendChild(ui.h('div', { html: L.txt }));
    const A = R.cartanFromBonds(n, eBonds(n));
    const det = mat.det(A);
    const kind = R.classifyCartan(A).kind;
    lkv.set('Algebra', n <= 8 ? `$${L.g}$` : `$${L.g}$`);
    lkv.set('$\\det A_{E_n}=9-n$', String(Math.round(det)));
    lkv.set('Type', kind === 'finite' ? 'finite-dimensional ✓' : kind === 'affine' ? 'affine (det 0)' : 'indefinite (det < 0)');
  }

  let acc = 0;
  scope.frame((dt) => {
    if (!play.playing) return;
    acc += dt;
    if (acc > 2.4) {
      acc = 0;
      S.n = S.n >= 10 ? 3 : S.n + 1;
      sl.set(S.n, { silent: true });
      ladder();
    }
  });

  ready = true;
  ladder();
  p.invalidate();
}

function notes(pg) {
  pg.note(`<h2>Cartan subalgebra, weights, roots</h2>
  <p>Choose the largest set of mutually commuting Hermitian generators $H_1,\\dots,H_r$: the charges that can be measured simultaneously. Their joint
  eigenvalues on a multiplet are the <b>weights</b> (quantum numbers such as $I_3,Y$ or electric charge). The remaining generators are organised as ladder
  operators $E_\\alpha$ with $[H_i,E_\\alpha]=\\alpha_iE_\\alpha$; the charge vectors $\\alpha$ are the <b>roots</b> — the weights of the adjoint representation,
  i.e. the charges of the gauge bosons. In the <b>Chevalley basis</b> $\\{h_i,e_i,f_i\\}$ for the simple roots, $[h_i,e_j]=A_{ji}e_j$ and the whole algebra
  follows from the Cartan matrix $A_{ij}=2\\langle\\alpha_i,\\alpha_j\\rangle/\\langle\\alpha_j,\\alpha_j\\rangle$ (Serre relations).</p>`);
  pg.note(`<h2>Why only these diagrams</h2>
  <p>The Killing form is positive definite on the real span of the roots of a compact group, so the symmetrised Cartan matrix must be positive definite.
  Integrality of $\\su(2)$ spins forces $A_{ij}A_{ji}\\in\\{0,1,2,3\\}$. Positivity then excludes loops, more than one branch point, branches longer than
  $E_8$’s and more than one multiple bond: what survives is exactly $A_n,B_n,C_n,D_n,E_{6,7,8},F_4,G_2$. The borderline diagrams with $\\det=0$ are the
  affine algebras ($E_9=\\tilde E_8$, …).</p>
  <div class="callout warning"><span class="callout-title">Real forms</span>The same complex algebra has several real forms. $\\so(4)$ and $\\so(3,1)$ are both
  $D_2=A_1\\times A_1$ over $\\C$: compact rotations versus the Lorentz algebra, whose boosts are non-compact and whose unitary irreps are infinite-dimensional
  (<a href="#/lorentz">Lorentz group</a>). Likewise $\\sp(2n,\\R)$ is the non-compact real form of $C_n$ used in classical mechanics.</div>`);
  pg.note(`<h2>The physics menu</h2>
  <table><thead><tr><th>Group</th><th>Role</th></tr></thead><tbody>
  <tr><td>$U(1)\\times SU(2)\\times SU(3)$</td><td>Standard Model: hypercharge, weak isospin, colour</td></tr>
  <tr><td>$SU(5)$</td><td>Georgi–Glashow GUT; $\\overline{\\mathbf 5}\\oplus\\mathbf{10}$ per generation; X, Y bosons</td></tr>
  <tr><td>$SO(10)$</td><td>one generation in the $\\mathbf{16}$, including $\\nu_R$</td></tr>
  <tr><td>$E_6$, $E_7$, $E_8$</td><td>exceptional GUTs, supergravity dualities, heterotic string</td></tr>
  <tr><td>$SO(32)$, $E_8\\times E_8$</td><td>anomaly-free 10D superstrings (dim 496)</td></tr>
  <tr><td>$G_2$</td><td>holonomy of 7-manifolds in M-theory</td></tr>
  <tr><td>$Sp(n)$, $Sp(2n,\\R)$</td><td>quaternionic unitary group; canonical transformations</td></tr>
  <tr><td>$SO(3,1)$</td><td>Lorentz group: non-compact real form of $D_2$</td></tr></tbody></table>
  <p>See also <a href="#/su3">SU(3)</a> for weights and multiplets, <a href="#/reps">spin multiplets</a> for the $A_1$ case and
  <a href="#/ssb">symmetry breaking</a> for how a large group breaks to a subgroup obtained by deleting nodes.</p>`);
}
