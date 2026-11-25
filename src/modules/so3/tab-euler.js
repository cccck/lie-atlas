// SO(3) tab (c) — Euler angles & gimbal lock: three nested gimbal rings realise R = R_a(ψ)R_b(θ)R_c(φ) as an
// intrinsic sequence. The instantaneous rotation axes (columns of the Euler-angle Jacobian) become coplanar at
// lock, det J → 0, and a perfectly smooth turn that passes near lock forces the outer ring to whip round.

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { plot2d } from '../../core/plot2d.js';
import { vec } from '../../core/la.js';
import { texMatrix, texNum, fmt, fmtDeg } from '../../core/format.js';
import { PI, gimbalFrames, eulerAxes, eulerJacobian, eulerDet, eulerToR, eulerFromR, flyPast, weakestDirection } from './math.js';
import { aeroplane, threeQuatFromR } from './body.js';
import { throttle, deg, toDeg, wrapPi, texTup } from './util.js';
import { axisAngleOf } from '../../core/la.js';

const NAMES = {
  zyx: { t: ['\\psi', '\\theta', '\\phi'], w: ['Yaw', 'Pitch', 'Roll'], ax: ['z', "y'", "x''"], det: '-\\cos\\theta' },
  zyz: { t: ['\\alpha', '\\beta', '\\gamma'], w: ['', '', ''], ax: ['z', "y'", "z''"], det: '-\\sin\\beta' },
};
const RING_COL = ['c1', 'c3', 'c4'];
const RING_R = [1.55, 1.37, 1.19];
const RING_NORMAL = { zyx: [0, 2, 1], zyz: [0, 0, 1] }; // local axis normal to each ring's plane
const PERIOD = 14; // seconds per uniform turn in fly-past mode
const N_FLY = 1440;

