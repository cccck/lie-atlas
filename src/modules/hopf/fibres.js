// Tab "Fibres": base Bloch sphere (points coloured by position) · their fibres e^{iχ}s(n) in R^3 via the
// stereographic projection (a,b,c)/(1−d) · the two components α, β turning together under a global phase.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { fmt, texNum, texComplex } from '../../core/format.js';
import { inlineTex } from '../../core/tex.js';
import * as M from './math.js';

const PI = Math.PI;
const TAU = M.TAU;
const DEG = PI / 180;
const R_CLIP = 14;
const NU = 96; // torus surface: rows along the base circle
const NV = 48; // columns along the fibre

const PRESETS = [
  { value: 'one', label: 'One point' },
  { value: 'two', label: 'Two points (linked pair)' },
  { value: 'latitude', label: 'Latitude circle (torus)' },
  { value: 'nested', label: 'Several latitudes (nested tori)' },
  { value: 'great', label: 'Great circle' },
  { value: 'spiral', label: 'Spiral' },
];

export function mountFibres(pg, scope, ctx, S) {
  // ------------------------------------------------------------------ state (persists across remounts)
  S.preset ??= 'nested';
  S.theta0 ??= 60 * DEG;
  S.phi0 ??= 0;
  S.count ??= 12;
  S.nLat ??= 3;
  S.nestOff ??= 0;
  S.p1 ??= [55 * DEG, 25 * DEG];
  S.p2 ??= [118 * DEG, 215 * DEG];
  S.gcPole ??= M.sph(58 * DEG, -35 * DEG);
  S.turns ??= 2;
  S.spiralPhase ??= 0;
  S.beads ??= true;
  S.tori ??= true;
  S.anim ??= 'phase';
  S.playing ??= true;
  S.chi ??= 0;
  S.tau ??= 0;
  S.dir ??= 1;

  const pal = ctx.colors;
  const LR = ctx.isDark ? [0.42, 0.76] : [0.3, 0.58];
  const colCSS = (theta, phi) => {
    const h = (M.mod(phi, TAU) / TAU) * 360;
    const l = LR[0] + ((LR[1] - LR[0]) * (1 + Math.cos(theta))) / 2;
    return `hsl(${h.toFixed(1)}, 76%, ${(100 * l).toFixed(1)}%)`;
  };

  // ------------------------------------------------------------------ views
  const v1 = pg.view({ title: 'Base: Bloch sphere $S^2=S^3/U(1)$', hint: 'drag the points · drag to orbit', height: 'var(--hopf-sm)' });
  const v2 = pg.view({
    title: 'Fibres in $\\grp{S^3}$, projected: $(a,b,c)/(1-d)$',
    hint: 'drag to orbit · scroll to zoom',
    height: 'var(--view-h)',
  });
  v2.el.classList.add('hopf-tall');
  const v3 = pg.view({ title: 'Components of $\\grp{e^{i\\chi}}\\psi$', height: 'var(--hopf-sm)' });

  // ---- base sphere
  const kb = scene3d(v1.body, scope, { camera: [2.95, -2.55, 1.75], pan: false, minDistance: 2.6, maxDistance: 9 });
  kb.sphere({ radius: 0.985, color: 'muted', opacity: 0.1, segments: 48 });
  kb.wireSphere({ opacity: 0.2, lat: 6, lon: 12 });
  kb.line(
    [
      [0, 0, -1.22],
      [0, 0, 1.22],
    ],
    { color: 'muted', width: 1, opacity: 0.7 },
  );
  kb.line(
    [
      [0, 0, 0],
      [1.2, 0, 0],
    ],
    { color: 'x', width: 1.2, opacity: 0.7 },
  );
  kb.line(
    [
      [0, 0, 0],
      [0, 1.2, 0],
    ],
    { color: 'y', width: 1.2, opacity: 0.7 },
  );
  kb.label('\\ket{\\uparrow}', [0, 0, 1.34], { small: true });
  kb.label('\\ket{\\downarrow}', [0, 0, -1.36], { small: true });
  kb.label('x', [1.32, 0, 0], { small: true, color: 'x' });
  kb.label('y', [0, 1.32, 0], { small: true, color: 'y' });
  const baseDots = kb.dots([], { radius: 0.036, color: '#ffffff', max: 160 });
  const baseCurves = [kb.line([], { color: 'ink2', width: 1.4, opacity: 0.8 })];
  const handles = [0, 1].map(() => kb.sphere({ radius: 0.07, color: '#ffffff', segments: 24 }));
  const probeRing = kb.line([], { color: 'ink', width: 1.8 });
  const poleHandle = kb.sphere({ radius: 0.06, color: 'hi', segments: 24 });
  const poleAxis = kb.line([], { color: 'hi', width: 1.4, dashed: true, dashSize: 0.05, gapSize: 0.04 });
  const lineMark = kb.line([], { color: 'muted', width: 1.6 }); // base point of the straight-line fibre

  handles.forEach((hm, i) =>
    kb.draggable(hm, {
      constrain: kb.onSphere([0, 0, 0], 1),
      onDrag: (q) => {
        const { theta, phi } = M.angles(q);
        if (S.preset === 'latitude') {
          S.theta0 = M.clamp(theta, 3 * DEG, 165 * DEG);
          S.phi0 = phi;
          sTheta.set(S.theta0, { silent: true });
        } else if (i === 0) S.p1 = [theta, phi];
        else S.p2 = [theta, phi];
        geomDirty = true;
      },
    }),
  );
  kb.draggable(poleHandle, {
    constrain: kb.onSphere([0, 0, 0], 1),
    onDrag: (q) => {
      S.gcPole = M.normalize3(q);
      geomDirty = true;
    },
  });

  // ---- fibres in R^3
  const kf = scene3d(v2.body, scope, { camera: [7.9, -6.7, 5.3], minDistance: 2.5, maxDistance: 70 });
  const fibreLines = [];
  const surfaces = [];
  const beadDots = kf.dots([], { radius: 0.06, color: '#ffffff', max: 200 });
  const probeBead = kf.sphere({ radius: 0.085, color: 'ink', segments: 24 });
  const tmpColor = new THREE.Color();

  function fibreLine(i) {
    while (fibreLines.length <= i) fibreLines.push(kf.line([], { color: 'grp', width: 2.2 }));
    return fibreLines[i];
  }
  function torusSurface(i) {
    while (surfaces.length <= i) {
      const holder = { rows: [], cols: [], tau: 0, rmax: 0 };
      const mesh = kf.surface(
        (u, v) => {
          const r = holder.rows[Math.round(u * NU)];
          if (!r) return [0, 0, 0];
          const p = M.project(M.withPhase(r, TAU * v), holder.tau);
          const rr = Math.hypot(p[0], p[1], p[2]);
          if (!(rr <= holder.rmaxSeen)) holder.rmaxSeen = Number.isFinite(rr) ? Math.max(holder.rmaxSeen || 0, rr) : Infinity;
          return p;
        },
        [0, 1],
        [0, 1],
        NU,
        NV,
        {
          color: '#ffffff',
          opacity: 0.15,
          colorFn: (u) => holder.cols[Math.round(u * NU)] || tmpColor,
          roughness: 0.7,
        },
      );
      mesh.renderOrder = -1;
      surfaces.push({ mesh, holder });
    }
    return surfaces[i];
  }

  // ---- components α, β (2D)
  const CA = [-1.2, 0];
  const CB = [1.2, 0];
  const comp = plot2d(v3.body, scope, {
    x: [-2.45, 2.45],
    y: [-1.55, 1.3],
    grid: false,
    axes: false,
    pan: false,
    zoom: false,
    draw: drawComponents,
  });

  // ------------------------------------------------------------------ panel
  const secB = pg.section('Points on the Bloch sphere');
  const selPreset = ui.select(secB, {
    label: 'Preset',
    options: PRESETS,
    value: S.preset,
    onChange: (v) => {
      S.preset = v;
      exps.clear();
      showControls();
      geomDirty = true;
    },
  });
  const sTheta = ui.slider(secB, {
    label: 'Latitude: polar angle $\\theta_0$',
    min: 3 * DEG,
    max: 165 * DEG,
    step: 0.005,
    value: S.theta0,
    format: (v) => fmt(v / DEG, 0) + '°',
    onInput: (v) => {
      S.theta0 = v;
      geomDirty = true;
    },
  });
  const sLat = ui.slider(secB, {
    label: 'Number of latitudes',
    min: 2,
    max: 5,
    step: 1,
    value: S.nLat,
    format: (v) => String(v),
    onInput: (v) => {
      S.nLat = Math.round(v);
      geomDirty = true;
    },
  });
  const sCount = ui.slider(secB, {
    label: 'Fibres per circle',
    min: 4,
    max: 32,
    step: 1,
    value: S.count,
    format: (v) => String(v),
    onInput: (v) => {
      S.count = Math.round(v);
      geomDirty = true;
    },
  });
  const sTurns = ui.slider(secB, {
    label: 'Spiral turns',
    min: 1,
    max: 4,
    step: 0.5,
    value: S.turns,
    format: (v) => fmt(v, 1),
    onInput: (v) => {
      S.turns = v;
      geomDirty = true;
    },
  });
  const presetNote = ui.note(secB, '');

  const secA = pg.section('Display & animation');
  ui.toggle(secA, {
    label: 'Phase beads $\\grp{e^{i\\chi}}$ on each fibre',
    value: S.beads,
    onChange: (v) => {
      S.beads = v;
    },
  });
  ui.toggle(secA, {
    label: 'Tori swept by circles of fibres',
    value: S.tori,
    onChange: (v) => {
      S.tori = v;
      geomDirty = true;
    },
  });
  const segAnim = ui.segmented(secA, {
    label: 'Animate',
    options: [
      { value: 'phase', label: 'Phase $\\chi$' },
      { value: 'sweep', label: 'Sweep' },
      { value: 'proj', label: 'Projection point' },
    ],
    value: S.anim,
    onChange: (v) => {
      S.anim = v;
      if (!play.playing) play.set(true);
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  secA.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(row, {
    label: 'Reset view',
    onClick: () => {
      sTau.set(0);
      S.chi = 0;
      kf.setCamera([7.9, -6.7, 5.3], [0, 0, 0]);
      kb.setCamera([2.95, -2.55, 1.75], [0, 0, 0]);
    },
  });
  const sTau = ui.slider(secA, {
    label: 'Projection point: rotate $S^3$ in the $(a,d)$-plane by $\\tau$',
    min: 0,
    max: TAU,
    step: 0.005,
    value: S.tau,
    format: (v) => fmt(v / DEG, 0) + '°',
    onInput: (v) => {
      S.tau = v;
      geomDirty = true;
    },
  });

  const secR = pg.section('Highlighted fibre');
  const out = ui.readout(secR, { label: 'A state on the fibre and its Bloch vector' });
  const kv = ui.keyValue(secR, [
    ['base point $(\\theta,\\varphi)$', ''],
    ['global phase $\\chi$ (invisible)', ''],
    ['fibres shown', ''],
    ['linking number of any two', '$1$'],
  ]);
  ui.legend(secR, [
    { color: 'hsl(20, 76%, 60%)', label: 'fibre colour = base point: hue $\\varphi$, light = north' },
    { color: 'ink', label: 'highlighted fibre and its bead', dot: true },
    { color: 'ink2', label: 'base curve on $S^2$' },
    { color: 'hi', label: 'pole of the great circle (drag it)', dot: true },
    { color: 'muted', label: 'ring: fibre through the projection point → straight line' },
  ]);

  const exps = ui.experiments(pg.section('Try this'), [
    {
      title: 'Two fibres are linked',
      text: 'Any two points of the Bloch sphere give two round circles that pass through each other exactly once. Drag them anywhere — they never unlink. That linking number $1$ is the <b>Hopf invariant</b>, the generator of $\\pi_3(S^2)=\\Z$.',
      apply: () => {
        S.preset = 'two';
        S.p1 = [55 * DEG, 25 * DEG];
        S.p2 = [118 * DEG, 215 * DEG];
        setAnim('phase');
        sTau.set(0, { silent: true });
        S.tau = 0;
        refreshPreset();
      },
    },
    {
      title: 'A latitude sweeps a torus',
      text: 'The fibres over a circle of latitude fill a torus, and each fibre winds once round it each way, so neighbours link. Watch the sweep: as $\\theta_0\\to0$ the torus shrinks onto the circle over $\\ket\\uparrow$; as $\\theta_0\\to\\pi$ it swells towards the $z$-axis, the fibre over $\\ket\\downarrow$.',
      apply: () => {
        S.preset = 'latitude';
        S.theta0 = 60 * DEG;
        S.phi0 = 0;
        S.tau = 0;
        sTau.set(0, { silent: true });
        sTheta.set(S.theta0, { silent: true });
        if (!S.tori) S.tori = true;
        setAnim('sweep');
        refreshPreset();
      },
    },
    {
      title: 'Equator → Clifford torus',
      text: 'On the equator $|\\alpha|=|\\beta|=1/\\sqrt2$: equal odds for up and down, all relative phases. In $S^3$ this is the flat <b>Clifford torus</b>, which cuts $S^3$ into two congruent solid tori around the fibres of $\\ket\\uparrow$ and $\\ket\\downarrow$. Projected: core radius $\\sqrt2$, tube radius $1$.',
      apply: () => {
        S.preset = 'latitude';
        S.theta0 = 90 * DEG;
        S.phi0 = 0;
        S.tau = 0;
        sTau.set(0, { silent: true });
        sTheta.set(S.theta0, { silent: true });
        setAnim('phase');
        refreshPreset();
      },
    },
    {
      title: 'The pole fibre is a straight line',
      text: 'The fibre over $\\ket\\downarrow$ is $(0,e^{i\\chi})$ and contains the projection point $(0,0,0,1)$, so it is drawn as the whole $z$-axis — a circle through $\\infty$. The fibre over $\\ket\\uparrow$, $(e^{i\\chi},0)$, is the unit circle threaded by it.',
      apply: () => {
        S.preset = 'two';
        S.p1 = [0, 0];
        S.p2 = [PI, 4.2];
        S.tau = 0;
        sTau.set(0, { silent: true });
        setAnim('phase');
        refreshPreset();
      },
    },
    {
      title: 'Move the projection point',
      text: 'Rotating $S^3$ before projecting changes the viewpoint, not the physics. The circles flow; whichever passes through the projection point blows up into a straight line for an instant (the ring on the Bloch sphere marks its base point), yet no two fibres ever unlink.',
      apply: () => {
        S.preset = 'nested';
        S.nestOff = 0;
        setAnim('proj');
        refreshPreset();
      },
    },
  ]);

  function setAnim(a) {
    S.anim = a;
    segAnim.set(a, { silent: true });
    play.set(true);
  }
  function refreshPreset() {
    selPreset.set(S.preset, { silent: true });
    showControls();
    geomDirty = true;
  }

  function showControls() {
    const p = S.preset;
    sTheta.el.style.display = p === 'latitude' ? '' : 'none';
    sLat.el.style.display = p === 'nested' ? '' : 'none';
    sCount.el.style.display = p === 'latitude' || p === 'nested' || p === 'great' || p === 'spiral' ? '' : 'none';
    sTurns.el.style.display = p === 'spiral' ? '' : 'none';
    const notes = {
      one: 'Drag the point on the Bloch sphere: its whole fibre — a circle of states differing only by a global phase — moves with it.',
      two: 'Drag either point. Two distinct base points always give two linked circles.',
      latitude: 'Drag the outlined point to change the latitude and starting longitude.',
      nested: 'Latitudes spread over the sphere; each sweeps its own torus, all nested around the circle over $\\ket\\uparrow$.',
      great: 'Drag the highlighted pole to tilt the great circle. Its preimage is again a Clifford torus, seen from another angle.',
      spiral: 'Points along a spiral from near $\\ket\\uparrow$ towards $\\ket\\downarrow$: a family of mutually linked circles.',
    };
    presetNote.innerHTML = inlineTex(notes[p] || '');
  }

  // ------------------------------------------------------------------ the family of base points
  let fam = null;
  let geomDirty = true;

  function pt(theta, phi, psi) {
    return { theta, phi, n: M.sph(theta, phi), psi: psi || M.section(theta, phi), col: colCSS(theta, phi) };
  }
  function latitudeRows(theta, phi0) {
    const rows = [];
    for (let i = 0; i <= NU; i++) rows.push(M.section(theta, phi0 + (TAU * i) / NU));
    return rows;
  }
  function rowColours(nAt) {
    const cols = [];
    for (let i = 0; i <= NU; i++) {
      const { theta, phi } = M.angles(nAt(i / NU));
      cols.push(new THREE.Color(colCSS(theta, phi)));
    }
    return cols;
  }
  function circlePts(nAt, m = 128) {
    const pts = [];
    for (let i = 0; i <= m; i++) pts.push(nAt(i / m).map((x) => x * 1.004));
    return pts;
  }

  function buildFamily() {
    const pts = [];
    const curves = [];
    const tori = [];
    const m = S.count;
    const p = S.preset;
    if (p === 'one' || p === 'two') {
      pts.push(pt(S.p1[0], S.p1[1]));
      if (p === 'two') pts.push(pt(S.p2[0], S.p2[1]));
    } else if (p === 'latitude' || p === 'nested') {
      const ths = [];
      if (p === 'latitude') ths.push(S.theta0);
      else for (let i = 0; i < S.nLat; i++) ths.push(M.clamp(((i + 1) * 150 * DEG) / (S.nLat + 1) + S.nestOff, 4 * DEG, 165 * DEG));
      const phi0 = p === 'latitude' ? S.phi0 : 0;
      for (const th of ths) {
        for (let j = 0; j < m; j++) pts.push(pt(th, phi0 + (TAU * j) / m));
        const nAt = (u) => M.sph(th, phi0 + TAU * u);
        curves.push(circlePts(nAt));
        tori.push({ rows: latitudeRows(th, phi0), cols: rowColours(nAt) });
      }
    } else if (p === 'great') {
      const mm = M.normalize3(S.gcPole);
      const t = Math.abs(mm[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      // e1 ⟂ m, e2 = m × e1
      let e1 = [t[0] - mm[0] * (mm[0] * t[0] + mm[1] * t[1] + mm[2] * t[2]), t[1] - mm[1] * (mm[0] * t[0] + mm[1] * t[1] + mm[2] * t[2]), t[2] - mm[2] * (mm[0] * t[0] + mm[1] * t[1] + mm[2] * t[2])];
      e1 = M.normalize3(e1);
      const e2 = [mm[1] * e1[2] - mm[2] * e1[1], mm[2] * e1[0] - mm[0] * e1[2], mm[0] * e1[1] - mm[1] * e1[0]];
      const nAt = (u) => {
        const c = Math.cos(TAU * u);
        const s = Math.sin(TAU * u);
        return [c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]];
      };
      // a continuous closed lift (the section s is singular at the south pole)
      const fine = [];
      const K = NU * 4;
      for (let i = 0; i < K; i++) fine.push(nAt(i / K));
      const lift = M.closedLift(fine);
      const rows = [];
      for (let i = 0; i <= NU; i++) rows.push(lift[(i * 4) % K]);
      for (let j = 0; j < m; j++) {
        const u = j / m;
        const n = nAt(u);
        const { theta, phi } = M.angles(n);
        pts.push(pt(theta, phi, lift[Math.round(u * K) % K]));
      }
      curves.push(circlePts(nAt));
      tori.push({ rows, cols: rowColours(nAt) });
    } else if (p === 'spiral') {
      const tot = 2 * m;
      const th0 = 14 * DEG;
      const th1 = 150 * DEG;
      const at = (s) => [th0 + (th1 - th0) * s, S.spiralPhase + TAU * S.turns * s];
      for (let j = 0; j < tot; j++) {
        const [th, ph] = at(j / (tot - 1));
        pts.push(pt(th, ph));
      }
      const c = [];
      for (let i = 0; i <= 240; i++) {
        const [th, ph] = at(i / 240);
        c.push(M.sph(th, ph).map((x) => x * 1.004));
      }
      curves.push(c);
    }
    return { pts, curves, tori };
  }

  function rebuild() {
    fam = buildFamily();
    const { pts } = fam;
    const tau = S.tau;
    const nF = pts.length;
    // base sphere
    baseDots.setPoints(
      pts.map((q) => q.n.map((x) => x * 1.01)),
      pts.map((q) => q.col),
    );
    while (baseCurves.length < fam.curves.length) baseCurves.push(kb.line([], { color: 'ink2', width: 1.4, opacity: 0.8 }));
    baseCurves.forEach((ln, i) => {
      ln.userData.visible = i < fam.curves.length;
      if (i < fam.curves.length) ln.setPoints(fam.curves[i]);
      else ln.visible = false;
    });
    const free = S.preset === 'one' || S.preset === 'two';
    handles.forEach((hm, i) => {
      const show = (free && i < nF) || (S.preset === 'latitude' && i === 0);
      hm.visible = show;
      if (show) {
        hm.position.set(...pts[i].n.map((x) => x * 1.01));
        hm.material.color.copy(kb.color(pts[i].col));
      }
    });
    const gc = S.preset === 'great';
    poleHandle.visible = gc;
    poleAxis.userData.visible = gc;
    if (gc) {
      const mm = M.normalize3(S.gcPole);
      poleHandle.position.set(...mm.map((x) => x * 1.02));
      poleAxis.setPoints([
        [0, 0, 0],
        mm.map((x) => x * 1.02),
      ]);
    } else poleAxis.visible = false;
    // highlighted (probe) point: ring around it on the base sphere
    ringAt(probeRing, pts[0].n, 0.1);
    ringAt(lineMark, M.poleFibreBase(tau), 0.075);

    // fibres
    const width = nF <= 2 ? 3.4 : nF <= 16 ? 2.6 : 2.0;
    for (let i = 0; i < nF; i++) {
      const q = pts[i];
      const ln = fibreLine(i);
      const { pts: P } = M.sampleClosed((t) => M.project(M.withPhase(q.psi, TAU * t), tau), { n: 128, rClip: R_CLIP, tol: 0.06 });
      ln.userData.visible = true;
      ln.setPoints(P);
      ln.setColor(q.col);
      ln.setWidth(i === 0 ? width + 1.6 : width);
    }
    for (let i = nF; i < fibreLines.length; i++) {
      fibreLines[i].userData.visible = false;
      fibreLines[i].visible = false;
    }
    // tori
    const nT = S.tori ? fam.tori.length : 0;
    for (let i = 0; i < nT; i++) {
      const s = torusSurface(i);
      s.holder.rows = fam.tori[i].rows;
      s.holder.cols = fam.tori[i].cols;
      s.holder.tau = tau;
      s.holder.rmaxSeen = 0;
      s.mesh.update();
      s.mesh.visible = s.holder.rmaxSeen < R_CLIP * 0.85;
    }
    for (let i = nT; i < surfaces.length; i++) surfaces[i].mesh.visible = false;
    kv.set('fibres shown', String(nF));
  }

  function ringAt(line, n, r) {
    const nn = M.normalize3(n);
    const t = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const d = nn[0] * t[0] + nn[1] * t[1] + nn[2] * t[2];
    const u = M.normalize3([t[0] - d * nn[0], t[1] - d * nn[1], t[2] - d * nn[2]]);
    const w = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];
    const P = [];
    for (let i = 0; i <= 48; i++) {
      const a = (TAU * i) / 48;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      P.push([nn[0] * 1.012 + c * u[0] + s * w[0], nn[1] * 1.012 + c * u[1] + s * w[1], nn[2] * 1.012 + c * u[2] + s * w[2]]);
    }
    line.setPoints(P);
  }

  const FAR = [0, 0, 1e4];
  function updateBeads() {
    const pts = fam.pts;
    const P = [];
    const cols = [];
    for (let i = 0; i < pts.length; i++) {
      const b = M.fibrePoint(pts[i].psi, S.chi, S.tau);
      const ok = Number.isFinite(b[0]) && Math.hypot(b[0], b[1], b[2]) < R_CLIP;
      P.push(ok && S.beads && i > 0 ? b : FAR);
      cols.push(pts[i].col);
      if (i === 0) {
        probeBead.visible = ok && S.beads;
        if (ok) probeBead.position.set(b[0], b[1], b[2]);
      }
    }
    beadDots.setPoints(P, cols);
  }

  // ------------------------------------------------------------------ components view
  function drawComponents(p) {
    if (!fam) return;
    const q = fam.pts[0];
    const psi = M.withPhase(q.psi, S.chi);
    const al = [psi[0], psi[1]];
    const be = [psi[2], psi[3]];
    const ink = 'ink';
    for (const [c, lab, key] of [
      [CA, '\\alpha', 'la'],
      [CB, '\\beta', 'lb'],
    ]) {
      p.segment([c[0] - 1.08, c[1]], [c[0] + 1.08, c[1]], { color: 'grid', width: 1 });
      p.segment([c[0], c[1] - 1.08], [c[0], c[1] + 1.08], { color: 'grid', width: 1 });
      p.circle(c, 1, { color: 'muted', width: 1.2, alpha: 0.8 });
      p.tex(lab, [c[0] - 0.92, 0.98], { key, color: 'ink2' });
    }
    // relative phase: the direction of α, copied onto the β plane, and the arc to β
    const aA = Math.atan2(al[1], al[0]);
    const aB = Math.atan2(be[1], be[0]);
    const nb = Math.hypot(be[0], be[1]);
    const na = Math.hypot(al[0], al[1]);
    if (nb > 0.06 && na > 0.06) {
      p.segment(CB, [CB[0] + Math.cos(aA), CB[1] + Math.sin(aA)], { color: 'muted', width: 1.2, dash: [4, 4] });
      const rel = M.mod(aB - aA, TAU);
      const arc = [];
      for (let i = 0; i <= 40; i++) {
        const a = aA + (rel * i) / 40;
        arc.push([CB[0] + 0.34 * Math.cos(a), CB[1] + 0.34 * Math.sin(a)]);
      }
      p.line(arc, { color: 'hi', width: 2 });
      const am = aA + rel / 2;
      p.tex('\\varphi', [CB[0] + 0.52 * Math.cos(am), CB[1] + 0.52 * Math.sin(am)], { key: 'phiLab', color: 'hi', small: true });
    }
    // global phase χ on the α plane: arc from the real axis
    if (na > 0.06) {
      const arc = [];
      const chi = M.mod(aA, TAU);
      for (let i = 0; i <= 40; i++) {
        const a = (chi * i) / 40;
        arc.push([CA[0] + 0.26 * Math.cos(a), CA[1] + 0.26 * Math.sin(a)]);
      }
      p.line(arc, { color: 'grp', width: 2 });
      p.tex('\\chi', [CA[0] + 0.44 * Math.cos(chi / 2), CA[1] + 0.44 * Math.sin(chi / 2)], { key: 'chiLab', color: 'grp', small: true });
    }
    p.arrow(CA, [CA[0] + al[0], CA[1] + al[1]], { color: ink, width: 2.2, head: 9 });
    p.arrow(CB, [CB[0] + be[0], CB[1] + be[1]], { color: ink, width: 2.2, head: 9 });
    p.dot([CA[0] + al[0], CA[1] + al[1]], { r: 4.5, color: q.col });
    p.dot([CB[0] + be[0], CB[1] + be[1]], { r: 4.5, color: q.col });
    p.tex(`|\\alpha|=\\cos\\tfrac{\\theta}{2}=${texNum(na, 2)}`, [CA[0], -1.36], { key: 'ca', small: true });
    p.tex(`|\\beta|=\\sin\\tfrac{\\theta}{2}=${texNum(nb, 2)}`, [CB[0], -1.36], { key: 'cb', small: true });
  }

  // ------------------------------------------------------------------ readouts
  let readT = 1;
  function updateReadout() {
    const q = fam.pts[0];
    const psi = M.withPhase(q.psi, S.chi);
    const h = M.hopf(psi);
    out.set(
      `\\begin{aligned}\\psi&=\\grp{e^{i\\chi}}\\,s(\\hat n)=\\begin{pmatrix}${texComplex({ re: psi[0], im: psi[1] }, 2)}\\\\${texComplex({ re: psi[2], im: psi[3] }, 2)}\\end{pmatrix}\\\\[2pt]` +
        `\\langle\\psi|\\vec\\sigma|\\psi\\rangle&=(${texNum(h[0], 2)},\\ ${texNum(h[1], 2)},\\ ${texNum(h[2], 2)})\\end{aligned}`,
    );
    kv.set('base point $(\\theta,\\varphi)$', `$(${fmt(q.theta / DEG, 0)}^\\circ,\\ ${fmt(M.mod(q.phi, TAU) / DEG, 0)}^\\circ)$`);
    kv.set('global phase $\\chi$ (invisible)', `$${texNum(M.mod(S.chi + phaseOffset(q), TAU), 2)}$`);
  }
  // phase of α in the stored lift (so χ shown = arg α of the highlighted state)
  const phaseOffset = (q) => Math.atan2(q.psi[1], q.psi[0]);

  // ------------------------------------------------------------------ animation loop
  const W_CHI = 0.9; // rad/s
  scope.frame((dt) => {
    if (S.playing) {
      S.chi = M.mod(S.chi + W_CHI * dt, TAU);
      if (S.anim === 'sweep') sweep(dt);
      if (S.anim === 'proj') {
        S.tau = M.mod(S.tau + 0.2 * dt, TAU);
        sTau.set(S.tau, { silent: true });
        geomDirty = true;
      }
    }
    if (geomDirty) {
      geomDirty = false;
      rebuild();
    }
    updateBeads();
    comp.invalidate();
    readT += dt;
    if (readT > 0.1) {
      readT = 0;
      updateReadout();
    }
  });

  function bounce(x, lo, hi, step) {
    let y = x + S.dir * step;
    if (y > hi) {
      y = hi;
      S.dir = -1;
    } else if (y < lo) {
      y = lo;
      S.dir = 1;
    }
    return y;
  }
  function sweep(dt) {
    const w = 16 * DEG * dt;
    const p = S.preset;
    if (p === 'latitude') {
      S.theta0 = bounce(S.theta0, 10 * DEG, 155 * DEG, w);
      sTheta.set(S.theta0, { silent: true });
    } else if (p === 'nested') S.nestOff = bounce(S.nestOff, -24 * DEG, 14 * DEG, 0.5 * w);
    else if (p === 'one' || p === 'two') {
      S.p1 = [bounce(S.p1[0], 8 * DEG, 160 * DEG, w), S.p1[1]];
      if (p === 'two') S.p2 = [M.clamp(PI - S.p1[0], 5 * DEG, 172 * DEG), S.p2[1]];
    } else if (p === 'great') {
      const { theta, phi } = M.angles(S.gcPole);
      S.gcPole = M.sph(theta, phi + 0.35 * dt);
    } else if (p === 'spiral') S.spiralPhase = M.mod(S.spiralPhase + 0.3 * dt, TAU);
    geomDirty = true;
  }

  showControls();
  rebuild();
  updateBeads();
  updateReadout();

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left, the Bloch sphere: each point $\\hat n$ is one physical state of a qubit. Right, the whole circle of
    vectors over each point, $\\grp{\\{e^{i\\chi}s(\\hat n)\\}}$ with $s(\\theta,\\varphi)=(\\cos\\tfrac\\theta2,\\ e^{i\\varphi}\\sin\\tfrac\\theta2)$,
    drawn in $\\R^3$ by stereographic projection of $S^3\\subset\\R^4$:</p>
    $$\\psi=(a+ib,\\ c+id)\\ \\longmapsto\\ \\frac{(a,\\,b,\\,c)}{1-d}.$$
    <p>Great circles of $S^3$ become round circles (or a straight line if they pass through the projection point).
    Fibres share the colour of their base point — hue for longitude $\\varphi$, lightness for latitude — and the beads
    mark the same global phase $\\chi$ on every fibre. Below left: the two components of the highlighted state turn
    <i>together</i> as $\\chi$ runs; only their length ratio and relative angle $\\varphi$ matter.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Moving along a fibre changes the state vector but
    not the state. Moving across fibres changes the physics. The Hopf fibration is the precise statement of
    “a quantum state is a vector up to phase”.</div>`);
  pg.note(`<h2>The physics</h2>
    <p>The Hopf map <i>is</i> an expectation value — the Bloch vector:</p>
    $$h(\\psi)=\\langle\\psi|\\vec\\sigma|\\psi\\rangle=\\big(2\\,\\mathrm{Re}\\,\\bar\\alpha\\beta,\\ 2\\,\\mathrm{Im}\\,\\bar\\alpha\\beta,\\ |\\alpha|^2-|\\beta|^2\\big),$$
    <p>invariant under $\\psi\\mapsto\\grp{e^{i\\chi}}\\psi$ because $\\bar\\alpha\\beta$ and $|\\alpha|^2$ are. A <b>global</b> phase is
    unobservable; the <b>relative</b> phase $\\varphi=\\arg\\beta-\\arg\\alpha$ is the longitude, and $|\\beta/\\alpha|=\\tan\\tfrac\\theta2$
    the latitude. So the space of physical states is $\\C P^1=S^3/U(1)\\cong S^2$, and the global phase is the simplest
    example of a gauge redundancy (compare <a href="#/u1">U(1)</a>).</p>
    <div class="callout physics"><span class="callout-title">Why the twist matters</span>Because the fibres are linked, no
    continuous choice of phase $s(\\hat n)$ exists over the whole sphere: our $s$ fails at the south pole, where
    $e^{i\\varphi}$ is undefined. This obstruction is what makes the Berry phase (next tab) and the Dirac monopole
    possible.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>$S^3$ is the group $\\grp{SU(2)}$: $\\psi=(\\alpha,\\beta)\\mapsto U=\\left(\\begin{smallmatrix}\\alpha&-\\bar\\beta\\\\ \\beta&\\bar\\alpha\\end{smallmatrix}\\right)$,
    with $U\\ket\\uparrow=\\psi$. Then $U\\sigma_zU^\\dagger=\\hat n\\cdot\\vec\\sigma$ with $\\hat n=h(\\psi)$, and the fibre is the coset
    $U\\,e^{i\\chi\\sigma_z}$ of the circle subgroup generated by $\\alg{\\sigma_z}$:</p>
    $$S^1\\hookrightarrow S^3=SU(2)\\ \\xrightarrow{\\ h\\ }\\ SU(2)/U(1)=S^2 .$$
    <p>Over a latitude $\\theta$ the fibres fill the torus $|\\alpha|=\\cos\\tfrac\\theta2$, projected as a torus of revolution
    with core radius $1/\\cos\\tfrac\\theta2$ and tube radius $\\tan\\tfrac\\theta2$. The bundle is not a product $S^2\\times S^1$:
    any two fibres have linking number $1$, the Hopf invariant, and $h$ generates $\\pi_3(S^2)=\\Z$ — a map from a
    3-sphere onto a 2-sphere that cannot be shrunk to a point. See also <a href="#/su2">SU(2)</a> for the spinor
    double cover and <a href="#/loops">small loops</a> for holonomy as curvature.</p>`);

  void pal;
}
