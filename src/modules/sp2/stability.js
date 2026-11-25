// sp2 · tab "Stability & resonance": Floquet theory in one degree of freedom.
//   (1) strong focusing: thin-lens FODO lattice, rays and betatron envelope, turn-by-turn phase space
//   (2) the Mathieu equation q'' + (A − 2ε cos 2t) q = 0: Ince–Strutt chart, stroboscopic map, pumped oscillator
// Layout: a 3-column stage; the lattice and the chart span two columns on wide screens, q(t) spans all three.
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { mat, clamp } from '../../core/la.js';
import { fmt, texMatrix } from '../../core/format.js';
import { parseColor } from '../../core/theme.js';
import {
  cellMatrix, cellElements, traceRay, twiss, csInvariant, csEllipse, betaFunction, realEigenvectors,
  mathieuMonodromy, mathieuTrajectory, floquet,
} from './math.js';
import { throttle } from './common.js';

const NC = 6; // lattice cells shown
const NA = 160; // chart resolution (A)
const NE = 100; // chart resolution (ε)
const AR = [-3, 10];
const ER = [0, 3.5];
const NP = 12; // drive periods in the time plot
const NSTROBE = 260;
const NTURNS = 420;
const RAYS = [
  [0.8, 0],
  [0, 0.32],
  [-0.5, -0.12],
];
const Q0 = [0.3, 0];

