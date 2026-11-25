// Tab (c): spin-½ in a magnetic field. Larmor precession on the Bloch sphere, the spinor components as
// phasors (ψ → −ψ after one full precession), and the 4π period seen in neutron interferometry.

import * as ui from '../../core/ui.js';
import { scene3d } from '../../core/three-kit.js';
import { plot2d } from '../../core/plot2d.js';
import { vec, TAU, toSph } from '../../core/la.js';
import { cx, spinorFromBloch, blochVector } from '../../core/complex.js';
import { texMatrix, texNum, texComplex, fmt, fmtDeg } from '../../core/format.js';
import { larmorU, evolve, interferenceIntensity } from './math.js';
import { fitCamera } from './fit.js';

const RATE = TAU / 4; // rad/s of precession at speed 1 (one turn in 4 s)
const B_PRESETS = { z: [0, 0, 1], x: [1, 0, 0], tilted: [0.5, 0.25, 0.83] };
const PSI_PRESETS = { tilted: [1.15, 0], plusx: [Math.PI / 2, 0], up: [0, 0] }; // Bloch angles (θ, φ)

export function mountSpin(pg, scope, ctx) {
  const S = (ctx.state.spin ??= { phi: 0, speed: 1, playing: true, B: [0, 0, 1], Bname: 'z', psiAng: PSI_PRESETS.tilted, psiName: 'tilted' });
  if (!(vec.norm(S.B) > 0.5)) S.B = [0, 0, 1];
  let stopAt = null;
  // evolving state (declared before the plots, which draw immediately)
  let psi0 = spinorFromBloch(S.psiAng[0], S.psiAng[1]);
  let trajA = [];
  let trajB = [];
  let cur = { psi: psi0, n: blochVector(psi0) };
  let schematicW = 0;

  // ------------------------------------------------------------------ views
  const vA = pg.view({ title: 'Bloch sphere: $\\vec n=\\langle\\psi|\\vec\\sigma|\\psi\\rangle$', hint: 'drag $\\vec B$ or the spin · drag to orbit', height: 'min(58vh, 470px)' });
  const vB = pg.view({ title: 'Spinor components as phasors', height: 'min(58vh, 470px)' });
  const vC = pg.view({ title: 'Neutron interferometer: intensity vs spin rotation $a$', span: true, height: 250 });

  // --- Bloch sphere
  const k = scene3d(vA.body, scope, { camera: [4.3, -3.6, 2.15], fov: 34, target: [0, 0, 0.1], minDistance: 2, maxDistance: 14 });
  fitCamera(k, vA.body, scope, { rV: 1.6, rH: 1.5 });
  k.wireSphere({ radius: 1, opacity: 0.2, lat: 6, lon: 12 });
  k.sphere({ radius: 1, color: 'grp', opacity: 0.05, segments: 48 });
  k.axes({ length: 1.28, labels: ['x', 'y', 'z'] });
  k.label('\\lvert\\uparrow\\rangle', [0, 0, 1], { offset: [-22, -4], small: true });
  k.label('\\lvert\\downarrow\\rangle', [0, 0, -1], { offset: [-22, 4], small: true });
  const bArrow = k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.02, headLength: 0.12, headRadius: 0.05 });
  const bTip = k.sphere({ radius: 0.075, color: 'alg', segments: 20 });
  const bLab = k.label('\\vec B', [0, 0, 0], { color: 'alg', offset: [14, -12] });
  const nArrow = k.arrow([0, 0, 0], [1, 0, 0], { color: 'grp', radius: 0.026, headLength: 0.13, headRadius: 0.06 });
  const nTip = k.sphere({ radius: 0.06, color: 'grp', segments: 20 });
  const nLab = k.label('\\vec n', [0, 0, 0], { color: 'grp', offset: [14, -12] });
  const vArrow = k.arrow([0, 0, 0], [0, 0, 0], { color: 'alg', radius: 0.012, headLength: 0.07, headRadius: 0.03, opacity: 0.85 });
  const orbit = k.line([], { color: 'grp', width: 1.5, dashed: true, dashSize: 0.05, gapSize: 0.04, opacity: 0.7 });
  const trail = k.line([], { color: 'grp', width: 3, opacity: 0.85 });
  k.draggable(bTip, {
    constrain: k.onSphere([0, 0, 0], 1.32),
    onDrag: (p) => {
      const n = vec.normalize(p);
      if (vec.norm(n) < 0.5) return;
      setB(n, null);
    },
  });
  k.draggable(nTip, {
    constrain: k.onSphere([0, 0, 0], 1),
    onDrag: (p) => {
      const { theta, phi } = toSph(p);
      if (!Number.isFinite(theta)) return;
      setPsi([theta, phi], null);
    },
  });

  // --- phasor dials
  const pB = plot2d(vB.body, scope, { x: [-2.45, 2.45], y: [-2.85, 2.25], pan: false, zoom: false, grid: false, axes: false, draw: drawPhasors });
  // --- interference
  const Y_RANGE = [-0.17, 1.42];
  const pC = plot2d(vC.body, scope, { x: [-0.5, 2 * TAU + 0.4], y: Y_RANGE, equal: false, pan: false, zoom: false, grid: false, axes: false, draw: drawInterference });
  scope.observeResize(vC.body, (r) => {
    const W = r.width;
    schematicW = W > 600 ? 250 : 0;
    const x1 = 2 * TAU + 0.4;
    const span = 2 * TAU + 0.9;
    const x0 = x1 - (span * W) / Math.max(1, W - schematicW);
    pC.setView({ x: [x0, x1], y: Y_RANGE });
  });
  const legC = vC.overlay('tr');
  ui.legend(legC, [
    { color: 'grp', label: '$I(a)=\\tfrac12\\big(1+\\cos\\tfrac a2\\big)$' },
    { color: 'muted', label: 'if $\\grp{U}(2\\pi)$ were $+\\id$' },
    { color: 'hi', label: 'now: $a=\\varphi$', dot: true },
  ]);

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Precession');
  const play = ui.playButton(sec, {
    playing: S.playing,
    onToggle: (p) => {
      S.playing = p;
      if (!p) stopAt = null;
    },
  });
  const sPhi = ui.slider(sec, {
    label: 'Precession angle $\\varphi=\\omega t$',
    min: 0,
    max: 2 * TAU,
    step: 0.001,
    value: S.phi,
    format: (x) => fmtDeg(x, 0),
    onInput: (x) => {
      S.phi = x;
      stopAt = null;
      update(true);
    },
  });
  ui.slider(sec, { label: 'Speed', min: 0.1, max: 2.5, step: 0.05, value: S.speed, format: (x) => fmt(x, 2) + '×', onInput: (x) => (S.speed = x) });
  const segB = ui.segmented(sec, {
    label: 'Field direction $\\hat B$',
    options: [
      { value: 'z', label: '$z$' },
      { value: 'x', label: '$x$' },
      { value: 'tilted', label: 'tilted' },
    ],
    value: S.Bname,
    onChange: (v) => setB(vec.normalize(B_PRESETS[v]), v),
  });
  const segPsi = ui.segmented(sec, {
    label: 'Initial spin',
    options: [
      { value: 'up', label: '$\\lvert\\uparrow\\rangle$' },
      { value: 'plusx', label: '$\\lvert{+x}\\rangle$' },
      { value: 'tilted', label: 'tilted' },
    ],
    value: S.psiName,
    onChange: (v) => setPsi(PSI_PRESETS[v], v),
  });

  const secR = pg.section('State and evolution');
  const rU = ui.readout(secR, { label: 'Evolution operator $\\grp{U}(\\varphi)=e^{-i\\varphi\\,\\hat B\\cdot\\vec\\sigma/2}$' });
  const rPsi = ui.readout(secR, { label: 'Spinor and Bloch vector' });
  const kv = ui.keyValue(secR, [
    ['$\\langle\\psi(0)|\\psi(\\varphi)\\rangle$', ''],
    ['Detector $I(\\varphi)$', ''],
  ]);
  ui.legend(secR, [
    { color: 'alg', label: 'field $\\hat B$, velocity $\\omega\\hat B\\times\\vec n$' },
    { color: 'grp', label: 'Bloch vector and its orbit' },
    { color: 'c1', label: '$\\alpha$' },
    { color: 'c3', label: '$\\beta$' },
  ]);

  const secAlg = pg.section('Algebra');
  const alg = ui.h('div', { class: 'su2-static' });
  secAlg.appendChild(alg);
  ui.texBlock(
    alg,
    '\\begin{gathered}\\sigma_x=\\begin{pmatrix}0&1\\\\1&0\\end{pmatrix},\\quad \\sigma_y=\\begin{pmatrix}0&-i\\\\i&0\\end{pmatrix},\\\\ \\sigma_z=\\begin{pmatrix}1&0\\\\0&-1\\end{pmatrix}\\end{gathered}',
  );
  ui.texBlock(alg, '\\brk{\\Big[\\alg{\\tfrac{\\sigma_i}{2}},\\alg{\\tfrac{\\sigma_j}{2}}\\Big]}=i\\epsilon_{ijk}\\,\\alg{\\tfrac{\\sigma_k}{2}}');
  ui.texBlock(alg, 'H=\\tfrac{\\omega}{2}\\,\\hat B\\cdot\\alg{\\vec\\sigma},\\qquad \\dot{\\vec n}=\\omega\\,\\hat B\\times\\vec n');

  ui.experiments(pg.section('Try this'), [
    {
      title: 'One full precession',
      text: 'Run to $\\varphi=2\\pi$. The Bloch vector is back where it started, but both phasors point the opposite way: $\\psi\\to-\\psi$. No measurement on this beam alone can tell.',
      apply: () => runTo(TAU),
    },
    {
      title: 'Two precessions',
      text: 'From $\\varphi=2\\pi$ (state $-\\psi$) continue to $4\\pi$: only now are the phasors back, $\\grp{U}(4\\pi)=+\\id$. With $\\hat B=\\hat z$, $\\alpha$ and $\\beta$ turn by $\\mp2\\pi$ over the full $4\\pi$ — at half the precession rate.',
      apply: () => {
        setB([0, 0, 1], 'z');
        setPsi(PSI_PRESETS.tilted, 'tilted');
        runTo(2 * TAU, TAU);
      },
    },
    {
      title: 'The 4π interference period',
      text: 'Send one beam through the field and not the other. At $\\varphi=2\\pi$ the two amplitudes are $\\psi$ and $-\\psi$ and cancel: the detector goes dark although the spin is "back". Rauch <i>et al.</i> and Werner <i>et al.</i> (1975) measured this $4\\pi$ period with neutrons.',
      apply: () => {
        play.set(false);
        sPhi.set(TAU);
      },
    },
    {
      title: 'Field along the spin',
      text: 'With $\\hat B\\parallel\\vec n$ the Bloch vector does not move at all, yet $\\alpha$ still turns as $e^{-i\\varphi/2}$. A global phase for this beam, a relative one in the interferometer: the curve is unchanged.',
      apply: () => {
        setB([0, 0, 1], 'z');
        setPsi(PSI_PRESETS.up, 'up');
        runTo(TAU, 0);
      },
    },
    {
      title: 'Any axis, any state',
      text: 'Tilt the field and drag the spin anywhere: the interference curve never changes, because $\\mathrm{Re}\\langle\\psi|\\grp{U}(a)|\\psi\\rangle=\\cos\\tfrac a2$ for every unit spinor and every axis.',
      apply: () => {
        setB(vec.normalize(B_PRESETS.tilted), 'tilted');
        setPsi(PSI_PRESETS.plusx, 'plusx');
        S.phi = 0;
        play.set(true);
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>A spin-½ with magnetic moment $\\vec\\mu=\\gamma\\vec S$ in a field $\\vec B$ has $H=-\\vec\\mu\\cdot\\vec B=\\tfrac\\omega2\\,\\hat B\\cdot\\vec\\sigma$
    with the Larmor frequency $\\omega=-\\gamma\\lvert\\vec B\\rvert$ (positive for neutrons and electrons, which have $\\gamma<0$). The
    evolution is an $SU(2)$ rotation,</p>
    $$\\grp{U}(t)=e^{-i\\omega t\\,\\hat B\\cdot\\vec\\sigma/2}=\\cos\\tfrac{\\omega t}{2}-i\\sin\\tfrac{\\omega t}{2}\\,\\hat B\\cdot\\vec\\sigma ,$$
    <p>and the Heisenberg equation $\\dot{\\vec\\sigma}=i[H,\\vec\\sigma]$ gives $\\dot{\\vec n}=\\omega\\,\\hat B\\times\\vec n$: the Bloch vector
    precesses about $\\hat B$ (orange arrow at its tip: the velocity, a tangent vector). The phasors show the components
    $\\alpha=\\langle\\uparrow|\\psi\\rangle$, $\\beta=\\langle\\downarrow|\\psi\\rangle$ in the complex plane; for $\\hat B=\\hat z$ they turn as
    $e^{\\mp i\\omega t/2}$ — at half the precession rate.</p>`);
  pg.note(`<h2>The experiment</h2>
    <p>A neutron beam is split coherently by a perfect silicon crystal; one path crosses a field region where the spin turns by
    $a\\propto\\lvert\\vec B\\rvert\\,L/v$, the other does not. At the recombination the amplitudes add:</p>
    $$I(a)\\propto\\big\\lVert\\grp{U}(a)\\psi+\\psi\\big\\rVert^2=2+2\\,\\mathrm{Re}\\,\\langle\\psi|\\grp{U}(a)|\\psi\\rangle=2\\big(1+\\cos\\tfrac a2\\big).$$
    <p>The intensity oscillates with period $a=4\\pi$, not $2\\pi$, whatever the spin state and the field direction. This was
    observed by Rauch, Zeilinger <i>et al.</i> (Phys. Lett. A 54, 425, 1975) and by Werner, Colella, Overhauser and Eagen (Phys.
    Rev. Lett. 35, 1053, 1975) — the first direct observation of the spinor sign.</p>
    <div class="callout physics"><span class="callout-title">Global vs relative phase</span>The sign $\\psi\\to-\\psi$ is a global
    phase for the rotated beam and is unobservable there. Superposed with an unrotated copy of itself it becomes a relative
    phase, and relative phases are what interference measures.</div>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><b>Magnetic resonance.</b> Add a weak field rotating at $\\omega$ about $\\hat z$; in the rotating frame the spin precesses
      slowly about it (Rabi oscillations). A "$\\pi$ pulse" flips $\\lvert\\uparrow\\rangle\\to\\lvert\\downarrow\\rangle$; a "$2\\pi$ pulse" returns
      the spin with a sign — measurable in Ramsey interferometry with atoms and trapped ions.</li>
      <li><b>Generators.</b> $\\vec S=\\vec\\sigma/2$ satisfies $[S_i,S_j]=i\\epsilon_{ijk}S_k$, the same algebra as orbital angular
      momentum, but $e^{-2\\pi i S_z}=-\\id$: the algebra is that of <a href="#/so3">SO(3)</a>, the group is $SU(2)$.</li>
      <li><b>Geometry.</b> Unit spinors form $S^3$; dropping the global phase leaves the Bloch sphere $S^2$. The phase that is left
      over after a closed loop on the sphere is the Berry phase: see the <a href="#/hopf">Hopf fibration</a>.</li>
    </ul>`);

  // ------------------------------------------------------------------ state
  function recomputeOrbit() {
    psi0 = spinorFromBloch(S.psiAng[0], S.psiAng[1]);
    trajA = [];
    trajB = [];
    for (let i = 0; i <= 160; i++) {
      const p = evolve(psi0, S.B, (2 * TAU * i) / 160);
      trajA.push(p[0]);
      trajB.push(p[1]);
    }
    // precession cone: circle about B through n(0)
    const n0 = blochVector(psi0);
    const c = vec.dot(n0, S.B);
    const centre = vec.scale(S.B, c);
    const r = Math.sqrt(Math.max(0, 1 - c * c));
    const u = r > 1e-6 ? vec.scale(vec.sub(n0, centre), 1 / r) : vec.perp(S.B);
    const w = vec.cross(S.B, u);
    const pts = [];
    if (r > 1e-3)
      for (let i = 0; i <= 96; i++) {
        const a = (TAU * i) / 96;
        pts.push(vec.add(centre, vec.add(vec.scale(u, r * Math.cos(a)), vec.scale(w, r * Math.sin(a)))));
      }
    orbit.setPoints(pts);
  }
  function setB(n, name) {
    S.B = n;
    S.Bname = name;
    segB.set(name ?? '', { silent: true });
    recomputeOrbit();
    update(true);
  }
  function setPsi(ang, name) {
    S.psiAng = ang;
    S.psiName = name;
    segPsi.set(name ?? '', { silent: true });
    S.phi = 0;
    sPhi.set(0, { silent: true });
    recomputeOrbit();
    update(true);
  }
  function runTo(target, from = 0) {
    S.phi = from;
    sPhi.set(from, { silent: true });
    stopAt = target;
    play.set(true);
    update(true);
  }

  // ------------------------------------------------------------------ drawing
  function dialFrame(p, c, r, i) {
    p.circle(c, r, { color: 'axis', width: 1.2 });
    p.line(
      [
        [c[0] - r * 1.1, c[1]],
        [c[0] + r * 1.1, c[1]],
      ],
      { color: 'grid', width: 1 },
    );
    p.line(
      [
        [c[0], c[1] - r * 1.1],
        [c[0], c[1] + r * 1.1],
      ],
      { color: 'grid', width: 1 },
    );
    p.tex('\\mathrm{Re}', [c[0] + r * 1.1, c[1]], { small: true, offset: [2, 10], align: 'left', key: 're' + i });
    p.tex('\\mathrm{Im}', [c[0], c[1] + r * 1.1], { small: true, offset: [13, 2], key: 'im' + i });
  }

  function drawPhasors(p) {
    const r = 0.86;
    const centres = [
      [-1.16, 1.0],
      [1.16, 1.0],
    ];
    const comps = [cur.psi[0], cur.psi[1]];
    const starts = [psi0[0], psi0[1]];
    const trajs = [trajA, trajB];
    const cols = ['c1', 'c3'];
    const names = ['\\alpha=\\langle\\uparrow|\\psi\\rangle', '\\beta=\\langle\\downarrow|\\psi\\rangle'];
    for (let i = 0; i < 2; i++) {
      const c = centres[i];
      dialFrame(p, c, r, i);
      const sc = (z) => [c[0] + r * z.re, c[1] + r * z.im];
      p.line(trajs[i].map(sc), { color: cols[i], width: 1.2, alpha: 0.35 }); // orbit over 0..4π
      const s = starts[i];
      if (cx.abs(s) > 0.03) {
        p.dot(sc(s), { r: 4, color: cols[i], alpha: 0.45 }); // ψ(0)
        p.dot(sc(cx.neg(s)), { r: 4.5, color: 'surface', stroke: cols[i], width: 1.5 }); // −ψ(0)
      }
      const z = comps[i];
      p.arrow(c, sc(z), { color: cols[i], width: 2.5, head: 9 });
      p.tex(names[i], [c[0], c[1] - r - 0.25], { key: 'n' + i, color: cols[i], small: true });
    }
    // overlap ⟨ψ(0)|ψ(φ)⟩: its real part is what the interferometer measures
    const ov = cx.add(cx.mul(cx.conj(psi0[0]), cur.psi[0]), cx.mul(cx.conj(psi0[1]), cur.psi[1]));
    const c = [0, -1.72];
    dialFrame(p, c, r, 2);
    const sc = (z) => [c[0] + r * z.re, c[1] + r * z.im];
    const orbitOv = [];
    for (let i = 0; i <= 120; i++) {
      const a = (2 * TAU * i) / 120;
      const ca = Math.cos(a / 2);
      const sa = Math.sin(a / 2);
      orbitOv.push(sc({ re: ca, im: -sa * vec.dot(blochVector(psi0), S.B) }));
    }
    p.line(orbitOv, { color: 'grp', width: 1.2, alpha: 0.35 });
    const tip = sc(ov);
    p.line([tip, [tip[0], c[1]]], { color: 'hi', width: 1.2, dash: [3, 3] });
    p.dot([tip[0], c[1]], { r: 4.5, color: 'hi' });
    p.arrow(c, tip, { color: 'grp', width: 2.5, head: 9 });
    p.tex('\\langle\\psi(0)|\\psi(\\varphi)\\rangle', [c[0] - r - 0.12, c[1] + r * 0.72], { key: 'nov', color: 'grp', small: true, align: 'right' });
    p.tex('\\mathrm{Re}=\\cos\\tfrac\\varphi2', [c[0] - r - 0.12, c[1] + r * 0.3], { key: 'nre', color: 'hi', small: true, align: 'right' });
    p.tex(`\\varphi=${texNum((S.phi * 180) / Math.PI, 0)}^\\circ`, [c[0] + r + 0.15, c[1] + r * 0.72], { key: 'phi', small: true, align: 'left' });
  }

  function drawInterference(p) {
    const x1 = 2 * TAU;
    // baseline and axes
    p.line(
      [
        [0, 0],
        [x1, 0],
      ],
      { color: 'axis', width: 1 },
    );
    p.line(
      [
        [0, 0],
        [0, 1.08],
      ],
      { color: 'axis', width: 1 },
    );
    for (let m = 0; m <= 4; m++) {
      const x = m * Math.PI;
      p.line(
        [
          [x, 0],
          [x, 1.05],
        ],
        { color: 'grid', width: 1 },
      );
      p.tex(m === 0 ? '0' : m === 1 ? '\\pi' : `${m}\\pi`, [x, 0], { small: true, offset: [0, 12], key: 'tx' + m });
    }
    p.tex('1', [0, 1], { small: true, offset: [-10, 0], key: 'ty1' });
    p.tex('a', [x1, 0], { small: true, offset: [14, 0], key: 'xa' });
    // comparison: what a 2π-periodic (vector-like) amplitude would give
    const cmp = [];
    const cur2 = [];
    for (let i = 0; i <= 240; i++) {
      const a = (x1 * i) / 240;
      cmp.push([a, (1 + Math.cos(a)) / 2]);
      cur2.push([a, interferenceIntensity(a)]);
    }
    p.line(cmp, { color: 'muted', width: 1.5, dash: [5, 5], alpha: 0.8 });
    p.line(cur2, { color: 'grp', width: 2.5 });
    // current marker
    const a = ((S.phi % (2 * TAU)) + 2 * TAU) % (2 * TAU);
    p.line(
      [
        [a, 0],
        [a, 1.08],
      ],
      { color: 'hi', width: 1.5, alpha: 0.8 },
    );
    p.dot([a, interferenceIntensity(a)], { r: 5.5, color: 'hi', stroke: 'surface', width: 1.5 });
    if (schematicW) drawSchematic(p);
  }

  function drawSchematic(p) {
    const g = p.ctx;
    const H = p.height;
    const x0 = 20;
    const cy = H / 2 + 10;
    const w = schematicW - 96;
    const h = Math.min(52, H / 2 - 44);
    const col = (c) => p.color(c);
    g.save();
    g.lineWidth = 1.6;
    g.strokeStyle = col('ink2');
    g.fillStyle = col('ink2');
    const A = [x0 + 20, cy];
    const U = [x0 + 20 + w / 2, cy - h];
    const D = [x0 + 20 + w / 2, cy + h];
    const R = [x0 + 20 + w, cy];
    // incoming beam
    g.beginPath();
    g.moveTo(x0 - 8, cy);
    g.lineTo(A[0], A[1]);
    g.stroke();
    // two paths
    g.beginPath();
    g.moveTo(...A);
    g.lineTo(...U);
    g.lineTo(...R);
    g.moveTo(...A);
    g.lineTo(...D);
    g.lineTo(...R);
    g.stroke();
    // outgoing beam to detector
    g.beginPath();
    g.moveTo(...R);
    g.lineTo(R[0] + 16, cy);
    g.stroke();
    g.beginPath();
    g.arc(R[0] + 20, cy, 5, 0, TAU);
    g.fillStyle = col('hi');
    g.fill();
    // crystal blades
    g.strokeStyle = col('muted');
    g.lineWidth = 3;
    for (const X of [A[0], U[0], R[0]]) {
      g.beginPath();
      g.moveTo(X, cy - h - 10);
      g.lineTo(X, cy + h + 10);
      g.stroke();
    }
    // field region on the upper path
    const fx = (A[0] + U[0]) / 2;
    const fy = (A[1] + U[1]) / 2;
    g.fillStyle = col('alg');
    g.globalAlpha = 0.22;
    g.fillRect(fx - 11, fy - 12, 22, 24);
    g.globalAlpha = 1;
    g.strokeStyle = col('alg');
    g.lineWidth = 1.5;
    g.strokeRect(fx - 11, fy - 12, 22, 24);
    g.restore();
    const wx = p.wx;
    const wy = p.wy;
    p.tex('\\vec B:\\ a', [wx(fx), wy(fy)], { small: true, offset: [-30, -14], key: 'sB', color: 'alg' });
    p.tex('\\text{I}', [wx((U[0] + R[0]) / 2), wy((U[1] + R[1]) / 2)], { small: true, offset: [8, -10], key: 'sI' });
    p.tex('\\text{II}', [wx((A[0] + D[0]) / 2), wy((A[1] + D[1]) / 2)], { small: true, offset: [-10, 10], key: 'sII' });
    p.tex('n', [wx(x0 - 8), wy(cy)], { small: true, offset: [0, -12], key: 'sn' });
    p.tex('\\text{detector}', [wx(R[0] + 20), wy(cy)], { small: true, offset: [0, h + 24], key: 'sdet', color: 'hi' });
  }

  // ------------------------------------------------------------------ update
  let lastReadout = -1;
  function update(force = false) {
    const psi = evolve(psi0, S.B, S.phi);
    const n = blochVector(psi);
    cur = { psi, n };
    // 3D
    bArrow.set([0, 0, 0], vec.scale(S.B, 1.32));
    bTip.position.set(...vec.scale(S.B, 1.32));
    bLab.setPosition(vec.scale(S.B, 1.32));
    nArrow.set([0, 0, 0], n);
    nTip.position.set(...n);
    nLab.setPosition(n);
    const vel = vec.cross(S.B, n);
    vArrow.set(n, vec.add(n, vec.scale(vel, 0.45)));
    // trail: the last half turn of the Bloch vector
    const pts = [];
    const back = Math.min(S.phi, Math.PI * 1.2);
    for (let i = 0; i <= 40; i++) pts.push(blochVector(evolve(psi0, S.B, S.phi - back + (back * i) / 40)));
    trail.setPoints(back > 1e-3 ? pts : []);
    pB.invalidate();
    pC.invalidate();

    const now = performance.now();
    if (!force && now - lastReadout < 100) return;
    lastReadout = now;
    rU.set(`\\grp{U}(\\varphi)=${texMatrix(larmorU(S.B, S.phi), 2)}`);
    rPsi.set(
      `\\psi=\\begin{pmatrix}${texComplex(psi[0], 2)}\\\\ ${texComplex(psi[1], 2)}\\end{pmatrix},\\quad \\vec n=\\begin{pmatrix}${texNum(n[0], 2)}\\\\ ${texNum(n[1], 2)}\\\\ ${texNum(n[2], 2)}\\end{pmatrix}`,
    );
    const ov = cx.add(cx.mul(cx.conj(psi0[0]), psi[0]), cx.mul(cx.conj(psi0[1]), psi[1])); // ⟨ψ(0)|ψ(φ)⟩
    const sameSign = Math.abs(ov.re - 1) < 2e-3;
    const flipped = Math.abs(ov.re + 1) < 2e-3;
    kv.set('$\\langle\\psi(0)|\\psi(\\varphi)\\rangle$', sameSign ? '+1: ψ = +ψ(0)' : flipped ? '−1: ψ = −ψ(0)' : fmtC(ov));
    kv.set('Detector $I(\\varphi)$', fmt(interferenceIntensity(S.phi), 2));
  }
  const fmtC = (z) => texComplex(z, 2).replace(/-/g, '−');

  // ------------------------------------------------------------------ animation
  scope.frame((dt) => {
    if (!S.playing) return;
    let phi = S.phi + dt * S.speed * RATE;
    if (stopAt !== null && phi >= stopAt) {
      phi = stopAt;
      stopAt = null;
      play.set(false);
    }
    if (phi > 2 * TAU) phi -= 2 * TAU; // U(4π) = 1: the evolution is exactly periodic
    S.phi = phi;
    sPhi.set(phi, { silent: true });
    update();
  });

  segB.set(S.Bname ?? '', { silent: true });
  segPsi.set(S.psiName ?? '', { silent: true });
  recomputeOrbit();
  update(true);
}
