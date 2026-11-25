// Tab (c): the sky of a moving observer. Aberration and Doppler shift of a seeded star field; the celestial sphere as
// the Riemann sphere on which SL(2,C) acts by Möbius maps (stereographic chart centred on +z: a z-boost is ζ ↦ e^{−η}ζ).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { parseColor } from '../../core/theme.js';
import { texMatrix, texNum, fmt } from '../../core/format.js';
import { clamp, vec, TAU } from '../../core/la.js';
import { cmat } from '../../core/complex.js';
import * as M from './math.js';
import { throttled } from './common.js';

const BMAX = 0.99;
const BREATHE = 0.47; // β(phase) = BREATHE (1 − cos phase) ∈ [0, 0.94]
const OMEGA = TAU / 18;
const R_STAR = 1.0;
const DEGR = Math.PI / 180;

// invented constellations: (θ, φ) in degrees, θ from the +z axis (direction of motion at tilt 0)
const CONSTELLATIONS = [
  { pts: [[28, 8], [41, 26], [31, 47], [18, 27], [52, 30]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4]] },
  { pts: [[68, 186], [79, 199], [70, 212], [80, 225], [70, 238]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { pts: [[120, 300], [148, 300], [134, 283], [134, 317], [141, 309]], edges: [[0, 1], [2, 3]] },
];
// apparent outlines of distant spheres (centre θ, φ; angular radius), all in degrees
const DISCS = [
  { c: [100, 118], r: 12 },
  { c: [52, -58], r: 9 },
  { c: [142, 42], r: 13 },
];

export function mountSky(pg, scope, ctx) {
  const S = (ctx.state.sky ??= { beta: 0.75, phi: 0, tilt: 0, playing: true, grid: true, field: true });
  const pal = ctx.colors;
  let phase = Math.acos(clamp(1 - S.beta / BREATHE, -1, 1));

  // ------------------------------------------------------------------ data
  const stars = M.starField(1300).map((s) => ({ n: s.n, b: s.b }));
  for (const c of CONSTELLATIONS) for (const [th, ph] of c.pts) stars.push({ n: M.dirOf(th * DEGR, ph * DEGR), b: 0.85 });
  const NSTAR = stars.length;
  const parallels = [30, 60, 90, 120, 150].map((t) => {
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(M.dirOf(t * DEGR, (TAU * i) / 96));
    return pts;
  });
  const meridians = [];
  for (let j = 0; j < 12; j++) {
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push(M.dirOf((Math.PI * i) / 60, (TAU * j) / 12));
    meridians.push(pts);
  }
  const gridLines = [...parallels, ...meridians];
  const constLines = [];
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.edges) constLines.push(M.skyArc(M.dirOf(c.pts[a][0] * DEGR, c.pts[a][1] * DEGR), M.dirOf(c.pts[b][0] * DEGR, c.pts[b][1] * DEGR), 12));
  const discLines = DISCS.map((d) => M.skyCircle(M.dirOf(d.c[0] * DEGR, d.c[1] * DEGR), d.r * DEGR, 72));

  // colours (sRGB, 0..1) for the Doppler map
  const rgb = (c) => parseColor(c).slice(0, 3).map((x) => x / 255);
  const NEUTRAL = rgb(pal.ink2);
  const BLUE = rgb(pal.z);
  const RED = rgb(pal.x);
  const LOGD = Math.log(4);
  const starRGB = (D) => {
    const t = clamp(Math.log(Math.max(D, 1e-6)) / LOGD, -1, 1);
    const tgt = t >= 0 ? BLUE : RED;
    const a = Math.abs(t);
    return [NEUTRAL[0] + (tgt[0] - NEUTRAL[0]) * a, NEUTRAL[1] + (tgt[1] - NEUTRAL[1]) * a, NEUTRAL[2] + (tgt[2] - NEUTRAL[2]) * a];
  };
  const starSize = (b, D) => (1.5 + 3.3 * b) * Math.pow(clamp(D, 0.3, 3.6), 0.8);
  const starAlpha = (D) => clamp(0.3 + 0.7 * D, 0.28, 1);

  // current transformation (recomputed in update)
  const T = { A: null, L: null, eta: 0, nb: [0, 0, 1], ahead: [0, 0, 1], cur: [], grid: [], consts: [], discs: [] };
  function transform() {
    const beta = clamp(S.beta, 0, BMAX);
    T.eta = M.rapidityOf(beta);
    T.nb = [Math.sin(S.tilt * DEGR), 0, Math.cos(S.tilt * DEGR)];
    T.A = cmat.mul(M.slRotation(S.phi * DEGR, [0, 0, 1]), M.slBoost(T.eta, T.nb));
    T.L = M.lorentzOf(T.A);
    const c = Math.cos(S.phi * DEGR);
    const s = Math.sin(S.phi * DEGR);
    T.ahead = [c * T.nb[0] - s * T.nb[1], s * T.nb[0] + c * T.nb[1], T.nb[2]];
    const tr = (n) => M.transformDirection(T.L, n);
    T.cur = stars.map((st) => tr(st.n));
    T.grid = gridLines.map((l) => l.map((n) => tr(n).n));
    T.consts = constLines.map((l) => l.map((n) => tr(n).n));
    T.discs = discLines.map((l) => l.map((n) => tr(n).n));
    let ahead = 0;
    for (const r of T.cur) if (vec.dot(r.n, T.ahead) > 0) ahead++;
    T.fracAhead = ahead / NSTAR;
  }
  transform();

  // ------------------------------------------------------------------ views
  const v1 = pg.view({ title: 'Celestial sphere of the moving observer', hint: 'drag to orbit · scroll to zoom', height: 440 });
  const v2 = pg.view({ title: 'Sky chart $\\zeta=e^{i\\phi}\\tan\\tfrac{\\theta}{2}$ · ahead at the centre', hint: 'scroll to zoom · double-click resets', height: 440 });

  // --- 3D
  const k = scene3d(v1.body, scope, { camera: [3.9, -4.6, 1.55], target: [0, 0, 0.12], fov: 34, minDistance: 2.2, maxDistance: 14 });
  k.sphere({ radius: 0.985, color: 'surface2', segments: 64, roughness: 0.9 });
  const pos = new Float32Array(NSTAR * 3);
  const col = new Float32Array(NSTAR * 3);
  const size = new Float32Array(NSTAR);
  const alpha = new Float32Array(NSTAR);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uPR: { value: k.renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uPR;
      varying vec3 vColor; varying float vAlpha;
      void main() { vColor = aColor; vAlpha = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha;
      void main() { float r = length(gl_PointCoord - vec2(0.5)) * 2.0; if (r > 1.0) discard;
        gl_FragColor = vec4(vColor, vAlpha * (1.0 - smoothstep(0.5, 1.0, r))); }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, starMat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  k.root.add(points);

  const segCount = (lines) => lines.reduce((s, l) => s + l.length - 1, 0);
  const makeSegments = (lines, color, opacity) => {
    const arr = new Float32Array(segCount(lines) * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.LineBasicMaterial({ color: k.color(color), transparent: true, opacity, depthWrite: false });
    const ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false;
    k.root.add(ls);
    return { ls, arr, g };
  };
  const fillSegments = (S3, lines, r) => {
    let o = 0;
    for (const l of lines)
      for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i];
        const b = l[i + 1];
        S3.arr[o++] = a[0] * r;
        S3.arr[o++] = a[1] * r;
        S3.arr[o++] = a[2] * r;
        S3.arr[o++] = b[0] * r;
        S3.arr[o++] = b[1] * r;
        S3.arr[o++] = b[2] * r;
      }
    S3.g.attributes.position.needsUpdate = true;
  };
  const grid3 = makeSegments(gridLines, 'muted', 0.5);
  const const3 = makeSegments(constLines, 'ink2', 0.75);
  const discs3 = DISCS.map(() => k.line([], { color: 'hi', width: 2.2 }));
  const vArrow = k.arrow([0, 0, 1], [0, 0, 1.5], { color: 'alg', radius: 0.02, headLength: 0.12, headRadius: 0.05 });
  const lAhead = k.label('\\text{ahead}', [0, 0, 1.6], { small: true, color: 'alg' });
  const lBehind = k.label('\\text{behind}', [0, 0, -1.25], { small: true });

  // --- 2D chart
  const zOf = (n) => {
    const z = M.skyZeta(n);
    return Number.isFinite(z.re) && Math.hypot(z.re, z.im) < 60 ? [z.re, z.im] : null;
  };
  const unit = [];
  for (let i = 0; i <= 128; i++) unit.push([Math.cos((TAU * i) / 128), Math.sin((TAU * i) / 128)]);
  let starCss = [];
  const p2 = plot2d(v2.body, scope, {
    x: [-2.05, 2.05],
    y: [-2.05, 2.05],
    grid: false,
    axes: false,
    draw(p) {
      if (S.grid) for (const l of T.grid) p.line(l.map(zOf), { color: 'muted', width: 1, alpha: 0.45 });
      p.line(unit, { color: 'ink2', width: 1.2, dash: [5, 4], alpha: 0.8 });
      if (S.field && T.eta > 1e-3) {
        const nb = T.ahead;
        const Mg = cmat.scale(cmat.combo(nb, [M.SIG4[1], M.SIG4[2], M.SIG4[3]]), 0.5);
        p.vectorField(
          (x, y) => {
            const v = M.skyField(Mg, { re: x, im: y });
            return [v.re, v.im];
          },
          { color: 'alg', step: 46, alpha: 0.28, maxLen: 14 },
        );
      }
      for (const l of T.consts) p.line(l.map(zOf), { color: 'ink2', width: 1.2, alpha: 0.8 });
      for (let i = 0; i < NSTAR; i++) {
        const z = zOf(T.cur[i].n);
        if (!z || Math.abs(z[0]) > 3.5 || Math.abs(z[1]) > 3.5) continue;
        p.dot(z, { r: Math.max(0.7, starSize(stars[i].b, T.cur[i].D) * 0.42), color: starCss[i], alpha: starAlpha(T.cur[i].D) });
      }
      for (const l of T.discs) p.line(l.map(zOf), { color: 'hi', width: 2 });
      const za = zOf(T.ahead);
      if (za && T.eta > 1e-3) {
        p.dot(za, { r: 4, color: 'surface', stroke: 'alg', width: 2 });
        p.tex('\\text{ahead}', za, { key: 'ah', small: true, color: 'alg', offset: [14, 16], align: 'left' });
      }
      const zb = zOf(vec.neg(T.ahead));
      if (zb && T.eta > 1e-3) p.dot(zb, { r: 4, color: 'surface', stroke: 'muted', width: 2 });
      p.tex('\\theta=90^\\circ', [Math.cos(-0.75), Math.sin(-0.75)], { key: 'eq', small: true, offset: [10, 10], align: 'left' });
    },
  });

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Observer');
  const sB = ui.slider(sec, {
    label: 'Speed $\\beta$',
    min: 0,
    max: BMAX,
    step: 0.005,
    value: S.beta,
    format: (x) => `${fmt(x, 3)} · η ${fmt(M.rapidityOf(x), 2)}`,
    onInput: (x) => {
      S.beta = x;
      stop();
      update();
    },
  });
  const sP = ui.slider(sec, {
    label: 'Rotation $\\phi$ about the $z$ axis',
    min: -180,
    max: 180,
    step: 1,
    value: S.phi,
    format: (x) => `${fmt(x, 0)}°`,
    onInput: (x) => {
      S.phi = x;
      update();
    },
  });
  const sT = ui.slider(sec, {
    label: 'Boost direction: tilt from $+z$',
    min: 0,
    max: 180,
    step: 1,
    value: S.tilt,
    format: (x) => `${fmt(x, 0)}°`,
    onInput: (x) => {
      S.tilt = x;
      update();
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  sec.appendChild(row);
  const play = ui.playButton(row, {
    playing: S.playing,
    onToggle: (on) => {
      S.playing = on;
      if (on) phase = Math.acos(clamp(1 - S.beta / BREATHE, -1, 1));
    },
  });
  ui.button(row, {
    label: 'Rest frame',
    onClick: () => {
      stop();
      sB.set(0);
    },
  });
  ui.toggle(sec, { label: 'Latitude–longitude grid', value: S.grid, onChange: (v) => ((S.grid = v), update()) });
  ui.toggle(sec, { label: 'Boost generator field on the chart', value: S.field, onChange: (v) => ((S.field = v), update()) });

  const secR = pg.section('Readout');
  const kv = ui.keyValue(secR, [
    ['Rapidity $\\eta$, $\\gamma$', ''],
    ['Doppler ahead / behind $e^{\\pm\\eta}$', ''],
    ['Stars in the forward hemisphere', ''],
  ]);
  const rA = ui.readout(secR, { label: '$\\grp{A}\\in SL(2,\\C)$ and its action on the sky' });
  ui.readout(secR, {
    label: 'Spacetime as Hermitian matrices',
    value:
      '\\begin{aligned}X&=x^\\mu\\sigma_\\mu=\\begin{pmatrix}t+z&x-iy\\\\x+iy&t-z\\end{pmatrix}\\\\ X&\\mapsto \\grp{A}X\\grp{A}^\\dagger,\\quad \\det X=t^2-|\\vec x|^2\\end{aligned}',
  });
  const scale = ui.h('div', { class: 'lz-scale', style: { background: `linear-gradient(to right, ${pal.x}, ${pal.ink2}, ${pal.z})` } });
  secR.appendChild(ui.h('div', { class: 'small-note', html: 'Star colour: Doppler factor $D=\\omega\'/\\omega$; size grows with $D$.' }));
  secR.appendChild(scale);
  secR.appendChild(ui.h('div', { class: 'lz-scale-labels' }, ui.h('span', { html: '$D\\le\\tfrac14$ red' }), ui.h('span', { html: '$D=1$' }), ui.h('span', { html: 'blue $D\\ge4$' })));
  ui.legend(secR, [
    { color: 'hi', label: 'outlines of distant spheres' },
    { color: 'ink2', label: 'constellations' },
    { color: 'alg', label: 'direction of motion, generator' },
  ]);

  const setSky = (beta, tilt, phi) => {
    stop();
    S.beta = beta;
    S.tilt = tilt;
    S.phi = phi;
    sB.set(beta, { silent: true });
    sT.set(tilt, { silent: true });
    sP.set(phi, { silent: true });
    update();
  };
  ui.experiments(pg.section('Try this'), [
    {
      title: 'Flying at 0.9c',
      text: 'The forward hemisphere of the rest-frame sky is squeezed into a cone of half-angle $26^\\circ$ ($\\cos\\theta\'=\\beta$) and $(1+\\beta)/2=95\\%$ of all stars now lie ahead, blueshifted by up to $e^{\\eta}=4.4$; behind you the sky is sparse and red.',
      apply: () => setSky(0.9, 0, 0),
    },
    {
      title: 'The stars behind you appear ahead',
      text: 'The cross-shaped constellation lies $134^\\circ$ from the direction of motion — behind you. At $\\beta=0.95$ it is seen $41^\\circ$ ahead: $\\cos\\theta\'=(\\cos\\theta+\\beta)/(1+\\beta\\cos\\theta)$.',
      apply: () => setSky(0.95, 0, 0),
    },
    {
      title: 'Penrose–Terrell: spheres look round',
      text: 'Boost sideways at $0.8$. The amber outlines of distant spheres move and change size, but stay exact circles: Lorentz transformations act on the sky by Möbius maps, which send circles to circles. A fast sphere is not seen Lorentz-contracted.',
      apply: () => setSky(0.8, 90, 0),
    },
    {
      title: 'A boost is a dilation, a rotation a phase',
      text: 'Along the line of motion $\\grp A=\\diag(e^{(\\eta-i\\phi)/2},e^{-(\\eta-i\\phi)/2})$ acts as $\\zeta\\mapsto e^{-\\eta+i\\phi}\\zeta$: the boost scales the chart, the rotation about the same axis turns it — they commute (a loxodromic Möbius map).',
      apply: () => setSky(0.6, 0, 60),
    },
    {
      title: 'Ultra-relativistic',
      text: 'At $\\beta=0.99$ ($\\eta=2.65$) the whole forward hemisphere fits into $8^\\circ$; nearly every star sits in a bright blue spot ahead. Zoom into the centre of the chart: it is the old sky, uniformly shrunk by $e^{-\\eta}=0.07$.',
      apply: () => setSky(0.99, 0, 0),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Each dot is a star, placed where the moving observer <em>sees</em> it. A star at angle $\\theta$ from the direction of
    motion in the rest frame of the stars is seen at</p>
    $$\\cos\\theta'=\\frac{\\cos\\theta+\\beta}{1+\\beta\\cos\\theta},\\qquad \\tan\\frac{\\theta'}{2}=e^{-\\eta}\\tan\\frac\\theta2 ,$$
    <p>so a fraction $(1+\\beta)/2$ of a uniform sky crowds into the forward hemisphere (aberration). The colour is the Doppler
    factor $D=\\omega'/\\omega=\\gamma(1+\\beta\\cos\\theta)=1/\\big(\\gamma(1-\\beta\\cos\\theta')\\big)$, from $e^{\\eta}$ straight ahead
    to $e^{-\\eta}$ behind. The bolometric flux of a point source scales as $D^2$ and the surface brightness of the sky as
    $D^4$ (because $I_\\nu/\\nu^3$ is invariant); the dot size grows with $D$.</p>
    <p>Right: the stereographic chart $\\zeta=(n_x+in_y)/(1+n_z)=e^{i\\phi}\\tan\\frac\\theta2$, projected from the backward pole, so
    the direction $+z$ is the centre and the dashed circle is $\\theta=90^\\circ$. In it a boost along $+z$ is simply
    $\\zeta\\mapsto e^{-\\eta}\\zeta$ and a rotation about $z$ is $\\zeta\\mapsto e^{i\\phi}\\zeta$. The orange arrows are the
    generator: the holomorphic vector field $-\\zeta\\,\\partial_\\zeta$ of an infinitesimal boost.</p>`);
  pg.note(`<h2>Spinors and $SL(2,\\C)$</h2>
    <p>Write a 4-vector as a Hermitian matrix, $X=x^\\mu\\sigma_\\mu$, with $\\det X=t^2-|\\vec x|^2$. For $\\grp A\\in SL(2,\\C)$ the map
    $X\\mapsto \\grp A X\\grp A^\\dagger$ keeps $X$ Hermitian and $\\det X$ fixed: it is a Lorentz transformation $\\Lambda(\\grp A)$,
    and $\\Lambda(-\\grp A)=\\Lambda(\\grp A)$. This is the 2:1 cover $SL(2,\\C)\\to SO^+(1,3)$, the relativistic version of
    $SU(2)\\to SO(3)$ — a rotation by $2\\pi$ is $\\grp A=-\\id$. Boosts are Hermitian, $e^{\\eta\\,\\hat n\\cdot\\vec\\sigma/2}$;
    rotations unitary, $e^{-i\\theta\\,\\hat n\\cdot\\vec\\sigma/2}$.</p>
    <p>A light ray is a null $X$, i.e. $X=2\\psi\\psi^\\dagger$ for a spinor $\\psi=(\\cos\\frac\\theta2,\\,e^{i\\phi}\\sin\\frac\\theta2)$: the
    celestial sphere is $\\mathbb{CP}^1$ — the same Riemann sphere as the Bloch sphere of a qubit. Since $\\psi\\mapsto\\grp A\\psi$,
    the coordinate $\\zeta=\\psi_2/\\psi_1$ undergoes</p>
    $$\\zeta\\ \\mapsto\\ \\frac{c+d\\,\\zeta}{a+b\\,\\zeta},\\qquad \\grp A=\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}.$$
    <p>So $PSL(2,\\C)\\cong SO^+(1,3)$ is exactly the group of Möbius transformations of the sky, and these map circles to
    circles: the outline of a sphere is a circle in every frame (Penrose 1959, Terrell 1959).</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>The sky does not know about distances: a Lorentz
    transformation can only do to it what a conformal map of the Riemann sphere can do — slide stars towards one fixed
    point (ahead) and away from the other (behind), and turn them about the axis.</div>`);
  pg.note(`<h2>Going further</h2>
    <p><strong>Weyl spinors.</strong> Complexified, $\\so(1,3)_\\C\\cong\\sl(2,\\C)\\oplus\\sl(2,\\C)$ via $N^\\pm_i=\\tfrac12(J_i\\pm iK_i)$,
    $[N^\\pm_i,N^\\pm_j]=i\\epsilon_{ijk}N^\\pm_k$, $[N^+_i,N^-_j]=0$. Finite-dimensional irreducible representations are labelled
    by two spins $(j_+,j_-)$. The two-component spinors $\\psi\\mapsto\\grp A\\psi$ and $\\chi\\mapsto(\\grp A^\\dagger)^{-1}\\chi$ are the
    inequivalent Weyl representations — $(0,\\tfrac12)$ and $(\\tfrac12,0)$ in the conventions used here; which one is called
    left-handed is a convention — and $X\\mapsto\\grp AX\\grp A^\\dagger$ is the vector $(\\tfrac12,\\tfrac12)$, with Casimirs
    $J^2-K^2=3$, $\\vec J\\cdot\\vec K=0$. A Dirac spinor is $(\\tfrac12,0)\\oplus(0,\\tfrac12)$; parity swaps the two halves.
    The weak interaction couples only to one of them.</p>
    <p>Related: <a href="#/su2">SU(2) and the double cover</a>, <a href="#/hopf">Hopf fibration</a> (the same $\\mathbb{CP}^1$),
    <a href="#/reps">spin multiplets</a>.</p>`);

  // ------------------------------------------------------------------ dynamics
  const readouts = throttled(scope, () => {
    const eta = T.eta;
    kv.set('Rapidity $\\eta$, $\\gamma$', `${fmt(eta, 3)}, ${fmt(Math.cosh(eta), 3)}`);
    kv.set('Doppler ahead / behind $e^{\\pm\\eta}$', `${fmt(Math.exp(eta), 2)} / ${fmt(Math.exp(-eta), 2)}`);
    kv.set('Stars in the forward hemisphere', `${fmt(100 * T.fracAhead, 1)}% (theory ${fmt(50 * (1 + S.beta), 1)}%)`);
    const A = T.A;
    const ph = S.phi * DEGR;
    const phTex = Math.abs(ph) < 1e-9 ? '' : `${ph < 0 ? '-' : '+'}${texNum(Math.abs(ph), 2)}i`;
    const z = S.tilt === 0 ? `\\zeta\\mapsto e^{${texNum(-eta, 2)}${phTex}}\\,\\zeta` : `\\zeta\\mapsto\\frac{c+d\\zeta}{a+b\\zeta}`;
    rA.set(`\\grp{A}=${texMatrix(A, 2)},\\quad ${z}`);
  });

  function update() {
    transform();
    const r = R_STAR;
    starCss = new Array(NSTAR);
    for (let i = 0; i < NSTAR; i++) {
      const t = T.cur[i];
      pos[3 * i] = t.n[0] * r;
      pos[3 * i + 1] = t.n[1] * r;
      pos[3 * i + 2] = t.n[2] * r;
      const c = starRGB(t.D);
      col[3 * i] = c[0];
      col[3 * i + 1] = c[1];
      col[3 * i + 2] = c[2];
      size[i] = starSize(stars[i].b, t.D);
      alpha[i] = starAlpha(t.D);
      starCss[i] = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    }
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[a].needsUpdate = true;
    grid3.ls.visible = S.grid;
    fillSegments(grid3, T.grid, 1.003);
    fillSegments(const3, T.consts, 1.003);
    T.discs.forEach((l, i) => discs3[i].setPoints(l.map((n) => [n[0] * 1.004, n[1] * 1.004, n[2] * 1.004])));
    const a = T.ahead;
    const len = 0.12 + 0.6 * S.beta;
    vArrow.visible = S.beta > 0.003;
    vArrow.set([a[0] * 1.02, a[1] * 1.02, a[2] * 1.02], [a[0] * (1.02 + len), a[1] * (1.02 + len), a[2] * (1.02 + len)]);
    lAhead.setPosition(vec.scale(a, 1.14 + len));
    lBehind.setPosition(vec.scale(a, -1.22));
    p2.invalidate();
    readouts.request();
  }
  function stop() {
    if (play.playing) play.set(false);
    S.playing = false;
  }
  scope.frame((dt) => {
    if (!play.playing) return;
    phase += OMEGA * dt;
    S.beta = BREATHE * (1 - Math.cos(phase));
    sB.set(S.beta, { silent: true });
    update();
  });
  update();
}
