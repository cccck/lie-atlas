// Tab "Berry phase": a spin-½ follows a slowly turning field n̂(t) around a loop C on the Bloch sphere.
// The state is parallel-transported (horizontal lift in S^3: Im⟨ψ|dψ⟩ = 0); after one loop it sits on the
// starting fibre again, displaced by the holonomy γ = −Ω/2 (mod 2π).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { fmt, texNum } from '../../core/format.js';
import { inlineTex } from '../../core/tex.js';
import * as M from './math.js';

const PI = Math.PI;
const TAU = M.TAU;
const DEG = PI / 180;
const N_LOOP = 1440;
const LOOP_SECONDS = 9;
const HOLD_SECONDS = 2.4;
const CAM_DIR = M.normalize3([6.2, -5.2, 4.3]);

const KINDS = {
  latitude: { label: 'Polar angle $\\theta_0$ of the loop', min: 5, max: 165, key: 'thLat' },
  triangle: { label: 'Triangle size $\\theta_0$ ($90^\\circ$ = octant)', min: 15, max: 120, key: 'thTri' },
  eight: { label: 'Lobe size of the figure-eight', min: 8, max: 55, key: 'thEight' },
};

export function mountBerry(pg, scope, ctx, S) {
  S.kind ??= 'latitude';
  S.thLat ??= 60 * DEG;
  S.thTri ??= 90 * DEG;
  S.thEight ??= 34 * DEG;
  S.t ??= 0;
  S.playing ??= true;
  S.showSection ??= false;
  S.showTorus ??= true;
  let hold = 0;

  const pal = ctx.colors;

  // ------------------------------------------------------------------ views
  const v1 = pg.view({ title: 'Loop $C$ of the field direction $\\hat n=\\vec B/|\\vec B|$', hint: 'drag to orbit', height: 'var(--hopf-sm)' });
  const v2 = pg.view({
    title: 'Horizontal lift in $\\grp{S^3}$ (stereographic)',
    hint: 'drag to orbit · scroll to zoom',
    height: 'var(--view-h)',
  });
  v2.el.classList.add('hopf-tall');
  const v3 = pg.view({ title: 'Phase dial: $\\chi(t)$ relative to $s(\\hat n)$', height: 'var(--hopf-sm)' });
  const ovl = v2.overlay('bl', 'overlay-card hopf-ovl');

  // ---- base sphere
  const kb = scene3d(v1.body, scope, { camera: [2.95, -2.55, 1.85], pan: false, minDistance: 2.6, maxDistance: 9 });
  kb.sphere({ radius: 0.985, color: 'muted', opacity: 0.1, segments: 48 });
  kb.wireSphere({ opacity: 0.18, lat: 6, lon: 12 });
  kb.line(
    [
      [0, 0, -1.22],
      [0, 0, 1.22],
    ],
    { color: 'muted', width: 1, opacity: 0.7 },
  );
  kb.label('\\ket{\\uparrow}', [0, 0, 1.34], { small: true });
  kb.label('\\ket{\\downarrow}', [0, 0, -1.36], { small: true });
  kb.label('x', [1.3, 0, 0], { small: true, color: 'x' });
  kb.label('y', [0, 1.3, 0], { small: true, color: 'y' });
  const loopLine = kb.line([], { color: 'c1', width: 2.6 });
  const dirArrows = [0, 1].map(() => kb.arrow([0, 0, 0], [0, 0, 0], { color: 'c1', radius: 0.001, headLength: 0.11, headRadius: 0.04 }));
  const fanMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const fan = new THREE.Mesh(new THREE.BufferGeometry(), fanMat);
  kb.add(fan);
  const startDot = kb.sphere({ radius: 0.045, color: 'ink', segments: 20 });
  const fieldArrow = kb.arrow([0, 0, 0], [0, 0, 1], { color: 'ink2', radius: 0.016, headLength: 0.12, headRadius: 0.042 });
  const nowDot = kb.sphere({ radius: 0.055, color: 'grp', segments: 20 });
  const bLabel = kb.label('\\vec B', [0, 0, 1], { small: true, offset: [12, -10] });

  // ---- S^3 view
  const ks = scene3d(v2.body, scope, { camera: CAM_DIR.map((x) => x * 8), minDistance: 1.5, maxDistance: 160, far: 800 });
  const torus = ks.surface((u, v) => M.project(M.withPhase(M.section(S.thLat, TAU * u), TAU * v)), [0, 1], [0, 1], 96, 48, {
    color: 'muted',
    opacity: 0.1,
    roughness: 0.8,
  });
  torus.renderOrder = -1;
  const fibre0 = ks.line([], { color: 'ink2', width: 1.6, opacity: 0.85 });
  const fibreNow = ks.line([], { color: 'muted', width: 1.3, dashed: true, dashSize: 0.1, gapSize: 0.08 });
  const liftFull = ks.line([], { color: 'grp', width: 1.4, opacity: 0.35 });
  const liftNow = ks.line([], { color: 'grp', width: 3.2 });
  const sectionLift = ks.line([], { color: 'c1', width: 1.8, dashed: true, dashSize: 0.12, gapSize: 0.08 });
  const gapArc = ks.line([], { color: 'hi', width: 5 });
  const psi0Dot = ks.sphere({ radius: 0.06, color: 'ink', segments: 20 });
  const psiDot = ks.sphere({ radius: 0.07, color: 'grp', segments: 20 });
  const endDot = ks.sphere({ radius: 0.07, color: 'hi', segments: 20 });
  const psi0Lab = ks.label('\\psi(0)', [0, 0, 0], { small: true, offset: [-14, -12] });
  const gamLab = ks.label('\\gamma', [0, 0, 0], { color: 'hi', offset: [12, -10] });

  // ---- phase dial
  const dial = plot2d(v3.body, scope, {
    x: [-1.45, 1.45],
    y: [-1.3, 1.42],
    grid: false,
    axes: false,
    pan: false,
    zoom: false,
    draw: drawDial,
  });

  // ------------------------------------------------------------------ panel
  const secL = pg.section('Loop of the field');
  const segKind = ui.segmented(secL, {
    options: [
      { value: 'latitude', label: 'Latitude' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'eight', label: 'Figure-eight' },
    ],
    value: S.kind,
    onChange: (v) => {
      S.kind = v;
      exps.clear();
      configureSlider();
      recompute();
      restart();
    },
  });
  const sParam = ui.slider(secL, {
    label: KINDS[S.kind].label,
    min: KINDS[S.kind].min * DEG,
    max: KINDS[S.kind].max * DEG,
    step: 0.005,
    value: S[KINDS[S.kind].key],
    format: (v) => fmt(v / DEG, 0) + '°',
    onInput: (v) => {
      S[KINDS[S.kind].key] = v;
      recompute();
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  secL.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(row, { label: 'Restart loop', onClick: () => restart() });
  const sT = ui.slider(secL, {
    label: 'Progress around the loop $t/T$',
    min: 0,
    max: 1,
    step: 0.001,
    value: S.t,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      S.t = v;
      hold = 0;
      play.set(false);
    },
  });
  ui.toggle(secL, {
    label: 'Show the section $s(\\hat n)$ (a gauge choice)',
    value: S.showSection,
    onChange: (v) => (S.showSection = v),
  });
  ui.toggle(secL, {
    label: 'Show the torus over the latitude',
    value: S.showTorus,
    onChange: (v) => {
      S.showTorus = v;
      torus.visible = v && S.kind === 'latitude';
    },
  });

  const secH = pg.section('Holonomy = Berry phase');
  const out = ui.readout(secH, { label: 'Transport vs geometry' });
  const kv = ui.keyValue(secH, [
    ['enclosed solid angle $\\brk{\\Omega}$', ''],
    ['$\\hi{\\gamma}=\\arg\\langle\\psi(0)|\\psi(T)\\rangle$ (transport)', ''],
    ['$-\\tfrac12\\brk{\\Omega}$ mod $2\\pi$ (geometry)', ''],
    ['difference', ''],
    ['now: $\\chi(t)$, $\\hat n(t)$', ''],
  ]);
  const badge = ui.badge(secH, '', 'good');
  badge.classList.add('hopf-badge');
  ui.legend(secH, [
    { color: 'c1', label: 'loop $C$ of $\\hat n(t)$ (arrows: direction)' },
    { color: 'brk', label: 'enclosed area, counter-clockwise ($+\\Omega$)' },
    { color: 'c3', label: 'enclosed area, clockwise ($-\\Omega$)' },
    { color: 'grp', label: 'horizontal lift $\\psi(t)$, state now' },
    { color: 'ink2', label: 'fibre over the start $\\hat n_0$' },
    { color: 'hi', label: 'gap along the fibre = holonomy $\\gamma$' },
  ]);

  const exps = ui.experiments(pg.section('Try this'), [
    {
      title: 'Minus half the solid angle',
      text: 'A latitude loop at $\\theta_0=60^\\circ$ encloses $\\Omega=2\\pi(1-\\cos\\theta_0)=\\pi$, and the spin returns as $e^{-i\\pi/2}\\psi=-i\\psi$. Change $\\theta_0$: $\\gamma$ tracks $-\\pi(1-\\cos\\theta_0)$. Only the geometry of the loop matters, not how fast it is traversed (as long as it is slow).',
      apply: () => setup('latitude', 60 * DEG),
    },
    {
      title: 'Equator: a minus sign',
      text: 'At $\\theta_0=90^\\circ$, $\\Omega=2\\pi$ and $\\gamma=-\\pi$: $\\psi\\to-\\psi$. Here the transported state is exactly $e^{-i\\varphi\\sigma_z/2}\\ket{+x}$, so this is the famous sign change of a spinor under a $2\\pi$ rotation (see <a href="#/su2">SU(2)</a>).',
      apply: () => setup('latitude', 90 * DEG),
    },
    {
      title: 'The octant triangle',
      text: 'Field along $\\hat z\\to\\hat x\\to\\hat y\\to\\hat z$ on great circles: $\\Omega=\\pi/2$, so $\\gamma=-\\pi/4$. A tangent vector carried round the same triangle on a globe turns by $\\Omega=90^\\circ$; the spin-½ phase is $-\\tfrac12$ of that. Sharp corners do not matter — only the enclosed area.',
      apply: () => setup('triangle', 90 * DEG),
    },
    {
      title: 'Figure-eight: zero',
      text: 'The two lobes are traversed in opposite senses, so their solid angles cancel and $\\gamma=0$, although the field turned through two full loops. Watch the dial: $\\chi(t)$ rises on one lobe and falls back on the other. The Berry phase is a <b>flux</b>, not a winding count.',
      apply: () => setup('eight', 34 * DEG),
    },
    {
      title: 'Around the south pole',
      text: 'At $\\theta_0=165^\\circ$ the loop encloses $\\Omega\\approx4\\pi$ around $\\ket\\uparrow$, or a small cap of $4\\pi-\\Omega$ (opposite sense) around $\\ket\\downarrow$. The two answers for $\\gamma$ differ by $\\tfrac12\\cdot4\\pi=2\\pi$, which is invisible. This consistency is <b>Dirac quantisation</b>: total flux $\\int F\\in2\\pi\\Z$.',
      apply: () => setup('latitude', 165 * DEG),
    },
  ]);

  function setup(kind, th) {
    S.kind = kind;
    S[KINDS[kind].key] = th;
    segKind.set(kind, { silent: true });
    configureSlider();
    recompute();
    restart();
  }
  function configureSlider() {
    const K = KINDS[S.kind];
    sParam.setLabel(K.label);
    sParam.setRange(K.min * DEG, K.max * DEG, 0.005);
    sParam.set(S[K.key], { silent: true });
  }
  function restart() {
    S.t = 0;
    hold = 0;
    sT.set(0, { silent: true });
    play.set(true);
  }

  // ------------------------------------------------------------------ the loop and its lift
  let L = null;
  let lift = null;
  let omega = 0;
  let proj = [];
  let camDist = 8;
  const brk = new THREE.Color(pal.brk);
  const neg = new THREE.Color(pal.c3);

  function recompute() {
    const th = S[KINDS[S.kind].key];
    L = M.makeLoop(S.kind, th, N_LOOP);
    lift = M.horizontalLift(L.pts);
    omega = S.kind === 'eight' ? M.loopSolidAngle(L.pts, L.centre) : L.omegaExact;
    proj = lift.psi.map((p) => M.project(p));
    // base: loop, direction arrows, flux fan
    loopLine.setPoints([...L.pts.map((p) => p.map((x) => x * 1.006)), L.pts[0].map((x) => x * 1.006)]);
    [0.18, 0.68].forEach((u, i) => {
      const a = L.pts[Math.floor(u * N_LOOP)];
      const b = L.pts[Math.floor(u * N_LOOP) + 4];
      const tg = M.normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      dirArrows[i].set(
        a.map((x) => x * 1.012),
        a.map((x, j) => x * 1.012 + 0.17 * tg[j]),
      );
    });
    buildFan();
    startDot.position.set(...L.pts[0].map((x) => x * 1.01));
    // S^3: fibre over n0, the lifted path, the section lift, the torus
    const psi0 = lift.psi[0];
    fibre0.setPoints(M.sampleClosed((t) => M.fibrePoint(psi0, TAU * t), { rClip: 80, tol: 0.04 }).pts);
    const step = 2;
    const full = [];
    for (let k = 0; k <= N_LOOP; k += step) full.push(proj[k]);
    liftFull.setPoints(full);
    const sec = [];
    for (let k = 0; k <= N_LOOP; k += step) sec.push(M.project(M.sectionAt(L.pts[k % N_LOOP])));
    sectionLift.setPoints(sec);
    // gap arc along the starting fibre: χ from 0 to γ
    const arc = [];
    for (let i = 0; i <= 64; i++) arc.push(M.fibrePoint(psi0, (lift.gamma * i) / 64));
    gapArc.setPoints(arc);
    endDot.position.set(...proj[N_LOOP]);
    psi0Dot.position.set(...proj[0]);
    psi0Lab.setPosition(proj[0]);
    gamLab.setPosition(arc[32]);
    torus.visible = S.kind === 'latitude' && S.showTorus;
    if (S.kind === 'latitude') torus.update();
    // camera: fit the drawn curves, keep the user's viewing direction
    let rb = 0;
    for (const p of proj) rb = Math.max(rb, Math.hypot(p[0], p[1], p[2]));
    for (let i = 0; i < 64; i++) {
      const p = M.fibrePoint(psi0, (TAU * i) / 64);
      const r = Math.hypot(p[0], p[1], p[2]);
      if (Number.isFinite(r)) rb = Math.max(rb, Math.min(r, 30));
    }
    const { width, height } = ks.size;
    const aspect = Math.min(1, width / Math.max(1, height));
    camDist = M.clamp((1.12 * rb) / (Math.tan((19 * PI) / 180) * aspect), 3, 140);
    const dir = new THREE.Vector3().subVectors(ks.camera.position, ks.controls.target);
    if (dir.length() < 1e-6) dir.set(...CAM_DIR);
    dir.normalize().multiplyScalar(camDist);
    ks.setCamera([dir.x, dir.y, dir.z], [0, 0, 0]);
    const sc = camDist / 8;
    [psi0Dot, psiDot, endDot].forEach((m) => m.scale.setScalar(sc));
    updateStatic();
  }

  function buildFan() {
    const step = 6;
    const pts = [];
    for (let i = 0; i < N_LOOP; i += step) pts.push(L.pts[i]);
    const c = L.centre;
    const signs = M.fanSigns(pts, c);
    const K = 8;
    const pos = [];
    const col = [];
    const r = 1.003;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const C = signs[i] >= 0 ? brk : neg;
      for (let k = 0; k < K; k++) {
        const a0 = M.slerp3(c, p, k / K);
        const a1 = M.slerp3(c, p, (k + 1) / K);
        const b0 = M.slerp3(c, q, k / K);
        const b1 = M.slerp3(c, q, (k + 1) / K);
        for (const v of [a0, a1, b1, a0, b1, b0]) {
          pos.push(v[0] * r, v[1] * r, v[2] * r);
          col.push(C.r, C.g, C.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const old = fan.geometry;
    fan.geometry = g;
    old.dispose();
  }

  // ------------------------------------------------------------------ per-frame state
  const idxOf = (t) => M.clamp(Math.round(t * N_LOOP), 0, N_LOOP);

  function updateDynamic() {
    const k = idxOf(S.t);
    const n = L.pts[k % N_LOOP];
    fieldArrow.set([0, 0, 0], n.map((x) => x * 0.97));
    nowDot.position.set(...n.map((x) => x * 1.01));
    bLabel.setPosition(n.map((x) => x * 0.97));
    const pts = [];
    for (let j = 0; j < k; j += 2) pts.push(proj[j]);
    pts.push(proj[k]);
    liftNow.setPoints(pts);
    psiDot.position.set(...proj[k]);
    fibreNow.setPoints(M.sampleClosed((t) => M.fibrePoint(lift.psi[k], TAU * t), { n: 96, rClip: 80, tol: 0.05 }).pts);
    const done = S.t >= 0.9995;
    gapArc.visible = done && Math.abs(lift.gamma) > 1e-3;
    endDot.visible = done;
    gamLab.setVisible(done && Math.abs(lift.gamma) > 0.05);
    fibreNow.visible = !done;
    sectionLift.visible = S.showSection;
    dial.invalidate();
  }

  function updateStatic() {
    const g = lift.gamma;
    const geo = M.wrapPi(-omega / 2);
    const diff = Math.abs(M.wrapPi(g - geo));
    const wrapped = Math.abs(geo + omega / 2) > 1e-6;
    out.set(
      `\\begin{aligned}\\hi{\\gamma}&=\\arg\\langle\\psi(0)|\\psi(T)\\rangle=${texNum(g, 3)}\\\\[2pt]` +
        `-\\tfrac12\\brk{\\Omega}&=${texNum(-omega / 2, 3)}` +
        (wrapped ? `\\equiv ${texNum(geo, 3)}\\ (\\mathrm{mod}\\ 2\\pi)` : '') +
        `\\end{aligned}`,
    );
    kv.set('enclosed solid angle $\\brk{\\Omega}$', `$${texNum(omega, 3)}$ sr $=${texNum(omega / PI, 3)}\\pi$`);
    kv.set('$\\hi{\\gamma}=\\arg\\langle\\psi(0)|\\psi(T)\\rangle$ (transport)', `$${texNum(g, 4)}$`);
    kv.set('$-\\tfrac12\\brk{\\Omega}$ mod $2\\pi$ (geometry)', `$${texNum(geo, 4)}$`);
    kv.set('difference', diff < 1e-12 ? '$<10^{-12}$' : `$${expTex(diff)}$`);
    badge.set(
      diff < 1e-3
        ? `Agree: parallel transport over ${N_LOOP} steps reproduces $-\\Omega/2$`
        : 'Mismatch — loop too coarse',
      diff < 1e-3 ? 'good' : 'bad',
    );
  }
  function expTex(x) {
    if (!(x > 0)) return '0';
    const e = Math.floor(Math.log10(x));
    const m = x / Math.pow(10, e);
    return `${m.toFixed(1)}\\times10^{${e}}`;
  }

  let readT = 1;
  let lastOvl = '';
  function updateLive() {
    const k = idxOf(S.t);
    const n = L.pts[k % N_LOOP];
    kv.set('now: $\\chi(t)$, $\\hat n(t)$', `$${texNum(lift.chi[k], 2)}$, $(${texNum(n[0], 2)},${texNum(n[1], 2)},${texNum(n[2], 2)})$`);
    const done = S.t >= 0.9995;
    const html = inlineOverlay(done, k);
    if (html !== lastOvl) {
      lastOvl = html;
      ovl.innerHTML = inlineTex(html);
    }
  }
  function inlineOverlay(done, k) {
    const chi = lift.chi[k];
    return done
      ? `<div>Back over $\\hat n_0$: $\\psi(T)=e^{i\\hi{\\gamma}}\\psi(0)$</div><div class="k">$\\gamma=${texNum(lift.gamma, 3)}$, $-\\Omega/2=${texNum(-omega / 2, 3)}$</div>`
      : `<div>$\\psi(t)=e^{i\\chi(t)}\\,s(\\hat n(t))$</div><div class="k">$\\chi=${texNum(chi, 3)}$ · $t/T=${texNum(S.t, 2)}$</div>`;
  }

  // ------------------------------------------------------------------ dial
  function drawDial(p) {
    if (!lift) return;
    const k = idxOf(S.t);
    const chi = lift.chi[k];
    const target = -omega / 2;
    p.circle([0, 0], 1, { color: 'muted', width: 1.2, alpha: 0.85 });
    for (let j = 0; j < 4; j++) {
      const a = (j * PI) / 2;
      p.segment([0.93 * Math.cos(a), 0.93 * Math.sin(a)], [1.07 * Math.cos(a), 1.07 * Math.sin(a)], { color: 'muted', width: 1.2 });
    }
    p.tex('0', [1.18, 0], { key: 'z0', small: true, color: 'muted' });
    p.tex('\\pi/2', [0, 1.15], { key: 'z1', small: true, color: 'muted' });
    p.tex('\\pm\\pi', [-1.22, 0], { key: 'z2', small: true, color: 'muted' });
    p.tex('-\\pi/2', [0, -1.16], { key: 'z3', small: true, color: 'muted' });
    // target −Ω/2
    p.segment([0, 0], [Math.cos(target), Math.sin(target)], { color: 'brk', width: 1.8, dash: [5, 4] });
    // accumulated phase: a spiral arc 0 → χ(t), one turn further in per winding
    const n = Math.max(8, Math.ceil(Math.abs(chi) * 30));
    const arc = [];
    for (let i = 0; i <= n; i++) {
      const a = (chi * i) / n;
      const r = 0.74 - (0.12 * Math.abs(a)) / TAU;
      arc.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    p.line(arc, { color: 'grp', width: 2.6 });
    p.arrow([0, 0], [0.96 * Math.cos(chi), 0.96 * Math.sin(chi)], { color: 'grp', width: 2.4, head: 10 });
    p.dot([0, 0], { r: 3, color: 'ink2' });
    const done = S.t >= 0.9995;
    p.tex(done ? '\\hi{\\gamma}' : '\\chi(t)', [Math.cos(chi) * 0.55 + 0.02, Math.sin(chi) * 0.55 + 0.12], { key: 'hand', small: true, color: done ? 'hi' : 'grp' });
    const tl = [0.86 * Math.cos(target), 0.86 * Math.sin(target)];
    const close = Math.abs(M.wrapPi(target - chi)) < 0.35;
    p.tex('-\\tfrac12\\Omega', [tl[0] * 1.32, tl[1] * 1.32 + (close ? -0.16 : 0)], { key: 'tg', small: true, color: 'brk' });
  }

  // ------------------------------------------------------------------ animation
  scope.frame((dt) => {
    if (S.playing) {
      if (S.t < 1) {
        S.t = Math.min(1, S.t + dt / LOOP_SECONDS);
        hold = 0;
      } else {
        hold += dt;
        if (hold > HOLD_SECONDS) {
          S.t = 0;
          hold = 0;
        }
      }
      sT.set(S.t, { silent: true });
    }
    updateDynamic();
    readT += dt;
    if (readT > 0.1) {
      readT = 0;
      updateLive();
    }
  });

  configureSlider();
  recompute();
  updateDynamic();
  updateLive();
  // re-fit once the layout has settled (the scene may have been sized before the grid was final)
  scope.timeout(() => recompute(), 60);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Top left: the field direction $\\hat n(t)$ runs once round the loop $C$ (blue); the spin, in its ground state, stays
    aligned with it. The area $C$ encloses is shaded by orientation. Right: the actual state vector $\\psi(t)\\in S^3$,
    stereographically projected. It is transported <b>horizontally</b> — always orthogonal to the fibres,</p>
    $$\\mathrm{Im}\\langle\\psi|\\dd\\psi\\rangle=0\\quad\\Longleftrightarrow\\quad\\psi=e^{i\\chi}s,\\ \\ \\dd\\chi=-\\mathrm{Im}\\langle s|\\dd s\\rangle,$$
    <p>so the closed loop downstairs lifts to an <i>open</i> path upstairs: it ends on the fibre it started from, shifted
    along it by the holonomy $\\hi{\\gamma}$ (yellow arc). Bottom left: the phase $\\chi(t)$ relative to the reference section
    $s(\\hat n)=(\\cos\\tfrac\\theta2,e^{i\\varphi}\\sin\\tfrac\\theta2)$ — gauge dependent along the way, gauge invariant at the end.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>Like carrying a spear round a loop on the
    globe without ever turning it: it comes back rotated by the enclosed area. Here the “spear” is the quantum phase, and
    it turns by $-\\tfrac12$ of the solid angle.</div>`);
  pg.note(`<h2>The physics</h2>
    <p>For $H(t)=-\\mu\\,\\vec B(t)\\cdot\\vec\\sigma$ with $\\vec B$ turning slowly, the adiabatic theorem keeps the spin in the
    aligned eigenstate, and after a period</p>
    $$\\psi(T)=e^{-i\\int_0^T E\\,\\dd t}\\;e^{i\\gamma}\\,\\psi(0),\\qquad \\gamma=i\\oint_C\\langle n|\\nabla n\\rangle\\cdot\\dd\\vec R=-\\tfrac12\\,\\Omega(C).$$
    <p>The dynamical phase depends on how long the loop took (it is left out here); $\\gamma$ depends only on the path.
    For spin component $m$ along the field, $\\gamma_m=-m\\,\\Omega$. Berry phases have been measured with neutron spins
    in helical fields, photons in coiled optical fibres and in NMR; the same geometry gives the Aharonov–Bohm effect
    and the anomalous velocity of Bloch electrons.</p>
    <div class="callout physics"><span class="callout-title">A monopole in parameter space</span>The Berry curvature is the
    field of a magnetic monopole of strength $\\tfrac12$ sitting at $\\vec B=0$, where the two levels cross. Loops
    measure its flux; that is why only the enclosed solid angle matters.</div>`);
  pg.note(`<h2>The mathematics</h2>
    <p>With the section $s$, the Berry connection and curvature are</p>
    $$\\alg{A}=i\\langle s|\\dd s\\rangle=-\\sin^2\\!\\tfrac\\theta2\\,\\dd\\varphi,\\qquad \\brk{F}=\\dd A=-\\tfrac12\\sin\\theta\\,\\dd\\theta\\wedge\\dd\\varphi=-\\tfrac12\\,\\dd\\Omega,$$
    <p>and Stokes gives $\\gamma=\\oint_C A=\\int_\\Sigma F=-\\tfrac12\\Omega$. Horizontality is the natural connection of the
    Hopf bundle (orthogonal complement of the fibres in the round $S^3$), and $\\frac1{2\\pi}\\int_{S^2}F=-1$: the Hopf
    bundle is the <b>Dirac monopole</b> bundle with Chern number $|c_1|=1$ (sign by convention; the anti-aligned state
    gives $+1$). No global section exists: $s$ fails at the south pole and $s_S=e^{-i\\varphi}s$ at the north; the transition
    $e^{-i\\varphi}$ winds once round the equator — the Dirac string — and consistency on the overlap is Dirac’s
    quantisation $2eg\\in\\Z$. Small loops: $\\gamma\\approx F\\times$area, the curvature as in
    <a href="#/loops">commutators as small loops</a>; phases and charge in <a href="#/u1">U(1)</a>, spinors in <a href="#/su2">SU(2)</a>.</p>`);
}
