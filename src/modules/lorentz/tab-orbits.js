// Tab (d): particles as orbits. Momentum space of 2+1 D (E up, p_x, p_y): Lorentz orbits are mass shells; the little group
// (stabiliser of p) is shown as the flow of its generator W_p = E L + p_y B_x − p_x B_y on the orbit — elliptic, parabolic
// or hyperbolic. Wigner's classification in 3+1 D in the panel and notes.

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { texMatrix, texNum, fmt } from '../../core/format.js';
import { clamp, mat, TAU } from '../../core/la.js';
import * as M from './math.js';
import { throttled } from './common.js';

const EMAX = 2.4; // display box |E| ≤ EMAX
const PMAX = 2.75; // and |p| ≤ PMAX
const DOTS_PER_CURVE = 5;
const to3 = (q) => [q[1], q[2], q[0]]; // (E, px, py) → three.js (x, y, z) = (px, py, E)

const TYPE_INFO = {
  massive: { badge: 'timelike · elliptic', kind: 'elliptic', sub: 'rotations about the rest-frame time axis' },
  massless: { badge: 'null · parabolic', kind: 'parabolic', sub: 'null rotations (nilpotent generator)' },
  tachyonic: { badge: 'spacelike · hyperbolic', kind: 'hyperbolic', sub: 'boosts along a direction ⟂ p' },
};

