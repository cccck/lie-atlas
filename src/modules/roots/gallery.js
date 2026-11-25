// Tab (c): every simple Lie algebra up to rank 8, projected onto its Coxeter plane (E8: 240 roots, 8 rings of 30).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { clamp, easeInOut } from '../../core/la.js';
import * as R from './math.js';
import { dynkinSVG } from './dynkin-svg.js';

const ROLE = {
  A: (n) => (n === 1 ? 'Spin and weak isospin.' : n === 2 ? 'Colour (QCD) and light-quark flavour.' : n === 4 ? 'Georgi–Glashow grand unification: $\\overline{\\mathbf 5}\\oplus\\mathbf{10}$ is one generation.' : 'Unitary symmetry of $n{+}1$ complex components; large-$N$ gauge theories.'),
  B: (n) => (n === 2 ? 'de Sitter group of 4+1 dimensions; $\\so(5)\\cong\\sp(4)$.' : n === 4 ? '$Spin(9)$: little group of a massless particle in 11D supergravity / M-theory.' : 'Rotations in $2n{+}1$ dimensions; spinors have $2^n$ components.'),
  C: () => 'Compact form of the symplectic algebra; $Sp(2n,\\R)$ is the group of linear canonical transformations (squeezing, beam optics).',
  D: (n) => (n === 4 ? 'Triality: vector and both spinors of $SO(8)$ are all 8-dimensional (the three outer nodes).' : n === 5 ? '$SO(10)$ unification: a whole generation, including $\\nu_R$, in the spinor $\\mathbf{16}$.' : n === 8 ? '$SO(16)\\subset E_8$; $Spin(32)/\\Z_2$ heterotic and type I strings have $D_{16}$.' : 'Rotations in $2n$ dimensions; two inequivalent spinors (two outer nodes).'),
  E: (n) => (n === 6 ? 'Unification group with $\\mathbf{27}\\supset\\mathbf{16}\\oplus\\mathbf{10}\\oplus\\mathbf 1$ of $SO(10)$; Calabi–Yau heterotic models.' : n === 7 ? '$E_{7(7)}$ is the U-duality group of $N=8$ supergravity; the $\\mathbf{56}$.' : 'The largest exceptional algebra, $248=120+128$ under $SO(16)$; $E_8\\times E_8$ heterotic string.'),
  F: () => 'Automorphisms of the exceptional Jordan algebra of $3\\times3$ octonionic Hermitian matrices.',
  G: () => 'Automorphisms of the octonions; $G_2$-holonomy 7-manifolds give 4D vacua of M-theory with $N=1$ supersymmetry.',
};

