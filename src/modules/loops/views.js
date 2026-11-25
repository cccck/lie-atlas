// The five "worlds" of the Small-loops tab. Each factory builds its visual inside `el` (registered on
// `scope`) and returns { setModel(M), setProgress(s) }. M is built in small.js (see buildModel there).

import { plot2d } from '../../core/plot2d.js';
import { scene3d } from '../../core/three-kit.js';
import { mat, vec, clamp } from '../../core/la.js';
import { fmt, fmtDeg } from '../../core/format.js';
import { withAlpha } from '../../core/theme.js';
import { LEGS, DASH2D, legFrac, drawDial, screenArrow } from './common.js';
import { lorentzDecompose, se2Pose, sphereAt, sphereBasis, rotateAbout, vadd, vscale } from './math.js';

const TWO_PI = 2 * Math.PI;

// ------------------------------------------------------------------ 3D helpers
function revealable(line, pts) {
  line.setPoints(pts);
  line.userData.nSeg = Math.max(0, pts.length - 1);
  return line;
}
function reveal(line, frac) {
  const n = line.userData.nSeg || 0;
  const k = Math.round(clamp(frac, 0, 1) * n);
  line.visible = k > 0;
  if (line.geometry) line.geometry.instanceCount = k;
}
function arcPoints(center, u, w, r, a0, a1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(vadd(center, vadd(vscale(u, r * Math.cos(a)), vscale(w, r * Math.sin(a)))));
  }
  return pts;
}

// ================================================================== 1. rotations, SO(3)
export function rotView(el, scope) {
  const k = scene3d(el, scope, { camera: [3.55, 2.05, 2.95], target: [0, 0, 0.12], minDistance: 2.2, maxDistance: 10 });
  const { THREE } = k;
  k.sphere({ radius: 0.985, color: 'muted', opacity: 0.1 });
  const body = new THREE.Group();
  k.root.add(body);
  k.wireSphere({ radius: 1, opacity: 0.2, lat: 8, lon: 16, parent: body, color: 'muted' });
  const AX = 1.34;
  const axisCols = ['x', 'y', 'z'];
  axisCols.forEach((c, i) => {
    const e = [0, 0, 0];
    e[i] = AX;
    k.arrow([0, 0, 0], e, { color: c, radius: 0.017, headLength: 0.1, headRadius: 0.042, parent: body });
    k.label(c, e.map((v) => v * 1.1), { color: c, parent: body });
    // start frame (fixed in space)
    k.line(
      [
        [0, 0, 0],
        e.map((v) => v * 1.02),
      ],
      { color: c, width: 1.3, opacity: 0.5, dashed: true, dashSize: 0.05, gapSize: 0.04 },
    );
  });
  const zTrail = LEGS.map((L) => k.line([], { color: L.color, width: 3, dashed: L.dash, dashSize: 0.05, gapSize: 0.035 }));
  const xTrail = LEGS.map((L) => k.line([], { color: L.color, width: 3, dashed: L.dash, dashSize: 0.05, gapSize: 0.035 }));
  const twistPred = k.line([], { color: 'brk', width: 4, opacity: 0.85 });
  const twistLbl = k.label('\\brk{\\epsilon^2[X,Y]}', [1.2, 0.2, 0], { color: 'brk' });
  const endDot = k.sphere({ radius: 0.04, color: 'grp' });
  const netAxis = k.arrow([0, 0, 0], [0, 0, 1.6], { color: 'grp', radius: 0.014, headLength: 0.09, headRadius: 0.036 });
  const netLbl = k.label('\\text{axis of }\\grp{g}', [0, 0, 1.75], { color: 'grp', small: true });
  const m4 = new THREE.Matrix4();
  let M = null;
  function setBody(R) {
    m4.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
    body.quaternion.setFromRotationMatrix(m4);
  }
  return {
    setModel(m) {
      M = m;
      const r = 1.006;
      for (let i = 0; i < 4; i++) {
        revealable(zTrail[i], M.samples[i].map((R) => vscale(mat.col(R, 2), r)));
        revealable(xTrail[i], M.samples[i].map((R) => vscale(mat.col(R, 0), r)));
      }
      const pred = M.predCoords[2]; // rotation about z by ±ε² sin α
      twistPred.setPoints(arcPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], 1.012, 0, pred, 40));
      twistPred.visible = Math.abs(pred) > 1e-4;
      const mid = pred / 2;
      twistLbl.setPosition([1.22 * Math.cos(mid), 1.22 * Math.sin(mid) + (pred >= 0 ? 0.12 : -0.12), -0.08]);
      twistLbl.setVisible(Math.abs(pred) > 0.02);
      const ax = vec.normalize(M.netCoords);
      netAxis.set([0, 0, 0], vscale(ax, 1.6));
      netLbl.setPosition(vscale(ax, 1.78));
      endDot.position.set(...vscale(mat.col(M.net, 0), 1.006));
    },
    setProgress(s) {
      if (!M) return;
      setBody(M.at(s));
      for (let i = 0; i < 4; i++) {
        reveal(zTrail[i], legFrac(s, i));
        reveal(xTrail[i], legFrac(s, i));
      }
      const done = s >= 4 - 1e-9;
      const big = vec.norm(M.netCoords) > 1e-3;
      endDot.visible = done;
      netAxis.visible = done && big;
      netLbl.setVisible(done && big);
    },
  };
}