export function mountOrbits(pg, scope, ctx) {
  const S = (ctx.state.orbits ??= { type: 'massive', m: 1, chi: 0.8, phi: 0.5, playing: true, flow: true, all: true });

  const chiRange = () => {
    if (S.type === 'massless') return [Math.log(0.15), Math.log(EMAX * 0.96)];
    if (S.type === 'tachyonic') {
      const r = Math.asinh((EMAX * 0.96) / S.m);
      return [-r, r];
    }
    return [0, Math.acosh(Math.max(1.0001, (EMAX * 0.96) / S.m))];
  };
  const clampChi = () => {
    const [a, b] = chiRange();
    S.chi = clamp(S.chi, a, b);
  };
  clampChi();
  const momentum = () => M.orbitMomentum(S.type, S.m, S.chi, S.phi);
  const m2 = () => (S.type === 'massless' ? 0 : S.type === 'tachyonic' ? -S.m * S.m : S.m * S.m);

  // ------------------------------------------------------------------ view
  const v = pg.view({ title: 'Momentum space $(p_x,p_y,E)$ · orbits of $SO^+(1,2)$', hint: 'drag $p$ along its orbit · drag empty space to turn · scroll to zoom' });
  const k = scene3d(v.body, scope, { camera: [5.6, -4.3, 2.7], target: [0, 0, 0.45], fov: 34, minDistance: 3, maxDistance: 16 });
  k.axes({ length: 2.55, labels: ['p_x', 'p_y', 'E'], negative: true, radius: 0.01 });

  // light cone (always): rulings + rims
  const seg = (pairs, color, opacity) => {
    const arr = new Float32Array(pairs.length * 6);
    pairs.forEach(([a, b], i) => arr.set([...a, ...b], 6 * i));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: k.color(color), transparent: true, opacity, depthWrite: false }));
    k.root.add(ls);
    return ls;
  };
  const ring = (z, r, n = 96) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n;
      const b = (TAU * (i + 1)) / n;
      out.push([[r * Math.cos(a), r * Math.sin(a), z], [r * Math.cos(b), r * Math.sin(b), z]]);
    }
    return out;
  };
  {
    const pairs = [];
    for (let i = 0; i < 16; i++) {
      const a = (TAU * i) / 16;
      pairs.push([[-EMAX * Math.cos(a), -EMAX * Math.sin(a), -EMAX], [EMAX * Math.cos(a), EMAX * Math.sin(a), EMAX]]);
    }
    pairs.push(...ring(EMAX, EMAX), ...ring(-EMAX, EMAX));
    seg(pairs, 'muted', 0.42);
  }
  // faint reference orbits of the other two types (same |m|)
  let refLines = null;
  function buildRefs() {
    if (refLines) {
      k.root.remove(refLines);
      refLines.geometry.dispose();
      refLines.material.dispose();
      refLines = null;
    }
    const pairs = [];
    const mm = S.m;
    const addCurve = (f, n = 64) => {
      for (let i = 0; i < n; i++) pairs.push([f(i / n), f((i + 1) / n)]);
    };
    if (S.type !== 'massive' && mm < EMAX) {
      const rmax = Math.acosh(EMAX / mm);
      for (const r of [0.33, 0.66, 1].map((x) => x * rmax)) {
        pairs.push(...ring(mm * Math.cosh(r), mm * Math.sinh(r), 72));
      }
      for (let j = 0; j < 8; j++) {
        const a = (TAU * j) / 8;
        addCurve((s) => [mm * Math.sinh(s * rmax) * Math.cos(a), mm * Math.sinh(s * rmax) * Math.sin(a), mm * Math.cosh(s * rmax)], 32);
      }
    }
    if (S.type !== 'tachyonic') {
      const rmax = Math.asinh(EMAX / mm);
      for (const r of [-1, -0.5, 0, 0.5, 1].map((x) => x * rmax)) pairs.push(...ring(mm * Math.sinh(r), mm * Math.cosh(r), 72));
      for (let j = 0; j < 8; j++) {
        const a = (TAU * j) / 8;
        addCurve((s) => {
          const r = (2 * s - 1) * rmax;
          return [mm * Math.cosh(r) * Math.cos(a), mm * Math.cosh(r) * Math.sin(a), mm * Math.sinh(r)];
        }, 32);
      }
    }
    refLines = seg(pairs, 'muted', 0.26);
    refLines.visible = S.all;
  }

  // current orbit surface (normalised parameters so the ranges can change)
  const surfF = (u, w) => {
    const a = TAU * w;
    const mm = S.m;
    if (S.type === 'massless') {
      const r = u * EMAX;
      return [r * Math.cos(a), r * Math.sin(a), r];
    }
    if (S.type === 'tachyonic') {
      const rmax = Math.asinh(EMAX / mm);
      const r = (2 * u - 1) * rmax;
      return [mm * Math.cosh(r) * Math.cos(a), mm * Math.cosh(r) * Math.sin(a), mm * Math.sinh(r)];
    }
    const rmax = Math.acosh(Math.max(1, EMAX / mm));
    const r = u * rmax;
    return [mm * Math.sinh(r) * Math.cos(a), mm * Math.sinh(r) * Math.sin(a), mm * Math.cosh(r)];
  };
  const surf = k.surface(surfF, [0, 1], [0, 1], 40, 72, { color: 'grp', opacity: 0.24, roughness: 0.75 });
  const rimTop = k.line([], { color: 'grp', width: 1.6, opacity: 0.85 });
  const rimBot = k.line([], { color: 'grp', width: 1.6, opacity: 0.85 });

  // little-group flow lines (fat line segments) + flowing dots
  const flowMat = new LineMaterial({ color: k.color('alg'), linewidth: 1.8, transparent: true, opacity: 0.9, worldUnits: false });
  const flowLines = new LineSegments2(new LineSegmentsGeometry(), flowMat);
  flowLines.frustumCulled = false;
  k.root.add(flowLines);
  const dots = k.dots([], { radius: 0.04, color: 'alg', max: 400 });

  // momentum, its axis and the boost path through it
  const pSphere = k.sphere({ radius: 0.085, color: 'hi', position: [0, 0, 1] });
  const pArrow = k.arrow([0, 0, 0], [0, 0, 1], { color: 'hi', radius: 0.014, headLength: 0.12, headRadius: 0.04 });
  const axisLine = k.line([], { color: 'ink2', width: 1.2, dashed: true, dashSize: 0.08, gapSize: 0.07, opacity: 0.9 });
  const boostPath = k.line([], { color: 'grp', width: 2.2, opacity: 0.95 });
  const pLabel = k.label('p', [0, 0, 1], { color: 'hi' });
  const typeLabel = k.label('', [0, 0, 0], { small: true, color: 'grp', html: true });

  const inBox = (q3) => Math.abs(q3[2]) <= EMAX + 0.02 && Math.hypot(q3[0], q3[1]) <= PMAX;
  let families = [];
  let frame = mat.eye(3);
  function rebuildFlow() {
    frame = M.orbitFrame(S.chi, S.phi);
    families = M.littleFlowFamilies(S.type, S.m);
    const arr = [];
    for (const fam of families) {
      const n = fam.closed ? 120 : 160;
      let prev = null;
      let prevIn = false;
      for (let i = 0; i <= n; i++) {
        const t = fam.tau[0] + ((fam.tau[1] - fam.tau[0]) * i) / n;
        const q3 = to3(mat.mulv(frame, fam.f(t)));
        const ok = inBox(q3);
        if (prev && ok && prevIn) arr.push(...prev, ...q3);
        prev = q3;
        prevIn = ok;
      }
    }
    const old = flowLines.geometry;
    const g = new LineSegmentsGeometry();
    if (arr.length) g.setPositions(arr);
    flowLines.geometry = g;
    old.dispose();
    flowLines.visible = S.flow && arr.length > 0;
  }
  let flowT = 0;
  function placeDots() {
    if (!S.flow) {
      dots.setPoints([]);
      return;
    }
    const pts = [];
    for (const fam of families) {
      const [t0, t1] = fam.tau;
      const span = t1 - t0;
      for (let j = 0; j < DOTS_PER_CURVE; j++) {
        let t;
        if (fam.line) {
          // the two null rulings through ±p: points approach (sgnY = +1) or leave (sgnY = −1) the fixed point
          // display speed normalised (the true rate μ only rescales time)
          const period = Math.log(40);
          const s = (((flowT * 0.55 + (j / DOTS_PER_CURVE) * period) % period) + period) % period;
          const mag = fam.sgnY > 0 ? 3.2 * Math.exp(-s) : 0.08 * Math.exp(s);
          t = (j % 2 ? 1 : -1) * mag;
        } else {
          const speed = fam.closed ? 0.55 : 0.45;
          const raw = (j / DOTS_PER_CURVE) * span + fam.dir * speed * flowT;
          t = t0 + ((((raw % span) + span) % span) || 0);
        }
        const q3 = to3(mat.mulv(frame, fam.f(t)));
        if (inBox(q3)) pts.push(q3);
      }
    }
    dots.setPoints(pts.slice(0, 400));
  }

  function rebuildSurface() {
    surf.update(surfF);
    const top = [];
    const bot = [];
    for (let i = 0; i <= 120; i++) {
      top.push(surfF(1, i / 120));
      bot.push(surfF(0, i / 120));
    }
    rimTop.setPoints(top);
    rimBot.setPoints(S.type === 'tachyonic' ? bot : []);
    buildRefs();
  }

  function placeMomentum() {
    const p = momentum();
    const q3 = to3(p);
    pSphere.position.set(...q3);
    pArrow.set([0, 0, 0], q3);
    pLabel.setPosition([q3[0] * 1.06 + 0.1, q3[1] * 1.06, q3[2] + 0.18]);
    // rest-frame axis (massive) / null ray (massless) / spacelike line (tachyonic) through the origin and p
    const n = Math.hypot(...q3) || 1;
    const ext = Math.min(EMAX / Math.max(Math.abs(q3[2]) / n, 1e-3), PMAX / Math.max(Math.hypot(q3[0], q3[1]) / n, 1e-3));
    axisLine.setPoints([[0, 0, 0], q3.map((x) => (x / n) * ext)]);
    // boosts along the direction of motion: the curve χ ↦ Λ(χ, φ) p_ref through p
    const [a, b] = chiRange();
    const bp = [];
    for (let i = 0; i <= 80; i++) {
      const c = a + ((b - a) * i) / 80;
      const q = to3(M.orbitMomentum(S.type, S.m, c, S.phi));
      if (inBox(q)) bp.push(q);
    }
    if (S.type === 'massive') {
      // continue through the rest point to negative χ (= direction φ + π)
      const back = [];
      for (let i = 80; i >= 1; i--) {
        const c = a + ((b - a) * i) / 80;
        const q = to3(M.orbitMomentum(S.type, S.m, c, S.phi + Math.PI));
        if (inBox(q)) back.push(q);
      }
      boostPath.setPoints([...back, ...bp]);
    } else boostPath.setPoints(bp);
    const tl = S.type === 'massless' ? [-1.7, 0.4, 1.75] : S.type === 'tachyonic' ? [-S.m * 1.35, -S.m * 0.7, -1.35] : [-S.m * 1.2, 0.6, Math.sqrt(S.m * S.m + 1.85)];
    typeLabel.setPosition(tl);
    typeLabel.setText(S.type === 'massive' ? '$m^2>0$' : S.type === 'massless' ? '$m=0$' : '$m^2<0$');
  }

  k.draggable(pSphere, {
    constrain: (ray) => {
      const o = [ray.origin.x, ray.origin.y, ray.origin.z];
      const d = [ray.direction.x, ray.direction.y, ray.direction.z];
      const t = M.rayHitOrbit(o, d, m2(), S.type === 'tachyonic' ? 0 : 1);
      if (t === null) return null;
      return [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
    },
    onDrag: (q3) => {
      const q = [q3[2], q3[0], q3[1]];
      const pr = M.orbitParams(S.type, S.m, q, S.phi);
      if (!Number.isFinite(pr.chi) || !Number.isFinite(pr.phi)) return;
      S.chi = pr.chi;
      S.phi = Math.atan2(Math.sin(pr.phi), Math.cos(pr.phi));
      clampChi();
      syncSliders();
      update(false);
    },
  });

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Orbit');
  const segT = ui.segmented(sec, {
    label: 'Kind of momentum',
    options: [
      { value: 'massive', label: 'Massive' },
      { value: 'massless', label: 'Massless' },
      { value: 'tachyonic', label: 'Tachyonic' },
    ],
    value: S.type,
    onChange: (t) => {
      S.type = t;
      clampChi();
      syncSliders();
      update(true);
    },
  });
  const sM = ui.slider(sec, {
    label: 'Mass scale $|m|=\\sqrt{|p^2|}$',
    min: 0.2,
    max: 1.5,
    step: 0.01,
    value: S.m,
    format: (x) => fmt(x, 2),
    onInput: (x) => {
      S.m = x;
      clampChi();
      syncSliders();
      update(true);
    },
  });
  const sC = ui.slider(sec, {
    label: 'Boost rapidity $\\chi$',
    min: chiRange()[0],
    max: chiRange()[1],
    step: 0.01,
    value: S.chi,
    format: (x) => fmt(x, 2),
    onInput: (x) => {
      S.chi = x;
      update(false);
    },
  });
  const sP = ui.slider(sec, {
    label: 'Direction $\\varphi$ of $\\vec p$',
    min: -180,
    max: 180,
    step: 1,
    value: Math.round((S.phi * 180) / Math.PI),
    format: (x) => `${fmt(x, 0)}°`,
    onInput: (x) => {
      S.phi = (x * Math.PI) / 180;
      update(false);
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  sec.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(row, {
    label: 'Reference momentum',
    title: 'χ = 0: rest frame (massive), unit energy (massless), zero energy (tachyonic)',
    onClick: () => {
      S.chi = 0;
      clampChi();
      syncSliders();
      update(false);
    },
  });
  ui.toggle(sec, { label: 'Little-group flow $e^{s\\alg{W_p}}$', value: S.flow, onChange: (x) => ((S.flow = x), update(false)) });
  ui.toggle(sec, { label: 'Other kinds of orbit (faint)', value: S.all, onChange: (x) => ((S.all = x), refLines && (refLines.visible = x)) });

  const secR = pg.section('Readout');
  const badges = ui.h('div', { class: 'lz-badges' });
  secR.appendChild(badges);
  const bType = ui.badge(badges, '', 'grp');
  const bKind = ui.badge(badges, '', 'alg');
  const kv = ui.keyValue(secR, [
    ['$p^\\mu=(E,p_x,p_y)$', ''],
    ['$p^2=E^2-|\\vec p|^2$', ''],
  ]);
  const rW = ui.readout(secR, { label: 'Generator of the little group, $\\alg{W_p}\\,p=0$' });
  const subNote = ui.note(secR, '');

  const secC = pg.section('Wigner’s classification (3+1 D)');
  const table = ui.h('table', { class: 'lz-class' });
  table.innerHTML = `<thead><tr><th>orbit</th><th>little group</th><th>one-particle states</th></tr></thead>`;
  const tb = ui.h('tbody');
  const ROWS = [
    ['massive', '$p^2=m^2>0$', '$SO(3)$, cover $SU(2)$', 'spin $s$: $2s+1$ states'],
    ['massless', '$p^2=0$, $p\\neq0$', '$ISO(2)$', 'helicity $\\pm h$: 2 states'],
    ['tachyonic', '$p^2<0$', '$SO(1,2)$', 'no finite unitary multiplets'],
    ['vacuum', '$p=0$', '$SO^+(1,3)$', 'the vacuum'],
  ];
  const trs = {};
  for (const [id, a, b, c] of ROWS) {
    const tr = ui.h('tr', {}, ui.h('td', { html: a }), ui.h('td', { html: b }), ui.h('td', { html: c }));
    trs[id] = tr;
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  secC.appendChild(table);
  ui.legend(secC, [
    { color: 'grp', label: 'orbit $p^2=$ const, boost path' },
    { color: 'alg', label: 'little-group flow' },
    { color: 'hi', label: 'momentum $p$', dot: true },
    { color: 'muted', label: 'light cone, other orbits' },
  ]);

  const setOrbit = (type, m, chi, phi) => {
    S.type = type;
    S.m = m;
    S.chi = chi;
    if (phi !== undefined) S.phi = phi;
    clampChi();
    segT.set(type, { silent: true });
    syncSliders();
    if (!play.playing) play.set(true);
    update(true);
  };
  ui.experiments(pg.section('Try this'), [
    {
      title: 'At rest: rotations',
      text: 'For $p=(m,0,0)$ the little group is the rotation group about the energy axis — orange circles round $p$. In 3+1 D it is $SO(3)$: its (projective) irreps are the spins $s=0,\\tfrac12,1,\\dots$ with $2s+1$ states.',
      apply: () => setOrbit('massive', 1, 0, 0.5),
    },
    {
      title: 'A moving particle',
      text: 'Boosted, the stabiliser is the conjugate $\\Lambda_p\\,SO(2)\\,\\Lambda_p^{-1}$: the circles become tilted ellipses round $p$. The Thomas–Wigner rotation of the second tab is an element of exactly this group.',
      apply: () => setOrbit('massive', 1, 1.1, 0.5),
    },
    {
      title: 'Towards the light cone',
      text: 'A light particle at high energy: the hyperboloid hugs the cone and the ellipses stretch into parabolas. As $m\\to0$ the rotations contract to null rotations — $SO(3)\\to ISO(2)$ (Inönü–Wigner).',
      apply: () => setOrbit('massive', 0.25, 2.1, 0.5),
    },
    {
      title: 'Massless: null rotations',
      text: 'No rest frame. $W_p$ is nilpotent ($W_p^3=0$) and the flow runs along parabolas $q\\cdot p=$ const. In 3+1 D the little group is $ISO(2)$; only its rotation about $\\vec p$ acts on physical states, so a photon has two helicities, not three polarisations.',
      apply: () => setOrbit('massless', 1, 0.3, 0.5),
    },
    {
      title: 'Tachyon: a saddle',
      text: 'A spacelike momentum is fixed by boosts perpendicular to it: $p$ is a saddle point of a hyperbolic flow whose separatrices are the two light-like lines through $p$ on the one-sheeted hyperboloid.',
      apply: () => setOrbit('tachyonic', 1, 0.4, 0.5),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Momentum space of a particle in 2+1 dimensions, energy up. Lorentz transformations preserve
    $p^2=E^2-|\\vec p|^2$, so the orbit of a momentum is a mass shell: the upper sheet of $E^2-|\\vec p|^2=m^2$ for
    $m^2>0$, the forward light cone for $m=0$, the one-sheeted hyperboloid for $m^2<0$ (tachyons), or the origin (the vacuum).
    Drag $p$: it can only slide along its orbit; the violet curve is the path traced by boosts along $\\vec p$.</p>
    <p>The orange curves are the <strong>little group</strong> of $p$ — the Lorentz transformations fixing $p$ — drawn as the flow
    of its generator $\\alg{W_p}$ on the orbit. They are the level sets of $q\\cdot p$: circles round $p$ (elliptic), parabolas
    (parabolic) or hyperbolas with $p$ a saddle (hyperbolic).</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>A particle is “everything one observer can say
    about it”: the momentum changes from frame to frame, the orbit does not — that is the mass. What is left once $p$ is
    fixed is the little group, and the way states transform under it is the spin.</div>`);
  pg.note(`<h2>Wigner’s classification</h2>
    <p>Unitary irreducible representations of the Poincaré group — elementary particles — are labelled by an orbit and an
    irreducible representation of its little group (Wigner 1939). The Casimirs are $p^2=m^2$ and $W^2$, with the
    Pauli–Lubanski vector $W^\\mu=\\tfrac12\\epsilon^{\\mu\\nu\\rho\\sigma}J_{\\nu\\rho}p_\\sigma$ ($W^2=-m^2s(s+1)$ for massive particles).</p>
    <ul>
      <li><strong>$m^2>0$:</strong> go to the rest frame; the little group is $SO(3)$ (on states, $SU(2)$). Spin $s$ gives $2s+1$
      states — 2 for the electron, 3 for the $W$ and $Z$.</li>
      <li><strong>$m=0$:</strong> for $p=(E,0,0,E)$ the stabiliser is $ISO(2)$: rotations about $\\vec p$ and two commuting null
      rotations. Unless the latter act trivially (no “continuous-spin” particles are seen), states carry only a helicity $h$, with
      $\\pm h$ paired by CPT and parity. On a photon polarisation the null rotations act as $\\epsilon^\\mu\\to\\epsilon^\\mu+\\alpha k^\\mu$ —
      gauge transformations — which is why the photon has 2 polarisations, not 3. The graviton has $h=\\pm2$.</li>
      <li><strong>$m^2<0$:</strong> little group $SO(1,2)$, non-compact; no finite unitary multiplets, and a tachyonic mass in field
      theory signals an unstable vacuum rather than a particle.</li>
    </ul>`);
  pg.note(`<h2>Orbits are adjoint orbits</h2>
    <p>In 2+1 D the map $p\\mapsto \\alg{W_p}=E\\,L+p_y B_x-p_x B_y$ identifies momentum space with the Lie algebra $\\so(2,1)$, and it
    is equivariant: $\\Lambda W_p\\Lambda^{-1}=W_{\\Lambda p}$. So Lorentz orbits of momenta are adjoint orbits of $\\so(2,1)\\cong\\sl(2,\\R)$,
    with $p^2$ playing the role of the Killing form. Moreover $W_p\\,p=0$ and $W_p^3=-m^2W_p$: the eigenvalues of $W_p$ are
    $0,\\pm im$ (elliptic), $0,0,0$ (parabolic) or $0,\\pm\\mu$ (hyperbolic).</p>
    <p>This is the same trichotomy as for quadratic Hamiltonians in <a href="#/sp2">Sp(2,ℝ)</a> — oscillator, free particle,
    inverted oscillator — and as for elements of $SL(2,\\R)$ by $|\\tr|<2$, $=2$, $>2$. In the massless limit $m\\to0$ at fixed
    energy the circles round $p$ degenerate into parabolas: the Inönü–Wigner contraction $SO(3)\\to ISO(2)$ of the spin group into
    the helicity group.</p>
    <p>Related: <a href="#/reps">spin multiplets</a>, <a href="#/su2">SU(2)</a>, <a href="#/so3">SO(3)</a>.</p>`);

  // ------------------------------------------------------------------ dynamics
  const readouts = throttled(scope, () => {
    const p = momentum();
    const W = M.littleGenerator(p);
    const info = TYPE_INFO[S.type];
    bType.set(S.type === 'massive' ? 'massive' : S.type === 'massless' ? 'massless' : 'tachyonic', 'grp');
    bKind.set(info.badge, 'alg');
    kv.set('$p^\\mu=(E,p_x,p_y)$', `(${fmt(p[0], 2)}, ${fmt(p[1], 2)}, ${fmt(p[2], 2)})`);
    kv.set('$p^2=E^2-|\\vec p|^2$', fmt(M.mdot3(p, p), 3));
    const ev = S.type === 'massive' ? `0,\\ \\pm ${texNum(S.m, 2)}\\,i` : S.type === 'massless' ? '0,0,0\\ \\ (W_p^3=0)' : `0,\\ \\pm ${texNum(S.m, 2)}`;
    rW.set(`\\alg{W_p}=${texMatrix(W, 2)},\\quad \\text{eigenvalues } ${ev}`);
    subNote.innerHTML = ui.h('span', { html: `Little group of $p$ in 2+1 D: ${info.sub}.` }).innerHTML;
    for (const [id, tr] of Object.entries(trs)) tr.classList.toggle('on', id === S.type);
  });

  function syncSliders() {
    const [a, b] = chiRange();
    sC.setRange(a, b, 0.01);
    sC.set(S.chi, { silent: true });
    sM.set(S.m, { silent: true });
    sM.disable(S.type === 'massless');
    sP.set(Math.round((S.phi * 180) / Math.PI), { silent: true });
  }
  function update(orbitChanged) {
    if (orbitChanged) rebuildSurface();
    rebuildFlow();
    placeDots();
    placeMomentum();
    readouts.request();
  }
  scope.frame((dt) => {
    if (!play.playing || !S.flow) return;
    flowT += dt;
    placeDots();
  });
  syncSliders();
  update(true);
}
