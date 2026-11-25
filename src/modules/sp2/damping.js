// sp2 · tab "Damping: leaving Sp(2)": the damped oscillator q'' + γ q' + ω² q = 0, whose generator has trace −γ.
// Left: phase plane with a shrinking blob (det e^{tX} = e^{−γt}); right: the trace–determinant plane.
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { mat, clamp, exp2 } from '../../core/la.js';
import { fmt, texMatrix } from '../../core/format.js';
import { dampedGenerator, splitTrace, traceDetType, discPolygon, sectorPolygon, mapPoints, polygonArea, realEigenvectors } from './math.js';
import { throttle, axisLabels } from './common.js';

const T_MAX = 14;
const BLOB_R = 0.4;
const GR = [-1, 3]; // γ range
const WR = [-1.2, 3]; // ω² range

const REGION_COLOR = {
  centre: 'c3',
  'spiral-sink': 'c1',
  'spiral-source': 'c8',
  'node-sink': 'c1',
  'node-source': 'c8',
  'degenerate-sink': 'c1',
  'degenerate-source': 'c8',
  saddle: 'hi',
  line: 'muted',
  zero: 'muted',
};

export function mountDamping(pg, scope, ctx) {
  const S = (ctx.state.damp ??= { gamma: 0.3, w2: 1, t: 0, z0: [1.5, 0.4], playing: true, showHam: true });
  let dragging = false;

  const X = () => dampedGenerator(S.gamma, S.w2);
  const flowAt = (t) => exp2(mat.scale(X(), t));
  const disc0 = () => discPolygon(S.z0, BLOB_R, 140);
  const sector0 = () => sectorPolygon(S.z0, BLOB_R, 0, Math.PI / 2, 24);

  const v1 = pg.view({ title: 'Phase plane $(q,\\dot q)$ · $\\grp{e^{tX}}$, $\\det=e^{-\\gamma t}$', hint: 'drag the blob · scroll to zoom' });
  const v2 = pg.view({ title: 'Trace–determinant plane of $\\alg X$', hint: 'drag the point: $\\tau=-\\gamma$, $\\det X=\\omega^2$' });

  // trajectories from a ring of starting points (cached per X)
  let trajKey = '';
  let trajs = [];
  function trajectories() {
    const key = `${S.gamma.toFixed(4)},${S.w2.toFixed(4)}`;
    if (key === trajKey) return trajs;
    trajKey = key;
    trajs = [];
    const starts = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI + 0.2;
      starts.push([2.6 * Math.cos(a), 2.6 * Math.sin(a)]);
    }
    const Xm = X();
    const h = 0.04;
    const step = exp2(mat.scale(Xm, h));
    const stepB = exp2(mat.scale(Xm, -h));
    for (const z0 of starts) {
      // forward until it reaches the origin or leaves; backward a little for sources
      const pts = [z0];
      let z = z0;
      for (let i = 0; i < 1200; i++) {
        z = mat.mulv(step, z);
        const r = Math.hypot(z[0], z[1]);
        if (!(r < 12) || r < 0.01) break;
        pts.push(z);
      }
      const back = [];
      z = z0;
      for (let i = 0; i < 1200; i++) {
        z = mat.mulv(stepB, z);
        const r = Math.hypot(z[0], z[1]);
        if (!(r < 12) || r < 0.01) break;
        back.push(z);
      }
      trajs.push([...back.reverse(), ...pts]);
    }
    return trajs;
  }

  const p = plot2d(v1.body, scope, {
    x: [-3, 3],
    y: [-3, 3],
    draw(p) {
      axisLabels(p, 'q', '\\dot q');
      const Xm = X();
      for (const tr of trajectories()) p.line(tr, { color: 'grp', width: 1, alpha: 0.32 });
      p.vectorField((q, v) => mat.mulv(Xm, [q, v]), { color: 'alg', step: 40, alpha: 0.48, width: 1.1 });
      const type = traceDetType(-S.gamma, S.w2);
      if (type.key === 'saddle' || type.key.startsWith('node') || type.key.startsWith('degenerate')) {
        const ev = realEigenvectors(Xm);
        if (ev)
          for (const e of ev)
            p.line(
              [
                [-9 * e.vec[0], -9 * e.vec[1]],
                [9 * e.vec[0], 9 * e.vec[1]],
              ],
              { color: 'ink2', width: 1, dash: [5, 4], alpha: 0.6 },
            );
      }
      const D0 = disc0();
      p.polygon(D0, { stroke: 'muted', width: 1.2, dash: [4, 4] });
      const M = flowAt(S.t);
      if (S.showHam) {
        // the Hamiltonian part e^{tX₀} = e^{γt/2} e^{tX}: same shape, area preserved
        const { X0 } = splitTrace(Xm);
        const M0 = exp2(mat.scale(X0, S.t));
        p.polygon(mapPoints(M0, D0), { stroke: 'grp', width: 1.3, dash: [3, 4], strokeAlpha: 0.75 });
      }
      p.polygon(mapPoints(M, D0), { fill: 'grp', alpha: 0.22, stroke: 'grp', width: 1.8 });
      p.polygon(mapPoints(M, sector0()), { fill: 'grp', alpha: 0.55 });
    },
  });
  p.handle({
    get: () => mat.mulv(flowAt(S.t), S.z0),
    set: (z) => {
      S.z0 = [clamp(z[0], -3.5, 3.5), clamp(z[1], -3.5, 3.5)];
      S.t = 0;
      tSlider.set(0, { silent: true });
      refresh(true);
    },
    onStart: () => (dragging = true),
    onEnd: () => (dragging = false),
    color: 'grp',
    r: 6,
  });

  // trace–determinant plane
  const q = plot2d(v2.body, scope, {
    x: [-3.3, 3.3],
    y: [-1.6, 3.5],
    equal: false,
    pan: false,
    zoom: false,
    grid: true,
    axes: true,
    draw(p) {
      const v = p.view;
      p.tex('\\tau=\\tr X', [v.x[1], 0], { key: 'tx', align: 'right', offset: [-6, 12], small: true });
      p.tex('\\det X', [0, p.wy(52)], { key: 'dx', align: 'left', offset: [7, 0], small: true });
      // parabola τ² = 4 det
      const par = [];
      for (let i = 0; i <= 200; i++) {
        const tau = -3.3 + (6.6 * i) / 200;
        par.push([tau, (tau * tau) / 4]);
      }
      p.line(par, { color: 'ink2', width: 1.5, alpha: 0.8 });
      // shading: saddles below the axis; sources right, sinks left (spirals inside the parabola)
      p.polygon(
        [
          [v.x[0], 0],
          [v.x[1], 0],
          [v.x[1], v.y[0]],
          [v.x[0], v.y[0]],
        ],
        { fill: 'hi', alpha: 0.08 },
      );
      const left = par.filter(([t]) => t <= 0).reverse(); // from τ = 0 to the left edge
      const right = par.filter(([t]) => t >= 0); // from τ = 0 to the right edge
      p.polygon([[0, 0], ...left, [v.x[0], 0]], { fill: 'c1', alpha: 0.05 }); // stable nodes
      p.polygon([...left, [v.x[0], v.y[1]], [0, v.y[1]]], { fill: 'c1', alpha: 0.11 }); // stable spirals
      p.polygon([[0, 0], ...right, [v.x[1], 0]], { fill: 'c8', alpha: 0.05 }); // unstable nodes
      p.polygon([...right, [v.x[1], v.y[1]], [0, v.y[1]]], { fill: 'c8', alpha: 0.11 }); // unstable spirals
      // the Hamiltonian line τ = 0 (sp(2,R))
      p.segment([0, v.y[0]], [0, v.y[1]], { color: 'grp', width: 2.5, alpha: 0.85 });
      p.tex('\\sp(2,\\R)\\!:\\ \\tau=0', [0, 3.05], { key: 'sp', small: true, color: 'grp', align: 'right', offset: [-8, 0] });
      // region labels
      p.tex('\\text{saddle}', [0, -1.15], { key: 'l1', small: true, color: 'hi', align: 'left', offset: [10, 0] });
      p.tex('\\text{stable spiral}', [-0.9, 2.55], { key: 'l2', small: true, color: 'c1', align: 'right' });
      p.tex('\\text{unstable spiral}', [0.9, 2.55], { key: 'l3', small: true, color: 'c8', align: 'left' });
      p.tex('\\text{stable node}', [-2.4, 0.6], { key: 'l4', small: true, color: 'c1' });
      p.tex('\\text{unstable node}', [2.4, 0.6], { key: 'l5', small: true, color: 'c8' });
      p.tex('\\text{centre}', [0, 1.6], { key: 'l6', small: true, color: 'c3', align: 'left', offset: [9, 0] });
      p.tex('\\tau^2=4\\det X\\ \\text{(degenerate nodes)}', [2.05, 1.05], { key: 'l7', small: true, color: 'ink2', align: 'left', offset: [6, 6] });
      p.tex('\\det X=0\\text{: lines of fixed points}', [-3.2, 0], { key: 'l8', small: true, color: 'muted', align: 'left', offset: [0, 11] });
    },
  });
  q.handle({
    get: () => [-S.gamma, S.w2],
    set: ([tau, det]) => setParams(-tau, det),
    color: 'hi',
    r: 7,
    label: '\\alg X',
  });

  // ------------------------------------------------------------------ panel
  const secP = pg.section('Damped oscillator', { help: '$\\ddot q+\\gamma\\dot q+\\omega^2 q=0$, $\\;\\alg X=\\begin{pmatrix}0&1\\\\-\\omega^2&-\\gamma\\end{pmatrix}$' });
  const sG = ui.slider(secP, { label: 'Damping $\\gamma$', min: GR[0], max: GR[1], step: 0.01, value: S.gamma, onInput: (v) => setParams(v, S.w2, true) });
  const sW = ui.slider(secP, { label: 'Stiffness $\\omega^2$', min: WR[0], max: WR[1], step: 0.01, value: S.w2, onInput: (v) => setParams(S.gamma, v, true) });
  ui.toggle(secP, {
    label: 'Show the Hamiltonian part $e^{t\\alg X_0}$',
    value: S.showHam,
    onChange: (v) => {
      S.showHam = v;
      p.invalidate();
    },
  });
  const secF = pg.section('Flow');
  const tSlider = ui.slider(secF, {
    label: 'Time $t$',
    min: 0,
    max: T_MAX,
    step: 0.01,
    value: S.t,
    onInput: (v) => {
      S.t = v;
      refresh(true);
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  secF.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  ui.button(row, {
    label: 'Reset $t=0$',
    onClick: () => {
      S.t = 0;
      tSlider.set(0, { silent: true });
      refresh(true);
    },
  });

  const secR = pg.section('Readout');
  const badge = ui.badge(null, '', '');
  secR.appendChild(ui.h('div', { style: { margin: '2px 0 6px' } }, badge));
  const outX = ui.readout(secR, { label: 'Split into dissipation and a Hamiltonian flow' });
  const kv = ui.keyValue(secR, [
    ['$\\det e^{tX}=e^{-\\gamma t}$', ''],
    ['Blob area / initial', ''],
    ['Eigenvalues of $X$', ''],
  ]);
  ui.legend(secR, [
    { color: 'grp', label: 'blob $\\grp{e^{tX}}D$, trajectories' },
    { color: 'alg', label: 'vector field' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Damping shrinks area',
      text: '$\\gamma=0.3$, $\\omega=1$: a stable spiral. The blob spirals in and its area decays exactly as $e^{-\\gamma t}$ — the divergence of the flow is $\\tr X=-\\gamma$. The dashed outline is $e^{tX_0}D$: the same shape at constant area.',
      apply: () => setParams(0.3, 1, false, true),
    },
    {
      title: 'Critical damping',
      text: '$\\gamma=2\\omega$: the point sits on the parabola $\\tau^2=4\\det X$; the traceless part $X_0$ is parabolic (a shear). Fastest return without overshoot.',
      apply: () => setParams(2, 1, false, true),
    },
    {
      title: 'Overdamped',
      text: '$\\gamma=2.6$: a stable node. $X_0$ is now hyperbolic — a squeeze — combined with a uniform contraction faster than the squeeze, so every direction shrinks.',
      apply: () => setParams(2.6, 1, false, true),
    },
    {
      title: 'Anti-damping',
      text: '$\\gamma=-0.25$ (an amplifier, a laser below saturation, negative resistance): the spiral runs outwards and the area grows as $e^{+0.25t}$.',
      apply: () => setParams(-0.25, 1, false, true),
    },
    {
      title: 'Back on the Hamiltonian line',
      text: '$\\gamma=0$: the point lies on $\\tau=0$, the copy of $\\sp(2,\\R)$ inside $\\gl(2,\\R)$. Area is conserved again and the dashed and filled blobs coincide.',
      apply: () => setParams(0, 1, false, true),
    },
  ]);

  pg.note(`<h2>What you see</h2>
    <p>The damped oscillator as a linear flow $\\dot z=\\alg Xz$ on $z=(q,\\dot q)$. The filled blob is carried by
    $\\grp{e^{tX}}$; the dashed one by the traceless part alone. On the right, every real $2\\times2$ generator is placed by
    its trace and determinant: the parabola $\\tau^2=4\\det X$ separates spirals from nodes, the axis $\\det X=0$ separates
    saddles, and the vertical line $\\tau=0$ is $\\sp(2,\\R)$ — the Hamiltonian generators of the first tab.</p>`);
  pg.note(`<h2>The physics</h2>
    <p>Liouville's theorem is a statement about divergence: for $\\dot z=\\alg Xz$,
    $$\\frac{d}{dt}\\,\\text{Area}=\\operatorname{div}(\\alg Xz)\\,\\text{Area}=\\tr\\alg X\\,\\text{Area},\\qquad \\det e^{t\\alg X}=e^{t\\,\\tr\\alg X}=e^{-\\gamma t}.$$
    Every Hamiltonian flow is divergence-free; friction is not, so no Hamiltonian $H(q,\\dot q)$ generates it.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Since the identity commutes with
    everything, $e^{t\\alg X}=e^{-\\gamma t/2}\\,e^{t\\alg X_0}$ exactly: a damped oscillator is a Hamiltonian flow
    (elliptic for $\\gamma<2\\omega$, parabolic at critical damping, hyperbolic when overdamped) followed by a uniform
    shrinking of phase space. Underdamped motion therefore oscillates at $\\sqrt{\\omega^2-\\gamma^2/4}$, the frequency of
    $\\alg X_0$.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>$\\gl(2,\\R)=\\R\\,\\id\\oplus\\sl(2,\\R)$ is a direct sum of Lie algebras ($\\id$ is central), and correspondingly
    $GL^+(2,\\R)=\\R_{>0}\\times SL(2,\\R)$. The eigenvalues of $\\alg X$ are $\\tfrac{\\tau}{2}\\pm\\sqrt{\\tau^2/4-\\det X}$:
    complex (spirals, centres) above the parabola, real below it, of opposite sign (saddle) for $\\det X<0$. Only
    on $\\tau=0$ do they come in pairs $\\pm\\lambda$ — the symplectic symmetry of the spectrum.</p>
    <div class="callout warning"><span class="callout-title">A subtlety</span>A damped oscillator can be given a
    time-dependent Hamiltonian, $H=e^{-\\gamma t}p^2/2+e^{\\gamma t}\\omega^2q^2/2$ (Caldirola–Kanai), with canonical
    momentum $p=e^{\\gamma t}\\dot q$. Area in $(q,p)$ is conserved; area in $(q,\\dot q)$ — what is shown — shrinks.
    Genuine quantum dissipation needs a bath (Caldeira–Leggett).</div>`);

  // ------------------------------------------------------------------ updates
  function setParams(g, w2, fromSlider = false, restart = false) {
    S.gamma = clamp(g, GR[0], GR[1]);
    S.w2 = clamp(w2, WR[0], WR[1]);
    sG.set(S.gamma, { silent: true });
    sW.set(S.w2, { silent: true });
    if (restart || !fromSlider) {
      S.t = 0;
      tSlider.set(0, { silent: true });
    }
    if (restart && !S.playing) play.set(true);
    refresh(true);
    q.invalidate();
  }
  const gate = throttle(110);
  function refresh(force = false) {
    p.invalidate();
    if (!gate(force)) return;
    const Xm = X();
    const { scalar, X0 } = splitTrace(Xm);
    const type = traceDetType(-S.gamma, S.w2);
    badge.set(type.label, type.stable === true ? 'good' : type.stable === false ? 'bad' : 'warn');
    outX.set(`\\alg X=${texMatrix(Xm, 2)}=${fmt(scalar, 2).replace('−', '-')}\\,\\id+${texMatrix(X0, 2)}`);
    const M = flowAt(S.t);
    kv.set('$\\det e^{tX}=e^{-\\gamma t}$', `${fmt(mat.det(M), 4)} = ${fmt(Math.exp(-S.gamma * S.t), 4)}`);
    const D0 = disc0();
    kv.set('Blob area / initial', fmt(polygonArea(mapPoints(M, D0)) / polygonArea(D0), 4));
    const disc = S.gamma * S.gamma / 4 - S.w2;
    const re = -S.gamma / 2;
    kv.set(
      'Eigenvalues of $X$',
      disc >= 0 ? `${fmt(re + Math.sqrt(disc), 3)}, ${fmt(re - Math.sqrt(disc), 3)}` : `${fmt(re, 3)} ± ${fmt(Math.sqrt(-disc), 3)} i`,
    );
  }

  scope.frame((dt) => {
    if (!S.playing || dragging) return;
    let t = S.t + dt * 0.9;
    const M = flowAt(t);
    const c = mat.mulv(M, S.z0);
    const area = Math.abs(mat.det(M));
    const v = p.view;
    const R = Math.max(v.x[1] - v.x[0], v.y[1] - v.y[0]) * 0.75;
    if (t > T_MAX || area < 2e-3 || Math.hypot(c[0], c[1]) > R || area > 60) t = 0;
    S.t = t;
    tSlider.set(t, { silent: true });
    refresh();
  });

  refresh(true);
}
