// SSB tab (c) — counting Goldstones, dim G/H, across physics; and the electroweak Higgs mechanism:
// SU(2)_L × U(1)_Y → U(1)_em, the Weinberg rotation (W³, B) → (Z, γ), tree-level masses.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { fmt, texNum, texMatrix } from '../../core/format.js';
import * as M from './math.js';

const { PI, EW } = M;
const TH_PHYS = Math.asin(Math.sqrt(EW.sin2));
const DEG = 180 / PI;

const dimO = (N) => (N * (N - 1)) / 2;

const CARDS = [
  {
    id: 'u1',
    sys: 'Superfluid, BEC',
    G: 'U(1)',
    H: '\\{1\\}',
    dimG: 1,
    dimH: 0,
    kind: 'global',
    out: '1 Goldstone: the phonon, $\\omega=c_s|k|$',
    text: 'The condensate $\\langle\\psi\\rangle=\\sqrt{n}\\,e^{i\\theta}$ breaks particle-number $U(1)$. Sound in superfluid $^4$He is the Goldstone of the first tab, in real space.',
  },
  {
    id: 'on',
    sys: '$O(N)$ magnet',
    G: 'O(N)',
    H: 'O(N-1)',
    kind: 'global',
    out: '',
    text: 'Vacuum manifold $S^{N-1}$. $N=3$: the two magnons of an antiferromagnet (second tab); $N=4$ is the pion case below.',
  },
  {
    id: 'chi2',
    sys: 'QCD, two light flavours',
    G: 'SU(2)_L\\times SU(2)_R',
    H: 'SU(2)_V',
    dimG: 6,
    dimH: 3,
    kind: 'pseudo',
    out: '3 pions $\\pi^+,\\pi^0,\\pi^-$',
    text: 'The condensate $\\langle\\bar qq\\rangle\\neq0$ breaks chiral symmetry; $m_{u,d}\\approx$ few MeV tilt the hat, so $m_\\pi\\approx140$ MeV $\\ll m_\\rho\\approx775$ MeV.',
  },
  {
    id: 'chi3',
    sys: 'QCD, three light flavours',
    G: 'SU(3)_L\\times SU(3)_R',
    H: 'SU(3)_V',
    dimG: 16,
    dimH: 8,
    kind: 'pseudo',
    out: '8 mesons $\\pi,K,\\eta$',
    text: 'The pseudoscalar octet of <a href="#/su3">SU(3)</a>. The heavier strange quark tilts harder: $m_K\\approx495$, $m_\\eta\\approx548$ MeV.',
  },
  {
    id: 'sc',
    sys: 'Superconductor',
    G: 'U(1)_{\\text{em}}\\ \\text{gauged}',
    H: '\\{1\\}',
    dimG: 1,
    dimH: 0,
    kind: 'gauge',
    out: 'eaten: the photon gets a mass',
    text: 'Cooper pairs (charge $2e$) condense. The would-be Goldstone becomes the photon\'s longitudinal mode; fields decay within the London depth $\\lambda_L=1/m_\\gamma$ — the Meissner effect.',
  },
  {
    id: 'ew',
    sys: 'Electroweak',
    G: 'SU(2)_L\\times U(1)_Y',
    H: 'U(1)_{\\text{em}}',
    dimG: 4,
    dimH: 1,
    kind: 'gauge',
    out: '3 eaten by $W^+,W^-,Z$',
    text: '$\\langle\\phi\\rangle=(0,v/\\sqrt2)$ has $T_3=-\\tfrac12$, $Y=1$, so $Q=T_3+Y/2$ annihilates it: the photon stays massless. Of the 4 real Higgs fields one remains — the Higgs boson.',
  },
];
const KIND = {
  global: { badge: 'Goldstone', cls: 'alg', sq: 'alg' },
  pseudo: { badge: 'pseudo-Goldstone', cls: 'warn', sq: 'hi' },
  gauge: { badge: 'Higgs mechanism', cls: 'grp', sq: 'grp' },
};

