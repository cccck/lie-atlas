// SO(3) tab (b) — non-commutativity: (1) the book experiment R_y R_x ≠ R_x R_y, (2) the small loop
// +a, +b, −a, −b whose net effect is a rotation ≈ ε² a×b, (3) the Lie algebra so(3) ≅ (R³, ×).

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { plot2d } from '../../core/plot2d.js';
import { vec, mat, quat, clamp, easeInOut, axisAngleOf } from '../../core/la.js';
import { cmat } from '../../core/complex.js';
import { texMatrix, texNum, fmt, fmtDeg } from '../../core/format.js';
import { PI, E, nDotJ, rotE, commutatorLoop, rotVec } from './math.js';
import { aeroplane } from './body.js';
import { throttle, angleHelix, texTup } from './util.js';

const EPS_MIN = 0.05;
const EPS_MAX = 0.9;
const LEN_MIN = 0.25;
const LEN_MAX = 1.4;
// book animation timeline (seconds): rest, step 1, pause, step 2, hold
const T_REST = 0.6;
const T_STEP = 1.7;
const T_PAUSE = 0.6;
const T_HOLD = 3.2;
const PERIOD = T_REST + T_STEP + T_PAUSE + T_STEP + T_HOLD;
const LOOP_LEG = 1.15; // seconds per leg of the small loop
const LOOP_HOLD = 2.2;

const DEFAULT = () => ({
  alpha: PI / 2,
  frame: 'space',
  clock: 0,
  p: 0,
  pTarget: 0,
  a: [1, 0, 0],
  b: [0, 1, 0],
  eps: 0.45,
  loopFrame: 'body',
  loopU: 0,
  loopHold: 0,
});

function phaseOf(c) {
  if (c < T_REST) return 0;
  c -= T_REST;
  if (c < T_STEP) return easeInOut(c / T_STEP);
  c -= T_STEP;
  if (c < T_PAUSE) return 1;
  c -= T_PAUSE;
  if (c < T_STEP) return 1 + easeInOut(c / T_STEP);
  return 2;
}

const AX_NAME = ['x', 'y', 'z'];

