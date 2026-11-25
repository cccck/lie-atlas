// U(1) — phases & charge (route #/u1).
// View 1: the exponential map wraps the Lie algebra iR (tangent line at 1) around the circle U(1);
//         kernel 2πZ, ghost generators θ ± 2π, partial sums of the exponential series.
// View 2: a charge-q state ψ(φ) = e^{iqφ} on a ring as a ribbon of phasors; non-integer q leaves a seam.
// Maths lives in ./u1/math.js (tested by tests/u1.test.mjs).

import * as ui from '../core/ui.js';
import { plot2d } from '../core/plot2d.js';
import { scene3d } from '../core/three-kit.js';
import { fmt, texNum, texMatrix, texComplex } from '../core/format.js';
import * as M from './u1/math.js';

const { TAU } = M;
const PI = Math.PI;
const TH_MAX = 4 * PI;
const ALPHA_MAX = 4 * PI;

export default function mount(root, ctx) {
  const S = ctx.state;
  S.theta ??= 2.5;
  S.s ??= 0;
  S.wrapPlaying ??= true;
  S.ghosts ??= false;
  S.series ??= false;
  S.N ??= 6;
  S.q ??= 2;
  S.intOnly ??= true;
  S.alpha ??= 0;
  S.alphaPlaying ??= true;

  ui.css(
    ctx.scope,
    `.m-u1{--u1-h:min(64vh,560px);--u1-strip:124px}
     .m-u1 .u1-split3d{position:absolute;left:0;right:0;top:0;bottom:var(--u1-strip)}
     .m-u1 .u1-strip{position:absolute;left:0;right:0;bottom:0;height:var(--u1-strip);border-top:1px solid var(--border)}
     .m-u1 .u1-strip-cap{position:absolute;left:10px;top:5px;z-index:3;font-size:11.5px;color:var(--muted);pointer-events:none;white-space:nowrap}
     .m-u1 .u1-badge{font-size:12px;max-width:260px;white-space:normal;line-height:1.35}
     .m-u1 .u1-reframe{position:absolute;right:8px;top:8px;z-index:4}
     .m-u1 .u1-law{font-size:12.5px;color:var(--ink-2);margin:6px 0 2px}
     @media (max-width: 820px){.m-u1{--u1-h:500px;--u1-strip:112px}}`,
  );

  const pg = ctx.page({
    lede:
      'A $U(1)$ symmetry multiplies a state by a phase, and the rate at which that phase turns is the <b>charge</b>. ' +
      'The exponential map wraps the line of generators $\\alg{i\\R}$ around the circle of phases $\\grp{U(1)}$; ' +
      'because $e^{2\\pi i}=1$, a single-valued state can only turn an <b>integer</b> number of times: charge quantisation is compactness.',
    columns: 2,
  });

  // =====================================================================================
  // View 1 — Lie algebra → group
  // =====================================================================================
  const v1 = pg.view({
    title: 'Lie algebra $\\alg{i\\R}$ → group $\\grp{U(1)}$',
    hint: 'drag $\\alg{i\\theta}$ · scroll to zoom · double-click to re-frame',
    height: 'var(--u1-h)',
  });

  let frame = null; // current {x:[..], y:[..]} of the auto-framing camera
  let autoFrame = true;
  let dragging = false;
  let settingView = false;

  const p = plot2d(v1.body, ctx.scope, {
    x: [-1.6, 1.8],
    y: [-1.6, 2.9],
    draw: drawAlgebra,
  });

  const reframeBtn = ui.button(null, {
    label: 'Re-frame',
    small: true,
    onClick: () => {
      autoFrame = true;
      reframeBtn.style.display = 'none';
    },
  });
  reframeBtn.classList.add('u1-reframe');
  reframeBtn.style.display = 'none';
  v1.el.appendChild(reframeBtn);
  p.on('view', () => {
    if (settingView) return;
    autoFrame = false;
    reframeBtn.style.display = '';
  });
  ctx.scope.listen(p.canvas, 'dblclick', () => {
    autoFrame = true;
    reframeBtn.style.display = 'none';
  });

  const handleMain = p.handle({
    get: () => [1, S.theta],
    set: ([, y]) => setTheta(y),
    constrain: ([, y]) => [1, Math.max(-TH_MAX, Math.min(TH_MAX, y))],
    color: 'alg',
    r: 7,
    label: '\\alg{i\\theta}',
    labelOffset: [21, 0],
    onStart: () => (dragging = true),
    onEnd: () => (dragging = false),
  });
  void handleMain;
  for (const sgn of [1, -1]) {
    p.handle({
      get: () => [1, S.theta + sgn * TAU],
      set: ([, y]) => setTheta(y - sgn * TAU),
      constrain: ([, y]) => [1, y],
      visible: () => S.ghosts,
      color: 'alg',
      shape: 'ring',
      r: 6,
      label: sgn > 0 ? '\\alg{i(\\theta+2\\pi)}' : '\\alg{i(\\theta-2\\pi)}',
      labelOffset: [44, 0],
      labelColor: 'muted',
      onStart: () => (dragging = true),
      onEnd: () => (dragging = false),
    });
  }

  function drawAlgebra(p) {
    const vw = p.view;
    const px = 1 / p.scale; // one pixel in world units
    const th = S.theta;
    const s = S.s;

    // the Lie algebra: tangent line Re z = 1 at the identity
    p.line(
      [
        [1, vw.y[0] - 1],
        [1, vw.y[1] + 1],
      ],
      { color: 'alg', width: 1.25, alpha: 0.5 },
    );
    // name the line at the end away from the handle (the ghost handles take both ends)
    if (!S.ghosts) {
      if (th >= 0) p.tex('\\alg{i\\R=\\uu(1)}', [1, vw.y[0]], { key: 'lineLab', offset: [-8, -40], align: 'right', small: true });
      else p.tex('\\alg{i\\R=\\uu(1)}', [1, vw.y[1]], { key: 'lineLab', offset: [-8, 56], align: 'right', small: true });
    }
    // axis labels (placed by hand so they never sit under the title chip)
    p.tex('\\mathrm{Re}\\,z', [vw.x[1], 0], { key: 'axRe', offset: [-6, 11], align: 'right', small: true, color: 'muted' });
    p.tex('\\mathrm{Im}\\,z', [0, vw.y[1]], { key: 'axIm', offset: [-6, 54], align: 'right', small: true, color: 'muted' });

    // the group: unit circle; its label goes where neither e^{iθ} nor the identity is
    p.circle([0, 0], 1, { color: 'grp', width: 2.25 });
    const angDist = (a, b) => Math.abs(M.wrapPi(a - b));
    const cands = [th + PI, th + PI + 0.8, th + PI - 0.8, th + PI / 2, th - PI / 2];
    const la = cands.find((a) => angDist(a, 0) > 0.9 && angDist(a, th) > 1.2) ?? PI * 0.75;
    const lp = [Math.cos(la), Math.sin(la)];
    p.tex('\\grp{U(1)}', lp, { key: 'circLab', offset: [lp[0] * 28, -lp[1] * 22] });

    // kernel ticks 2πk on the line (static lattice in the algebra)
    const k0 = Math.ceil((vw.y[0] - 0.1) / TAU);
    const k1 = Math.floor((vw.y[1] + 0.1) / TAU);
    for (let k = k0; k <= k1 && k1 - k0 < 60; k++) {
      const y = k * TAU;
      p.segment([1 - 7 * px, y], [1 + 7 * px, y], { color: 'hi', width: 2 });
      if (k !== 0) p.tex(k === 1 ? '2\\pi' : k === -1 ? '-2\\pi' : `${2 * k}\\pi`, [1, y], { key: 'kt' + k, offset: [-12, 0], align: 'right', small: true, color: 'hi' });
    }

    // ghost generators θ ± 2π and their wrapped images
    if (S.ghosts) {
      for (const g of [th + TAU, th - TAU]) {
        p.line(M.wrapCurve(s, g, 260), { color: 'alg', width: 1.6, dash: [5, 5], alpha: 0.55 });
        p.circle(M.wrapPoint(s, g), 6 * px, { color: 'alg', width: 1.8, alpha: 0.8 });
      }
    }

    // reference: the straight algebra segment (faint once it starts to bend)
    if (s > 0.002) p.segment([1, 0], [1, th], { color: 'alg', width: 1.5, alpha: 0.28, dash: [3, 4] });

    // the wrapping curve: segment of length |θ| bent with curvature s
    const curve = M.wrapCurve(s, th, Math.max(40, Math.min(400, Math.ceil(Math.abs(th) * 30))));
    p.line(curve, { color: 'alg', width: 3.2 });

    // ruler ticks every π/2 of arc length; the 2πk ticks (kernel) in the highlight colour
    const nTick = Math.floor(Math.abs(th) / (PI / 2) + 1e-9);
    for (let j = 1; j <= nTick; j++) {
      const u = Math.sign(th) * j * (PI / 2);
      const c = M.wrapPoint(s, u);
      const t = M.wrapTangent(s, u);
      const nrm = [t[1], -t[0]];
      const isK = j % 4 === 0;
      const L = (isK ? 9 : 5) * px;
      p.segment([c[0] - nrm[0] * L, c[1] - nrm[1] * L], [c[0] + nrm[0] * L, c[1] + nrm[1] * L], {
        color: isK ? 'hi' : 'alg',
        width: isK ? 2.5 : 1.5,
      });
    }

    // identity
    p.dot([1, 0], { r: 3.5, color: 'ink' });
    p.tex('\\id', [1, 0], { key: 'idLab', offset: [12, 12], small: true });

    // exponential series partial sums: a chain of arrows, each term turned by 90°
    if (S.series) {
      const pts = M.seriesPartialSums(th, S.N);
      const pad = 40 * px;
      const bx = [vw.x[0] - pad, vw.x[1] + pad];
      const by = [vw.y[0] - pad, vw.y[1] + pad];
      for (let n = 1; n < pts.length; n++) {
        const a = pts[n - 1];
        const b = pts[n];
        const clipped = M.clipSegment(a, b, bx, by);
        if (!clipped) continue;
        const inside = clipped[1][0] === b[0] && clipped[1][1] === b[1];
        if (inside) p.arrow(clipped[0], clipped[1], { color: 'c3', width: 1.8, head: 8 });
        else p.segment(clipped[0], clipped[1], { color: 'c3', width: 1.8 });
      }
      for (let n = 1; n < pts.length - 1; n++) p.dot(pts[n], { r: 2.2, color: 'c3', alpha: 0.8 });
      const last = pts[pts.length - 1];
      p.dot(last, { r: 4.5, color: 'c3' });
      p.tex(`S_{${S.N}}`, last, { key: 'sN', offset: [14, 12], small: true, color: 'c3' });
    }

    // wrapped endpoint and the group element e^{iθ}
    const g = M.cis(th);
    if (s < 0.999) p.dot(M.wrapPoint(s, th), { r: 4.5, color: 'alg' });
    p.dot(g, { r: 6.5, color: 'grp', stroke: 'surface', width: 2 });
    // label outside the circle, except near the identity where the algebra handle lives
    const inward = Math.abs(M.wrapPi(th)) < 1.0;
    const sgnL = inward ? -1 : 1;
    p.tex('\\grp{e^{i\\theta}}', g, { key: 'gLab', offset: [sgnL * g[0] * 30, -sgnL * g[1] * 22] });
  }

  // ---------- auto-framing (smoothly zooms out when θ, ghosts or the series need more room)
  let cacheKey = '';
  let cacheBox = null;
  function targetFrame() {
    const key = `${S.theta.toFixed(4)}|${S.ghosts}|${S.series ? S.N : -1}`;
    if (key !== cacheKey) {
      cacheKey = key;
      const pts = [
        [-1.2, -1.2],
        [1.25, 1.2],
        [1, S.theta],
      ];
      const thetas = [S.theta];
      if (S.ghosts) thetas.push(S.theta + TAU, S.theta - TAU);
      for (const th of thetas) {
        pts.push([1, th]);
        for (let i = 0; i <= 10; i++) pts.push(...M.wrapCurve(i / 10, th, 48));
      }
      if (S.series) for (const q of M.seriesPartialSums(S.theta, S.N)) if (Math.hypot(q[0], q[1]) < 7) pts.push(q);
      const [bx, by] = M.bbox(pts);
      const padX = 0.05 * (bx[1] - bx[0]) + 0.12;
      const padY = 0.06 * (by[1] - by[0]) + 0.3;
      cacheBox = { x: [bx[0] - padX, bx[1] + padX + 0.3], y: [by[0] - padY, by[1] + padY] };
    }
    return cacheBox;
  }
  ctx.scope.frame((dt) => {
    if (!autoFrame || dragging) return;
    const T = targetFrame();
    if (!frame) frame = { x: T.x.slice(), y: T.y.slice() };
    const k = 1 - Math.exp(-dt / 0.22);
    let moved = 0;
    for (const ax of ['x', 'y'])
      for (let i = 0; i < 2; i++) {
        const d = T[ax][i] - frame[ax][i];
        frame[ax][i] += Math.abs(d) < 1e-4 ? d : d * k;
        moved = Math.max(moved, Math.abs(d));
      }
    if (moved > 0 || !frame.applied) {
      settingView = true;
      p.setView(frame);
      settingView = false;
      frame.applied = true;
    }
  });

  // =====================================================================================
  // View 2 — charge q on a ring (3D) + phase-winding strip (2D)
  // =====================================================================================
  const v2 = pg.view({
    title: 'Charge $q$: a phase on a ring',
    height: 'var(--u1-h)',
  });
  const div3 = ui.h('div', { class: 'u1-split3d' });
  const divStrip = ui.h('div', { class: 'u1-strip' });
  v2.body.append(div3, divStrip);
  const badgeBox = v2.overlay('tl', 'u1-badge-box');
  const seamBadge = ui.badge(badgeBox, '', 'good');
  seamBadge.classList.add('u1-badge');

  const R = 1.3; // ring radius
  const A = 0.55; // phasor length
  const NPH = 40;
  const k3 = scene3d(div3, ctx.scope, { camera: [4.1, -3.9, 4.0], target: [0, 0, -0.05], minDistance: 3, maxDistance: 16 });
  div3.appendChild(ui.h('div', { class: 'view-hint', html: 'drag to orbit · phasor: $\\mathrm{Re}\\,\\psi$ up, $\\mathrm{Im}\\,\\psi$ outward' }));

  const ringPt = (phi) => [R * Math.cos(phi), R * Math.sin(phi), 0];
  // phasor direction for phase a at ring angle phi: Re -> e_z, Im -> e_r (right-handed about e_phi)
  const phasorDir = (phi, a) => [Math.sin(a) * Math.cos(phi), Math.sin(a) * Math.sin(phi), Math.cos(a)];

  k3.circle([0, 0, 0], [0, 0, 1], R, { color: 'ink2', width: 2, segments: 160 });

  const ribbon = k3.surface((u, v) => ribbonPoint(u, v), [0, TAU], [0, 1], 240, 1, { color: 'grp', opacity: 0.2 });
  const tipLine = k3.line([], { color: 'grp', width: 2.6 });
  const phasors = [];
  for (let i = 0; i < NPH; i++) {
    const phi = (TAU * i) / NPH;
    phasors.push({ phi, arrow: k3.arrow(ringPt(phi), ringPt(phi), { color: 'grp', radius: 0.011, headLength: 0.085, headRadius: 0.034 }) });
  }
  const endArrow = k3.arrow([R, 0, 0], [R, 0, A], { color: 'hi', radius: 0.014, headLength: 0.09, headRadius: 0.04 });
  const seamArc = k3.line([], { color: 'hi', width: 2.5 });
  const seamDot = k3.sphere({ radius: 0.05, color: 'hi', position: [R, 0, 0] });
  const seamLabel = k3.label('\\varphi=0\\equiv2\\pi', [R + 0.25, -0.25, -0.18], { small: true, color: 'hi' });
  // generator of rotations: the vector field ∂_φ, drawn as a circulating arc inside the ring
  {
    const Rg = 0.62 * R;
    const a0 = -PI / 2 - 0.75;
    const a1 = -PI / 2 + 0.75;
    const arc = [];
    for (let i = 0; i <= 48; i++) {
      const a = a0 + ((a1 - 0.12 - a0) * i) / 48;
      arc.push([Rg * Math.cos(a), Rg * Math.sin(a), 0]);
    }
    k3.line(arc, { color: 'alg', width: 2.5 });
    const e0 = [Rg * Math.cos(a1 - 0.16), Rg * Math.sin(a1 - 0.16), 0];
    const e1 = [Rg * Math.cos(a1), Rg * Math.sin(a1), 0];
    k3.arrow(e0, e1, { color: 'alg', radius: 0.012, headLength: 0.13, headRadius: 0.05 });
    k3.label('\\alg{\\partial_\\varphi}', [(Rg - 0.3) * Math.cos(-PI / 2), (Rg - 0.3) * Math.sin(-PI / 2), 0], { small: true, color: 'alg' });
  }

  function ribbonPoint(u, v) {
    const a = M.ringPhase(S.q, u, S.alpha);
    const c = ringPt(u);
    const d = phasorDir(u, a);
    return [c[0] + v * A * d[0], c[1] + v * A * d[1], c[2] + v * A * d[2]];
  }

  function update3d() {
    const q = S.q;
    for (const ph of phasors) {
      const c = ringPt(ph.phi);
      const d = phasorDir(ph.phi, M.ringPhase(q, ph.phi, S.alpha));
      ph.arrow.set(c, [c[0] + A * d[0], c[1] + A * d[1], c[2] + A * d[2]]);
    }
    ribbon.update();
    const tips = [];
    for (let i = 0; i <= 240; i++) tips.push(ribbonPoint((TAU * i) / 240, 1));
    tipLine.setPoints(tips);
    const sm = M.seam(q, 1e-6);
    const bad = !sm.singleValued;
    endArrow.visible = bad;
    seamArc.visible = bad;
    seamDot.material.color.copy(k3.color(bad ? 'hi' : 'ink2'));
    seamLabel.setVisible(true);
    if (bad) {
      const a0 = M.ringPhase(q, 0, S.alpha);
      const a1 = M.ringPhase(q, TAU, S.alpha);
      const c = ringPt(0);
      const d1 = phasorDir(0, a1);
      endArrow.set(c, [c[0] + A * d1[0], c[1] + A * d1[1], c[2] + A * d1[2]]);
      const arc = [];
      const span = sm.mismatch; // shortest rotation from ψ(0) to ψ(2π⁻)
      for (let i = 0; i <= 40; i++) {
        const d = phasorDir(0, a0 + (span * i) / 40);
        arc.push([c[0] + 0.72 * A * d[0], c[1] + 0.72 * A * d[1], c[2] + 0.72 * A * d[2]]);
      }
      seamArc.setPoints(arc);
      seamBadge.set(`not single-valued: $\\psi(2\\pi)=e^{2\\pi i q}\\psi(0)$, mismatch ${fmt((sm.mismatch * 180) / PI, 0)}°`, 'warn');
    } else {
      seamBadge.set(`single-valued: $q=${sm.nearest}\\in\\Z$`, 'good');
    }
  }

  // phase-winding strip: arg ψ(φ) − arg ψ(0) = qφ, lifted to the algebra R; kernel lines 2πZ
  const cap = ui.h('div', { class: 'u1-strip-cap', html: 'phase lifted to $\\alg{\\R}$: $\\arg\\psi(\\varphi)-\\arg\\psi(0)=q\\varphi$' });
  divStrip.appendChild(cap);
  const strip = plot2d(divStrip, ctx.scope, {
    x: [-1.0, TAU + 2.0],
    y: [-2, 2],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: drawStrip,
  });
  // y-range chosen so the data band sits between a caption (top) and the φ labels (bottom)
  function stripRange() {
    // band: from 0 to qφ|_{2π}, widened to the kernel lines on either side of 2πq
    const a = Math.min(0, TAU * Math.floor(S.q));
    const b = Math.max(0, TAU * Math.ceil(S.q));
    const H = Math.max(60, divStrip.clientHeight || 120);
    const top = 30;
    const bot = 24;
    const u = Math.max(b - a, 1.5) / Math.max(20, H - top - bot);
    return [a - bot * u, b + top * u];
  }
  function drawStrip(sp) {
    const q = S.q;
    const vw = sp.view;
    // kernel lines only across the data band (the margins hold the caption and the φ labels)
    const k0 = Math.min(0, Math.floor(q));
    const k1 = Math.max(0, Math.ceil(q));
    for (let k = k0; k <= k1; k++) {
      sp.segment([0, k * TAU], [TAU, k * TAU], { color: 'hi', width: 1, alpha: 0.55, dash: [4, 4] });
      sp.tex(k === 0 ? '0' : k === 1 ? '2\\pi' : k === -1 ? '-2\\pi' : `${2 * k}\\pi`, [0, k * TAU], { key: 'sk' + k, offset: [-7, 0], align: 'right', small: true, color: 'hi' });
    }
    // φ = 0 and φ = 2π are the same point of the ring
    sp.segment([0, vw.y[0]], [0, vw.y[1]], { color: 'axis', width: 1 });
    sp.segment([TAU, vw.y[0]], [TAU, vw.y[1]], { color: 'axis', width: 1 });
    sp.tex('\\varphi=0', [0, vw.y[0]], { key: 'x0', offset: [4, -10], align: 'left', small: true, color: 'muted' });
    sp.tex('\\varphi=2\\pi', [TAU, vw.y[0]], { key: 'x2pi', offset: [-4, -10], align: 'right', small: true, color: 'muted' });
    const end = [TAU, TAU * q];
    sp.line(
      [
        [0, 0],
        end,
      ],
      { color: 'grp', width: 2.6 },
    );
    sp.dot([0, 0], { r: 3.5, color: 'grp' });
    const sm = M.seam(q, 1e-6);
    if (!sm.singleValued) {
      const target = [TAU, TAU * sm.nearest];
      sp.segment(end, target, { color: 'hi', width: 2.5 });
      sp.dot(end, { r: 4.5, color: 'hi' });
      sp.tex('e^{2\\pi i q}\\neq1', [TAU, (end[1] + target[1]) / 2], { key: 'mm', offset: [10, 0], align: 'left', small: true, color: 'hi' });
    } else {
      sp.dot(end, { r: 4.5, color: 'grp', stroke: 'hi', width: 2 });
      sp.tex(`\\text{winds } ${sm.nearest}\\times`, end, { key: 'mm', offset: [10, 0], align: 'left', small: true });
    }
  }
  let lastStripKey = null;
  function updateStrip() {
    const key = `${S.q}|${divStrip.clientHeight}`;
    if (lastStripKey !== key) {
      lastStripKey = key;
      strip.setView({ x: [-1.0, TAU + 2.0], y: stripRange() });
    }
    strip.invalidate();
  }
  ctx.scope.observeResize(divStrip, () => updateStrip());

  // =====================================================================================
  // Panel
  // =====================================================================================
  const secE = pg.section('Exponential map');
  const sTheta = ui.slider(secE, {
    label: 'Generator $\\alg{i\\theta}$, angle $\\theta$',
    min: -12.57, // step grid anchored at a multiple of the step; θ itself is clamped to ±4π
    max: 12.57,
    step: 0.01,
    value: S.theta,
    format: (v) => `${fmt(v, 2)} = ${fmt(v / PI, 2)}π`,
    onInput: (v) => setTheta(v, true),
  });
  const sWrap = ui.slider(secE, {
    label: 'Wrap $s$ (curvature of the bent line)',
    min: 0,
    max: 1,
    step: 0.005,
    value: S.s,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      S.s = v;
      wrapPlay.set(false);
      p.invalidate();
    },
  });
  const rowWrap = ui.h('div', { class: 'btn-row' });
  secE.appendChild(rowWrap);
  let wrapClock = S.s > 0 ? timelineTimeFor(S.s) : 1.1; // on first load start bending right away
  const wrapPlay = ui.playButton(rowWrap, {
    playing: S.wrapPlaying,
    labels: ['▶ Play wrap', '❚❚ Pause wrap'],
    onToggle: (on) => {
      S.wrapPlaying = on;
      if (on) wrapClock = timelineTimeFor(S.s);
    },
  });
  ui.button(rowWrap, { label: '$\\theta\\to\\theta+2\\pi$', small: false, onClick: () => setTheta(S.theta + TAU <= TH_MAX + 1e-9 ? S.theta + TAU : S.theta - TAU) });
  ui.button(rowWrap, {
    label: 'Reset',
    onClick: () => {
      setTheta(2.5);
      S.s = 0;
      sWrap.set(0, { silent: true });
      wrapClock = 0;
      wrapPlay.set(true);
      tGhost.set(false);
      tSeries.set(false);
      autoFrame = true;
      reframeBtn.style.display = 'none';
    },
  });
  const tGhost = ui.toggle(secE, {
    label: 'Ghost generators $\\alg{i(\\theta\\pm2\\pi)}$',
    value: S.ghosts,
    onChange: (v) => {
      S.ghosts = v;
      p.invalidate();
    },
  });
  const tSeries = ui.toggle(secE, {
    label: 'Exponential series $\\sum_{n\\le N}(i\\theta)^n/n!$',
    value: S.series,
    onChange: (v) => {
      S.series = v;
      update();
    },
  });
  const sN = ui.slider(secE, {
    label: 'Terms $N$',
    min: 0,
    max: 25,
    step: 1,
    value: S.N,
    format: (v) => String(v),
    onInput: (v) => {
      S.N = Math.round(v);
      nAnim = null;
      if (!S.series) tSeries.set(true);
      update();
    },
  });
  const outE = ui.readout(secE, {
    label: 'Group element, and its real form with $\\alg{J}=\\left(\\begin{smallmatrix}0&-1\\\\1&0\\end{smallmatrix}\\right)\\leftrightarrow i$',
  });
  const kvE = ui.keyValue(secE, [
    ['$\\theta \\bmod 2\\pi\\in(-\\pi,\\pi]$', ''],
    ['winding $k$ in $\\theta=\\theta_0+2\\pi k$', ''],
    ['series error $|e^{i\\theta}-S_N|$', ''],
  ]);
  secE.appendChild(
    ui.h('div', {
      class: 'u1-law',
      html: 'Group law $\\grp{e^{ia}e^{ib}=e^{i(a+b)}}$: abelian, so the bracket vanishes, $\\brk{[\\alg{X},\\alg{Y}]=0}$, and $\\exp$ is a homomorphism $(\\R,+)\\to U(1)$.',
    }),
  );

  const secQ = pg.section('Charge on a ring');
  const sQ = ui.slider(secQ, {
    label: 'Charge $q$ (eigenvalue of $L=-i\\partial_\\varphi$)',
    min: -3,
    max: 3,
    step: S.intOnly ? 1 : 0.05,
    value: S.q,
    format: (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? fmt(v, 0) : fmt(v, 2)),
    onInput: (v) => setQ(v),
  });
  const tInt = ui.toggle(secQ, {
    label: 'Integers only',
    value: S.intOnly,
    onChange: (v) => {
      S.intOnly = v;
      sQ.setRange(-3, 3, v ? 1 : 0.05);
      setQ(v ? Math.round(S.q) : S.q);
    },
  });
  const sAlpha = ui.slider(secQ, {
    label: 'Symmetry $\\grp{U(\\alpha)}=e^{-i\\alpha L}$, angle $\\alpha$',
    min: 0,
    max: ALPHA_MAX,
    step: 0.01,
    value: S.alpha,
    format: (v) => `${fmt(v / PI, 2)}π`,
    onInput: (v) => {
      S.alpha = v;
      alphaPlay.set(false);
      update();
    },
  });
  const rowA = ui.h('div', { class: 'btn-row' });
  secQ.appendChild(rowA);
  const alphaPlay = ui.playButton(rowA, {
    playing: S.alphaPlaying,
    labels: ['▶ Rotate', '❚❚ Pause'],
    onToggle: (on) => (S.alphaPlaying = on),
  });
  ui.button(rowA, {
    label: '$\\alpha=2\\pi$',
    onClick: () => {
      alphaPlay.set(false);
      setAlpha(TAU);
    },
  });
  ui.button(rowA, {
    label: '$\\alpha=0$',
    onClick: () => {
      alphaPlay.set(false);
      setAlpha(0);
    },
  });
  const outQ = ui.readout(secQ, { label: 'Generator, symmetry and boundary condition' });
  const kvQ = ui.keyValue(secQ, [
    ['phase picked up, $-q\\alpha$', ''],
    ['energy $E_q=q^2/2I$ (units $1/I$)', ''],
    ['density $|\\psi|^2$', 'uniform, $1/2\\pi$'],
  ]);

  const secL = pg.section('Legend');
  ui.legend(secL, [
    { color: 'alg', label: 'algebra $\\uu(1)=i\\R$, generator' },
    { color: 'grp', label: 'group $U(1)$, phases' },
    { color: 'hi', label: 'kernel $2\\pi\\Z$, seam' },
    { color: 'c3', label: 'series terms $(i\\theta)^n/n!$' },
  ]);

  // ---------------------------------------------------------------- experiments
  let nAnim = null; // {t, target} animates N upward
  ui.experiments(pg.section('Try this'), [
    {
      title: 'Wrap the line once',
      text: 'A segment of length $2\\pi$ bends round the circle exactly once and its end lands on the identity: $e^{2\\pi i}=1$. The kernel tick at $2\\pi$ is glued to $\\id$ — this gluing is what makes $U(1)$ compact.',
      apply: () => {
        resetScene();
        setTheta(TAU);
        S.s = 0;
        sWrap.set(0, { silent: true });
        wrapClock = 0;
        wrapPlay.set(true);
      },
    },
    {
      title: 'Many generators, one element',
      text: 'The ghost generators $\\theta\\pm2\\pi$ (dashed) wrap one turn more or less and land on the same $\\grp{e^{i\\theta}}$: $\\exp$ is onto but not one-to-one, $\\ker\\exp=2\\pi\\Z$. An angle is only defined mod $2\\pi$ — something the algebra of infinitesimal rotations cannot see.',
      apply: () => {
        resetScene();
        setTheta(1.2);
        tGhost.set(true);
        S.s = 0;
        sWrap.set(0, { silent: true });
        wrapClock = 0;
        wrapPlay.set(true);
        update();
      },
    },
    {
      title: 'Build $e^{i\\pi}$ from its series',
      text: 'Each term $(i\\theta)^n/n!$ is the previous one turned by $90^\\circ$ and scaled by $\\theta/n$, so the partial sums spiral into $-1$ (Euler). The error drops factorially once $n>|\\theta|$; try $\\theta=4\\pi$, where the terms first grow to $\\sim10^4$.',
      apply: () => {
        resetScene();
        setTheta(PI);
        wrapPlay.set(false);
        S.s = 1;
        sWrap.set(1, { silent: true });
        tSeries.set(true);
        S.N = 0;
        sN.set(0, { silent: true });
        nAnim = { t: 0, target: 18 };
        update();
      },
    },
    {
      title: 'Can charge be ½?',
      text: 'With $q=\\tfrac12$ the phasors make only half a turn round the ring: $\\psi(2\\pi)=-\\psi(0)$ (the ribbon could only close as a Möbius band), so $\\psi$ is not a function on the ring. Press $\\alpha=2\\pi$: a full rotation multiplies it by $-1$. Such states live only on the double cover — spin ½ of <a href="#/su2">SU(2)</a> — or with a magnetic flux through the ring.',
      apply: () => {
        tInt.set(false);
        setQ(0.5);
        alphaPlay.set(false);
        setAlpha(0.6);
      },
    },
    {
      title: 'Global phase is invisible',
      text: '$U(\\alpha)$ turns every phasor by the same $-q\\alpha$ (twice as fast for $q=2$; not at all for $q=0$). The density $|\\psi|^2$, $\\langle L\\rangle=q$, the energy and the phase winding in the strip are unchanged: only phase <i>differences</i> are observable, through interference.',
      apply: () => {
        tInt.set(true);
        setQ(2);
        alphaPlay.set(true);
      },
    },
    {
      title: 'A non-compact cousin: momentum',
      text: 'Unwrapped ($s=0$), the line is itself a group: translations $(\\R,+)$, with trivial kernel. Its irreps $e^{ikx}$ allow <b>any</b> real $k$ — momentum is continuous. Rolling the line into a ring of radius $\\rho$ demands $k\\rho\\in\\Z$: angular momentum is quantised, with spacing $1/\\rho\\to0$ as $\\rho\\to\\infty$. Here $q=1.35$ shows what goes wrong on the ring.',
      apply: () => {
        resetScene();
        setTheta(2.5);
        wrapPlay.set(false);
        S.s = 0;
        sWrap.set(0, { silent: true });
        tInt.set(false);
        setQ(1.35);
        update();
      },
    },
  ]);

  function resetScene() {
    tGhost.set(false);
    tSeries.set(false);
    nAnim = null;
    autoFrame = true;
    reframeBtn.style.display = 'none';
  }

  // =====================================================================================
  // Notes
  // =====================================================================================
  pg.note(`<h2>What you see</h2>
    <p><b>Left.</b> The circle is the group $\\grp{U(1)}=\\{e^{i\\theta}\\}$ of phases. Its tangent line at the identity
    $1$ is the Lie algebra $\\alg{\\uu(1)=i\\R}$: the orange handle is the generator $\\alg{i\\theta}$. The wrap control
    bends the segment from $1$ to $1+i\\theta$ into an arc of curvature $s$ that stays tangent to the circle and keeps its
    length $|\\theta|$:</p>
    $$p_s(u)=\\bigl(1-r+r\\cos\\tfrac ur,\\; r\\sin\\tfrac ur\\bigr),\\qquad r=1/s,\\quad u\\in[0,\\theta].$$
    <p>At $s=1$ the arc lies on the circle and ends on $\\grp{e^{i\\theta}}$: the exponential map literally wraps the line
    round the circle, measuring the angle as arc length. The ticks every $\\pi/2$ of arc land on $i,-1,-i,1$; the amber
    ticks at $2\\pi k$ (the kernel) all land on $\\id$.</p>
    <p><b>Right.</b> A state $\\psi(\\varphi)=e^{iq\\varphi}$ of a particle on a ring, drawn as one phasor per point (real part
    up, imaginary part outward). The ribbon twists $q$ times. The strip below lifts the phase to $\\R$ — the same line as
    the algebra on the left — where single-valuedness means ending on a kernel line $2\\pi\\Z$.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>A generator is a velocity, a group element
    is a position on the circle. Many velocities (all $\\theta+2\\pi k$) reach the same position in unit time, and that
    ambiguity — compactness — is the whole origin of integer charges.</div>`);

  pg.note(`<h2>The physics</h2>
    <p><b>Phase symmetry and Noether.</b> Quantum states are rays: $\\psi$ and $e^{i\\chi}\\psi$ describe the same physics.
    When a Lagrangian is invariant under $\\psi\\to e^{-iq\\alpha}\\psi$ for every field of charge $q$, Noether's theorem gives a
    conserved current and charge,</p>
    $$\\partial_\\mu j^\\mu=0,\\qquad Q=\\int d^3x\\,j^0,\\qquad U(\\alpha)=e^{-i\\alpha Q},\\qquad [Q,H]=0 .$$
    <p>So the <i>generator</i> of the symmetry is the conserved charge, and $U(\\alpha)$ acts on a state of charge $q$ as the
    phase $e^{-iq\\alpha}$ — the rate of phase rotation is the charge.</p>
    <p><b>Quantisation from compactness.</b> For a particle on a ring the rotations form $U(1)$ with generator
    $L=-i\\partial_\\varphi$, and $U(\\alpha)\\psi(\\varphi)=\\psi(\\varphi-\\alpha)$. Since $U(2\\pi)=\\id$, eigenvalues satisfy
    $e^{-2\\pi i q}=1$, i.e. $q\\in\\Z$: the $L_z$ eigenvalues $m\\hbar$ and the rotor spectrum $E_m=m^2/2I$. Whenever the
    symmetry group is compact, the charges are quantised.</p>
    <div class="callout physics"><span class="callout-title">Gauge symmetry</span>Make $\\alpha=\\alpha(x)$ local and the
    derivative must become $D_\\mu=\\partial_\\mu+iqA_\\mu$: the $U(1)$ gauge field is the electromagnetic potential. A flux
    $\\Phi$ through the ring twists the boundary condition to $\\psi(2\\pi)=e^{iq\\Phi}\\psi(0)$ — exactly the seam you see
    for non-integer $q$, and the origin of the Aharonov–Bohm effect (<a href="#/heisenberg">Heisenberg group</a>).
    Half-integer "charges" under rotations are spinors: they live on the double cover <a href="#/su2">SU(2)</a>.</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>$\\uu(1)=i\\R$ (anti-Hermitian $1\\times1$ matrices; physicists write the generator as the Hermitian $Q$ with
    $X=-iQ$). The exponential map is a surjective homomorphism with kernel $2\\pi\\Z$:</p>
    $$\\exp:\\ (\\R,+)\\to U(1),\\quad \\theta\\mapsto e^{i\\theta},\\qquad U(1)\\cong\\R/2\\pi\\Z\\cong SO(2),$$
    $$e^{i\\theta}\\leftrightarrow R(\\theta)=e^{\\theta J}=\\begin{pmatrix}\\cos\\theta&-\\sin\\theta\\\\ \\sin\\theta&\\cos\\theta\\end{pmatrix},\\qquad J^2=-\\id .$$
    <p>The irreducible unitary representations of an abelian group are one-dimensional characters. A character of $\\R$ is
    $x\\mapsto e^{ikx}$ for any $k\\in\\R$; it descends to $\\R/2\\pi\\Z$ only if it is trivial on the kernel:</p>
    $$\\chi_q(e^{i\\theta})=e^{iq\\theta},\\qquad \\chi_q(e^{2\\pi i})=e^{2\\pi i q}=1\\iff q\\in\\Z .$$
    <p>The dual group of $U(1)$ is $\\Z$ (Fourier series), that of $\\R$ is $\\R$ (Fourier transform). The integer $q$ is also
    the <b>winding number</b> of the map $U(1)\\to U(1)$, $e^{i\\varphi}\\mapsto\\chi_q(e^{i\\varphi})$ — a topological invariant,
    which is why charge cannot change continuously.</p>`);

  pg.note(`<h2>Going further</h2>
    <ul>
      <li><b>Duality of lattices and zones.</b> A crystal's translations form $\\Z$; its characters are $e^{ikna}$ with
      $k$ in the Brillouin zone — a circle $U(1)$. Compact position space ⇒ discrete momenta; discrete position space ⇒
      compact (periodic) momenta.</li>
      <li><b>Dirac quantisation.</b> A magnetic monopole $g$ forces $qg\\in\\tfrac12\\Z$: if electromagnetism is a compact
      $U(1)$ — as it is when embedded in a grand unified group — charge must be quantised.</li>
      <li><b>Anyons.</b> In two dimensions exchanging two particles can produce any phase $e^{i\\vartheta}$: loops in the
      two-particle configuration space form $\\Z$ (braids) rather than $\\Z_2$, so a "non-integer seam" becomes physical.</li>
      <li><b>Several commuting phases.</b> $U(1)\\times U(1)=T^2$ governs two independent oscillators: see
      <a href="#/torus">tori & oscillators</a>.</li>
    </ul>`);

  // =====================================================================================
  // State changes & animation
  // =====================================================================================
  function setTheta(v, fromSlider = false) {
    if (!Number.isFinite(v)) return;
    S.theta = Math.max(-TH_MAX, Math.min(TH_MAX, v));
    if (!fromSlider) sTheta.set(S.theta, { silent: true });
    update();
  }
  function setQ(v) {
    if (!Number.isFinite(v)) return;
    let q = Math.max(-3, Math.min(3, v));
    q = S.intOnly ? Math.round(q) : Math.round(q * 20) / 20;
    if (Object.is(q, -0)) q = 0;
    S.q = q;
    sQ.set(q, { silent: true });
    update();
  }
  function setAlpha(v) {
    if (!Number.isFinite(v)) return;
    S.alpha = Math.max(0, Math.min(ALPHA_MAX, v));
    sAlpha.set(S.alpha, { silent: true });
    update();
  }
  function timelineTimeFor(s) {
    if (s <= 0) return 0;
    if (s >= 1) return 4;
    let a = 1;
    let b = 4;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (M.wrapTimeline(m) < s) a = m;
      else b = m;
    }
    return (a + b) / 2;
  }

  ctx.scope.frame((dt) => {
    let changed = false;
    if (wrapPlay.playing) {
      wrapClock += dt;
      const s = M.wrapTimeline(wrapClock);
      if (s !== S.s) {
        S.s = s;
        sWrap.set(s, { silent: true });
        changed = true;
      }
    }
    if (nAnim) {
      nAnim.t += dt;
      if (nAnim.t > 0.45) {
        nAnim.t = 0;
        if (S.N < nAnim.target) {
          S.N += 1;
          sN.set(S.N, { silent: true });
          changed = true;
        } else nAnim = null;
      }
    }
    if (changed) update();
    if (alphaPlay.playing) {
      S.alpha = (S.alpha + dt * 0.7) % ALPHA_MAX;
      sAlpha.set(S.alpha, { silent: true });
      update3dAndReadouts();
    }
  });

  function update() {
    p.invalidate();
    const th = S.theta;
    const g = M.cis(th);
    const R2 = M.rot2(th);
    outE.set(
      `\\begin{gathered}\\grp{e^{i\\theta}}=\\cos\\theta+i\\sin\\theta=${texComplex({ re: g[0], im: g[1] }, 3)}` +
        `\\\\ \\grp{R(\\theta)}=e^{\\theta \\alg{J}}=${texMatrix(R2, 3)}\\end{gathered}`,
    );
    const pr = M.principal(th);
    kvE.set('$\\theta \\bmod 2\\pi\\in(-\\pi,\\pi]$', `${fmt(pr.theta0, 3)} = ${fmt(pr.theta0 / PI, 3)}π`);
    kvE.set('winding $k$ in $\\theta=\\theta_0+2\\pi k$', String(pr.k));
    kvE.set('series error $|e^{i\\theta}-S_N|$', S.series ? sciFmt(M.seriesError(th, S.N)) + ` (N = ${S.N})` : '—');
    update3dAndReadouts();
  }

  function update3dAndReadouts() {
    update3d();
    updateStrip();
    const q = S.q;
    const qTex = Number.isInteger(q) ? String(q) : texNum(q, 2);
    const hol = M.seam(q).holonomy;
    outQ.set(
      `\\begin{gathered}\\psi_q(\\varphi)=e^{iq\\varphi},\\quad \\alg{L}\\psi_q=-i\\partial_\\varphi\\psi_q=${qTex}\\,\\psi_q` +
        `\\\\ \\grp{U(\\alpha)}\\psi_q=e^{-i\\alpha \\alg{L}}\\psi_q=e^{-iq\\alpha}\\psi_q` +
        `\\\\ \\psi(2\\pi^-)/\\psi(0)=e^{2\\pi iq}=${texComplex({ re: hol[0], im: hol[1] }, 3)}\\end{gathered}`,
    );
    kvQ.set('phase picked up, $-q\\alpha$', `${fmt((-q * S.alpha) / PI, 2)}π`);
    kvQ.set('energy $E_q=q^2/2I$ (units $1/I$)', fmt(M.ringEnergy(q), 3));
  }

  function sciFmt(x) {
    if (!Number.isFinite(x)) return '—';
    if (x === 0) return '0';
    if (x >= 1e-3 && x < 1e4) return fmt(x, x < 1 ? 4 : 2);
    const e = Math.floor(Math.log10(x));
    return `$${texNum(x / Math.pow(10, e), 2)}\\times10^{${e}}$`;
  }

  update();
  void tInt;
}