// ================================================================== 2D helpers
/** Choose a home view for a plot2d so that a "scene" box sits left (wide) or top (narrow), leaving room for a dial. */
function dialLayout(p, wideView, narrowView, el, scope) {
  let mode = null;
  const apply = () => {
    const r = el.getBoundingClientRect();
    const m = r.width / Math.max(1, r.height) >= 1.2 ? 'wide' : 'narrow';
    if (m !== mode) {
      mode = m;
      p.setView(m === 'wide' ? wideView : narrowView);
    }
  };
  scope.observeResize(el, apply);
  apply();
  return () => mode;
}
function dialGeometry(p, mode) {
  const W = p.width;
  const H = p.height;
  if (mode === 'wide') {
    const r = clamp(Math.min(W * 0.13, H * 0.26), 44, 92);
    return { cx: W - r - Math.max(30, W * 0.05), cy: H / 2 - 2, r };
  }
  const r = clamp(Math.min(W * 0.16, H * 0.12), 36, 64);
  return { cx: W / 2, cy: H - r - 52, r };
}

// ================================================================== 2. Lorentz boosts (Thomas–Wigner)
export function boostView(el, scope) {
  let M = null;
  let s = 0;
  let cur = null;
  let vel = [];
  let mode = () => 'wide'; // plot2d draws once inside its constructor, before dialLayout() exists
  const p = plot2d(el, scope, { x: [-1.12, 2.95], y: [-1.1, 1.12], grid: false, axes: false, pan: false, zoom: false, draw });
  mode = dialLayout(p, { x: [-1.12, 2.95], y: [-1.1, 1.12] }, { x: [-1.1, 1.1], y: [-2.35, 1.12] }, el, scope);
  function draw(pp) {
    // velocity space: rapidity circles (equal steps of η crowd towards |v| = c)
    for (const eta of [0.5, 1, 1.5, 2]) {
      const r = Math.tanh(eta);
      pp.circle([0, 0], r, { color: 'grid', width: 1.2, dash: [3, 4] });
      if (eta < 2) pp.text(`η = ${eta}`, [r * Math.cos(-2.2), r * Math.sin(-2.2)], { color: 'muted', size: 10.5, align: 'center', offset: [0, 0] });
    }
    pp.segment([-1.04, 0], [1.04, 0], { color: 'axis', width: 1 });
    pp.segment([0, -1.04], [0, 1.04], { color: 'axis', width: 1 });
    pp.circle([0, 0], 1, { color: 'ink2', width: 1.5 });
    pp.tex('v_x', [1.06, 0], { key: 'vx', align: 'left', small: true });
    pp.tex('v_y', [0, 1.06], { key: 'vy', valign: 'bottom', small: true });
    pp.text('|v| = c', [Math.cos(2.45), Math.sin(2.45)], { color: 'ink2', size: 11.5, align: 'right', offset: [-6, -4] });
    if (!M || !cur) return;
    // the path in velocity space (body-frame legs are straight: geodesics of the Klein model)
    for (let i = 0; i < 4; i++) {
      const f = legFrac(s, i);
      if (f <= 0) continue;
      const pts = vel[i];
      const n = Math.floor(f * (pts.length - 1));
      const seg = pts.slice(0, n + 1);
      if (f < 1) seg.push(cur.v);
      pp.line(seg, { color: LEGS[i].color, width: 2.6, dash: LEGS[i].dash ? DASH2D : null });
    }
    // gyroscope at the current velocity: its rest-frame axis, R(s) x̂
    const c = pp.ctx;
    const [X0, Y0] = pp.toScreen(cur.v);
    const len = 30;
    pp.dot([0, 0], { r: 3.5, color: 'ink2' });
    screenArrow(c, X0, Y0, X0 + len * Math.cos(cur.angle), Y0 - len * Math.sin(cur.angle), pp.color('grp'), 2.6, 9);
    pp.dot(cur.v, { r: 5, color: 'grp', stroke: 'surface', width: 1.5 });
    if (s >= 4 - 1e-9) {
      pp.tex('\\grp{\\text{back at rest, turned}}', [0, 0], { key: 'rest', offset: [0, 24], small: true });
    }
    // dial: the gyroscope seen in its own rest frame
    const md = mode();
    const g = dialGeometry(pp, md);
    drawDial(pp, {
      ...g,
      angle: cur.angle,
      pred: M.predCoords[2],
      title: 'gyroscope (rest frame)',
      value: `φ = ${fmt((cur.angle * 180) / Math.PI, 1)}°`,
      value2: `predicted ${M.frame === 'space' ? '+' : '−'}ε²·sin α = ${fmt((M.predCoords[2] * 180) / Math.PI, 1)}°`,
    });
  }
  return {
    setModel(m) {
      M = m;
      vel = M.samples.map((leg) => leg.map((L) => lorentzDecompose(L).v));
      this.setProgress(s);
    },
    setProgress(x) {
      s = x;
      if (!M) return;
      cur = lorentzDecompose(M.at(s));
      p.invalidate();
    },
  };
}

