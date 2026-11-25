// sp2 · tab "Hamiltonian flows": a quadratic Hamiltonian as a linear, area-preserving flow of the phase plane
// (left) and as a point of the algebra sp(2,R) ≅ so(2,1) with its adjoint orbit (right).
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { mat, clamp, TAU } from '../../core/la.js';
import { fmt, texMatrix, texNum } from '../../core/format.js';
import {
  generator, quadMatrix, energy, classify, flow, field, toMinkowski, fromMinkowski, conjugate, rot, squeeze, levelFamily,
  levelSet, discPolygon, sectorPolygon, mapPoints, polygonArea, classifyElement, realEigenvectors, discriminant,
} from './math.js';
import { TYPE_COLOR, TYPE_BADGE, TYPE_LABEL, texHamiltonian, throttle, fitCamera, axisLabels } from './common.js';

const BLOB_R = 0.42;
const T_MAX = 12;
const RB = 2.0; // radius of the displayed region of sp(2,R) (cylinder)
const TB = 2.0; // half height

const PRESETS = {
  oscillator: { h: { a: 1, b: 0, c: 1 }, z0: [1.35, 0] },
  free: { h: { a: 1, b: 0, c: 0 }, z0: [-1.9, 0.6] },
  inverted: { h: { a: 1, b: 0, c: -1 }, z0: [-1.55, 1.7] },
  squeezer: { h: { a: 0, b: 1, c: 0 }, z0: [0.22, 2.1] },
  rotating: { h: { a: -1, b: 0, c: -1 }, z0: [1.35, 0] },
};

