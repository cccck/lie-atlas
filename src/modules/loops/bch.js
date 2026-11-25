// Tab (b): the Baker–Campbell–Hausdorff formula, e^X e^Y = e^Z, in so(3) ≅ (R³, ×) and in the Heisenberg algebra.

import * as ui from '../../core/ui.js';
import { scene3d } from '../../core/three-kit.js';
import { vec, clamp, mulberry32, randomUnit3 } from '../../core/la.js';
import { fmt, fmtDeg } from '../../core/format.js';
import { bchTruncations, bchExactSO3, bchExactH3, brSO3, brH3, vnorm, vsub, vscale, vadd } from './math.js';
import { logLogPlot } from './common.js';

const ORDER_COLORS = ['c1', 'c3', 'c4', 'c5', 'c8'];
const EPS_MAX = 3.2;

function sci(x) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0 (exact)';
  if (x < 1e-15) return '< 10⁻¹⁵';
  if (x >= 0.01) return fmt(x, 3);
  const [m, e] = x.toExponential(2).split('e');
  const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `${m}×10${String(Number(e)).split('').map((c) => sup[c] ?? c).join('')}`;
}
const tuple = (v, d = 2) => `(${v.map((x) => fmt(x, d).replace('−', '-')).join(',\\,')})`;

export function mountBCH(pg, scope, ctx) {
  const S = ctx.state;
  S.bch ??= { alg: 'so3', eps: 1.2, X: [1, 0, 0], Y: [0, 1, 0] };
  const B = S.bch;

  // ---------------------------------------------------------------- views
  const v3 = pg.view({ title: 'Lie algebra $\\so(3)\\cong\\R^3$: $\\alg{\\epsilon X}$, $\\alg{\\epsilon Y}$ and $\\grp{Z}=\\log(e^{\\epsilon X}e^{\\epsilon Y})$', hint: 'drag the orange tips · drag empty space to orbit', height: 470 });
  const v2 = pg.view({ title: 'Truncation error $|Z-Z_n|$ against $\\epsilon$', height: 470 });

  const k = scene3d(v3.body, scope, { camera: [5.6, 4.1, 3.5], target: [0.5, 0.55, 0.45], minDistance: 2.5, maxDistance: 22 });
  const ball = k.wireSphere({ radius: Math.PI, opacity: 0.16, lat: 8, lon: 16, color: 'muted' });
  const ballFill = k.sphere({ radius: Math.PI, color: 'muted', opacity: 0.045 });
  const axes = k.axes({ length: 3.7, labels: false, radius: 0.01 });
  const axLabels = ['x', 'y', 'z'].map((c, i) => {
    const p = [0, 0, 0];
    p[i] = 3.95;
    return k.label('', p, { color: c, small: true });
  });
  void axes;
  const piLbl = k.label('|Z|=\\pi', [0, -Math.PI * 0.72, Math.PI * 0.74], { small: true, color: 'muted' });
  const aX = k.arrow([0, 0, 0], [1, 0, 0], { color: 'alg', radius: 0.03, headLength: 0.2, headRadius: 0.075 });
  const aY = k.arrow([0, 0, 0], [0, 1, 0], { color: 'alg', radius: 0.03, headLength: 0.2, headRadius: 0.075 });
  const hX = k.sphere({ radius: 0.12, color: 'alg' });
  const hY = k.sphere({ radius: 0.12, color: 'alg' });
  const lX = k.label('\\alg{\\epsilon X}', [1, 0, 0], { offset: [14, -12] });
  const lY = k.label('\\alg{\\epsilon Y}', [0, 1, 0], { offset: [14, -12] });
  const aZ = k.arrow([0, 0, 0], [1, 1, 0], { color: 'grp', radius: 0.028, headLength: 0.2, headRadius: 0.075 });
  const lZ = k.label('\\grp{Z}', [1, 1, 0], { offset: [16, -10] });
  const trajEx = [0, 1, 2].map(() => k.line([], { color: 'grp', width: 2, opacity: 0.55 }));
  const traj1 = k.line([], { color: 'muted', width: 1.6, dashed: true, dashSize: 0.1, gapSize: 0.08, opacity: 0.9 });
  const chain = k.line([], { color: 'brk', width: 2.2, opacity: 0.85 });
  // instance colours multiply the material colour, so keep the base white (the theme 'ink' is black in light mode)
  const dots = k.dots([[0, 0, 0]], { radius: 0.075, max: 5, color: '#ffffff', colors: ORDER_COLORS });
  const l1 = k.label('Z_1', [0, 0, 0], { small: true, color: ORDER_COLORS[0], offset: [-14, 12] });
  const lPar = k.label('', [0, 0, 0], { small: true, color: 'muted', offset: [0, 18] });

  const ll = logLogPlot(v2.body, scope, { x: [-2.05, Math.log10(EPS_MAX) + 0.03], y: [-16.4, 1.2], xLabel: 'ε', yLabel: '' });

  // dragging the tips sets X = tip/ε
  const dragTo = (which) => (p) => {
    const e = Math.max(B.eps, 0.05);
    let w = vscale(p, 1 / e);
    const n = vnorm(w);
    if (n > 3) w = vscale(w, 3 / n);
    if (B.alg === 'h3') w = w.map((x) => clamp(x, -3, 3));
    B[which] = w;
    update(true);
  };
  k.draggable(hX, { onDrag: dragTo('X') });
  k.draggable(hY, { onDrag: dragTo('Y') });

  // ---------------------------------------------------------------- panel
  const secA = pg.section('Algebra');
  const segAlg = ui.segmented(secA, {
    options: [
      { value: 'so3', label: 'so(3): rotations' },
      { value: 'h3', label: 'h₃: Heisenberg' },
    ],
    value: B.alg,
    onChange: (a) => {
      B.alg = a;
      update(true);
    },
  });
  const algNote = ui.note(secA, '');
  const secE = pg.section('Scale');
  const sEps = ui.slider(secE, {
    label: 'Scale $\\epsilon$ (exponents $\\epsilon X$, $\\epsilon Y$)',
    min: 0.02,
    max: EPS_MAX,
    step: 0.005,
    value: B.eps,
    format: (v) => fmt(v, 3),
    onInput: (v) => {
      B.eps = v;
      update(false);
    },
  });
  ui.buttons(secE, [
    { label: 'X ⟂ Y', onClick: () => preset({ X: [1, 0, 0], Y: [0, 1, 0] }) },
    { label: 'X ∥ Y', onClick: () => preset({ X: [1, 0, 0], Y: [0.7, 0, 0] }) },
    { label: 'Acute', title: 'Unit X, Y at 53°: the log jumps at ε ≈ 1.82', onClick: () => preset({ X: [1, 0, 0], Y: [0.6, 0.8, 0] }) },
    { label: 'Random', onClick: () => preset({ X: vscale(randomUnit3(rng), 0.7 + rng()), Y: vscale(randomUnit3(rng), 0.7 + rng()) }) },
  ]);
  const rng = mulberry32(17);
  const secR = pg.section('Readout');
  const ro = ui.readout(secR, {});
  const kv = ui.keyValue(secR, []);
  ui.legend(secR, [
    { color: 'alg', label: '$\\epsilon X,\\ \\epsilon Y$' },
    { color: 'grp', label: 'exact $Z$ (and its path as $\\epsilon$ grows)' },
    { color: 'brk', label: 'chain $Z_1\\to Z_5$' },
    ...ORDER_COLORS.map((c, i) => ({ color: c, dot: true, label: `$Z_${i + 1}$` })),
  ]);
  ui.experiments(pg.section('Try this'), [
    {
      title: 'Each order buys a power of ε',
      text: 'On the right, each truncation $Z_n$ (all terms up to degree $n$) has an error falling as $\\epsilon^{n+1}$: slopes 2, 3, 4, 5, 6 — so the coefficients $\\tfrac12,\\tfrac1{12},-\\tfrac1{24},\\dots$ are right. Errors bottom out at $\\sim10^{-16}$, the machine precision.',
      apply: () => preset({ X: [1, 0, 0.2], Y: [0.1, 1, -0.1], eps: 0.6, alg: 'so3' }),
    },
    {
      title: 'Commuting generators',
      text: 'With $X\\parallel Y$ every bracket vanishes and $e^Xe^Y=e^{X+Y}$: all errors drop to rounding level. Exponentials multiply like numbers exactly when the generators commute.',
      apply: () => preset({ X: [1, 0, 0], Y: [0.7, 0, 0], eps: 1.2, alg: 'so3' }),
    },
    {
      title: 'Heisenberg: the series stops',
      text: 'In $\\mathfrak h_3$ the bracket is central, so $Z=X+Y+\\tfrac12[X,Y]$ exactly. This is why displacement operators obey $D(\\alpha)D(\\beta)=e^{(\\alpha\\beta^*-\\alpha^*\\beta)/2}D(\\alpha+\\beta)$ and magnetic translations close up to a phase.',
      apply: () => preset({ X: [1, 0, 0], Y: [0, 1, 0], eps: 1.2, alg: 'h3' }),
    },
    {
      title: 'Where the series breaks',
      text: 'Unit $X,Y$ at $53^\\circ$: near $\\epsilon\\approx1.82$ the product rotation passes through angle $\\pi$ and the principal $\\log$ jumps to the antipode of the $\\pi$-ball (antipodal points are the same rotation). No power series in $\\epsilon$ can follow — the group’s global shape overrides the algebra.',
      apply: () => preset({ X: [1, 0, 0], Y: [0.6, 0.8, 0], eps: 1.95, alg: 'so3' }),
    },
    {
      title: 'Large rotations',
      text: 'At $\\epsilon=2.6$ the truncations wander far outside the $\\pi$-ball while the exact $Z$ stays inside it: the series is asymptotic only near the identity. (Its radius of convergence is finite.)',
      apply: () => preset({ X: [1, 0, 0], Y: [0, 1, 0], eps: 2.6, alg: 'so3' }),
    },
  ]);

  notesBCH(pg);

  // ---------------------------------------------------------------- logic
  let curveKey = null;
  function preset(o) {
    if (o.X) B.X = o.X;
    if (o.Y) B.Y = o.Y;
    if (o.alg) {
      B.alg = o.alg;
      segAlg.set(B.alg, { silent: true });
    }
    if (o.eps !== undefined) {
      B.eps = o.eps;
      sEps.set(o.eps, { silent: true });
    }
    update(true);
  }
  const exact = (x, y) => (B.alg === 'h3' ? bchExactH3(x, y) : bchExactSO3(x, y));
  const br = () => (B.alg === 'h3' ? brH3 : brSO3);

  function update(shapeChanged) {
    const so3 = B.alg === 'so3';
    const e = B.eps;
    const x = vscale(B.X, e);
    const y = vscale(B.Y, e);
    const Zx = exact(x, y);
    const { Z } = bchTruncations(x, y, br());
    // 3D
    ball.visible = so3;
    ballFill.visible = so3;
    piLbl.setVisible(so3);
    v3.setTitle(
      so3
        ? 'Lie algebra $\\so(3)\\cong\\R^3$: $\\alg{\\epsilon X}$, $\\alg{\\epsilon Y}$ and $\\grp{Z}=\\log(e^{\\epsilon X}e^{\\epsilon Y})$'
        : 'Heisenberg algebra $\\mathfrak h_3$: $[X,Y]=Z$ central',
    );
    const names = so3 ? ['\\theta_x', '\\theta_y', '\\theta_z'] : ['X', 'Y', 'Z'];
    axLabels.forEach((l, i) => l.setText(names[i]));
    algNote.innerHTML = ui.h('span', {
      html: so3
        ? 'A point $\\vec\\theta$ is the rotation by $|\\vec\\theta|$ about $\\hat\\theta$; the bracket is the cross product, $[\\vec a,\\vec b]=\\vec a\\times\\vec b$. Antipodal points of the $\\pi$-ball are the same rotation.'
        : 'Coordinates $(a,b,c)$ of $aX+bY+cZ$ with $[X,Y]=Z$ central — realised by $X=-i\\hat x$, $Y=-i\\hat p$, $Z=-i\\hbar$, since $[\\hat x,\\hat p]=i\\hbar$. Here $\\exp$ is a global diffeomorphism: no jumps.',
    }).innerHTML;
    aX.set([0, 0, 0], x);
    aY.set([0, 0, 0], y);
    hX.position.set(...x);
    hY.position.set(...y);
    lX.setPosition(x);
    lY.setPosition(y);
    aZ.set([0, 0, 0], Zx);
    lZ.setPosition(Zx);
    chain.setPoints(Z);
    dots.setPoints(Z);
    l1.setPosition(Z[0]);
    // trajectories in ε: exact Z(t) (split at jumps) and Z1(t) = t(X+Y)
    const segs = [[]];
    let prev = null;
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const t = (e * i) / n;
      const z = exact(vscale(B.X, t), vscale(B.Y, t));
      if (prev && vnorm(vsub(z, prev)) > 1.0 && segs.length < 3) segs.push([]);
      segs[segs.length - 1].push(z);
      prev = z;
    }
    trajEx.forEach((ln, i) => {
      ln.setPoints(segs[i] || []);
      ln.visible = !!segs[i] && segs[i].length > 1;
    });
    traj1.setPoints([
      [0, 0, 0],
      Z[0],
    ]);
    const nx = vnorm(B.X);
    const ny = vnorm(B.Y);
    const par = nx > 1e-9 && ny > 1e-9 && vnorm(vec.cross(B.X, B.Y)) < 1e-6 * nx * ny;
    lPar.setText(par ? '\\text{all } Z_n = Z' : '');
    lPar.setPosition(Zx);
    lPar.setVisible(par);
    // readouts
    const errs = Z.map((z) => vnorm(vsub(Zx, z)));
    ro.set(
      `\\begin{aligned}\\alg{\\epsilon X}&=${tuple(x)}\\\\ \\alg{\\epsilon Y}&=${tuple(y)}\\\\ \\grp{Z}&=${tuple(Zx, 3)}\\\\ \\tfrac12\\brk{[\\epsilon X,\\epsilon Y]}&=${tuple(vscale(br()(x, y), 0.5), 3)}\\end{aligned}`,
    );
    const rows = [];
    if (so3) rows.push(['Rotation angle $|Z|$', `${fmt(vnorm(Zx), 3)} rad (${fmtDeg(vnorm(Zx), 1)})`]);
    errs.forEach((er, i) => rows.push([`Error of $Z_${i + 1}$`, sci(er)]));
    kv.setRows(rows);
    // log–log curves (depend on X, Y and the algebra, not on ε)
    const key = B.alg + '|' + B.X.join(',') + '|' + B.Y.join(',');
    if (shapeChanged || key !== curveKey) {
      curveKey = key;
      const m = 220;
      const lo = -2;
      const hi = Math.log10(EPS_MAX);
      const xs = Array.from({ length: m }, (_, i) => 10 ** (lo + ((hi - lo) * i) / (m - 1)));
      const ys = [[], [], [], [], []];
      const zex = [];
      for (const t of xs) {
        const xt = vscale(B.X, t);
        const yt = vscale(B.Y, t);
        const zz = exact(xt, yt);
        zex.push(zz);
        const tr = bchTruncations(xt, yt, br()).Z;
        tr.forEach((zn, i) => ys[i].push(vnorm(vsub(zz, zn))));
      }
      const jump = (i) => vnorm(vsub(zex[i], zex[i - 1])) > 1.0;
      const curves = ys.map((yy, i) => ({
        xs,
        ys: yy.map((v) => (v < 1e-16 ? NaN : v)),
        color: ORDER_COLORS[i],
        width: 2,
        label: `Z${'₁₂₃₄₅'[i]} · slope ${i + 2}`,
        labelAt: 16 + i * 2,
        labelOffset: [6, -11],
        labelAlign: 'left',
        breakAt: jump,
        markerValue: () => errs[i],
      }));
      ll.setCurves(curves);
      const anyJump = zex.some((_, i) => i > 0 && jump(i));
      const notes = [];
      if (B.alg === 'h3') notes.push({ text: 'Z₂ … Z₅: error ≡ 0 — the series stops at ½[X,Y]', px: 64, py: 50, color: 'ink2' });
      else if (ys[0].every((v) => v < 1e-13)) notes.push({ text: 'X ∥ Y: every bracket vanishes, Z = X + Y', px: 64, py: 50, color: 'ink2' });
      else if (anyJump) notes.push({ text: 'jump: the composite angle crosses π', px: 64, py: 50, color: 'ink2' });
      notes.push({ text: 'machine precision ~10⁻¹⁶', px: 64, y: -15.4, color: 'muted' });
      ll.setNotes(notes);
    }
    ll.setMarker(e);
  }
  update(true);
}