export function mountGallery(pg, scope, ctx) {
  const S = (ctx.state.gal ??= { id: 'E8', edges: true, rings: true, playing: true });
  let ready = false;
  let D = null;
  const anim = { orbit: 0, step: 0, t: 0 };

  function derive() {
    const ent = R.GALLERY.find(([t, n]) => t + n === S.id) || ['E', 8];
    S.id = ent[0] + ent[1];
    const sys = R.rootSystem(ent[0], ent[1]);
    const plane = R.coxeterPlane(sys);
    const pts = R.project(sys, plane);
    const orbits = R.coxeterOrbits(sys);
    const rad = pts.map((q) => Math.hypot(q[0], q[1]));
    const uniq = [...new Set(rad.map((r) => Math.round(r * 1e5)))].sort((a, b) => a - b);
    const ring = rad.map((r) => uniq.indexOf(Math.round(r * 1e5)));
    const { edges } = R.nearestEdges(sys);
    const mult = new Map();
    pts.forEach((q) => {
      const kk = Math.round(q[0] * 1e4) + ',' + Math.round(q[1] * 1e4);
      mult.set(kk, (mult.get(kk) || 0) + 1);
    });
    const coincide = pts.map((q) => mult.get(Math.round(q[0] * 1e4) + ',' + Math.round(q[1] * 1e4)));
    const maxR = Math.max(...rad);
    D = { t: ent[0], n: ent[1], sys, pts, orbits, ring, nRings: uniq.length, edges, coincide, maxR };
    anim.orbit = 0;
    anim.step = 0;
    anim.t = 0;
  }
  derive();

  const v = pg.view({ title: '', hint: 'the Coxeter element $w$ acts on this plane as a rotation by $2\\pi/h$' });
  const p = plot2d(v.body, scope, { grid: false, axes: false, pan: true, zoom: true, draw });

  function fit() {
    const m = D.maxR * 1.14;
    p.setView({ x: [-m, m], y: [-m, m] });
  }

  function draw(p) {
    if (!ready) return;
    const { pts, edges, sys, ring, coincide } = D;
    const ctx = p.ctx;
    // edges in one path
    if (S.edges && edges.length) {
      ctx.beginPath();
      for (const [i, j] of edges) {
        ctx.moveTo(p.sx(pts[i][0]), p.sy(pts[i][1]));
        ctx.lineTo(p.sx(pts[j][0]), p.sy(pts[j][1]));
      }
      ctx.strokeStyle = p.color('ink2');
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = edges.length > 2000 ? 0.13 : edges.length > 400 ? 0.22 : 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // highlighted Coxeter orbit (trail)
    const orb = D.orbits[anim.orbit % D.orbits.length];
    const h = sys.h;
    if (orb && h > 2) {
      const trail = [];
      for (let s = 0; s <= anim.step; s++) trail.push(pts[orb[s % h]]);
      const a = pts[orb[anim.step % h]];
      const b = pts[orb[(anim.step + 1) % h]];
      const e = easeInOut(clamp(anim.t, 0, 1));
      const a0 = Math.atan2(a[1], a[0]);
      let da = Math.atan2(b[1], b[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const rr = Math.hypot(a[0], a[1]);
      const cur = [rr * Math.cos(a0 + da * e), rr * Math.sin(a0 + da * e)];
      trail.push(cur);
      p.line(trail, { color: 'hi', width: 2, alpha: 0.85 });
    }
    // roots
    const base = clamp(110 / Math.sqrt(pts.length), 2.6, 7);
    pts.forEach((q, i) => {
      const r = sys.roots[i].long ? base : base * 0.72;
      const col = S.rings ? `c${(ring[i] % 8) + 1}` : sys.roots[i].long ? 'alg' : 'c3';
      p.dot(q, { r, fill: col });
      if (coincide[i] > 1) p.circle(q, (r + 2.5) / p.scale, { color: col, width: 1 });
    });
    if (orb && h > 2) {
      const a = pts[orb[anim.step % h]];
      const b = pts[orb[(anim.step + 1) % h]];
      const e = easeInOut(clamp(anim.t, 0, 1));
      const a0 = Math.atan2(a[1], a[0]);
      let da = Math.atan2(b[1], b[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const rr = Math.hypot(a[0], a[1]);
      p.circle([rr * Math.cos(a0 + da * e), rr * Math.sin(a0 + da * e)], (base + 4) / p.scale, { color: 'hi', width: 2.5 });
    }
    if (D.n === 1) p.tex('\\text{rank 1: no Coxeter plane — the two roots }\\pm\\alpha', [0, 0], { key: 'r1', offset: [0, -40], small: true, color: 'muted' });
  }

  // ------------------------------------------------------------ panel
  const secA = pg.section('Algebra');
  const sel = ui.select(secA, {
    options: R.GALLERY.map(([t, n]) => ({ value: t + n, label: `${t}${n} — ${R.compactGroup(t, n).replace(/_/g, '')}, ${R.EXPECTED.roots(t, n)} roots` })),
    value: S.id,
    onChange: (id) => setId(id),
  });
  ui.buttons(
    secA,
    ['E8', 'E7', 'E6', 'F4', 'G2', 'D4', 'A4'].map((id) => ({ label: `$${id[0]}_${id[1]}$`, small: true, onClick: () => setId(id) })),
  );
  const dyn = ui.h('div', { class: 'dyn-wrap' });
  secA.appendChild(dyn);
  const kv = ui.keyValue(secA, [
    ['Compact group', ''],
    ['Rank $r$ · #roots', ''],
    ['Coxeter number $h=\\#\\text{roots}/r$', ''],
    ['Exponents $m_i$', ''],
    ['$|W|=\\prod(m_i+1)$', ''],
    ['$\\dim=r(h+1)$', ''],
  ]);
  const role = ui.h('p', { class: 'phys-text' });
  secA.appendChild(role);

  const secV = pg.section('Display');
  const play = ui.playButton(secV, { playing: S.playing, labels: ['▶ Follow a Coxeter orbit', '❚❚ Pause'], onToggle: (x) => (S.playing = x) });
  ui.toggle(secV, { label: 'Edges between nearest roots', value: S.edges, onChange: (x) => ((S.edges = x), p.invalidate()) });
  ui.toggle(secV, { label: 'Colour by ring (Coxeter orbit radius)', value: S.rings, onChange: (x) => ((S.rings = x), p.invalidate()) });
  const ringOut = ui.h('p', { class: 'small-note' });
  secV.appendChild(ringOut);

  ui.experiments(pg.section('Try this'), [
    {
      title: '$E_8$: 240 roots, 8 rings of 30',
      text: 'The Coxeter element of $E_8$ has order $h=30$, and its 240 roots fall into 8 orbits, each a regular 30-gon: $240=8\\times30$. Each root has 56 nearest neighbours; the 6720 edges are those of the Gosset polytope $4_{21}$.',
      apply: () => setId('E8'),
    },
    {
      title: 'Coxeter numbers',
      text: 'Compare $A_4$ ($h=5$), $D_4$ ($h=6$), $F_4$ ($h=12$), $E_6$ ($12$), $E_7$ ($18$), $E_8$ ($30$). Always $\\#\\text{roots}=r\\,h$ and $\\dim\\g=r(h+1)$: $248=8\\cdot31$.',
      apply: () => setId('E6'),
    },
    {
      title: '$D_4$ and triality',
      text: 'The 24 roots of $\\so(8)$ (a 24-cell). Its Dynkin diagram has a threefold symmetry: the vector and the two spinor representations of $SO(8)$ are permuted by triality — used in the Green–Schwarz superstring.',
      apply: () => setId('D4'),
    },
    {
      title: 'Non-simply-laced: $F_4$ and $G_2$',
      text: 'Short roots are drawn smaller. $F_4$: 24 long + 24 short roots, two rings of 12 each. $G_2$: two hexagons, ratio $\\sqrt3$.',
      apply: () => setId('F4'),
    },
  ]);

  notes(pg);

  function setId(id) {
    S.id = id;
    sel.set(id, { silent: true });
    derive();
    fit();
    refresh();
  }
  function refresh() {
    const { sys, t, n } = D;
    v.setTitle(`$${sys.name}$ &nbsp;·&nbsp; ${sys.roots.length} roots projected on the Coxeter plane &nbsp;·&nbsp; $h=${sys.h}$`);
    dyn.innerHTML = dynkinSVG(sys, { unit: n > 6 ? 26 : 32, r: 5.5 });
    kv.set('Compact group', `$${R.compactGroup(t, n)}$`);
    kv.set('Rank $r$ · #roots', `${n} · ${sys.roots.length}`);
    kv.set('Coxeter number $h=\\#\\text{roots}/r$', String(sys.h));
    kv.set('Exponents $m_i$', sys.exponents.join(', '));
    kv.set('$|W|=\\prod(m_i+1)$', sys.weylOrder.toLocaleString('en-GB'));
    kv.set('$\\dim=r(h+1)$', String(sys.dim));
    role.innerHTML = '';
    role.appendChild(ui.h('span', { html: ROLE[t](n) }));
    ringOut.innerHTML = '';
    ringOut.appendChild(
      ui.h('span', {
        html: n === 1 ? 'Rank 1 has no Coxeter plane.' : `${D.orbits.length} Coxeter orbits of size ${sys.h} on ${D.nRings} ring${D.nRings > 1 ? 's' : ''}${D.nRings < D.orbits.length ? ' (some orbits share a ring or coincide)' : ''}.`,
      }),
    );
    p.invalidate();
  }

  scope.frame((dt) => {
    if (!play.playing || D.sys.h <= 2) return;
    anim.t += dt / 0.45;
    if (anim.t >= 1) {
      anim.t = 0;
      anim.step++;
      if (anim.step >= D.sys.h) {
        anim.step = 0;
        anim.orbit = (anim.orbit + 1) % D.orbits.length;
      }
    }
    p.invalidate();
  });

  ready = true;
  fit();
  refresh();
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>Every simple Lie algebra up to rank 8, drawn from nothing but its Cartan matrix: simple roots from the Cholesky factor of the symmetrised
  Cartan matrix, all roots by closing under simple reflections. The rank-$r$ root system is then projected onto a special plane, the
  <b>Coxeter plane</b>, where the picture has an $h$-fold rotational symmetry.</p>
  <p>The Coxeter element $w=\\prod_{i\\in\\text{black}}s_i\\prod_{j\\in\\text{white}}s_j$ (bipartite ordering of the Dynkin diagram) has order $h$ and an
  eigenvalue $e^{2\\pi i/h}$ of multiplicity one. With $P=\\tfrac1h\\sum_{k=0}^{h-1}e^{-2\\pi ik/h}w^k$ the projector on that eigenspace and $v$ generic,
  the plane is spanned by $\\mathrm{Re}\\,Pv$ and $\\mathrm{Im}\\,Pv$; on it $w$ is a rotation by $2\\pi/h$, so each $w$-orbit of roots is a regular $h$-gon.</p>`);
  pg.note(`<h2>The physics</h2>
  <p>This is the complete menu of simple gauge groups. The Standard Model uses $SU(3)\\times SU(2)\\times U(1)$; grand unified theories embed it in $SU(5)$,
  $SO(10)$ or $E_6$; string theory needs $E_8\\times E_8$ or $SO(32)$ (dimension 496 for anomaly cancellation). Every gauge boson of such a theory is either
  a Cartan generator (neutral) or carries one of the roots shown here as its charge vector.</p>
  <div class="callout intuition"><span class="callout-title">Counting</span>$\\#\\text{roots}=r\\,h$ and $\\dim\\g=r(h+1)$: for $E_8$, $240=8\\cdot30$ and
  $248=8\\cdot31$. The exponents $m_i$ (degrees of the Casimir invariants minus one) satisfy $\\sum m_i=\\#\\text{positive roots}$ and $|W|=\\prod(m_i+1)$.</div>`);
  pg.note(`<h2>The mathematics</h2>
  <p>For simply-laced algebras ($A,D,E$; all roots $|\\alpha|^2=2$) the drawn edges join roots with $\\langle\\alpha,\\beta\\rangle=1$, i.e. pairs whose difference
  is again a root. $E_8$’s roots are the 240 minimal vectors of the unique even unimodular lattice in eight dimensions; its Gram matrix (the Cartan matrix)
  has determinant 1. The orbit counts and Coxeter numbers shown here are recomputed numerically and checked against $A_n:n{+}1$, $B_n,C_n:2n$,
  $D_n:2n{-}2$, $E_{6,7,8}:12,18,30$, $F_4:12$, $G_2:6$.</p>`);
}
