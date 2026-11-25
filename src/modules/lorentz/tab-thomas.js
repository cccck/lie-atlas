// Tab (b): Thomas–Wigner rotation in 2+1 D. Velocity space as the hyperbolic plane (Beltrami–Klein or Poincaré disk):
// B(u)B(v) = B(u⊕v) R(ε), ε = −(oriented area of the triangle 0, u, u⊕v). Thomas precession of a gyroscope on a
// circular orbit by composing many small boosts: −2π(γ−1) per (counter-clockwise) orbit.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { inlineTex } from '../../core/tex.js';
import { texMatrix, texNum, fmt } from '../../core/format.js';
import { clamp, TAU } from '../../core/la.js';
import * as M from './math.js';
import { throttled, texDeg } from './common.js';

const VMAX = 0.97;
const OMEGA = TAU / 8; // orbital angular velocity of the animation (rad/s)
const PSI0 = Math.PI / 2; // initial gyroscope direction (lab "up")
const NS = [4, 12, 48, 1000];
const deg = (r) => `${fmt((r * 180) / Math.PI, 1)}°`;

export function mountThomas(pg, scope, ctx) {
  const S = (ctx.state.thomas ??= { uMag: 0.8, uAng: 0, vMag: 0.8, vAng: Math.PI / 2, model: 'klein', beta: 0.6, playing: true });
  const uVec = () => [S.uMag * Math.cos(S.uAng), S.uMag * Math.sin(S.uAng)];
  const vVec = () => [S.vMag * Math.cos(S.vAng), S.vMag * Math.sin(S.vAng)];
  const klein = () => S.model === 'klein';
  const toD = (k) => (klein() ? k : M.kleinToPoincare(k));
  const fromD = (d) => (klein() ? d : M.poincareToKlein(d));
  const rOf = (eta) => (klein() ? Math.tanh(eta) : Math.tanh(eta / 2));

  // ------------------------------------------------------------------ cached geometry
  const C = {};
  function compute() {
    const u = uVec();
    const v = vVec();
    const comp = M.composeBoosts(u, v);
    const w = M.einsteinAdd(u, v);
    const w2 = M.einsteinAdd(v, u);
    const tri = M.hypTriangle([0, 0], u, w);
    Object.assign(C, {
      u,
      v,
      w,
      w2,
      comp,
      tri,
      closed: M.wignerAngle(u, v),
      p1a: M.geodesic([0, 0], u).map(toD),
      p1b: M.geodesic(u, w).map(toD),
      p2a: M.geodesic([0, 0], v).map(toD),
      p2b: M.geodesic(v, w2).map(toD),
      triD: [...M.geodesic([0, 0], u), ...M.geodesic(u, w), ...M.geodesic(w, [0, 0])].map(toD),
    });
  }
  compute(); // plot2d draws once on creation

  // ------------------------------------------------------------------ views
  const v1 = pg.view({ title: 'Velocity space $|\\vec u|<1$ · Beltrami–Klein disk', hint: 'drag $\\vec u$ and $\\vec v$' });
  const v2 = pg.view({ title: 'Thomas precession of a gyroscope', hint: '8 s per orbit' });
  const ovl = v1.overlay('bl', 'overlay-card lz-ovl');

  const pathArrow = (p, pts, st) => {
    p.line(pts, st);
    const n = pts.length;
    if (n >= 6) p.arrow(pts[n - 6], pts[n - 1], { color: st.color, width: st.width, head: st.head ?? 9, alpha: st.alpha });
  };

  const p1 = plot2d(v1.body, scope, {
    x: [-1.12, 1.12],
    y: [-1.12, 1.12],
    grid: false,
    axes: false,
    draw(p) {
      // rapidity circles and radial geodesics (recessive)
      for (const e of [0.5, 1, 1.5, 2, 2.5, 3]) p.circle([0, 0], rOf(e), { color: 'muted', width: 1, alpha: Number.isInteger(e) ? 0.5 : 0.25 });
      for (let k = 0; k < 12; k++) {
        const a = (k * TAU) / 12;
        p.segment([0, 0], [Math.cos(a), Math.sin(a)], { color: 'muted', width: 1, alpha: k % 3 ? 0.14 : 0.3 });
      }
      p.circle([0, 0], 1, { color: 'ink2', width: 1.6 });
      const lab = (e) => [rOf(e) * Math.cos(-0.62), rOf(e) * Math.sin(-0.62)];
      p.tex('\\eta=1', lab(1), { key: 'e1', small: true, offset: [4, 8], align: 'left' });
      p.tex('\\eta=2', lab(2), { key: 'e2', small: true, offset: [4, 8], align: 'left' });
      p.tex('|\\vec u|=1', [Math.cos(-0.95), Math.sin(-0.95)], { key: 'c1', small: true, offset: [8, 8], align: 'left' });

      // triangle 0, u, u⊕v: its area is the Wigner angle
      p.polygon(C.triD, { fill: 'brk', alpha: 0.2 });
      // v first, then u (dashed)
      pathArrow(p, C.p2a, { color: 'c3', width: 1.6, dash: [6, 5], alpha: 0.95 });
      pathArrow(p, C.p2b, { color: 'c1', width: 1.6, dash: [6, 5], alpha: 0.95 });
      // u first, then v (solid)
      pathArrow(p, C.p1a, { color: 'c1', width: 2.6 });
      pathArrow(p, C.p1b, { color: 'c3', width: 2.6 });
      // the rotation that maps v⊕u to u⊕v, on the circle through both endpoints
      const wD = toD(C.w);
      const w2D = toD(C.w2);
      const rho = Math.hypot(wD[0], wD[1]);
      const a2 = Math.atan2(w2D[1], w2D[0]);
      const eps = C.comp.angle;
      if (Math.abs(eps) > 0.004 && rho > 0.02) {
        const arc = [];
        for (let k = 0; k <= 40; k++) arc.push([rho * Math.cos(a2 + (eps * k) / 40), rho * Math.sin(a2 + (eps * k) / 40)]);
        pathArrow(p, arc, { color: 'brk', width: 2.4, head: 8 });
        const am = a2 + eps / 2;
        p.tex('\\varepsilon', [(rho + 0.09) * Math.cos(am), (rho + 0.09) * Math.sin(am)], { key: 'eps', color: 'brk' });
      }
      p.dot(w2D, { r: 5, color: 'surface', stroke: 'grp', width: 2.2 });
      p.dot(wD, { r: 5.5, color: 'grp' });
      const out = (q, s = 16) => {
        const n = Math.hypot(q[0], q[1]) || 1;
        return [(s * q[0]) / n, (-s * q[1]) / n];
      };
      p.tex('\\vec u\\oplus\\vec v', wD, { key: 'w', color: 'grp', offset: out(wD, 30) });
      p.tex('\\vec v\\oplus\\vec u', w2D, { key: 'w2', color: 'grp', offset: out(w2D, 30) });
      p.dot([0, 0], { r: 3, color: 'ink2' });
    },
  });
  const handleSet = (which) => (d) => {
    let k = fromD(d);
    const n = Math.hypot(k[0], k[1]);
    if (!Number.isFinite(n)) return;
    if (n > VMAX) k = [(k[0] * VMAX) / n, (k[1] * VMAX) / n];
    const mag = Math.min(n, VMAX);
    if (which === 'u') {
      S.uMag = mag;
      if (n > 1e-6) S.uAng = Math.atan2(k[1], k[0]);
    } else {
      S.vMag = mag;
      if (n > 1e-6) S.vAng = Math.atan2(k[1], k[0]);
    }
    syncSliders();
    update();
  };
  p1.handle({ get: () => toD(uVec()), set: handleSet('u'), color: 'c1', label: '\\vec u', labelOffset: [12, 14] });
  p1.handle({ get: () => toD(vVec()), set: handleSet('v'), color: 'c3', label: '\\vec v', labelOffset: [14, -12] });

  // ------------------------------------------------------------------ Thomas precession view
  const CA = [0, 1.28]; // real-space orbit centre
  const CB = [0, -1.28]; // velocity-space disk centre
  let gyro = M.gyroInit(S.beta, 0);
  let ghosts = new Array(8).fill(null);
  let orbitStart = null;
  let lastOrbit = null;
  let orbitIndex = 0;
  let ghostIndex = 0;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const dirv = (a, l) => [l * Math.cos(a), l * Math.sin(a)];

  const p2 = plot2d(v2.body, scope, {
    x: [-1.25, 1.25],
    y: [-2.5, 2.5],
    grid: false,
    axes: false,
    draw(p) {
      const phi = gyro.phi;
      const beta = S.beta;
      // --- real space
      p.segment([-1.6, 0], [1.6, 0], { color: 'border', width: 1, alpha: 1 });
      p.circle(CA, 1, { color: 'grp', width: 1.6 });
      p.dot(CA, { r: 2.5, color: 'muted' });
      p.tex('\\text{real space}', [1.45, CA[1] + 0.8], { key: 'rs', small: true, align: 'right' });
      for (let k = 0; k < 8; k++) {
        if (ghosts[k] === null) continue;
        const gp = add(CA, dirv((TAU * k) / 8, 1));
        p.arrow(gp, add(gp, dirv(ghosts[k], 0.26)), { color: 'hi', width: 1.6, head: 6, alpha: 0.42 });
      }
      const pos = add(CA, dirv(phi, 1));
      const psi = PSI0 + gyro.angle;
      p.arrow(pos, add(pos, dirv(PSI0, 0.36)), { color: 'muted', width: 1.3, dash: [3, 3], head: 6 });
      const dpsi = Math.atan2(Math.sin(gyro.angle), Math.cos(gyro.angle));
      if (Math.abs(dpsi) > 0.02) {
        const arc = [];
        for (let k = 0; k <= 24; k++) arc.push(add(pos, dirv(PSI0 + (dpsi * k) / 24, 0.22)));
        p.line(arc, { color: 'brk', width: 2.2 });
      }
      p.arrow(pos, add(pos, dirv(phi + Math.PI / 2, 0.18 + 0.3 * beta)), { color: 'alg', width: 1.6, head: 6 });
      p.circle(pos, 0.075, { color: 'hi', width: 2 });
      p.arrow(pos, add(pos, dirv(psi, 0.42)), { color: 'hi', width: 3.2, head: 10 });
      p.dot(pos, { r: 3.5, color: 'ink' });
      // --- velocity space
      p.circle(CB, 1, { color: 'ink2', width: 1.4 });
      for (const e of [1, 2]) p.circle(CB, rOf(e), { color: 'muted', width: 1, alpha: 0.35 });
      const r = rOf(M.rapidityOf(beta));
      p.circle(CB, r, { color: 'grp', width: 1.8, fill: 'brk', fillAlpha: 0.2 });
      const vel = add(CB, dirv(phi + Math.PI / 2, r));
      p.arrow(CB, vel, { color: 'alg', width: 1.6, head: 7, alpha: 0.8 });
      p.dot(vel, { r: 4.5, color: 'alg' });
      p.tex(klein() ? '\\text{velocity space (Klein)}' : '\\text{velocity space (Poincaré)}', [1.45, CB[1] + 1.12], { key: 'vs', small: true, align: 'right' });
      p.tex(`\\text{area}=2\\pi(\\gamma-1)=${texDeg(M.hypDiskArea(beta), 1)}`, [-1.45, CB[1] - 1.12], { key: 'area', small: true, color: 'brk', align: 'left' });
    },
  });

  // ------------------------------------------------------------------ panel
  const secB = pg.section('Two boosts');
  const fmtSpeed = (x) => `${fmt(x, 3)} · η ${fmt(M.rapidityOf(x), 2)}`;
  const sU = ui.slider(secB, {
    label: 'Speed $|\\vec u|$',
    min: 0,
    max: VMAX,
    step: 0.005,
    value: S.uMag,
    format: fmtSpeed,
    onInput: (x) => {
      S.uMag = x;
      update();
    },
  });
  const sV = ui.slider(secB, {
    label: 'Speed $|\\vec v|$',
    min: 0,
    max: VMAX,
    step: 0.005,
    value: S.vMag,
    format: fmtSpeed,
    onInput: (x) => {
      S.vMag = x;
      update();
    },
  });
  const relAngle = () => Math.atan2(Math.sin(S.vAng - S.uAng), Math.cos(S.vAng - S.uAng));
  const sA = ui.slider(secB, {
    label: 'Angle from $\\vec u$ to $\\vec v$',
    min: -180,
    max: 180,
    step: 1,
    value: Math.round((relAngle() * 180) / Math.PI),
    format: (x) => `${fmt(x, 0)}°`,
    onInput: (x) => {
      S.vAng = S.uAng + (x * Math.PI) / 180;
      update();
    },
  });
  const segM = ui.segmented(secB, {
    label: 'Model of velocity space',
    options: [
      { value: 'klein', label: 'Beltrami–Klein' },
      { value: 'poincare', label: 'Poincaré' },
    ],
    value: S.model,
    onChange: (m) => {
      S.model = m;
      v1.setTitle(m === 'klein' ? 'Velocity space $|\\vec u|<1$ · Beltrami–Klein disk' : 'Velocity space $|\\vec u|<1$ · Poincaré disk');
      update();
    },
  });
  if (!klein()) v1.setTitle('Velocity space $|\\vec u|<1$ · Poincaré disk');
  const rLam = ui.readout(secB, { label: '$\\grp{\\Lambda}=B(\\vec u)\\,B(\\vec v)$ on $(t,x,y)$' });
  const rR = ui.readout(secB, { label: 'Leftover rotation $R=B(\\vec u\\oplus\\vec v)^{-1}\\,\\Lambda$' });
  const kvB = ui.keyValue(secB, [
    ['$|\\vec u\\oplus\\vec v|=|\\vec v\\oplus\\vec u|$', ''],
    ['Wigner angle $\\varepsilon$ from $R$', ''],
    ['closed form', ''],
    ['triangle area $\\pi-\\Sigma\\alpha$', ''],
  ]);

  const secT = pg.section('Thomas precession');
  const sB = ui.slider(secT, {
    label: 'Orbital speed $\\beta$',
    min: 0,
    max: VMAX,
    step: 0.005,
    value: S.beta,
    format: (x) => `${fmt(x, 3)} · γ ${fmt(1 / Math.sqrt(1 - x * x), 3)}`,
    onInput: (x) => {
      S.beta = x;
      lastOrbit = null;
      orbitStart = null;
      update();
    },
  });
  const rowT = ui.h('div', { class: 'btn-row' });
  secT.appendChild(rowT);
  const play = ui.playButton(rowT, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(rowT, { label: 'Reset gyroscope', onClick: () => resetGyro() });
  const kvT = ui.keyValue(secT, [
    ['$\\gamma$', ''],
    ['per orbit, $-2\\pi(\\gamma-1)$', ''],
    ['measured, last orbit', ''],
  ]);
  ui.note(secT, 'Composing $N$ boosts per orbit (a geodesic $N$-gon in velocity space) rotates the rest frame by minus the area of the $N$-gon:');
  const kvN = ui.keyValue(secT, NS.map((n) => [`$N=${n}$`, '']));
  kvN.el.classList.add('lz-kv-tight');

  ui.legend(secT, [
    { color: 'c1', label: 'boost $\\vec u$' },
    { color: 'c3', label: 'boost $\\vec v$' },
    { color: 'grp', label: 'composite velocity', dot: true },
    { color: 'brk', label: 'Wigner rotation = area' },
    { color: 'hi', label: 'gyroscope (rest-frame spin)' },
    { color: 'alg', label: 'velocity' },
  ]);

  const setBoosts = (um, ua, vm, va, model) => {
    S.uMag = um;
    S.uAng = ua;
    S.vMag = vm;
    S.vAng = va;
    if (model && model !== S.model) segM.set(model);
    syncSliders();
    update();
  };
  const setBeta = (b) => {
    sB.set(b);
    resetGyro();
    if (!play.playing) play.set(true);
  };
  ui.experiments(pg.section('Try this'), [
    {
      title: 'Two perpendicular boosts',
      text: 'Boost by $0.8$ along $x$, then $0.8$ along $y$ — or the other way round. Both end at speed $0.933$, but $28.1^\\circ$ apart: $\\vec u\\oplus\\vec v$ and $\\vec v\\oplus\\vec u$ differ by the rotation $R(\\varepsilon)$. The path turns counter-clockwise, the leftover rotation is clockwise.',
      apply: () => setBoosts(0.8, 0, 0.8, Math.PI / 2, 'klein'),
    },
    {
      title: 'Collinear boosts commute',
      text: 'With $\\vec v\\parallel\\vec u$ the triangle collapses to a segment: zero area, no rotation. Rapidities along one line simply add (first tab).',
      apply: () => setBoosts(0.6, 0.4, 0.7, 0.4),
    },
    {
      title: 'Small boosts: the commutator',
      text: 'For $|\\vec u|,|\\vec v|\\ll1$ the angle is $\\varepsilon\\approx-\\tfrac12(\\vec u\\times\\vec v)_z$, the triangle area. This is $[K_x,K_y]=-iJ_z$: two small boosts and their inverses leave a rotation of order $\\epsilon^2$.',
      apply: () => setBoosts(0.2, 0, 0.2, Math.PI / 2),
    },
    {
      title: 'Thomas precession at β = 0.6',
      text: 'Here $\\gamma=1.25$ and the gyroscope turns back by $2\\pi(\\gamma-1)=90^\\circ$ per orbit — the area of the disc enclosed by the velocity in rapidity space. Watch the faint stroboscopic arrows rotate clockwise.',
      apply: () => setBeta(0.6),
    },
    {
      title: 'One full turn per orbit',
      text: 'At $\\beta=\\sqrt3/2$, $\\gamma=2$: the gyroscope makes one complete retrograde turn per orbit. After each orbit it looks unchanged, yet it has turned once.',
      apply: () => setBeta(Math.sqrt(3) / 2),
    },
    {
      title: 'The Thomas half',
      text: 'At $\\beta=0.1$ the precession is $(\\gamma-1)\\Omega\\approx\\tfrac12\\beta^2\\Omega$, only $1.8^\\circ$ per orbit — yet for an electron in an atom it cancels half of the naive spin–orbit energy.',
      apply: () => setBeta(0.1),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>The disk is the space of velocities $|\\vec u|<1$. In the <strong>Beltrami–Klein</strong> model a point <em>is</em> the
    velocity $\\vec u$ and geodesics are straight chords; the <strong>Poincaré</strong> model (switch in the panel) is
    conformal — angles are true — with geodesics as circular arcs and radius $\\tanh(\\eta/2)$. The distance is the
    relative rapidity, $\\cosh d(\\vec u,\\vec v)=\\gamma_u\\gamma_v(1-\\vec u\\cdot\\vec v)$, so the rim $|\\vec u|=1$ is
    infinitely far away. Faint circles mark $\\eta=\\tfrac12,1,\\dots,3$.</p>
    <p>Solid path: boost by $\\vec u$, then — in the new frame — by $\\vec v$. Dashed: the other order. Both arrive at the same
    speed but in different directions,</p>
    $$\\vec u\\oplus\\vec v=\\frac{\\vec u+\\vec v/\\gamma_u+\\frac{\\gamma_u}{1+\\gamma_u}(\\vec u\\cdot\\vec v)\\,\\vec u}{1+\\vec u\\cdot\\vec v}\\ \\neq\\ \\vec v\\oplus\\vec u .$$
    <p>Reading the composite velocity $\\vec w=\\vec u\\oplus\\vec v$ off the first column of $\\Lambda=B(\\vec u)B(\\vec v)$
    leaves $R=B(\\vec w)^{-1}\\Lambda$, which the readout shows to be a pure rotation: $\\Lambda=B(\\vec w)\\,R(\\varepsilon)$ and
    $\\vec u\\oplus\\vec v=R(\\varepsilon)\\,(\\vec v\\oplus\\vec u)$.</p>`);
  pg.note(`<h2>Rotation = area</h2>
    <p>Velocity space is the mass shell $U\\cdot U=1$ — the hyperbolic plane $H^2$ of curvature $-1$. A pure boost moves a
    frame along a geodesic without twisting it (parallel transport), so going round a closed loop rotates it by the
    holonomy $\\oint=\\int K\\,dA=-A$. For the geodesic triangle $(0,\\vec u,\\vec u\\oplus\\vec v)$, Gauss–Bonnet gives</p>
    $$\\brk{\\varepsilon}=-\\big(\\pi-\\alpha-\\beta-\\gamma\\big)=-\\text{Area},\\qquad\\text{counter-clockwise triangle},$$
    <p>which the panel checks against $R$ and the closed form $\\cos\\varepsilon=\\frac{(1+\\gamma+\\gamma_u+\\gamma_v)^2}{(1+\\gamma)(1+\\gamma_u)(1+\\gamma_v)}-1$,
    $\\gamma=\\gamma_u\\gamma_v(1+\\vec u\\cdot\\vec v)$. For perpendicular boosts $\\cos\\varepsilon=\\frac{\\gamma_u+\\gamma_v}{1+\\gamma_u\\gamma_v}$.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>On a sphere a vector carried round a triangle comes
    back turned <em>with</em> the circuit by the enclosed area; on the saddle-shaped velocity space it comes back turned
    <em>against</em> it. Small boosts barely feel the curvature: $\\varepsilon\\approx-\\tfrac12\\,\\vec u\\times\\vec v$, which is
    the Baker–Campbell–Hausdorff term of $[B_x,B_y]=-L_z$, i.e. $[K_x,K_y]=-iJ_z$ (with $B_i=-iK_i$, $L_z=-iJ_z$).</div>`);
  pg.note(`<h2>Thomas precession</h2>
    <p>A gyroscope carried round a circle at speed $\\beta$ is accelerated by a continuous sequence of small non-collinear
    boosts; in its own rest frame nothing twists it. Composing the boosts (right view, and the $N$-gon table) rotates
    its rest frame, relative to the lab axes boosted without rotation, by</p>
    $$\\Delta\\psi=-2\\pi(\\gamma-1)\\ \\text{per orbit},\\qquad \\vec\\omega_T=\\frac{\\gamma^2}{\\gamma+1}\\,\\vec a\\times\\vec v=-(\\gamma-1)\\,\\vec\\Omega ,$$
    <p>i.e. <em>retrograde</em>: clockwise for a counter-clockwise orbit. $2\\pi(\\cosh\\eta-1)$ is precisely the area of the
    hyperbolic disc enclosed by the circular velocity orbit — the continuum limit of the $N$-gons.</p>
    <div class="callout physics"><span class="callout-title">The factor ½</span>In its rest frame an atomic electron sees
    $\\vec B'\\approx-\\vec v\\times\\vec E$, and its spin precesses at $g\\frac{e}{2m}B'$. But that rest frame itself
    precesses at $\\omega_T\\approx\\tfrac12\\,\\vec a\\times\\vec v$ (non-relativistically, $\\gamma\\to1$), which
    removes exactly half for $g=2$:
    $H_{SO}=\\frac{g-1}{2m^2}\\,\\frac1r\\frac{dV}{dr}\\,\\vec S\\cdot\\vec L$ instead of $\\frac{g}{2m^2}\\cdots$ — Thomas’s
    1926 resolution of the factor-of-two discrepancy in the fine structure.</div>`);
  pg.note(`<h2>Going further</h2>
    <p>In 3+1 D the same happens: $B(\\vec u)B(\\vec v)=B(\\vec u\\oplus\\vec v)\\,R$, with $R$ a rotation about
    $\\vec u\\times\\vec v$. In $SL(2,\\C)$ (next tab) it is the polar decomposition of a product of two Hermitian matrices into
    Hermitian × unitary. The leftover rotation is an element of the <em>little group</em> of the particle’s momentum
    (last tab): this is the “Wigner rotation” that acts on the spin of a moving particle under a Lorentz transformation,
    and the reason why spin states of a fast particle mix when one changes frame.</p>
    <p>Related: <a href="#/loops">commutators as small loops</a> (holonomy and curvature), <a href="#/so3">SO(3)</a>,
    <a href="#/su2">SU(2)</a>.</p>`);

  // ------------------------------------------------------------------ dynamics
  const readouts = throttled(scope, () => {
    const eps = C.comp.angle;
    rLam.set(`\\grp{\\Lambda}=${texMatrix(C.comp.L, 3)}`);
    rR.set(`R=${texMatrix(C.comp.R, 3)}=R(\\brk{${texDeg(eps, 2)}})`);
    kvB.set('$|\\vec u\\oplus\\vec v|=|\\vec v\\oplus\\vec u|$', `${fmt(Math.hypot(...C.w), 4)} = ${fmt(Math.hypot(...C.w2), 4)}`);
    kvB.set('Wigner angle $\\varepsilon$ from $R$', deg(eps));
    kvB.set('closed form', deg(C.closed));
    kvB.set('triangle area $\\pi-\\Sigma\\alpha$', `${deg(C.tri.area)}`);
    ovl.innerHTML = inlineTex(
      `$\\vec u\\oplus\\vec v$ and $\\vec v\\oplus\\vec u$ differ by<br><b>$\\brk{\\varepsilon=${texDeg(eps, 1)}}$</b> · triangle area <b>$${texDeg(C.tri.area, 1)}$</b>`,
    );
    const g = 1 / Math.sqrt(1 - S.beta * S.beta);
    kvT.set('$\\gamma$', fmt(g, 4));
    kvT.set('per orbit, $-2\\pi(\\gamma-1)$', deg(-M.hypDiskArea(S.beta)));
    kvT.set('measured, last orbit', lastOrbit === null ? '…' : deg(lastOrbit));
    const nCache = nTable();
    NS.forEach((n, i) => kvN.set(`$N=${n}$`, `${deg(nCache[i].angle)} · area ${deg(nCache[i].area)}`));
  });
  let nKey = null;
  let nVal = null;
  function nTable() {
    if (nKey === S.beta) return nVal;
    nKey = S.beta;
    nVal = NS.map((n) => ({ angle: M.thomasCompose(S.beta, n).angle, area: M.orbitPolygonArea(S.beta, n) }));
    return nVal;
  }

  function syncSliders() {
    sU.set(S.uMag, { silent: true });
    sV.set(S.vMag, { silent: true });
    sA.set(Math.round((relAngle() * 180) / Math.PI), { silent: true });
  }
  function resetGyro() {
    gyro = M.gyroInit(S.beta, gyro.phi);
    ghosts = new Array(8).fill(null);
    orbitStart = null;
    lastOrbit = null;
    orbitIndex = Math.floor(gyro.phi / TAU);
    ghostIndex = Math.floor(gyro.phi / (TAU / 8));
    update();
  }
  function update() {
    compute();
    p1.invalidate();
    p2.invalidate();
    readouts.request();
  }
  scope.frame((dt) => {
    if (!play.playing) return;
    M.gyroAdvance(gyro, S.beta, OMEGA * dt, TAU / 360);
    const gi = Math.floor(gyro.phi / (TAU / 8));
    if (gi !== ghostIndex) {
      ghostIndex = gi;
      ghosts[((gi % 8) + 8) % 8] = PSI0 + gyro.angle;
    }
    const oi = Math.floor(gyro.phi / TAU);
    if (oi !== orbitIndex) {
      if (oi === orbitIndex + 1 && orbitStart !== null) lastOrbit = gyro.angle - orbitStart;
      orbitIndex = oi;
      orbitStart = gyro.angle;
      readouts.request();
    }
    p2.invalidate();
  });
  void clamp;
  void texNum;
  syncSliders();
  update();
}
