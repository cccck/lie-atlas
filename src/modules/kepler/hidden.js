// #/kepler, tab (b) — Hidden SO(4).
// Orbits of one energy (a = k = 1, so E = −1/2, p0 = C = 1, T = 2π) form a sphere of (L, A′); the hidden
// symmetry rotates it. Three views: configuration space (a fleet of planets in sync), velocity space
// (hodograph circles, all cutting the p0-circle at antipodes) and Fock's sphere (they become great circles).
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d } from '../../core/three-kit.js';
import { fmt, fmtDeg } from '../../core/format.js';
import { mat, rotX, rotZ } from '../../core/la.js';
import * as K from './math.js';

const k = 1;
const a = 1;
const P0 = Math.sqrt(k / a);
const PERIOD = K.TAU * Math.sqrt(a ** 3 / k);
const PLANE_R = 2.0; // radius of the momentum plane shown in 3D (units of p0)
// body-frame poles of the fleet: the reference orbit (pole ẑ) and five more tilted by 36°
const TILT = (36 * Math.PI) / 180;
const BODY = [[0, 0, 1]];
for (let i = 0; i < 5; i++) {
  const az = ((72 * i + 18) * Math.PI) / 180;
  BODY.push([Math.sin(TILT) * Math.cos(az), Math.sin(TILT) * Math.sin(az), Math.cos(TILT)]);
}

/** Points of the arc of circle (c, R) inside the disc |p| ≤ rho (one contiguous arc), at height z. */
function arcInDisc(c, R, rho, z = 0, n = 160) {
  const cn = Math.hypot(c[0], c[1]);
  let t0 = 0;
  let t1 = K.TAU;
  if (cn > 1e-9) {
    const q = (rho * rho - cn * cn - R * R) / (2 * R * cn);
    if (q <= -1) return [];
    if (q < 1) {
      const tc = Math.atan2(c[1], c[0]);
      const d = Math.acos(q);
      t0 = tc + d;
      t1 = tc + K.TAU - d;
    }
  } else if (R > rho) return [];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    pts.push([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t), z]);
  }
  return pts;
}

