// Tab (b): rank-3 root systems in 3D (A3, B3, C3) with mirror planes and a reflected probe frame.

import * as ui from '../../core/ui.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { mat, vec, clamp, easeInOut, mulberry32 } from '../../core/la.js';
import { texMatrix } from '../../core/format.js';
import * as R from './math.js';
import { dynkinSVG } from './dynkin-svg.js';

const RANK3 = [
  { id: 'A3', label: '$A_3$', t: 'A', group: 'SU(4)\\cong Spin(6)', alg: '\\su(4)\\cong\\so(6)', text: '12 roots at the vertices of a cuboctahedron. $\\su(4)\\cong\\so(6)$: Wigner’s spin–isospin SU(4) of nuclei and the Pati–Salam colour group with lepton number as the fourth colour.' },
  { id: 'B3', label: '$B_3$', t: 'B', group: 'SO(7)', alg: '\\so(7)', text: '12 long roots (a cuboctahedron) plus 6 short ones (an octahedron): rotations in seven dimensions; $Spin(7)$ acts on 8-component spinors and contains $G_2$.' },
  { id: 'C3', label: '$C_3$', t: 'C', group: 'Sp(3)', alg: '\\sp(6)', text: '6 long roots (octahedron) and 12 short ones (cuboctahedron) — $B_3$ with lengths swapped, but now genuinely different: $\\sp(6)\\not\\cong\\so(7)$. Real form $\\sp(6,\\R)$: linear canonical maps of 3D phase space.' },
];