// ================================================================== 3. magnetic flux (Aharonov–Bohm)
export function fluxView(el, scope) {
  let M = null;
  let s = 0;
  let cur = null;
  let path = [];
  let mode = () => 'wide';
  const p = plot2d(el, scope, { x: [-0.6, 5.3], y: [-0.55, 3.05], grid: false, axes: false, pan: false, zoom: false, draw });
  mode = dialLayout(p, { x: [-0.65, 5.4], y: [-0.62, 3.05] }, { x: [-0.55, 3.05], y: [-2.55, 3.05] }, el, scope);
  function draw(pp) {
    const c = pp.ctx;
    const qB = M ? M.params.qB : 1;
    const md = mode();
    const g = dialGeometry(pp, md);
    const v = pp.view;
    // field symbols ⊙ (out of the page) or ⊗ (into the page)
    if (Math.abs(qB) > 1e-9) {
      const step = 0.5;
      const col = pp.color('muted');
      c.save();
      c.globalAlpha = clamp(0.25 + 0.25 * Math.abs(qB), 0.3, 0.75);
      c.strokeStyle = col;
      c.fillStyle = col;
      c.lineWidth = 1;
      for (let x = Math.ceil(v.x[0] / step) * step; x <= v.x[1]; x += step)
        for (let y = Math.ceil(v.y[0] / step) * step; y <= v.y[1]; y += step) {
          const [X, Y] = pp.toScreen([x, y]);
          if (Math.hypot(X - g.cx, Y - g.cy) < g.r + 30) continue;
          c.beginPath();
          c.arc(X, Y, 3.6, 0, TWO_PI);
          c.stroke();
          if (qB > 0) {
            c.beginPath();
            c.arc(X, Y, 1.1, 0, TWO_PI);
            c.fill();
          } else {
            c.beginPath();
            c.moveTo(X - 2.2, Y - 2.2);
            c.lineTo(X + 2.2, Y + 2.2);
            c.moveTo(X + 2.2, Y - 2.2);
            c.lineTo(X - 2.2, Y + 2.2);
            c.stroke();
          }
        }
      c.restore();
    }
    // vector potential, symmetric gauge about the start: the connection (an algebra-valued 1-form)
    if (M && M.params.showA && Math.abs(qB) > 1e-9) pp.vectorField((x, y) => [(-qB * y) / 2, (qB * x) / 2], { color: 'alg', alpha: 0.28, step: 40, width: 1.1 });
    if (!M || !cur) return;
    // flux enclosed so far: path closed by the chord back to the start (θ = q × this flux in the symmetric gauge)
    const done = s >= 4 - 1e-9;
    const swept = [[0, 0]];
    for (let i = 0; i < 4; i++) {
      const f = legFrac(s, i);
      if (f <= 0) break;
      const pts = path[i];
      const n = Math.floor(f * (pts.length - 1));
      for (let j = 0; j <= n; j++) swept.push(pts[j]);
      if (f < 1) swept.push([cur[0], cur[1]]);
    }
    if (swept.length > 2) pp.polygon(swept, { fill: 'brk', alpha: done ? 0.2 : 0.14 });
    for (let i = 0; i < 4; i++) {
      const f = legFrac(s, i);
      if (f <= 0) continue;
      const pts = path[i];
      const n = Math.floor(f * (pts.length - 1));
      const seg = pts.slice(0, n + 1);
      if (f < 1) seg.push([cur[0], cur[1]]);
      pp.line(seg, { color: LEGS[i].color, width: 2.6, dash: LEGS[i].dash ? DASH2D : null });
    }
    // corners: start / end
    pp.dot([0, 0], { r: 3.5, color: 'ink2' });
    // the particle
    pp.dot([cur[0], cur[1]], { r: 6, color: 'grp', stroke: 'surface', width: 1.5 });
    const eps = M.eps;
    const Y = M.W.Y;
    const center = [(eps * (1 + Y[0])) / 2, (eps * Y[1]) / 2];
    if (done && Math.abs(M.predCoords[2]) > 1e-6) {
      pp.tex(`\\Phi = B\\cdot\\text{area}`, center, { key: 'phi', small: true });
    }
    pp.tex('\\text{start}', [0, 0], { key: 'st', offset: [-8, 14], align: 'right', small: true });
    if (Math.abs(qB) < 1e-9) pp.tex('B = 0', [v.x[0], v.y[1]], { key: 'b0', offset: [12, 36], align: 'left', small: true });
    const th = cur[2];
    drawDial(pp, {
      ...g,
      angle: th,
      pred: M.predCoords[2],
      title: 'phase e^(iθ) of the particle',
      value: `θ = ${fmt(th, 3)} rad (${fmt((th * 180) / Math.PI, 1)}°)`,
      value2: `q·flux = ${M.frame === 'space' ? '−' : ''}qB·ε²·sin α = ${fmt(M.predCoords[2], 3)}`,
    });
  }
  return {
    setModel(m) {
      M = m;
      path = M.samples.map((leg) => leg.map((g2) => [g2[0], g2[1]]));
      this.setProgress(s);
    },
    setProgress(x) {
      s = x;
      if (!M) return;
      cur = M.at(s);
      p.invalidate();
    },
  };
}

