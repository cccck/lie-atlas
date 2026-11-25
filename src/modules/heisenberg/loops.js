// heisenberg · tab "Loops in phase space": a closed loop of phase-space translations D(q,p) returns a state to
// itself up to e^{iA} (left, plot2d), and the same loop lifted horizontally into H_3 = {(q,p,φ)} (right, 3D).
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { fmt, texNum, texComplex, texTuple } from '../../core/format.js';
import * as M from './math.js';
import { shadeSignedArea, lobes, drawLoop, drawDial, loopClock } from './common.js';

const PI = Math.PI;
const B = 2.6; // half-width of the displayed phase plane
const SIZE = { min: 0.3, max: 1.9 };

export const PRESET_OPTIONS = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'eight', label: 'Figure-eight' },
];

export function mountLoops(pg, scope, ctx) {
  const S = (ctx.state.loops ??= { kind: 'circle', size: 1, reversed: false, free: null, playing: true, s: 0, eps: 0.6, comm: false });
  const clock = loopClock(S, { duration: 7.5, hold: 1.8 });

  let loop = null;
  let lob = null;
  let drawing = null; // raw freehand points while the pointer is down

  function buildPoints() {
    let pts;
    if (S.kind === 'free' && S.free && S.free.length > 2) pts = S.free;
    else if (S.kind === 'comm') {
      const e = S.eps;
      pts = [
        [0, 0],
        [e, 0],
        [e, e],
        [0, e],
      ];
    } else pts = M.presetPoints(S.kind, S.size);
    if (S.reversed) pts = M.reversePts(pts);
    return pts;
  }
  function rebuild() {
    loop = M.makeLoop(buildPoints());
    lob = lobes(loop.pts, 0.008);
  }
  rebuild();

  // ------------------------------------------------------------------ view 1: the phase plane
  const v1 = pg.view({
    title: 'Phase plane: a loop of translations $\\grp{D(q,p)}$',
    hint: 'drag on the plane to draw your own loop',
  });
  const p = plot2d(v1.body, scope, {
    x: [-B, B],
    y: [-B - 0.1, B + 0.1],
    pan: false,
    zoom: false,
    axisLabels: ['q', 'p'],
    draw: drawPlane,
  });

  function drawPlane(p, c2) {
    if (drawing) {
      if (drawing.length > 2) shadeSignedArea(p, c2, drawing, { alpha: 0.16 });
      p.line(drawing, { color: 'ink2', width: 2 });
      if (drawing.length > 1) p.segment(drawing[drawing.length - 1], drawing[0], { color: 'muted', width: 1.5, dash: [4, 4] });
      p.tex(`\\brk{A}\\approx ${texNum(M.signedArea(drawing), 2)}`, drawing[drawing.length - 1], { key: 'drawA', offset: [14, -14], align: 'left', small: true });
      return;
    }
    shadeSignedArea(p, c2, loop.pts);
    drawLoop(p, c2, loop, { color: 'grp', width: 2.25, arrows: S.kind === 'comm' ? 4 : 5 });
    // lobe labels
    const big = (x) => Math.abs(x) > 0.12;
    if (big(lob.plus.area)) p.tex(`+${texNum(lob.plus.area, 2)}`, lob.plus.c, { key: 'lobP', color: 'brk', small: true });
    if (big(lob.minus.area)) p.tex(texNum(lob.minus.area, 2), lob.minus.c, { key: 'lobM', color: 'c1', small: true });
    // start
    const z0 = loop.pts[0];
    p.dot(z0, { r: 5, color: 'surface', stroke: 'ink', width: 2 });
    p.tex('\\text{start}', z0, { key: 'start', offset: [-10, 14], align: 'right', small: true });
    // traversed part, the current generator and point
    const at = M.loopAt(loop, S.s);
    p.line(M.loopPrefix(loop, S.s), { color: 'grp', width: 3.5, alpha: 0.55 });
    const g = 0.42;
    p.arrow(at.z, [at.z[0] + g * at.t[0], at.z[1] + g * at.t[1]], { color: 'alg', width: 2.5, head: 9 });
    p.dot(at.z, { r: 5.5, color: 'hi', stroke: 'surface', width: 2 });
    // phase dial (accumulated phase = height of the lift)
    const r = Math.max(26, Math.min(36, p.width * 0.07));
    drawDial(p, c2, {
      cx: p.width - r - 18,
      cy: r + 34,
      r,
      angle: at.phi,
      color: 'hi',
      arc: 'brk',
      label: S.s >= 1 ? 'e^{i\\brk{A}}' : 'e^{i\\varphi(t)}',
      key: 'dial',
      sub: `φ = ${fmt(at.phi, 2)}`,
    });
  }

  // freehand drawing
  p.on('down', (pos) => {
    drawing = [[pos.x, pos.y]];
    p.invalidate();
    return true;
  });
  p.on('move', (pos) => {
    if (!drawing) return;
    const last = drawing[drawing.length - 1];
    const x = Math.max(-B, Math.min(B, pos.x));
    const y = Math.max(-B, Math.min(B, pos.y));
    if (Math.hypot(x - last[0], y - last[1]) > 0.035) drawing.push([x, y]);
    p.invalidate();
  });
  p.on('up', () => {
    if (!drawing) return;
    const raw = drawing;
    drawing = null;
    let len = 0;
    for (let i = 1; i < raw.length; i++) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    if (raw.length >= 6 && len > 0.8) {
      S.free = M.resampleClosed(raw, 220);
      S.kind = 'free';
      S.reversed = false;
      tRev.set(false, { silent: true });
      seg.set(null, { silent: true });
      changed(true);
    } else p.invalidate();
  });

  // ------------------------------------------------------------------ view 2: H_3 and the horizontal lift
  const v2 = pg.view({
    title: 'Group $\\grp{H_3}=\\{(q,p,\\varphi)\\}$: horizontal lift',
    hint: 'drag to orbit · scroll to zoom',
  });
  const k = scene3d(v2.body, scope, { camera: [5.4, -6.9, 4.3], target: [0, 0, 0.75], minDistance: 3, maxDistance: 30 });
  k.line(
    [
      [-B, -B, 0],
      [B, -B, 0],
      [B, B, 0],
      [-B, B, 0],
      [-B, -B, 0],
    ],
    { color: 'axis', width: 1 },
  );
  k.arrow([-B, 0, 0], [B + 0.35, 0, 0], { color: 'x', radius: 0.011, headLength: 0.12, headRadius: 0.04 });
  k.arrow([0, -B, 0], [0, B + 0.35, 0], { color: 'y', radius: 0.011, headLength: 0.12, headRadius: 0.04 });
  k.label('q', [B + 0.55, 0, 0], { color: 'x' });
  k.label('p', [0, B + 0.55, 0], { color: 'y' });
  // φ ruler at the back corner
  const RX = -B;
  const RY = B;
  const ruler = k.arrow([RX, RY, 0], [RX, RY, 2], { color: 'z', radius: 0.011, headLength: 0.12, headRadius: 0.04 });
  const rulerLab = k.label('\\varphi', [RX, RY, 2.2], { color: 'z' });
  const tickSegs = k.add(new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: k.color('z') })));
  const tickLabs = [];
  for (let i = 0; i < 10; i++) tickLabs.push(k.label('', [RX, RY, 0], { small: true, color: 'muted', offset: [-16, 0] }));

  // contact planes: a grid at φ = 0 and a few along the lift
  const planeMat = new THREE.MeshBasicMaterial({ color: k.color('alg'), transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
  const planeEdgeMat = new THREE.LineBasicMaterial({ color: k.color('alg'), transparent: true, opacity: 0.5 });
  const liftPlaneMat = new THREE.MeshBasicMaterial({ color: k.color('alg'), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const liftEdgeMat = new THREE.LineBasicMaterial({ color: k.color('alg'), transparent: true, opacity: 0.9 });
  const gridPlanes = k.add(new THREE.Mesh(new THREE.BufferGeometry(), planeMat));
  const gridEdges = k.add(new THREE.LineSegments(new THREE.BufferGeometry(), planeEdgeMat));
  const liftPlanes = k.add(new THREE.Mesh(new THREE.BufferGeometry(), liftPlaneMat));
  const liftEdges = k.add(new THREE.LineSegments(new THREE.BufferGeometry(), liftEdgeMat));
  const gridCentres = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) gridCentres.push([0.75 * i, 0.75 * j, 0]);

  function setQuads(mesh, edges, centres, h, kappa) {
    const pos = new Float32Array(centres.length * 18);
    const ed = new Float32Array(centres.length * 24);
    centres.forEach(([q, pp, z], i) => {
      // tangent basis of ker(dφ − ½(q dp − p dq)) in display coordinates (vertical scale κ)
      const X = [1, 0, (-kappa * pp) / 2];
      const Y = [0, 1, (kappa * q) / 2];
      const c = (a, b) => [q + h * (a * X[0] + b * Y[0]), pp + h * (a * X[1] + b * Y[1]), z + h * (a * X[2] + b * Y[2])];
      const A = c(-1, -1);
      const Bq = c(1, -1);
      const C = c(1, 1);
      const D = c(-1, 1);
      [A, Bq, C, A, C, D].forEach((v, j) => pos.set(v, i * 18 + j * 3));
      [A, Bq, Bq, C, C, D, D, A].forEach((v, j) => ed.set(v, i * 24 + j * 3));
    });
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(ed, 3));
    mesh.geometry.dispose();
    edges.geometry.dispose();
    mesh.geometry = g1;
    edges.geometry = g2;
  }

  const baseLine = k.line([], { color: 'grp', width: 1.5, opacity: 0.45 });
  const liftLine = k.line([], { color: 'grp', width: 3 });
  const gapLine = k.line([], { color: 'brk', width: 4 });
  const gapLab = k.label('', [0, 0, 0], { color: 'brk', offset: [18, 0] });
  const startDot = k.sphere({ radius: 0.055, color: 'ink' });
  const endDot = k.sphere({ radius: 0.065, color: 'brk' });
  const moveDot = k.sphere({ radius: 0.075, color: 'hi' });
  const baseDot = k.sphere({ radius: 0.045, color: 'hi' });
  const dropLine = k.line([], { color: 'hi', width: 1.25, opacity: 0.7, dashed: true, dashSize: 0.07, gapSize: 0.06 });
  let kappa = 0.5;

  function update3d() {
    const smp = M.sampleLoop(loop, 300);
    let lo = 0;
    let hi = 0;
    for (const s of smp) {
      lo = Math.min(lo, s.phi);
      hi = Math.max(hi, s.phi);
    }
    const span = Math.max(Math.abs(lo), Math.abs(hi), 1e-6);
    kappa = Math.min(0.5, 2.3 / span);
    baseLine.setPoints(smp.map((s) => [s.z[0], s.z[1], 0]));
    liftLine.setPoints(smp.map((s) => [s.z[0], s.z[1], kappa * s.phi]));
    const z0 = loop.pts[0];
    const A = loop.area;
    startDot.position.set(z0[0], z0[1], 0);
    endDot.position.set(z0[0], z0[1], kappa * A);
    const showGap = Math.abs(kappa * A) > 0.02;
    gapLine.setPoints(showGap ? [
      [z0[0], z0[1], 0],
      [z0[0], z0[1], kappa * A],
    ] : []);
    gapLab.setText(showGap ? `\\brk{A}=${texNum(A, 2)}` : '');
    gapLab.setPosition([z0[0], z0[1], 0.5 * kappa * A]);
    gapLab.setVisible(showGap);
    setQuads(gridPlanes, gridEdges, gridCentres, 0.25, kappa);
    const along = [];
    for (let i = 0; i < 12; i++) {
      const a = M.loopAt(loop, (i + 0.5) / 12);
      along.push([a.z[0], a.z[1], kappa * a.phi]);
    }
    setQuads(liftPlanes, liftEdges, along, 0.17, kappa);
    // φ ruler with ticks every π (or 2π when tall)
    const zTop = Math.max(kappa * hi, 0) + 0.55;
    const zBot = Math.min(kappa * lo, 0) - 0.15;
    ruler.set([RX, RY, zBot], [RX, RY, zTop]);
    rulerLab.setPosition([RX, RY, zTop + 0.22]);
    const stepPhi = kappa * PI < 0.32 ? 2 * PI : PI;
    const ticks = [];
    let li = 0;
    for (let m = Math.ceil(lo / stepPhi); m <= Math.floor(hi / stepPhi) && li < tickLabs.length; m++) {
      if (m === 0) continue;
      const z = kappa * m * stepPhi;
      ticks.push(RX - 0.1, RY, z, RX + 0.1, RY, z);
      const n = Math.round((m * stepPhi) / PI);
      tickLabs[li].setText(n === 1 ? '\\pi' : n === -1 ? '-\\pi' : `${n}\\pi`);
      tickLabs[li].setPosition([RX, RY, z]);
      tickLabs[li].setVisible(true);
      li++;
    }
    for (; li < tickLabs.length; li++) tickLabs[li].setVisible(false);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
    tickSegs.geometry.dispose();
    tickSegs.geometry = tg;
    moveMarkers();
  }
  function moveMarkers() {
    const at = M.loopAt(loop, S.s);
    moveDot.position.set(at.z[0], at.z[1], kappa * at.phi);
    baseDot.position.set(at.z[0], at.z[1], 0);
    dropLine.setPoints(Math.abs(kappa * at.phi) > 0.03 ? [
      [at.z[0], at.z[1], 0],
      [at.z[0], at.z[1], kappa * at.phi],
    ] : []);
  }

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Loop');
  const seg = ui.segmented(sec, {
    options: PRESET_OPTIONS,
    value: PRESET_OPTIONS.some((o) => o.value === S.kind) ? S.kind : null,
    onChange: (v) => {
      S.kind = v;
      changed(true);
    },
  });
  const sSize = ui.slider(sec, {
    label: 'Size',
    min: SIZE.min,
    max: SIZE.max,
    step: 0.01,
    value: S.size,
    format: (v) => '×' + fmt(v, 2),
    onInput: (v) => {
      S.size = v;
      if (S.kind === 'free' || S.kind === 'comm') {
        S.kind = 'circle';
        seg.set('circle', { silent: true });
      }
      changed(false);
    },
  });
  const tRev = ui.toggle(sec, {
    label: 'Reverse direction (clockwise)',
    value: S.reversed,
    onChange: (v) => {
      S.reversed = v;
      changed(true);
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  sec.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  ui.button(row, {
    label: 'Restart loop',
    onClick: () => {
      clock.restart();
      play.set(true);
      refreshMoving();
    },
  });

  const secR = pg.section('Phase = enclosed area');
  const out = ui.readout(secR, { label: 'Product of all the displacements around the loop' });
  const kv = ui.keyValue(secR, [
    ['signed area $\\brk{A}$', ''],
    ['$\\brk{A}/2\\pi$ (turns of the phase)', ''],
    ['lobes $A_+$, $A_-$', ''],
    ['lift height now, $\\varphi(t)$', ''],
  ]);

  const secC = pg.section('Group commutator');
  const sEps = ui.slider(secC, {
    label: 'Step $\\epsilon$ of $e^{\\epsilon X}$, $e^{\\epsilon Y}$',
    min: 0.02,
    max: 2.2,
    step: 0.01,
    value: S.eps,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      S.eps = v;
      if (S.kind === 'comm') changed(false);
      updateComm();
    },
  });
  const outC = ui.readout(secC, { label: 'In $H_3$, with $(q,p,\\varphi)(q^\\prime,p^\\prime,\\varphi^\\prime)=(q+q^\\prime,\\,p+p^\\prime,\\,\\varphi+\\varphi^\\prime+\\tfrac12(qp^\\prime-pq^\\prime))$' });
  ui.buttons(secC, [
    {
      label: 'Walk this square',
      onClick: () => setComm(S.eps),
    },
  ]);

  const secL = pg.section('Legend');
  ui.legend(secL, [
    { color: 'grp', label: 'loop of translations $\\grp{D(\\delta q,\\delta p)}$; its lift in $H_3$' },
    { color: 'alg', label: 'generator being applied, $\\dot q\\,\\alg{X}+\\dot p\\,\\alg{Y}$; contact planes' },
    { color: 'brk', label: 'enclosed area, counter-clockwise ($+$); the gap $\\brk{A}$' },
    { color: 'c1', label: 'enclosed area, clockwise ($-$)' },
    { color: 'hi', label: 'current point and phase $e^{i\\varphi}$', dot: true },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Square: phase = area',
      text: 'Walk $+q$, $+p$, $-q$, $-p$. The state comes back as $e^{i\\brk{A}}\\psi$ with $\\brk{A}$ = side² exactly — read it off the shaded area, the dial and the vertical gap of the lift in $H_3$. With $\\hbar$ restored the phase is $\\brk{A}/\\hbar$: phase-space area is measured in units of $\\hbar$.',
      apply: () => setPreset('square', 1, false),
    },
    {
      title: 'Figure-eight: no net phase',
      text: 'The two lobes are traversed in opposite senses ($+$ pink, $-$ blue). The lift climbs over one lobe and descends over the other and closes exactly: $e^{i(A_+ + A_-)}=1$. Only the <i>signed</i> area — the symplectic form $\\omega=dq\\wedge dp$ — counts.',
      apply: () => setPreset('eight', 1.3, false),
    },
    {
      title: 'Tiny translations, exact commutator',
      text: 'For rotations $e^{\\epsilon X}e^{\\epsilon Y}e^{-\\epsilon X}e^{-\\epsilon Y}=e^{\\epsilon^2[X,Y]+O(\\epsilon^3)}$. Here the readout gives exactly $(0,0,\\epsilon^2)$ for every $\\epsilon$: $[X,Y]=Z$ is central, so the BCH series stops after the first bracket. Move the $\\epsilon$ slider.',
      apply: () => setComm(0.35),
    },
    {
      title: 'Reverse the orientation',
      text: 'Run the same circle clockwise: the dial turns the other way and the lift descends, $e^{i\\brk{A}}\\to e^{-i\\brk{A}}$. Time reversal (complex conjugation) flips the sign of the phase-space area.',
      apply: () => setPreset('circle', 1, true),
    },
    {
      title: 'Area $2\\pi\\hbar$ is invisible',
      text: 'A circle of radius $\\sqrt2$ has area $2\\pi$, so $e^{i\\brk{A}}=1$: the lift gap is one full turn of the phase. Loops of area $h=2\\pi\\hbar$ cannot be detected — the reason a quantum state occupies a phase-space cell of area $h$ (Bohr–Sommerfeld, Weyl’s state counting).',
      apply: () => setPreset('circle', Math.SQRT2 / 1.25, false),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p><b>Left.</b> A closed path in the phase plane, walked by many small translations
    $\\grp{D(\\delta q,\\delta p)}=e^{i(\\delta p\\,x-\\delta q\\,p)}$, each generated by the orange vector
    $\\dot q\\,\\alg{X}+\\dot p\\,\\alg{Y}$. The signed enclosed area is shaded: pink where the loop winds counter-clockwise,
    blue where it winds clockwise (darker = wound twice). The dial accumulates the phase of the state.</p>
    <p><b>Right.</b> The same walk in the Heisenberg group. The point $(q,p,\\varphi)$ stands for the state
    $e^{i\\varphi}D(q,p)\\psi_0$; a further step $D(\\delta)$ moves it to $(q,p,\\varphi)\\cdot(\\delta,0)$. So the state climbs
    along the <b>horizontal lift</b>, everywhere tangent to the orange contact planes, which tilt more and more as you move
    away from the origin:</p>
    $$\\varphi(t)=\\tfrac12\\int_0^t (q\\,\\dot p-p\\,\\dot q)\\,dt^\\prime,\\qquad
      \\varphi_{\\rm end}-\\varphi_{\\rm start}=\\oint\\tfrac12(q\\,dp-p\\,dq)=\\iint_{\\rm inside}dq\\,dp=\\brk{A}.$$
    <p>The projection closes, the lift does not: it ends exactly $\\brk{A}$ above its start (pink gap), and
    $\\psi_{\\rm final}=e^{+i\\brk{A}}\\psi_{\\rm initial}$ for a counter-clockwise loop. The height part-way round depends on the
    choice of reference states $D(q,p)\\psi_0$ (here the symmetric gauge); the closed-loop value does not. The vertical axis is
    drawn compressed when the lift is tall.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>A step in $q$ and a step in $p$ commute only up to
    the phase $e^{i\\,\\delta q\\,\\delta p}$ of the little square they span. Tile the loop with such squares: interior edges are
    walked twice in opposite directions and cancel, and the phases multiply to $e^{i\\brk{A}}$ — Stokes’ theorem, with the
    commutator playing the role of curvature (compare <a href="#/loops">commutators as small loops</a>).</div>`);

  pg.note(`<h2>The physics</h2>
    <p>The canonical commutator $[x,p]=i\\hbar$ says that momentum generates translations in position and position generates
    translations (kicks) in momentum:</p>
    $$e^{-iq_0p}\\,\\psi(x)=\\psi(x-q_0),\\qquad e^{ip_0x}\\,\\psi(x)=e^{ip_0x}\\psi(x),\\qquad
      e^{-iq_0p}\\,e^{ip_0x}=e^{-iq_0p_0}\\;e^{ip_0x}\\,e^{-iq_0p}.$$
    <p>The last line is the <b>Weyl form</b> of the commutation relations: the two translation groups commute only up to a phase.
    Combined into the displacement operator,</p>
    $$\\grp{D(q_0,p_0)}=e^{i(p_0x-q_0p)},\\qquad (D\\psi)(x)=e^{ip_0x-iq_0p_0/2}\\,\\psi(x-q_0),$$
    $$\\grp{D(a)D(b)}=e^{-\\frac i2\\,\\omega(a,b)}\\,\\grp{D(a+b)},\\qquad \\omega(a,b)=a_qb_p-a_pb_q .$$
    <p>Multiplying the displacements around a closed polygon (later steps on the left) gives
    $\\prod D(\\delta z_k)=e^{\\,i\\brk{A}/\\hbar}\\,\\id$, with $\\brk{A}$ the signed area, counter-clockwise positive in the
    $(q,p)$ plane. The phase is the only trace the loop leaves.</p>
    <div class="callout physics"><span class="callout-title">Uncertainty is non-commutativity</span>Because $[x,p]=i$ is a
    non-zero multiple of $\\id$, Robertson’s inequality gives $\\Delta x\\,\\Delta p\\ge\\tfrac12|\\langle[x,p]\\rangle|=\\tfrac12$
    in <i>every</i> state. If translations in $q$ and $p$ commuted, $x$ and $p$ could be diagonalised together — the area phase
    is exactly what forbids it. The same group reappears as coherent states of light, geometric phase gates in ion traps
    (a spin-dependent force drives a loop in phase space), Landau levels and the Aharonov–Bohm effect (other tabs).</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>The Heisenberg algebra $\\hh_3$ has basis $\\alg{X},\\alg{Y},\\alg{Z}$ with</p>
    $$\\brk{[\\alg{X},\\alg{Y}]}=\\alg{Z},\\qquad [\\alg{X},\\alg{Z}]=[\\alg{Y},\\alg{Z}]=0,$$
    <p>realised by $X=E_{12}$, $Y=E_{23}$, $Z=E_{13}$ in strictly upper-triangular $3\\times3$ matrices (2-step nilpotent).
    In exponential coordinates $(q,p,\\varphi)=\\exp(qX+pY+\\varphi Z)$ the BCH series stops,
    $e^Ue^V=e^{U+V+\\frac12[U,V]}$, which gives the polarised law used on the right,</p>
    $$(q,p,\\varphi)(q^\\prime,p^\\prime,\\varphi^\\prime)=\\bigl(q+q^\\prime,\\;p+p^\\prime,\\;\\varphi+\\varphi^\\prime+\\tfrac12(qp^\\prime-pq^\\prime)\\bigr).$$
    <p>Left-invariant vector fields $X=\\partial_q-\\tfrac p2\\partial_\\varphi$, $Y=\\partial_p+\\tfrac q2\\partial_\\varphi$, $Z=\\partial_\\varphi$
    span the contact planes $\\ker\\alpha$, $\\alpha=d\\varphi-\\tfrac12(q\\,dp-p\\,dq)$, with $d\\alpha=-\\,dq\\wedge dp$: the
    distribution is maximally non-integrable, and the failure of a horizontal loop to close is the integral of the curvature
    $dq\\wedge dp$. Physically, $\\hh_3$ is spanned by $ix$, $ip$, $i\\id$ with $[x,p]=i\\id$ — the centre $Z\\leftrightarrow i\\hbar$ is the
    $U(1)$ of phases (<a href="#/u1">U(1)</a>).</p>
    <p><b>Stone–von Neumann.</b> Every irreducible unitary representation in which the centre acts as $e^{i\\hbar\\varphi}$ with
    $\\hbar\\neq0$ is unitarily equivalent to the Schrödinger representation on $L^2(\\R)$. Quantum mechanics of one degree of
    freedom is therefore unique; the linear symplectic group <a href="#/sp2">Sp(2,ℝ)</a> acts on $H_3$ by automorphisms and lifts
    to the metaplectic representation. Exact BCH for nilpotent algebras is explored in <a href="#/loops">commutators as small loops</a>.</p>`);

  // ------------------------------------------------------------------ state changes
  function setPreset(kind, size, reversed) {
    S.kind = kind;
    S.size = size;
    S.reversed = reversed;
    seg.set(kind, { silent: true });
    sSize.set(size, { silent: true });
    tRev.set(reversed, { silent: true });
    changed(true);
  }
  function setComm(eps) {
    S.eps = eps;
    sEps.set(eps, { silent: true });
    S.kind = 'comm';
    S.reversed = false;
    seg.set(null, { silent: true });
    tRev.set(false, { silent: true });
    changed(true);
    updateComm();
  }
  function changed(restart) {
    rebuild();
    if (restart) {
      clock.restart();
      play.set(true);
    } else if (S.s >= 1) clock.restart();
    update3d();
    updateReadouts();
    p.invalidate();
  }
  function refreshMoving() {
    moveMarkers();
    updateLive();
    p.invalidate();
  }
  function updateReadouts() {
    const A = loop.area;
    out.set(
      `\\begin{gathered}\\prod_{\\rm loop}\\grp{D(\\delta q,\\delta p)}=e^{\\,i\\brk{A}}\\,\\id,\\qquad \\brk{A}=\\oint\\tfrac12(q\\,dp-p\\,dq)=${texNum(A, 3)}` +
        `\\\\ e^{\\,i\\brk{A}}=${texComplex({ re: Math.cos(A), im: Math.sin(A) }, 3)}\\end{gathered}`,
    );
    kv.set('signed area $\\brk{A}$', fmt(A, 3));
    kv.set('$\\brk{A}/2\\pi$ (turns of the phase)', fmt(A / M.TAU, 3));
    kv.set('lobes $A_+$, $A_-$', `${fmt(lob.plus.area, 2)}, ${fmt(lob.minus.area, 2)}`);
    updateLive();
  }
  function updateLive() {
    kv.set('lift height now, $\\varphi(t)$', fmt(M.loopAt(loop, S.s).phi, 2));
  }
  function updateComm() {
    const g = M.groupCommutator(S.eps);
    outC.set(
      `\\begin{gathered}\\grp{e^{\\epsilon X}e^{\\epsilon Y}e^{-\\epsilon X}e^{-\\epsilon Y}}=${texTuple(g, 4)}` +
        `\\\\ =\\grp{e^{\\epsilon^2\\brk{Z}}}\\ \\text{exactly},\\qquad \\epsilon^2=${texNum(S.eps * S.eps, 4)}\\end{gathered}`,
    );
  }

  scope.frame((dt) => {
    if (!play.playing || drawing) return;
    clock.step(dt);
    refreshMoving();
  });

  update3d();
  updateReadouts();
  updateComm();
}