export function mountStability(pg, scope, ctx) {
  const S = (ctx.state.stab ??= { kind: 'fodo', Lf: 0.9, showY: false, z0: [0.9, 0.3], A: 1, eps: 0.15, playing: true });
  const chart = (ctx.state.mathieuChart ??= { tr: new Float32Array(NA * NE), rows: 0 });
  const anim = { turns: 1, turnClock: 0, simT: 0, hold: 0 };
  ui.css(scope, '@media (min-width: 901px) { .sp2-span2 { grid-column: span 2; } }');

  // ------------------------------------------------------------------ derived quantities (cached)
  let lat = null;
  function lattice() {
    if (lat) return lat;
    const L = S.Lf;
    const Mx = cellMatrix(S.kind, L, 1, 'x');
    const My = cellMatrix(S.kind, L, 1, 'y');
    const twx = twiss(Mx);
    const twy = twiss(My);
    const rays = (plane) =>
      RAYS.map((z) => {
        const out = [];
        for (const [s, x] of traceRay(S.kind, L, 1, z, NC, plane)) {
          out.push([s / (2 * L), x]);
          if (Math.abs(x) > 8) break; // left the picture: the straight segment to this point is exact
        }
        return out;
      });
    const env = (plane, tw) => {
      if (!tw) return null;
      const eps = Math.max(...RAYS.map((z) => csInvariant(tw, z)));
      const bf = betaFunction(S.kind, L, 1, plane, NC, 20);
      const up = bf.map(([s, b]) => [s / (2 * L), Math.sqrt(eps * b)]);
      return { up, poly: [...up, ...up.slice().reverse().map(([u, x]) => [u, -x])] };
    };
    const orbit = [S.z0.slice()];
    let z = S.z0.slice();
    for (let n = 1; n < NTURNS; n++) {
      z = mat.mulv(Mx, z);
      if (!(Math.hypot(z[0], z[1]) < 1e4)) break;
      orbit.push(z);
    }
    lat = { L, Mx, My, twx, twy, raysX: rays('x'), raysY: rays('y'), envX: env('x', twx), envY: env('y', twy), orbit };
    return lat;
  }
  let sim = null;
  function simulation() {
    if (sim) return sim;
    const M = mathieuMonodromy(S.A, S.eps, 128);
    const traj = mathieuTrajectory(S.A, S.eps, Q0, NP, 96);
    const strobe = [Q0.slice()];
    let z = Q0.slice();
    for (let n = 1; n < NSTROBE; n++) {
      z = mat.mulv(M, z);
      if (!(Math.hypot(z[0], z[1]) < 1e6)) break;
      strobe.push(z);
    }
    const qmax = Math.max(0.35, ...traj.q.map(Math.abs));
    sim = { M, fq: floquet(M), traj, strobe, qmax };
    return sim;
  }

  // ------------------------------------------------------------------ views
  const vLat = pg.view({ title: `Strong focusing · ${NC} cells of the lattice`, hint: 'F, D: focusing, defocusing in $x$', height: 300 });
  const vPS = pg.view({ title: "Cell by cell in $(x,x')$", hint: 'drag the start point', height: 300 });
  const vChart = pg.view({ title: 'Mathieu stability chart · click to choose $(A,\\varepsilon)$', height: 340 });
  const vStrobe = pg.view({ title: 'Stroboscopic map $t=n\\pi$', height: 340 });
  const vSim = pg.view({ title: 'Pumped oscillator $q(t)$', span: true, height: 220 });
  vLat.el.classList.add('sp2-span2');
  vChart.el.classList.add('sp2-span2');

  // lattice: rays and envelope
  const pl = plot2d(vLat.body, scope, {
    x: [-0.25, NC + 0.25],
    y: [-2.7, 3.35],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw(p, c) {
      const D = lattice();
      p.segment([-0.25, 0], [NC + 0.25, 0], { color: 'axis', width: 1 });
      const els = cellElements(S.kind, D.L, 1, 'x').filter((e) => e.type === 'lens');
      for (let cell = 0; cell <= NC; cell++) {
        els.forEach((e, i) => {
          const u = cell + i * 0.5;
          if (u > NC + 1e-9) return;
          lensGlyph(p, c, u, e.f > 0);
          p.text(e.f > 0 ? 'F' : 'D', [u, 2.55], { align: 'center', size: 11, color: 'muted' });
        });
      }
      if (S.showY) {
        if (D.envY) p.polygon(D.envY.poly, { fill: 'y', alpha: 0.08 });
        for (const r of D.raysY) p.line(r, { color: 'y', width: 1.3, alpha: 0.9, dash: [5, 3] });
      }
      if (D.envX) {
        p.polygon(D.envX.poly, { fill: 'x', alpha: 0.12 });
        p.line(D.envX.up, { color: 'x', width: 1, alpha: 0.55 });
        p.line(D.envX.up.map(([u, x]) => [u, -x]), { color: 'x', width: 1, alpha: 0.55 });
      }
      for (const r of D.raysX) p.line(r, { color: 'x', width: 1.5, alpha: 0.95 });
      if (!D.twx) p.tex('\\text{unstable in } x\\text{: rays leave the beam pipe}', [NC / 2, -2.35], { key: 'unst', small: true, color: 'c8' });
      else if (S.showY && !D.twy) p.tex('\\text{unstable in } y', [NC / 2, -2.35], { key: 'unst', small: true, color: 'c8' });
    },
  });

  function lensGlyph(p, c, u, focusing) {
    const X = p.sx(u);
    const Yt = p.sy(2.25);
    const Yb = p.sy(-2.25);
    const Ym = (Yt + Yb) / 2;
    c.beginPath();
    if (focusing) c.ellipse(X, Ym, 4.5, (Yb - Yt) / 2, 0, 0, Math.PI * 2);
    else {
      const w = 5;
      c.moveTo(X - w, Yt);
      c.lineTo(X + w, Yt);
      c.quadraticCurveTo(X - 1, Ym, X + w, Yb);
      c.lineTo(X - w, Yb);
      c.quadraticCurveTo(X + 1, Ym, X - w, Yt);
      c.closePath();
    }
    c.fillStyle = p.color('muted');
    c.globalAlpha = focusing ? 0.22 : 0.1;
    c.fill();
    c.globalAlpha = 0.55;
    c.strokeStyle = p.color('ink2');
    c.lineWidth = 1;
    c.stroke();
    c.globalAlpha = 1;
  }

  // phase space of the one-cell map
  const pp = plot2d(vPS.body, scope, {
    x: [-1.9, 1.9],
    y: [-1.9, 1.9],
    draw(p) {
      const D = lattice();
      const v = p.view;
      p.tex('x', [v.x[1], 0], { key: 'xl', align: 'right', offset: [-8, -11], small: true });
      p.tex("x'", [0, p.wy(52)], { key: 'yl', align: 'left', offset: [7, 0], small: true });
      if (D.twx) {
        const I = csInvariant(D.twx, S.z0);
        const ell = csEllipse(D.twx, I);
        p.line(ell, { color: 'grp', width: 1.4, alpha: 0.7 });
      } else {
        const ev = realEigenvectors(D.Mx);
        if (ev) {
          const R = 8;
          ev.forEach((e, i) => {
            p.line(
              [
                [-R * e.vec[0], -R * e.vec[1]],
                [R * e.vec[0], R * e.vec[1]],
              ],
              { color: 'c8', width: 1.2, dash: [6, 4], alpha: 0.8 },
            );
            const sgn = e.vec[1] < 0 ? -1 : 1;
            p.tex(`\\lambda=${fmt(e.value, 2).replace('−', '-')}`, [sgn * 1.25 * e.vec[0], sgn * 1.25 * e.vec[1]], { key: 'ev' + i, small: true, color: 'c8', offset: [14, -8] });
          });
        }
      }
      const n = Math.min(anim.turns, D.orbit.length);
      for (let i = 0; i < n; i++) p.dot(D.orbit[i], { r: i === n - 1 ? 4 : 2, color: i === n - 1 ? 'hi' : 'grp', alpha: i === n - 1 ? 1 : 0.8 });
    },
  });
  pp.handle({
    get: () => S.z0,
    set: (z) => {
      S.z0 = [clamp(z[0], -1.8, 1.8), clamp(z[1], -1.8, 1.8)];
      lat = null;
      anim.turns = 1;
      refreshLattice(true);
    },
    color: 'grp',
    shape: 'ring',
    r: 6,
  });

  // Mathieu chart (image computed incrementally, cached in ctx.state)
  const off = document.createElement('canvas');
  off.width = NA;
  off.height = NE;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(NA, NE);
  const pal = ctx.colors;
  const cStable = parseColor(pal.c3);
  const cPlus = parseColor(pal.c8);
  const cMinus = parseColor(pal.brk);
  function paintRows(r0, r1) {
    for (let j = r0; j < r1; j++) {
      const row = NE - 1 - j;
      for (let i = 0; i < NA; i++) {
        const tr = chart.tr[j * NA + i];
        const k = 4 * (row * NA + i);
        let col;
        let a;
        if (Math.abs(tr) < 2) {
          col = cStable;
          a = 0.22;
        } else {
          const x = Math.abs(tr) / 2;
          const g = Math.log(x + Math.sqrt(x * x - 1));
          col = tr > 0 ? cPlus : cMinus;
          a = 0.32 + 0.5 * Math.min(1, g / 1.6);
        }
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = Math.round(255 * a);
      }
    }
    offCtx.putImageData(img, 0, 0);
  }
  paintRows(0, chart.rows);

  const pc = plot2d(vChart.body, scope, {
    x: [-3.85, 10.35],
    y: [-0.95, 4.15],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw(p, c) {
      const X0 = p.sx(AR[0]);
      const X1 = p.sx(AR[1]);
      const Y1 = p.sy(ER[1]);
      const Yb = p.sy(ER[0]);
      if (chart.rows > 0) {
        c.imageSmoothingEnabled = true;
        const frac = chart.rows / NE;
        c.drawImage(off, 0, NE - chart.rows, NA, chart.rows, X0, Yb - (Yb - Y1) * frac, X1 - X0, (Yb - Y1) * frac);
      }
      c.strokeStyle = p.color('axis');
      c.lineWidth = 1;
      c.strokeRect(Math.round(X0) + 0.5, Math.round(Y1) + 0.5, Math.round(X1 - X0), Math.round(Yb - Y1));
      for (let A = -2; A <= 10; A += 2) {
        p.segment([A, 0], [A, -0.08], { color: 'axis', width: 1 });
        p.text(String(A).replace('-', '−'), [A, -0.24], { align: 'center', size: 11, color: 'muted' });
      }
      for (let e = 1; e <= 3; e++) {
        p.segment([AR[0], e], [AR[0] - 0.12, e], { color: 'axis', width: 1 });
        p.text(String(e), [AR[0] - 0.2, e], { align: 'right', size: 11, color: 'muted' });
      }
      p.tex('A=\\omega_0^2\\ \\rightarrow', [AR[1], ER[1]], { key: 'ax', align: 'right', valign: 'bottom', small: true, offset: [0, -3] });
      p.tex('\\varepsilon', [AR[0] - 0.42, ER[1]], { key: 'ay', small: true });
      // resonances ω0 = nΩ/2 at A = n² (below the axis, under their tongue roots)
      const res = [
        [1, '\\tfrac{\\Omega}{2}'],
        [4, '\\Omega'],
        [9, '\\tfrac{3\\Omega}{2}'],
      ];
      for (const [A, lab] of res) {
        p.segment([A, 0], [A, 0.12], { color: 'ink2', width: 1.5 });
        p.tex(`\\omega_0=${lab}`, [A, -0.24], { key: 'res' + A, small: true, offset: [0, 18], color: 'ink2' });
      }
      if (chart.rows < NE) p.tex(`\\text{computing } ${Math.round((100 * chart.rows) / NE)}\\%`, [3.5, 3.0], { key: 'prog', small: true });
      p.segment([S.A, ER[0]], [S.A, ER[1]], { color: 'ink', width: 1, alpha: 0.35, dash: [3, 4] });
      p.segment([AR[0], S.eps], [AR[1], S.eps], { color: 'ink', width: 1, alpha: 0.35, dash: [3, 4] });
    },
  });
  pc.handle({
    get: () => [S.A, S.eps],
    set: (z) => setAE(z[0], z[1]),
    color: 'hi',
    shape: 'ring',
    r: 6,
  });
  pc.on('click', (pos) => {
    if (pos.x >= AR[0] && pos.x <= AR[1] && pos.y >= ER[0] && pos.y <= ER[1]) setAE(pos.x, pos.y);
  });

  // stroboscopic map of the Mathieu system (auto-scaled)
  let strobeR = 1;
  const pst = plot2d(vStrobe.body, scope, {
    x: [-1.25, 1.25],
    y: [-1.25, 1.25],
    pan: false,
    zoom: false,
    grid: false,
    draw(p) {
      const D = simulation();
      const R = strobeR;
      p.tex('q', [p.view.x[1], 0], { key: 'xl', align: 'right', offset: [-8, -11], small: true });
      p.tex('\\dot q', [0, p.wy(52)], { key: 'yl', align: 'left', offset: [7, 0], small: true });
      if (D.fq.kind !== 'stable') {
        const ev = realEigenvectors(D.M);
        if (ev)
          for (const e of ev)
            p.line(
              [
                [-3 * e.vec[0], -3 * e.vec[1]],
                [3 * e.vec[0], 3 * e.vec[1]],
              ],
              { color: D.fq.kind === 'unstable+' ? 'c8' : 'brk', width: 1.1, dash: [5, 4], alpha: 0.75 },
            );
      }
      const n = D.fq.kind === 'stable' ? D.strobe.length : Math.min(D.strobe.length, Math.floor(anim.simT) + 1);
      for (let i = 0; i < n; i++) {
        const z = D.strobe[i];
        if (Math.abs(z[0]) > 2 * R || Math.abs(z[1]) > 2 * R) continue;
        p.dot([z[0] / R, z[1] / R], { r: i === 0 ? 3.5 : 2, color: i === 0 ? 'hi' : 'grp', alpha: 0.9 });
      }
      p.tex(D.fq.kind === 'stable' ? '\\text{invariant ellipse}' : D.fq.kind === 'unstable+' ? '\\text{escape: } \\lambda>1' : '\\text{alternating: } \\lambda<-1', [0, -1.05], {
        key: 'kind',
        small: true,
        color: D.fq.kind === 'stable' ? 'c3' : D.fq.kind === 'unstable+' ? 'c8' : 'brk',
      });
    },
  });

  // pumped oscillator time series
  const ps = plot2d(vSim.body, scope, {
    x: [-0.3, NP + 0.3],
    y: [-1.42, 1.32],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw(p) {
      const D = simulation();
      const Y = D.qmax * 1.12;
      const sy = 1 / Y; // world y = q / Y: the plot is normalised to its largest swing
      p.segment([0, 0], [NP, 0], { color: 'axis', width: 1 });
      for (let n = 0; n <= NP; n++) p.segment([n, -1.05], [n, 1.05], { color: 'grid', width: 1 });
      const pump = [];
      for (let i = 0; i <= 720; i++) {
        const u = (i / 720) * NP;
        pump.push([u, -1.25 - 0.06 * Math.cos(2 * Math.PI * u)]);
      }
      p.line(pump, { color: 'alg', width: 1.1, alpha: 0.65 });
      const tEnd = Math.min(anim.simT, NP);
      const pts = [];
      const { t, q } = D.traj;
      for (let i = 0; i < t.length; i++) {
        const u = t[i] / Math.PI;
        if (u > tEnd + 1e-9) break;
        pts.push([u, q[i] * sy]);
      }
      p.line(pts, { color: 'grp', width: 2 });
      const nS = Math.floor(tEnd + 1e-9);
      for (let n = 0; n <= nS && n < D.traj.strobe.length; n++) p.dot([n, D.traj.strobe[n][0] * sy], { r: 3.2, color: 'hi' });
      p.tex('t/\\pi', [NP, 0], { key: 'tl', align: 'right', small: true, offset: [0, 13] });
      p.tex(`\\text{full scale } \\pm${fmt(Y, 2).replace('−', '-')}`, [NP, 1.05], { key: 'sc', align: 'right', small: true, color: 'muted' });
      p.tex('\\text{pump: stiffness } A-2\\varepsilon\\cos 2t', [0, -1.25], { key: 'pumpl', align: 'left', small: true, color: 'alg', offset: [4, -13] });
    },
  });

  // ------------------------------------------------------------------ panel
  const secA = pg.section('Animation');
  const row = ui.h('div', { class: 'btn-row' });
  secA.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  ui.button(row, {
    label: 'Restart',
    onClick: () => {
      anim.turns = 1;
      anim.simT = 0;
    },
  });

  const secF = pg.section('Strong focusing (thin lenses)');
  const seg = ui.segmented(secF, {
    label: 'Lattice (as seen in $x$)',
    options: [
      { value: 'fodo', label: 'FODO' },
      { value: 'dd', label: 'D only' },
      { value: 'ff', label: 'F only' },
    ],
    value: S.kind,
    onChange: (v) => {
      S.kind = v;
      lat = null;
      anim.turns = 1;
      refreshLattice(true);
    },
  });
  const sL = ui.slider(secF, {
    label: 'Lens spacing $L/f$',
    min: 0.05,
    max: 3,
    step: 0.01,
    value: S.Lf,
    onInput: (v) => {
      S.Lf = v;
      lat = null;
      anim.turns = 1;
      refreshLattice(true);
    },
  });
  const tY = ui.toggle(secF, {
    label: 'Show the vertical plane $y$',
    value: S.showY,
    onChange: (v) => {
      S.showY = v;
      refreshLattice(true);
    },
  });
  const bF = ui.badge(null, '', '');
  secF.appendChild(ui.h('div', { style: { margin: '6px 0' } }, bF));
  const outF = ui.readout(secF, { label: 'One cell (FODO: $M=D(L)\\,Q(-f)\\,D(L)\\,Q(f)$)' });
  const kvF = ui.keyValue(secF, [
    ['$\\tr M_x$ (FODO: $2-L^2/f^2$)', ''],
    ['$\\tr M_y$', ''],
    ['Phase advance per cell', ''],
    ['Beam width at F / at D', ''],
  ]);

  const secM = pg.section('Parametric resonance (Mathieu)', {
    help: '$\\ddot q+(A-2\\varepsilon\\cos 2t)\\,q=0$: natural frequency $\\omega_0=\\sqrt A$, pump frequency $\\Omega=2$, period $\\pi$.',
  });
  const sA = ui.slider(secM, { label: '$A=\\omega_0^2$', min: AR[0], max: AR[1], step: 0.01, value: S.A, onInput: (v) => setAE(v, S.eps, true) });
  const sE = ui.slider(secM, { label: 'Pump strength $\\varepsilon$', min: ER[0], max: ER[1], step: 0.01, value: S.eps, onInput: (v) => setAE(S.A, v, true) });
  const bM = ui.badge(null, '', '');
  secM.appendChild(ui.h('div', { style: { margin: '6px 0' } }, bM));
  const outM = ui.readout(secM, { label: 'Monodromy (one drive period)' });
  const kvM = ui.keyValue(secM, [
    ['Floquet multipliers', ''],
    ['Growth per drive period', ''],
    ['$M=e^{\\pi X}$, $X\\in\\sp(2,\\R)$?', ''],
  ]);
  ui.legend(pg.section('Legend'), [
    { color: 'x', label: 'rays, $x$ plane' },
    { color: 'y', label: 'rays, $y$ plane' },
    { color: 'grp', label: 'orbit of $\\grp M$' },
    { color: 'c3', label: 'stable, $|\\tr M|<2$' },
    { color: 'c8', label: 'unstable, $\\tr M>2$' },
    { color: 'brk', label: 'unstable, $\\tr M<-2$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Strong focusing works',
      text: 'FODO with $L=f$: half of the lenses defocus, yet every ray stays bounded, $\\tr M=2-L^2/f^2=1$. The shaded envelope $\\pm\\sqrt{\\varepsilon\\beta(s)}$ is widest in the F lenses, where the restoring kick (proportional to $x$) is strongest.',
      apply: () => {
        seg.set('fodo');
        sL.set(1);
        tY.set(false);
      },
    },
    {
      title: 'Lenses too far apart',
      text: '$L/f=2.3$: $\\tr M=-3.29<-2$. The multipliers are real and negative, so rays flip sign every cell while growing, and the cell-by-cell points run off along the eigen-directions.',
      apply: () => {
        seg.set('fodo');
        sL.set(2.3);
      },
    },
    {
      title: 'Both planes at once',
      text: 'A quadrupole focusing in $x$ defocuses in $y$ (since $\\nabla^2\\phi=0$). With <i>F only</i> the $y$ rays (green) escape; switch back to FODO and both planes are stable, because $M_y$ is a cyclic permutation of $M_x$: $\\tr M_y=\\tr M_x$. This is the alternating-gradient principle of every synchrotron.',
      apply: () => {
        seg.set('ff');
        sL.set(0.8);
        tY.set(true);
      },
    },
    {
      title: 'Pump a swing',
      text: '$A=1$, $\\varepsilon=0.15$: natural frequency $1$, pump at $2$. Inside the first tongue the amplitude grows like $e^{\\varepsilon t/2}$ while the swing still oscillates at <b>half</b> the pump frequency.',
      apply: () => setAE(1, 0.15, true, true),
    },
    {
      title: 'Upside-down pendulum',
      text: '$A=-0.3$: without pumping the origin is a hill (unstable). With $\\varepsilon=1$ it is stable — the Kapitza pendulum, and the principle of the Paul ion trap (Nobel prize 1989).',
      apply: () => setAE(-0.3, 1, true, true),
    },
    {
      title: 'Period doubling: no Hamiltonian',
      text: '$A=1$, $\\varepsilon=0.6$: $\\tr M<-2$ (pink tongue). The one-period map is $-e^{X}$, not $e^{\\pi X}$: no time-independent quadratic Hamiltonian reproduces it. Stroboscopic points alternate between two branches.',
      apply: () => setAE(1, 0.6, true, true),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p><b>Top:</b> a thin-lens lattice — focusing lens $Q(f)=\\begin{pmatrix}1&0\\\\-1/f&1\\end{pmatrix}$ (a shear in $x'$),
    drift $D(L)=\\begin{pmatrix}1&L\\\\0&1\\end{pmatrix}$ (a shear in $x$), defocusing lens $Q(-f)$, drift. Red rays move in
    the $x$ plane, green ones (optional) in $y$. The band is the betatron envelope $\\pm\\sqrt{\\varepsilon\\beta(s)}$ of the
    widest ray. On the right the same particle is recorded once per cell: the points $\\grp{M}^n z_0$ lie on an invariant
    ellipse when the lattice is stable and escape along eigen-directions when it is not.</p>
    <p><b>Below:</b> the stability chart of $\\ddot q+(A-2\\varepsilon\\cos2t)q=0$, obtained by integrating one period for
    each of $${NA}\\times ${NE}$ parameter pairs. Green: bounded motion. Red and pink tongues: parametric resonance. For
    the chosen point you see the stroboscopic map ($z$ at $t=n\\pi$) and the motion $q(t)$, normalised to its largest
    swing; orange dots mark $t=n\\pi$.</p>`);
  pg.note(`<h2>The physics</h2>
    <p><b>Floquet.</b> For a linear Hamiltonian system with period $T$, $z(t+T)=\\grp Mz(t)$ with $\\grp M\\in Sp(2,\\R)$.
    Its multipliers $\\lambda$, $1/\\lambda$ ($\\det M=1$) solve $\\lambda^2-\\tr M\\,\\lambda+1=0$:</p>
    $$|\\tr M|<2:\\ \\lambda=e^{\\pm i\\mu}\\ \\text{(bounded)};\\qquad |\\tr M|>2:\\ \\lambda\\in\\R,\\ |\\lambda|>1\\ \\text{(growth)}.$$
    <p><b>Strong focusing.</b> For the FODO cell $\\tr M=2-L^2/f^2$, so the lattice is stable for $L<2f$ although the
    defocusing lens alone is not; the phase advance obeys $\\sin\\tfrac{\\mu}{2}=\\tfrac{L}{2f}$. The particle conserves the
    Courant–Snyder invariant $\\gamma x^2+2\\alpha xx'+\\beta x'^2=\\varepsilon$, an ellipse of area $\\pi\\varepsilon$ (the
    emittance — Liouville again). Christofilos (1950) and Courant, Livingston and Snyder (1952) built the
    alternating-gradient synchrotron on this.</p>
    <div class="callout physics"><span class="callout-title">Paul trap · Kapitza pendulum</span>An oscillating
    quadrupole potential gives a Mathieu equation for each direction. A static quadrupole cannot trap a charge
    (Earnshaw), a rapidly alternating one can: that is the green sliver at $A<0$. Wolfgang Paul shared the 1989 Nobel
    prize for this ion trap; the same physics holds a pendulum upside down when its pivot is shaken.</div>
    <p><b>Swings.</b> Pumping modulates the stiffness. Resonance occurs when the natural frequency is a half-integer
    multiple of the pump, $\\omega_0=n\\Omega/2$, i.e. at $A=n^2$; the strongest tongue is $n=1$: pump at twice the
    natural frequency.</p>`);
  pg.note(`<h2>The mathematics</h2>
    <p>The monodromy is the time-ordered exponential of $\\alg{X}(t)=\\begin{pmatrix}0&1\\\\-(A-2\\varepsilon\\cos2t)&0\\end{pmatrix}$
    over one period. It is computed with a fourth-order Magnus integrator whose every step is an exact element of
    $SL(2,\\R)$, so $\\det M=1$ to rounding. Tongue boundaries are where $\\tr M=\\pm2$: solutions of period $\\pi$
    ($\\tr M=+2$, $n$ even) or $2\\pi$ ($\\tr M=-2$, $n$ odd). For small $\\varepsilon$ the first tongue is
    $1-\\varepsilon\\lesssim A\\lesssim1+\\varepsilon$; the $n$-th has width $O(\\varepsilon^n)$.</p>
    <p>Check (<code>tests/sp2.test.mjs</code>): at $\\varepsilon=1$ the characteristic values $a_0=-0.4551$,
    $b_1=-0.1102$, $a_1=1.8591$, $b_2=3.9170$, $a_2=4.3713$ (Abramowitz &amp; Stegun, table 20.1) give $|\\tr M|=2$ to
    $10^{-8}$.</p>
    <div class="callout warning"><span class="callout-title">Odd tongues are not exponentials</span>In the pink
    tongues $\\tr M<-2$, so $M=-e^{X}$ with hyperbolic $X$: there is no $X\\in\\sp(2,\\R)$ with $M=e^{\\pi X}$ (see the
    first tab). The motion only repeats, up to growth, after two periods — the subharmonic response of the swing.</div>`);
  pg.note(`<h2>Going further</h2>
    <ul>
    <li><b>Bloch bands.</b> Read $t$ as position: $-\\psi''+2\\varepsilon\\cos(2x)\\,\\psi=A\\,\\psi$ is the Schrödinger
    equation in a periodic potential. Stable $\\Leftrightarrow$ allowed energy band, tongues $\\Leftrightarrow$ band gaps,
    and the multiplier $e^{i\\mu}$ is the Bloch phase $e^{ik\\pi}$.</li>
    <li><b>Many degrees of freedom.</b> In $Sp(2n,\\R)$ instability needs two multipliers to collide on the unit circle,
    and only collisions of opposite Krein signature (opposite energy sign — the two sheets of the first tab) can leave
    it.</li>
    <li><b>Accelerator tunes.</b> Real rings avoid rational tunes $\\mu/2\\pi$, where small errors resonate — the same
    mechanism as the tongues.</li>
    <li>The 2+1 dimensional <a href="#/lorentz">Lorentz group</a> is $SL(2,\\R)/\\{\\pm1\\}$; the one-period maps here are
    its elements.</li>
    </ul>`);

  // ------------------------------------------------------------------ updates
  const gate = throttle(120);
  function refreshLattice(force = false) {
    pl.invalidate();
    pp.invalidate();
    if (!gate(force)) return;
    const D = lattice();
    const tx = mat.trace(D.Mx);
    const ty = mat.trace(D.My);
    const sx = Math.abs(tx) < 2;
    const sy = Math.abs(ty) < 2;
    bF.set(sx && sy ? 'stable in $x$ and $y$' : sx ? 'stable in $x$, unstable in $y$' : sy ? 'unstable in $x$' : 'unstable in $x$ and $y$', sx && sy ? 'good' : sx ? 'warn' : 'bad');
    outF.set(`\\grp{M_x}=${texMatrix(D.Mx, 3)},\\;\\; \\tr M_x=${fmt(tx, 3).replace('−', '-')}`);
    kvF.set('$\\tr M_x$ (FODO: $2-L^2/f^2$)', fmt(tx, 4));
    kvF.set('$\\tr M_y$', fmt(ty, 4));
    kvF.set('Phase advance per cell', D.twx ? `μ = ${fmt((Math.abs(D.twx.mu) * 180) / Math.PI, 1)}°` : '— (unstable)');
    if (D.twx && S.kind === 'fodo') {
      const bf = betaFunction(S.kind, D.L, 1, 'x', 1, 8);
      kvF.set('Beam width at F / at D', fmt(Math.sqrt(bf[0][1] / bf[8][1]), 2));
    } else kvF.set('Beam width at F / at D', '—');
  }
  function refreshSim() {
    ps.invalidate();
    pst.invalidate();
    pc.invalidate();
    const D = simulation();
    const tr = D.fq.tr;
    if (D.fq.kind === 'stable') bM.set('stable: $|\\tr M|<2$', 'good');
    else if (D.fq.kind === 'unstable+') bM.set('resonance: $\\tr M>2$', 'bad');
    else bM.set('resonance, period doubled: $\\tr M<-2$', 'brk');
    outM.set(`\\grp{M}=${texMatrix(D.M, 3)},\\;\\; \\tr M=${fmt(tr, 3).replace('−', '-')}`);
    if (D.fq.kind === 'stable') kvM.set('Floquet multipliers', `e^{±i·${fmt(D.fq.mu, 3)}}`);
    else kvM.set('Floquet multipliers', `${fmt(D.fq.lambda, 3)}, ${fmt(1 / D.fq.lambda, 3)}`);
    kvM.set('Growth per drive period', D.fq.kind === 'stable' ? 'none (bounded)' : `×${fmt(Math.abs(D.fq.lambda), 3)}`);
    kvM.set('$M=e^{\\pi X}$, $X\\in\\sp(2,\\R)$?', tr > -2 ? 'yes' : 'no: tr M < −2');
    const pts = D.fq.kind === 'stable' ? D.strobe : D.strobe.slice(0, 4);
    strobeR = 1.12 * Math.max(0.05, ...pts.map((z) => Math.max(Math.abs(z[0]), Math.abs(z[1]))));
  }
  function setAE(A, e, fromSlider = false, restart = false) {
    S.A = clamp(A, AR[0], AR[1]);
    S.eps = clamp(e, ER[0], ER[1]);
    sA.set(S.A, { silent: true });
    sE.set(S.eps, { silent: true });
    sim = null;
    if (restart || !fromSlider) anim.simT = 0;
    refreshSim();
    if (!S.playing && restart) play.set(true);
  }

  // ------------------------------------------------------------------ frame loop: chart computation + animation
  scope.frame((dt) => {
    if (chart.rows < NE) {
      const t0 = performance.now();
      const r0 = chart.rows;
      while (chart.rows < NE && performance.now() - t0 < 7) {
        const j = chart.rows;
        const eps = ER[0] + ((j + 0.5) * (ER[1] - ER[0])) / NE;
        for (let i = 0; i < NA; i++) {
          const A = AR[0] + ((i + 0.5) * (AR[1] - AR[0])) / NA;
          const M = mathieuMonodromy(A, eps, 96);
          chart.tr[j * NA + i] = M[0][0] + M[1][1];
        }
        chart.rows++;
      }
      paintRows(r0, chart.rows);
      pc.invalidate();
    }
    if (!S.playing) return;
    anim.turnClock += dt;
    const D = lattice();
    while (anim.turnClock > 0.045) {
      anim.turnClock -= 0.045;
      anim.turns++;
      if (anim.turns > D.orbit.length + 25) anim.turns = 1;
    }
    pp.invalidate();
    if (anim.simT < NP) anim.simT += (dt * NP) / 9;
    else {
      anim.hold += dt;
      if (anim.hold > 2) {
        anim.hold = 0;
        anim.simT = 0;
      }
    }
    ps.invalidate();
    pst.invalidate();
  });

  refreshLattice(true);
  refreshSim();
}