// ================================================================== 4. parallel parking, SE(2)
const CAR = { wheelbase: 0.42, rear: -0.17, front: 0.6, half: 0.17, track: 0.155, wl: 0.13, ww: 0.05 };
function carOutline(pose) {
  const { x, y, th } = pose;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const T = ([u, v]) => [x + c * u - s * v, y + s * u + c * v];
  const r = 0.05;
  const pts = [];
  // rounded rectangle in the car frame
  const corners = [
    [CAR.front - r, CAR.half - r, 0],
    [CAR.rear + r, CAR.half - r, Math.PI / 2],
    [CAR.rear + r, -CAR.half + r, Math.PI],
    [CAR.front - r, -CAR.half + r, (3 * Math.PI) / 2],
  ];
  for (const [cu, cv, a0] of corners) for (let i = 0; i <= 5; i++) pts.push(T([cu + r * Math.cos(a0 + (i * Math.PI) / 10), cv + r * Math.sin(a0 + (i * Math.PI) / 10)]));
  return { pts, T };
}
function wheelPoly(T, cx, cy, steer) {
  const c = Math.cos(steer);
  const s = Math.sin(steer);
  const hl = CAR.wl / 2;
  const hw = CAR.ww / 2;
  return [
    [hl, hw],
    [-hl, hw],
    [-hl, -hw],
    [hl, -hw],
  ].map(([u, v]) => T([cx + c * u - s * v, cy + s * u + c * v]));
}
export function carView(el, scope) {
  let M = null;
  let s = 0;
  let cur = null;
  let path = [];
  let predPose = null;
  const p = plot2d(el, scope, { x: [-0.8, 2.6], y: [-1, 1], grid: true, axes: false, pan: true, zoom: true, draw });
  function drawCar(pp, pose, steer, st) {
    const { pts, T } = carOutline(pose);
    if (st.ghost) {
      pp.polygon(pts, { stroke: st.color, width: 1.4, dash: [5, 4], strokeAlpha: st.alpha ?? 0.8 });
      return;
    }
    pp.polygon(pts, { fill: 'grp', alpha: 0.2, stroke: 'grp', width: 1.8 });
    for (const [wx, wy, isFront] of [
      [0, CAR.track, 0],
      [0, -CAR.track, 0],
      [CAR.wheelbase, CAR.track, 1],
      [CAR.wheelbase, -CAR.track, 1],
    ])
      pp.polygon(wheelPoly(T, wx, wy, isFront ? steer : 0), { fill: 'ink2', alpha: 0.9 });
    // windscreen hint + heading arrow
    pp.line([T([CAR.wheelbase - 0.06, CAR.half - 0.03]), T([CAR.wheelbase - 0.06, -CAR.half + 0.03])], { color: 'grp', width: 1.2, alpha: 0.7 });
    pp.arrow(T([CAR.wheelbase + 0.02, 0]), T([CAR.front + 0.14, 0]), { color: 'grp', width: 2, head: 8 });
    pp.dot(T([0, 0]), { r: 3, color: 'grp' });
  }
  function draw(pp) {
    if (!M || !cur) return;
    const done = s >= 4 - 1e-9;
    drawCar(pp, { x: 0, y: 0, th: 0 }, 0, { ghost: true, color: 'muted' });
    if (predPose) drawCar(pp, predPose, 0, { ghost: true, color: 'brk', alpha: 0.9 });
    // the trail of the rear-axle midpoint
    for (let i = 0; i < 4; i++) {
      const f = legFrac(s, i);
      if (f <= 0) continue;
      const pts = path[i];
      const n = Math.floor(f * (pts.length - 1));
      const seg = pts.slice(0, n + 1);
      if (f < 1) seg.push([cur.x, cur.y]);
      pp.line(seg, { color: LEGS[i].color, width: 2.6, dash: LEGS[i].dash ? DASH2D : null });
    }
    // instantaneous centre of rotation while steering (Y legs)
    const leg = Math.min(3, Math.floor(s));
    const kappa = M.params.kappa;
    const steering = !done && (leg === 1 || leg === 3) && Math.abs(kappa) > 1e-6;
    if (steering && M.frame === 'body') {
      const icr = [cur.x - Math.sin(cur.th) / kappa, cur.y + Math.cos(cur.th) / kappa];
      if (Math.abs(1 / kappa) < 4) {
        pp.segment([cur.x, cur.y], icr, { color: 'muted', width: 1, dash: [3, 4] });
        pp.text('+', icr, { color: 'muted', size: 15, align: 'center' });
      }
    }
    const steer = (leg === 1 || leg === 3) && !done ? Math.atan(kappa * CAR.wheelbase) : 0;
    drawCar(pp, cur, steer, {});
    if (done) {
      const d = Math.hypot(cur.x, cur.y);
      if (d > 1e-3) pp.arrow([0, 0], [cur.x, cur.y], { color: 'brk', width: 2.4, head: 9 });
      pp.tex('\\brk{\\text{net slide}}', [cur.x / 2, cur.y / 2], { key: 'slide', offset: [14, 0], align: 'left', small: true });
    }
    pp.tex('\\text{start}', [CAR.rear, CAR.half], { key: 'st', offset: [0, -12], align: 'left', small: true });
    if (predPose) pp.tex(`\\brk{e^{${M.frame === 'space' ? '-' : ''}\\epsilon^2[X,Y]}}`, [predPose.x + CAR.front, predPose.y - CAR.half], { key: 'pp', offset: [6, 12], align: 'left', small: true });
  }
  function fitView() {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const add = (x, y) => {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    };
    for (const leg of path)
      for (const [x, y] of leg) {
        add(x + CAR.front, y + CAR.half);
        add(x + CAR.rear, y - CAR.half);
        add(x + CAR.front, y - CAR.half);
        add(x + CAR.rear, y + CAR.half);
      }
    add(CAR.rear - 0.2, -CAR.half - 0.25);
    add(CAR.front + 0.25, CAR.half + 0.25);
    const padX = 0.25 + 0.08 * (x1 - x0);
    const padY = 0.3 + 0.1 * (y1 - y0);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = Math.max(1.0, (x1 - x0) / 2 + padX);
    const hh = Math.max(0.7, (y1 - y0) / 2 + padY);
    p.setView({ x: [cx - hw, cx + hw], y: [cy - hh, cy + hh] });
  }
  return {
    setModel(m) {
      M = m;
      path = M.samples.map((leg) => leg.map((G) => [G[0][2], G[1][2]]));
      predPose = M.predNet ? se2Pose(M.predNet) : null;
      fitView();
      this.setProgress(s);
    },
    setProgress(x) {
      s = x;
      if (!M) return;
      cur = se2Pose(M.at(s));
      p.invalidate();
    },
  };
}

