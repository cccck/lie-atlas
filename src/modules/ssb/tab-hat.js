// SSB tab (a) — the Mexican hat V(φ) = λ(|φ|² − v²)² − h Re φ for a complex field φ.
// A ball (the homogeneous field mode, unit mass) obeys φ̈ = −∇V − γφ̇ (+ optional thermal noise).
// Views: 3D hat with the ball and the circle of vacua, a 2D top-view inset with the generator's tangent
// arrows, and time plots of |φ| (Higgs mode) and arg φ (Goldstone mode) with measured frequencies.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { fmt, texNum } from '../../core/format.js';
import { mix } from '../../core/theme.js';
import * as M from './math.js';

const { TAU, PI } = M;
const R_MAX = 1.45; // drawn radius of the hat (v = 1)
const ZS = 0.9; // vertical scale z = ZS · V
const BALL_R = 0.055;
const HIST_T = 16; // seconds shown in the time plots
const DT = 1 / 240; // integrator step
const DEF = { lam: 0.5, h: 0, gamma: 0.4, T: 0, auto: true };

export function mountHat(pg, scope, ctx) {
  const S = (ctx.state.hat ??= { ...DEF, playing: true, vacua: [], sim: null });
  const P = { lam: S.lam, v: 1, h: S.h };
  const pal = ctx.colors;

  // ------------------------------------------------------------------ simulation state
  const meterR = new M.ExtremaMeter({ minAmp: 4e-4 });
  const meterT = new M.ExtremaMeter({ minAmp: 2e-3 });
  let hist = []; // [t, r, thetaUnwrapped, x, y]
  let settle = 0;
  const sim = S.sim && S.sim.s.every(Number.isFinite) ? S.sim : (S.sim = { s: [0, 0, 0, 0], t: 0, thU: 0, thLast: 0 });
  let lastPhaseDrop = null;

  function resetMeters() {
    meterR.reset();
    meterT.reset();
  }
  function setBall(x, y, vx = 0, vy = 0, breakLine = true) {
    sim.s = [x, y, vx, vy];
    const th = Math.atan2(y, x);
    sim.thLast = th;
    sim.thU = th;
    resetMeters();
    if (breakLine) hist.push([sim.t, NaN, NaN, NaN, NaN]);
    settle = 0;
  }
  function drop() {
    const a = Math.random() * TAU;
    lastPhaseDrop = a;
    setBall(0.035 * Math.cos(a), 0.035 * Math.sin(a));
  }
  function ballAngle() {
    const [x, y] = sim.s;
    if (Math.hypot(x, y) > 0.25) return Math.atan2(y, x);
    return lastPhaseDrop ?? Math.random() * TAU;
  }
  /** Put the ball at rest on the valley floor at angle a (the vacuum for h = 0). */
  function placeOnTrough(a) {
    const r = M.troughR(a, P);
    setBall(r * Math.cos(a), r * Math.sin(a));
  }
  function kickRadial() {
    const a = ballAngle();
    const pr = M.predictions(P, 0);
    const dv = 0.12 * pr.wr0 * P.v; // ≈ 0.12 v swing
    sim.s[2] += dv * Math.cos(a);
    sim.s[3] += dv * Math.sin(a);
    resetMeters();
    stopAuto();
  }
  function kickTangential() {
    const a = ballAngle();
    const pr = M.predictions(P, 0);
    // h = 0: a fixed push (rolls freely). h > 0: a push giving a ≈ 23° swing, so the harmonic prediction applies.
    const dv = P.h > 0 ? Math.min(0.5, 0.4 * pr.r0 * pr.wt0) : 0.5;
    sim.s[2] += -dv * Math.sin(a);
    sim.s[3] += dv * Math.cos(a);
    resetMeters();
    stopAuto();
  }
  function stopAuto() {
    if (S.auto) tAuto.set(false);
  }
  if (!S.sim.init) {
    S.sim.init = true;
    drop();
  }

  // ------------------------------------------------------------------ views
  const v1 = pg.view({
    title: 'Potential $V(\\phi)$ over the complex $\\phi$-plane',
    hint: 'drag to orbit · scroll to zoom',
    height: 'var(--ssb-hat-h)',
  });
  const k = scene3d(v1.body, scope, { camera: [2.75, -2.85, 2.15], target: [0, 0, 0.12], minDistance: 2.2, maxDistance: 10 });
  // shift the picture left (the inset sits top-right) without moving the orbit centre
  k.camera.setViewOffset(1000, 1000, 70, -10, 1000, 1000);
  k.camera.aspect = k.size.width / k.size.height;
  k.camera.updateProjectionMatrix();

  // height colouring: valley floor in the group colour (the orbit of vacua), slopes fading to grey
  const cLow = new THREE.Color(mix(pal.grp, pal.surface, 0.12));
  const cMid = new THREE.Color(mix(pal.grp, pal.muted, 0.62));
  const cHigh = new THREE.Color(mix(pal.muted, pal.surface, 0.32));
  const tmpC = new THREE.Color();
  let zLo = 0;
  let zHi = 1;
  function ramp(z) {
    const t = M.clamp((z - zLo) / (zHi - zLo || 1), 0, 1) ** 0.75;
    if (t < 0.45) return tmpC.copy(cLow).lerp(cMid, t / 0.45);
    return tmpC.copy(cMid).lerp(cHigh, (t - 0.45) / 0.55);
  }
  function setRange() {
    zLo = ZS * M.hatV(M.vacuumR(P), 0, P);
    zHi = ZS * Math.max(M.hatV(-R_MAX, 0, P), M.hatV(0, 0, P));
  }
  setRange();
  const hatPt = (r, th) => {
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    return [x, y, ZS * M.hatV(x, y, P)];
  };
  const surf = k.surface(hatPt, [0, R_MAX], [0, TAU], 44, 128, {
    color: '#ffffff',
    colorFn: (u, v, p) => ramp(p[2]),
    roughness: 0.78,
    polygonOffset: true,
  });
  // polar guide lines (rings and spokes)
  const RINGS = [0.3, 0.6, 1.25, R_MAX];
  const rings = RINGS.map(() => k.line([], { color: 'ink2', width: 1, opacity: 0.28 }));
  const spokes = Array.from({ length: 12 }, () => k.line([], { color: 'ink2', width: 1, opacity: 0.2 }));
  const trough = k.line([], { color: 'grp', width: 3.2 });
  const vacDots = k.dots([], { radius: 0.03, color: 'grp', max: 48 });
  const trueVac = k.sphere({ radius: 0.034, color: 'ink', segments: 20 });
  const trueVacLabel = k.label('true vacuum', [0, 0, 0], { html: true, small: true, offset: [0, 16] });
  const trail = k.line([], { color: 'hi', width: 2, opacity: 0.6 });
  const ball = k.sphere({ radius: BALL_R, color: 'hi', segments: 28 });
  const arrG = k.arrow([0, 0, 0], [0.1, 0, 0], { color: 'alg', radius: 0.013, headLength: 0.085, headRadius: 0.034 });
  const arrH = k.arrow([0, 0, 0], [0.1, 0, 0], { color: 'c1', radius: 0.013, headLength: 0.085, headRadius: 0.034 });
  const labG = k.label('Goldstone', [0, 0, 0], { html: true, small: true, color: 'alg' });
  const labH = k.label('Higgs', [0, 0, 0], { html: true, small: true, color: 'c1' });
  const labV = k.label('V(\\phi)', [-0.95, 1.05, 1.0], { color: 'ink2' });
  const labVac = k.label('\\grp{|\\phi|=v}', [0, 0, 0], { small: true });

  function rebuildHat() {
    setRange();
    surf.update(hatPt);
    RINGS.forEach((r, i) => {
      const pts = [];
      for (let j = 0; j <= 128; j++) {
        const p = hatPt(r, (TAU * j) / 128);
        pts.push([p[0], p[1], p[2] + 0.006]);
      }
      rings[i].setPoints(pts);
    });
    spokes.forEach((ln, i) => {
      const th = (TAU * i) / spokes.length;
      const pts = [];
      for (let j = 0; j <= 40; j++) {
        const p = hatPt((R_MAX * j) / 40, th);
        pts.push([p[0], p[1], p[2] + 0.006]);
      }
      ln.setPoints(pts);
    });
    const tp = [];
    for (let j = 0; j <= 160; j++) {
      const th = (TAU * j) / 160;
      const r = M.troughR(th, P);
      const p = hatPt(r, th);
      tp.push([p[0], p[1], p[2] + 0.012]);
    }
    trough.setPoints(tp);
    trough.material.opacity = P.h > 0 ? 0.55 : 1;
    trough.material.transparent = P.h > 0;
    const r0 = M.vacuumR(P);
    const pv = hatPt(r0, 0);
    trueVac.position.set(pv[0], pv[1], pv[2] + 0.02);
    trueVac.visible = P.h > 0;
    trueVacLabel.setPosition([pv[0], pv[1], pv[2] + 0.02]);
    trueVacLabel.setVisible(P.h > 0);
    const la = -2.05;
    const pl = hatPt(1.2, la);
    labVac.setPosition([pl[0], pl[1], pl[2] + 0.1]);
    labV.setPosition([-0.85, 1.0, ZS * M.hatV(-0.85 * 1.2, 1.2, P) + 0.25]);
    updateVacDots();
  }
  function updateVacDots() {
    vacDots.setPoints(
      S.vacua.map((a) => {
        const p = hatPt(M.troughR(a, P), a);
        return [p[0], p[1], p[2] + 0.02];
      }),
    );
  }

  // ------------------------------------------------------------------ 2D inset: top view of the φ-plane
  const inset = v1.overlay('tr', 'overlay-card ssb-inset');
  inset.appendChild(ui.h('div', { class: 'ssb-inset-cap', html: 'top view · generator $\\alg{i\\phi}$' }));
  const insetPlot = ui.h('div', { class: 'ssb-inset-plot' });
  inset.appendChild(insetPlot);
  const pi = plot2d(insetPlot, scope, {
    x: [-1.62, 1.62],
    y: [-1.62, 1.62],
    pan: false,
    zoom: false,
    grid: false,
    axes: true,
    draw: drawInset,
  });
  function drawInset(p) {
    // orbit of vacua (valley floor)
    const tp = [];
    for (let j = 0; j <= 120; j++) {
      const th = (TAU * j) / 120;
      const r = M.troughR(th, P);
      tp.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    p.line(tp, { color: 'grp', width: 2, alpha: P.h > 0 ? 0.6 : 1 });
    // the generator δφ = iεφ: tangent to the orbit everywhere
    for (let j = 0; j < 16; j++) {
      const th = (TAU * j) / 16;
      const r = M.troughR(th, P);
      const c = [r * Math.cos(th), r * Math.sin(th)];
      const t = [-Math.sin(th) * 0.2, Math.cos(th) * 0.2];
      p.arrow([c[0] - t[0] / 2, c[1] - t[1] / 2], [c[0] + t[0] / 2, c[1] + t[1] / 2], { color: 'alg', width: 1.2, head: 5, alpha: 0.5 });
    }
    for (const a of S.vacua) {
      const r = M.troughR(a, P);
      p.dot([r * Math.cos(a), r * Math.sin(a)], { r: 2.4, color: 'grp' });
    }
    if (P.h > 0) {
      const r0 = M.vacuumR(P);
      p.dot([r0, 0], { r: 4, color: 'surface', stroke: 'ink', width: 1.6 });
      p.arrow([0.55, -1.38], [1.25, -1.38], { color: 'muted', width: 1.5, head: 6 });
      p.tex('h', [0.9, -1.38], { key: 'hlab', offset: [0, -9], small: true, color: 'muted' });
    }
    // recent path
    const now = sim.t;
    const pts = [];
    for (let i = hist.length - 1; i >= 0 && now - hist[i][0] < 4; i--) pts.push([hist[i][3], hist[i][4]]);
    p.line(pts, { color: 'hi', width: 1.4, alpha: 0.65 });
    const [x, y] = sim.s;
    const r = Math.hypot(x, y);
    if (r > 0.3) {
      const a = Math.atan2(y, x);
      const c = [Math.cos(a), Math.sin(a)];
      p.arrow([x, y], [x - c[1] * 0.62, y + c[0] * 0.62], { color: 'alg', width: 2.6, head: 8 });
      p.arrow([x, y], [x + c[0] * 0.4, y + c[1] * 0.4], { color: 'c1', width: 2, head: 7 });
      p.tex('\\alg{i\\phi}', [x - c[1] * 0.62, y + c[0] * 0.62], { key: 'gl', offset: [-c[1] * 12 + c[0] * 4, -(c[0] * 12 + c[1] * 4)], small: true });
      p.tex('\\rho', [x + c[0] * 0.4, y + c[1] * 0.4], { key: 'rl', offset: [c[0] * 10, -c[1] * 10], small: true, color: 'c1' });
    }
    p.dot([x, y], { r: 4.5, color: 'hi', stroke: 'surface', width: 1.5 });
    p.tex('\\mathrm{Re}\\,\\phi', [1.62, 0], { key: 'ax0', offset: [-4, -9], align: 'right', small: true, color: 'muted' });
    p.tex('\\mathrm{Im}\\,\\phi', [0, 1.62], { key: 'ax1', offset: [6, 8], align: 'left', small: true, color: 'muted' });
  }

  // ------------------------------------------------------------------ time plots
  const v2 = pg.view({ height: 'var(--ssb-hist-h)' });
  const grid = ui.h('div', { class: 'ssb-hist' });
  const cellR = ui.h('div', { class: 'ssb-hist-cell' });
  const cellT = ui.h('div', { class: 'ssb-hist-cell' });
  grid.append(cellR, cellT);
  v2.body.appendChild(grid);
  const capR = ui.h('div', { class: 'view-title', html: 'radial $|\\phi|(t)$ · Higgs mode' });
  const capT = ui.h('div', { class: 'view-title', html: 'angle $\\arg\\phi(t)$ · Goldstone mode' });
  const rngR = { lo: 0.8, hi: 1.2 };
  const rngT = { lo: -1, hi: 1 };
  const plotOpts = { x: [-HIST_T - 0.3, 0.5], y: [0, 1], equal: false, pan: false, zoom: false, grid: false, axes: false };
  const pr = plot2d(cellR, scope, { ...plotOpts, draw: (p) => drawSeries(p, 1, 'c1', rngR) });
  const pt = plot2d(cellT, scope, { ...plotOpts, draw: (p) => drawSeries(p, 2, 'alg', rngT) });
  cellR.appendChild(capR);
  cellT.appendChild(capT);

  function drawSeries(p, idx, color, rng) {
    const now = sim.t;
    const vw = p.view;
    // time ticks
    for (let s = 0; s <= HIST_T; s += 4) {
      const X = -s;
      p.segment([X, vw.y[0]], [X, vw.y[0] + (vw.y[1] - vw.y[0]) * 0.04], { color: 'axis', width: 1 });
      p.tex(s === 0 ? 'now' : `-${s}\\,\\mathrm{s}`, [X, vw.y[0]], { key: 'tt' + s, offset: [0, -8], small: true, color: 'muted' });
    }
    if (idx === 1) {
      const r0 = M.vacuumR(P);
      p.segment([-HIST_T, r0], [0, r0], { color: 'grp', width: 1.2, dash: [5, 4], alpha: 0.8 });
      p.tex(P.h > 0 ? 'r_0' : 'v', [-HIST_T, r0], { key: 'ref', offset: [-4, 0], align: 'right', small: true, color: 'grp' });
    } else {
      const span = rng.hi - rng.lo;
      const step = span > 9 ? TAU : span > 3.2 ? PI : PI / 2;
      const k0 = Math.ceil(rng.lo / step);
      const k1 = Math.floor(rng.hi / step);
      for (let kk = k0; kk <= k1 && kk - k0 < 40; kk++) {
        const y = kk * step;
        const isVac = P.h > 0 && Math.abs(M.wrapPi(y)) < 1e-9;
        p.segment([-HIST_T, y], [0, y], { color: isVac ? 'grp' : 'grid', width: isVac ? 1.2 : 1, dash: isVac ? [5, 4] : [], alpha: 0.9 });
        p.tex(angleTex(y), [-HIST_T, y], { key: 'ay' + kk, offset: [-4, 0], align: 'right', small: true, color: isVac ? 'grp' : 'muted' });
      }
    }
    const pts = [];
    for (let i = 0; i < hist.length; i++) {
      const hh = hist[i];
      pts.push([hh[0] - now, hh[idx]]);
    }
    p.line(pts, { color, width: 2 });
    const last = hist[hist.length - 1];
    if (last && Number.isFinite(last[idx])) p.dot([0, last[idx]], { r: 3.5, color });
  }
  function angleTex(y) {
    const q = Math.round(y / (PI / 2));
    if (q === 0) return '0';
    const sgn = q < 0 ? '-' : '';
    const a = Math.abs(q);
    if (a % 2 === 0) return `${sgn}${a / 2 === 1 ? '' : a / 2}\\pi`;
    return `${sgn}\\tfrac{${a === 1 ? '' : a}\\pi}{2}`;
  }
  function updateRanges(dt) {
    let rlo = Infinity;
    let rhi = -Infinity;
    let tlo = Infinity;
    let thi = -Infinity;
    for (const hh of hist) {
      if (!Number.isFinite(hh[1])) continue;
      rlo = Math.min(rlo, hh[1]);
      rhi = Math.max(rhi, hh[1]);
      tlo = Math.min(tlo, hh[2]);
      thi = Math.max(thi, hh[2]);
    }
    const r0 = M.vacuumR(P);
    if (!Number.isFinite(rlo)) (rlo = r0), (rhi = r0);
    if (!Number.isFinite(tlo)) (tlo = sim.thU), (thi = sim.thU);
    rlo = Math.min(rlo, r0 - 0.06);
    rhi = Math.max(rhi, r0 + 0.06);
    const tm = (tlo + thi) / 2;
    tlo = Math.min(tlo, tm - 0.35);
    thi = Math.max(thi, tm + 0.35);
    const ease = 1 - Math.exp(-dt / 0.35);
    const padR = 0.22 * (rhi - rlo);
    const padT = 0.22 * (thi - tlo);
    for (const [rg, lo, hi] of [
      [rngR, rlo - padR * 0.8, rhi + padR * 1.6],
      [rngT, tlo - padT * 0.8, thi + padT * 1.6],
    ]) {
      rg.lo += (lo - rg.lo) * ease;
      rg.hi += (hi - rg.hi) * ease;
    }
    pr.setView({ x: plotOpts.x, y: [rngR.lo, rngR.hi] });
    pt.setView({ x: plotOpts.x, y: [rngT.lo, rngT.hi] });
  }

  // ------------------------------------------------------------------ panel
  const secF = pg.section('The field $\\phi$');
  ui.buttons(secF, [
    { label: 'Drop near the top', kind: 'primary', onClick: () => drop() },
    { label: 'Radial kick (Higgs)', onClick: kickRadial },
    { label: 'Tangential kick (Goldstone)', onClick: kickTangential },
  ]);
  const rowP = ui.h('div', { class: 'btn-row' });
  secF.appendChild(rowP);
  const play = ui.playButton(rowP, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(rowP, { label: 'Reset', onClick: resetAll });
  const tAuto = ui.toggle(secF, {
    label: 'Repeat drops (record the vacua)',
    value: S.auto,
    onChange: (v) => (S.auto = v),
  });

  const secV = pg.section('Potential $V=\\lambda(|\\phi|^2-v^2)^2-h\\,\\mathrm{Re}\\,\\phi$');
  const sLam = ui.slider(secV, {
    label: 'Quartic coupling $\\lambda$ (steepness)',
    min: 0.3,
    max: 1.5,
    step: 0.01,
    value: S.lam,
    onInput: (x) => {
      S.lam = P.lam = x;
      meterR.reset();
      meterT.reset();
      rebuildHat();
    },
  });
  const sH = ui.slider(secV, {
    label: 'Explicit breaking $h$ (tilt)',
    min: 0,
    max: 0.3,
    step: 0.005,
    value: S.h,
    format: 3,
    onInput: (x) => {
      S.h = P.h = x;
      meterT.reset();
      rebuildHat();
    },
  });
  const sG = ui.slider(secV, {
    label: 'Damping $\\gamma$',
    min: 0,
    max: 1,
    step: 0.01,
    value: S.gamma,
    onInput: (x) => (S.gamma = x),
  });
  const sT = ui.slider(secV, {
    label: 'Thermal noise $T$',
    min: 0,
    max: 0.02,
    step: 0.0005,
    value: S.T,
    format: 4,
    onInput: (x) => (S.T = x),
  });

  const secR = pg.section('Readout');
  const out = ui.readout(secR, { label: 'Ball (homogeneous field) and mass matrix at the vacuum' });
  const kv = ui.keyValue(secR, [
    ['Higgs $\\omega_\\rho$ measured', '—'],
    ['predicted $\\sqrt{m_\\rho^2-\\gamma^2/4}$', '—'],
    ['Goldstone $\\omega_\\pi$ measured', '—'],
    ['predicted $\\sqrt{m_\\pi^2-\\gamma^2/4}$', '—'],
  ]);
  ui.note(
    secR,
    'Measured from successive turning points. Predictions use the exact Hessian at the (tilted) vacuum and the damping shift $\\omega=\\sqrt{\\omega_0^2-\\gamma^2/4}$; units $v=1$.',
  );
  ui.legend(pg.section('Legend'), [
    { color: 'grp', label: 'vacuum manifold $|\\phi|=v$ (orbit)' },
    { color: 'alg', label: 'generator $\\alg{i\\phi}$: Goldstone direction' },
    { color: 'c1', label: 'radial (Higgs) direction $\\rho$' },
    { color: 'hi', label: 'the field (ball) and its path', dot: true },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Pick a vacuum',
      text: 'The ball starts on the symmetric hilltop and rolls off in a random direction; violet dots record where earlier drops settled. The law $V$ is symmetric under $\\phi\\to e^{i\\alpha}\\phi$, the outcome is not — and every point of the circle is an equally good vacuum.',
      apply: () => {
        setParams({ h: 0, gamma: 0.4, T: 0 });
        tAuto.set(true);
        play.set(true);
        drop();
      },
    },
    {
      title: 'Higgs mode: kick across the trough',
      text: 'A radial kick makes $|\\phi|$ oscillate at $\\omega_\\rho=\\sqrt{V\'\'(v)}=\\sqrt{8\\lambda}\\,v$: a massive particle. Compare measured and predicted, then raise $\\lambda$ — steeper walls, heavier Higgs. In the Standard Model this amplitude mode is the Higgs boson.',
      apply: () => {
        setParams({ h: 0, gamma: 0.05, T: 0 });
        play.set(true);
        placeOnTrough(ballAngle());
        kickRadial();
      },
    },
    {
      title: 'Goldstone mode: kick along the trough',
      text: 'A tangential kick sends the ball rolling round the circle with nothing pulling it back: $\\omega_\\pi=0$, a massless mode. Moving along the orbit of vacua costs no energy; a slow spatial twist of the phase costs only gradient energy, so the wave has $\\omega=c|k|\\to0$ — the phonon of a superfluid.',
      apply: () => {
        setParams({ h: 0, gamma: 0.03, T: 0 });
        play.set(true);
        placeOnTrough(ballAngle());
        kickTangential();
      },
    },
    {
      title: 'Tilt the hat: a pseudo-Goldstone',
      text: 'With $h=0.1$ the trough has a lowest point and the ball swings back slowly, $\\omega_\\pi^2=h/v$. Try $h=0.025$ and $h=0.1$: four times the tilt, twice the frequency ($m_\\pi^2\\propto h$). Quark masses tilt the chiral hat of QCD in just this way, so pions are light but not massless.',
      apply: () => {
        setParams({ h: 0.1, gamma: 0.05, T: 0 });
        play.set(true);
        const r0 = M.vacuumR(P);
        setBall(r0, 0);
        kickTangential();
      },
    },
    {
      title: 'Thermal jiggle',
      text: 'Random kicks in every direction: the radius stays pinned near $v$ (stiff, $\\langle\\delta\\rho^2\\rangle=T/m_\\rho^2$) while the angle wanders round the whole trough — the soft Goldstone direction. In one or two dimensions these soft fluctuations destroy long-range order altogether (Mermin–Wagner).',
      apply: () => {
        setParams({ h: 0, gamma: 0.4, T: 0.012 });
        play.set(true);
        placeOnTrough(ballAngle());
      },
    },
  ]);

  function setParams({ lam = S.lam, h, gamma, T }) {
    stopAuto();
    sLam.set(lam, { silent: true });
    S.lam = P.lam = lam;
    if (h !== undefined) {
      sH.set(h, { silent: true });
      S.h = P.h = h;
    }
    if (gamma !== undefined) {
      sG.set(gamma, { silent: true });
      S.gamma = gamma;
    }
    if (T !== undefined) {
      sT.set(T, { silent: true });
      S.T = T;
    }
    rebuildHat();
  }
  function resetAll() {
    setParams({ lam: DEF.lam, h: DEF.h, gamma: DEF.gamma, T: DEF.T });
    S.vacua = [];
    hist = [];
    updateVacDots();
    tAuto.set(true);
    play.set(true);
    drop();
  }

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>The surface is the potential of a complex scalar field, $\\phi=\\phi_1+i\\phi_2$, with the usual normalisation
    $\\mathcal L=\\tfrac12|\\partial\\phi|^2-V$:</p>
    $$V(\\phi)=\\lambda\\bigl(|\\phi|^2-v^2\\bigr)^2-h\\,\\mathrm{Re}\\,\\phi .$$
    <p>For $h=0$ it is invariant under the $U(1)$ rotations $\\phi\\to e^{i\\alpha}\\phi$, but the symmetric point $\\phi=0$ is a
    maximum. The minima form the <b>violet circle</b> $|\\phi|=v$ — one orbit of the symmetry group. The ball is the spatially
    uniform field, a unit-mass particle obeying $\\ddot\\phi=-\\nabla V-\\gamma\\dot\\phi$. The inset shows the same
    plane from above, with the generator $\\delta\\phi=i\\epsilon\\phi$ drawn as <span class="tx-alg">orange</span> arrows: tangent to
    the circle at every vacuum.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Symmetric laws, asymmetric state. Nothing in
    $V$ prefers a direction, so the ball has to pick one — and because every direction is equivalent, pushing it
    <i>along</i> the circle meets no resistance. That free direction is the Goldstone boson.</div>`);

  pg.note(`<h2>The physics</h2>
    <p><b>Two kinds of fluctuation.</b> Write $\\phi=(v+\\rho)\\,e^{i\\pi/v}$. Expanding about the vacuum,</p>
    $$V=\\tfrac12\\,m_\\rho^2\\,\\rho^2+\\tfrac12\\,m_\\pi^2\\,\\pi^2+\\dots,\\qquad m_\\rho^2=8\\lambda v^2,\\qquad m_\\pi^2=0 .$$
    <p>The radial (amplitude) mode $\\rho$ is massive — in the Standard Model it is the <b>Higgs boson</b>. The angular mode
    $\\pi$ is exactly massless: <b>Goldstone's theorem</b>. If a conserved charge $Q$ generates a symmetry ($[Q,H]=0$) but
    does not annihilate the vacuum ($Q|0\\rangle\\neq0$), then $Q$ acting with momentum $k$ creates states whose energy
    $\\to0$ as $k\\to0$: one massless particle per broken generator.</p>
    <p><b>Explicit breaking.</b> A small term $-h\\,\\mathrm{Re}\\,\\phi$ tilts the hat. The vacuum is now unique,
    $\\langle\\phi\\rangle\\approx v$, and the would-be Goldstone acquires a small mass:</p>
    $$V\\approx -hv\\cos(\\pi/v)\\;\\Rightarrow\\; m_\\pi^2=\\frac hv,\\qquad m_\\pi^2 v^2=h\\,\\langle\\mathrm{Re}\\,\\phi\\rangle .$$
    <div class="callout physics"><span class="callout-title">Why pions are light</span>In QCD the quark condensate
    $\\langle\\bar qq\\rangle$ breaks chiral symmetry and the pions are its Goldstones; the small quark masses are the tilt.
    The Gell-Mann–Oakes–Renner relation $m_\\pi^2f_\\pi^2=(m_u+m_d)\\,|\\langle\\bar qq\\rangle|$ is exactly the formula
    above with $v\\to f_\\pi$, $h\\to m_q$: so $m_\\pi\\approx140$ MeV, far below the $\\sim1$ GeV of ordinary hadrons.
    See the counting in the third tab and <a href="#/su3">SU(3)</a> for the meson octet.</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>The mass matrix is the Hessian of $V$ at the vacuum. Each generator $T$ of the symmetry gives a zero mode: from
    $V(e^{\\epsilon T}\\phi)=V(\\phi)$, differentiating twice at a minimum $\\phi_0$,</p>
    $$\\frac{\\partial^2V}{\\partial\\phi_i\\partial\\phi_j}\\Big|_{\\phi_0}(T\\phi_0)_j=0 .$$
    <p>So every $T$ with $T\\phi_0\\neq0$ — a <b>broken</b> generator — is a null vector of the mass matrix. Here
    $T\\phi_0=i\\phi_0$ is the tangent to the orbit $U(1)\\cdot\\phi_0\\cong U(1)/H$ with $H=\\{1\\}$ the stabiliser.
    In general the vacua form the coset $G/H$, and the number of Goldstone fields is $\\dim G-\\dim H$.</p>
    <p><b>Numbers.</b> The phase is a coordinate on a compact group, so the Goldstone field is an angle — the same
    $\\R\\to U(1)$ wrapping as in <a href="#/u1">U(1)</a>. With $h>0$ the angle obeys a pendulum equation,
    $v^2\\ddot\\theta=-hv\\sin\\theta$; the measured frequency matches $\\sqrt{h/v}$ only for small swings.</p>`);

  // ------------------------------------------------------------------ animation
  let readoutClock = 1;
  scope.frame((dt) => {
    if (play.playing) {
      const n = Math.max(1, Math.round(dt / DT));
      const hstep = dt / n;
      for (let i = 0; i < n; i++) {
        sim.s = M.hatStep(sim.s, hstep, P, S.gamma);
        if (S.T > 0 && S.gamma > 0) {
          const a = Math.sqrt(2 * S.gamma * S.T * hstep);
          sim.s[2] += a * M.gauss();
          sim.s[3] += a * M.gauss();
        }
        sim.t += hstep;
        const th = Math.atan2(sim.s[1], sim.s[0]);
        sim.thU += M.wrapPi(th - sim.thLast);
        sim.thLast = th;
        meterR.push(sim.t, Math.hypot(sim.s[0], sim.s[1]));
        if (P.h > 0) meterT.push(sim.t, M.wrapPi(th));
      }
      if (!sim.s.every(Number.isFinite) || Math.hypot(sim.s[0], sim.s[1]) > 2.4) drop();
      const [x, y] = sim.s;
      hist.push([sim.t, Math.hypot(x, y), sim.thU, x, y]);
      while (hist.length && sim.t - hist[0][0] > HIST_T + 1) hist.shift();
      // repeat drops: once the ball has settled, record its vacuum and drop again
      if (S.auto) {
        const E = M.hatEnergy(sim.s, P);
        settle = E < 0.012 * P.lam ? settle + dt : 0;
        if (settle > 1.4) {
          S.vacua.push(Math.atan2(y, x));
          if (S.vacua.length > 40) S.vacua.shift();
          updateVacDots();
          drop();
        }
      }
      updateRanges(dt);
    }
    updateBall();
    pi.invalidate();
    pr.invalidate();
    pt.invalidate();
    readoutClock += dt;
    if (readoutClock > 0.2) {
      readoutClock = 0;
      updateReadouts();
    }
  });

  function updateBall() {
    const [x, y] = sim.s;
    const g = M.hatGrad(x, y, P);
    const nrm = M.v3.normalize([-ZS * g[0], -ZS * g[1], 1]);
    const z = ZS * M.hatV(x, y, P);
    ball.position.set(x + BALL_R * nrm[0], y + BALL_R * nrm[1], z + BALL_R * nrm[2]);
    const pts = [];
    for (let i = hist.length - 1; i >= 0 && sim.t - hist[i][0] < 3; i--) {
      const hh = hist[i];
      if (!Number.isFinite(hh[3])) break;
      pts.push([hh[3], hh[4], ZS * M.hatV(hh[3], hh[4], P) + 0.014]);
    }
    trail.setPoints(pts);
    const r = Math.hypot(x, y);
    const show = r > 0.35;
    arrG.visible = arrH.visible = show;
    labG.setVisible(show);
    labH.setVisible(show);
    if (show) {
      const c = [x / r, y / r];
      const base = [x, y, z + 0.02];
      // tangent (generator) direction, lifted onto the surface slope
      const tg = [-c[1], c[0]];
      const dzt = ZS * (g[0] * tg[0] + g[1] * tg[1]);
      const ut = M.v3.normalize([tg[0], tg[1], dzt]);
      const dzr = ZS * (g[0] * c[0] + g[1] * c[1]);
      const ur = M.v3.normalize([c[0], c[1], dzr]);
      const tipG = M.v3.add(base, M.v3.scale(ut, 0.42));
      const tipH = M.v3.add(base, M.v3.scale(ur, 0.3));
      arrG.set(base, tipG);
      arrH.set(base, tipH);
      labG.setPosition(M.v3.add(tipG, [0, 0, 0.09]));
      labH.setPosition(M.v3.add(tipH, [0, 0, 0.09]));
    }
  }

  function updateReadouts() {
    const [x, y] = sim.s;
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const pr0 = M.predictions(P, S.gamma);
    const Hs = M.hatHess(pr0.r0, 0, P);
    out.set(
      `\\begin{gathered}\\phi_{\\text{ball}}=${texNum(r, 2)}\\,e^{i\\,(${texNum((a * 180) / PI, 0)}^\\circ)},\\quad E-E_0=${texNum(M.hatEnergy(sim.s, P), 3)}` +
        `\\\\ \\langle\\phi\\rangle=${P.h > 0 ? texNum(pr0.r0, 3) : 'v\\,e^{i\\alpha},\\ \\alpha\\text{ arbitrary}'}` +
        `\\\\ m_\\rho^2=${texNum(Hs[0][0], 3)},\\quad m_\\pi^2=${texNum(Hs[1][1], 3)}${P.h > 0 ? '' : '\\ \\text{(flat)}'}\\end{gathered}`,
    );
    const noisy = S.T > 0;
    const wr = meterR.omega(sim.t);
    kv.set('Higgs $\\omega_\\rho$ measured', noisy ? '— (noise on)' : Number.isFinite(wr) ? fmt(wr, 3) : '— (no swing)');
    kv.set('predicted $\\sqrt{m_\\rho^2-\\gamma^2/4}$', fmt(pr0.wr, 3));
    let wtTxt;
    if (noisy) wtTxt = '— (noise on)';
    else if (P.h > 0) {
      const wt = meterT.omega(sim.t);
      wtTxt = Number.isFinite(wt) ? fmt(wt, 3) : '— (no swing)';
    } else {
      const vt = r > 0.3 ? (x * sim.s[3] - y * sim.s[2]) / (r * r) : 0;
      wtTxt = Math.abs(vt) > 0.01 ? `free roll, $\\dot\\theta=${texNum(vt, 2)}$` : '0 · no restoring force';
    }
    kv.set('Goldstone $\\omega_\\pi$ measured', wtTxt);
    kv.set('predicted $\\sqrt{m_\\pi^2-\\gamma^2/4}$', P.h > 0 ? fmt(pr0.wt, 3) : '0 (massless)');
  }

  rebuildHat();
  updateRanges(10);
  updateBall();
  updateReadouts();
}
