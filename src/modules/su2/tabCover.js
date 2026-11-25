// Tab (b): SU(2) → SO(3). Left: SU(2) ≅ S³ in exponential coordinates — the ball of radius 2π whose whole
// boundary sphere is the single element −1. Right: SO(3) as the π-ball with antipodal points identified.
// Both drawn at the same scale (1 unit = π rad); the two cameras are kept aligned.

import * as ui from '../../core/ui.js';
import { scene3d } from '../../core/three-kit.js';
import { quat, vec, TAU, clamp } from '../../core/la.js';
import { texMatrix, texNum, fmt, fmtDeg } from '../../core/format.js';
import { loopRotVec, otherLift, so3FromRotVec, samplePieces, perpTo } from './math.js';

const SC = 1 / Math.PI; // world units per radian
const RATE = (2 * TAU) / 10; // rad/s along the loop at speed 1 (one 4π loop in 10 s)
const AXES = {
  tilted: [0.62, 0.28, 0.73],
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

export function mountCover(pg, scope, ctx) {
  const S = (ctx.state.cover ??= { kind: '4pi', alpha: 0.6, h: 0, axis: vec.normalize(AXES.tilted), axisName: 'tilted', playing: true, speed: 1, p: null });
  if (!Array.isArray(S.axis) || !(vec.norm(S.axis) > 0.5)) S.axis = vec.normalize(AXES.tilted);
  let contracting = false;
  let dwell = 0;

  // ------------------------------------------------------------------ views
  const vL = pg.view({ title: '$SU(2)\\cong S^3$: ball of radius $2\\pi$', hint: 'drag the $\\hat n$ handle · drag to orbit', height: 'min(60vh, 500px)' });
  const vR = pg.view({ title: '$SO(3)\\cong\\mathbb{RP}^3$: ball of radius $\\pi$', hint: 'drag to orbit', height: 'min(60vh, 500px)' });
  const FOV = 34;
  const camDir = vec.normalize([0.74, -0.56, 0.38]);
  const kL = scene3d(vL.body, scope, { camera: vec.scale(camDir, 10), fov: FOV, minDistance: 3, maxDistance: 24 });
  const kR = scene3d(vR.body, scope, { camera: vec.scale(camDir, 5), fov: FOV, minDistance: 1.6, maxDistance: 12 });
  // fit each ball to its card (tall narrow cards need a larger distance)
  const fit = (k, el, R) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const t = Math.tan(((FOV / 2) * Math.PI) / 180);
    const half = Math.atan(Math.min(1, r.width / r.height) * t);
    const d = R / Math.sin(half);
    const p = k.camera.position;
    const l = p.length() || 1;
    p.multiplyScalar(d / l);
  };
  scope.observeResize(vL.body, () => fit(kL, vL.body, 2.5));
  scope.observeResize(vR.body, () => fit(kR, vR.body, 1.25));

  // SU(2) ball
  kL.sphere({ radius: 2, color: 'grp', opacity: 0.07, segments: 48 });
  kL.wireSphere({ radius: 2, opacity: 0.22, lat: 6, lon: 12 });
  kL.wireSphere({ radius: 1, opacity: 0.1, lat: 4, lon: 8 });
  kL.sphere({ radius: 0.05, color: 'ink', segments: 16 });
  kL.label('+1', [0, 0, 0], { offset: [-16, 14], small: true });
  kL.label('\\lvert\\theta\\rvert=2\\pi\\,:\\ \\text{all } {-1}', [0, 0, 2.18], { small: true });
  kL.label('\\lvert\\theta\\rvert=\\pi', [0, 0, 1.08], { small: true, className: 'tx-muted' });
  // SO(3) ball
  kR.sphere({ radius: 1, color: 'grp', opacity: 0.07, segments: 48 });
  kR.wireSphere({ radius: 1, opacity: 0.22, lat: 6, lon: 12 });
  kR.sphere({ radius: 0.025, color: 'ink', segments: 16 });
  kR.label('\\id', [0, 0, 0], { offset: [-12, 10], small: true });
  kR.label('\\lvert\\theta\\rvert=\\pi\\,:\\ \\hat n\\sim-\\hat n', [0, 0, 1.1], { small: true });

  // axis
  const axL = kL.line([], { color: 'alg', width: 1.5, dashed: true, dashSize: 0.08, gapSize: 0.07, opacity: 0.75 });
  const axR = kR.line([], { color: 'alg', width: 1.5, dashed: true, dashSize: 0.04, gapSize: 0.035, opacity: 0.75 });
  const handle = kL.sphere({ radius: 0.09, color: 'alg', segments: 20 });
  const handleLabel = kL.label('\\hat n', [0, 0, 0], { color: 'alg', offset: [14, -10] });
  kL.draggable(handle, {
    constrain: kL.onSphere([0, 0, 0], 2.35),
    onDrag: (p) => {
      const n = vec.normalize(p);
      if (vec.norm(n) < 0.5) return;
      setAxis(n, null);
    },
  });

  // loop lines (pooled, the loop is split where the coordinate chart jumps)
  const pool = (k, n, opts) => Array.from({ length: n }, () => k.line([], opts));
  const fullL = pool(kL, 3, { color: 'grp', width: 2, opacity: 0.5 });
  const fullR = pool(kR, 4, { color: 'grp', width: 2, opacity: 0.5 });
  const trL = pool(kL, 3, { color: 'grp', width: 3.6 });
  const trR = pool(kR, 4, { color: 'grp', width: 3.6 });
  const qL = kL.sphere({ radius: 0.085, color: 'grp', segments: 20 });
  const mqL = kL.sphere({ radius: 0.075, color: 'hi', segments: 20 });
  const qLab = kL.label('\\grp{q}', [0, 0, 0], { offset: [13, -13] });
  const mqLab = kL.label('-\\grp{q}', [0, 0, 0], { offset: [18, 10], color: 'hi' });
  const rDot = kR.sphere({ radius: 0.045, color: 'grp', segments: 20 });
  const rLab = kR.label('R(\\pm\\grp{q})', [0, 0, 0], { offset: [22, -13] });
  // boundary markers: where the loop leaves and re-enters the chart (same group element)
  const crossDots = kR.dots(
    Array.from({ length: 8 }, () => [0, 0, 0]),
    { radius: 0.03, color: 'ink2', max: 8 },
  );
  const exitDots = kL.dots(
    Array.from({ length: 2 }, () => [0, 0, 0]),
    { radius: 0.055, color: 'ink2', max: 2 },
  );
  const exitLabs = [0, 1].map(() => kL.label('-1', [0, 0, 0], { small: true, offset: [14, 0] }));

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Rotate about an axis');
  const segKind = ui.segmented(sec, {
    label: 'Loop',
    options: [
      { value: '2pi', label: '$2\\pi$ rotation' },
      { value: '4pi', label: '$4\\pi$ rotation' },
    ],
    value: S.kind,
    onChange: (v) => setKind(v),
  });
  const sAlpha = ui.slider(sec, {
    label: 'Angle along the loop $\\alpha$',
    min: 0,
    max: S.kind === '2pi' ? TAU : 2 * TAU,
    step: 0.001,
    value: S.alpha,
    format: (x) => fmtDeg(x, 0),
    onInput: (x) => {
      S.alpha = x;
      dwell = 0;
      update(true);
    },
  });
  const play = ui.playButton(sec, { playing: S.playing, onToggle: (p) => (S.playing = p) });
  ui.slider(sec, { label: 'Speed', min: 0.1, max: 2.5, step: 0.05, value: S.speed, format: (x) => fmt(x, 2) + '×', onInput: (x) => (S.speed = x) });
  const segAxis = ui.segmented(sec, {
    label: 'Axis $\\hat n$',
    options: [
      { value: 'tilted', label: 'tilted' },
      { value: 'x', label: '$x$' },
      { value: 'y', label: '$y$' },
      { value: 'z', label: '$z$' },
    ],
    value: S.axisName,
    onChange: (v) => setAxis(vec.normalize(AXES[v]), v),
  });

  const secH = pg.section('Contract the 4π loop');
  const sH = ui.slider(secH, {
    label: 'Deformation $h$',
    min: 0,
    max: 2,
    step: 0.001,
    value: S.h,
    format: (x) => fmt(x, 2),
    help: '$0\\to1$: slide the re-entry point across the boundary sphere (it is all one point, $-1$). $1\\to2$: pull the loop in.',
    onInput: (x) => {
      contracting = false;
      S.h = x;
      update(true);
    },
  });
  const rowH = ui.buttons(
    secH,
    [
      { label: 'Contract the 4π loop', kind: 'primary', onClick: () => contract() },
      { label: 'Reset', onClick: () => resetH() },
    ],
    { stretch: true },
  );

  const secR = pg.section('Readout');
  const rq = ui.readout(secR, { label: 'The two lifts and their common rotation' });
  const kv = ui.keyValue(secR, [
    ['Loop in $SU(2)$', ''],
    ['Boundary crossings in $SO(3)$', ''],
    ['Shrinkable to a point', ''],
  ]);
  ui.legend(secR, [
    { color: 'grp', label: 'loop, $\\grp{q}$ and $R(\\grp q)$' },
    { color: 'hi', label: '$-\\grp q$; boundary points', dot: true },
    { color: 'alg', label: 'axis $\\hat n$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Two lifts of every rotation',
      text: 'Every rotation appears twice in $SU(2)$: $\\grp q$ at distance $\\theta$ along $\\hat n$ and $-\\grp q$ at $2\\pi-\\theta$ along $-\\hat n$. Both map to the same point of the $\\pi$-ball; only a spinor can tell them apart.',
      apply: () => {
        resetH();
        setKind('4pi');
        play.set(false);
        sAlpha.set((2 * Math.PI) / 3);
      },
    },
    {
      title: 'A 2π rotation is not closed in SU(2)',
      text: 'In $SO(3)$ the point runs out to the boundary at $\\pi$, reappears at the antipode and returns: a closed loop. In $SU(2)$ the same motion only reaches the boundary sphere, i.e. $-1$. The spinor path is open.',
      apply: () => {
        resetH();
        setKind('2pi');
        sAlpha.set(0);
        play.set(true);
      },
    },
    {
      title: '4π: closed in both',
      text: 'After $2\\pi$ the $SU(2)$ point reaches $-1$ and re-enters from the opposite side, $-\\hat n$, reaching $+1$ at $4\\pi$. In $SO(3)$ the diameter is run through twice.',
      apply: () => {
        resetH();
        setKind('4pi');
        sAlpha.set(0);
        play.set(true);
      },
    },
    {
      title: 'Contract the 4π loop',
      text: 'Slide the re-entry point over the boundary sphere — allowed, it is all the single point $-1$ — until the loop retraces itself, then pull it in. In $SO(3)$ the two boundary crossings move together and annihilate.',
      apply: () => contract(),
    },
    {
      title: 'Why 2π cannot be undone',
      text: 'The $2\\pi$ loop crosses the boundary of the $\\pi$-ball once. A deformation creates or removes crossings only in antipodal pairs, so an odd number never reaches zero: $\\pi_1(SO(3))=\\Z_2$.',
      apply: () => {
        resetH();
        setKind('2pi');
        play.set(false);
        sAlpha.set(TAU);
      },
    },
    {
      title: 'Rotations by π',
      text: 'At $\\alpha=\\pi$ the rotation sits on the boundary of the $\\pi$-ball, where $\\pi\\hat n$ and $-\\pi\\hat n$ are the same rotation. Its two lifts lie on the sphere $\\lvert\\theta\\rvert=\\pi$ of $SU(2)$, at opposite points ($w=0$).',
      apply: () => {
        resetH();
        setKind('4pi');
        play.set(false);
        sAlpha.set(Math.PI);
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Both balls use exponential coordinates $\\vec\\omega=\\theta\\hat n$ at the same scale. On the left, a point $\\vec\\omega$ with
    $\\lvert\\vec\\omega\\rvert\\le2\\pi$ stands for the spinor rotation $\\grp{U}=e^{-i\\vec\\omega\\cdot\\vec\\sigma/2}$, i.e. the unit quaternion
    $\\grp q=(\\cos\\tfrac\\theta2,\\ \\hat n\\sin\\tfrac\\theta2)$. Every point of the boundary sphere $\\lvert\\vec\\omega\\rvert=2\\pi$ gives
    $\\grp U=-\\id$: the whole sphere is a single point, and the ball with its boundary collapsed is $S^3$. The faint inner sphere
    $\\lvert\\vec\\omega\\rvert=\\pi$ is the equator $w=0$ of $S^3$.</p>
    <p>On the right, $\\vec\\omega$ with $\\lvert\\vec\\omega\\rvert\\le\\pi$ is the rotation $R=e^{-i\\vec\\omega\\cdot\\vec J}$ (rotation by $\\theta$ about
    $\\hat n$). Here only antipodal boundary points are glued: rotation by $\\pi$ about $\\hat n$ equals rotation by $\\pi$ about $-\\hat n$.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Each rotation has two lifts, $\\grp q$ and $-\\grp q$, at
    distances $\\theta$ and $2\\pi-\\theta$ on opposite sides of the centre. The inner $\\pi$-ball of $SU(2)$ maps one-to-one onto
    $SO(3)$; the outer shell is a second copy, glued on along the sphere $\\lvert\\theta\\rvert=\\pi$.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>Writing $\\grp U=w\\,\\id-i(x\\sigma_x+y\\sigma_y+z\\sigma_z)$ with $w^2+x^2+y^2+z^2=1$ identifies $SU(2)$ with the unit
    quaternions, i.e. $S^3$. The adjoint action $\\grp U\\,(\\vec v\\cdot\\vec\\sigma)\\,\\grp U^\\dagger=(R\\vec v)\\cdot\\vec\\sigma$ defines</p>
    $$R_{ij}(\\grp U)=\\tfrac12\\tr\\big(\\sigma_i\\,\\grp U\\sigma_j\\grp U^\\dagger\\big),\\qquad R(\\grp U\\grp V)=R(\\grp U)R(\\grp V),\\qquad \\ker R=\\{\\pm\\id\\},$$
    <p>so $SO(3)\\cong SU(2)/\\Z_2\\cong S^3/\\{\\pm1\\}=\\mathbb{RP}^3$. Both groups share the Lie algebra
    $[J_i,J_j]=i\\epsilon_{ijk}J_k$; they differ only globally. A loop in $SO(3)$ lifts to a path in $SU(2)$ that either closes
    (contractible loop) or ends at $-\\id$ (non-contractible): $\\pi_1(SO(3))=\\Z_2$, while $S^3$ is simply connected — $SU(2)$ is
    the universal cover.</p>`);
  pg.note(`<h2>The physics</h2>
    <p>A vector, a tensor, an orbital wavefunction $Y_{\\ell m}$ — anything built from integer spin — transforms with $R$ and cannot
    tell $\\grp q$ from $-\\grp q$. A spin-½ state transforms with $\\grp U$ itself, so the spin-½ "representation" of $SO(3)$ is
    defined only up to sign: it is a genuine representation of $SU(2)$ and a <em>projective</em> one of $SO(3)$. Wigner’s
    theorem lets a symmetry act on states only up to a phase; Bargmann showed that for rotations this phase can always be reduced
    to a sign, because $\\so(3)$ has no non-trivial central extension and $\\pi_1(SO(3))=\\Z_2$. Hence spins are integer or
    half-integer, nothing in between.</p>
    <div class="callout physics"><span class="callout-title">Physics</span>In the <a href="#/so3">SO(3)</a> picture a rigid body’s
    orientation lives in the $\\pi$-ball. A wavefunction on that configuration space may be single-valued (integer spin) or pick up
    $-1$ around the non-contractible loop (half-integer spin). See the <a href="#/hopf">Hopf fibration</a> for the $S^3$ geometry and
    <a href="#/reps">spin multiplets</a> for the representations $D^{(j)}$.</div>`);

  // ------------------------------------------------------------------ logic
  function maxAlpha() {
    return S.kind === '2pi' ? TAU : 2 * TAU;
  }
  function ensureP() {
    if (S.p && Math.abs(vec.dot(S.p, S.axis)) < 1e-6 && Math.abs(vec.norm(S.p) - 1) < 1e-6) return;
    // slide direction perpendicular to n̂ and as perpendicular as possible to the line of sight
    const cam = kL.camera.position;
    const view = vec.normalize([cam.x, cam.y, cam.z]);
    let p = vec.cross(S.axis, view);
    if (vec.norm(p) < 0.2) p = perpTo(S.axis);
    S.p = vec.normalize(vec.sub(p, vec.scale(S.axis, vec.dot(p, S.axis))));
  }
  function setKind(v) {
    S.kind = v === '2pi' ? '2pi' : '4pi';
    segKind.set(S.kind, { silent: true });
    sAlpha.setRange(0, maxAlpha(), 0.001);
    if (S.alpha > maxAlpha()) S.alpha = maxAlpha();
    sAlpha.set(S.alpha, { silent: true });
    sH.disable(S.kind === '2pi');
    rowH.buttons[1].disabled = S.kind === '2pi';
    if (S.kind === '2pi') contracting = false;
    update(true);
  }
  function setAxis(n, name) {
    S.axis = n;
    S.axisName = name;
    segAxis.set(name ?? '', { silent: true });
    S.p = null;
    ensureP();
    update(true);
  }
  function resetH() {
    contracting = false;
    S.h = 0;
    sH.set(0, { silent: true });
    update(true);
  }
  function contract() {
    if (S.kind !== '4pi') setKind('4pi');
    S.p = null;
    ensureP();
    S.h = 0;
    sH.set(0, { silent: true });
    contracting = true;
    play.set(true);
    update(true);
  }

  function assign(lines, pieces) {
    lines.forEach((ln, i) => ln.setPoints(pieces[i] || []));
  }
  const toWorld = (w) => vec.scale(w, SC);

  let lastReadout = -1;
  let fullKey = '';
  let fullSU2 = null;
  let fullSO3 = null;
  function update(force = false) {
    ensureP();
    const n = S.axis;
    const kind = S.kind;
    const h = kind === '4pi' ? S.h : 0;
    const lam = clamp(S.alpha / maxAlpha(), 0, 1);
    const su2 = (l) => loopRotVec(kind, n, l, h, S.p);
    // full loop (rebuilt only when it changes) and traced part
    const key = `${kind}|${h}|${n.join(',')}|${S.p.join(',')}`;
    if (key !== fullKey) {
      fullKey = key;
      fullSU2 = samplePieces((l) => toWorld(su2(l)), null, 360, 1.0);
      fullSO3 = samplePieces((l) => toWorld(so3FromRotVec(su2(l))), null, 360, 1.0);
      assign(fullL, fullSU2.pieces);
      assign(fullR, fullSO3.pieces);
    }
    const nTr = Math.max(2, Math.ceil(360 * lam));
    const trSU2 = samplePieces((l) => toWorld(su2(l)), null, nTr, 1.0, 0, lam);
    const trSO3 = samplePieces((l) => toWorld(so3FromRotVec(su2(l))), null, nTr, 1.0, 0, lam);
    assign(trL, lam > 1e-4 ? trSU2.pieces : []);
    assign(trR, lam > 1e-4 ? trSO3.pieces : []);

    // SU(2) chart jump (through −1): mark exit and re-entry points of the full loop
    const ex = [];
    for (let i = 0; i + 1 < fullSU2.pieces.length; i++) {
      const a = fullSU2.pieces[i];
      ex.push(a[a.length - 1], fullSU2.pieces[i + 1][0]);
    }
    exitDots.setPoints(ex.slice(0, 2));
    exitDots.visible = ex.length > 0;
    exitLabs.forEach((lb, i) => {
      lb.setVisible(i < ex.length);
      if (i < ex.length) lb.setPosition(ex[i]);
    });
    // SO(3) boundary crossings of the full loop: antipodal pairs
    const cr = [];
    for (let i = 0; i + 1 < fullSO3.pieces.length; i++) {
      const a = fullSO3.pieces[i];
      cr.push(a[a.length - 1], fullSO3.pieces[i + 1][0]);
    }
    crossDots.setPoints(cr.slice(0, 8));
    crossDots.visible = cr.length > 0;

    // current point and its two lifts
    const w = su2(lam);
    const wo = otherLift(w, n);
    const s = so3FromRotVec(w);
    qL.position.set(...toWorld(w));
    mqL.position.set(...toWorld(wo));
    qLab.setPosition(toWorld(w));
    mqLab.setPosition(toWorld(wo));
    rDot.position.set(...toWorld(s));
    rLab.setPosition(toWorld(s));

    // axis
    axL.setPoints([vec.scale(n, -2.25), vec.scale(n, 2.25)]);
    axR.setPoints([vec.scale(n, -1.13), vec.scale(n, 1.13)]);
    handle.position.set(...vec.scale(n, 2.35));
    handleLabel.setPosition(vec.scale(n, 2.35));

    // readouts (throttled while animating)
    const now = performance.now();
    if (!force && now - lastReadout < 100) return;
    lastReadout = now;
    const q = quat.fromRotVec(w);
    const tq = (v) => `(${v.map((x) => texNum(x, 2)).join(',\\,')})`;
    rq.set(`\\begin{aligned}\\grp{q}&=${tq(q)}\\\\ -\\grp{q}&=${tq(quat.neg(q))}\\\\ R(\\pm\\grp q)&=${texMatrix(quat.toMat3(q), 2)}\\end{aligned}`);
    const closed = kind === '4pi';
    kv.set('Loop in $SU(2)$', closed ? 'closed' : 'open: ends at −1');
    const crossings = fullSO3.jumps;
    kv.set('Boundary crossings in $SO(3)$', `${crossings} (${crossings % 2 ? 'odd' : 'even'})`);
    kv.set('Shrinkable to a point', crossings % 2 ? 'no' : h >= 2 - 1e-6 ? 'yes — shrunk' : 'yes');
  }

  // keep both cameras looking from the same direction
  const dirOf = (cam) => vec.normalize([cam.position.x, cam.position.y, cam.position.z]);
  let lastL = dirOf(kL.camera);
  let lastR = dirOf(kR.camera);
  function syncCameras() {
    const dL = dirOf(kL.camera);
    const dR = dirOf(kR.camera);
    const movedL = vec.dist(dL, lastL) > 1e-7;
    const movedR = vec.dist(dR, lastR) > 1e-7;
    if (movedL) {
      const r = kR.camera.position.length();
      kR.camera.position.set(dL[0] * r, dL[1] * r, dL[2] * r);
      kR.camera.lookAt(0, 0, 0);
    } else if (movedR) {
      const r = kL.camera.position.length();
      kL.camera.position.set(dR[0] * r, dR[1] * r, dR[2] * r);
      kL.camera.lookAt(0, 0, 0);
    }
    lastL = dirOf(kL.camera);
    lastR = dirOf(kR.camera);
  }

  // ------------------------------------------------------------------ animation
  scope.frame((dt) => {
    syncCameras();
    let changed = false;
    if (contracting) {
      S.h = Math.min(2, S.h + dt * S.speed * 0.2);
      sH.set(S.h, { silent: true });
      if (S.h >= 2) contracting = false;
      changed = true;
    }
    if (S.playing) {
      if (dwell > 0) {
        dwell -= dt;
        if (dwell <= 0) {
          S.alpha = 0;
          changed = true;
        }
      } else {
        S.alpha += dt * S.speed * RATE;
        if (S.alpha >= maxAlpha()) {
          S.alpha = maxAlpha();
          dwell = 0.9;
        }
        changed = true;
      }
      sAlpha.set(S.alpha, { silent: true });
    }
    if (changed) update();
  });

  setKind(S.kind);
  sH.set(S.h, { silent: true });
  update(true);
}
