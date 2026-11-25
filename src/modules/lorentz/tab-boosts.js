// Tab (a): boosts & rapidity in 1+1 D. Spacetime diagram (x horizontal, t vertical) with a lattice of clock ticks
// boosted actively by Λ(η) = exp(ηX); the exponential map ℝX → SO⁺(1,1) onto the unit hyperbola; β = tanh η.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { texMatrix, texNum, fmt } from '../../core/format.js';
import { clamp } from '../../core/la.js';
import { boostEvent, boost11, sectorPolygon, addVelocities } from './math.js';
import { throttled, rayExit } from './common.js';

const ETA_MAX = 3;
const ETA2_MAX = 2;
const AMP = 1.25; // amplitude of the default animation
const OMEGA = 0.42; // rad/s of the animation phase
const LX = 5; // lattice half-widths (events (x', t') with integer coordinates)
const LT = 6;

export function mountBoosts(pg, scope, ctx) {
  const S = (ctx.state.boosts ??= { eta1: 0.7, eta2: 0, playing: true, show: 'time', field: true });
  let amp = AMP;
  let phase = Math.asin(clamp(S.eta1 / AMP, -1, 1));
  const eta = () => S.eta1 + S.eta2;

  // ------------------------------------------------------------------ views
  const v1 = pg.view({ title: 'Spacetime diagram · events boosted by $\\grp{\\Lambda(\\eta)}$', hint: 'drag the tick $\\tau=1$ · scroll to zoom · double-click resets' });
  v1.el.classList.add('lz-tall');
  const half = 'calc((var(--view-h) - 12px) / 2)';
  const v2 = pg.view({ title: 'Algebra → group: $\\alg{\\eta X}\\mapsto\\grp{e^{\\eta X}}$', hint: 'drag the algebra point', height: half });
  v2.el.classList.add('lz-half');
  const v3 = pg.view({ title: 'Velocity $\\beta=\\tanh\\eta$ saturates', hint: 'drag along the curve', height: half });
  v3.el.classList.add('lz-half');

  // ------------------------------------------------------------------ spacetime diagram
  const hyperbola = (a, branch) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const u = -3.2 + (6.4 * i) / 80;
      const c = a * Math.cosh(u);
      const s = a * Math.sinh(u);
      if (branch === 'up') pts.push([s, c]);
      else if (branch === 'down') pts.push([s, -c]);
      else if (branch === 'right') pts.push([c, s]);
      else pts.push([-c, s]);
    }
    return pts;
  };
  const HYP = [1, 2, 3, 4].map((a) => ({ a, up: hyperbola(a, 'up'), down: hyperbola(a, 'down'), right: hyperbola(a, 'right'), left: hyperbola(a, 'left') }));

  const p1 = plot2d(v1.body, scope, {
    x: [-3.3, 3.3],
    y: [-4.4, 4.4],
    grid: false,
    axisLabels: ['x', 't'],
    draw(p) {
      const e = eta();
      const ch = Math.cosh(e);
      const sh = Math.sinh(e);
      if (S.field) p.vectorField((x, t) => [t, x], { color: 'alg', step: 40, alpha: 0.3, maxLen: 17 });
      // invariant hyperbolas t² − x² = ±a²
      for (const H of HYP) {
        const st = { color: 'muted', width: 1, dash: [4, 5], alpha: 0.75 };
        for (const b of ['up', 'down', 'right', 'left']) p.line(H[b], st);
      }
      // light cone
      const Lc = 40;
      p.line([[-Lc, -Lc], [Lc, Lc]], { color: 'ink2', width: 1.4, alpha: 0.8 });
      p.line([[-Lc, Lc], [Lc, -Lc]], { color: 'ink2', width: 1.4, alpha: 0.8 });
      // ghost lattice: the same clocks before the boost
      for (let i = -LX; i <= LX; i++) for (let j = -LT; j <= LT; j++) p.dot([i, j], { r: 1.7, color: 'muted', alpha: 0.6 });
      // boosted lattice: worldlines x' = const (clocks at rest in S'), simultaneity lines t' = const
      for (let i = -LX; i <= LX; i++) {
        if (i === 0) continue;
        p.line([boostEvent([i, -LT - 2], e), boostEvent([i, LT + 2], e)], { color: 'grp', width: 1, alpha: 0.32 });
      }
      for (let j = -LT; j <= LT; j++) {
        if (j === 0) continue;
        p.line([boostEvent([-LX - 2, j], e), boostEvent([LX + 2, j], e)], { color: 'grp', width: 1, alpha: 0.16, dash: [2, 4] });
      }
      // orbits: a few events traced along their hyperbolas from where they started
      for (const ev of [[0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [-1, 2], [1, 2], [-2, 1], [2, -1]]) {
        const arc = [];
        for (let k = 0; k <= 24; k++) arc.push(boostEvent(ev, (e * k) / 24));
        p.line(arc, { color: 'grp', width: 1.4, alpha: 0.55 });
      }
      // boosted axes (scissors)
      p.line([boostEvent([0, -LT - 2], e), boostEvent([0, LT + 2], e)], { color: 'grp', width: 2.4 });
      p.line([boostEvent([-LX - 2, 0], e), boostEvent([LX + 2, 0], e)], { color: 'grp', width: 2.4 });
      // boosted events (ticks)
      for (let i = -LX; i <= LX; i++) for (let j = -LT; j <= LT; j++) p.dot(boostEvent([i, j], e), { r: i === 0 ? 3.4 : 2.6, color: 'grp' });

      construction(p, e, ch, sh);

      // axis labels for the moving frame
      const tl = rayExit(p, [sh, ch], 22);
      if (tl) p.tex("t'", tl, { key: 'tp', color: 'grp', offset: [e >= 0 ? -12 : 12, 4] });
      const xl = rayExit(p, [ch, sh], 22);
      if (xl) p.tex("x'", xl, { key: 'xp', color: 'grp', offset: [-4, -12] });
      const lc = rayExit(p, [-1, 1], 30);
      if (lc) p.tex('\\text{light cone}', lc, { key: 'lc', small: true, offset: [50, 12] });
    },
  });

  function construction(p, e, ch, sh) {
    const hiLine = { color: 'hi', width: 2.2 };
    if (S.show === 'time') {
      p.line(HYP[0].up, hiLine);
      const tick = [sh, ch];
      p.line([tick, [0, ch]], { color: 'hi', width: 1.6, dash: [5, 4] });
      p.dot([0, ch], { r: 4, color: 'hi' });
      p.dot([0, 1], { r: 3.5, color: 'surface', stroke: 'hi', width: 2 });
      p.tex(`t=\\gamma=${texNum(ch, 2)}`, [0, ch], { key: 'tgam', align: Math.sign(e || 1) > 0 ? 'right' : 'left', offset: [e >= 0 ? -10 : 10, -10], small: true });
      const hl = e >= 0 ? HYP[0].up[18] : HYP[0].up[62];
      p.tex('t^2-x^2=1', hl, { key: 'hyp1', small: true, color: 'hi', offset: [e >= 0 ? -6 : 6, -12], align: e >= 0 ? 'right' : 'left' });
    } else if (S.show === 'length') {
      p.line(HYP[0].right, hiLine);
      const end = boostEvent([1, 0], e);
      p.line([boostEvent([1, -LT - 2], e), boostEvent([1, LT + 2], e)], { color: 'hi', width: 1.8 });
      p.line([[0, 0], end], { color: 'grp', width: 5, alpha: 0.75 });
      p.line([[0, 0], [1 / ch, 0]], { color: 'hi', width: 5, alpha: 0.9 });
      p.dot([1 / ch, 0], { r: 4, color: 'hi' });
      p.tex(`1/\\gamma=${texNum(1 / ch, 2)}`, [1 / ch, 0], { key: 'lgam', small: true, offset: [10, 14], align: 'left' });
      p.tex('\\text{rod at rest in }S\'', end, { key: 'rod', small: true, color: 'grp', offset: [10, e >= 0 ? -12 : 12], align: 'left' });
    } else {
      p.line([boostEvent([-LX - 2, 0], e), boostEvent([LX + 2, 0], e)], { color: 'hi', width: 3 });
      for (let i = -3; i <= 3; i++) p.dot(boostEvent([i, 0], e), { r: 4.2, color: 'hi' });
      const q = boostEvent([2, 0], e);
      p.line([q, [q[0], 0]], { color: 'hi', width: 1.5, dash: [4, 4] });
      p.tex(`t=\\gamma\\beta x'=${texNum(q[1], 2)}`, [q[0], q[1] / 2], { key: 'sim', small: true, offset: [8, 0], align: 'left' });
      const lab = rayExit(p, [ch, sh], 60);
      if (lab) p.tex("t'=0", lab, { key: 'tp0', small: true, color: 'hi', offset: [-8, 16], align: 'right' });
    }
    // labels of the moving clock's ticks
    for (const k of [1, 2, 3]) {
      p.tex(`\\tau=${k}`, [k * sh, k * ch], { key: 'tau' + k, small: true, color: 'grp', offset: [e >= 0 ? 10 : -10, 7], align: e >= 0 ? 'left' : 'right' });
    }
  }

  p1.handle({
    get: () => [Math.sinh(eta()), Math.cosh(eta())],
    set: ([x]) => setTotal(Math.asinh(x)),
    color: 'grp',
    r: 7,
  });

  // ------------------------------------------------------------------ algebra → group
  const circle = [];
  for (let i = 0; i <= 120; i++) circle.push([Math.sin((i / 120) * 2 * Math.PI), Math.cos((i / 120) * 2 * Math.PI)]);
  const p2 = plot2d(v2.body, scope, {
    x: [-2.6, 2.6],
    y: [-0.45, 3.25],
    grid: false,
    axisLabels: ['x', 't'],
    draw(p) {
      const e1 = S.eta1;
      const e = eta();
      p.line([[-6, -6], [6, 6]], { color: 'ink2', width: 1, dash: [4, 4], alpha: 0.7 });
      p.line([[6, -6], [-6, 6]], { color: 'ink2', width: 1, dash: [4, 4], alpha: 0.7 });
      // circle: the compact cousin, same tangent line
      p.line(circle, { color: 'muted', width: 1.2, dash: [3, 4] });
      // circular sector of angle θ = η (rotation), faint
      const cs = [[0, 0]];
      for (let k = 0; k <= 40; k++) cs.push([Math.sin((e * k) / 40), Math.cos((e * k) / 40)]);
      p.polygon(cs, { fill: 'muted', alpha: 0.12 });
      // hyperbolic sectors: η₁ and η₂ parts; area = η/2
      p.polygon(sectorPolygon(0, e1), { fill: 'grp', alpha: 0.24 });
      if (Math.abs(S.eta2) > 1e-3) p.polygon(sectorPolygon(e1, e), { fill: 'c3', alpha: 0.24 });
      // unit hyperbola (the group)
      p.line(HYP[0].up, { color: 'grp', width: 2.2 });
      // tangent line at the identity (the algebra ℝX)
      p.line([[-8, 1], [8, 1]], { color: 'alg', width: 1.6 });
      for (let k = -3; k <= 3; k++) {
        p.segment([k, 0.93], [k, 1.07], { color: 'alg', width: 1.4 });
        if (k) p.tex(String(k), [k, 1], { key: 'tk' + k, small: true, color: 'alg', offset: [0, 13] });
      }
      // algebra point(s) and group point(s)
      if (Math.abs(S.eta2) > 1e-3) p.arrow([e1, 1], [e, 1], { color: 'c3', width: 2.2, head: 8 });
      p.arrow([0, 1], [e1, 1], { color: 'alg', width: 2.6, head: 9 });
      const g = [Math.sinh(e), Math.cosh(e)];
      p.line([[0, 0], g], { color: 'grp', width: 1.2, alpha: 0.7 });
      p.dot([Math.sin(e), Math.cos(e)], { r: 3.5, color: 'muted' });
      p.dot(g, { r: 5, color: 'grp' });
      p.tex('e^{\\eta X}', g, { key: 'gpt', color: 'grp', offset: [e >= 0 ? -14 : 14, -12], align: e >= 0 ? 'right' : 'left' });
      p.tex('e^{\\eta J}', [Math.sin(e), Math.cos(e)], { key: 'cpt', small: true, offset: [e >= 0 ? 12 : -12, 8], align: e >= 0 ? 'left' : 'right' });
      const ar = [0.55 * Math.sinh(e / 2), 0.55 * Math.cosh(e / 2)];
      if (Math.abs(e) > 0.35) p.tex('\\text{area }\\tfrac{\\eta}{2}', ar, { key: 'area', small: true, color: 'grp' });
      p.tex('\\mathbb{R}X', [-2.25, 1], { key: 'RX', color: 'alg', offset: [0, -13] });
      p.tex('SO^+(1,1)', [-1.55, Math.sqrt(1 + 1.55 * 1.55)], { key: 'grp', color: 'grp', small: true, offset: [-8, -6], align: 'right' });
    },
  });
  p2.handle({
    get: () => [eta(), 1],
    set: ([x]) => setTotal(x),
    constrain: ([x]) => [clamp(x, -ETA_MAX, ETA_MAX), 1],
    color: 'alg',
    r: 6.5,
  });

  // ------------------------------------------------------------------ β = tanh η
  const tanhCurve = [];
  for (let i = 0; i <= 160; i++) {
    const x = -4 + (8 * i) / 160;
    tanhCurve.push([x, Math.tanh(x)]);
  }
  const p3 = plot2d(v3.body, scope, {
    x: [-3.3, 3.3],
    y: [-1.3, 1.3],
    equal: false,
    axisLabels: ['\\eta', '\\beta'],
    ticks: true,
    draw(p) {
      const e1 = S.eta1;
      const e = eta();
      const b1 = Math.tanh(e1);
      const b2 = Math.tanh(S.eta2);
      const b = Math.tanh(e);
      p.line([[-9, 1], [9, 1]], { color: 'ink2', width: 1.3, dash: [6, 4], alpha: 0.8 });
      p.line([[-9, -1], [9, -1]], { color: 'ink2', width: 1.3, dash: [6, 4], alpha: 0.8 });
      p.line([[-1.6, -1.6], [1.6, 1.6]], { color: 'muted', width: 1.2, dash: [3, 4] });
      p.tex('\\beta=\\eta', [1.25, 1.25], { key: 'newt', small: true, offset: [8, 10], align: 'left' });
      p.tex('\\beta=1', [2.9, 1], { key: 'c', small: true, offset: [0, 11], align: 'right' });
      p.line(tanhCurve, { color: 'grp', width: 2.2 });
      // rapidities add on the η axis
      p.arrow([0, 0], [e1, 0], { color: 'alg', width: 2.6, head: 9 });
      if (Math.abs(S.eta2) > 1e-3) p.arrow([e1, 0], [e, 0], { color: 'c3', width: 2.2, head: 8 });
      p.line([[e, 0], [e, b], [0, b]], { color: 'grp', width: 1, dash: [3, 3], alpha: 0.8 });
      if (Math.abs(S.eta2) > 1e-3) {
        // naive (Galilean) sum of the velocities
        p.dot([e, b1 + b2], { r: 4, color: 'surface', stroke: 'muted', width: 1.6 });
        p.tex('\\beta_1+\\beta_2', [e, b1 + b2], { key: 'naive', small: true, offset: [e >= 0 ? -10 : 10, 0], align: e >= 0 ? 'right' : 'left' });
      }
      p.dot([e, b], { r: 5, color: 'grp' });
      p.tex(`\\beta=${texNum(b, 3)}`, [0, b], { key: 'bval', small: true, color: 'grp', offset: [e >= 0 ? -8 : 8, b >= 0 ? -11 : 11], align: e >= 0 ? 'right' : 'left' });
    },
  });
  p3.handle({
    get: () => [eta(), Math.tanh(eta())],
    set: ([x]) => setTotal(x),
    constrain: ([x]) => [clamp(x, -ETA_MAX, ETA_MAX), Math.tanh(clamp(x, -ETA_MAX, ETA_MAX))],
    color: 'grp',
    r: 6,
  });

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Boost');
  const s1 = ui.slider(sec, {
    label: 'Rapidity $\\eta_1$',
    min: -ETA_MAX,
    max: ETA_MAX,
    step: 0.01,
    value: S.eta1,
    format: (x) => `${fmt(x, 2)} · β ${fmt(Math.tanh(x), 3)}`,
    onInput: (x) => {
      S.eta1 = x;
      stop();
      update();
    },
  });
  const s2 = ui.slider(sec, {
    label: 'Second boost $\\eta_2$',
    min: -ETA2_MAX,
    max: ETA2_MAX,
    step: 0.01,
    value: S.eta2,
    format: (x) => `${fmt(x, 2)} · β ${fmt(Math.tanh(x), 3)}`,
    onInput: (x) => {
      S.eta2 = x;
      update();
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  sec.appendChild(row);
  const play = ui.playButton(row, {
    playing: S.playing,
    onToggle: (on) => {
      S.playing = on;
      if (on) syncPhase();
    },
  });
  ui.button(row, {
    label: 'Reset',
    onClick: () => {
      stop();
      s2.set(0, { silent: true });
      S.eta2 = 0;
      s1.set(0, { silent: true });
      S.eta1 = 0;
      update();
    },
  });
  const seg = ui.segmented(sec, {
    label: 'Construction',
    options: [
      { value: 'time', label: 'Time dilation' },
      { value: 'length', label: 'Length' },
      { value: 'simul', label: 'Simultaneity' },
    ],
    value: S.show,
    onChange: (v) => {
      S.show = v;
      update();
    },
  });
  const tg = ui.toggle(sec, {
    label: 'Generator field $\\alg{X}:(x,t)\\mapsto(t,x)$',
    value: S.field,
    onChange: (v) => {
      S.field = v;
      update();
    },
  });

  const secR = pg.section('Readout');
  const rL = ui.readout(secR, { label: 'Boost acting on $(t,x)$' });
  const kv = ui.keyValue(secR, [
    ['Rapidity $\\eta=\\eta_1+\\eta_2$', ''],
    ['Velocity $\\beta=\\tanh\\eta$', ''],
    ['$\\gamma=\\cosh\\eta=1/\\sqrt{1-\\beta^2}$', ''],
    ['Invariant $t^2-x^2$ of tick $\\tau=1$', ''],
  ]);
  const rC = ui.readout(secR, { label: 'Composition: rapidities add, velocities do not' });
  ui.legend(secR, [
    { color: 'grp', label: 'boosted events, axes $t\',x\'$', dot: true },
    { color: 'muted', label: 'events before the boost', dot: true },
    { color: 'alg', label: 'generator $X$ / rapidity' },
    { color: 'c3', label: 'second boost $\\eta_2$' },
    { color: 'ink2', label: 'light cone' },
    { color: 'hi', label: 'construction' },
  ]);

  const ex = pg.section('Try this');
  const setState = (e1, e2, show) => {
    stop();
    S.eta1 = e1;
    S.eta2 = e2;
    s1.set(e1, { silent: true });
    s2.set(e2, { silent: true });
    if (show) {
      S.show = show;
      seg.set(show, { silent: true });
    }
    update();
  };
  ui.experiments(ex, [
    {
      title: 'Rapidities add',
      text: 'Two boosts of $\\eta=1$, i.e. $\\beta=0.76$ each. The rapidities add to $2$, the velocities do not: $\\beta=\\tanh 2=0.96$, not $1.52$. In the middle view the two sector areas simply add, like angles.',
      apply: () => setState(1, 1, 'time'),
    },
    {
      title: 'Time dilation from a hyperbola',
      text: 'The first tick of the moving clock and of the lab clock lie on the same hyperbola $t^2-x^2=1$ — the same proper time — but in the lab the moving tick happens at $t=\\cosh\\eta=\\gamma$.',
      apply: () => setState(0.9, 0, 'time'),
    },
    {
      title: 'Length contraction',
      text: 'A rod of rest length 1 along $x\'$ is measured in the lab at one instant $t=0$: the worldlines of its ends cut that line only $1/\\gamma$ apart.',
      apply: () => setState(0.9, 0, 'length'),
    },
    {
      title: 'Relativity of simultaneity',
      text: 'Events on the tilted $x\'$ axis happen at the same time for the moving observer. In the lab the one at $x\'$ happens at $t=\\gamma\\beta x\'$: simultaneity is frame-dependent.',
      apply: () => setState(0.6, 0, 'simul'),
    },
    {
      title: 'Never past the light cone',
      text: 'At $\\eta=3$, $\\beta=0.995$ and the scissors almost close, yet each event stays on its own hyperbola and no event crosses the cone: causal order is invariant.',
      apply: () => setState(3, 0, 'time'),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>The grey dots are the ticks of a row of clocks at rest in the lab, one per unit of proper time. The active boost
    $\\grp{\\Lambda(\\eta)}=e^{\\eta\\alg X}$ moves every event to a violet dot: the same clocks, now moving with velocity
    $\\beta=\\tanh\\eta$. Each event slides along its own hyperbola $t^2-x^2=\\text{const}$ (the orbit of the boost),
    following the orange vector field $\\alg X:(x,t)\\mapsto(t,x)$ — the generator.</p>
    <p>The boosted axes close like scissors: $t'$ is the worldline of the moving clock, $x'$ its line of simultaneity.
    Only the light cone $t=\\pm x$ is mapped to itself — its slope is the invariant speed — and the axes approach it
    without ever reaching it.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Read the hyperbolas as the Minkowski
    “circles”: every point of $t^2-x^2=1$ is one unit of proper time from the origin. Time dilation, length
    contraction and the twin paradox are all statements about where a line crosses a hyperbola.</div>`);
  pg.note(`<h2>The physics</h2>
    <p><strong>A rotation by an imaginary angle.</strong> With $\\tau=it$ the interval becomes $t^2-x^2=-(x^2+\\tau^2)$,
    and the boost is the Euclidean rotation of the $(x,\\tau)$ plane by $\\theta=i\\eta$:</p>
    $$\\begin{pmatrix}t'\\\\x'\\end{pmatrix}=\\begin{pmatrix}\\cosh\\eta&\\sinh\\eta\\\\\\sinh\\eta&\\cosh\\eta\\end{pmatrix}\\begin{pmatrix}t\\\\x\\end{pmatrix},\\qquad \\cos i\\eta=\\cosh\\eta,\\quad \\sin i\\eta=i\\sinh\\eta .$$
    <p>This is the Wick rotation that turns Minkowski path integrals into Euclidean ones.</p>
    <p><strong>Rapidities add.</strong> $\\Lambda(\\eta_1)\\Lambda(\\eta_2)=\\Lambda(\\eta_1+\\eta_2)$, so</p>
    $$\\beta=\\tanh(\\eta_1+\\eta_2)=\\frac{\\beta_1+\\beta_2}{1+\\beta_1\\beta_2}<1 .$$
    <p>Velocities saturate because $\\tanh$ does; for $\\eta\\ll1$, $\\beta\\approx\\eta$ and Galileo is recovered. Rapidity is
    the natural variable wherever boosts are composed: the rapidity distribution $dN/dy$ of particles at a collider is
    simply shifted, not distorted, when one changes frame along the beam.</p>
    <div class="callout physics"><span class="callout-title">Light-cone coordinates</span>With $x^\\pm=t\\pm x$ the boost is diagonal,
    $x^\\pm\\mapsto e^{\\pm\\eta}x^\\pm$: a squeeze. The eigenvalues $e^{\\pm\\eta}$ are the relativistic Doppler factors.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>$SO^+(1,1)=\\{\\Lambda:\\Lambda^{\\mathsf T} g\\Lambda=g,\\ \\det\\Lambda=1,\\ \\Lambda^0{}_0>0\\}$ is one-dimensional, abelian and
    <em>non-compact</em>. Its Lie algebra is $\\R X$ with</p>
    $$X=\\begin{pmatrix}0&1\\\\1&0\\end{pmatrix},\\quad X^2=\\id\\ \\Rightarrow\\ e^{\\eta X}=\\cosh\\eta\\,\\id+\\sinh\\eta\\,X ,$$
    <p>to be compared with $J^2=-\\id\\Rightarrow e^{\\theta J}=\\cos\\theta\\,\\id+\\sin\\theta\\,J$ for rotations. In the middle view
    the same tangent line $t=1$ (the algebra) is mapped to the unit hyperbola (the group) and, for comparison, wrapped round the
    unit circle. The circle closes up — $U(1)$ is compact and its charges are quantised — the hyperbola never does: $\\exp$ is
    a bijection $\\R\\to SO^+(1,1)$, and the rapidity is twice the area of the shaded hyperbolic sector, exactly as an angle is
    twice the area of a circular sector.</p>
    <p>In the Hermitian convention of this atlas the boost generator is $K_x=iX$, so $\\Lambda(\\eta)=e^{-i\\eta K_x}$.</p>`);
  pg.note(`<h2>Going further</h2>
    <p>In 3+1 dimensions the Lorentz algebra $\\so(1,3)$ has six generators, rotations $J_i$ and boosts $K_i$, with
    $\\Lambda=e^{-i\\vec\\theta\\cdot\\vec J-i\\vec\\eta\\cdot\\vec K}$ and</p>
    $$[J_i,J_j]=i\\epsilon_{ijk}J_k,\\qquad[J_i,K_j]=i\\epsilon_{ijk}K_k,\\qquad\\brk{[K_i,K_j]=-i\\epsilon_{ijk}J_k}.$$
    <p>The second relation says $\\vec K$ is a vector under rotations; the third, that boosts in different directions close
    onto a rotation — the subject of the next tab. As $4\\times4$ matrices the $J_i$ are Hermitian but the $K_i$ are
    anti-Hermitian: the group is non-compact and has no faithful finite-dimensional unitary representations. Quantum states
    of particles therefore carry infinite-dimensional unitary representations (last tab).</p>
    <p>Related: <a href="#/u1">U(1)</a> (the compact cousin), <a href="#/sp2">Sp(2,ℝ)</a> (squeezes and hyperbolic flows),
    <a href="#/loops">commutators as small loops</a>.</p>`);

  // ------------------------------------------------------------------ dynamics
  const readouts = throttled(scope, () => {
    const e = eta();
    const b1 = Math.tanh(S.eta1);
    const b2 = Math.tanh(S.eta2);
    rL.set(`\\grp{\\Lambda(\\eta)}=e^{\\eta\\alg{X}}=${texMatrix(boost11(e), 3)},\\quad \\alg{X}=\\begin{pmatrix}0&1\\\\1&0\\end{pmatrix}`);
    kv.set('Rapidity $\\eta=\\eta_1+\\eta_2$', fmt(e, 3));
    kv.set('Velocity $\\beta=\\tanh\\eta$', fmt(Math.tanh(e), 4));
    kv.set('$\\gamma=\\cosh\\eta=1/\\sqrt{1-\\beta^2}$', fmt(Math.cosh(e), 4));
    const tk = boostEvent([0, 1], e);
    kv.set('Invariant $t^2-x^2$ of tick $\\tau=1$', fmt(tk[1] * tk[1] - tk[0] * tk[0], 6));
    rC.set(
      `\\begin{aligned}&\\Lambda(${texNum(S.eta1, 2)})\\,\\Lambda(${texNum(S.eta2, 2)})=\\Lambda(${texNum(e, 2)})\\\\ &\\beta=\\frac{${texNum(b1, 3)}+(${texNum(b2, 3)})}{1+(${texNum(b1, 3)})(${texNum(b2, 3)})}=${texNum(addVelocities(b1, b2), 4)}\\end{aligned}`,
    );
  });

  function update() {
    p1.invalidate();
    p2.invalidate();
    p3.invalidate();
    readouts.request();
  }
  function setTotal(etaTotal) {
    stop();
    const e1 = clamp(etaTotal - S.eta2, -ETA_MAX, ETA_MAX);
    S.eta1 = Number.isFinite(e1) ? e1 : 0;
    s1.set(S.eta1, { silent: true });
    update();
  }
  function stop() {
    if (play.playing) play.set(false);
    S.playing = false;
  }
  function syncPhase() {
    amp = Math.max(AMP, Math.abs(S.eta1));
    phase = Math.asin(clamp(S.eta1 / amp, -1, 1));
  }
  scope.frame((dt) => {
    if (!play.playing) return;
    phase += OMEGA * dt;
    S.eta1 = amp * Math.sin(phase);
    s1.set(S.eta1, { silent: true });
    update();
  });
  void tg;
  syncPhase();
  update();
}