export function mountComm(pg, scope, ctx) {
  const S = (ctx.state.b ??= { ...DEFAULT(), playing: true, loopPlaying: true });

  // ------------------------------------------------------------------ views
  const vBook = pg.view({
    title: 'Two quarter turns, opposite order',
    hint: 'drag to orbit · scroll to zoom',
    span: true,
    height: 330,
  });
  const vLoop = pg.view({ title: 'Small loop $+\\alg a,+\\alg b,-\\alg a,-\\alg b$', hint: 'rotation vectors in units of $\\epsilon$ · drag to orbit', height: 410 });
  const vAlg = pg.view({ title: 'Lie algebra $\\so(3)\\cong(\\R^3,\\times)$', hint: 'drag the orange tips · drag to orbit', height: 410 });

  // ---- book experiment: two aeroplanes side by side (left: x then y, right: y then x)
  const kb = scene3d(vBook.body, scope, { camera: [4.55, 0, 1.85], target: [0, 0, -0.14], fov: 34, minDistance: 2.5, maxDistance: 16 });
  const SIDES = [
    { y: -1.75, axes: [0, 1] },
    { y: 1.75, axes: [1, 0] },
  ];
  const sides = SIDES.map((sd) => {
    const g = new THREE.Group();
    g.position.set(0, sd.y, 0);
    kb.root.add(g);
    const ghost = aeroplane(kb, { opacity: 0.15, parent: g });
    const plane = aeroplane(kb, { frame: true, frameLength: 0.92, parent: g });
    const refAxes = [0, 1].map((i) =>
      kb.line([], { color: AX_NAME[i], width: 1.3, opacity: 0.75, dashed: true, dashSize: 0.06, gapSize: 0.05, parent: g }),
    );
    const refLabels = [0, 1].map((i) => kb.label(AX_NAME[i], [0, 0, 0], { color: AX_NAME[i], small: true, parent: g }));
    const arrow = kb.arrow([0, 0, 0], [0, 0, 0.01], { color: 'alg', radius: 0.02, headLength: 0.12, headRadius: 0.05, parent: g });
    const helix = kb.line([], { color: 'grp', width: 2.2, parent: g });
    const head = kb.arrow([0, 0, 0], [0, 0, 0.01], { color: 'grp', radius: 0.0005, headLength: 0.1, headRadius: 0.04, parent: g });
    const stepLabel = kb.label('', [0, 0, -1.34], { html: true, className: 'so3-step', parent: g });
    return { ...sd, g, ghost, plane, refAxes, refLabels, arrow, helix, head, stepLabel };
  });

  // ---- small loop in rotation-vector coordinates (units of ε)
  const kl = scene3d(vLoop.body, scope, { camera: [2.15, -1.75, 2.15], target: [0.42, 0.45, 0.22], fov: 36, minDistance: 1.2, maxDistance: 12 });
  ['x', 'y', 'z'].forEach((c, i) => {
    const b = [0, 0, 0];
    b[i] = 1.3;
    kl.line([[0, 0, 0], b], { color: c, width: 1.1, opacity: 0.6 });
    const lp = [0, 0, 0];
    lp[i] = 1.42;
    kl.label(`\\theta n_${c}/\\epsilon`, lp, { color: c, small: true });
  });
  kl.dots([[0, 0, 0]], { radius: 0.03, color: 'ink' });
  kl.label('\\text{start}', [0, 0, 0], { small: true, offset: [-22, 12] });
  const legA = kl.arrow([0, 0, 0], [1, 0, 0], { color: 'alg', radius: 0.01, headLength: 0.08, headRadius: 0.03, opacity: 0.85 });
  const legB = kl.arrow([0, 0, 0], [0, 1, 0], { color: 'alg', radius: 0.01, headLength: 0.08, headRadius: 0.03, opacity: 0.85 });
  const legALabel = kl.label('\\alg{a}', [1, 0, 0], { small: true, offset: [8, 10] });
  const legBLabel = kl.label('\\alg{b}', [0, 1, 0], { small: true, offset: [10, 8] });
  const pathFull = kl.line([], { color: 'grp', width: 1.6, opacity: 0.28 });
  const pathDone = kl.line([], { color: 'grp', width: 3 });
  const marker = kl.sphere({ radius: 0.035, color: 'grp' });
  const gap = kl.arrow([0, 0, 0], [0, 0, 0.01], { color: 'brk', radius: 0.012, headLength: 0.07, headRadius: 0.03 });
  const gapLabel = kl.label('\\brk{\\log C}', [0, 0, 0], { small: true, offset: [14, -6] });
  const pred = kl.line([], { color: 'brk', width: 1.4, opacity: 0.85, dashed: true, dashSize: 0.03, gapSize: 0.025 });
  const predDot = kl.sphere({ radius: 0.018, color: 'brk' });
  const predLabel = kl.label('', [0, 0, 0], { small: true, offset: [-14, -14], color: 'brk' });

  let curve = [];
  let curveMax = 0.1;
  let cachedLoop = null;

  // ---- Lie algebra (R³, ×)
  const ka = scene3d(vAlg.body, scope, { camera: [3.4, 2.4, 2.05], target: [0, 0, 0.1], fov: 36, minDistance: 1.5, maxDistance: 12 });
  ka.axes({ length: 1.3, labels: ['J_x', 'J_y', 'J_z'], radius: 0.007 });
  const arrA = ka.arrow([0, 0, 0], S.a, { color: 'alg', radius: 0.022, headLength: 0.12, headRadius: 0.05 });
  const arrB = ka.arrow([0, 0, 0], S.b, { color: 'alg', radius: 0.022, headLength: 0.12, headRadius: 0.05 });
  const arrC = ka.arrow([0, 0, 0], [0, 0, 1], { color: 'brk', radius: 0.024, headLength: 0.13, headRadius: 0.055 });
  const pickGeo = new THREE.SphereGeometry(0.17, 12, 8);
  const tipA = ka.sphere({ radius: 0.055, color: 'alg' });
  const tipB = ka.sphere({ radius: 0.055, color: 'alg' });
  tipA.add(new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false })));
  tipB.add(new THREE.Mesh(pickGeo.clone(), new THREE.MeshBasicMaterial({ visible: false })));
  const labA = ka.label('\\alg{a}', S.a, { offset: [12, -12] });
  const labB = ka.label('\\alg{b}', S.b, { offset: [12, -12] });
  const labC = ka.label('\\brk{a\\times b}', [0, 0, 1], { offset: [30, 4] });
  const paraGeo = new THREE.BufferGeometry();
  paraGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  paraGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const para = new THREE.Mesh(paraGeo, ka.basic('brk', { opacity: 0.16 }));
  ka.add(para);
  const paraEdge = ka.line([], { color: 'brk', width: 1.2, opacity: 0.55 });
  const turn = ka.line([], { color: 'brk', width: 1.6, opacity: 0.8 });
  const clampLen = (v) => {
    const n = vec.norm(v);
    if (!(n > 1e-9)) return null;
    return vec.scale(v, clamp(n, LEN_MIN, LEN_MAX) / n);
  };
  ka.draggable(tipA, {
    onDrag: (p) => {
      const v = clampLen(p);
      if (v) setGenerators(v, S.b);
    },
  });
  ka.draggable(tipB, {
    onDrag: (p) => {
      const v = clampLen(p);
      if (v) setGenerators(S.a, v);
    },
  });

  // ------------------------------------------------------------------ panel
  const secB = pg.section('Order of rotations');
  const sAlpha = ui.slider(secB, {
    label: 'Each turn $\\alpha$',
    min: 0.05,
    max: PI,
    step: 0.005,
    value: S.alpha,
    format: (x) => fmtDeg(x, 0),
    onInput: (x) => {
      S.alpha = x;
      bookDirty = true;
    },
  });
  const segFrame = ui.segmented(secB, {
    label: 'Turn about axes that are',
    options: [
      { value: 'space', label: 'fixed in space' },
      { value: 'body', label: 'fixed in the body' },
    ],
    value: S.frame,
    onChange: (v) => {
      S.frame = v;
      bookDirty = true;
    },
  });
  const rowB = ui.buttons(secB, []);
  const play = ui.playButton(rowB, {
    playing: S.playing,
    onToggle: (on) => {
      S.playing = on;
      if (on) S.clock = S.p >= 2 ? 0 : S.p >= 1 ? T_REST + T_STEP + T_PAUSE : 0;
    },
  });
  ui.button(rowB, {
    label: 'Next step',
    onClick: () => {
      if (play.playing) play.set(false);
      S.pTarget = S.p < 0.999 ? 1 : S.p < 1.999 ? 2 : 0;
      if (S.pTarget === 0) S.p = 0;
      bookDirty = true;
    },
  });
  ui.button(rowB, {
    label: 'Reset',
    kind: 'ghost',
    onClick: () => {
      if (play.playing) play.set(false);
      S.p = S.pTarget = 0;
      S.clock = 0;
      bookDirty = true;
    },
  });
  const outBook = ui.readout(secB, { label: 'Final orientations (each a single rotation, by Euler’s theorem)' });

  const secL = pg.section('Small loop');
  const sEps = ui.slider(secL, {
    label: 'Loop size $\\epsilon$ (rad)',
    min: EPS_MIN,
    max: EPS_MAX,
    step: 0.005,
    value: S.eps,
    format: 3,
    onInput: (x) => {
      S.eps = x;
      loopDirty = true;
    },
  });
  const segLoop = ui.segmented(secL, {
    label: 'Each leg turns about the',
    options: [
      { value: 'body', label: 'body axis' },
      { value: 'space', label: 'space axis' },
    ],
    value: S.loopFrame,
    onChange: (v) => {
      S.loopFrame = v;
      recomputeCurve();
      loopDirty = true;
    },
  });
  const rowL = ui.buttons(secL, []);
  const loopPlay = ui.playButton(rowL, {
    playing: S.loopPlaying,
    labels: ['▶ Run the loop', '❚❚ Pause loop'],
    onToggle: (on) => {
      S.loopPlaying = on;
      if (on && S.loopU >= 4) {
        S.loopU = 0;
        S.loopHold = 0;
      }
    },
  });
  ui.button(rowL, {
    label: '$\\alg a=\\hat x$, $\\alg b=\\hat y$',
    onClick: () => setGenerators([1, 0, 0], [0, 1, 0]),
  });
  const kvL = ui.keyValue(secL, [
    ['Net rotation angle of $C$', ''],
    ['$\\epsilon^2\\,|a\\times b|$ (BCH)', ''],
    ['Ratio', ''],
    ['Axis of $C$ along $\\widehat{a\\times b}$', ''],
  ]);
  ui.note(secL, 'Net turn of $C$ against $\\epsilon^2$ (solid) and the BCH line $\\epsilon^2|a\\times b|$ (dashed); the dot is the current $\\epsilon$.');
  const plotDiv = ui.h('div', { class: 'so3-panelplot' });
  secL.appendChild(plotDiv);
  const ip = plot2d(plotDiv, scope, {
    x: [-0.05, 0.9],
    y: [-0.05, 0.9],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw(p) {
      const xm = EPS_MAX * EPS_MAX;
      for (const gx of [0.25, 0.5, 0.75]) p.line([[gx, 0], [gx, curveMax * 1.05]], { color: 'grid', width: 1 });
      p.line([[0, 0], [xm * 1.04, 0]], { color: 'axis', width: 1 });
      p.line([[0, 0], [0, curveMax * 1.05]], { color: 'axis', width: 1 });
      const kx = vec.norm(vec.cross(S.a, S.b));
      p.line([[0, 0], [xm, kx * xm]], { color: 'brk', width: 1.3, dash: [5, 4], alpha: 0.9 });
      p.line(curve, { color: 'brk', width: 2.2 });
      const cur = loopData();
      p.dot([S.eps * S.eps, vec.norm(cur.net)], { r: 4, color: 'grp' });
      p.text('ε²', [xm * 1.04, 0], { align: 'right', baseline: 'bottom', size: 11, color: 'muted', offset: [0, -3] });
      for (const gx of [0.25, 0.5, 0.75]) p.text(String(gx), [gx, 0], { align: 'center', baseline: 'top', size: 10, color: 'muted', offset: [0, 3] });
      p.text('angle (rad)', [0, curveMax * 1.05], { align: 'left', baseline: 'top', size: 11, color: 'muted', offset: [5, 0] });
      p.text(fmt(curveMax, 2), [0, curveMax], { align: 'right', size: 10, color: 'muted', offset: [-4, 0] });
    },
  });

  const secA = pg.section('Lie algebra');
  const outAlg = ui.readout(secA, { label: 'Bracket of the dragged generators (computed with 3×3 matrices)' });
  ui.readout(secA, {
    label: 'Basis: $(J_k)_{ij}=-i\\epsilon_{kij}$',
    value:
      'J_x=\\begin{psmallmatrix}0&0&0\\\\0&0&-i\\\\0&i&0\\end{psmallmatrix},\\ J_y=\\begin{psmallmatrix}0&0&i\\\\0&0&0\\\\-i&0&0\\end{psmallmatrix},\\ J_z=\\begin{psmallmatrix}0&-i&0\\\\i&0&0\\\\0&0&0\\end{psmallmatrix}',
  });
  ui.legend(secA, [
    { color: 'alg', label: 'generators $a,b$; rotation axes' },
    { color: 'grp', label: 'turns, loop in $SO(3)$' },
    { color: 'brk', label: 'bracket $a\\times b$, gap $\\log C$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'The book experiment',
      text: 'Quarter turns about space-fixed $x$ and $y$, in opposite orders. The noses end up pointing down versus sideways: $R_yR_x$ is a $120^\\circ$ turn about $(1,1,-1)/\\sqrt3$, while $R_xR_y$ is $120^\\circ$ about $(1,1,1)/\\sqrt3$ — the cyclic permutation of the axes.',
      apply: () => {
        sAlpha.set(PI / 2);
        segFrame.set('space');
        restartBook();
      },
    },
    {
      title: 'Body axes reverse the order',
      text: 'Turn about the aeroplane’s own axes instead. The left one (body $x$, then body $y$) now ends where the right one ended before: $x$-then-$y$ about body axes is $R_xR_y$, i.e. $y$-then-$x$ about space axes. Intrinsic sequences compose in reverse.',
      apply: () => {
        sAlpha.set(PI / 2);
        segFrame.set('body');
        restartBook();
      },
    },
    {
      title: 'Small turns almost commute',
      text: 'With $\\alpha=15^\\circ$ the two results nearly agree. The mismatch $R_LR_R^{-1}$ is a turn by $\\approx\\alpha^2=3.9^\\circ$ about $-\\hat z$: the failure to commute is second order, and it is itself a rotation about the third axis.',
      apply: () => {
        sAlpha.set((15 * PI) / 180);
        segFrame.set('space');
        restartBook();
      },
    },
    {
      title: 'A tiny loop is a $z$-rotation',
      text: 'Run $+\\hat x,+\\hat y,-\\hat x,-\\hat y$ with small $\\epsilon$: the loop fails to close by $\\log C\\approx\\epsilon^2\\hat z$ (in units of $\\epsilon$ the gap shrinks like $\\epsilon$), and the plot in the panel hugs the BCH line. This is $e^{-i\\epsilon J_x}e^{-i\\epsilon J_y}e^{i\\epsilon J_x}e^{i\\epsilon J_y}=e^{-i\\epsilon^2J_z}+O(\\epsilon^3)$.',
      apply: () => {
        setGenerators([1, 0, 0], [0, 1, 0]);
        sEps.set(0.2);
        restartLoop();
      },
    },
    {
      title: 'Parallel generators commute',
      text: 'Make $b$ parallel to $a$: the parallelogram and the bracket vanish, and the loop closes exactly — rotations about one axis form the abelian subgroup $U(1)$.',
      apply: () => {
        setGenerators([1, 0.35, 0.1], [0.75, 0.2625, 0.075]);
        sEps.set(0.6);
        restartLoop();
      },
    },
    {
      title: 'Space axes flip the sign',
      text: 'Perform the same time sequence about space-fixed axes: the gap points along $-(a\\times b)$. About body axes, $C=e^{\\epsilon A}e^{\\epsilon B}e^{-\\epsilon A}e^{-\\epsilon B}\\approx e^{+\\epsilon^2[A,B]}$; about space axes the factors multiply in the opposite order and $[A,B]\\to[B,A]$.',
      apply: () => {
        setGenerators([1, 0, 0], [0, 1, 0]);
        sEps.set(0.45);
        segLoop.set('space');
        restartLoop();
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Top: two identical aeroplanes receive the same two quarter turns in opposite orders. With space-fixed axes the left
    one ends in $R_y(90^\\circ)R_x(90^\\circ)$, the right one in $R_x(90^\\circ)R_y(90^\\circ)$ — different orientations, each of
    them again a single rotation (Euler’s theorem): $120^\\circ$ about $(1,1,-1)/\\sqrt3$ and about $(1,1,1)/\\sqrt3$.</p>
    <p>Bottom left: the commutator loop $+\\alg a,+\\alg b,-\\alg a,-\\alg b$ drawn in rotation-vector coordinates divided by $\\epsilon$.
    It does not close; the gap $\\brk{\\log C}$ points along $\\brk{a\\times b}$. Bottom right: the same generators as vectors in
    $\\so(3)\\cong\\R^3$; their bracket is the cross product, whose length is the area of the shaded parallelogram.</p>`);
  pg.note(`<h2>Non-commuting rotations, non-commuting observables</h2>
    <p>Expanding the group commutator with Baker–Campbell–Hausdorff,
    $$e^{-i\\epsilon J_x}e^{-i\\epsilon J_y}e^{i\\epsilon J_x}e^{i\\epsilon J_y}=e^{\\,(-i\\epsilon)^2[J_x,J_y]}+O(\\epsilon^3)=e^{-i\\epsilon^2J_z}+O(\\epsilon^3),$$
    so a small loop is a rotation by $\\epsilon^2$ about $z$: the commutator $\\brk{[J_x,J_y]=iJ_z}$ is the infinitesimal shadow
    of the book experiment. In quantum mechanics the same relation forbids sharp values of two components at once,
    $\\Delta J_x\\,\\Delta J_y\\ge\\tfrac12|\\langle J_z\\rangle|$; only $\\vec J^{\\,2}$ and one component can be diagonalised together,
    which is why states are labelled $|j,m\\rangle$.</p>
    <div class="callout physics"><span class="callout-title">Physics</span>The bracket makes two axes enough: a satellite
    whose actuators can only turn it about two body axes can still reach every orientation, by wiggling in small loops whose
    net effect is the third rotation. Closely related loop effects let a falling cat turn over with zero angular momentum
    (a loop in shape space), and turn two non-collinear Lorentz boosts into a boost plus a Wigner rotation, because
    $[K_x,K_y]=-iJ_z$ (<a href="#/lorentz">Lorentz group</a>).</div>`);
  pg.note(`<h2>Which sign, precisely</h2>
    <p>Perform the time sequence $+a,+b,-a,-b$. About <strong>body-fixed</strong> axes each new turn multiplies on the right,
    $$C_{\\text{body}}=e^{\\epsilon A}e^{\\epsilon B}e^{-\\epsilon A}e^{-\\epsilon B}=\\exp\\!\\big(\\epsilon^2[A,B]+O(\\epsilon^3)\\big),\\qquad A=-i\\,a\\cdot\\vec J ,$$
    a turn by $+\\epsilon^2|a\\times b|$ about $a\\times b$ (anticlockwise seen from its tip; for $a=\\hat x$, $b=\\hat y$: $+\\epsilon^2$ about $+\\hat z$).
    About <strong>space-fixed</strong> axes each new turn multiplies on the left, $C_{\\text{space}}=e^{-\\epsilon B}e^{-\\epsilon A}e^{\\epsilon B}e^{\\epsilon A}\\approx e^{\\epsilon^2[B,A]}$:
    the same size, opposite sense. Both statements are checked numerically in the readout.</p>
    <div class="callout warning"><span class="callout-title">Convention</span>Intrinsic (body-axis) rotations performed in
    the order $R_1,R_2,\\dots$ equal extrinsic (space-axis) rotations in the reverse order. Most sign disputes about
    commutator loops, Euler angles and Thomas precession are this statement in disguise.</div>`);
  pg.note(`<h2>The Lie algebra $\\so(3)\\cong(\\R^3,\\times)$</h2>
    <p>Writing a generator as $a\\cdot\\vec J$, the structure constants $[J_i,J_j]=i\\epsilon_{ijk}J_k$ say
    $$[a\\cdot\\vec J,\\;b\\cdot\\vec J]=i\\,(a\\times b)\\cdot\\vec J ,$$
    so the bracket <em>is</em> the cross product: bilinear, antisymmetric, and the Jacobi identity is the vector identity
    $a\\times(b\\times c)+b\\times(c\\times a)+c\\times(a\\times b)=0$. The Killing form $\\tr(\\ad_a\\ad_b)=-2\\,a\\cdot b$ is negative
    definite, the signature of a compact group. Pauli matrices obey the same relations with $J_k=\\sigma_k/2$: $\\so(3)\\cong\\su(2)$,
    which is why spin ½ exists even though no $3\\times3$ rotation matrix describes it (<a href="#/su2">SU(2)</a>,
    <a href="#/loops">commutators as small loops</a>).</p>`);

  // ------------------------------------------------------------------ logic
  let bookDirty = true;
  let loopDirty = true;
  const readoutThrottle = throttle(100);

  function restartBook() {
    S.clock = 0;
    S.p = S.pTarget = 0;
    play.set(true);
    bookDirty = true;
  }
  function restartLoop() {
    S.loopU = 0;
    S.loopHold = 0;
    loopPlay.set(true);
    loopDirty = true;
  }
  function setGenerators(a, b) {
    S.a = a.slice();
    S.b = b.slice();
    recomputeCurve();
    loopDirty = true;
    algDirty = true;
  }
  let algDirty = true;

  function loopData() {
    const key = `${S.a}|${S.b}|${S.eps}|${S.loopFrame}`;
    if (!cachedLoop || cachedLoop.key !== key) cachedLoop = { key, ...commutatorLoop(S.a, S.b, S.eps, S.loopFrame) };
    return cachedLoop;
  }
  function recomputeCurve() {
    const pts = [];
    let m = 0;
    for (let i = 0; i <= 48; i++) {
      const e = (EPS_MAX * i) / 48;
      const ang = vec.norm(commutatorLoop(S.a, S.b, e, S.loopFrame).net);
      m = Math.max(m, ang);
      pts.push([e * e, ang]);
    }
    curve = pts;
    const kx = vec.norm(vec.cross(S.a, S.b));
    curveMax = Math.max(0.12, m, kx * EPS_MAX * EPS_MAX);
    const xm = EPS_MAX * EPS_MAX;
    ip.setView({ x: [-0.13 * xm, 1.06 * xm], y: [-0.16 * curveMax, 1.12 * curveMax] });
  }

  scope.frame((dt) => {
    if (play.playing) {
      S.clock = (S.clock + dt) % PERIOD;
      S.p = phaseOf(S.clock);
      S.pTarget = S.p;
      bookDirty = true;
    } else if (Math.abs(S.p - S.pTarget) > 1e-9) {
      const dir = Math.sign(S.pTarget - S.p);
      S.p = dir > 0 ? Math.min(S.pTarget, S.p + dt / T_STEP) : S.pTarget;
      bookDirty = true;
    }
    if (loopPlay.playing) {
      if (S.loopU >= 4) {
        S.loopHold += dt;
        if (S.loopHold > LOOP_HOLD) {
          S.loopU = 0;
          S.loopHold = 0;
        }
      } else S.loopU = Math.min(4, S.loopU + dt / LOOP_LEG);
      loopDirty = true;
    }
    if (bookDirty || loopDirty || algDirty) draw(false);
  });

  // ------------------------------------------------------------------ drawing
  function stepRotation(sd, p) {
    const a = S.alpha;
    const [i1, i2] = sd.axes;
    const p1 = clamp(p, 0, 1);
    const p2 = clamp(p - 1, 0, 1);
    const R1 = rotE(i1, a * p1);
    const R2 = rotE(i2, a * p2);
    return S.frame === 'space' ? mat.mul(R2, R1) : mat.mul(R1, R2);
  }

  function drawBook() {
    const p = S.p;
    const stepNo = p < 1 - 1e-9 ? 1 : p < 2 - 1e-9 ? 2 : 3;
    const show = p > 1e-9 && stepNo < 3;
    for (const sd of sides) {
      const R = stepRotation(sd, p);
      sd.plane.setR(R);
      sd.ghost.visible = p > 0.02;
      const [i1, i2] = sd.axes;
      // reference axes: fixed in space, or carried by the body
      for (let i = 0; i < 2; i++) {
        const dir = S.frame === 'space' ? E[i] : mat.mulv(R, E[i]);
        sd.refAxes[i].setPoints([vec.scale(dir, -1.18), vec.scale(dir, 1.18)]);
        sd.refLabels[i].setPosition(vec.scale(dir, 1.3));
        sd.refLabels[i].setText(S.frame === 'space' ? AX_NAME[i] : `${AX_NAME[i]}'`);
      }
      // the axis of the current step and its turning angle
      const k = stepNo === 1 ? i1 : i2;
      const axis = stepNo === 1 || S.frame === 'space' ? E[k] : mat.mulv(rotE(i1, S.alpha), E[k]);
      const ang = stepNo === 1 ? S.alpha * clamp(p, 0, 1) : S.alpha * clamp(p - 1, 0, 1);
      sd.arrow.visible = show;
      sd.helix.visible = show && ang > 0.02;
      sd.head.visible = show && ang > 0.02;
      if (show) {
        sd.arrow.set([0, 0, 0], vec.scale(axis, 1.25));
        if (ang > 0.02) {
          const hx = angleHelix(axis, ang, { r: 0.2, c: 1.02, pitch: 0.05, ref: perpRef(axis) });
          sd.helix.setPoints(hx.pts);
          sd.head.set(vec.sub(hx.end, vec.scale(hx.tangent, 0.1)), hx.end);
        }
      }
      const first = AX_NAME[i1];
      const second = AX_NAME[i2];
      const prime = S.frame === 'space' ? '' : "'";
      const deg = fmtDeg(S.alpha, 0);
      let txt;
      if (stepNo === 1 && p > 0) txt = `step 1: ${deg} about $\\alg{${first}${prime}}$`;
      else if (stepNo === 2) txt = `step 2: ${deg} about $\\alg{${second}${prime}}$`;
      else if (stepNo === 3) {
        const aa = axisAngleOf(R);
        txt = `= ${fmtDeg(aa.angle, 0)} about $${texTup(aa.axis, 2)}$`;
      } else txt = '<span style="color:var(--muted)">start</span>';
      sd.stepLabel.setText(`<b>${first} then ${second}</b> · ${txt}`);
    }
  }
  function perpRef(axis) {
    return Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  }

  function drawLoop() {
    const L = loopData();
    const eps = S.eps;
    const sc = (w) => vec.scale(w, 1 / eps);
    const N = 160;
    const full = [];
    for (let i = 0; i <= N; i++) full.push(sc(rotVec(L.qf((4 * i) / N))));
    pathFull.setPoints(full);
    const u = clamp(S.loopU, 0, 4);
    const done = [];
    const m = Math.max(1, Math.ceil((N * u) / 4));
    for (let i = 0; i <= m; i++) done.push(sc(rotVec(L.qf((u * i) / m))));
    pathDone.setPoints(u > 1e-4 ? done : []);
    marker.position.set(...done[done.length - 1]);
    legA.set([0, 0, 0], S.a);
    legB.set([0, 0, 0], S.b);
    legALabel.setPosition(S.a);
    legBLabel.setPosition(S.b);
    const finished = u >= 4 - 1e-9;
    const net = sc(L.net);
    gap.visible = finished;
    gapLabel.setVisible(finished && vec.norm(net) > 0.02);
    if (finished) gap.set([0, 0, 0], net);
    gapLabel.setPosition(net);
    const sgn = S.loopFrame === 'space' ? -1 : 1;
    const pr = vec.scale(vec.cross(S.a, S.b), sgn * eps); // ε² a×b in units of ε
    pred.setPoints(vec.norm(pr) > 1e-4 ? [[0, 0, 0], pr] : []);
    predDot.visible = vec.norm(pr) > 1e-4;
    predDot.position.set(...pr);
    predLabel.setVisible(finished && vec.norm(pr) > 0.02);
    predLabel.setPosition(pr);
    predLabel.setText(sgn > 0 ? '\\epsilon^2 a\\times b' : '-\\epsilon^2 a\\times b');
    ip.invalidate();
  }

  function drawAlg() {
    const a = S.a;
    const b = S.b;
    const c = vec.cross(a, b);
    arrA.set([0, 0, 0], a);
    arrB.set([0, 0, 0], b);
    arrC.set([0, 0, 0], c);
    tipA.position.set(...a);
    tipB.position.set(...b);
    labA.setPosition(a);
    labB.setPosition(b);
    labC.setPosition(c);
    labC.setVisible(vec.norm(c) > 0.05);
    const pos = paraGeo.attributes.position.array;
    const quad = [[0, 0, 0], a, vec.add(a, b), b];
    quad.forEach((q, i) => pos.set(q, 3 * i));
    paraGeo.attributes.position.needsUpdate = true;
    paraGeo.computeBoundingSphere();
    paraEdge.setPoints([a, vec.add(a, b), b]);
    // small arc from a towards b (right-hand rule)
    const ua = vec.normalize(a);
    const ub = vec.normalize(b);
    const ang = Math.acos(clamp(vec.dot(ua, ub), -1, 1));
    if (vec.norm(c) > 1e-6 && ang > 0.05) {
      const w = vec.normalize(vec.sub(ub, vec.scale(ua, vec.dot(ua, ub))));
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = (ang * i) / 24;
        pts.push(vec.scale(vec.add(vec.scale(ua, Math.cos(t)), vec.scale(w, Math.sin(t))), 0.32));
      }
      turn.setPoints(pts);
    } else turn.setPoints([]);
  }

  function draw(force) {
    if (bookDirty) drawBook();
    if (loopDirty) drawLoop();
    if (algDirty) drawAlg();
    const any = bookDirty || loopDirty || algDirty;
    bookDirty = loopDirty = algDirty = false;
    if (any || force) readoutThrottle(readouts, force);
  }

  function readouts() {
    // book
    const RL = stepRotation(sides[0], 2);
    const RR = stepRotation(sides[1], 2);
    const aL = axisAngleOf(RL);
    const aR = axisAngleOf(RR);
    const aD = axisAngleOf(mat.mul(RL, mat.transpose(RR)));
    const prodL = S.frame === 'space' ? 'R_yR_x' : 'R_xR_y';
    const prodR = S.frame === 'space' ? 'R_xR_y' : 'R_yR_x';
    const rot = (aa) => `R\\big(${texNum((aa.angle * 180) / PI, 1)}^\\circ,\\,${texTup(aa.axis, 2)}\\big)`;
    outBook.set(
      `\\begin{aligned}\\grp{R_L}&=${prodL}=${rot(aL)}\\\\ \\grp{R_R}&=${prodR}=${rot(aR)}\\\\ \\grp{R_LR_R^{-1}}&=${rot(aD)}\\end{aligned}`,
    );
    // loop
    const L = loopData();
    const ang = vec.norm(L.net);
    const c = vec.cross(S.a, S.b);
    const kc = vec.norm(c);
    const bch = S.eps * S.eps * kc;
    kvL.set('Net rotation angle of $C$', `${fmt(ang, 4)} rad`);
    kvL.set('$\\epsilon^2\\,|a\\times b|$ (BCH)', `${fmt(bch, 4)} rad`);
    kvL.set('Ratio', kc > 1e-9 ? fmt(ang / bch, 3) : '— (commute)');
    kvL.set('Axis of $C$ along $\\widehat{a\\times b}$', kc > 1e-9 && ang > 1e-12 ? fmt(vec.dot(L.net, c) / (ang * kc), 3) : '—');
    // algebra
    const A = nDotJ(S.a);
    const B = nDotJ(S.b);
    const C = cmat.comm(A, B);
    const err = cmat.maxAbs(cmat.sub(C, cmat.scale(nDotJ(c), { re: 0, im: 1 })));
    outAlg.set(
      `\\begin{gathered}[\\alg{a\\cdot J},\\alg{b\\cdot J}]=i\\,\\brk{(a\\times b)}\\cdot J\\\\ \\brk{a\\times b}=${texTup(c, 2)},\\ |a\\times b|=${texNum(kc, 2)}\\\\ \\text{matrix check: } \\max|\\Delta|=${err < 1e-15 ? '0' : texNum(err * 1e16, 1) + '\\times10^{-16}'}\\end{gathered}`,
    );
  }

  recomputeCurve();
  draw(true);
  void texMatrix;
  void quat;
}
