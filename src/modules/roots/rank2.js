// Tab (a): rank-2 root systems, mirrors, Weyl chambers and a probe reflected by s1, s2.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { mat, vec, clamp, easeInOut } from '../../core/la.js';
import { texMatrix, fmt } from '../../core/format.js';
import * as R from './math.js';
import { dynkinSVG } from './dynkin-svg.js';

export const RANK2 = [
  {
    id: 'A1A1',
    label: '$A_1{\\times}A_1$',
    sys: () => R.rootSystemA1A1(),
    group: 'SU(2)\\times SU(2)',
    alg: '\\so(4)\\cong\\su(2)\\oplus\\su(2)',
    text: 'Two orthogonal pairs of roots that never talk: $\\alpha_1+\\alpha_2$ is not a root, so $[E_{\\alpha_1},E_{\\alpha_2}]=0$ and the algebra splits into two commuting $\\su(2)$s — the hidden SO(4) of hydrogen (<a href="#/kepler">Kepler</a>) and, as a real form, the Lorentz algebra (<a href="#/lorentz">Lorentz</a>).',
  },
  {
    id: 'A2',
    label: '$A_2$',
    sys: () => R.rootSystem('A', 2),
    group: 'SU(3)',
    alg: '\\su(3)',
    text: 'Six roots of equal length on a hexagon: the charges $(I_3,Y)$ of the six ladder operators $I_\\pm,U_\\pm,V_\\pm$ — the six charged gluons. The Weyl group $S_3$ permutes $u,d,s$ (or $r,g,b$). See <a href="#/su3">SU(3)</a>.',
  },
  {
    id: 'B2',
    label: '$B_2$',
    sys: () => R.rootSystem('B', 2),
    group: 'SO(5)',
    alg: '\\so(5)',
    text: 'Four long and four short roots at 45°: $\\so(5)$, the de Sitter algebra in 4+1 dimensions. Rotate by 45° and swap long and short and you get $C_2$: $\\so(5)\\cong\\sp(4)$.',
  },
  {
    id: 'C2',
    label: '$C_2$',
    sys: () => R.rootSystem('C', 2),
    group: 'Sp(2)',
    alg: '\\sp(4)',
    text: 'The same root system as $B_2$ with long and short exchanged: $Sp(2)\\cong Spin(5)$. Its real form $\\sp(4,\\R)$ generates the linear canonical transformations of a two-degree-of-freedom phase space (<a href="#/sp2">Sp(2,ℝ)</a>).',
  },
  {
    id: 'G2',
    label: '$G_2$',
    sys: () => R.rootSystem('G', 2),
    group: 'G_2',
    alg: '\\mathfrak g_2',
    text: 'Twelve roots: a short and a long hexagon, length ratio $\\sqrt3$, simple roots at 150°. $G_2$ is the symmetry group of the octonions; it contains $SU(3)$ (the long roots form an $A_2$).',
  },
];