export function mountRank3(pg, scope, ctx) {
  const S = (ctx.state.r3 ??= { id: 'A3', planes: true, edges: true, orbit: true, playing: true });
  const v = pg.view({ title: '', hint: 'drag to rotate · scroll to zoom' });
  const k = scene3d(v.body, scope, { camera: [3.4, 2.4, 2.2] });

  const Z = new THREE.Vector3(0, 0, 1);
  const built = {};
  for (const e of RANK3) built[e.id] = build(e);

  function build(entry) {
    const sys = R.rootSystem(entry.t, 3);
    const g = new THREE.Group();
    k.root.add(g);
    for (const r of sys.roots) k.arrow([0, 0, 0], r.v, { color: r.long ? 'alg' : 'c3', radius: r.long ? 0.02 : 0.016, headLength: 0.11, headRadius: 0.045, parent: g, opacity: r.pos ? 1 : 0.55 });
    const labels = sys.simple.map((a, i) => k.label(`\\alpha_${i + 1}`, vec.scale(a, 1.0 + 0.22 / vec.norm(a)), { parent: g, color: 'hi' }));
    const planes = new THREE.Group();
    g.add(planes);
    for (const r of sys.positive) {
      const simple = r.height === 1;
      const n = vec.normalize(r.v);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.55, 72), k.basic(simple ? 'hi' : 'grp', { opacity: simple ? 0.1 : 0.05 }));
      disc.quaternion.setFromUnitVectors(Z, new THREE.Vector3(n[0], n[1], n[2]));
      disc.renderOrder = 2;
      planes.add(disc);
      k.circle([0, 0, 0], n, 1.55, { color: simple ? 'hi' : 'grp', width: simple ? 1.6 : 1, opacity: simple ? 0.7 : 0.35, parent: planes });
    }
    const { edges } = R.nearestEdges(sys);
    const pos = [];
    for (const [i, j] of edges) pos.push(...sys.roots[i].v, ...sys.roots[j].v);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: k.color('ink2'), transparent: true, opacity: 0.45, depthWrite: false }));
    g.add(ls);
    const W = R.weylElements(sys);
    // probe frame inside the fundamental chamber (anchor along ρ-direction)
    const om = sys.fundamental.map(vec.normalize);
    const e3 = vec.normalize(om.reduce((a, b) => vec.add(a, b), [0, 0, 0]));
    const anchor = vec.scale(e3, 1.15);
    const e1 = vec.normalize(vec.sub(om[0], vec.scale(e3, vec.dot(om[0], e3))));
    const e2 = vec.cross(e3, e1);
    const frame = [vec.scale(e1, 0.3), vec.scale(e2, 0.19), vec.scale(e3, 0.13)];
    const dots = k.dots(
      W.els.map((e) => mat.mulv(e.M, anchor)),
      { radius: 0.028, color: 'grp', parent: g },
    );
    return { entry, sys, g, labels, planes, ls, W, anchor, frame, dots, Sref: sys.simple.map(R.reflectionMatrix), edges: edges.length };
  }

  // probe: anchor sphere + three short axes (a little right-handed frame — reflections make it left-handed)
  const probeAxes = ['x', 'y', 'z'].map((c) => k.line([[0, 0, 0], [0, 0, 0.1]], { color: c, width: 3.5 }));
  const probeBall = k.sphere({ radius: 0.045, color: 'grp' });

  let M = mat.eye(3);
  let anim = null;
  const queue = [];
  let idle = 0;
  const rng = mulberry32(5);
  let lastI = -1;
  const cur = () => built[S.id] || built.A3;

  function placeProbe() {
    const B = cur();
    let pts;
    const at = (Mx) => [mat.mulv(Mx, B.anchor), ...B.frame.map((f) => mat.mulv(Mx, f))];
    if (anim) {
      const e = easeInOut(clamp(anim.t, 0, 1));
      const a = at(anim.from);
      const b = at(anim.to);
      pts = a.map((q, i) => vec.lerp(q, b[i], e));
    } else pts = at(M);
    probeBall.position.set(...pts[0]);
    probeAxes.forEach((ln, i) => ln.setPoints([pts[0], vec.add(pts[0], pts[i + 1])]));
  }

  // ------------------------------------------------------------ panel
  const secS = pg.section('Root system');
  const seg = ui.segmented(secS, {
    options: RANK3.map((e) => ({ value: e.id, label: e.label })),
    value: S.id,
    onChange: (id) => {
      S.id = id;
      reset();
    },
  });
  const dyn = ui.h('div', { class: 'dyn-wrap' });
  secS.appendChild(dyn);
  const cartOut = ui.readout(secS, {});
  const kv = ui.keyValue(secS, [
    ['Compact group', ''],
    ['#roots (long + short)', ''],
    ['$\\dim$, $|W|$', ''],
  ]);
  const txt = ui.h('p', { class: 'phys-text' });
  secS.appendChild(txt);

  const secW = pg.section('Weyl reflections');
  ui.buttons(secW, [
    { label: '$s_1$', onClick: () => push([0]) },
    { label: '$s_2$', onClick: () => push([1]) },
    { label: '$s_3$', onClick: () => push([2]) },
    { label: 'Reset', onClick: () => reset() },
  ]);
  const play = ui.playButton(secW, { playing: S.playing, labels: ['▶ Random reflections', '❚❚ Pause'], onToggle: (x) => (S.playing = x) });
  ui.toggle(secW, { label: 'Mirror planes', value: S.planes, onChange: (x) => ((S.planes = x), vis()) });
  ui.toggle(secW, { label: 'Edges between nearest roots', value: S.edges, onChange: (x) => ((S.edges = x), vis()) });
  ui.toggle(secW, { label: 'Orbit of the probe', value: S.orbit, onChange: (x) => ((S.orbit = x), vis()) });
  const wordOut = ui.readout(secW, {});
  ui.legend(secW, [
    { color: 'alg', label: 'long root' },
    { color: 'c3', label: 'short root' },
    { color: 'hi', label: 'simple roots and their mirrors' },
    { color: 'grp', label: 'mirror planes, probe orbit' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'The cuboctahedron of $\\su(4)$',
      text: 'With edges on, the 12 roots of $A_3$ are the vertices of a cuboctahedron; each root has 4 nearest neighbours $\\beta$ with $\\langle\\alpha,\\beta\\rangle=1$, i.e. $\\alpha-\\beta$ is again a root. 6 mirror planes, 24 chambers: $W(A_3)=S_4$ permutes the four “colours” of Pati–Salam.',
      apply: () => setSys('A3', true),
    },
    {
      title: 'Handedness flips',
      text: 'Press $s_1$ once: the little $x,y,z$ frame becomes left-handed ($\\det w=-1$). Two reflections make a rotation. This is why Weyl groups are generated by reflections but contain the rotation group of the polyhedron as an index-2 subgroup.',
      apply: () => {
        setSys(S.id, false);
        push([0]);
      },
    },
    {
      title: '$B_3$ versus $C_3$',
      text: 'Same Weyl group (order 48, the full symmetry group of the cube), same mirrors, but long and short roots swapped: octahedron of short roots in $B_3$, of long roots in $C_3$. Unlike rank 2, the algebras $\\so(7)$ and $\\sp(6)$ are not isomorphic.',
      apply: () => setSys('C3', true),
    },
    {
      title: 'The longest element',
      text: 'In $B_3$ and $C_3$ the longest element is $w_0=-1$ (9 reflections): all representations are self-conjugate. In $A_3$ it is not: $\\mathbf 4\\neq\\overline{\\mathbf 4}$ for SU(4).',
      apply: () => {
        setSys('B3', false);
        push(longest(cur()));
      },
    },
  ]);

  notes(pg);

  function longest(B) {
    const maxLen = Math.max(...B.W.els.map((e) => e.word.length));
    return B.W.els.find((e) => e.word.length === maxLen).word.slice().reverse();
  }
  function setSys(id, playing) {
    S.id = id;
    seg.set(id, { silent: true });
    reset();
    play.set(playing);
  }
  function push(seq) {
    if (seq.length) play.set(false);
    queue.push(...seq);
  }
  function reset() {
    M = mat.eye(3);
    anim = null;
    queue.length = 0;
    vis();
    refresh();
  }
  function vis() {
    for (const id in built) {
      const B = built[id];
      B.g.visible = id === S.id;
      B.labels.forEach((l) => l.setVisible(id === S.id));
      B.planes.visible = S.planes;
      B.ls.visible = S.edges;
      B.dots.visible = S.orbit;
    }
  }
  function refresh() {
    const B = cur();
    const { sys, entry, W } = B;
    v.setTitle(`Root system $${sys.name}$ of $${entry.alg}$ in its Cartan subalgebra $\\R^3$`);
    dyn.innerHTML = dynkinSVG(sys, { unit: 44 });
    cartOut.set(`A=${texMatrix(sys.A, 0)}`);
    kv.set('Compact group', `$${entry.group}$`);
    const nl = sys.roots.filter((r) => r.long).length;
    kv.set('#roots (long + short)', nl === sys.roots.length ? `${nl}` : `${sys.roots.length} = ${nl} + ${sys.roots.length - nl}`);
    kv.set('$\\dim$, $|W|$', `${sys.dim}, ${W.els.length}`);
    txt.innerHTML = '';
    txt.appendChild(ui.h('span', { html: entry.text }));
    const idx = W.index.get(W.keyOf(M));
    const word = idx === undefined ? null : W.els[idx].word;
    const wt = word && word.length ? word.map((i) => `s_${i + 1}`).join('') : 'e';
    wordOut.set(`\\grp{w}=${wt},\\quad\\ell(w)=${word ? word.length : '?'},\\quad\\det w=${word && word.length % 2 ? '-1\\;(\\text{left-handed})' : '+1'}`);
    placeProbe();
  }

  scope.frame((dt) => {
    if (anim) {
      anim.t += dt / 0.7;
      if (anim.t >= 1) {
        M = anim.to;
        anim = null;
        idle = 0;
        refresh();
      } else placeProbe();
      return;
    }
    if (queue.length) {
      const i = queue.shift();
      anim = { from: M, to: mat.mul(cur().Sref[i], M), t: 0 };
      lastI = i;
      return;
    }
    if (!play.playing) return;
    idle += dt;
    if (idle > 0.8) {
      idle = 0;
      let i = Math.floor(rng() * 3) % 3;
      if (i === lastI) i = (i + 1) % 3;
      lastI = i;
      anim = { from: M, to: mat.mul(cur().Sref[i], M), t: 0 };
    }
  });

  vis();
  refresh();
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>Rank 3: three commuting charges, so the roots live in $\\R^3$. Each positive root defines a mirror plane (translucent disc; the three simple ones
  in amber). The planes cut space into $|W|$ congruent cones — the Weyl chambers — and the dots mark the images of the probe, one per chamber:
  24 for $A_3$, 48 for $B_3$ and $C_3$.</p>
  <p>The thin lines join nearest roots. For $A_3$ they are the edges of a cuboctahedron; $B_3$ and $C_3$ add an octahedron of short or long roots.</p>`);
  pg.note(`<h2>The physics</h2>
  <p>$\\su(4)\\cong\\so(6)$: the same 15 generators act on 4-component spinors of SO(6) and on 6-vectors of SU(4) (antisymmetric pairs $\\mathbf 4\\wedge\\mathbf 4=\\mathbf 6$).
  Pati and Salam used this SU(4), with lepton number as a fourth colour; Wigner used it for spin–isospin symmetry of light nuclei. In each case the roots are the
  charges of the generators that change one “colour” into another, and the Weyl group $S_4$ permutes the colours.</p>
  <div class="callout intuition"><span class="callout-title">Intuition</span>A Weyl reflection is a rotation by $\\pi$ inside one $SU(2)$ subgroup, seen on the charges.
  It flips one charge axis and keeps the perpendicular plane — so the multiplet pattern must be mirror-symmetric in every plane.</div>`);
  pg.note(`<h2>The mathematics</h2>
  <p>Simple roots are obtained from the Cartan matrix: the Gram matrix $G_{ij}=\\langle\\alpha_i,\\alpha_j\\rangle=A_{ij}|\\alpha_j|^2/2$ is positive definite, and its
  Cholesky factor gives explicit vectors. All roots then follow by closing the simple roots under $s_i(\\beta)=\\beta-\\langle\\beta,\\alpha_i^\\vee\\rangle\\alpha_i$.
  $|W(A_3)|=4!=24$, $|W(B_3)|=|W(C_3)|=2^3\\,3!=48$ (signed permutations), as counted by the dots.</p>`);
}
