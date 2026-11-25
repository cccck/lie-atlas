// SO(3) tab (a) — axis & angle: the one-parameter subgroup t ↦ exp(−i tθ n̂·J) acting on a rigid body,
// and the same motion as a curve in SO(3) drawn as the π-ball (rotation vectors, antipodes identified).

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { vec, TAU, clamp } from '../../core/la.js';
import { texMatrix, texNum, fmt, fmtDeg } from '../../core/format.js';
import { PI, E, nDotJ, traceOf, qAxisAngle, rotVec, ballPath, perpTo, loop4pi, loop2pi } from './math.js';
import { quat } from '../../core/la.js';
import { aeroplane } from './body.js';
import { throttle, orbitArc, orbitRadius, angleHelix, sphereArc, texTup } from './util.js';

const L_AXIS = 1.42; // axis arrow length = radius of the drag sphere
const L_FRAME = 1.0; // body-frame arrow length (trails follow these tips)
const VIEW_H = 520;
const MAX_THETA = 2 * TAU;
const DEFAULT = () => ({
  n: vec.normalize([0.44, -0.37, 0.82]),
  theta: TAU,
  t: 0,
  mode: 'path',
  s: 0,
  sDir: 1,
  ghost: true,
});

export function mountAxis(pg, scope, ctx) {
  const S = (ctx.state.a ??= { ...DEFAULT(), playing: true, deforming: false });

  // ------------------------------------------------------------------ views
  const v1 = pg.view({
    title: 'Rigid body: rotation by $t\\theta$ about $\\alg{\\hat n}$',
    hint: 'drag the orange tip to tilt the axis · drag to orbit',
    height: VIEW_H,
  });
  const v2 = pg.view({
    title: '$SO(3)$ as the $\\pi$-ball',
    height: VIEW_H,
    hint: 'point = rotation vector $\\theta\\hat n$ · drag it · drag to orbit',
  });

  // ---- body view
  const k = scene3d(v1.body, scope, { camera: [4.55, 3.3, 2.3], target: [0, 0, 0.05], minDistance: 2, maxDistance: 14 });
  for (let i = 0; i < 3; i++) {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    a[i] = -1.3;
    b[i] = 1.3;
    k.line([a, b], { color: 'axis', width: 1, opacity: 0.9 });
    const lp = [0, 0, 0];
    lp[i] = 1.42;
    k.label('xyz'[i], lp, { color: 'muted', small: true });
  }
  const dragSphere = k.wireSphere({ radius: L_AXIS, color: 'muted', opacity: 0.07, lat: 6, lon: 12 });
  const ghost = aeroplane(k, { opacity: 0.17 });
  const plane = aeroplane(k, { frame: true, frameLength: L_FRAME });
  const orbits = [0, 1, 2].map(() => k.line([], { color: 'grp', width: 1.2, opacity: 0.45, dashed: true, dashSize: 0.06, gapSize: 0.05 }));
  const trails = [0, 1, 2].map(() => k.line([], { color: 'grp', width: 2.6 }));
  const axisArrow = k.arrow([0, 0, 0], vec.scale(S.n, L_AXIS), { color: 'alg', radius: 0.02, headLength: 0.13, headRadius: 0.05 });
  const axisBack = k.line([], { color: 'alg', width: 1.6, opacity: 0.55, dashed: true, dashSize: 0.07, gapSize: 0.05 });
  const tip = k.sphere({ radius: 0.07, color: 'alg', position: vec.scale(S.n, L_AXIS) });
  tip.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false })));
  const tipLabel = k.label('\\hat n', vec.scale(S.n, L_AXIS + 0.16), { color: 'alg' });
  const helix = k.line([], { color: 'grp', width: 2.2 });
  const helixHead = k.arrow([0, 0, 0], [0, 0, 0.01], { color: 'grp', radius: 0.0005, headLength: 0.11, headRadius: 0.045 });
  const helixLabel = k.label('\\theta', [0, 0, 0], { color: 'grp', offset: [10, -8] });
  let dragging = false;
  k.draggable(tip, {
    constrain: k.onSphere([0, 0, 0], L_AXIS),
    onStart: () => {
      dragging = true;
      dragSphere.material.opacity = 0.22;
    },
    onEnd: () => {
      dragging = false;
      dragSphere.material.opacity = 0.07;
    },
    onDrag: (p) => {
      if (vec.norm(p) < 1e-6) return;
      setAxis(vec.normalize(p), { keepPlaying: true });
    },
  });

  // ---- π-ball view
  const kb = scene3d(v2.body, scope, { camera: [11.4, 7.0, 6.2], minDistance: 5, maxDistance: 30 });
  kb.sphere({ radius: PI, color: 'grp', opacity: 0.055, segments: 64 });
  kb.wireSphere({ radius: PI, color: 'grp', opacity: 0.16, lat: 6, lon: 12 });
  const AX = PI + 0.4;
  ['x', 'y', 'z'].forEach((c, i) => {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    a[i] = -AX;
    b[i] = AX;
    kb.line([a, b], { color: c, width: 1.2, opacity: 0.55 });
    const lp = [0, 0, 0];
    lp[i] = AX + 0.32;
    kb.label(`\\theta n_${c}`, lp, { color: c, small: true });
  });
  kb.label('\\text{surface } |\\theta\\hat n|=\\pi', [0, 0, -PI], { color: 'grp', small: true, offset: [44, 18] });
  kb.dots([[0, 0, 0]], { radius: 0.06, color: 'ink' });
  kb.label('\\text{identity}', [0, 0, 0], { small: true, offset: [-30, 12] });
  const segPool = [0, 1, 2, 3].map(() => kb.line([], { color: 'grp', width: 3 }));
  const jumpPool = [0, 1, 2].map((i) => ({
    a: kb.sphere({ radius: 0.09, color: 'hi' }),
    b: kb.sphere({ radius: 0.09, color: 'hi' }),
    la: kb.label('AB'[i] || 'C', [0, 0, 0], { color: 'hi', small: true, offset: [10, -10] }),
    lb: kb.label(`${'AB'[i] || 'C'}'`, [0, 0, 0], { color: 'hi', small: true, offset: [10, -10] }),
    arc: kb.line([], { color: 'hi', width: 1.4, opacity: 0.7, dashed: true, dashSize: 0.16, gapSize: 0.12 }),
  }));
  const ptArrow = kb.arrow([0, 0, 0], [0.01, 0, 0], { color: 'alg', radius: 0.022, headLength: 0.2, headRadius: 0.07 });
  const point = kb.sphere({ radius: 0.13, color: 'grp' });
  point.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ visible: false })));
  const pointLabel = kb.label('\\grp{R}', [0, 0, 0], { offset: [14, -14] });
  const twin = kb.sphere({ radius: 0.13, color: 'grp', opacity: 0.45 });
  const twinLabel = kb.label('\\text{same } \\grp{R}', [0, 0, 0], { small: true, offset: [14, 14] });
  kb.draggable(point, {
    onDrag: (p) => {
      const th = vec.norm(p);
      if (!(th > 1e-3)) return;
      toPathMode();
      pause();
      S.n = vec.normalize(p);
      S.theta = Math.min(th, MAX_THETA);
      S.t = 1;
      syncSliders();
      update(true);
    },
  });

  // ------------------------------------------------------------------ panel
  const secR = pg.section('Rotation');
  const sTheta = ui.slider(secR, {
    label: 'Angle $\\theta$',
    min: 0,
    max: MAX_THETA,
    step: 0.005,
    value: S.theta,
    format: (x) => `${fmt(x / PI, 2)}π · ${fmtDeg(x, 0)}`,
    onInput: (x) => {
      S.theta = x;
      S.t = 1;
      toPathMode();
      pause();
      update(true);
    },
  });
  const sPol = ui.slider(secR, {
    label: 'Axis polar angle $\\vartheta_n$',
    min: 0,
    max: PI,
    step: 0.005,
    value: Math.acos(clamp(S.n[2], -1, 1)),
    format: (x) => fmtDeg(x, 0),
    onInput: () => setAxis(axisFromSliders(), { keepPlaying: true, fromSlider: true }),
  });
  const sAz = ui.slider(secR, {
    label: 'Axis azimuth $\\varphi_n$',
    min: -PI,
    max: PI,
    step: 0.005,
    value: Math.atan2(S.n[1], S.n[0]),
    format: (x) => fmtDeg(x, 0),
    onInput: () => setAxis(axisFromSliders(), { keepPlaying: true, fromSlider: true }),
  });
  const row = ui.buttons(secR, []);
  const play = ui.playButton(row, {
    playing: S.playing,
    onToggle: (on) => {
      S.playing = on;
      if (on && S.mode === 'path' && S.t >= 1) S.t = 0;
      hold = 0;
    },
  });
  ui.button(row, { label: 'Flip $\\hat n\\to-\\hat n$', onClick: () => setAxis(vec.neg(S.n), { keepPlaying: true }) });
  ui.button(row, { label: 'Reset', kind: 'ghost', onClick: reset });
  const presets = ui.buttons(secR, [
    { label: '$\\hat x$', small: true, onClick: () => preset([1, 0, 0], PI / 2) },
    { label: '$\\hat y$', small: true, onClick: () => preset([0, 1, 0], PI / 2) },
    { label: '$\\hat z$', small: true, onClick: () => preset([0, 0, 1], PI / 2) },
    { label: '$(1,1,1)$, $2\\pi/3$', small: true, onClick: () => preset([1, 1, 1], (2 * PI) / 3) },
  ]);
  presets.insertBefore(ui.h('span', { class: 'so3-row-label', text: 'Presets' }), presets.firstChild);
  ui.toggle(secR, {
    label: 'Ghost of the starting orientation',
    value: S.ghost,
    onChange: (v) => {
      S.ghost = v;
      update(true);
    },
  });

  const secO = pg.section('Readout');
  const secT = pg.section('Loops and topology');
  const segMode = ui.segmented(secT, {
    options: [
      { value: 'path', label: 'Path $0\\to\\theta$' },
      { value: 'loop2', label: '$2\\pi$ loop' },
      { value: 'loop4', label: '$4\\pi$ loop' },
    ],
    value: S.mode,
    onChange: (m) => {
      S.mode = m;
      S.t = 0;
      hold = 0;
      if (m === 'path') {
        deform.set(false);
        sS.disable(true);
      } else sS.disable(false);
      update(true);
    },
  });
  const sS = ui.slider(secT, {
    label: 'Deformation $s$',
    min: 0,
    max: 1,
    step: 0.002,
    value: S.s,
    format: 2,
    onInput: (x) => {
      S.s = x;
      deform.set(false);
      update(true);
    },
  });
  sS.disable(S.mode === 'path');
  const rowT = ui.buttons(secT, []);
  const deform = ui.playButton(rowT, {
    playing: S.deforming,
    labels: ['▶ Deform the loop', '❚❚ Pause deformation'],
    onToggle: (on) => {
      S.deforming = on;
      if (on && S.mode === 'path') segMode.set('loop4');
      sHold = 0;
    },
  });
  const kvT = ui.keyValue(secT, [
    ['Antipodal jumps', '0'],
    ['Class in $\\pi_1(SO(3))=\\Z_2$', '—'],
    ['$SU(2)$ lift ends at', '—'],
  ]);

  const outR = ui.readout(secO, { label: 'Group element (Rodrigues, $K\\vec v=\\hat n\\times\\vec v$)' });
  const outJ = ui.readout(secO, { label: 'Generator, Hermitian; real form $L_k=-iJ_k$' });
  const kv = ui.keyValue(secO, [
    ['Rotation angle', ''],
    ['$\\tr R=1+2\\cos\\theta$', ''],
    ['Rotation vector', ''],
    ['Quaternion $q$ (<a href="#/su2">SU(2)</a>)', ''],
  ]);
  ui.legend(secO, [
    { color: 'alg', label: 'axis $\\hat n$ (generator)' },
    { color: 'grp', label: 'orbits, angle, path in $SO(3)$' },
    { color: 'hi', label: 'antipodal jump', dot: true },
    { color: 'x', label: "$e'_1$" },
    { color: 'y', label: "$e'_2$" },
    { color: 'z', label: "$e'_3$" },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'A generator becomes a rotation',
      text: 'A quarter turn about $\\hat z$: every frame tip slides along a circle about the axis, $e\'_3$ (on the axis) does not move, and $R$ becomes $\\begin{psmallmatrix}0&-1&0\\\\1&0&0\\\\0&0&1\\end{psmallmatrix}$ — the exponential of the generator $-iJ_z$ times $\\pi/2$.',
      apply: () => preset([0, 0, 1], PI / 2),
    },
    {
      title: '$120^\\circ$ about $(1,1,1)$ permutes the axes',
      text: 'The nose goes to $\\hat y$, the left wing to $\\hat z$, the fin to $\\hat x$: $R$ is a permutation matrix with $\\tr R=0$, a three-fold symmetry of the cube. In the ball the point sits at $|\\theta\\hat n|=2\\pi/3$.',
      apply: () => preset([1, 1, 1], (2 * PI) / 3),
    },
    {
      title: 'Antipodes are the same rotation',
      text: 'At $\\theta=\\pi$ press “Flip $\\hat n$” repeatedly: the body does not move, because $R(\\pi,\\hat n)=R(\\pi,-\\hat n)$. In the ball the point jumps between two antipodal surface points — they are one point of $SO(3)$.',
      apply: () => {
        toPathMode();
        pause();
        S.theta = PI;
        S.t = 1;
        sTheta.set(PI, { silent: true });
        update(true);
      },
    },
    {
      title: 'A $2\\pi$ turn: a loop you cannot shrink',
      text: 'The path leaves through the surface once and comes back from the antipode: one jump. Deform it however you like — jumps are created or destroyed only in pairs, so one jump never goes away. Lifted to $SU(2)$ the loop ends at $q=-1$: a spinor changes sign.',
      apply: () => {
        segMode.set('loop2');
        S.s = 0;
        sS.set(0, { silent: true });
        play.set(true);
        deform.set(true);
      },
    },
    {
      title: 'A $4\\pi$ turn: a loop you can',
      text: 'Two full turns cross the surface twice. Deform the loop: the two jumps slide towards each other, merge at $s=\\tfrac12$ and annihilate; at $s=1$ the loop has shrunk to the identity. This is Dirac’s belt trick (<a href="#/su2">SU(2)</a>).',
      apply: () => {
        segMode.set('loop4');
        S.s = 0;
        S.sDir = 1;
        sS.set(0, { silent: true });
        play.set(true);
        deform.set(true);
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left: a rigid body carried along the one-parameter subgroup $\\grp{R(t)}=e^{-it\\theta\\,\\hat n\\cdot\\vec J}$, $t\\in[0,1]$.
    Its body frame $e'_i=R\\,e_i$ (nose, left wing, fin) sweeps out circles about the axis $\\alg{\\hat n}$ (violet trails);
    points on the axis stay put. The coil near the axis tip counts the angle, including turns beyond $2\\pi$.</p>
    <p>Right: the same motion as a curve <em>in the group</em>. A rotation is drawn as its rotation vector $\\theta\\hat n$
    with $0\\le\\theta\\le\\pi$, so the identity is the centre and the half-turns fill the sphere of radius $\\pi$. Since
    $R(\\pi,\\hat n)=R(\\pi,-\\hat n)$, antipodal surface points are one and the same rotation: a path that reaches the
    surface continues from the opposite point (gold markers $1\\to1'$).</p>`);
  pg.note(`<h2>Generators are angular momentum</h2>
    <p>The generator of rotations about $\\hat n$ is the component $\\hat n\\cdot\\vec J$ of the total angular momentum
    $\\vec J=\\vec L+\\vec S$, $\\vec L=\\vec r\\times\\vec p$, and a finite rotation acts on states as
    $U(R)=e^{-i\\theta\\,\\hat n\\cdot\\vec J}$. On ordinary vectors the generators are $3\\times3$ matrices:
    $$(J_k)_{ij}=-i\\epsilon_{kij},\\qquad -i\\theta\\,(\\hat n\\cdot\\vec J)\\,\\vec v=\\theta\\,\\hat n\\times\\vec v ,$$
    so an infinitesimal rotation is a cross product. With $K\\vec v=\\hat n\\times\\vec v$ one has $K^3=-K$, and the
    exponential series collapses to the Rodrigues formula
    $$\\grp{R(\\theta,\\hat n)}=\\id+\\sin\\theta\\,K+(1-\\cos\\theta)\\,K^2,\\qquad \\tr R=1+2\\cos\\theta .$$</p>
    <p>Anything that is a vector rotates like the arrows on the left: $U^\\dagger V_iU=R_{ij}V_j$, or infinitesimally
    $[J_i,V_j]=i\\epsilon_{ijk}V_k$ — for position, $[J_i,x_j]=i\\epsilon_{ijk}x_k$. Rotating a generator rotates its axis,
    $R\\,(\\hat n\\cdot\\vec J)\\,R^{-1}=(R\\hat n)\\cdot\\vec J$, hence $R\\,R(\\theta,\\hat n)\\,R^{-1}=R(\\theta,R\\hat n)$: all rotations
    by the same angle are conjugate (a shell of the ball), and $\\tr R$ depends on $\\theta$ alone.</p>
    <div class="callout physics"><span class="callout-title">Physics</span>If $[H,\\vec J]=0$, angular momentum is conserved
    (Noether) and levels form multiplets labelled by the Casimir $\\vec J^{\\,2}=j(j+1)$. The vector representation drawn
    here is spin 1: $\\vec J^{\\,2}=2\\cdot\\id$, $\\hat n\\cdot\\vec J$ has eigenvalues $m=+1,0,-1$, and $\\hat n$ itself is the
    $m=0$ state. In the spherical basis $e_{\\pm1}=\\mp(e_x\\pm ie_y)/\\sqrt2$, $e_0=e_z$ the matrices become the standard
    spin-1 matrices (<a href="#/reps">multiplets</a>).</div>`);
  pg.note(`<h2>The shape of $SO(3)$</h2>
    <p>The $\\pi$-ball with antipodal points identified is the real projective space $\\mathbb{RP}^3$. A closed loop that
    crosses the surface an odd number of times cannot be shrunk: a continuous deformation creates or annihilates crossings
    only in pairs (when the loop touches the surface), so the parity is invariant. Hence
    $$\\pi_1(SO(3))=\\Z_2:\\quad \\text{the } 2\\pi \\text{ loop is non-trivial, the } 4\\pi \\text{ loop is trivial.}$$</p>
    <p>The universal cover is $SU(2)\\cong S^3$, the unit quaternions $q=(\\cos\\tfrac\\theta2,\\sin\\tfrac\\theta2\\,\\hat n)$, with
    $\\pm q\\mapsto R$ two-to-one. Lifting a loop of rotations to $SU(2)$, every crossing of the surface flips the sign of
    $q$’s scalar part, so the lift ends at $(-1)^{\\#\\text{jumps}}$ — the sign a spin-½ state acquires under a $2\\pi$ rotation.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>The surface of the ball is not an edge:
    walking out through $\\pi\\hat n$ you walk straight back in at $-\\pi\\hat n$. Space is smooth there; only the picture has
    a seam — exactly like the date line on a map.</div>`);
  pg.note(`<h2>Going further</h2>
    <p><strong>Random rotations.</strong> The invariant (Haar) measure in axis–angle form is
    $$d\\mu=\\frac{1}{4\\pi^2}\\,(1-\\cos\\theta)\\,d\\theta\\,d\\Omega_{\\hat n},$$
    which piles weight near the surface: a uniformly random rotation has mean angle $\\pi/2+2/\\pi\\approx126.5^\\circ$, not $90^\\circ$.
    The characters $\\chi_j(\\theta)=\\sin\\big((j+\\tfrac12)\\theta\\big)/\\sin\\tfrac\\theta2$ are orthonormal with this weight.</p>
    <p><strong>Where to next.</strong> Why rotations fail to commute (next tab, and <a href="#/loops">commutators as small loops</a>);
    the double cover and the belt trick (<a href="#/su2">SU(2)</a>); how multiplets rotate under $D^{(j)}$
    (<a href="#/reps">representations</a>); a hidden $SO(4)$ in the Kepler problem (<a href="#/kepler">Kepler</a>).</p>`);

  // ------------------------------------------------------------------ logic
  let hold = 0;
  let sHold = 0;
  const readoutThrottle = throttle(90);

  function axisFromSliders() {
    const th = sPol.value;
    const ph = sAz.value;
    return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  }
  function syncSliders() {
    sPol.set(Math.acos(clamp(S.n[2], -1, 1)), { silent: true });
    if (Math.hypot(S.n[0], S.n[1]) > 1e-9) sAz.set(Math.atan2(S.n[1], S.n[0]), { silent: true });
    sTheta.set(S.theta, { silent: true });
  }
  function setAxis(n, { fromSlider = false } = {}) {
    const u = vec.normalize(n);
    if (vec.norm(u) < 0.5) return;
    S.n = u;
    if (!fromSlider) syncSliders();
    update(true);
  }
  function pause() {
    if (play.playing) play.set(false);
    hold = 0;
  }
  function toPathMode() {
    if (S.mode !== 'path') segMode.set('path');
  }
  function preset(n, theta) {
    toPathMode();
    S.n = vec.normalize(n);
    S.theta = theta;
    S.t = 0;
    hold = 0;
    syncSliders();
    play.set(true);
    update(true);
  }
  function reset() {
    Object.assign(S, DEFAULT());
    segMode.set('path', { silent: true });
    sS.set(0, { silent: true });
    sS.disable(true);
    deform.set(false);
    syncSliders();
    play.set(true);
    update(true);
  }

  // current loop / path as an SU(2)-valued function of t ∈ [0, 1]
  const p0 = () => perpTo(S.n);
  function qfun() {
    if (S.mode === 'loop4') return loop4pi(S.n, p0(), S.s);
    if (S.mode === 'loop2') return loop2pi(S.n, p0(), S.s);
    const n = S.n;
    const th = S.theta;
    return (t) => qAxisAngle(n, t * th);
  }

  scope.frame((dt) => {
    let changed = false;
    if (play.playing) {
      if (S.mode === 'path') {
        if (hold > 0) {
          hold -= dt;
          if (hold <= 0) {
            S.t = 0;
            changed = true;
          }
        } else {
          const dur = Math.max(1.5, S.theta / 1.25);
          S.t = Math.min(1, S.t + dt / dur);
          if (S.t >= 1) hold = 1.6;
          changed = true;
        }
      } else {
        S.t = (S.t + dt / 6.5) % 1;
        changed = true;
      }
    }
    if (deform.playing && S.mode !== 'path') {
      if (sHold > 0) sHold -= dt;
      else {
        S.s = clamp(S.s + (S.sDir * dt) / 7, 0, 1);
        if (S.s >= 1 || S.s <= 0) {
          S.sDir = S.s >= 1 ? -1 : 1;
          sHold = 1.6;
        }
        sS.set(S.s, { silent: true });
        changed = true;
      }
    }
    if (changed) update(false);
  });

  // ------------------------------------------------------------------ drawing
  function update(force) {
    const qf = qfun();
    const q = qf(S.t);
    const n = S.n;
    const isPath = S.mode === 'path';
    const angleNow = S.t * S.theta;

    // body view
    plane.setQ(q);
    const om = rotVec(q);
    ghost.visible = S.ghost && vec.norm(om) > 0.04;
    axisArrow.set([0, 0, 0], vec.scale(n, L_AXIS));
    axisBack.setPoints([[0, 0, 0], vec.scale(n, -L_AXIS)]);
    tip.position.set(...vec.scale(n, L_AXIS));
    tipLabel.setPosition(vec.scale(n, L_AXIS + 0.17));
    for (let i = 0; i < 3; i++) {
      const v = vec.scale(E[i], L_FRAME);
      if (isPath) {
        const r = orbitRadius(n, v);
        orbits[i].setPoints(r > 0.03 ? orbitArc(n, v, 0, TAU, 128) : []);
        trails[i].setPoints(r > 0.03 && angleNow > 1e-3 ? orbitArc(n, v, 0, angleNow, 128) : []);
      } else {
        orbits[i].setPoints([]);
        const pts = [];
        const m = Math.max(2, Math.ceil(160 * S.t));
        for (let j = 0; j <= m; j++) pts.push(quat.rotate(qf((S.t * j) / m), v));
        trails[i].setPoints(S.t > 0.004 ? pts : []);
      }
    }
    if (isPath && angleNow > 0.03) {
      const hx = angleHelix(n, angleNow, { ref: E[0] });
      helix.setPoints(hx.pts);
      helixHead.visible = true;
      helixHead.set(vec.sub(hx.end, vec.scale(hx.tangent, 0.11)), hx.end);
      helixLabel.setVisible(true);
      helixLabel.setPosition(hx.end);
    } else {
      helix.setPoints([]);
      helixHead.visible = false;
      helixLabel.setVisible(false);
    }

    // π-ball
    const bp = isPath ? ballPath(qf, 0, S.t, Math.max(4, Math.ceil((40 * angleNow) / PI))) : ballPath(qf, 0, 1, 420);
    segPool.forEach((ln, i) => ln.setPoints(bp.segments[i] || []));
    const camDir = vec.normalize(kb.camera.position.toArray());
    jumpPool.forEach((J, i) => {
      const jp = bp.jumps[i];
      const on = !!jp;
      J.a.visible = J.b.visible = on;
      J.la.setVisible(on);
      J.lb.setVisible(on);
      if (!on) {
        J.arc.setPoints([]);
        return;
      }
      J.a.position.set(...jp.exit);
      J.b.position.set(...jp.entry);
      J.la.setPosition(jp.exit);
      J.lb.setPosition(jp.entry);
      // route the link around the silhouette (a great circle through the camera-facing point would
      // project onto the diameter and hide behind the path)
      J.arc.setPoints(sphereArc(jp.exit, jp.entry, vec.cross(jp.exit, camDir), 72));
    });
    point.position.set(...om);
    pointLabel.setPosition(om);
    const omN = vec.norm(om);
    ptArrow.visible = isPath;
    if (isPath) ptArrow.set([0, 0, 0], omN > 0.05 ? om : [0, 0, 0]);
    const onSurface = omN > PI - 0.04;
    twin.visible = onSurface;
    twinLabel.setVisible(onSurface);
    if (onSurface) {
      twin.position.set(...vec.neg(om));
      twinLabel.setPosition(vec.neg(om));
    }

    readoutThrottle(() => readouts(q, om, bp), force);
  }

  function readouts(q, om, bp) {
    const R = quat.toMat3(q);
    const isPath = S.mode === 'path';
    const th = vec.norm(om);
    const axisP = th > 1e-9 ? vec.scale(om, 1 / th) : [0, 0, 1];
    outR.set(`\\begin{gathered}\\grp{R}=\\id+\\sin\\theta\\,K+(1-\\cos\\theta)\\,K^2\\\\=${texMatrix(R, 2)}\\end{gathered}`);
    const gen = isPath ? S.n : axisP;
    outJ.set(`\\begin{gathered}(J_k)_{ij}=-i\\epsilon_{kij}\\\\ \\alg{\\hat n\\cdot\\vec J}=${texMatrix(nDotJ(gen), 2)}\\end{gathered}`);
    const ang = isPath ? S.t * S.theta : th;
    kv.set('Rotation angle', isPath ? `$\\theta t=${texNum(ang / PI, 2)}\\pi$ (${fmtDeg(ang, 0)})` : `$${texNum(th / PI, 2)}\\pi$ (${fmtDeg(th, 0)})`);
    kv.set('$\\tr R=1+2\\cos\\theta$', `$${texNum(traceOf(R), 3)}$`);
    kv.set('Rotation vector', `$${texTup(om, 2)}$`);
    kv.set('Quaternion $q$ (<a href="#/su2">SU(2)</a>)', `$${texTup(q, 2)}$`);
    const jumps = bp.jumps.length;
    kvT.set('Antipodal jumps', String(jumps));
    const closed = isPath ? S.t > 0 && Math.abs(Math.cos((S.t * S.theta) / 2)) > 1 - 1e-6 : true;
    kvT.set('Class in $\\pi_1(SO(3))=\\Z_2$', closed ? (jumps % 2 ? 'non-trivial (odd)' : 'trivial (even)') : '— (path not closed)');
    kvT.set('$SU(2)$ lift ends at', closed ? (bp.qEnd[0] < 0 ? '$q=-1$' : '$q=+1$') : `$q_w=${texNum(bp.qEnd[0], 2)}$`);
  }

  update(true);
}
