// Tab (a): Dirac's string trick. A cube tethered to a frame by eight strings; every spherical shell
// between the frame and the cube is turned rigidly by an SU(2) element F(u, t) (see math.js).

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { plot2d } from '../../core/plot2d.js';
import { liveTex } from '../../core/tex.js';
import { quat, TAU, clamp } from '../../core/la.js';
import { texMatrix, texNum, fmt, fmtDeg } from '../../core/format.js';
import { mix } from '../../core/theme.js';
import { CORNERS, CUBE_HALF, FRAME_SCALE, stringPoint, cubeAngle, trickState } from './math.js';
import { tubeSet } from './tubes.js';
import { fitCamera } from './fit.js';

const SEG = 72; // samples per string
const PERIOD = { '2pi': 5, '4pi': 10, untangle: 14 }; // seconds per run at speed 1
const MODE_LABEL = { '2pi': 'Rotate 2π', '4pi': 'Rotate 4π', untangle: 'Twist 4π, then untangle' };

export function mountStrings(pg, scope, ctx) {
  const C = ctx.colors;
  const S = (ctx.state.strings ??= { mode: '4pi', t: 0, speed: 1, playing: true });
  if (!PERIOD[S.mode]) S.mode = '4pi';

  // ------------------------------------------------------------------ 3D view
  const v = pg.view({
    title: 'A cube tethered to a frame by eight strings',
    hint: 'drag to orbit · scroll to zoom',
    height: 'min(74vh, 700px)',
  });
  v.el.classList.add('su2-main');
  const k = scene3d(v.body, scope, { camera: [5.6, -4.4, 3.2], fov: 34, minDistance: 3, maxDistance: 26 });
  // the frame's corners reach radius 2.2; on narrow cards let the frame corners crop a little
  fitCamera(k, v.body, scope, { rV: 2.3, rH: 1.85 });

  // frame (the "walls") and anchors
  {
    const pos = [];
    for (let a = 0; a < 8; a++)
      for (let b = a + 1; b < 8; b++) {
        const pa = CORNERS[a];
        const pb = CORNERS[b];
        const diff = pa.filter((x, i) => x !== pb[i]).length;
        if (diff === 1) pos.push(...pa.map((x) => x * FRAME_SCALE), ...pb.map((x) => x * FRAME_SCALE));
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const frame = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: k.color('muted'), transparent: true, opacity: 0.45, depthWrite: false }));
    k.add(frame);
  }
  k.dots(
    CORNERS.map((c) => c.map((x) => x * FRAME_SCALE)),
    { radius: 0.055, color: 'ink2' },
  );

  // the cube: +x, +y, +z faces tinted with the axis colours so its orientation is visible
  const cube = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(2 * CUBE_HALF, 2 * CUBE_HALF, 2 * CUBE_HALF);
  const base = mix(C.ink, C.surface, C.dark ? 0.35 : 0.55);
  // +axis faces strongly tinted, −axis faces lightly tinted (box face order: +x, −x, +y, −y, +z, −z)
  const faceCols = [C.x, C.y, C.z].flatMap((c) => [mix(c, base, 0.3), mix(c, base, 0.68)]);
  const boxMesh = new THREE.Mesh(
    boxGeo,
    faceCols.map((c) => k.material(c, { roughness: 0.62 })),
  );
  cube.add(boxMesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: k.color('ink'), transparent: true, opacity: 0.5 }));
  cube.add(edges);
  for (const c of CORNERS) k.sphere({ radius: 0.045, color: 'grp', position: c, parent: cube, segments: 16 });
  k.add(cube);

  // generator J_z (rotation axis)
  k.arrow([0, 0, CUBE_HALF + 0.06], [0, 0, 1.55], { color: 'alg', radius: 0.013, headLength: 0.11, headRadius: 0.036 });
  k.label('J_z', [0, 0, 1.75], { color: 'alg' });

  // strings (each one a path in the rotation group from the frame to the cube): one categorical colour per
  // string so that each single winding can be followed, fading slightly towards the frame
  const STRING_COLS = [C.c1, C.c2, C.c3, C.c4, C.c5, C.c6, C.c7, C.c8];
  const strings = tubeSet(k, {
    count: 8,
    segments: SEG,
    radius: 0.026,
    radial: 10,
    color: (i, u) => mix(STRING_COLS[i], C.muted, 0.45 * (1 - u) * (1 - u)),
  });
  const pts = Array.from({ length: SEG + 1 }, () => [0, 0, 0]);

  // ------------------------------------------------------------------ overlays
  const ov = v.overlay('tr');
  ov.classList.add('su2-ov');
  const ovTheta = ui.h('div');
  const ovQ = ui.h('div');
  const ovBadge = ui.badge(null, '', '');
  ov.append(ovTheta, ovQ, ovBadge);
  const setTheta = liveTex(ovTheta);
  const setQ = liveTex(ovQ);

  const dialCard = v.overlay('bl');
  dialCard.classList.add('su2-dial-card');
  const dialBox = ui.h('div', { class: 'su2-dial' });
  dialCard.appendChild(dialBox);
  const dial = plot2d(dialBox, scope, { x: [-2.35, 2.35], y: [-1.22, 1.22], pan: false, zoom: false, grid: false, axes: false, background: false, draw: drawDial });

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Rotate the cube');
  const rowA = ui.buttons(
    sec,
    [
      { label: MODE_LABEL['2pi'], onClick: () => start('2pi') },
      { label: MODE_LABEL['4pi'], onClick: () => start('4pi') },
    ],
    { stretch: true },
  );
  const rowB = ui.buttons(sec, [{ label: MODE_LABEL.untangle, onClick: () => start('untangle') }], { stretch: true });
  const modeButtons = { '2pi': rowA.buttons[0], '4pi': rowA.buttons[1], untangle: rowB.buttons[0] };
  const play = ui.playButton(sec, {
    playing: S.playing,
    onToggle: (p) => {
      S.playing = p;
      dwell = 0;
      if (p && S.mode === '2pi' && S.t >= 1) setT(0);
    },
  });
  const sT = ui.slider(sec, {
    label: 'Time $t$',
    min: 0,
    max: 1,
    step: 0.001,
    value: S.t,
    format: (x) => fmt(x, 3),
    onInput: (x) => {
      S.t = x;
      dwell = 0;
      update(true);
    },
  });
  const sSpeed = ui.slider(sec, {
    label: 'Speed',
    min: 0.1,
    max: 2.5,
    step: 0.05,
    value: S.speed,
    format: (x) => fmt(x, 2) + '×',
    onInput: (x) => (S.speed = x),
  });
  const modeNote = ui.note(sec, '');

  const secR = pg.section('The cube’s group element');
  const rq = ui.readout(secR, { label: 'Lift to $SU(2)$ — what a spinor sees' });
  const rR = ui.readout(secR, { label: 'Rotation in $SO(3)$ — what a vector sees' });
  const kv = ui.keyValue(secR, [
    ['Cube angle $\\theta$', ''],
    ['Turns $\\theta/2\\pi$', ''],
    ['Strings', ''],
  ]);
  ui.legend(secR, [
    { color: 'alg', label: 'generator $J_z$' },
    { color: 'ink2', label: 'anchors (fixed)', dot: true },
    { color: 'x', label: '$+x$ face' },
    { color: 'y', label: '$+y$ face' },
  ]);
  ui.note(secR, 'Each string, read from the frame to the cube, is a path of rotations from the identity to the cube’s orientation.');

  ui.experiments(pg.section('Try this'), [
    {
      title: 'A 2π twist stays tangled',
      text: 'The cube turns once and is back in its original orientation, yet every string is wound once around it. No motion of the strings alone (cube and frame held) undoes this: the cube’s path in $SU(2)$ has ended at $\\grp{q=-1}$.',
      apply: () => start('2pi'),
    },
    {
      title: 'A 4π rotation untangles',
      text: 'Keep turning the same way. The strings swing over the cube and after $4\\pi$ are exactly as they started, so the motion can repeat for ever without tangling. The $4\\pi$ loop is contractible; the $2\\pi$ loop is not.',
      apply: () => start('4pi'),
    },
    {
      title: 'Freeze half-way through 4π',
      text: 'At $t=\\tfrac12$ the cube has turned by $2\\pi$ and looks untouched, but the strings are wound once (now about the $y$ axis). This is the $2\\pi$ twist in disguise: $\\grp{q=-1}$.',
      apply: () => {
        setMode('4pi');
        play.set(false);
        setT(0.5);
      },
    },
    {
      title: 'Twist, then untangle',
      text: 'Twist the strings by $4\\pi$ as a naive rotation would, then hold the cube still and move only the strings: they come free. Starting from a $2\\pi$ twist no such motion exists.',
      apply: () => start('untangle'),
    },
    {
      title: 'Your arm is a string',
      text: 'The plate (belt) trick: hold a plate flat on your palm and turn it by $2\\pi$ — your arm is twisted. Keep turning the same way, passing the plate over your head, to $4\\pi$: the arm is straight again. Shoulder = frame, plate = cube.',
      apply: () => {
        sSpeed.set(0.45);
        start('4pi');
      },
    },
    {
      title: 'Two lifts, two dials',
      text: 'Watch the inset. During one $4\\pi$ cycle the $SO(3)$ dial goes round twice, the $SU(2)$ dial once: $\\grp{q}\\mapsto R(\\grp{q})$ is two-to-one, and $\\theta=2\\pi$ lands on $\\grp{q=-1}$, the other lift of the identity.',
      apply: () => {
        sSpeed.set(0.7);
        start('4pi');
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Each string point a fraction $u$ of the way from the frame ($u=0$) to the cube ($u=1$) is moved by a rotation
    $\\grp{F(u,t)}\\in SU(2)$. Points at the same distance from the centre share the same $u$, hence the same rotation:
    every spherical shell turns rigidly, so the strings can never pass through each other or through the cube. For the
    $4\\pi$ motion</p>
    $$\\grp{F(u,t)}=\\cos^2\\!\\rho+\\sin^2\\!\\rho\\cos2\\pi t\\;+\\;\\mathbf j\\,\\cos\\rho\\sin\\rho\\,(1-\\cos2\\pi t)\\;+\\;\\mathbf k\\,\\sin\\rho\\sin2\\pi t,
    \\qquad \\rho=\\tfrac\\pi2\\,s(u),$$
    <p>with $s$ a smooth step from $0$ to $1$. At the cube $\\grp{F(1,t)}=\\cos2\\pi t+\\mathbf k\\sin2\\pi t$: a steady turn by
    $4\\pi t$ about $z$. At the frame $\\grp{F(0,t)}=1$, and $\\grp{F(u,0)}=\\grp{F(u,1)}=1$: the strings start and end untangled.
    The $2\\pi$ motion uses $\\grp{F_2(u,t)}=e^{-i\\pi t\\,s(u)\\sigma_z}$ instead, which ends twisted.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Read along one string, the rotations
    $u\\mapsto \\grp{F(u,t)}$ form a <b>path in the rotation group</b> from the identity (the frame) to the cube’s orientation.
    Moving the strings without cutting them deforms that path with its ends held fixed. The strings therefore remember not just
    the cube’s rotation $R$ but which of its two lifts $\\pm\\grp q$ the path ends on.</div>`);
  pg.note(`<h2>The physics</h2>
    <p>A spin-½ state transforms with $\\grp{U}=e^{-i\\theta\\,\\hat n\\cdot\\vec\\sigma/2}=\\cos\\tfrac\\theta2-i\\sin\\tfrac\\theta2\\,\\hat n\\cdot\\vec\\sigma$,
    so $\\grp{U}(2\\pi)=-\\id$ and only $\\grp{U}(4\\pi)=\\id$. Every observable is bilinear in the state, e.g. $\\langle\\vec\\sigma\\rangle=\\psi^\\dagger\\vec\\sigma\\psi$,
    and sees only $R(\\grp U)\\in SO(3)$, in which the sign cancels. The sign is nevertheless physical: it is a <em>relative</em>
    phase between a rotated and an unrotated part of the same system — the strings here, a second beam in an interferometer
    (third tab).</p>
    <div class="callout physics"><span class="callout-title">Why fermions exist</span>Quantum states are rays, so a symmetry
    group need only act up to a phase: by a <b>projective</b> representation. The projective representations of $SO(3)$ are the
    true representations of its universal cover $SU(2)$, and those with $\\grp U(2\\pi)=-1$ are the half-integer spins. Nature
    uses them: electrons, quarks, protons and neutrons are spinors.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>$SU(2)$ is the group of unit quaternions, the 3-sphere $S^3$, and the adjoint map
    $R_{ij}(\\grp U)=\\tfrac12\\tr\\!\\big(\\sigma_i\\grp U\\sigma_j\\grp U^\\dagger\\big)$ is a 2:1 homomorphism onto $SO(3)$ with kernel $\\{\\pm\\id\\}$, so
    $SO(3)\\cong SU(2)/\\Z_2\\cong\\mathbb{RP}^3$. Hence</p>
    $$\\pi_1\\big(SO(3)\\big)=\\Z_2 :$$
    <p>the loop $\\theta\\mapsto R_z(\\theta)$, $\\theta\\in[0,2\\pi]$, lifts to a path from $\\grp{+1}$ to $\\grp{-1}$ and cannot be
    contracted, while going round twice lifts to a closed loop on $S^3$, which can. The $4\\pi$ homotopy factorises as
    $\\grp{F}=\\exp\\!\\big(\\rho\\,\\mathbf v(t)\\big)\\exp(\\rho\\,\\mathbf j)$ with the unit pure quaternion
    $\\mathbf v(t)=-\\mathbf j\\cos2\\pi t+(\\mathbf i\\sin\\rho+\\mathbf k\\cos\\rho)\\sin2\\pi t$. See the next tab for the same fact drawn in
    the two balls, and <a href="#/so3">SO(3)</a> for the $\\pi$-ball itself.</p>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><b>Spin and statistics.</b> Exchanging two identical particles tethered to the world can be deformed into a $2\\pi$
      rotation of one of them (Finkelstein–Rubinstein; Feynman’s belt). Particles whose rotation gives $-1$ therefore pick up
      $-1$ under exchange: half-integer spin goes with Fermi statistics.</li>
      <li><b>Solitons can be fermions.</b> A skyrmion is a field configuration; its rotation by $2\\pi$ may be a non-contractible
      loop in configuration space, and quantising it with the sign $-1$ turns the nucleon of the Skyrme model into a fermion.</li>
      <li><b>Flatland is different.</b> $\\pi_1(SO(2))=\\Z$: in two dimensions no $4\\pi$ trick exists and exchange phases can be
      arbitrary — anyons.</li>
      <li>The relativistic version is $SL(2,\\C)\\to SO^+(1,3)$ (<a href="#/lorentz">Lorentz group</a>); the spinor’s phase
      geometry is the <a href="#/hopf">Hopf fibration</a>; higher spins are in <a href="#/reps">spin multiplets</a>.</li>
    </ul>`);

  // ------------------------------------------------------------------ logic
  let dwell = 0;
  let lastReadout = -1;

  function setMode(m) {
    S.mode = m;
    for (const [id, b] of Object.entries(modeButtons)) b.classList.toggle('on', id === m);
    modeNote.innerHTML = ui.h('span', {
      html:
        m === '2pi'
          ? 'The cube turns by $2\\pi$; each shell turns by $2\\pi s(u)$ about $z$. Ends twisted.'
          : m === '4pi'
            ? 'The cube turns by $4\\pi$ while the strings follow Dirac’s homotopy $\\grp{F(u,t)}$. Ends untangled; loops seamlessly.'
            : 'First half: a naive $4\\pi$ twist. Second half: the cube is held still and the strings are untangled.',
    }).innerHTML;
  }
  function start(m) {
    setMode(m);
    dwell = 0;
    setT(0);
    play.set(true);
  }
  function setT(t) {
    S.t = clamp(t, 0, 1);
    sT.set(S.t, { silent: true });
    update(true);
  }

  function drawDial(p) {
    const th = cubeAngle(S.mode, S.t);
    const r = 0.8;
    const L = [-1.18, 0.12];
    const R = [1.18, 0.12];
    const arc = (c, a0, a1, n = 64) => Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    });
    for (const c of [L, R]) p.circle(c, r, { color: 'axis', width: 1.2 });
    // SU(2): q = cos θ/2 + k sin θ/2 (one turn per 4π)
    if (th > 1e-6) p.line(arc(L, 0, th / 2), { color: 'grp', width: 2.5 });
    // SO(3): R_z(θ) (one turn per 2π)
    if (th > 1e-6) {
      if (th > TAU) p.circle(R, r, { color: 'grp', width: 2.5, alpha: 0.35 });
      const rest = th > TAU ? th - TAU : th;
      if (rest > 1e-6) p.line(arc(R, 0, rest), { color: 'grp', width: 2.5 });
    }
    p.dot([L[0] + r, L[1]], { r: 3, color: 'ink2' });
    p.dot([L[0] - r, L[1]], { r: 3, color: 'ink2' });
    p.dot([R[0] + r, R[1]], { r: 3, color: 'ink2' });
    p.tex('+1', [L[0] + r, L[1]], { offset: [13, 0], small: true, key: 'p1' });
    p.tex('-1', [L[0] - r, L[1]], { offset: [-12, 0], small: true, key: 'm1' });
    p.tex('\\id', [R[0] + r, R[1]], { offset: [10, 0], small: true, key: 'id' });
    p.dot([L[0] + r * Math.cos(th / 2), L[1] + r * Math.sin(th / 2)], { r: 5.5, color: 'grp', stroke: 'surface', width: 1.5 });
    p.dot([R[0] + r * Math.cos(th), R[1] + r * Math.sin(th)], { r: 5.5, color: 'grp', stroke: 'surface', width: 1.5 });
    p.tex('\\grp{q}\\in SU(2)', [L[0], L[1] - r - 0.2], { small: true, key: 'tL' });
    p.tex('R\\in SO(3)', [R[0], R[1] - r - 0.2], { small: true, key: 'tR' });
  }

  function update(force = false) {
    const t = S.t;
    // strings
    for (let i = 0; i < 8; i++) {
      const c = CORNERS[i];
      for (let j = 0; j <= SEG; j++) {
        const p = stringPoint(S.mode, c, j / SEG, t);
        pts[j][0] = p[0];
        pts[j][1] = p[1];
        pts[j][2] = p[2];
      }
      strings.setTube(i, pts);
    }
    strings.commit();
    // cube
    const st = trickState(S.mode, t);
    const q = st.cubeQ;
    cube.quaternion.set(q[1], q[2], q[3], q[0]);
    dial.invalidate();

    // readouts (throttled while animating)
    const now = performance.now();
    if (!force && now - lastReadout < 90) return;
    lastReadout = now;
    const th = st.angle;
    const w = q[0];
    const z = q[3];
    setTheta(`\\theta = ${texNum((th * 180) / Math.PI, 0)}^\\circ`);
    const nearOne = Math.abs(Math.abs(w) - 1) < 5e-4;
    setQ(nearOne ? `\\grp{q} = ${w > 0 ? '+1' : '-1'}` : `\\grp{q} = ${texNum(w, 2)} ${z < 0 ? '-' : '+'} ${texNum(Math.abs(z), 2)}\\,\\mathbf k`);
    const twisted = st.state === 'twisted' || (S.mode === '4pi' && Math.abs(t - 0.5) < 2e-3);
    if (st.state === 'untangled') ovBadge.set('strings untangled', 'good');
    else if (twisted) ovBadge.set('strings twisted', 'warn');
    else ovBadge.set(S.mode === 'untangle' && t > 0.5 ? 'cube held, strings moving' : 'turning', '');
    rq.set(
      `\\begin{aligned}\\grp{q}&=\\cos\\tfrac\\theta2+\\mathbf k\\sin\\tfrac\\theta2\\\\ &=(${texNum(w, 2)},\\,0,\\,0,\\,${texNum(z, 2)})\\\\[2pt] \\grp{U}&=e^{-i\\theta\\sigma_z/2}=${texMatrix(
        [
          [{ re: Math.cos(th / 2), im: -Math.sin(th / 2) }, 0],
          [0, { re: Math.cos(th / 2), im: Math.sin(th / 2) }],
        ],
        2,
      )}\\end{aligned}`,
    );
    rR.set(`R(\\theta)=${texMatrix(quat.toMat3(q), 2)}`);
    kv.set('Cube angle $\\theta$', fmtDeg(th, 1));
    kv.set('Turns $\\theta/2\\pi$', fmt(th / TAU, 2));
    kv.set(
      'Strings',
      st.state === 'untangled' ? 'untangled' : st.state === 'twisted' ? (S.mode === '2pi' ? 'twisted for good' : 'twisted (4π)') : twisted ? 'twisted' : 'moving',
    );
  }

  // ------------------------------------------------------------------ animation
  scope.frame((dt) => {
    if (!S.playing) return;
    if (dwell > 0) {
      dwell -= dt;
      if (dwell <= 0) setT(0);
      return;
    }
    let t = S.t + (dt * S.speed) / PERIOD[S.mode];
    if (t >= 1) {
      t = 1;
      if (S.mode === '2pi') {
        S.playing = false;
        play.set(false, { silent: true });
      } else dwell = 1.1;
    }
    setT(t);
  });

  setMode(S.mode);
  update(true);
}
