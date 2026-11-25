// SSB tab (b) — O(3) → O(2): a three-component field n with V = λ(|n|² − v²)². The vacua form the sphere
// S² = SO(3)/SO(2). At the chosen vacuum the unbroken generator (rotation about ⟨n⟩) does nothing, the two
// broken generators move ⟨n⟩ along the sphere: two Goldstone directions in the tangent plane.
// Right view: dispersion of the modes (type-A antiferromagnet vs type-B ferromagnet counting).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { fmt, texNum, texMatrix } from '../../core/format.js';
import * as M from './math.js';

const { TAU, PI, v3 } = M;
const LAM = 0.5; // so m_ρ = √(8λ) v = 2
const M_RHO = Math.sqrt(8 * LAM);
const AMP = 0.33; // ghost amplitude (rad)
const L_T = 0.42; // tangent arrow length
const DEF = () => ({ n: v3.normalize([0.42, -0.5, 0.76]), mode: 'afm', k: 1.2, showJ: false, playing: true });

export function mountO3(pg, scope, ctx) {
  const S = (ctx.state.o3 ??= DEF());
  if (!S.n.every(Number.isFinite)) S.n = DEF().n;

  // ------------------------------------------------------------------ views
  const v1 = pg.view({
    title: 'Vacuum manifold $\\grp{S^2=SO(3)/SO(2)}$',
    hint: 'drag the amber vacuum · drag empty space to orbit',
    height: 'var(--ssb-o3-h)',
  });
  const v2 = pg.view({
    title: 'Modes about the vacuum: $\\omega(k)$',
    hint: 'drag the marker to change $k$',
    height: 'var(--ssb-o3-h)',
  });

  // ---------------------------------------------------------------- 3D
  const k = scene3d(v1.body, scope, { camera: [3.1, -2.35, 1.75], target: [0, 0, 0], minDistance: 2.2, maxDistance: 10 });
  const axCols = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    a[i] = -1.32;
    b[i] = 1.32;
    k.line([a, b], { color: 'axis', width: 1, opacity: 0.9 });
    const lp = [0, 0, 0];
    lp[i] = 1.43;
    k.label('xyz'[i], lp, { color: axCols[i], small: true });
  }
  k.wireSphere({ radius: 1, color: 'grp', opacity: 0.2, lat: 8, lon: 16 });
  k.sphere({ radius: 0.992, color: 'grp', opacity: 0.08, segments: 64 });
  k.label('\\grp{|\\vec n|=v}', [-0.15, -0.62, -0.95], { small: true });

  const orbit1 = k.line([], { color: 'grp', width: 1.6, opacity: 0.6 });
  const orbit2 = k.line([], { color: 'grp', width: 1.6, opacity: 0.6 });
  const planeMat = k.basic('alg', { opacity: 0.1 });
  planeMat.depthWrite = false;
  const plane = new THREE.Mesh(new THREE.CircleGeometry(0.56, 64), planeMat);
  k.add(plane);
  const planeRim = k.line([], { color: 'alg', width: 1, opacity: 0.45 });
  const arr1 = k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.016, headLength: 0.1, headRadius: 0.04 });
  const arr2 = k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.016, headLength: 0.1, headRadius: 0.04 });
  const lab1 = k.label('\\alg{\\pi_1}', [0, 0, 0]);
  const lab2 = k.label('\\alg{\\pi_2}', [0, 0, 0]);
  const arrR = k.arrow([0, 0, 0], [0, 0, 1], { color: 'c1', radius: 0.014, headLength: 0.09, headRadius: 0.036 });
  const labR = k.label('\\rho', [0, 0, 0], { color: 'c1', small: true });
  const ring = k.line([], { color: 'c3', width: 2.2 });
  const ringDot = k.sphere({ radius: 0.022, color: 'c3', segments: 16 });
  const labH = k.label('H', [0, 0, 0], { color: 'c3', small: true });
  const jArrows = axCols.map((c) => k.arrow([0, 0, 0], [0, 0, 1], { color: c, radius: 0.009, headLength: 0.07, headRadius: 0.026 }));
  const jLabels = axCols.map((c, i) => k.label(`X_${'xyz'[i]}\\langle n\\rangle`, [0, 0, 0], { color: c, small: true }));
  const ghosts = [0, 1].map(() => k.sphere({ radius: 0.034, color: 'alg', segments: 18 }));
  const ghostPaths = [0, 1].map(() => k.line([], { color: 'alg', width: 1.4, opacity: 0.7, dashed: true, dashSize: 0.04, gapSize: 0.03 }));
  const vac = k.sphere({ radius: 0.062, color: 'hi', segments: 28 });
  const labVac = k.label('\\langle\\vec n\\rangle', [0, 0, 0], { small: true });
  k.draggable(vac, {
    constrain: k.onSphere([0, 0, 0], 1),
    onDrag: (q) => {
      setVac(q);
      walk = null;
    },
  });

  let tAnim = 0;
  let walk = null; // {from, axis, t, T, ang}

  function setVac(q) {
    const n = v3.normalize(q);
    if (!n.every(Number.isFinite)) return;
    S.n = n;
    updateGeometry();
    updateReadouts();
  }

  function updateGeometry() {
    const n = S.n;
    const [e1, e2] = M.tangentFrame(n);
    vac.position.set(...n);
    labVac.setPosition(v3.add(v3.scale(n, 1.0), v3.scale(v3.add(e1, e2), -0.16)));
    plane.position.set(n[0] * 1.002, n[1] * 1.002, n[2] * 1.002);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
    const rim = [];
    for (let i = 0; i <= 96; i++) {
      const a = (TAU * i) / 96;
      rim.push(v3.add(n, v3.combo(e1, 0.56 * Math.cos(a), e2, 0.56 * Math.sin(a))));
    }
    planeRim.setPoints(rim);
    const t1 = v3.add(n, v3.scale(e1, L_T));
    const t2 = v3.add(n, v3.scale(e2, L_T));
    arr1.set(n, t1);
    arr2.set(n, t2);
    lab1.setPosition(v3.add(t1, v3.scale(e1, 0.09)));
    lab2.setPosition(v3.add(t2, v3.scale(e2, 0.09)));
    const tr = v3.scale(n, 1.3);
    arrR.set(v3.scale(n, 1.0), tr);
    labR.setPosition(v3.add(tr, v3.scale(n, 0.08)));
    // orbits of the broken one-parameter subgroups: great circles through ⟨n⟩
    const g1 = [];
    const g2 = [];
    for (let i = 0; i <= 160; i++) {
      const b = (TAU * i) / 160;
      g1.push(v3.scale(M.alongGreatCircle(n, e1, b), 1.003));
      g2.push(v3.scale(M.alongGreatCircle(n, e2, b), 1.003));
    }
    orbit1.setPoints(g1);
    orbit2.setPoints(g2);
    // unbroken H = SO(2): a ring about ⟨n⟩ (it rotates the tangent plane, fixes the point)
    const rp = [];
    const rr = 0.2;
    for (let i = 0; i <= 64; i++) {
      const a = (TAU * i) / 64;
      rp.push(v3.add(v3.scale(n, 1.03), v3.combo(e1, rr * Math.cos(a), e2, rr * Math.sin(a))));
    }
    ring.setPoints(rp);
    labH.setPosition(v3.add(v3.scale(n, 1.03), v3.combo(e1, -0.27, e2, -0.27)));
    // generator images X_a⟨n⟩ = ê_a × ⟨n⟩
    const J = M.genAction(n);
    J.forEach((w, i) => {
      const tip = v3.add(n, v3.scale(w, L_T * 0.9));
      jArrows[i].set(n, tip);
      jArrows[i].visible = S.showJ && v3.norm(w) > 0.04;
      jLabels[i].setPosition(v3.add(tip, v3.scale(w, 0.12)));
      jLabels[i].setVisible(S.showJ && v3.norm(w) > 0.25);
    });
    // ghost paths
    if (S.mode === 'afm') {
      [e1, e2].forEach((e, i) => {
        const pts = [];
        for (let j = 0; j <= 30; j++) pts.push(v3.scale(M.alongGreatCircle(n, e, AMP * (2 * j / 30 - 1)), 1.012));
        ghostPaths[i].setPoints(pts);
        ghostPaths[i].visible = true;
      });
    } else {
      const pts = [];
      for (let j = 0; j <= 72; j++) {
        const a = (TAU * j) / 72;
        pts.push(v3.scale(v3.add(v3.scale(n, Math.cos(AMP)), v3.combo(e1, Math.sin(AMP) * Math.cos(a), e2, Math.sin(AMP) * Math.sin(a))), 1.012));
      }
      ghostPaths[0].setPoints(pts);
      ghostPaths[1].visible = false;
    }
  }

  function omegaOfMode() {
    return S.mode === 'afm' ? M.disp.typeA(S.k) : M.disp.typeB(S.k);
  }

  function updateGhosts() {
    const n = S.n;
    const [e1, e2] = M.tangentFrame(n);
    const ph = tAnim;
    if (S.mode === 'afm') {
      // two independent linear oscillators (type A): one along each broken direction
      ghosts[0].visible = ghosts[1].visible = true;
      ghosts[0].position.set(...v3.scale(M.alongGreatCircle(n, e1, AMP * Math.sin(ph)), 1.012));
      ghosts[1].position.set(...v3.scale(M.alongGreatCircle(n, e2, AMP * Math.sin(ph + 1.9)), 1.012));
    } else {
      // one precessing mode (type B): the two broken directions are canonically conjugate
      ghosts[0].visible = true;
      ghosts[1].visible = false;
      const p = v3.add(v3.scale(n, Math.cos(AMP)), v3.combo(e1, Math.sin(AMP) * Math.cos(ph), e2, Math.sin(AMP) * Math.sin(ph)));
      ghosts[0].position.set(...v3.scale(p, 1.012));
    }
    // a marker turning round the unbroken ring: H acts, the vacuum stays put
    const a = 0.8 * tAnimH;
    ringDot.position.set(...v3.add(v3.scale(n, 1.03), v3.combo(e1, 0.2 * Math.cos(a), e2, 0.2 * Math.sin(a))));
  }
  let tAnimH = 0;

  // ---------------------------------------------------------------- dispersion plot
  const K_MAX = 2.6;
  const W_MAX = 3.6;
  const pd = plot2d(v2.body, scope, {
    x: [-0.42, K_MAX + 0.15],
    y: [-0.42, W_MAX],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: drawDisp,
  });
  pd.handle({
    get: () => [S.k, omegaOfMode()],
    set: ([x]) => {
      S.k = M.clamp(x, 0, K_MAX);
      sK.set(S.k, { silent: true });
      updateReadouts();
    },
    color: 'hi',
    r: 6,
  });
  function drawDisp(p) {
    // axes and ticks
    p.segment([0, 0], [K_MAX + 0.08, 0], { color: 'axis', width: 1.25 });
    p.segment([0, 0], [0, W_MAX - 0.05], { color: 'axis', width: 1.25 });
    for (let x = 0.5; x <= K_MAX; x += 0.5) {
      p.segment([x, 0], [x, -0.05], { color: 'axis', width: 1 });
      if (Math.abs(x - Math.round(x)) < 1e-9) p.tex(String(Math.round(x)), [x, 0], { key: 'kx' + x, offset: [0, 12], small: true, color: 'muted' });
    }
    for (let y = 1; y < W_MAX; y += 1) {
      p.segment([0, y], [-0.04, y], { color: 'axis', width: 1 });
      p.tex(String(y), [0, y], { key: 'wy' + y, offset: [-10, 0], small: true, color: 'muted' });
    }
    p.tex('k', [K_MAX + 0.08, 0], { key: 'axk', offset: [0, 13], small: true });
    p.tex('\\omega', [0, W_MAX - 0.05], { key: 'axw', offset: [-12, 2], small: true });
    const curve = (f) => {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const x = (K_MAX * i) / 120;
        pts.push([x, f(x)]);
      }
      return pts;
    };
    const afm = S.mode === 'afm';
    p.line(curve((x) => M.disp.higgs(x, M_RHO)), { color: 'c1', width: 2.5 });
    p.segment([0, M_RHO], [0.12, M_RHO], { color: 'c1', width: 2 });
    p.tex('m_\\rho', [0, M_RHO], { key: 'mrho', offset: [-14, 0], small: true, color: 'c1' });
    p.tex('\\text{amplitude (Higgs) mode}', [1.3, M.disp.higgs(1.3, M_RHO)], { key: 'lh', offset: [-6, -14], align: 'right', small: true, color: 'c1' });
    p.line(curve((x) => Math.min(W_MAX, M.disp.typeA(x))), { color: 'alg', width: afm ? 2.6 : 1.4, alpha: afm ? 1 : 0.45, dash: afm ? [] : [6, 5] });
    p.line(curve((x) => Math.min(W_MAX, M.disp.typeB(x))), { color: 'alg', width: afm ? 1.4 : 2.6, alpha: afm ? 0.45 : 1, dash: afm ? [6, 5] : [] });
    p.tex('\\text{AFM: 2 modes, }\\omega=c|k|', [1.15, M.disp.typeA(1.15)], { key: 'la', offset: [-10, -10], align: 'right', small: true, color: afm ? 'alg' : 'muted' });
    p.tex('\\text{FM: 1 mode, }\\omega\\propto k^2', [1.7, M.disp.typeB(1.7)], { key: 'lb', offset: [12, 10], align: 'left', small: true, color: afm ? 'muted' : 'alg' });
    // marker at the chosen k
    p.segment([S.k, 0], [S.k, M.disp.higgs(S.k, M_RHO)], { color: 'hi', width: 1.2, dash: [4, 4], alpha: 0.8 });
    p.dot([S.k, M.disp.higgs(S.k, M_RHO)], { r: 4, color: 'c1' });
  }

  // ------------------------------------------------------------------ panel
  const secV = pg.section('Vacuum $\\langle\\vec n\\rangle$');
  ui.buttons(secV, [
    { label: 'North pole', onClick: () => goTo([0, 0, 1]) },
    { label: 'Random vacuum', onClick: () => goTo(M.v3.normalize([gs(), gs(), gs()])) },
    { label: 'Walk along $\\alg{\\pi_1}$', onClick: () => startWalk() },
  ]);
  const tJ = ui.toggle(secV, {
    label: 'Show $\\alg{X_a}\\langle\\vec n\\rangle$ for $a=x,y,z$',
    value: S.showJ,
    onChange: (v) => {
      S.showJ = v;
      updateGeometry();
    },
  });

  const secM = pg.section('Goldstone dynamics');
  const segMode = ui.segmented(secM, {
    options: [
      { value: 'afm', label: 'Antiferromagnet (type A)' },
      { value: 'fm', label: 'Ferromagnet (type B)' },
    ],
    value: S.mode,
    onChange: (v) => {
      S.mode = v;
      updateGeometry();
      updateReadouts();
      pd.invalidate();
    },
  });
  const sK = ui.slider(secM, {
    label: 'Wavenumber $k$ of the mode',
    min: 0,
    max: K_MAX,
    step: 0.01,
    value: S.k,
    onInput: (x) => {
      S.k = x;
      updateReadouts();
    },
  });
  const rowP = ui.h('div', { class: 'btn-row' });
  secM.appendChild(rowP);
  const play = ui.playButton(rowP, { playing: S.playing, onToggle: (on) => (S.playing = on) });
  ui.button(rowP, {
    label: 'Reset',
    onClick: () => {
      const d = DEF();
      S.k = d.k;
      sK.set(d.k, { silent: true });
      segMode.set('afm', { silent: true });
      S.mode = 'afm';
      tJ.set(false);
      goTo(d.n);
      play.set(true);
    },
  });

  const secC = pg.section('Counting');
  const outJ = ui.readout(secC, { label: 'Generators acting on the vacuum, $X_a\\langle\\vec n\\rangle=\\hat e_a\\times\\langle\\vec n\\rangle$ (columns)' });
  const outH = ui.readout(secC, { label: 'Mass matrix $\\partial^2V$ at the vacuum' });
  const kv = ui.keyValue(secC, [
    ['$\\dim G-\\dim H$', '$3-1=2$'],
    ['$\\langle[Q_a,Q_b]\\rangle$', ''],
    ['Goldstone modes', ''],
    ['$\\omega(k)$ at this $k$', ''],
  ]);
  ui.legend(pg.section('Legend'), [
    { color: 'grp', label: 'vacuum manifold $S^2$ and orbits $e^{t X}\\langle\\vec n\\rangle$' },
    { color: 'alg', label: 'broken directions $\\pi_{1,2}$ (Goldstones)' },
    { color: 'c3', label: 'unbroken $H=SO(2)$: rotation about $\\langle\\vec n\\rangle$' },
    { color: 'c1', label: 'radial (amplitude) mode $\\rho$' },
    { color: 'hi', label: 'the vacuum $\\langle\\vec n\\rangle$', dot: true },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Drag the vacuum anywhere',
      text: 'Every point of the sphere is a vacuum. Wherever you put $\\langle\\vec n\\rangle$ there are exactly two tangent (flat) directions and one radial (massive) one; the mass matrix always has eigenvalues $(m_\\rho^2,0,0)$.',
      apply: () => goTo(M.v3.normalize([-0.6, -0.55, 0.58])),
    },
    {
      title: 'Which generator survives?',
      text: 'At the north pole, $X_z\\hat z=0$: rotations about $z$ fix the vacuum (unbroken $H=SO(2)$), while $X_x\\hat z=-\\hat y$ and $X_y\\hat z=\\hat x$ move it. The $3\\times3$ matrix of $X_a\\langle\\vec n\\rangle$ has rank 2 at <i>every</i> vacuum: $\\dim G/H$.',
      apply: () => {
        tJ.set(true);
        goTo([0, 0, 1]);
      },
    },
    {
      title: 'Walk along an orbit',
      text: 'A broken generator carries the vacuum along a great circle — to another, equivalent vacuum, at no cost in energy. A Goldstone boson of wavenumber $k\\to0$ is exactly this: a uniform rotation of the order parameter.',
      apply: () => startWalk(),
    },
    {
      title: 'Ferromagnet: one magnon, not two',
      text: 'Same $G/H$, but now the order parameter is the conserved spin itself: $\\langle[Q_x,Q_y]\\rangle=i\\langle Q_z\\rangle\\neq0$. The two broken generators are conjugate (like $x$ and $p$), the vacuum <b>precesses</b>, and there is a single Goldstone with $\\omega\\propto k^2$: $n_A+2n_B=2$.',
      apply: () => {
        segMode.set('fm');
        play.set(true);
      },
    },
    {
      title: 'Long waves cost nothing',
      text: 'Slide $k\\to0$: both Goldstone branches go to $\\omega=0$ and the oscillation freezes, while the amplitude mode keeps its gap $m_\\rho=\\sqrt{8\\lambda}\\,v$. Gaplessness is the hallmark of a broken continuous symmetry.',
      apply: () => {
        sK.set(0.25);
        play.set(true);
      },
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>A three-component field $\\vec n$ with the $O(3)$-invariant potential $V=\\lambda(|\\vec n|^2-v^2)^2$. Its minima form the
    <b>violet sphere</b> $|\\vec n|=v$. Choosing a vacuum $\\langle\\vec n\\rangle$ (amber) leaves only the rotations about
    $\\langle\\vec n\\rangle$ unbroken (teal ring, $H=SO(2)$); the other two generators move the vacuum along great circles
    (violet). Their tangent vectors (orange) span the tangent plane: the two Goldstone directions. Moving radially (blue)
    changes $|\\vec n|$ and costs energy — the massive amplitude mode.</p>
    <p>The little orange dots show one site of a long-wavelength wave: in the <b>antiferromagnet</b> two independent
    oscillations, one along each broken direction; in the <b>ferromagnet</b> a single precession about $\\langle\\vec n\\rangle$.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>The Goldstones live in the tangent plane of the
    vacuum manifold. A sphere has a two-dimensional tangent plane, so there are two — no matter which vacuum was chosen,
    because $SO(3)$ moves any vacuum to any other.</div>`);

  pg.note(`<h2>The physics</h2>
    <p><b>Antiferromagnets.</b> The Néel order parameter (staggered magnetisation) $\\vec n$ breaks spin rotations $SO(3)\\to SO(2)$.
    At long wavelengths only the direction $\\hat n\\in S^2$ matters, governed by the <b>$O(3)$ non-linear sigma model</b>,</p>
    $$\\mathcal L=\\frac{\\rho_s}{2}\\Bigl(\\frac1{c^2}(\\partial_t\\hat n)^2-(\\nabla\\hat n)^2\\Bigr),\\qquad \\hat n\\cdot\\hat n=1,$$
    <p>whose two transverse fluctuations are the two linearly dispersing magnons, $\\omega=c|k|$, seen in neutron scattering.</p>
    <p><b>Ferromagnets</b> have the same $G/H=S^2$ but only <b>one</b> magnon, with $\\omega\\propto k^2$. The order parameter
    is the total spin, a conserved charge, so the broken generators fail to commute in the vacuum:
    $\\langle[Q_x,Q_y]\\rangle=i\\langle Q_z\\rangle\\neq0$. Such pairs are canonically conjugate and make one "type-B" mode.
    The general count (Watanabe–Murayama) is</p>
    $$n_A+2n_B=\\dim G/H,\\qquad n_B=\\tfrac12\\operatorname{rank}\\langle[Q_a,Q_b]\\rangle .$$
    <div class="callout physics"><span class="callout-title">Mermin–Wagner</span>Goldstone fluctuations are soft, and
    $\\langle\\delta\\hat n^2\\rangle\\propto\\int d^dk\\,\\frac{T}{\\rho_s k^2}$ diverges at small $k$ for $d\\le2$. So at any $T>0$
    a continuous symmetry cannot break spontaneously in one or two dimensions (Coleman's theorem is the quantum version in
    $1+1$ dimensions) — the thermal wandering you can switch on in the first tab.</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>Split the Lie algebra into the stabiliser of the vacuum and the rest, $\\g=\\hh\\oplus\\mathfrak m$ with
    $\\hh=\\{X:X\\langle\\vec n\\rangle=0\\}$. The map $X\\mapsto X\\langle\\vec n\\rangle$ identifies $\\mathfrak m$ with the
    tangent space $T_{\\langle n\\rangle}(G/H)$, so the Goldstone fields are coordinates on $\\mathfrak m$:</p>
    $$\\#\\,\\text{Goldstones}=\\dim\\mathfrak m=\\operatorname{rank}\\bigl(X_a\\langle\\vec n\\rangle\\bigr)=\\dim G-\\dim H .$$
    <p>For $O(3)$, $X_a\\vec n=\\hat e_a\\times\\vec n$ and the matrix is $-[\\vec n]_\\times$, of rank 2. The unbroken $SO(2)$ rotates
    the tangent plane, so $(\\pi_1,\\pi_2)$ form a doublet of $H$ — Goldstones always carry a representation of the unbroken group.
    In general $O(N)\\to O(N-1)$ gives the sphere $S^{N-1}$ and $N-1$ Goldstones; the rotation group itself is the subject of
    <a href="#/so3">SO(3)</a>.</p>`);

  // ------------------------------------------------------------------ actions & animation
  function gs() {
    return M.gauss();
  }
  function goTo(target) {
    const a = S.n;
    const b = v3.normalize(target);
    const ang = Math.acos(M.clamp(v3.dot(a, b), -1, 1));
    if (ang < 1e-6) return setVac(b);
    let axis = v3.cross(a, b);
    if (v3.norm(axis) < 1e-9) axis = M.tangentFrame(a)[0];
    walk = { from: a, axis: v3.normalize(axis), t: 0, T: 0.4 + 0.5 * ang, ang };
  }
  function startWalk() {
    const n = S.n;
    const e1 = M.tangentFrame(n)[0];
    // the broken generator that moves n along e1 is the rotation about n × e1
    walk = { from: n, axis: v3.normalize(v3.cross(n, e1)), t: 0, T: 2.6, ang: 1.25 };
  }

  scope.frame((dt) => {
    if (walk) {
      walk.t += dt;
      const s = M.clamp(walk.t / walk.T, 0, 1);
      const e = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
      setVac(M.rotate(walk.from, walk.axis, walk.ang * e));
      if (s >= 1) walk = null;
    }
    if (play.playing) {
      tAnim += dt * omegaOfMode();
      tAnimH += dt;
    }
    updateGhosts();
  });

  function updateReadouts() {
    const n = S.n;
    const J = M.genAction(n);
    const cols = [0, 1, 2].map((i) => [J[0][i], J[1][i], J[2][i]]);
    const rk = M.rank3(J);
    outJ.set(`\\bigl(X_x\\langle n\\rangle\\,X_y\\langle n\\rangle\\,X_z\\langle n\\rangle\\bigr)=${texMatrix(cols, 2)},\\quad \\operatorname{rank}=${rk}`);
    const Hm = M.o3Hessian(n, LAM, 1);
    outH.set(`8\\lambda v^2\\,\\hat n\\hat n^{\\mathsf T}=${texMatrix(Hm, 2)}\\ \\to\\ (${texNum(8 * LAM, 0)},0,0)`);
    const afm = S.mode === 'afm';
    kv.set('$\\langle[Q_a,Q_b]\\rangle$', afm ? '$0$ (no net spin)' : '$i\\epsilon_{abc}M\\,n_c\\neq0$');
    kv.set('Goldstone modes', afm ? '2, type A, $\\omega=c|k|$' : '1, type B, $\\omega\\propto k^2$');
    kv.set('$\\omega(k)$ at this $k$', `${fmt(omegaOfMode(), 2)} (Goldstone) · ${fmt(M.disp.higgs(S.k, M_RHO), 2)} (Higgs)`);
    pd.invalidate();
  }

  updateGeometry();
  updateGhosts();
  updateReadouts();
  void fmt;
}