export function mountEuler(pg, scope, ctx) {
  const S = (ctx.state.c ??= { conv: 'zyx', mode: 'fly', ang: [deg(30), deg(55), deg(20)], delta: deg(6), u: 0.02, playing: true });

  // ------------------------------------------------------------------ views
  const vG = pg.view({ title: 'Three nested gimbals carrying the body', hint: 'drag to orbit · scroll to zoom', height: 480 });
  const vP = pg.view({ title: '', hint: '', height: 480 });

  const k = scene3d(vG.body, scope, { camera: [4.7, 3.3, 2.35], target: [0, 0, -0.12], minDistance: 2.5, maxDistance: 16 });
  k.line([[0, 0, -2.05], [0, 0, 2.15]], { color: 'axis', width: 1, opacity: 0.8, dashed: true, dashSize: 0.08, gapSize: 0.06 });
  k.label('z', [0, 0, 2.27], { color: 'muted', small: true });
  k.line([[0, 0, -RING_R[0] - 0.2], [0, 0, -2.05]], { color: 'muted', width: 4 });
  k.line([[-0.5, 0, -2.05], [0.5, 0, -2.05]], { color: 'muted', width: 4 });
  k.line([[0, -0.5, -2.05], [0, 0.5, -2.05]], { color: 'muted', width: 4 });
  const rings = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    k.root.add(g);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_R[i], 0.03, 10, 128), k.material(RING_COL[i], { roughness: 0.4, metalness: 0.15 }));
    g.add(mesh);
    const axles = [k.line([], { color: RING_COL[i], width: 4 }), k.line([], { color: RING_COL[i], width: 4 })];
    return { g, mesh, axles };
  });
  const plane = aeroplane(k, { scale: 0.8 });
  const axArrows = [0, 1, 2].map(() => k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.014, headLength: 0.11, headRadius: 0.04 }));
  const axLabels = [0, 1, 2].map((i) => k.label(`\\alg{\\hat a_${i + 1}}`, [0, 0, 0], { offset: [12, -6] }));
  const lost = k.line([], { color: 'brk', width: 2, dashed: true, dashSize: 0.07, gapSize: 0.05 });
  const lostLabel = k.label('\\brk{\\text{lost direction}}', [0, 0, 0], { small: true, offset: [10, 10] });
  const ov = vG.overlay('tr');
  const ovLegend = vP.overlay('tl', 'overlay-card');

  // ---- plot
  let fly = null;
  let series = [];
  let detPts = [];
  let peakRate = 0;
  const P = plot2d(vP.body, scope, {
    x: [0, 1],
    y: [-1, 1],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: (p) => (S.mode === 'fly' ? drawFly(p) : drawManual(p)),
  });

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Gimbals');
  const segConv = ui.segmented(sec, {
    label: 'Convention',
    options: [
      { value: 'zyx', label: 'yaw–pitch–roll $zyx$' },
      { value: 'zyz', label: 'Wigner $zyz$' },
    ],
    value: S.conv,
    onChange: (v) => convChanged(v),
  });
  const segMode = ui.segmented(sec, {
    label: 'Motion',
    options: [
      { value: 'fly', label: 'Uniform turn past lock' },
      { value: 'manual', label: 'Set the angles' },
    ],
    value: S.mode,
    onChange: (v) => modeChanged(v),
  });
  const sl = [0, 1, 2].map((i) =>
    ui.slider(sec, {
      label: '',
      min: -PI,
      max: PI,
      step: 0.0025,
      value: S.ang[i],
      format: (x) => fmtDeg(x, 1),
      onInput: (x) => {
        if (S.mode !== 'manual') segMode.set('manual');
        S.ang[i] = x;
        dirty = true;
      },
    }),
  );
  const sDelta = ui.slider(sec, {
    label: 'Closest approach to lock $\\delta$',
    min: deg(1),
    max: deg(40),
    step: 0.0025,
    value: S.delta,
    format: (x) => fmtDeg(x, 1),
    onInput: (x) => {
      S.delta = x;
      recomputeFly();
      if (S.mode !== 'fly') segMode.set('fly');
      dirty = true;
    },
  });
  const row = ui.buttons(sec, []);
  const play = ui.playButton(row, {
    playing: S.playing,
    onToggle: (on) => {
      S.playing = on;
      if (on && S.mode !== 'fly') segMode.set('fly');
    },
  });
  ui.button(row, { label: 'Lock it', onClick: () => lockIt() });
  ui.button(row, {
    label: 'Reset',
    kind: 'ghost',
    onClick: () => {
      segConv.set('zyx');
      S.delta = deg(6);
      sDelta.set(S.delta, { silent: true });
      recomputeFly();
      S.u = 0.02;
      segMode.set('fly');
      play.set(true);
    },
  });

  const secR = pg.section('Readout');
  const out = ui.readout(secR, { label: 'Jacobian $\\vec\\omega=J\\,\\dot{\\vec q}$, columns $=$ instantaneous axes $\\alg{\\hat a_k}$' });
  const kv = ui.keyValue(secR, [
    ['Orientation $\\grp R$', ''],
    ['Smallest singular value of $J$', ''],
    ['Outer-ring rate / body rate', ''],
  ]);
  const legendBox = ui.h('div');
  secR.appendChild(legendBox);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Gimbal lock',
      text: 'Pitch $90^\\circ$: the middle ring swings into the plane of the outer ring, $\\alg{\\hat a_1}$ (yaw) and $\\alg{\\hat a_3}$ (roll) become antiparallel, and all three axes lie in one plane: $\\det J=-\\cos\\theta=0$. Move yaw or roll — both turn the body about the same vertical axis (only $\\psi-\\phi$ matters), and no angle rate produces a rotation about the dashed direction.',
      apply: () => {
        segConv.set('zyx');
        segMode.set('manual');
        setAngles([deg(30), deg(90), deg(20)]);
      },
    },
    {
      title: 'A smooth turn, a frantic gimbal',
      text: 'The body turns at a constant rate about a fixed axis and passes $2^\\circ$ from lock. Nothing special happens to the body, yet the outer ring has to whip round by $\\approx180^\\circ$ almost at once: its rate peaks near $1/\\delta\\approx29\\times$ the body rate. Real gimbal motors cannot follow — the platform tumbles.',
      apply: () => {
        segConv.set('zyx');
        S.delta = deg(2);
        sDelta.set(S.delta, { silent: true });
        recomputeFly();
        S.u = 0.08;
        segMode.set('fly');
        play.set(true);
      },
    },
    {
      title: 'The singularity is in the chart',
      text: 'This sets up the locked orientation in $zyx$ and then relabels the <em>same</em> orientation with Wigner’s $zyz$ angles: now $\\beta=90^\\circ$ and $|\\det J|=1$, perfectly regular. Every orientation is regular in some chart — $SO(3)$ is a smooth homogeneous manifold; only the coordinates break down.',
      apply: () => {
        segConv.set('zyx');
        segMode.set('manual');
        setAngles([deg(30), deg(90), deg(20)]);
        segConv.set('zyz');
      },
    },
    {
      title: 'Wigner’s angles lock at the identity',
      text: 'In $zyz$ the lock sits at $\\beta=0$ — the unrotated body. There only $\\alpha+\\gamma$ is defined, and accordingly $D^{j}_{m\'m}(\\alpha,0,\\gamma)=\\delta_{m\'m}\\,e^{-im(\\alpha+\\gamma)}$ (<a href="#/reps">representations</a>).',
      apply: () => {
        segConv.set('zyz');
        segMode.set('manual');
        setAngles([deg(50), 0, deg(-20)]);
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>The outer ring turns about the fixed vertical $z$; the middle ring turns about an axis carried by the outer ring;
    the inner ring, which holds the body, turns about an axis carried by the middle ring. This realises
    $$\\grp R=R_z(\\psi)\\,R_y(\\theta)\\,R_x(\\phi)\\quad(zyx),\\qquad \\grp R=R_z(\\alpha)\\,R_y(\\beta)\\,R_z(\\gamma)\\quad(zyz)$$
    as an <em>intrinsic</em> sequence $z,y',x''$ — equivalently the extrinsic sequence in reverse order. The orange arrows
    are the three ring axes $\\alg{\\hat a_k}$: the angular velocity is $\\vec\\omega=\\dot\\psi\\,\\hat a_1+\\dot\\theta\\,\\hat a_2+\\dot\\phi\\,\\hat a_3$.
    The right panel follows the angles during a uniform turn (or $|\\det J|$ against the middle angle).</p>`);
  pg.note(`<h2>The mathematics</h2>
    <p>The columns of the Jacobian are the ring axes; for $zyx$, $\\hat a_1=\\hat z$, $\\hat a_2=R_z(\\psi)\\hat y$,
    $\\hat a_3=R_z(\\psi)R_y(\\theta)\\hat x$, and
    $$\\det J=\\hat a_1\\cdot(\\hat a_2\\times\\hat a_3)=-\\cos\\theta\\quad(zyx),\\qquad -\\sin\\beta\\quad(zyz).$$
    Where it vanishes the axes are coplanar, the map from angles to rotations has rank 2, and one direction of
    $\\vec\\omega$ cannot be produced by any $\\dot{\\vec q}$; near it, $\\dot{\\vec q}=J^{-1}\\vec\\omega$ blows up like $1/\\delta$.
    The same factor appears in the Haar measure, $d\\mu=\\frac{1}{8\\pi^2}\\sin\\beta\\,d\\alpha\\,d\\beta\\,d\\gamma$.</p>
    <div class="callout intuition"><span class="callout-title">Why no three angles can work</span>Three periodic angles
    define a smooth map $T^3\\to SO(3)$. Without critical points it would be a covering map, but the only connected covers of
    $SO(3)$ are $SO(3)$ and $SU(2)\\cong S^3$, neither a torus ($\\pi_1(T^3)=\\Z^3$ cannot inject into $\\Z_2$). So
    <em>every</em> three-angle scheme has a gimbal lock somewhere; the manifold itself is perfectly smooth.</div>`);
  pg.note(`<h2>The physics</h2>
    <p><strong>Spacecraft.</strong> An inertial platform on three gimbals tumbles near lock. The Apollo guidance computer
    warned the crew as the middle gimbal approached it, and Michael Collins asked Mission Control for “a fourth gimbal for
    Christmas”. Attitude software therefore integrates unit quaternions $q=(\\cos\\frac\\theta2,\\sin\\frac\\theta2\\hat n)$ — four numbers,
    one constraint, no singularity, and once more the double cover $SU(2)\\to SO(3)$ (<a href="#/su2">SU(2)</a>).</p>
    <p><strong>Quantum mechanics.</strong> Euler angles survive where they factorise: in the $zyz$ convention
    $$D^{j}_{m'm}(\\alpha,\\beta,\\gamma)=\\langle jm'|e^{-i\\alpha J_z}e^{-i\\beta J_y}e^{-i\\gamma J_z}|jm\\rangle=e^{-im'\\alpha}\\,d^{\\,j}_{m'm}(\\beta)\\,e^{-im\\gamma},$$
    because $J_z$ is diagonal in $|jm\\rangle$ (<a href="#/reps">multiplets</a>). The symmetric top is solved in the same angles,
    with $p_\\alpha$ and $p_\\gamma$ conserved. The coordinate singularity is harmless there — it is just a pole of the chart.</p>`);

  // ------------------------------------------------------------------ logic
  let dirty = true;
  let curConv = S.conv;
  const readoutThrottle = throttle(100);

  function midRange(conv = S.conv) {
    return conv === 'zyx' ? [-PI / 2, PI / 2] : [0, PI];
  }
  function relabel() {
    const N = NAMES[S.conv];
    sl.forEach((s, i) => {
      s.setLabel(`${N.w[i] ? N.w[i] + ' ' : ''}$${N.t[i]}$ <span style="color:var(--muted)">about $${N.ax[i]}$</span>`);
      if (i === 1) s.setRange(...midRange(), 0.0025);
    });
    const leg = [0, 1, 2].map((i) => ({ color: RING_COL[i], label: `${['outer', 'middle', 'inner'][i]} ring, $${N.t[i]}$` }));
    legendBox.innerHTML = '';
    ui.legend(legendBox, [...leg, { color: 'alg', label: 'axes $\\hat a_k$ (columns of $J$)' }, { color: 'brk', label: 'unreachable direction' }]);
    ovLegend.innerHTML = '';
    ui.legend(ovLegend, leg.map((l, i) => ({ color: l.color, label: `$${N.t[i]}$` })));
    const nrm = RING_NORMAL[S.conv];
    rings.forEach((r, i) => {
      r.mesh.rotation.set(0, 0, 0);
      if (nrm[i] === 0) r.mesh.rotation.y = PI / 2;
      else if (nrm[i] === 1) r.mesh.rotation.x = -PI / 2;
    });
  }
  function recomputeFly() {
    fly = flyPast(S.conv, S.delta, N_FLY);
    series = [0, 1, 2].map((c) => {
      const pts = [];
      let prev = null;
      fly.angles.forEach((a, i) => {
        const y = toDeg(wrapPi(a[c]));
        if (prev !== null && Math.abs(y - prev) > 180) pts.push([NaN, NaN]);
        pts.push([i / N_FLY, y]);
        prev = y;
      });
      return pts;
    });
    detPts = fly.dets.map((d, i) => [i / N_FLY, -300 + 80 * Math.abs(d)]);
    peakRate = 0;
    for (let i = 1; i < N_FLY; i++) peakRate = Math.max(peakRate, Math.abs(rateAt(i)));
  }
  function rateAt(i) {
    const j0 = Math.max(0, i - 1);
    const j1 = Math.min(N_FLY, i + 1);
    return (fly.angles[j1][0] - fly.angles[j0][0]) / (fly.ts[j1] - fly.ts[j0]);
  }
  const flyIndex = () => Math.min(N_FLY, Math.max(0, Math.round(S.u * N_FLY)));
  function currentAngles() {
    if (S.mode === 'fly') return fly.angles[flyIndex()];
    return S.ang;
  }
  function setAngles(a) {
    S.ang = a.slice();
    syncSliders();
    dirty = true;
  }
  function syncSliders() {
    const a = currentAngles();
    sl.forEach((s, i) => s.set(i === 1 ? a[1] : wrapPi(a[i]), { silent: true }));
  }
  function lockIt() {
    segMode.set('manual');
    const a = S.ang.slice();
    a[1] = S.conv === 'zyx' ? PI / 2 : 0;
    setAngles(a);
  }
  function convChanged(v) {
    const old = curConv;
    const R = eulerToR(old, currentAngles());
    S.conv = curConv = v;
    if (S.mode === 'manual' || old !== v) {
      const a = eulerFromR(v, R, S.ang)[0];
      S.ang = [wrapPi(a[0]), a[1], wrapPi(a[2])];
    }
    relabel();
    recomputeFly();
    setPlotView();
    syncSliders();
    dirty = true;
  }
  function modeChanged(v) {
    if (v === 'manual' && S.mode === 'fly' && fly) {
      const a = fly.angles[flyIndex()];
      S.ang = [wrapPi(a[0]), a[1], wrapPi(a[2])];
      if (play.playing) play.set(false, { silent: true }), (S.playing = false);
    }
    S.mode = v;
    setPlotView();
    syncSliders();
    dirty = true;
  }
  function setPlotView() {
    if (S.mode === 'fly') {
      vP.setTitle('Euler angles during a uniform turn');
      vP.setHint('angles wrapped to $(-180^\\circ,180^\\circ]$');
      ovLegend.style.display = '';
      P.setView({ x: [-0.14, 1.03], y: [-345, 205] });
    } else {
      const [lo, hi] = midRange().map(toDeg);
      vP.setTitle(`$|\\det J|$ against the middle angle $${NAMES[S.conv].t[1]}$`);
      vP.setHint('drag the middle slider');
      ovLegend.style.display = 'none';
      const w = hi - lo;
      P.setView({ x: [lo - 0.16 * w, hi + 0.06 * w], y: [-0.22, 1.25] });
    }
  }

  scope.frame((dt) => {
    if (play.playing && S.mode === 'fly') {
      S.u = (S.u + dt / PERIOD) % 1;
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  });

  // ------------------------------------------------------------------ drawing
  function drawFly(p) {
    for (const y of [-180, -90, 0, 90, 180]) {
      p.line([[0, y], [1, y]], { color: 'grid', width: 1 });
      p.text(`${y < 0 ? '−' : y > 0 ? '+' : ''}${Math.abs(y)}°`, [0, y], { align: 'right', size: 10.5, color: 'muted', offset: [-6, 0] });
    }
    series.forEach((pts, i) => p.line(pts, { color: RING_COL[i], width: 2 }));
    const B0 = -300;
    p.line([[0, B0], [1, B0]], { color: 'axis', width: 1 });
    p.line([[0, B0 + 80], [1, B0 + 80]], { color: 'grid', width: 1 });
    p.polygon([[0, B0], ...detPts, [1, B0]], { fill: 'brk', alpha: 0.16 });
    p.line(detPts, { color: 'brk', width: 1.8 });
    p.text('|det J|', [0, B0 + 40], { align: 'right', size: 10.5, color: 'brk', offset: [-6, 0] });
    p.text('1', [0, B0 + 80], { align: 'right', size: 10, color: 'muted', offset: [-6, 0] });
    p.text('0', [0, B0], { align: 'right', size: 10, color: 'muted', offset: [-6, 0] });
    p.text('fraction of one uniform turn →', [1, B0], { align: 'right', baseline: 'top', size: 10.5, color: 'muted', offset: [0, 6] });
    const i = flyIndex();
    const u = i / N_FLY;
    p.line([[u, B0], [u, 192]], { color: 'hi', width: 1.3, alpha: 0.9 });
    fly.angles[i].forEach((a, c) => p.dot([u, toDeg(wrapPi(a))], { r: 4, color: RING_COL[c] }));
    p.dot([u, B0 + 80 * Math.abs(fly.dets[i])], { r: 3.5, color: 'brk' });
  }
  function drawManual(p) {
    const [lo, hi] = midRange().map(toDeg);
    for (const y of [0, 0.5, 1]) {
      p.line([[lo, y], [hi, y]], { color: y ? 'grid' : 'axis', width: 1 });
      p.text(fmt(y, 1), [lo, y], { align: 'right', size: 10.5, color: 'muted', offset: [-6, 0] });
    }
    for (let x = lo; x <= hi + 1e-9; x += 45) p.text(`${x < 0 ? '−' : ''}${Math.abs(x)}°`, [x, 0], { align: 'center', baseline: 'top', size: 10.5, color: 'muted', offset: [0, 5] });
    const pts = [];
    for (let j = 0; j <= 180; j++) {
      const m = lo + ((hi - lo) * j) / 180;
      pts.push([m, Math.abs(eulerDet(S.conv, [0, deg(m), 0]))]);
    }
    p.polygon([[lo, 0], ...pts, [hi, 0]], { fill: 'brk', alpha: 0.12 });
    p.line(pts, { color: 'brk', width: 2.2 });
    for (const x of [lo, hi]) {
      p.line([[x, 0], [x, 1.1]], { color: 'hi', width: 1.2, dash: [4, 4] });
      p.text('lock', [x, 1.1], { align: 'center', baseline: 'bottom', size: 10.5, color: 'hi', offset: [0, -2] });
    }
    const m = toDeg(S.ang[1]);
    p.dot([m, Math.abs(eulerDet(S.conv, S.ang))], { r: 5, color: RING_COL[1] });
    p.tex(`|\\det J|=|${NAMES[S.conv].det}|`, [(lo + hi) / 2, 1.18], { small: true, color: 'brk' });
  }

  function draw() {
    const ang = currentAngles();
    const F = gimbalFrames(S.conv, ang);
    rings.forEach((r, i) => threeQuatFromR(F[i], r.g.quaternion));
    plane.setR(F[2]);
    const ax = eulerAxes(S.conv, ang);
    ax.forEach((a, i) => {
      axArrows[i].set([0, 0, 0], vec.scale(a, 2.0));
      axLabels[i].setPosition(vec.scale(a, 2.05));
      const rIn = RING_R[i];
      const rOut = i === 0 ? RING_R[0] + 0.2 : RING_R[i - 1];
      rings[i].axles[0].setPoints([vec.scale(a, rIn), vec.scale(a, rOut)]);
      rings[i].axles[1].setPoints([vec.scale(a, -rIn), vec.scale(a, -rOut)]);
    });
    const d = eulerDet(S.conv, ang);
    const near = Math.abs(d) < 0.3;
    if (near) {
      const w = weakestDirection(S.conv, ang).dir;
      lost.setPoints([vec.scale(w, -1.95), vec.scale(w, 1.95)]);
      lostLabel.setPosition(vec.scale(w, 1.95));
    } else lost.setPoints([]);
    lostLabel.setVisible(near);
    P.invalidate();
    readoutThrottle(() => readouts(ang, d));
  }

  function readouts(ang, d) {
    const N = NAMES[S.conv];
    const Jm = eulerJacobian(S.conv, ang);
    out.set(`J=${texMatrix(Jm, 2)},\\quad \\det J=${N.det}=${texNum(d, 3)}`);
    const aa = axisAngleOf(eulerToR(S.conv, ang));
    kv.set('Orientation $\\grp R$', `${fmtDeg(aa.angle, 0)} about $${texTup(aa.axis, 2)}$`);
    kv.set('Smallest singular value of $J$', fmt(weakestDirection(S.conv, ang).sigmaMin, 3));
    kv.set('Outer-ring rate / body rate', S.mode === 'fly' ? `${fmt(Math.abs(rateAt(flyIndex())), 1)} (peak ${fmt(peakRate, 1)})` : '— (fly-past only)');
    const kind = Math.abs(d) < 0.02 ? 'bad' : Math.abs(d) < 0.15 ? 'warn' : 'good';
    const word = kind === 'bad' ? 'gimbal lock' : kind === 'warn' ? 'near lock' : 'regular';
    ov.innerHTML = '';
    ui.badge(ov, `${word} · $\\det J=${texNum(d, 2)}$`, kind);
  }

  relabel();
  recomputeFly();
  setPlotView();
  syncSliders();
  draw();
}