export function mountFlows(pg, scope, ctx) {
  const S = (ctx.state.flows ??= { a: 1, b: 0.25, c: 0.5, t: 0, z0: [1.35, 0.1], playing: true });
  let tour = null; // conjugation tour along the adjoint orbit
  let seq = null; // two-step construction of −diag(2, ½)
  let dragging = false;

  const H = () => ({ a: S.a, b: S.b, c: S.c });
  const disc0 = () => discPolygon(S.z0, BLOB_R, 160);
  const sector0 = () => sectorPolygon(S.z0, BLOB_R, 0, Math.PI / 2, 30);

  // ------------------------------------------------------------------ views
  const v1 = pg.view({
    title: 'Phase plane · flow $\\grp{M(t)}=e^{t\\alg{X}}$',
    hint: 'drag the blob · scroll to zoom · double-click to reset',
  });
  const v2 = pg.view({
    title: 'Algebra $\\sp(2,\\R)\\cong\\so(2,1)$ · adjoint orbit of $H$',
    hint: 'drag the point · drag empty space to orbit',
  });

  // current group element acting on the blob
  function currentMap() {
    if (seq) {
      const s = Math.min(seq.s, 2);
      return s <= 1 ? squeeze(s * Math.LN2) : mat.mul(rot(Math.PI * (s - 1)), squeeze(Math.LN2));
    }
    return flow(H(), S.t);
  }

  // level sets are cached per (H, radius)
  let famKey = '';
  let fam = [];
  let orbitKey = '';
  let orbitPts = [];
  function viewRadius(p) {
    const v = p.view;
    return Math.max(Math.hypot(v.x[0], v.y[0]), Math.hypot(v.x[1], v.y[0]), Math.hypot(v.x[0], v.y[1]), Math.hypot(v.x[1], v.y[1]));
  }

  const p = plot2d(v1.body, scope, {
    x: [-3, 3],
    y: [-3, 3],
    draw(p) {
      axisLabels(p, 'q', 'p');
      const h = H();
      const cls = classify(h);
      const R = 1.08 * viewRadius(p);
      const key = `${h.a.toFixed(4)},${h.b.toFixed(4)},${h.c.toFixed(4)},${R.toFixed(2)}`;
      if (key !== famKey) {
        famKey = key;
        const count = Math.min(26, Math.ceil(R / 0.5));
        fam = cls.type === 'zero' ? [] : levelFamily(h, R, 0.5, count);
      }
      const tc = TYPE_COLOR[cls.type];
      for (const L of fam) {
        if (L.h === 0) p.line(L.pts, { color: tc, width: 1.4, alpha: 0.8, dash: [6, 4] });
        else p.line(L.pts, { color: tc, width: 1, alpha: 0.3 });
      }
      if (cls.type !== 'zero') p.vectorField((q, pp) => field(h, q, pp), { color: 'alg', step: 40, alpha: 0.5, width: 1.1 });

      // stable / unstable directions of a hyperbolic flow
      if (cls.type === 'hyperbolic') {
        const ev = realEigenvectors(generator(h));
        if (ev) {
          const r = 0.78 * Math.min(p.view.x[1] - p.view.x[0], p.view.y[1] - p.view.y[0]) / 2;
          ev.forEach((e, i) => {
            const d = e.vec;
            const sgn = d[1] < 0 ? -1 : 1; // put the label in the upper half
            p.tex(i === 0 ? '\\text{unstable } e^{+\\lambda t}' : '\\text{stable } e^{-\\lambda t}', [sgn * d[0] * r, sgn * d[1] * r], {
              key: 'ev' + i,
              small: true,
              color: tc,
              offset: [0, -10],
            });
          });
        }
      }

      // orbit (level set) through the blob centre
      const hc = energy(h, ...S.z0);
      const okey = key + ',' + hc.toFixed(5);
      if (okey !== orbitKey && !seq) {
        orbitKey = okey;
        orbitPts = cls.type === 'zero' ? [] : levelSet(quadMatrix(h), hc, R);
      }
      if (!seq) p.line(orbitPts, { color: 'grp', width: 1.4, alpha: 0.7, dash: [2, 4] });

      // blob: initial ghost, target (sequence mode), current image
      const D0 = disc0();
      p.polygon(D0, { stroke: 'muted', width: 1.2, dash: [4, 4], strokeAlpha: 0.9 });
      if (seq) p.polygon(mapPoints([[-2, 0], [0, -0.5]], D0), { stroke: 'brk', width: 1.6, dash: [6, 4] });
      const M = currentMap();
      p.polygon(mapPoints(M, D0), { fill: 'grp', alpha: 0.2, stroke: 'grp', width: 1.8 });
      p.polygon(mapPoints(M, sector0()), { fill: 'grp', alpha: 0.55 });
      if (seq) p.tex('\\grp{-\\diag(2,\\frac12)}', [-2 * S.z0[0], -0.5 * S.z0[1] - BLOB_R * 0.9], { key: 'tgt', small: true, color: 'brk', offset: [0, 14] });
    },
  });
  p.handle({
    get: () => mat.mulv(currentMap(), S.z0),
    set: (z) => {
      seq = null;
      S.z0 = [clamp(z[0], -4, 4), clamp(z[1], -4, 4)];
      S.t = 0;
      tSlider.set(0, { silent: true });
      orbitKey = '';
      refresh(true);
    },
    onStart: () => (dragging = true),
    onEnd: () => (dragging = false),
    color: 'grp',
    r: 6,
  });

  // ------------------------------------------------------------------ 3D: sp(2,R) in Minkowski coordinates
  const k = scene3d(v2.body, scope, { camera: [4.6, -3.7, 2.3], target: [0, 0, 0] });
  fitCamera(k, 3.15, [4.2, 3.4, 2.4]);
  k.axes({ length: 2.45, negative: true, colors: ['muted', 'muted', 'muted'], labels: ['\\alg{K_1}', '\\alg{K_2}', '\\alg{K_0}'] });
  // null cone Δ = 0 (both nappes) + rulings and rims
  k.surface((u, v) => [u * RB * Math.cos(v), u * RB * Math.sin(v), u * RB], [-1, 1], [0, TAU], 24, 72, {
    color: 'ink2',
    opacity: 0.06,
  });
  {
    const pos = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      pos.push(-RB * Math.cos(a), -RB * Math.sin(a), -RB, RB * Math.cos(a), RB * Math.sin(a), RB);
    }
    for (const z of [-RB, RB]) {
      for (let j = 0; j < 96; j++) {
        const a = (j / 96) * TAU;
        const b = ((j + 1) / 96) * TAU;
        pos.push(RB * Math.cos(a), RB * Math.sin(a), z, RB * Math.cos(b), RB * Math.sin(b), z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    k.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: k.color('muted'), transparent: true, opacity: 0.32, depthWrite: false })));
  }
  k.label('\\text{null cone } \\Delta=0', [-RB * 0.55, RB * 0.85, -RB - 0.18], { small: true, color: 'muted' });
  k.label('\\text{elliptic } (\\Delta<0)', [-RB * 0.95, RB * 0.25, TB + 0.15], { small: true, color: 'c3' });
  k.label('\\text{hyperbolic } (\\Delta>0)', [RB * 0.2, -RB - 0.45, 0.25], { small: true, color: 'c8' });

  let orbitFn = null;
  const orbitMesh = k.surface((u, v) => [0, 0, 0], [0, 1], [0, TAU], 36, 72, { color: 'c3', opacity: 0.3 });
  const rings = [0, 1, 2, 3, 4].map(() => k.line([], { color: 'c3', width: 1.4, opacity: 0.75 }));
  const stalk = k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.016, headLength: 0.11, headRadius: 0.04 });
  const drop = k.line([], { color: 'muted', width: 1, dashed: true, dashSize: 0.05, gapSize: 0.05 });
  const foot = k.sphere({ radius: 0.03, color: 'muted' });
  const pt = k.sphere({ radius: 0.085, color: 'c3' });
  const ptLabel = k.label('H', [0, 0, 0], { small: true, offset: [12, -12] });
  k.draggable(pt, {
    onDrag: (q) => {
      cancelModes();
      let [x, y, t] = q;
      const r = Math.hypot(x, y);
      if (r > RB) {
        x *= RB / r;
        y *= RB / r;
      }
      t = clamp(t, -TB, TB);
      setH(fromMinkowski([x, y, t]), { fromUser: true });
    },
  });

  function ringCircle(r, z) {
    const pts = [];
    for (let j = 0; j <= 96; j++) {
      const a = (j / 96) * TAU;
      pts.push([r * Math.cos(a), r * Math.sin(a), z]);
    }
    return pts;
  }

  function update3d() {
    const h = H();
    const cls = classify(h);
    const [x, y, t] = toMinkowski(h);
    const col = TYPE_COLOR[cls.type];
    pt.material.color.copy(k.color(col));
    pt.position.set(x, y, t);
    stalk.set([0, 0, 0], [x, y, t]);
    drop.setPoints([
      [x, y, t],
      [x, y, 0],
    ]);
    foot.position.set(x, y, 0);
    ptLabel.setPosition([x, y, t]);
    // orbit surface and rings
    orbitFn = null;
    const ringPts = [];
    if (cls.type === 'elliptic') {
      const m = Math.sqrt(-cls.Delta);
      const sg = cls.sheet;
      if (m < TB) {
        const rmax = Math.min(RB, Math.sqrt(TB * TB - m * m));
        orbitFn = (u, v) => {
          const r = u * rmax;
          return [r * Math.cos(v), r * Math.sin(v), sg * Math.sqrt(r * r + m * m)];
        };
        for (let i = 1; i <= 5; i++) {
          const r = (i / 5) * rmax;
          ringPts.push(ringCircle(r, sg * Math.sqrt(r * r + m * m)));
        }
      }
    } else if (cls.type === 'hyperbolic') {
      const s = Math.sqrt(cls.Delta);
      if (s < RB) {
        const tmax = Math.min(TB, Math.sqrt(RB * RB - s * s));
        orbitFn = (u, v) => {
          const tt = (2 * u - 1) * tmax;
          const r = Math.sqrt(tt * tt + s * s);
          return [r * Math.cos(v), r * Math.sin(v), tt];
        };
        for (let i = 0; i < 5; i++) {
          const tt = (i / 4 - 0.5) * 2 * tmax;
          ringPts.push(ringCircle(Math.sqrt(tt * tt + s * s), tt));
        }
      }
    } else if (cls.type === 'parabolic') {
      const sg = cls.sheet;
      const rmax = Math.min(RB, TB);
      orbitFn = (u, v) => {
        const r = u * rmax;
        return [r * Math.cos(v), r * Math.sin(v), sg * r];
      };
      for (let i = 1; i <= 5; i++) ringPts.push(ringCircle((i / 5) * rmax, (sg * i * rmax) / 5));
    }
    orbitMesh.visible = !!orbitFn;
    if (orbitFn) {
      orbitMesh.update(orbitFn);
      orbitMesh.material.color.copy(k.color(col));
    }
    rings.forEach((rg, i) => {
      if (ringPts[i]) {
        rg.setPoints(ringPts[i]);
        rg.setColor(col);
        rg.visible = true;
      } else rg.visible = false;
    });
  }

  // ------------------------------------------------------------------ panel
  const secH = pg.section('Hamiltonian', { help: '$H=\\tfrac12\\left(a\\,p^2+2b\\,qp+c\\,q^2\\right)$' });
  const sl = {};
  for (const key of ['a', 'b', 'c']) {
    sl[key] = ui.slider(secH, {
      label: `$${key}$`,
      min: -2,
      max: 2,
      step: 0.01,
      value: S[key],
      onInput: (v) => {
        cancelModes();
        setH({ ...H(), [key]: v }, { fromUser: true });
      },
    });
  }
  ui.buttons(secH, [
    { label: 'Oscillator', small: true, onClick: () => preset('oscillator') },
    { label: 'Free particle', small: true, onClick: () => preset('free') },
    { label: 'Inverted', small: true, onClick: () => preset('inverted') },
    { label: 'Squeezer $qp$', small: true, onClick: () => preset('squeezer') },
    { label: 'Rotating frame', small: true, onClick: () => preset('rotating') },
  ]);
  ui.buttons(secH, [{ label: 'Conjugate along the orbit', small: true, onClick: () => startTour(), title: 'apply a loop of canonical transformations: H moves on its orbit, Δ stays fixed' }]);

  const secF = pg.section('Flow');
  const tSlider = ui.slider(secF, {
    label: 'Time $t$',
    min: 0,
    max: T_MAX,
    step: 0.01,
    value: S.t,
    onInput: (v) => {
      seq = null;
      S.t = v;
      refresh(true);
    },
  });
  const ctlRow = ui.h('div', { class: 'btn-row' });
  secF.appendChild(ctlRow);
  const play = ui.playButton(ctlRow, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  ui.button(ctlRow, {
    label: 'Reset $t=0$',
    onClick: () => {
      seq = null;
      S.t = 0;
      tSlider.set(0, { silent: true });
      refresh(true);
    },
  });

  const secR = pg.section('Readout');
  const badgeRow = ui.h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
  secR.appendChild(badgeRow);
  const badge = ui.badge(badgeRow, '', '');
  const expBadge = ui.badge(badgeRow, '', '');
  const outH = ui.readout(secR, { label: 'Hamiltonian' });
  const outM = ui.readout(secR, { label: 'Generator and group element' });
  const kv = ui.keyValue(secR, [
    ['Discriminant $\\Delta=b^2-ac$', ''],
    ['Rate', ''],
    ['$\\tr M(t)$', ''],
    ['$\\det M(t)$', ''],
    ['Blob area (initial)', ''],
  ]);
  ui.legend(secR, [
    { color: 'alg', label: 'vector field $\\alg{X}z$' },
    { color: 'grp', label: 'blob $\\grp{M(t)}D$' },
    { color: 'c3', label: 'elliptic' },
    { color: 'hi', label: 'parabolic' },
    { color: 'c8', label: 'hyperbolic' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Oscillator = rotation',
      text: '$H=\\tfrac12(p^2+q^2)$ turns phase space rigidly, <b>clockwise</b>, with period $2\\pi$. The blob neither stretches nor shrinks; $\\tr M=2\\cos t$ never leaves $[-2,2]$.',
      apply: () => preset('oscillator', true),
    },
    {
      title: 'Free particle = shear',
      text: '$H=p^2/2$: $q\\mapsto q+tp$. Fast particles overtake slow ones and the disc shears into an ever thinner ellipse of the <b>same area</b>. The point sits on the null cone ($\\Delta=0$).',
      apply: () => preset('free', true),
    },
    {
      title: 'Inverted oscillator = squeeze',
      text: '$H=\\tfrac12(p^2-q^2)$ (top of a potential hill): the blob slides in along the stable direction and is flung out along $p=q$, stretched by $e^{t}$ and compressed by $e^{-t}$. Liouville still holds — instability without dissipation.',
      apply: () => preset('inverted', true),
    },
    {
      title: 'Same orbit: $qp$ vs inverted oscillator',
      text: 'Both have $\\Delta=1$. Press <i>Conjugate along the orbit</i>: canonical changes of variables move $H$ over its whole hyperboloid while $\\Delta$ — the only invariant — stays fixed. The squeezer is the inverted oscillator turned by $45^\\circ$.',
      apply: () => {
        preset('squeezer', true);
        startTour();
      },
    },
    {
      title: 'Rotating frame: the other sheet',
      text: 'Seen from a frame turning at twice the oscillator frequency, $H\\to H-\\Omega K$ ($K=\\tfrac12(p^2+q^2)$, $\\Omega=2$) is negative definite and the motion runs anticlockwise. It lives on the <b>lower</b> sheet; no path of elliptic Hamiltonians connects the two sheets (energy sign, Krein signature).',
      apply: () => preset('rotating', true),
    },
    {
      title: 'A symplectic map that is no flow',
      text: '$M=-\\diag(2,\\tfrac12)$ has $\\det M=1$ but $\\tr M=-2.5$. Every flow has $\\tr e^{X}\\ge-2$, so $M\\neq e^{X}$ for <b>any</b> quadratic $H$. It takes two steps: squeeze with $qp$, then half a turn of the oscillator.',
      apply: () => startSeq(),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left: phase space of one degree of freedom. The faint curves are level sets of $H$ — ellipses, parallel lines or
    hyperbolas — and the orange arrows are the Hamiltonian vector field $\\alg{X}z$. A disc of initial conditions (with a
    marked quarter so you can see rotation and shear) is carried along by the group element $\\grp{M(t)}=e^{t\\alg X}$.
    However much it is sheared or squeezed, its <b>area is constant</b> (readout).</p>
    <p>Right: every quadratic Hamiltonian is a point of the three-dimensional algebra $\\sp(2,\\R)$, drawn in the
    coordinates $(x,y,t)=(\\tfrac{a-c}{2},\\,b,\\,\\tfrac{a+c}{2})$, in which the discriminant becomes a Minkowski norm,
    $$\\Delta=b^2-ac=x^2+y^2-t^2 .$$
    Inside the light cone (timelike) the flow is elliptic, outside (spacelike) hyperbolic, on the cone parabolic.</p>`);
  pg.note(`<h2>The physics</h2>
    <p>Hamilton's equations for $H=\\tfrac12(a p^2+2bqp+cq^2)$ are linear, $\\dot q=bq+ap$, $\\dot p=-cq-bp$, i.e.
    $\\dot z=\\alg Xz$ with $\\tr\\alg X=0$. Hence $\\det\\grp{M(t)}=e^{t\\,\\tr X}=1$: <b>Liouville's theorem</b>. A linear
    map is canonical iff it preserves the symplectic form $\\omega(z,z')=qp'-pq'$ (oriented area), i.e.
    $M^{\\mathsf T}JM=J$ with $J=\\begin{pmatrix}0&1\\\\-1&0\\end{pmatrix}$. For $2\\times2$ matrices
    $M^{\\mathsf T}JM=(\\det M)\\,J$, so in one degree of freedom $Sp(2,\\R)=SL(2,\\R)$: area preservation is the whole
    symplectic condition.</p>
    <p>Since $\\alg X^2=\\Delta\\,\\id$, the exponential is elementary:</p>
    $$e^{t\\alg X}=\\begin{cases}\\cos\\omega t\\,\\id+\\dfrac{\\sin\\omega t}{\\omega}\\alg X,&\\Delta=-\\omega^2<0\\\\[4pt]
      \\id+t\\alg X,&\\Delta=0\\\\[2pt] \\cosh\\lambda t\\,\\id+\\dfrac{\\sinh\\lambda t}{\\lambda}\\alg X,&\\Delta=\\lambda^2>0\\end{cases}$$
    <div class="callout intuition"><span class="callout-title">Intuition</span>Three kinds of motion, three kinds of
    group element: oscillation (a rotation, frequency $\\omega=\\sqrt{-\\Delta}$), free flight (a shear) and the
    inverted pendulum (a squeeze, Lyapunov exponent $\\lambda=\\sqrt{\\Delta}$). A canonical change of variables can
    tilt and stretch the ellipses, but it cannot change $\\Delta$: frequencies and growth rates are canonical
    invariants.</div>
    <p>Canonical changes of variables act by conjugation, $H\\mapsto H\\circ S^{-1}$, $\\alg X\\mapsto S\\alg XS^{-1}$,
    which preserves $\\Delta=\\tfrac12\\tr \\alg X^2$. The orbits are the level sets of $\\Delta$: one sheet of a
    two-sheeted hyperboloid (elliptic, sign of the energy fixed), a one-sheeted hyperboloid (hyperbolic) or a half
    cone (parabolic). These are exactly the <b>mass shells</b> of the Lorentz group in 2+1 dimensions — massive
    particles, tachyons and light-like momenta — because $SL(2,\\R)$ is the double cover of $SO^+(1,2)$ (see
    <a href="#/lorentz">Lorentz group</a>).</p>`);
  pg.note(`<h2>The mathematics</h2>
    <p>A convenient basis of quadratic Hamiltonians is</p>
    $$K_0=\\tfrac14(p^2+q^2),\\quad K_1=\\tfrac14(p^2-q^2),\\quad K_2=\\tfrac12 qp,$$
    $$H=2\\,(tK_0+xK_1+yK_2),$$
    <p>with Poisson brackets (checked analytically and numerically in <code>tests/sp2.test.mjs</code>)</p>
    $$\\brk{\\{K_0,K_1\\}}=K_2,\\qquad \\brk{\\{K_0,K_2\\}}=-K_1,\\qquad \\brk{\\{K_1,K_2\\}}=-K_0 .$$
    <p>$K_0$ generates rotations (compact), $K_1,K_2$ generate squeezes (boosts); the minus sign in
    $\\{K_1,K_2\\}=-K_0$ is what makes this $\\so(2,1)$ rather than $\\so(3)$. The Killing form
    $\\tr(\\alg X\\alg Y)$ has signature $(-,+,+)$ — the Minkowski metric of the picture. For the matrices,
    $\\alg X_{\\{f,g\\}}=[\\alg X_f,\\alg X_g]$.</p>
    <div class="callout warning"><span class="callout-title">exp is not onto</span>For every $\\alg X\\in\\sl(2,\\R)$,
    $\\tr e^{\\alg X}\\in\\{2\\cos\\omega,\\,2,\\,2\\cosh\\lambda\\}\\subset[-2,\\infty)$. So $-\\diag(2,\\tfrac12)$, with trace
    $-\\tfrac52$, is in $SL(2,\\R)$ but is not the time-one flow of any time-independent quadratic Hamiltonian.
    It is a product of two exponentials: a squeeze $e^{(\\ln 2)\\,\\diag(1,-1)}$ (the flow of $qp$) followed by half a turn
    of the oscillator, $e^{\\pi \\alg X_{\\rm osc}}=-\\id$. Such elements appear as the one-period maps of
    parametrically driven systems (next tab).</div>`);
  pg.note(`<h2>Going further</h2>
    <ul>
    <li><b>Ray optics.</b> Paraxial rays $(x,\\theta)$ propagate by $ABCD$ matrices with $AD-BC=1$: free propagation
    is a shear in $x$, a thin lens a shear in $\\theta$ — the same $Sp(2,\\R)$.</li>
    <li><b>Quantum squeezing.</b> The quantised $K_i$ (Weyl ordered) obey $[K_i,K_j]$ with the same structure
    constants times $i$. The squeeze operator of quantum optics is $S(r)=e^{\\frac r2(a^2-a^{\\dagger 2})}=e^{2irK_2}$; it
    turns the vacuum into a squeezed state whose Wigner ellipse is the blob you see.</li>
    <li><b>Metaplectic representation.</b> On $L^2(\\R)$ the $K_i$ form a projective representation of $SL(2,\\R)$:
    the Casimir $K_0^2-K_1^2-K_2^2=-\\tfrac3{16}$ ($k=\\tfrac14,\\tfrac34$ on even/odd states), and the full turn
    $e^{-2\\pi i\\,(a^\\dagger a+1/2)}=-1$. The double cover $Mp(2,\\R)$ is behind the Gouy and Maslov phases.</li>
    <li>The phase-space <i>translations</i>, generated by linear Hamiltonians, do not commute quantum mechanically:
    see the <a href="#/heisenberg">Heisenberg group</a>. $Sp(2,\\R)$ acts on it by automorphisms.</li>
    </ul>`);

  // ------------------------------------------------------------------ state changes
  function setH(h, { fromUser = false, keepT = false } = {}) {
    S.a = clamp(h.a, -2, 2);
    S.b = clamp(h.b, -2, 2);
    S.c = clamp(h.c, -2, 2);
    for (const key of ['a', 'b', 'c']) sl[key].set(S[key], { silent: true });
    if (fromUser && !keepT) {
      // keep the current picture continuous: restart the flow from where the blob is now? simpler: restart time
      S.t = 0;
      tSlider.set(0, { silent: true });
    }
    orbitKey = '';
    update3d();
    refresh(true);
  }
  function cancelModes() {
    tour = null;
    seq = null;
  }
  function preset(name, autoplay = false) {
    cancelModes();
    const P = PRESETS[name];
    S.z0 = P.z0.slice();
    setH(P.h, { fromUser: true });
    if (autoplay && !S.playing) play.set(true);
  }
  function startTour() {
    seq = null;
    tour = { s: 0, base: H() };
  }
  function startSeq() {
    tour = null;
    S.z0 = [0.75, 1.1];
    seq = { s: 0 };
    S.t = 0;
    tSlider.set(0, { silent: true });
    if (!S.playing) play.set(true);
    setSeqH();
    refresh(true);
  }
  function setSeqH() {
    const h = seq.s < 1 ? { a: 0, b: 1, c: 0 } : { a: 1, b: 0, c: 1 };
    if (h.a !== S.a || h.b !== S.b || h.c !== S.c) {
      S.a = h.a;
      S.b = h.b;
      S.c = h.c;
      for (const key of ['a', 'b', 'c']) sl[key].set(S[key], { silent: true });
      orbitKey = '';
      update3d();
    }
  }

  const gate = throttle(110);
  function refresh(force = false) {
    p.invalidate();
    if (!gate(force)) return;
    const h = H();
    const cls = classify(h);
    const X = generator(h);
    const M = currentMap();
    const ce = classifyElement(M);
    badge.set(TYPE_LABEL[cls.type], TYPE_BADGE[cls.type]);
    if (seq) expBadge.set(seq.s >= 2 ? '$\\tr M<-2$: not $e^{X}$' : 'two-step map', 'brk');
    else expBadge.set(ce.isExp ? '$M(t)=e^{tX}$' : 'not an exponential', ce.isExp ? 'grp' : 'brk');
    outH.set(texHamiltonian(h));
    outM.set(`\\alg{X}=${texMatrix(X, 2)},\\;\\; \\grp{M}=${texMatrix(M, 2)}`);
    kv.set('Discriminant $\\Delta=b^2-ac$', fmt(discriminant(h), 3));
    let rate = '—';
    if (cls.type === 'elliptic') rate = `ω = ${fmt(cls.omega, 3)}, T = ${fmt(cls.period, 2)}`;
    else if (cls.type === 'hyperbolic') rate = `λ = ${fmt(cls.lambda, 3)}`;
    else if (cls.type === 'parabolic') rate = 'shear (linear in t)';
    kv.set('Rate', rate);
    kv.set('$\\tr M(t)$', fmt(ce.tr, 3));
    kv.set('$\\det M(t)$', fmt(mat.det(M), 6));
    const D0 = disc0();
    kv.set('Blob area (initial)', `${fmt(polygonArea(mapPoints(M, D0)), 4)} (${fmt(polygonArea(D0), 4)})`);
  }

  // ------------------------------------------------------------------ animation
  scope.frame((dt) => {
    if (tour) {
      tour.s += dt / 7;
      if (tour.s >= 1) {
        const base = tour.base;
        tour = null;
        setH(base, { keepT: true });
      } else {
        const s = tour.s;
        const g = mat.mul(rot(Math.PI * s), squeeze(0.38 * Math.sin(TAU * s)));
        setH(conjugate(tour.base, g), { keepT: true });
      }
    }
    if (!S.playing || dragging) return;
    if (seq) {
      seq.s += dt * 0.45;
      if (seq.s > 3) seq.s = 0;
      setSeqH();
      refresh();
      return;
    }
    const h = H();
    const cls = classify(h);
    let t = S.t + dt;
    if (cls.type === 'elliptic' && cls.period <= T_MAX) t = t % cls.period;
    else if (t > T_MAX) t = 0;
    else if (cls.type !== 'elliptic') {
      const c = mat.mulv(flow(h, t), S.z0);
      const v = p.view;
      const R = Math.max(v.x[1] - v.x[0], v.y[1] - v.y[0]) * 0.75;
      if (Math.hypot(c[0] - (v.x[0] + v.x[1]) / 2, c[1] - (v.y[0] + v.y[1]) / 2) > R) t = 0;
    }
    S.t = t;
    tSlider.set(t, { silent: true });
    refresh();
  });

  update3d();
  refresh(true);
  void texNum;
}