function notesBCH(pg) {
  pg.note(`<h2>What you see</h2>
  <p>On the left, the Lie algebra. The orange arrows are the exponents $\\alg{\\epsilon X}$ and $\\alg{\\epsilon Y}$; the violet arrow is the exact
  $\\grp Z=\\log(e^{\\epsilon X}e^{\\epsilon Y})$, the single generator that does the same job as the two in succession. The pink chain joins the
  truncations $Z_1,\\dots,Z_5$: $Z_1=\\epsilon(X+Y)$ (what you would guess for numbers), then each bracket correction bends the guess towards $Z$.
  The faint violet curve is $Z$ as $\\epsilon$ grows from 0; the dashed line is the naive $Z_1$.</p>
  <p>On the right, the errors $|Z-Z_n|$ on log–log axes. Each truncation is correct up to degree $n$, so its error has slope $n+1$; the test suite confirms
  slopes $2.00, 3.00, 4.00, 5.00, 6.00$ in $\\so(3)$ and in a generic $\\mathfrak{gl}(4)$.</p>`);
  pg.note(`<h2>The formula</h2>
  $$\\log(e^Xe^Y)=X+Y+\\tfrac12[X,Y]+\\tfrac1{12}\\big([X,[X,Y]]+[Y,[Y,X]]\\big)-\\tfrac1{24}[Y,[X,[X,Y]]]+Z^{(5)}+\\dots$$
  $$\\begin{aligned}Z^{(5)}=&-\\tfrac1{720}\\big([Y,[Y,[Y,[Y,X]]]]+[X,[X,[X,[X,Y]]]]\\big)+\\tfrac1{360}\\big([X,[Y,[Y,[Y,X]]]]+[Y,[X,[X,[X,Y]]]]\\big)\\\\&+\\tfrac1{120}\\big([Y,[X,[Y,[X,Y]]]]+[X,[Y,[X,[Y,X]]]]\\big)\\end{aligned}$$
  <p>Every term beyond $X+Y$ is a nested <b>bracket</b>. That is the deep content: the group law near the identity is fixed by the Lie algebra alone
  (Lie’s theorems), and two groups with the same structure constants — $SU(2)$ and $SO(3)$ — are locally identical. Dynkin’s formula gives all terms explicitly.</p>
  <div class="callout intuition"><span class="callout-title">Intuition</span>The ½[X,Y] term is the “small loop” of the first tab in disguise:
  $e^{X}e^{Y}=e^{X+Y+\\frac12[X,Y]+\\dots}$ and $e^{Y}e^{X}=e^{X+Y-\\frac12[X,Y]+\\dots}$ differ by one small loop:
  $e^Xe^Y=(e^Xe^Ye^{-X}e^{-Y})\\,e^Ye^X$, with $e^Xe^Ye^{-X}e^{-Y}=e^{[X,Y]+\\dots}$.</div>`);
  pg.note(`<h2>The physics</h2>
  <ul>
  <li><b>Trotter–Suzuki splitting.</b> $e^{(A+B)t}=e^{At}e^{Bt}e^{-\\frac{t^2}{2}[A,B]+O(t^3)}$, so alternating short steps of $A$ and $B$
  approximates $e^{(A+B)t}$ with an error set by $[A,B]$. The symmetric product $e^{At/2}e^{Bt}e^{At/2}$ has only odd orders: the error per
  step is $O(t^3)$. This is the Verlet/leapfrog symplectic integrator and the workhorse of digital quantum simulation.</li>
  <li><b>Coherent states.</b> For $D(\\alpha)=e^{\\alpha a^\\dagger-\\alpha^*a}$ the bracket is a number, BCH stops, and
  $D(\\alpha)D(\\beta)=e^{(\\alpha\\beta^*-\\alpha^*\\beta)/2}D(\\alpha+\\beta)$ — the phase is the area of a triangle in phase space (<a href="#/heisenberg">Heisenberg group</a>).</li>
  <li><b>Magnus expansion.</b> For a time-dependent Hamiltonian, $U=e^{\\Omega}$ with $\\Omega=-i\\int H+\\tfrac{(-i)^2}{2}\\int\\!\\!\\int_{t_1>t_2}[H(t_1),H(t_2)]+\\dots$:
  BCH in continuous form, used in NMR (average-Hamiltonian theory) and Floquet engineering.</li>
  </ul>`);
  pg.note(`<h2>Where it breaks</h2>
  <p>The series converges only for small enough $X,Y$. In $SO(3)$ the reason is visible: $\\exp$ maps the closed $\\pi$-ball onto the group but glues
  antipodal boundary points (<a href="#/so3">SO(3)</a>). When the composite rotation angle reaches $\\pi$ the principal logarithm can jump across the
  ball, and no power series in $\\epsilon$ follows a jump. (For two equal perpendicular rotations the angle only touches $\\pi$ at $\\epsilon=\\pi$ and
  turns back, so there is no jump: whether it jumps depends on the sign change of $\\cos\\frac\\theta2$.)</p>
  <div class="callout warning"><span class="callout-title">Not every group element has a logarithm</span>In $SL(2,\\R)$ an element with trace below $-2$
  is not $e^Z$ for any real $Z$: the exponential map is not even onto. Algebra controls the group only near the identity; topology does the rest
  (compare $SU(2)\\to SO(3)$ in <a href="#/su2">SU(2)</a>).</div>`);
}