export function mountRank2(pg, scope, ctx) {
  const S = (ctx.state.r2 ??= { id: 'A2', mirrors: true, orbit: true, playing: true });
  let ready = false;
  let D = null;
  let M = mat.eye(2);
  let anim = null;
  const queue = [];
  let idle = 0;
  let lastI = 1;

  function derive() {
    const entry = RANK2.find((e) => e.id === S.id) || RANK2[1];
    S.id = entry.id;
    const sys = entry.sys();
    const W = R.weylElements(sys);
    const w1 = vec.normalize(sys.fundamental[0]);
    const w2 = vec.normalize(sys.fundamental[1]);
    const bis = vec.normalize(vec.add(w1, w2));
    const half = Math.acos(clamp(vec.dot(w1, w2), -1, 1)) / 2;
    const R0 = 1.5;
    const s = Math.min(0.42, 0.62 * R0 * Math.sin(half));
    const t = [-bis[1], bis[0]];
    const anchor = vec.scale(bis, R0);
    const loc = (x, y) => vec.add(anchor, vec.add(vec.scale(t, s * x), vec.scale(bis, s * y)));
    const glyph = [
      [loc(-0.45, -0.6), loc(-0.45, 0.6), loc(0.45, 0.6)],
      [loc(-0.45, 0.02), loc(0.22, 0.02)],
    ];
    const Sref = sys.simple.map(R.reflectionMatrix);
    D = { entry, sys, W, w1, w2, glyph, anchor, Sref };
  }
  derive();

  // ------------------------------------------------------------ view
  const v = pg.view({ title: '', hint: 'buttons $s_1,s_2$ reflect the probe in the simple mirrors' });
  const p = plot2d(v.body, scope, { x: [-2.25, 2.25], y: [-2.25, 2.25], grid: false, axes: false, pan: false, zoom: false, draw });

  const mapPoly = (Mx, poly) => poly.map((q) => mat.mulv(Mx, q));
  function wedge(Mx, Rw) {
    const a = mat.mulv(Mx, D.w1);
    const b = mat.mulv(Mx, D.w2);
    const a1 = Math.atan2(a[1], a[0]);
    let da = Math.atan2(b[1], b[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const pts = [[0, 0]];
    for (let k = 0; k <= 24; k++) {
      const ang = a1 + (da * k) / 24;
      pts.push([Rw * Math.cos(ang), Rw * Math.sin(ang)]);
    }
    return pts;
  }

  function draw(p) {
    if (!ready) return;
    const { sys, W } = D;
    const Rw = 2.15;
    // chambers: alternating shading (even/odd Weyl elements), current chamber highlighted
    if (S.orbit) for (const e of W.els) if (e.det > 0) p.polygon(wedge(e.M, Rw), { fill: 'grp', alpha: 0.045 });
    p.polygon(wedge(mat.eye(2), Rw), { fill: 'hi', alpha: 0.13, stroke: 'hi', width: 1, strokeAlpha: 0.5 });
    if (!anim) p.polygon(wedge(M, Rw), { fill: 'grp', alpha: 0.1 });
    // mirrors
    if (S.mirrors)
      for (const r of sys.positive) {
        const b = vec.normalize(r.v);
        const d = [-b[1], b[0]];
        const simpleIdx = r.height === 1 ? r.c.indexOf(1) : -1;
        const hot = anim && simpleIdx === anim.i;
        p.line(
          [
            [-d[0] * 2.2, -d[1] * 2.2],
            [d[0] * 2.2, d[1] * 2.2],
          ],
          { color: hot ? 'hi' : 'grp', width: simpleIdx >= 0 ? 1.8 : 1.1, dash: [6, 5], alpha: simpleIdx >= 0 ? 0.9 : 0.55 },
        );
        if (simpleIdx >= 0) p.tex(`s_${simpleIdx + 1}`, [d[0] * 2.05, d[1] * 2.05], { key: 'ms' + simpleIdx, color: 'grp', offset: [10, -10], small: true });
      }
    // roots
    for (const r of sys.roots) p.arrow([0, 0], r.v, { color: r.long ? 'alg' : 'c3', width: r.long ? 2.6 : 2.2, head: 9, alpha: r.pos ? 1 : 0.5 });
    sys.simple.forEach((a, i) => {
      p.circle(a, 7 / p.scale, { color: 'hi', width: 2 });
      const u = vec.normalize(a);
      p.tex(`\\alpha_${i + 1}`, a, { key: 'al' + i, color: 'hi', offset: [u[0] * 18, -u[1] * 18] });
    });
    // orbit ghosts
    if (S.orbit) for (const e of W.els) for (const poly of D.glyph) p.line(mapPoly(e.M, poly), { color: 'grp', width: 1.3, alpha: 0.3 });
    // probe
    let polys;
    if (anim) {
      const e = easeInOut(clamp(anim.t, 0, 1));
      polys = D.glyph.map((poly) => poly.map((q) => vec.lerp(mat.mulv(anim.from, q), mat.mulv(anim.to, q), e)));
    } else polys = D.glyph.map((poly) => mapPoly(M, poly));
    for (const poly of polys) p.line(poly, { color: 'grp', width: 3.2 });
    p.dot(polys[0][0], { r: 3.5, fill: 'grp' });
  }

  // ------------------------------------------------------------ panel
  const secS = pg.section('Root system');
  const seg = ui.segmented(secS, {
    options: RANK2.map((e) => ({ value: e.id, label: e.label })),
    value: S.id,
    onChange: (id) => {
      S.id = id;
      M = mat.eye(2);
      anim = null;
      queue.length = 0;
      derive();
      refresh();
    },
  });
  const dyn = ui.h('div', { class: 'dyn-wrap' });
  secS.appendChild(dyn);
  const cartOut = ui.readout(secS, {});
  const kv = ui.keyValue(secS, [
    ['Compact group', ''],
    ['$\\dim=$ rank $+$ #roots', ''],
    ['Weyl group $|W|$', ''],
    ['Angle $\\angle(\\alpha_1,\\alpha_2)$, $|\\alpha_{\\rm long}|/|\\alpha_{\\rm short}|$', ''],
  ]);
  const txt = ui.h('p', { class: 'phys-text' });
  secS.appendChild(txt);

  const secW = pg.section('Weyl reflections');
  ui.buttons(secW, [
    { label: '$s_1$', onClick: () => push([0]) },
    { label: '$s_2$', onClick: () => push([1]) },
    { label: 'Reset', onClick: () => reset() },
  ]);
  const play = ui.playButton(secW, { playing: S.playing, labels: ['▶ Walk $s_1s_2s_1\\cdots$', '❚❚ Pause'], onToggle: (x) => (S.playing = x) });
  ui.toggle(secW, { label: 'Mirrors', value: S.mirrors, onChange: (x) => ((S.mirrors = x), p.invalidate()) });
  ui.toggle(secW, { label: 'Orbit of the probe (all chambers)', value: S.orbit, onChange: (x) => ((S.orbit = x), p.invalidate()) });
  const wordOut = ui.readout(secW, {});
  ui.legend(secW, [
    { color: 'alg', label: 'long root' },
    { color: 'c3', label: 'short root' },
    { color: 'hi', label: 'simple roots / fundamental chamber' },
    { color: 'grp', label: 'mirrors, probe and its Weyl orbit' },
  ]);

  const go = (id, seq = []) => {
    if (S.id !== id) {
      seg.set(id);
    } else reset();
    play.set(false);
    push(seq);
  };
  ui.experiments(pg.section('Try this'), [
    {
      title: '$A_2$: six chambers $=|S_3|$',
      text: 'Six mirrors? No — three mirrors cut the plane into six chambers, one for each element of $W(A_2)\\cong S_3$, the permutations of $u,d,s$. Watch the probe visit them all: alternating $s_1s_2$ is a rotation by 120°.',
      apply: () => {
        go('A2');
        play.set(true);
      },
    },
    {
      title: '$G_2$: two root lengths',
      text: 'Long and short roots differ by $\\sqrt3$ and the simple roots meet at 150°. Twelve chambers, $|W|=12$: the dihedral group of the hexagon.',
      apply: () => {
        go('G2');
        play.set(true);
      },
    },
    {
      title: '$B_2$ versus $C_2$',
      text: 'Switch between them: the same figure turned by 45° with long and short swapped. Isomorphic root systems, isomorphic algebras: $\\so(5)\\cong\\sp(4)$, i.e. $Spin(5)\\cong Sp(2)$.',
      apply: () => go('C2', [0, 1]),
    },
    {
      title: 'Longest element: is $w_0=-1$?',
      text: 'In $B_2$, $s_1s_2s_1s_2=-1$ sends the probe to the opposite chamber. In $A_2$ the longest element $s_1s_2s_1$ is $-1$ times the diagram flip: that flip is charge conjugation $\\mathbf 3\\leftrightarrow\\overline{\\mathbf 3}$, so SU(3) has complex representations (quarks ≠ antiquarks); $SO(5)$ and $G_2$ do not.',
      apply: () => go('A2', [0, 1, 0]),
    },
    {
      title: '$A_1\\times A_1=\\so(4)$',
      text: 'Two perpendicular root pairs: $\\alpha_1+\\alpha_2$ is not a root, so the two $\\su(2)$s commute. $|W|=4=2\\times2$. Complexified, this is also the Lorentz algebra: $\\so(3,1)_\\C\\cong\\sl(2,\\C)\\oplus\\sl(2,\\C)$.',
      apply: () => go('A1A1', [0, 1]),
    },
  ]);

  notes(pg);

  // ------------------------------------------------------------ logic
  function push(seq) {
    if (seq.length) play.set(false);
    queue.push(...seq);
  }
  function reset() {
    M = mat.eye(2);
    anim = null;
    queue.length = 0;
    refresh();
  }
  function start(i) {
    anim = { from: M, to: mat.mul(D.Sref[i], M), i, t: 0 };
    lastI = i;
  }
  function refresh() {
    const { sys, entry, W } = D;
    v.setTitle(`Root system $${sys.name}$ of $${entry.alg}$ &nbsp;·&nbsp; roots, mirrors, Weyl chambers`);
    dyn.innerHTML = dynkinSVG(sys, { unit: 46 });
    cartOut.set(`A_{ij}=\\frac{2\\langle\\alpha_i,\\alpha_j\\rangle}{\\langle\\alpha_j,\\alpha_j\\rangle}=${texMatrix(sys.A, 0)}`);
    kv.set('Compact group', `$${entry.group}$`);
    kv.set('$\\dim=$ rank $+$ #roots', `$2+${sys.roots.length}=${sys.dim}$`);
    kv.set('Weyl group $|W|$', String(W.els.length));
    const ang = (Math.acos(clamp(vec.dot(sys.simple[0], sys.simple[1]) / (vec.norm(sys.simple[0]) * vec.norm(sys.simple[1])), -1, 1)) * 180) / Math.PI;
    const lens = sys.roots.map((r) => Math.sqrt(r.len2));
    const ratio = Math.max(...lens) / Math.min(...lens);
    const ratioTex = Math.abs(ratio - Math.sqrt(3)) < 1e-9 ? '\\sqrt3' : Math.abs(ratio - Math.SQRT2) < 1e-9 ? '\\sqrt2' : '1';
    kv.set('Angle $\\angle(\\alpha_1,\\alpha_2)$, $|\\alpha_{\\rm long}|/|\\alpha_{\\rm short}|$', `${fmt(ang, 0)}°, $${ratioTex}$`);
    txt.innerHTML = '';
    txt.appendChild(ui.h('span', { html: entry.text }));
    const idx = W.index.get(W.keyOf(M));
    const word = idx === undefined ? null : W.els[idx].word;
    const wt = word && word.length ? word.map((i) => `s_${i + 1}`).join('') : 'e';
    const maxLen = Math.max(...W.els.map((e) => e.word.length));
    wordOut.set(
      `\\grp{w}=${wt},\\quad \\ell(w)=${word ? word.length : '?'}${word && word.length === maxLen ? '=\\ell(w_0)' : ''},\\quad \\det w=${word && word.length % 2 ? '-1' : '+1'}`,
    );
    p.invalidate();
  }

  scope.frame((dt) => {
    if (anim) {
      anim.t += dt / 0.6;
      if (anim.t >= 1) {
        M = anim.to;
        anim = null;
        idle = 0;
        refresh();
      }
      p.invalidate();
      return;
    }
    if (queue.length) {
      start(queue.shift());
      return;
    }
    if (!play.playing) return;
    idle += dt;
    if (idle > 0.75) {
      idle = 0;
      start(1 - lastI);
    }
  });

  ready = true;
  refresh();
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>Pick a maximal set of commuting Hermitian generators $H_1,H_2$ (the Cartan subalgebra; rank 2). Every other generator can be chosen to be a
  ladder operator with definite charges: $[H_i,E_\\alpha]=\\alpha_iE_\\alpha$. The arrows are these charge vectors, the <b>roots</b>. Long roots are
  orange, short ones teal; the faded arrows are the negative roots $-\\alpha$ (the Hermitian conjugates $E_{-\\alpha}=E_\\alpha^\\dagger$).</p>
  <p>Each root $\\alpha$ comes with an $\\su(2)$ spanned by $E_{\\pm\\alpha}$ and $[E_\\alpha,E_{-\\alpha}]$, and the “rotation by $\\pi$” in that $SU(2)$
  acts on charges as the reflection $s_\\alpha$ in the mirror perpendicular to $\\alpha$ (dashed). These reflections generate the <b>Weyl group</b> $W$; its
  mirrors cut the plane into $|W|$ chambers, and the probe visits each exactly once.</p>`);
  pg.note(`<h2>The physics</h2>
  <p>Weights of any multiplet are permuted by $W$ (a multiplet is a consistent spin multiplet along every root direction), so weight diagrams have the
  symmetry of the chambers: the hexagons of <a href="#/su3">SU(3)</a> are $W(A_2)=S_3$ made visible. In a gauge theory the roots are the charges carried
  by the gauge bosons themselves under the unbroken Cartan generators — the charged gluons, or the $W^\\pm$ of SU(2).</p>
  <div class="callout physics"><span class="callout-title">Charge conjugation from the Weyl group</span>If the longest element $w_0$ equals $-1$, every
  irrep is equivalent to its conjugate (weights $\\mu\\to-\\mu$). For $A_2$, $w_0=-1\\circ\\sigma$ with $\\sigma$ the Dynkin-diagram flip, which exchanges
  $(p,q)\\leftrightarrow(q,p)$: quarks and antiquarks are different. For $B_2$, $G_2$ and $A_1\\times A_1$, $w_0=-1$.</div>`);
  pg.note(`<h2>The mathematics</h2>
  <p>Choose a generic direction; the roots on its positive side are <b>positive</b>, and those positive roots that are not sums of others are <b>simple</b>
  ($\\alpha_1,\\alpha_2$, ringed). Every root is an integer combination of simple roots with coefficients of one sign. The geometry is encoded in the
  <b>Cartan matrix</b> $A_{ij}=2\\langle\\alpha_i,\\alpha_j\\rangle/\\langle\\alpha_j,\\alpha_j\\rangle$; integrality of the $\\su(2)$ spins forces
  $A_{ij}A_{ji}=4\\cos^2\\theta_{ij}\\in\\{0,1,2,3\\}$, i.e. angles $90°,120°,135°,150°$ — exactly the four pictures here. The simple reflections satisfy
  $(s_1s_2)^{m}=1$ with $m=2,3,4,6$, so $W$ is dihedral of order $2m$.</p>`);
  pg.note(`<h2>Going further</h2>
  <ul><li>The same construction in three dimensions (mirror planes, the cuboctahedron of $A_3$): next tab.</li>
  <li>All simple Lie algebras at once, projected onto their Coxeter planes ($E_8$’s 240 roots): third tab.</li>
  <li>Weights and multiplets of $A_2$ in detail: <a href="#/su3">SU(3)</a>; ladder operators for $A_1$: <a href="#/reps">spin multiplets</a>.</li></ul>`);
}