// ================================================================== 5. curvature: parallel transport on the sphere
export function sphereView(el, scope) {
  const k = scene3d(el, scope, { camera: [2.4, 0.8, 1.6], target: [0.5, 0.15, 0.3], minDistance: 1.4, maxDistance: 8 });
  k.sphere({ radius: 0.996, color: 'surface3', segments: 96 });
  k.wireSphere({ radius: 1.0005, opacity: 0.32, lat: 12, lon: 24, color: 'muted' });
  k.circle([0, 0, 0], [0, 0, 1], 1.001, { color: 'axis', width: 1.6, opacity: 0.9 }); // equator
  k.arrow([0, 0, 1], [0, 0, 1.32], { color: 'z', radius: 0.012, headLength: 0.07, headRadius: 0.03 });
  k.label('N', [0, 0, 1.42], { color: 'z', small: true });
  let P = null;
  const patchFn = (u, v) => {
    if (!P) return [0, 0, 0];
    return sphereBasis(P.lat0 + u * P.dLat, P.lon0 + v * P.dLon).p.map((x) => x * 1.0025);
  };
  const patch = k.surface(patchFn, [0, 1], [0, 1], 24, 24, { color: 'brk', opacity: 0.24, depthWrite: false });
  const trail = LEGS.map((L) => k.line([], { color: L.color, width: 3, dashed: L.dash, dashSize: 0.03, gapSize: 0.022 }));
  const vStart = k.arrow([0, 0, 0], [0, 0, 0.1], { color: 'alg', radius: 0.008, headLength: 0.05, headRadius: 0.02, opacity: 0.4 });
  const vPred = k.arrow([0, 0, 0], [0, 0, 0.1], { color: 'brk', radius: 0.007, headLength: 0.05, headRadius: 0.019, opacity: 0.75 });
  const vCur = k.arrow([0, 0, 0], [0, 0, 0.1], { color: 'alg', radius: 0.014, headLength: 0.075, headRadius: 0.032 });
  const dot = k.sphere({ radius: 0.016, color: 'grp' });
  const arc = k.line([], { color: 'brk', width: 3 });
  const arcLbl = k.label('\\brk{\\alpha}', [0, 0, 0], { color: 'brk', small: true });
  const startLbl = k.label('p_0', [0, 0, 0], { small: true });
  let M = null;
  let lastLat = null;
  let alen = 0.2;
  const lift = (p, h = 0.006) => p.map((x) => x * (1 + h));
  return {
    setModel(m) {
      M = m;
      P = M.P;
      patch.update(patchFn);
      for (let i = 0; i < 4; i++) revealable(trail[i], M.samples[i].map((st) => lift(st.p, 0.005)));
      alen = clamp(0.62 * P.eps, 0.08, 0.38);
      const s0 = M.samples[0][0];
      vStart.set(lift(s0.p), vadd(lift(s0.p), vscale(s0.V, alen)));
      const Vp = rotateAbout(s0.V, s0.p, M.predCoords[2]);
      vPred.set(lift(s0.p), vadd(lift(s0.p), vscale(Vp, alen * 1.05)));
      startLbl.setPosition(vadd(lift(s0.p, 0.03), vadd(vscale(s0.east, -0.05), vscale(s0.north, -0.05))));
      if (lastLat !== P.lat0) {
        lastLat = P.lat0;
        const mid = sphereBasis(P.lat0 + 0.45 * Math.max(P.dLat, 0.35), 0.5 * Math.max(P.dLon, 0.4));
        const dir = vec.normalize(vadd(vadd(mid.p, vscale(mid.east, 0.55)), vscale(mid.north, -0.25)));
        k.setCamera(vscale(dir, 2.75), vscale(mid.p, 0.72));
      }
      this.setProgress(M.s ?? 0);
    },
    setProgress(s) {
      if (!M) return;
      for (let i = 0; i < 4; i++) reveal(trail[i], legFrac(s, i));
      const st = M.at(s);
      vCur.set(lift(st.p), vadd(lift(st.p), vscale(st.V, alen)));
      dot.position.set(...lift(st.p, 0.004));
      const done = s >= 4 - 1e-9;
      const s0 = M.samples[0][0];
      const hol = M.netCoords[2];
      arc.visible = done && Math.abs(hol) > 1e-3;
      arcLbl.setVisible(done && Math.abs(hol) > 0.02);
      if (done) {
        const u = s0.V;
        const w = vec.cross(s0.p, s0.V);
        arc.setPoints(arcPoints(lift(s0.p, 0.008), u, w, alen * 0.55, 0, hol, 32));
        const am = hol / 2;
        arcLbl.setPosition(vadd(lift(s0.p, 0.01), vadd(vscale(u, alen * 0.8 * Math.cos(am)), vscale(w, alen * 0.8 * Math.sin(am)))));
      }
    },
  };
}

export { sphereAt, withAlpha, fmtDeg };