export function mountCount(pg, scope, ctx) {
  const S = (ctx.state.count ??= { th: TH_PHYS, N: 3, sel: null });

  // ------------------------------------------------------------------ examples
  const vCards = pg.view({ title: 'Broken generators: $\\dim G-\\dim H$', span: true });
  vCards.el.classList.add('ssb-cards-view');
  const grid = ui.h('div', { class: 'ssb-cards' });
  vCards.body.appendChild(grid);
  const cardEls = {};
  for (const c of CARDS) {
    const kd = KIND[c.kind];
    const el = ui.h('div', { class: 'ssb-card' });
    const head = ui.h('div', { class: 'ssb-card-head' }, ui.h('span', { class: 'ssb-sys', html: c.sys }));
    ui.badge(head, kd.badge, kd.cls);
    const gh = ui.h('div', { class: 'ssb-gh' });
    const squares = ui.h('div', { class: 'ssb-squares', 'aria-hidden': 'true' });
    const count = ui.h('div', { class: 'ssb-count' });
    const outEl = ui.h('div', { class: 'ssb-out' });
    const txt = ui.h('div', { class: 'ssb-txt', html: c.text });
    el.append(head, gh, squares, count, outEl);
    if (c.id === 'on') {
      const seg = ui.segmented(null, {
        options: [2, 3, 4, 5].map((n) => ({ value: n, label: `$N=${n}$` })),
        value: S.N,
        onChange: (n) => {
          S.N = n;
          fill();
        },
      });
      seg.el.classList.add('ssb-nseg');
      el.appendChild(seg.el);
      cardEls.onSeg = seg;
    }
    el.appendChild(txt);
    grid.appendChild(el);
    const fill = () => {
      const dG = c.id === 'on' ? dimO(S.N) : c.dimG;
      const dH = c.id === 'on' ? dimO(S.N - 1) : c.dimH;
      const Gt = c.id === 'on' ? `O(${S.N})` : c.G;
      const Ht = c.id === 'on' ? (S.N - 1 === 1 ? 'O(1)=\\Z_2' : `O(${S.N - 1})`) : c.H;
      gh.innerHTML = ui.h('span', { html: `$\\grp{${Gt}}\\ \\to\\ ${Ht}$` }).innerHTML;
      squares.innerHTML = '';
      for (let i = 0; i < dG; i++) squares.appendChild(ui.h('span', { class: 'sq', style: { background: `var(--${i < dH ? 'c3' : kd.sq})` } }));
      const nb = dG - dH;
      count.innerHTML = ui.h('span', { html: `$${dG}-${dH}=${nb}$ broken generator${nb === 1 ? '' : 's'}` }).innerHTML;
      const out = c.id === 'on' ? `${S.N - 1} Goldstone${S.N - 1 === 1 ? '' : 's'}${S.N === 2 ? ' ($O(2)\\cong U(1)$: one phonon)' : S.N === 3 ? ': 2 magnons' : S.N === 4 ? ': the 3 pions' : ''}` : c.out;
      outEl.innerHTML = ui.h('span', { html: `→ ${out}` }).innerHTML;
    };
    fill();
    cardEls[c.id] = el;
  }
  function highlight(id) {
    for (const c of CARDS) cardEls[c.id].classList.toggle('on', c.id === id);
    S.sel = id;
  }
  if (S.sel) highlight(S.sel);

  // ------------------------------------------------------------------ electroweak mixing
  const vMix = pg.view({ title: 'Weinberg rotation $(W^3,B)\\to(Z,\\gamma)$', height: 'var(--ssb-ew-h)', hint: 'drag the $Z$ tip' });
  const vMass = pg.view({ title: 'Tree-level spectrum (GeV)', height: 'var(--ssb-ew-h)' });

  const pm = plot2d(vMix.body, scope, {
    x: [-1.45, 1.55],
    y: [-1.3, 1.3],
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: drawMix,
  });
  pm.handle({
    get: () => [1.1 * Math.cos(S.th), -1.1 * Math.sin(S.th)],
    set: ([x, y]) => setTheta(M.clamp(Math.atan2(-y, x), 0, 65 / DEG)),
    color: 'c1',
    r: 6,
  });
  function arc(p, r, a0, a1, st) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = a0 + ((a1 - a0) * i) / 40;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    p.line(pts, st);
  }
  function drawMix(p) {
    const th = S.th;
    p.circle([0, 0], 1.1, { color: 'grp', width: 1, dash: [3, 5], alpha: 0.45 });
    // gauge basis
    p.arrow([-1.25, 0], [1.3, 0], { color: 'ink2', width: 1.5, head: 8 });
    p.arrow([0, -1.2], [0, 1.22], { color: 'ink2', width: 1.5, head: 8 });
    p.tex('W^3', [1.3, 0], { key: 'w3', offset: [4, 13], align: 'left', small: true });
    p.tex('B', [0, 1.22], { key: 'b', offset: [12, 6], small: true });
    // mass eigenstates
    const z = [Math.cos(th), -Math.sin(th)];
    const a = [Math.sin(th), Math.cos(th)];
    p.segment([-1.1 * z[0], -1.1 * z[1]], [0, 0], { color: 'c1', width: 1.2, dash: [4, 4], alpha: 0.6 });
    p.segment([-1.1 * a[0], -1.1 * a[1]], [0, 0], { color: 'hi', width: 1.2, dash: [4, 4], alpha: 0.6 });
    p.arrow([0, 0], [1.1 * z[0], 1.1 * z[1]], { color: 'c1', width: 3, head: 10 });
    p.arrow([0, 0], [1.1 * a[0], 1.1 * a[1]], { color: 'hi', width: 3, head: 10 });
    p.tex('Z', [1.1 * z[0], 1.1 * z[1]], { key: 'z', offset: [14, 10], small: false, color: 'c1' });
    p.tex('\\gamma', [1.1 * a[0], 1.1 * a[1]], { key: 'g', offset: [14, -4], small: false, color: 'hi' });
    if (th > 0.02) {
      arc(p, 0.5, -th, 0, { color: 'grp', width: 2 });
      arc(p, 0.38, PI / 2 - th, PI / 2, { color: 'grp', width: 2 });
      p.tex('\\theta_W', [0.5 * Math.cos(-th / 2), 0.5 * Math.sin(-th / 2)], { key: 't1', offset: [20, 4], small: true, color: 'grp' });
      p.tex('\\theta_W', [0.38 * Math.cos(PI / 2 - th / 2), 0.38 * Math.sin(PI / 2 - th / 2)], { key: 't2', offset: [4, -14], small: true, color: 'grp' });
    }
    p.tex('\\text{massive: } g W^3-g\'B\\ \\propto\\ Z', [-1.4, -1.22], { key: 'm1', align: 'left', small: true, color: 'c1' });
    p.tex('\\text{massless: } g\'W^3+gB\\ \\propto\\ \\gamma', [-1.4, -1.06], { key: 'm2', align: 'left', small: true, color: 'hi' });
  }

  const pmass = plot2d(vMass.body, scope, {
    x: [-0.9, 4.2],
    y: [-26, 168],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: drawMass,
  });
  function drawMass(p) {
    const ew = M.electroweak(S.th);
    for (let y = 0; y <= 150; y += 50) {
      p.segment([-0.3, y], [4.05, y], { color: 'grid', width: 1 });
      p.tex(String(y), [-0.3, y], { key: 'gy' + y, offset: [-6, 0], align: 'right', small: true, color: 'muted' });
    }
    const items = [
      { x: 0.4, m: 0, col: 'hi', lab: '\\gamma', exp: 0 },
      { x: 1.6, m: ew.mW, col: 'c3', lab: 'W^\\pm', exp: EW.mWexp },
      { x: 2.8, m: Math.min(ew.mZ, 400), col: 'c1', lab: 'Z', exp: EW.mZexp },
      { x: 3.75, m: EW.mH, col: 'muted', lab: 'H', exp: null },
    ];
    for (const it of items) {
      const w = it.lab === 'H' ? 0.24 : 0.36;
      if (it.exp) p.segment([it.x - w - 0.1, it.exp], [it.x + w + 0.1, it.exp], { color: 'ink2', width: 1, dash: [3, 3], alpha: 0.8 });
      p.segment([it.x - w, it.m], [it.x + w, it.m], { color: it.col, width: 4, cap: 'butt' });
      p.tex(it.lab, [it.x, -14], { key: 'l' + it.lab, small: false, color: it.col });
      const mTxt = it.m > 380 ? '\\infty' : texNum(it.m, 1);
      p.tex(mTxt, [it.x, Math.min(it.m, 160)], { key: 'v' + it.lab, offset: [0, -11], small: true, color: it.col });
    }
    p.tex('\\text{dashed: measured}', [4.05, 162], { key: 'meas', align: 'right', small: true, color: 'muted' });
  }

  // ------------------------------------------------------------------ panel
  const secE = pg.section('Electroweak mixing');
  const sTh = ui.slider(secE, {
    label: 'Weinberg angle $\\theta_W$ (at fixed $g$)',
    min: 0,
    max: 65,
    step: 0.1,
    value: S.th * DEG,
    format: (d) => `${fmt(d, 1)}° · sin²θ = ${fmt(Math.sin(d / DEG) ** 2, 3)}`,
    onInput: (d) => setTheta(d / DEG, true),
  });
  ui.buttons(secE, [
    { label: 'Physical: $\\sin^2\\theta_W=0.231$', onClick: () => setTheta(TH_PHYS) },
    { label: '$\\theta_W=0$', onClick: () => setTheta(0) },
  ]);
  const outR = ui.readout(secE, { label: 'Mass eigenstates = rotated gauge fields' });
  const kv = ui.keyValue(secE, [
    ['$g$ (from $m_W=gv/2$)', ''],
    ["$g'=g\\tan\\theta_W$", ''],
    ['$e=g\\sin\\theta_W$', ''],
    ['$m_W=gv/2$', ''],
    ['$m_Z=m_W/\\cos\\theta_W$', ''],
    ['$m_\\gamma$', '$0$ for every $\\theta_W$'],
  ]);
  ui.note(secE, `$v=${EW.v.toFixed(0)}$ GeV. Tree level: with $\\sin^2\\theta_W=0.231$ ($\\overline{\\rm MS}$) one gets $m_Z\\approx91.7$ GeV against the measured $91.19$; the $0.5\\%$ gap is radiative corrections (on-shell $\\sin^2\\theta_W=1-m_W^2/m_Z^2\\approx0.223$).`);

  const secQ = pg.section('Why the photon stays massless');
  ui.texBlock(
    secQ,
    '\\langle\\phi\\rangle=\\tfrac{1}{\\sqrt2}\\begin{pmatrix}0\\\\ v\\end{pmatrix}:\\quad' +
      '\\begin{aligned}\\alg{T_{1,2}}\\langle\\phi\\rangle&\\neq0,\\\\ \\alg{T_3}\\langle\\phi\\rangle&=-\\tfrac12\\langle\\phi\\rangle,\\\\ \\alg{\\tfrac Y2}\\langle\\phi\\rangle&=+\\tfrac12\\langle\\phi\\rangle,\\\\ \\hi{Q}\\langle\\phi\\rangle&=\\bigl(\\alg{T_3}+\\alg{\\tfrac Y2}\\bigr)\\langle\\phi\\rangle=0.\\end{aligned}',
  );
  ui.note(secQ, 'Three combinations move the vacuum (3 Goldstones, eaten by $W^\\pm$, $Z$); $Q$ leaves it fixed, so $U(1)_{\\rm em}$ survives.');

  ui.legend(pg.section('Legend'), [
    { color: 'c3', label: 'unbroken generators ($H$)' },
    { color: 'alg', label: 'broken: massless Goldstones' },
    { color: 'hi', label: 'broken, tilted: pseudo-Goldstones; photon' },
    { color: 'grp', label: 'broken and gauged: eaten (Higgs mechanism)' },
    { color: 'c1', label: '$Z$ boson (massive mixture)' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Count the pions',
      text: '$SU(2)_L\\times SU(2)_R$ has $3+3$ generators; the vacuum keeps the 3 of isospin $SU(2)_V$. Three broken generators, three pions — light, because the up and down quark masses tilt the hat (first tab).',
      apply: () => highlight('chi2'),
    },
    {
      title: 'Pions are an $O(4)$ magnet',
      text: 'Set $N=4$: $O(4)\\to O(3)$ also leaves $6-3=3$ broken generators, because $SU(2)\\times SU(2)\\cong SO(4)$ locally. The linear sigma model of pions is the $O(4)$ Mexican hat with $(\\sigma,\\vec\\pi)$ as its four components.',
      apply: () => {
        cardEls.onSeg.set(4);
        highlight('on');
      },
    },
    {
      title: 'Rotate the Weinberg angle',
      text: 'Drag the $Z$ arrow. $m_W=gv/2$ is fixed, while $m_Z=m_W/\\cos\\theta_W$ grows with the mixing. The photon is always the orthogonal, massless combination, coupling with $e=g\\sin\\theta_W$; at the physical angle $e^2/4\\pi\\approx1/128$, the fine-structure constant at the $Z$ mass.',
      apply: () => {
        highlight('ew');
        setTheta(TH_PHYS);
      },
    },
    {
      title: 'Switch off hypercharge',
      text: 'At $\\theta_W=0$ ($g\'=0$) there is no mixing: $Z=W^3$ is degenerate with $W^\\pm$ (a leftover "custodial" symmetry), and the photon is pure $B$ with $e=0$ — massless but decoupled.',
      apply: () => {
        highlight('ew');
        setTheta(0);
      },
    },
    {
      title: 'A photon with a mass',
      text: 'In a superconductor nothing is left unbroken: the single $U(1)$ generator is broken and gauged, so the photon eats the Goldstone and becomes massive inside the material. Magnetic fields are screened — levitation.',
      apply: () => highlight('sc'),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>Counting</h2>
    <p>If the vacuum is invariant only under a subgroup $H\\subset G$, the vacua form the coset $G/H$ and the broken
    generators span its tangent space. In a relativistic theory each gives one massless particle:</p>
    $$n_{\\text{Goldstone}}=\\dim G-\\dim H=\\dim G/H .$$
    <p>$\\dim SU(n)=n^2-1$, $\\dim O(N)=N(N-1)/2$. So chiral $SU(3)_L\\times SU(3)_R\\to SU(3)_V$ gives $16-8=8$: the
    $\\pi$, $K$ and $\\eta$ octet. The squares in each card are the generators of $G$: teal ones survive in $H$.</p>
    <div class="callout warning"><span class="callout-title">Exceptions</span>Without Lorentz invariance the count can drop:
    a ferromagnet has one magnon for two broken generators (type B, second tab). Broken <i>spacetime</i> symmetries are
    subtler still: a crystal breaks translations and rotations but has only the three acoustic phonons.</div>`);

  pg.note(`<h2>The Higgs mechanism</h2>
    <p>When the broken symmetry is <b>gauged</b> the Goldstones are not physical particles: each is absorbed as the
    longitudinal polarisation of a gauge boson, which becomes massive ($2+1=3$ polarisations). For the Higgs doublet
    with $D_\\mu=\\partial_\\mu-igW^a_\\mu T^a-ig'\\tfrac Y2B_\\mu$,</p>
    $$|D_\\mu\\langle\\phi\\rangle|^2=\\frac{v^2}{8}\\Bigl[g^2\\bigl((W^1)^2+(W^2)^2\\bigr)+\\bigl(gW^3-g'B\\bigr)^2\\Bigr],$$
    $$m_W=\\frac{gv}2,\\qquad m_Z=\\frac v2\\sqrt{g^2+g'^2}=\\frac{m_W}{\\cos\\theta_W},\\qquad \\tan\\theta_W=\\frac{g'}g .$$
    <p>The mass matrix of $(W^3,B)$ has rank 1: its null vector, the photon $A=\\sin\\theta_W W^3+\\cos\\theta_W B$, is the gauge
    field of the unbroken generator $Q=T_3+Y/2$. Four real Higgs fields minus three eaten leaves one: the Higgs boson at
    125 GeV, the amplitude mode of the first tab.</p>
    <div class="callout physics"><span class="callout-title">Superconductors first</span>Anderson pointed out the mechanism
    in superconductors (1958–63) before Higgs, Englert–Brout and Guralnik–Hagen–Kibble (1964) made it relativistic: inside a
    superconductor the photon has mass $1/\\lambda_L$.</div>`);

  pg.note(`<h2>Going further</h2>
    <ul>
      <li><b>Grand unification.</b> $SU(5)\\to SU(3)\\times SU(2)\\times U(1)$ breaks $24-12=12$ generators: twelve heavy $X,Y$
      bosons. Which subgroups $H$ can appear is read off from root systems: see <a href="#/roots">roots & Dynkin diagrams</a>.</li>
      <li><b>Charges of the Goldstones.</b> The broken generators form a representation of $H$: the pions are an isospin
      triplet of $SU(2)_V$, the eight mesons an octet of $SU(3)_V$.</li>
      <li><b>Topology of $G/H$.</b> Non-trivial loops and spheres in the vacuum manifold give vortices ($\\pi_1(U(1))=\\Z$),
      monopoles ($\\pi_2(S^2)=\\Z$) and skyrmions ($\\pi_3(S^3)=\\Z$, the baryons of the pion field).</li>
      <li><b>Symmetry restoration.</b> At high temperature the hat flattens and $\\langle\\phi\\rangle\\to0$; the early universe
      went through the electroweak transition at $T\\sim160$ GeV.</li>
    </ul>`);

  // ------------------------------------------------------------------ updates
  function setTheta(th, fromSlider = false) {
    if (!Number.isFinite(th)) return;
    S.th = M.clamp(th, 0, 65 / DEG);
    if (!fromSlider) sTh.set(S.th * DEG, { silent: true });
    update();
  }
  function update() {
    const ew = M.electroweak(S.th);
    outR.set(
      `\\begin{pmatrix}Z\\\\ A\\end{pmatrix}=\\grp{${texMatrix(
        [
          [ew.c, -ew.s],
          [ew.s, ew.c],
        ],
        3,
      )}}\\begin{pmatrix}W^3\\\\ B\\end{pmatrix}`,
    );
    kv.set('$g$ (from $m_W=gv/2$)', fmt(ew.g, 3));
    kv.set("$g'=g\\tan\\theta_W$", fmt(ew.gp, 3));
    kv.set('$e=g\\sin\\theta_W$', ew.e > 1e-6 ? `${fmt(ew.e, 3)} · $1/\\alpha=${texNum(1 / ew.alpha, 1)}$` : '0 (decoupled)');
    kv.set('$m_W=gv/2$', `${fmt(ew.mW, 1)} GeV`);
    kv.set('$m_Z=m_W/\\cos\\theta_W$', `${fmt(ew.mZ, 1)} GeV`);
    pm.invalidate();
    pmass.invalidate();
  }
  update();
}
