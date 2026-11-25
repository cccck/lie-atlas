// #/kepler, tab (a) — Noether & precession.
// A planar orbit in V = −k/r + perturbation, integrated with RK4 in Sundman time (see math.js). Shows the
// trail, the Laplace–Runge–Lenz vector A, L_z, the hodograph and time traces of L, E and the direction of A.
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { fmt, fmtDeg } from '../../core/format.js';
import * as K from './math.js';
import { seriesPlot } from './series.js';

const k = 1;
const R0 = [-1.5, 0]; // fixed launch point (aphelion of the default orbit)
const V0_DEFAULT = [0, -Math.sqrt(1 / 3)]; // a = 1, e = 0.5, perihelion along +x, L > 0
const VS = 1.25; // world length of the v₀ arrow per unit speed
const RMAX = 2.0; // the launch handle keeps the (Kepler) aphelion inside this radius
const AS = 0.9; // world length of A per unit eccentricity
const TRAIL = 7000;
const VTRAIL = 1600;

const KINDS = [
  { value: 'kepler', label: 'Pure Kepler: V = −k/r' },
  { value: 'gr', label: 'GR-like: V = −k/r − δ/r³' },
  { value: 'power', label: 'Power law: V = −k r^(−1−δ)/(1+δ)' },
  { value: 'field', label: 'Uniform field (Stark): V = −k/r − εy' },
];
const PARAM = {
  kepler: { label: 'Perturbation strength', min: 0, max: 1, step: 1, def: 0 },
  gr: { label: 'Strength $\\delta$ of $-\\delta/r^3$', min: 0, max: 0.02, step: 0.0005, def: 0.008, digits: 4 },
  power: { label: 'Exponent shift $\\delta$ (force $\\propto r^{-2-\\delta}$)', min: -0.2, max: 0.2, step: 0.005, def: 0.08, digits: 3 },
  field: { label: 'Field strength $\\varepsilon$ (force $\\varepsilon\\,\\hat y$)', min: 0, max: 0.04, step: 0.001, def: 0.02, digits: 3 },
};

/** Keep the launch velocity bound, with its Kepler aphelion inside RMAX, and non-zero. */
function constrainV(v) {
  const r = Math.hypot(R0[0], R0[1]);
  const rh = [R0[0] / r, R0[1] / r];
  const th = [-rh[1], rh[0]];
  let vr = v[0] * rh[0] + v[1] * rh[1];
  let vt = v[0] * th[0] + v[1] * th[1];
  if (!Number.isFinite(vr) || !Number.isFinite(vt)) return V0_DEFAULT.slice();
  const a2 = 2 * k * (1 / r - 1 / RMAX);
  const b2 = a2 / (1 - (r * r) / (RMAX * RMAX));
  const q = (vr * vr) / a2 + (vt * vt) / b2;
  if (q > 0.995) {
    const f = Math.sqrt(0.995 / q);
    vr *= f;
    vt *= f;
  }
  const sp = Math.hypot(vr, vt);
  if (sp < 0.04) {
    const f = 0.04 / (sp || 1);
    vr = sp ? vr * f : 0;
    vt = sp ? vt * f : -0.04;
  }
  return [vr * rh[0] + vt * th[0], vr * rh[1] + vt * th[1]];
}