export function mountHidden(pg, scope, ctx) {
  const S = (ctx.state.hidden ??= { chi: 0.55, omega: 0.35, fleet: true, playing: true, sweep: false, t: 0 });
  const col = ctx.colors;

  // ------------------------------------------------------------ derived state
  let orbits = []; // [{ chi, omega, inv, hodo, pts, ref }]
  let current = []; // planets at the current time
  function rebuild() {
    const G = mat.mul(rotZ(S.omega), rotX(S.chi));
    orbits = BODY.map((n, i) => {
      const N = mat.mulv(G, n);
      const { chi, omega } = i === 0 ? { chi: S.chi, omega: S.omega } : K.chiOmegaFromPole(N);
      const inv = K.orbitInvariants(a, chi, omega, k);
      const pts = [];
      for (let j = 0; j <= 240; j++) pts.push(K.orbitPoint(a, chi, omega, (j / 240) * K.TAU, k).r);
      const fock = [];
      for (let j = 0; j <= 160; j++) fock.push(K.orbitPoint(a, chi, omega, (j / 160) * K.TAU, k).fock);
      return { i, chi, omega, inv, N: inv.N, hodo: K.hodographOf(a, chi, omega, k), pts, fock, ref: i === 0 };
    });
  }
  rebuild();

  // ------------------------------------------------------------ views
  const vQ = pg.view({ title: 'Orbits of one energy $E=-k/2a$', hint: 'same major axis $2a$ · same period' });
  const vP = pg.view({ title: 'Velocity space: hodographs', hint: 'every circle cuts $|\\vec p|=p_0$ at antipodes' });
  const vF = pg.view({ title: 'Fock’s sphere: $\\vec p/p_0\\mapsto S^2$', hint: 'drag the orange pole · drag to orbit', span: true });
  vQ.el.classList.add('kp-top-view');
  vP.el.classList.add('kp-top-view');
  vF.el.classList.add('kp-fock-view');

  const pQ = plot2d(vQ.body, scope, { x: [-2.3, 2.3], y: [-2.3, 2.3], axes: { color: 'grid' }, draw: drawQ });
  const pP = plot2d(vP.body, scope, { x: [-2.5, 2.5], y: [-2.5, 2.5], axisLabels: ['p_x', 'p_y'], draw: drawP });

  const k3 = scene3d(vF.body, scope, { camera: [3.1, -4.6, 2.5], target: [0, 0, -0.2], fov: 32 });
  k3.wireSphere({ radius: 1, opacity: 0.16, lat: 6, lon: 12 });
  k3.sphere({ radius: 0.992, color: 'grp', opacity: 0.07, segments: 48 });
  const planeGrid = k3.grid({ size: 2 * PLANE_R, divisions: 10, opacity: 0.45 });
  void planeGrid;
  k3.circle([0, 0, 0], [0, 0, 1], 1, { color: 'hi', width: 2, dashed: true, dashSize: 0.06, gapSize: 0.05 });
  const gcLines = BODY.map((_, i) => k3.line([], { color: 'grp', width: i === 0 ? 3.6 : 1.3, opacity: i === 0 ? 1 : 0.42 }));
  const hodoLines = BODY.map((_, i) => k3.line([], { color: 'grp', width: i === 0 ? 2.2 : 1, opacity: i === 0 ? 0.9 : 0.2 }));
  const pole = k3.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.018, headLength: 0.12, headRadius: 0.045 });
  const poleTip = k3.sphere({ radius: 0.07, color: 'alg', position: [0, 0, 1.12] });
  const poleLabel = k3.label('\\alg{\\hat N}', [0, 0, 1.3], { color: 'alg' });
  k3.label('p=\\infty', [0, 0, 1.12], { small: true, offset: [26, 0] });
  k3.label('p=0', [0, 0, -1.12], { small: true, offset: [22, 4] });
  k3.label('|\\vec p|=p_0', [0.72, -0.72, 0], { small: true, color: 'hi', offset: [34, 10] });
  const dots = k3.dots(BODY.map(() => [0, 0, 0]), { radius: 0.035, color: 'grp', max: BODY.length });
  const refDot = k3.sphere({ radius: 0.055, color: 'grp' });
  const planeDot = k3.sphere({ radius: 0.04, color: 'grp' });
  const ray = k3.line([], { color: 'muted', width: 1.2, opacity: 0.8, dashed: true, dashSize: 0.05, gapSize: 0.04 });
  k3.draggable(poleTip, {
    constrain: k3.onSphere([0, 0, 0], 1.12),
    onDrag: (q) => {
      const { chi, omega } = K.chiOmegaFromPole(q);
      sChi.set(chi, { silent: true });
      sOm.set(Math.atan2(Math.sin(omega), Math.cos(omega)), { silent: true });
      S.chi = chi;
      S.omega = sOm.value;
      stopSweep();
      update();
    },
  });

  // ------------------------------------------------------------ panel
  const secH = pg.section('Hidden rotation');
  const sChi = ui.slider(secH, {
    label: 'Hidden angle $\\chi$ ($e=\\sin\\chi$)',
    min: 0,
    max: Math.PI,
    step: 0.002,
    value: S.chi,
    format: (x) => `${fmtDeg(x, 1)} · e = ${fmt(Math.sin(x), 3)}`,
    onInput: (x) => {
      S.chi = x;
      stopSweep();
      update();
    },
  });
  const sOm = ui.slider(secH, {
    label: 'Perihelion direction $\\omega$ (ordinary rotation)',
    min: -Math.PI,
    max: Math.PI,
    step: 0.005,
    value: S.omega,
    format: (x) => fmtDeg(x, 1),
    onInput: (x) => {
      S.omega = x;
      update();
    },
  });
  const play = ui.playButton(null, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  const row = ui.buttons(secH, [
    { label: 'Sweep $\\chi$', onClick: () => (S.sweep ? stopSweep() : startSweep()) },
    { label: 'Sync at perihelion', onClick: () => ((S.t = 0), pQ.invalidate()) },
  ]);
  row.prepend(play.el);
  const sweepBtn = row.buttons[0];
  ui.toggle(secH, {
    label: 'Show the fleet',
    value: S.fleet,
    onChange: (v) => {
      S.fleet = v;
      update();
    },
  });

  const secR = pg.section('Conserved data (m = k = a = 1)');
  const kv = ui.keyValue(secR, [
    ['$E=-k/2a$', fmt(-k / (2 * a), 3)],
    ['$C=\\sqrt{ka}=k/\\sqrt{2|E|}$', fmt(Math.sqrt(k * a), 3)],
    ['$L=C\\cos\\chi$', ''],
    ["$|\\vec A\\,'|=C\\sin\\chi$", ''],
    ['Period $T=2\\pi\\sqrt{a^3/k}$', fmt(PERIOD, 3)],
  ]);
  const ro = ui.readout(secR, { label: 'One vector of fixed length' });
  ui.legend(secR, [
    { color: 'grp', label: 'orbit · hodograph · great circle' },
    { color: 'alg', label: '$\\vec A\\,\'$ and the pole $\\hat N$' },
    { color: 'hi', label: '$|\\vec p|=p_0$ ↔ equator' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Same energy, same period',
      text: 'Six very different orbits, all with $E=-1/2$: same major axis $2a$, so the same period. All planets left perihelion together; watch them all return to perihelion at the same instant, every $T$.',
      apply: () => {
        stopSweep();
        sChi.set(0.55);
        sOm.set(0.35);
        fleetOn();
        S.t = 0;
        play.set(true);
      },
    },
    {
      title: 'Circle → ellipse: a rotation',
      text: 'Sweep $\\chi$. Angular momentum flows into the Runge–Lenz vector, $L=C\\cos\\chi$, $|\\vec A\\,\'|=C\\sin\\chi$, at fixed $L^2+|\\vec A\\,\'|^2$. On the sphere the great circle simply tilts.',
      apply: () => {
        fleetOff();
        startSweep();
      },
    },
    {
      title: 'The collision orbit $\\chi=\\pi/2$',
      text: '$L=0$: the ellipse collapses to a segment through the focus and the hodograph becomes a straight line ($p\\to\\infty$ at the collision). On Fock’s sphere it is just another great circle, through the north pole: the sphere regularises the collision.',
      apply: () => {
        stopSweep();
        fleetOff();
        sChi.set(Math.PI / 2 - 0.004);
      },
    },
    {
      title: 'Through to the other side',
      text: 'For $\\chi>\\pi/2$ the planet goes round clockwise ($L<0$); $\\chi=\\pi$ is the clockwise circle. A hidden rotation by $\\pi$ turns a circular orbit inside out through the collision orbit — no ordinary rotation can do that.',
      apply: () => {
        stopSweep();
        fleetOff();
        sChi.set(2.4);
      },
    },
    {
      title: 'Ordinary rotations are part of it',
      text: 'Move $\\omega$: the whole fleet turns rigidly. That is the $SO(2)$ generated by $L$ — on the sphere, rotation about the vertical axis. The hidden generators $A\\,\'_x,A\\,\'_y$ tilt the sphere about horizontal axes.',
      apply: () => {
        stopSweep();
        fleetOn();
        sChi.set(0.55);
        sOm.set(-2.2);
      },
    },
  ]);

  // ------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left: six Kepler orbits with the <em>same energy</em> and a common focus. Same energy means the same major axis $2a=k/|E|$
    — all ellipses fit inside the dashed circle $r=2a$, where the kinetic energy would vanish — and the same period. They started
    together at perihelion and stay in step. The thick orbit is controlled by the sliders; the others are rigidly attached to it on the sphere.</p>
    <p>Middle: their hodographs $\\vec v(t)$. Each is a circle with $R^2-|\\vec c|^2=p_0^2=2|E|$, which is equivalent to cutting the dashed
    circle $|\\vec p|=p_0$ at two <em>antipodal</em> points (the velocities at the ends of the minor axis). Below: Fock’s inverse stereographic map
    from the north pole sends the momentum plane to the unit sphere, the $p_0$-circle to the equator — and every hodograph to a <strong>great circle</strong>.</p>`);
  pg.note(`<h2>The physics: a fourth (and fifth, and sixth) generator</h2>
    <p>At fixed $E<0$ rescale $\\vec A\\,'=\\vec A/\\sqrt{2m|E|}$. The brackets become
    $$\\{L_i,L_j\\}=\\epsilon_{ijk}L_k,\\quad \\{L_i,A'_j\\}=\\epsilon_{ijk}A'_k,\\quad \\{A'_i,A'_j\\}=\\epsilon_{ijk}L_k ,$$
    the Lie algebra $\\so(4)$: six conserved generators, six rotation planes of $\\R^4$. With $\\vec J_\\pm=\\tfrac12(\\vec L\\pm\\vec A\\,')$ it splits
    into two commuting $\\so(3)$'s, and $\\vec L\\cdot\\vec A=0$ forces $\\vec J_+^{\\,2}=\\vec J_-^{\\,2}$.</p>
    <p>For a planar orbit only $L_z$ and $A'_x,A'_y$ survive; they obey the $\\so(3)$ brackets and the constraint
    $$L^2+|\\vec A\\,'|^2=\\frac{mk^2}{2|E|}=C^2 .$$
    So the space of oriented orbits of energy $E$ is a sphere of radius $C$, and the hidden symmetry rotates it: $\\chi$ is the polar angle,
    $e=\\sin\\chi$. The north and south poles are the two circular orbits, the equator the collision orbits.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>The flows of $A'_x, A'_y$ commute with the time evolution,
    so they map a whole swarm of planets to another swarm of the same energy <em>at equal times</em> — but they are not rotations of
    ordinary space: they trade angular momentum for eccentricity.</div>`);
  pg.note(`<h2>The mathematics: Fock 1935</h2>
    <p>With $\\vec u=\\vec p/p_0$, the map $\\xi=\\big(\\tfrac{2\\vec u}{1+u^2},\\tfrac{u^2-1}{u^2+1}\\big)$ is inverse stereographic projection from the north pole.
    A circle $|\\vec u-\\vec c|^2=R^2$ with $R^2-c^2=1$ is $u^2-1-2\\vec c\\cdot\\vec u=0$, i.e. $(1+u^2)(\\xi_3-\\vec c\\cdot\\xi_\\perp)=0$:
    the plane $\\xi_3=\\vec c\\cdot\\xi_\\perp$ <em>through the origin</em>. Its pole is
    $$\\hat N=\\frac{1}{C}\\,\\big(A'_y,\\,-A'_x,\\,L\\big)=\\big(\\sin\\chi\\sin\\omega,\\,-\\sin\\chi\\cos\\omega,\\,\\cos\\chi\\big).$$
    Along the orbit the image point is $\\xi=R_z(\\omega)\\,(-\\sin\\mathcal E,\\ \\cos\\chi\\cos\\mathcal E,\\ \\sin\\chi\\cos\\mathcal E)$: it moves
    uniformly in the eccentric anomaly $\\mathcal E$, and is perfectly regular at the collision ($\\xi=$ north pole).</p>
    <p>In three dimensions the same map sends $\\vec p\\in\\R^3$ to $S^3$, and the hidden symmetry is the full $SO(4)$ of $S^3$.
    Fock used it to write hydrogen’s momentum-space Schrödinger equation as the Laplacian on $S^3$, whose eigenvalues are $n^2-1$ with
    degeneracy $n^2$ — the next tab. Moser (1970) showed the Kepler flow, in eccentric-anomaly time, <em>is</em> the geodesic flow on $S^3$.</p>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li>For $E>0$ the rescaling uses $\\sqrt{2mE}$ and $\\{A'_i,A'_j\\}=-\\epsilon_{ijk}L_k$: $\\so(3,1)$, the Lorentz algebra. Fock’s sphere becomes
      the hyperboloid $\\xi_0^2-\\vec\\xi^{\\,2}=1$ — velocity space of special relativity (see <a href="#/lorentz">Lorentz group</a>). $E=0$ gives $\\mathfrak e(3)$.</li>
      <li>In 3D the orbit space at fixed $E$ is $S^2\\times S^2$ ($\\vec J_+$ and $\\vec J_-$ each on a sphere of radius $C/2$).</li>
      <li>The isotropic oscillator has the analogous hidden $SU(2)$ (Fradkin tensor): <a href="#/torus">tori &amp; oscillators</a>. Ordinary rotations: <a href="#/so3">SO(3)</a>.</li>
    </ul>`);

  // ------------------------------------------------------------ logic
  function fleetOn() {
    S.fleet = true;
    secH.querySelector('.toggle input').checked = true;
    update();
  }
  function fleetOff() {
    S.fleet = false;
    secH.querySelector('.toggle input').checked = false;
    update();
  }
  let sweepPhase = 0;
  function startSweep() {
    S.sweep = true;
    sweepPhase = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * S.chi) / Math.PI)));
    sweepBtn.classList.add('on');
  }
  function stopSweep() {
    S.sweep = false;
    sweepBtn.classList.remove('on');
  }

  function update() {
    rebuild();
    const ref = orbits[0];
    kv.set('$L=C\\cos\\chi$', fmt(ref.inv.L, 3));
    kv.set("$|\\vec A\\,'|=C\\sin\\chi$", fmt(Math.hypot(...ref.inv.Ap), 3));
    const L2 = ref.inv.L ** 2;
    const A2 = ref.inv.Ap[0] ** 2 + ref.inv.Ap[1] ** 2;
    ro.set(`L^2+|\\vec A\\,'|^2=${fmt(L2, 3)}+${fmt(A2, 3)}=${fmt(L2 + A2, 3)}=C^2`);
    // 3D
    orbits.forEach((o, i) => {
      const show = o.ref || S.fleet;
      gcLines[i].setPoints(show ? o.fock : []);
      gcLines[i].visible = show;
      const H = o.hodo;
      let pts = [];
      if (show) {
        if (H.R > 60) {
          // collision orbit: the hodograph is the line through 0 along Â
          const u = [Math.cos(o.omega), Math.sin(o.omega)];
          pts = [
            [-PLANE_R * u[0], -PLANE_R * u[1], 0],
            [PLANE_R * u[0], PLANE_R * u[1], 0],
          ];
        } else pts = arcInDisc([H.c[0] / P0, H.c[1] / P0], H.R / P0, PLANE_R);
      }
      hodoLines[i].setPoints(pts);
      hodoLines[i].visible = show && pts.length > 1;
    });
    const N = ref.N;
    pole.set([0, 0, 0], N);
    poleTip.position.set(1.12 * N[0], 1.12 * N[1], 1.12 * N[2]);
    poleLabel.setPosition([1.3 * N[0], 1.3 * N[1], 1.3 * N[2]]);
    pQ.invalidate();
    pP.invalidate();
  }

  const planetState = () =>
    orbits.map((o) => {
      const st = K.orbitAtTime(a, o.chi, o.omega, S.t, k);
      return { ...st, o };
    });
  current = planetState();

  scope.frame((dt) => {
    if (S.sweep) {
      sweepPhase += dt * 0.42;
      const chi = (Math.PI / 2) * (1 - Math.cos(sweepPhase));
      S.chi = Math.min(Math.PI, Math.max(0, chi));
      sChi.set(S.chi, { silent: true });
      update();
    }
    if (S.playing) S.t = (S.t + dt * 1.1) % (1000 * PERIOD);
    current = planetState();
    // 3D planets
    const vis = current.filter((c) => c.o.ref || S.fleet);
    dots.setPoints(vis.map((c) => c.fock));
    const r = current[0];
    refDot.position.set(...r.fock);
    const pl = [r.v[0] / P0, r.v[1] / P0];
    const plN = Math.hypot(pl[0], pl[1]);
    const inside = plN <= PLANE_R;
    planeDot.visible = inside;
    if (inside) planeDot.position.set(pl[0], pl[1], 0);
    // projection ray from the north pole through ξ to the plane (clipped at PLANE_R)
    const f = inside ? 1 : PLANE_R / plN;
    ray.setPoints([
      [0, 0, 1],
      [f * pl[0], f * pl[1], 1 - f],
    ]);
    pQ.invalidate();
    pP.invalidate();
  });

  // ------------------------------------------------------------ drawing
  function drawQ(p) {
    p.circle([0, 0], 2 * a, { color: 'muted', width: 1, dash: [3, 5], alpha: 0.8 });
    p.tex('r=2a', [2 * a * Math.cos(2.45), 2 * a * Math.sin(2.45)], { key: 'hill', offset: [-6, -10], small: true, color: 'muted' });
    for (const o of orbits) {
      if (!o.ref && !S.fleet) continue;
      p.line(o.pts, { color: 'grp', width: o.ref ? 2.8 : 1.1, alpha: o.ref ? 1 : 0.38 });
    }
    const ref = orbits[0];
    // empty focus of the reference ellipse
    const e = ref.inv.e;
    if (e > 0.02) {
      const F2 = [-2 * a * e * Math.cos(ref.omega), -2 * a * e * Math.sin(ref.omega)];
      p.dot(F2, { r: 3.5, fill: 'surface', stroke: 'muted', width: 1.5 });
      const Ap = ref.inv.Ap;
      const tip = [0.9 * Ap[0], 0.9 * Ap[1]];
      p.arrow([0, 0], tip, { color: 'alg', width: 2.6, head: 10 });
      p.tex("\\alg{\\vec A\\,'}", tip, { key: 'A', offset: [14 * Math.cos(ref.omega), -14 * Math.sin(ref.omega)] });
    }
    p.dot([0, 0], { r: 6.5, fill: 'hi' });
    for (const c of current) {
      if (!c.o.ref && !S.fleet) continue;
      p.dot(c.r, { r: c.o.ref ? 5.5 : 4, fill: 'grp', stroke: 'surface', width: 1.5 });
    }
    // common phase clock (all planets at perihelion when it completes)
    const ctx = p.ctx;
    const X = p.width - 30;
    const Y = 30;
    const ph = (S.t / PERIOD) % 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = col.grid;
    ctx.beginPath();
    ctx.arc(X, Y, 13, 0, K.TAU);
    ctx.stroke();
    ctx.strokeStyle = col.grp;
    ctx.beginPath();
    ctx.arc(X, Y, 13, -Math.PI / 2, -Math.PI / 2 + ph * K.TAU);
    ctx.stroke();
    p.tex('t/T', p.toWorld([X, Y + 24]), { key: 'clock', small: true, color: 'muted' });
  }

  function drawP(p) {
    p.circle([0, 0], P0, { color: 'hi', width: 1.6, dash: [6, 5] });
    p.tex('p_0', [P0 * Math.cos(-0.75), P0 * Math.sin(-0.75)], { key: 'p0', offset: [10, 8], small: true, color: 'hi' });
    for (const o of orbits) {
      if (!o.ref && !S.fleet) continue;
      const H = o.hodo;
      const st = { color: 'grp', width: o.ref ? 2.6 : 1.1, alpha: o.ref ? 1 : 0.32 };
      if (H.R > 60) {
        const u = [Math.cos(o.omega), Math.sin(o.omega)];
        p.segment([-30 * u[0], -30 * u[1]], [30 * u[0], 30 * u[1]], st);
      } else p.circle(H.c, H.R, st);
    }
    const ref = orbits[0];
    const u = [Math.cos(ref.omega), Math.sin(ref.omega)];
    p.segment([-P0 * u[0], -P0 * u[1]], [P0 * u[0], P0 * u[1]], { color: 'hi', width: 1, dash: [2, 4], alpha: 0.8 });
    p.dot([P0 * u[0], P0 * u[1]], { r: 4, fill: 'hi' });
    p.dot([-P0 * u[0], -P0 * u[1]], { r: 4, fill: 'hi' });
    for (const c of current) {
      if (!c.o.ref && !S.fleet) continue;
      if (Math.hypot(c.v[0], c.v[1]) > 40) continue;
      p.dot(c.v, { r: c.o.ref ? 5 : 3.5, fill: 'grp', stroke: 'surface', width: 1.5 });
    }
  }

  // ------------------------------------------------------------ init
  if (S.sweep) startSweep();
  play.set(S.playing, { silent: true });
  update();
}