export function mountNoether(pg, scope, ctx) {
  const S = (ctx.state.noether ??= {
    kind: 'kepler',
    str: { gr: PARAM.gr.def, power: PARAM.power.def, field: PARAM.field.def },
    v0: V0_DEFAULT.slice(),
    speed: 2.5,
    playing: true,
    osc: true,
  });
  S.v0 = constrainV(S.v0);

  // ------------------------------------------------------------ simulation state
  let model = K.makeModel(S.kind, S.str[S.kind] ?? 0, k);
  const sim = new K.OrbitSim(model, [...R0, ...S.v0], { ds: 0.004 });
  const trail = new Float64Array(TRAIL * 2);
  let tN = 0;
  let tHead = 0;
  const vtrail = new Float64Array(VTRAIL * 2);
  let vN = 0;
  let vHead = 0;
  let lastRec = 0;
  let dragging = false;
  let escaped = false;
  let ref = null; // initial invariants

  // ------------------------------------------------------------ views
  pg.stage.style.gridTemplateColumns = 'minmax(0, 1.3fr) minmax(0, 1fr)';
  scope.add(() => (pg.stage.style.gridTemplateColumns = ''));
  const vOrbit = pg.view({
    title: 'Orbit $\\grp{\\vec r(t)}$ · Runge–Lenz $\\alg{\\vec A}$ · $\\cz{L_z}$',
    hint: 'drag the tip of $\\vec v_0$ · scroll to zoom · double-click to reset',
  });
  vOrbit.el.classList.add('kp-orbit-view');
  const vHodo = pg.view({ title: 'Hodograph $\\grp{\\vec v(t)}$', hint: 'velocity space' });
  vHodo.el.classList.add('kp-orbit-view');
  const vSeries = pg.view({ span: true });
  vSeries.el.classList.add('kp-series-view');
  const msg = vOrbit.overlay('bl');
  msg.style.display = 'none';
  msg.style.maxWidth = '300px';

  const pOrbit = plot2d(vOrbit.body, scope, {
    x: [-2.1, 2.1],
    y: [-2.1, 2.1],
    axes: { color: 'grid' },
    draw: drawOrbit,
  });
  pOrbit.handle({
    get: () => [R0[0] + VS * S.v0[0], R0[1] + VS * S.v0[1]],
    set: (q) => {
      S.v0 = constrainV([(q[0] - R0[0]) / VS, (q[1] - R0[1]) / VS]);
      restart();
    },
    onStart: () => (dragging = true),
    onEnd: () => {
      dragging = false;
      restart();
    },
    color: 'ink2',
    label: '\\vec v_0',
    labelOffset: [14, 12],
  });
  const pHodo = plot2d(vHodo.body, scope, {
    x: [-2.3, 2.3],
    y: [-2.3, 2.3],
    axisLabels: ['v_x', 'v_y'],
    draw: drawHodo,
  });

  const grid = ui.h('div', { class: 'kp-series' });
  vSeries.body.appendChild(grid);
  const cells = [0, 1, 2].map(() => grid.appendChild(ui.h('div', { class: 'kp-series-cell' })));
  const sL = seriesPlot(cells[0], scope, { label: 'L_z(t)', color: 'z', range: [-1.3, 1.3], window: 60, format: (y) => fmt(y, 4) });
  const sE = seriesPlot(cells[1], scope, { label: 'E(t)', color: 'ink2', labelColor: 'ink', range: [-0.6, -0.4], window: 60, format: (y) => fmt(y, 5) });
  const sW = seriesPlot(cells[2], scope, {
    label: '\\varpi(t):\\ \\text{direction of }\\vec A',
    color: 'alg',
    range: [-Math.PI * 1.08, Math.PI * 1.08],
    window: 60,
    wrap: Math.PI,
    tickFormat: (v) => fmt((v * 180) / Math.PI, 0) + '°',
    format: (y) => fmtDeg(y, 1),
  });

  // ------------------------------------------------------------ panel
  const secP = pg.section('Potential');
  const selKind = ui.select(secP, {
    label: 'Force law',
    options: KINDS,
    value: S.kind,
    onChange: (v) => setKind(v),
  });
  const sStr = ui.slider(secP, {
    label: PARAM[S.kind].label,
    min: PARAM[S.kind].min,
    max: PARAM[S.kind].max,
    step: PARAM[S.kind].step,
    value: S.str[S.kind] ?? 0,
    format: (x) => (S.kind === 'kepler' ? 'none' : fmt(x, PARAM[S.kind].digits)),
    onInput: (x) => {
      if (S.kind === 'kepler') return;
      S.str[S.kind] = x;
      model = K.makeModel(S.kind, x, k);
      restart();
    },
  });
  const badge = ui.badge(null, '', 'good');
  secP.appendChild(ui.h('div', { class: 'kp-badge-row' }, badge));

  const secM = pg.section('Motion');
  const play = ui.playButton(null, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  const row = ui.buttons(secM, [
    { label: 'Restart', onClick: () => restart() },
    { label: 'Reset $\\vec v_0$', onClick: () => ((S.v0 = V0_DEFAULT.slice()), restart()) },
  ]);
  row.prepend(play.el);
  const sSpeed = ui.slider(secM, {
    label: 'Speed (time units per second)',
    min: 0.5,
    max: 12,
    step: 0.1,
    value: S.speed,
    format: (x) => fmt(x, 1),
    onInput: (x) => (S.speed = x),
  });
  ui.toggle(secM, {
    label: 'Osculating Kepler ellipse',
    value: S.osc,
    onChange: (v) => {
      S.osc = v;
      pOrbit.invalidate();
    },
  });

  const secR = pg.section('Would-be conserved charges');
  const kv = ui.keyValue(secR, [
    ['Energy $E$', ''],
    ['$L_z$', ''],
    ['$e=|\\vec A|/k$', ''],
    ['Perihelion $\\varpi$', ''],
    ['Advance per orbit', ''],
    ['First-order theory', ''],
  ]);
  const ro = ui.readout(secR, { label: 'Hodograph: centre $(\\hat z\\times\\vec A)/L$, radius $k/|L|$' });
  ui.legend(secR, [
    { color: 'grp', label: 'orbit, hodograph' },
    { color: 'alg', label: 'Runge–Lenz $\\vec A$' },
    { color: 'z', label: '$L_z$' },
    { color: 'ink2', label: 'launch velocity' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Pure Kepler: a closed ellipse',
      text: 'The orbit retraces itself forever and $\\alg{\\vec A}$ never moves; $L_z$, $E$ and $\\varpi$ are flat lines. Rotational symmetry explains $L$, but not why the ellipse does not turn — that needs a second conserved vector.',
      apply: () => scenario('kepler', null, V0_DEFAULT, 2.5),
    },
    {
      title: 'Add a $1/r^3$ term (GR-like)',
      text: 'Still central, so $L_z$ stays exactly flat (Noether). But $\\vec A$ now turns: the perihelion advances by $\\approx 6\\pi\\delta k/L^4$ per orbit and the orbit becomes a rosette. GR gives exactly such a term, $\\delta = kL^2/c^2$: Mercury’s 43″ per century.',
      apply: () => scenario('gr', 0.008, V0_DEFAULT, 3),
    },
    {
      title: 'Bertrand: change the power',
      text: 'With force $\\propto r^{-2-\\delta}$ the apsidal angle is $\\pi/\\sqrt{1-\\delta}$ for near-circular orbits: prograde rosette for $\\delta>0$, retrograde for $\\delta<0$. Only $1/r^2$ and Hooke’s law close every bound orbit.',
      apply: () => scenario('power', -0.1, V0_DEFAULT, 3),
    },
    {
      title: 'Break rotational symmetry',
      text: 'A uniform force $\\varepsilon\\hat y$ exerts a torque $\\vec r\\times\\vec F$: $L_z(t)$ drifts, passes through zero and changes sign — no symmetry, no conservation law. $E$ stays flat: time translations are still a symmetry. The eccentricity swings between 0 and 1 (classical Stark effect).',
      apply: () => scenario('field', 0.025, V0_DEFAULT, 9),
    },
    {
      title: 'The hodograph is a circle',
      text: 'Launch a very eccentric orbit. However lopsided $\\vec r(t)$ is, $\\vec v(t)$ runs on a circle of radius $k/L$ centred at $(\\hat z\\times\\vec A)/L$ (Hamilton 1846) — the conservation of $\\vec A$ in disguise.',
      apply: () => scenario('kepler', null, [0, -0.408], 2.2),
    },
    {
      title: 'Plunge through the barrier',
      text: 'In the $1/r^3$ potential, lower $L$: when $L^4<12k\\delta$ the centrifugal barrier disappears and the planet spirals in — the analogue of the innermost stable circular orbit of a black hole.',
      apply: () => scenario('gr', 0.02, constrainV([0.05, -0.22]), 2),
    },
  ]);

  // ------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>A planet (violet) launched from a fixed point with the velocity you drag. The orange arrow is the
    <strong>Laplace–Runge–Lenz vector</strong> $\\alg{\\vec A}=\\vec p\\times\\vec L-mk\\,\\hat r$ ($m=1$), drawn from the
    focus with length $\\propto e=|\\vec A|/k$; it points at the perihelion. The blue arc at the Sun is $L_z$: its size is $|L_z|$,
    its arrow the sense of rotation. The dashed ellipse is the <em>osculating</em> Kepler orbit with the instantaneous $(E,\\vec L,\\vec A)$,
    and the small orange dots mark recent perihelia.</p>
    <p>The strips below are the would-be conserved quantities. A flat line means a symmetry; a drifting one means it is broken.</p>`);
  pg.note(`<h2>The physics: Noether, twice</h2>
    <p>Rotations are generated by $L_z$ through the Poisson bracket, $\\delta f=\\epsilon\\{f,L_z\\}$. If the Hamiltonian is rotation
    invariant then $\\dot L_z=\\{L_z,H\\}=0$: every <em>central</em> force conserves $L$ — the GR-like and power-law cases included.
    A uniform field is not rotation invariant, and $\\dot{\\vec L}=\\vec r\\times\\vec F\\neq0$.</p>
    <p>Closure of the orbit is a different matter. For a perturbing force $\\vec f$ on top of $-k\\hat r/r^2$,
    $$\\dot{\\vec A}=\\vec f\\times\\vec L+\\vec p\\times(\\vec r\\times\\vec f),$$
    so $\\vec A$ is conserved only for the pure $1/r$ potential. A slowly turning $\\vec A$ is precession; for a small central
    perturbation $\\delta U(r)$ the advance per radial period is
    $$\\Delta\\varpi=\\frac{\\partial}{\\partial L}\\Big(\\frac{2}{L}\\int_0^{\\pi}r^2\\,\\delta U\\,\\dd\\varphi\\Big)
    \\;\\xrightarrow{\\ \\delta U=-\\delta/r^3\\ }\\;\\frac{6\\pi\\delta k}{L^4},$$
    which is the "first-order theory" row in the panel.</p>
    <div class="callout physics"><span class="callout-title">Bertrand’s theorem</span>Among central power laws only
    $V\\propto -1/r$ and $V\\propto r^2$ make every bounded orbit close. Both have a hidden symmetry: $SO(4)$ for Kepler, $SU(2)$ for the
    isotropic oscillator (see <a href="#/torus">tori &amp; oscillators</a>).</div>`);
  pg.note(`<h2>The mathematics: why the hodograph is a circle</h2>
    <p>Cross $\\hat z$ into $\\vec A=\\vec p\\times L\\hat z-k\\hat r$: since $\\hat z\\times(\\vec p\\times\\hat z)=\\vec p$ for planar $\\vec p$,
    $$\\vec v=\\frac{\\hat z\\times\\vec A}{L}+\\frac{k}{L}\\,\\hat z\\times\\hat r .$$
    The first term is constant, the second has constant length $k/L$: the velocity runs on a circle. Dotting $\\vec A$ with $\\vec r$ gives
    the orbit itself, $\\vec A\\cdot\\vec r=L^2-kr$, i.e. $r=\\dfrac{L^2/k}{1+e\\cos(\\varphi-\\varpi)}$.</p>
    <p>The brackets close: $\\{L_i,A_j\\}=\\epsilon_{ijk}A_k$, $\\{A_i,A_j\\}=-2mE\\,\\epsilon_{ijk}L_k$. With $\\vec L$ they generate
    $\\so(4)$ for $E<0$, $\\so(3,1)$ — the Lorentz algebra — for $E>0$, and $\\mathfrak e(3)$ for $E=0$. The next tab makes the
    $\\so(4)$ visible.</p>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><strong>Mercury.</strong> Schwarzschild geodesics obey the Binet equation $u''+u=k/L^2+3ku^2/c^2$, exactly the
      $-\\delta/r^3$ model with $\\delta=kL^2/c^2$: $\\Delta\\varpi=6\\pi GM/(c^2a(1-e^2))$ = 43″ per century.</li>
      <li><strong>Stark effect.</strong> Averaged over an orbit $\\langle\\vec r\\rangle=-\\tfrac{3a}{2k}\\vec A$, so a weak field couples to
      $\\vec A$: $H_{\\rm eff}=\\tfrac{3a}{2k}\\vec F\\cdot\\vec A$. It rotates $(L,\\vec A/\\sqrt{2|E|})$ into each other at
      $\\omega_S=\\tfrac32\\varepsilon\\sqrt{a/k}$ — a hidden-symmetry rotation, and the classical root of hydrogen’s <em>linear</em> Stark effect.</li>
      <li>Rotations as Lie group: <a href="#/so3">SO(3) &amp; angular momentum</a>; quantum multiplets: <a href="#/reps">spin multiplets</a>.</li>
    </ul>`);

  // ------------------------------------------------------------ logic
  function setKind(kind) {
    S.kind = kind;
    const P = PARAM[kind];
    sStr.setLabel(P.label);
    sStr.setRange(P.min, P.max, P.step);
    sStr.set(S.str[kind] ?? P.def, { silent: true });
    sStr.disable(kind === 'kepler');
    model = K.makeModel(kind, kind === 'kepler' ? 0 : S.str[kind], k);
    restart();
  }

  function scenario(kind, strength, v0, speed) {
    if (strength !== null && kind !== 'kepler') S.str[kind] = strength;
    S.v0 = constrainV(v0);
    sSpeed.set(speed);
    selKind.set(kind, { silent: true });
    setKind(kind);
    play.set(true);
    S.playing = true;
  }

  function restart() {
    sim.setModel(model);
    sim.reset([...R0, ...S.v0]);
    tN = tHead = vN = vHead = 0;
    lastRec = 0;
    escaped = false;
    const el = K.elements(sim.s, k);
    const C = Number.isFinite(el.C) ? el.C : 1;
    const T = Number.isFinite(el.a) ? K.TAU * Math.sqrt(el.a ** 3 / k) : 6;
    const E0 = K.energy(model, sim.s);
    const theory = model.central && model.kind !== 'kepler' ? K.precessionFirstOrder(model.dU, el.E, el.L, k) : model.kind === 'kepler' ? 0 : NaN;
    ref = { E0, L0: el.L, C, T, theory };
    const win = model.kind === 'field' ? Math.max(40, 2.2 * (2 * Math.PI) / (1.5 * Math.max(model.strength, 1e-3) * Math.sqrt(el.a / k))) : 10 * T;
    for (const s of [sL, sE, sW]) {
      s.clear();
      s.setWindow(Math.min(win, 400));
    }
    sL.setRange([-1.3 * C, 1.3 * C]);
    sL.setRef(el.L);
    const dE = Math.max(0.08 * Math.abs(E0), 1e-3);
    sE.setRange([E0 - dE, E0 + dE]);
    sE.setRef(E0);
    sW.setRef(el.omega);
    badge.set(model.central ? 'central force → $L_z$ conserved' : 'not rotation invariant → $L_z$ changes', model.central ? 'good' : 'warn');
    record(true);
    fitHodograph();
    updateReadouts();
    pOrbit.invalidate();
    pHodo.invalidate();
  }

  // frame the velocity plane on the initial hodograph circle (and the origin)
  function fitHodograph() {
    const H = K.hodograph(sim.s, k);
    let x0;
    let x1;
    let y0;
    let y1;
    if (H && H.R < 8) {
      x0 = Math.min(0, H.c[0] - H.R);
      x1 = Math.max(0, H.c[0] + H.R);
      y0 = Math.min(0, H.c[1] - H.R);
      y1 = Math.max(0, H.c[1] + H.R);
    } else {
      const v = Math.max(1, Math.hypot(sim.s[2], sim.s[3]));
      x0 = y0 = -1.6 * v;
      x1 = y1 = 1.6 * v;
    }
    const m = 0.16 * Math.max(x1 - x0, y1 - y0);
    pHodo.setView({ x: [x0 - m, x1 + m], y: [y0 - m, y1 + m] });
  }

  function pushTrail(x, y) {
    trail[2 * tHead] = x;
    trail[2 * tHead + 1] = y;
    tHead = (tHead + 1) % TRAIL;
    tN = Math.min(tN + 1, TRAIL);
  }
  function pushV(x, y) {
    vtrail[2 * vHead] = x;
    vtrail[2 * vHead + 1] = y;
    vHead = (vHead + 1) % VTRAIL;
    vN = Math.min(vN + 1, VTRAIL);
  }
  function lastOf(buf, head, cap) {
    const i = (head - 1 + cap) % cap;
    return [buf[2 * i], buf[2 * i + 1]];
  }

  function record(force = false) {
    const s = sim.s;
    if (force || tN === 0) pushTrail(s[0], s[1]);
    else {
      const [x, y] = lastOf(trail, tHead, TRAIL);
      if (Math.hypot(s[0] - x, s[1] - y) > 0.008) pushTrail(s[0], s[1]);
    }
    if (force || vN === 0) pushV(s[2], s[3]);
    else {
      const [x, y] = lastOf(vtrail, vHead, VTRAIL);
      if (Math.hypot(s[2] - x, s[3] - y) > 0.01) pushV(s[2], s[3]);
    }
    const dtRec = (ref ? Math.max(ref.T, 1) : 6) / 80;
    if (force || s[4] - lastRec >= dtRec) {
      lastRec = s[4];
      const el = K.elements(s, k);
      sL.push(s[4], el.L);
      sE.push(s[4], K.energy(model, s));
      sW.push(s[4], el.e > 1e-6 ? el.omega : NaN);
    }
  }

  scope.frame((dt) => {
    if (!play.playing || dragging || sim.captured || escaped) return;
    const target = sim.s[4] + dt * S.speed;
    let n = 0;
    while (sim.s[4] < target && n < 25000 && !sim.captured) {
      sim.step();
      record();
      n++;
    }
    const r = Math.hypot(sim.s[0], sim.s[1]);
    if (!(r < 12) || !Number.isFinite(r)) escaped = true;
    updateReadouts();
    pOrbit.invalidate();
    pHodo.invalidate();
  });

  function updateReadouts() {
    const s = sim.s;
    const el = K.elements(s, k);
    const E = K.energy(model, s);
    kv.set('Energy $E$', fmt(E, 4));
    kv.set('$L_z$', fmt(el.L, 4));
    kv.set('$e=|\\vec A|/k$', fmt(el.e, 3));
    kv.set('Perihelion $\\varpi$', el.e > 1e-4 ? fmtDeg(el.omega, 1) : 'undefined (e = 0)');
    const prec = sim.precession();
    kv.set('Advance per orbit', model.central && Number.isFinite(prec) ? fmtDeg(prec, 2) : '—');
    kv.set(
      'First-order theory',
      model.kind === 'kepler' ? '0 (closed)' : model.central && ref && Number.isFinite(ref.theory) ? fmtDeg(ref.theory, 2) : '— (not central)',
    );
    const H = K.hodograph(s, k);
    if (H) ro.set(`\\vec c=(${fmt(H.c[0], 2).replace('−', '-')},\\,${fmt(H.c[1], 2).replace('−', '-')}),\\quad k/|L|=${fmt(H.R, 3)}`);
    else ro.set('L\\approx 0:\\ \\text{radial orbit, no circle}');
    if (sim.captured) showMsg('<b>Captured.</b> With $L^4<12k\\delta$ (or past the barrier) the $-\\delta/r^3$ attraction beats the centrifugal term and the planet plunges. Restart or raise $L$.');
    else if (escaped) showMsg('<b>Escaped.</b> The field lowered the barrier on one side and the planet left (field ionisation). Restart or weaken $\\varepsilon$.');
    else showMsg(null);
  }
  let lastMsg = null;
  function showMsg(html) {
    if (html === lastMsg) return;
    lastMsg = html;
    msg.style.display = html ? '' : 'none';
    if (html) msg.innerHTML = ui.h('div', { html }).innerHTML;
  }

  // ------------------------------------------------------------ drawing
  function eachTrail(buf, n, head, cap, fn) {
    const start = (head - n + cap) % cap;
    for (let i = 0; i < n; i++) {
      const j = (start + i) % cap;
      fn(buf[2 * j], buf[2 * j + 1], i);
    }
  }
  function fadedPolyline(p, buf, n, head, cap, color, width) {
    if (n < 2) return;
    const chunks = 7;
    const per = Math.ceil(n / chunks);
    const pts = [];
    eachTrail(buf, n, head, cap, (x, y) => pts.push([x, y]));
    for (let c = 0; c < chunks; c++) {
      const a = c * per;
      const b = Math.min(n, (c + 1) * per + 1);
      if (b - a < 2) continue;
      p.line(pts.slice(a, b), { color, width, alpha: 0.18 + (0.8 * (c + 1)) / chunks });
    }
  }

  function drawOrbit(p) {
    if (model.kind === 'field' && model.strength > 0) p.vectorField(() => [0, 1], { color: 'muted', step: 48, alpha: 0.28, normalize: true, maxLen: 16 });
    const s = sim.s;
    const el = K.elements(s, k);
    // osculating Kepler ellipse
    if (S.osc && el.E < 0 && Math.abs(el.L) > 1e-6) {
      const pp = (el.L * el.L) / k;
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const f = (i / 200) * K.TAU;
        const r = pp / (1 + el.e * Math.cos(f));
        if (!(r > 0) || r > 50) {
          pts.push(null);
          continue;
        }
        pts.push([r * Math.cos(el.omega + f), r * Math.sin(el.omega + f)]);
      }
      p.line(pts, { color: 'alg', width: 1.1, dash: [5, 5], alpha: 0.55 });
    }
    fadedPolyline(p, trail, tN, tHead, TRAIL, 'grp', 1.7);
    // recent perihelia
    const P = sim.perihelia;
    for (let i = Math.max(0, P.length - 30); i < P.length; i++) p.dot([P[i].x, P[i].y], { r: 2.6, fill: 'alg', alpha: 0.35 + (0.6 * (i - P.length + 30)) / 30 });
    // launch point and v₀
    p.dot(R0, { r: 3.5, fill: 'muted' });
    p.arrow(R0, [R0[0] + VS * S.v0[0], R0[1] + VS * S.v0[1]], { color: 'ink2', width: 2, head: 9 });
    // Sun, A, L
    p.dot([0, 0], { r: 6.5, fill: 'hi' });
    if (el.e > 1e-3 && el.E < 0) {
      const tip = [(AS * el.A[0]) / k, (AS * el.A[1]) / k];
      p.arrow([0, 0], tip, { color: 'alg', width: 2.6, head: 11 });
      p.tex('\\alg{\\vec A}', tip, { key: 'A', offset: [14 * Math.cos(el.omega), -14 * Math.sin(el.omega) - 2] });
    }
    drawL(p, el.L, ref ? ref.C : 1);
    // planet
    if (!sim.captured) p.dot([s[0], s[1]], { r: 5.5, fill: 'grp', stroke: 'surface', width: 2 });
  }

  function drawL(p, L, C) {
    const rpx = 13 + 13 * Math.min(1.2, Math.abs(L) / (C || 1));
    const rw = rpx / p.scale;
    if (Math.abs(L) < 0.01 * C) {
      p.circle([0, 0], rw, { color: 'z', width: 1.5, dash: [2, 3] });
      return;
    }
    const sg = Math.sign(L);
    const a0 = 1.35 * Math.PI;
    const span = 1.45 * Math.PI;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = a0 + (sg * span * i) / 40;
      pts.push([rw * Math.cos(a), rw * Math.sin(a)]);
    }
    p.line(pts.slice(0, -2), { color: 'z', width: 2 });
    p.arrow(pts[pts.length - 4], pts[pts.length - 1], { color: 'z', width: 2, head: 8 });
    p.tex('\\cz{L_z}', [rw * Math.cos(a0 - 0.25 * sg), rw * Math.sin(a0 - 0.25 * sg)], { key: 'L', offset: [-12, 10] });
  }

  function drawHodo(p) {
    fadedPolyline(p, vtrail, vN, vHead, VTRAIL, 'grp', 1.7);
    const s = sim.s;
    const H = K.hodograph(s, k);
    if (H && H.R < 60) {
      p.circle(H.c, H.R, { color: 'alg', width: 1.2, dash: [5, 5], alpha: 0.75 });
      p.dot(H.c, { r: 3.5, fill: 'alg' });
      p.segment(H.c, [H.c[0] + H.R, H.c[1]], { color: 'alg', width: 1, alpha: 0.6 });
      p.tex('\\alg{(\\hat z\\times\\vec A)/L}', H.c, { key: 'c', offset: [0, 15], small: true });
      p.tex('\\alg{k/|L|}', [H.c[0] + H.R / 2, H.c[1]], { key: 'R', offset: [0, -11], small: true });
    }
    p.arrow([0, 0], [s[2], s[3]], { color: 'ink2', width: 1.6, head: 8 });
    p.dot([s[2], s[3]], { r: 5, fill: 'grp', stroke: 'surface', width: 2 });
  }

  // ------------------------------------------------------------ init
  setKind(S.kind);
  selKind.set(S.kind, { silent: true });
  play.set(S.playing, { silent: true });
}
