// Tab (b): tensor products as Minkowski sums of weight diagrams, peeled into irreps (highest weight first).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { clamp, easeInOut } from '../../core/la.js';
import { mix } from '../../core/theme.js';
import * as M from './math.js';
import { ringStack, stackRadius, bounds, shift, star } from './draw.js';

const QUARK_LABELS = {
  flavour: { '1,0': 'u', '-1,1': 'd', '0,-1': 's', '-1,0': '\\bar u', '1,-1': '\\bar d', '0,1': '\\bar s' },
  colour: { '1,0': 'r', '-1,1': 'g', '0,-1': 'b', '-1,0': '\\bar r', '1,-1': '\\bar g', '0,1': '\\bar b' },
};

/** Physics commentary per product (flavour / colour reading). */
const PHYSICS = {
  '3x3b': {
    flavour: 'A quark and an antiquark give the meson nonet: the octet ($\\pi,K,\\eta_8$) and a singlet $\\eta_1\\propto u\\bar u+d\\bar d+s\\bar s$ (mostly the $\\eta^\\prime$).',
    colour: 'The singlet $\\tfrac1{\\sqrt3}(r\\bar r+g\\bar g+b\\bar b)$ is invariant under every colour rotation — it is the colour wavefunction of every meson. The octet is coloured: those $q\\bar q$ states are confined.',
    singlet: { flavour: '\\eta_1', colour: '\\tfrac{1}{\\sqrt3}\\delta_{i}^{\\,j}\\,q^i\\bar q_j' },
  },
  '3x3': {
    flavour: 'Two quarks: a symmetric sextet and an antisymmetric anti-triplet. In a baryon the diquark sits in the antisymmetric $\\overline{\\mathbf 3}$ of colour.',
    colour: 'No singlet: triality $1+1=2$. A pair of quarks always carries colour, so free diquarks do not exist; the $\\overline{\\mathbf 3}$ channel is attractive and behaves like an antiquark.',
  },
  '3x3x3': {
    flavour: 'Three quarks: $\\mathbf{10}_S\\oplus\\mathbf 8_{M}\\oplus\\mathbf 8_{M}\\oplus\\mathbf 1_A$. With spin, the symmetric decuplet ($J=\\tfrac32$) and the mixed-symmetry octet ($J=\\tfrac12$) are exactly the baryons of the previous tab.',
    colour: 'The singlet is the totally antisymmetric $\\epsilon_{ijk}q^iq^jq^k$: every baryon is antisymmetric in colour, so the rest of its wavefunction must be symmetric — the resolution of the $\\Delta^{++}=uuu$ puzzle.',
    singlet: { flavour: '\\Lambda_1\\;(\\text{antisym. } uds)', colour: '\\tfrac1{\\sqrt6}\\epsilon_{ijk}q^iq^jq^k' },
  },
  '8x8': {
    flavour: 'Two octets (meson–baryon scattering, two mesons): $\\mathbf{27}\\oplus\\mathbf{10}\\oplus\\overline{\\mathbf{10}}\\oplus\\mathbf 8_S\\oplus\\mathbf 8_A\\oplus\\mathbf 1$. The two octets are the $d_{abc}$ (symmetric) and $f_{abc}$ (antisymmetric) couplings: the $D$ and $F$ of hyperon decays.',
    colour: 'Two gluons can form a colour singlet $g^a_{\\mu\\nu}g^{a\\,\\mu\\nu}$: bound states of glue alone, glueballs, are allowed by colour.',
    singlet: { flavour: '\\delta_{ab}\\,\\phi^a\\phi^b', colour: '\\tfrac{1}{\\sqrt8}\\,g^a g^a' },
  },
  '3x8': {
    flavour: 'A quark and an octet meson: $\\mathbf{15}\\oplus\\overline{\\mathbf 6}\\oplus\\mathbf 3$.',
    colour: 'Triality 1: adding gluons never removes a quark’s colour. Whatever cloud of gluons surrounds a single quark, the total is still a colour triplet — a lone quark cannot be colourless.',
  },
  '6x3': {
    flavour: 'Symmetric diquark + quark $= \\mathbf{10}\\oplus\\mathbf 8$: the decuplet is built from the symmetric $\\mathbf 6$.',
    colour: 'Triality is $2+1\\equiv0$, yet there is no singlet: triality zero is necessary, not sufficient. The colour singlet of three quarks lives only in the antisymmetric ($\\overline{\\mathbf 3}$) diquark channel.',
  },
};

export function mountProducts(pg, scope, ctx) {
  const S = (ctx.state.b ??= { prod: '3x3b', t: 0, playing: true, labels: 'colour', speed: 1 });
  let ready = false;

  // ------------------------------------------------------------ model
  let G = null;
  function build() {
    const P = M.PRODUCTS.find((x) => x.id === S.prod) || M.PRODUCTS[0];
    S.prod = P.id;
    const T = M.tensorProduct(P.factors);
    const stageList = T.stages.map((Mm) =>
      [...Mm]
        .map(([k, m]) => ({ key: k, dyn: M.unkey(k), mult: m, pt: M.toPlane(M.unkey(k)) }))
        .sort((a, b) => b.pt[1] - a.pt[1] || a.pt[0] - b.pt[0]),
    );
    const segs = [];
    let t = 0;
    const push = (seg) => {
      seg.t0 = t;
      t += seg.dur;
      seg.t1 = t;
      segs.push(seg);
    };
    push({ type: 'show', dur: 1.3 });
    for (let j = 1; j < P.factors.length; j++) {
      push({ type: 'copies', j, dur: 0.7 + 0.34 * stageList[j - 1].length });
      push({ type: 'merge', j, dur: 1.0 });
    }
    T.copies.forEach((c, k) => push({ type: 'peel', k, dur: 1.6 }));
    push({ type: 'done', dur: 0.001 });
    const final = stageList[stageList.length - 1];
    const assign = new Map(final.map((w) => [w.key, []]));
    T.copies.forEach((c, k) => {
      for (const w of M.weights(c.p, c.q)) {
        const arr = assign.get(M.key(w.dyn));
        for (let i = 0; i < w.mult; i++) arr.push(k);
      }
    });
    const maxMult = Math.max(...final.map((w) => w.mult));
    const b = bounds([...final.map((w) => w.pt), ...stageList[0].map((w) => w.pt)]);
    G = { P, T, stageList, segs, total: t, assign, final, maxMult, b };
    S.t = clamp(S.t, 0, G.total);
  }
  build();

  // ------------------------------------------------------------ view
  const v = pg.view({ title: '', hint: 'copies of one diagram on every weight of the other · then peel from the top' });
  const p = plot2d(v.body, scope, { grid: false, axes: false, pan: false, zoom: false, draw });

  function fit() {
    const { b } = G;
    p.setView({ x: [b.x0 - 0.9, b.x1 + 0.9], y: [b.y0 - 0.75, b.y1 + 0.85] });
  }
  const colorOf = (k) => `c${(k % 8) + 1}`;

  function segAt(t) {
    for (const s of G.segs) if (t < s.t1) return s;
    return G.segs[G.segs.length - 1];
  }

  function ringOpts() {
    const px = p.scale;
    const r0 = clamp(px * 0.045, 3.2, 6.5);
    const gap = clamp((px * 0.4 - r0) / Math.max(1, G.maxMult - 1), 1.6, 4.2);
    return { r0, gap, width: 1.6 };
  }

  function draw(p) {
    if (!ready) return;
    const t = S.t;
    const seg = segAt(t);
    const u = seg.type === 'done' ? 1 : clamp((t - seg.t0) / seg.dur, 0, 1);
    const ro = ringOpts();
    const pal = p.colors;
    // faint axes
    p.line(
      [
        [G.b.x0 - 0.6, 0],
        [G.b.x1 + 0.6, 0],
      ],
      { color: 'axis', width: 1, alpha: 0.6 },
    );
    p.line(
      [
        [0, G.b.y0 - 0.5],
        [0, G.b.y1 + 0.55],
      ],
      { color: 'axis', width: 1, alpha: 0.6 },
    );
    p.tex('I_3', [G.b.x1 + 0.6, 0], { key: 'axI', offset: [6, -10], small: true, color: 'muted', align: 'left' });
    p.tex('Y', [0, G.b.y1 + 0.55], { key: 'axY', offset: [8, 4], small: true, color: 'muted', align: 'left' });

    if (seg.type === 'show') {
      drawStage(p, 0, ro, easeInOut(Math.min(1, u * 1.6)), true);
      drawInset(p, 1);
    } else if (seg.type === 'copies') {
      drawStage(p, seg.j - 1, ro, 1, seg.j === 1);
      drawCopies(p, seg.j, u, 1, ro);
      drawInset(p, seg.j);
    } else if (seg.type === 'merge') {
      const e = easeInOut(u);
      drawCopies(p, seg.j, 1, 1 - e, ro);
      drawStage(p, seg.j - 1, ro, 1 - e, seg.j === 1);
      drawStage(p, seg.j, ro, e, false, true);
    } else {
      // peel / done
      const k = seg.type === 'peel' ? seg.k : G.T.copies.length;
      const e = seg.type === 'peel' ? easeInOut(clamp(u * 1.5 - 0.25, 0, 1)) : 1;
      // outlines of the irreps peeled so far
      G.T.copies.forEach((c, i) => {
        if (i > k) return;
        const pts = M.outline(c.p, c.q);
        const a = i < k ? 0.55 : e;
        if (pts.length >= 3) p.polygon(pts, { fill: colorOf(i), alpha: (i === k ? 0.05 : 0.018) * a, stroke: colorOf(i), width: i === k ? 2.2 : 1.4, strokeAlpha: a * (i === k ? 1 : 0.7) });
      });
      for (const w of G.final) {
        const arr = G.assign.get(w.key);
        const cols = arr.map((ci) => {
          const c = pal[colorOf(ci)];
          if (ci < k) return c;
          if (ci === k) return mix(pal.muted, c, e);
          return pal.muted;
        });
        ringStack(p, w.pt, w.mult, { ...ro, colors: cols });
      }
      if (seg.type === 'peel') {
        const c = G.T.copies[k];
        const hw = M.toPlane([c.p, c.q]);
        const R = stackRadius(G.final.find((w) => w.key === M.key([c.p, c.q]))?.mult || 1, ro) + 5;
        p.circle(hw, R / p.scale, { color: 'hi', width: 2.2, alpha: 1 - 0.6 * e });
        star(p, [hw[0], hw[1]], 7, { alpha: 1 - 0.5 * e });
        p.tex(`\\text{highest weight}\\to${M.irrepTex(c.p, c.q)}`, hw, { key: 'hwlab', offset: [R + 10, -R - 6], align: 'left', small: true, color: 'hi' });
      }
      // singlet annotation
      const si = G.T.copies.findIndex((c) => c.p === 0 && c.q === 0);
      if (si >= 0 && si < k + (seg.type === 'done' ? 1 : e > 0.6 ? 1 : 0)) {
        const ph = PHYSICS[G.P.id];
        const form = ph && ph.singlet ? ph.singlet[S.labels] : '';
        const R0 = stackRadius(G.final.find((w) => w.key === '0,0').mult, ro);
        p.tex(`\\col{${colorOf(si)}}{\\mathbf 1}${form ? ':\\;' + form : ''}`, [0, 0], { key: 'singlet', offset: [R0 + 10, R0 + 12], align: 'left', small: true });
      }
    }
  }

  /** The weights of stage j as dots/rings; `labels` puts quark labels on the first factor. */
  function drawStage(p, j, ro, alpha, labels, muted = false) {
    if (alpha <= 0.01) return;
    const W = G.stageList[j];
    const pq = j === 0 ? G.P.factors[0] : null;
    if (pq) {
      const pts = M.outline(pq[0], pq[1]);
      if (pts.length >= 3) p.polygon(pts, { fill: 'grp', alpha: 0.06 * alpha, stroke: 'grp', width: 1.5, strokeAlpha: 0.75 * alpha });
    }
    for (const w of W) {
      ringStack(p, w.pt, w.mult, { ...ro, color: muted ? 'muted' : 'ink', ringColor: muted ? 'muted' : 'ink2', alpha });
      if (muted && w.mult > 1 && alpha > 0.4) {
        const R = stackRadius(w.mult, ro);
        p.text(String(w.mult), w.pt, { offset: [R * 0.72 + 5, -R * 0.72 - 5], color: 'muted', size: 10.5, alpha, align: 'left' });
      }
    }
    if (labels && alpha > 0.3) {
      const L = QUARK_LABELS[S.labels];
      for (const w of W) {
        const lab = L[w.key];
        if (lab && (G.P.factors[0][0] + G.P.factors[0][1] === 1)) p.tex(lab, w.pt, { key: 'ql' + w.key, offset: [0, -stackRadius(w.mult, ro) - 12], color: 'grp' });
      }
    }
  }

  /** Copies of factor j placed on each weight of stage j−1 (appearing one by one for u ∈ [0,1]). */
  function drawCopies(p, j, u, alpha, ro) {
    const base = G.stageList[j - 1];
    const f = G.P.factors[j];
    const FW = M.weights(f[0], f[1]);
    const fo = M.outline(f[0], f[1]);
    const n = base.length;
    base.forEach((w, i) => {
      const s0 = (i / n) * 0.78;
      const e = easeInOut(clamp((u - s0) / 0.22, 0, 1));
      if (e <= 0) return;
      const a = alpha * (0.35 + 0.65 * e);
      const sc = 0.35 + 0.65 * e;
      if (fo.length >= 3)
        p.polygon(
          shift(
            fo.map((q) => [q[0] * sc, q[1] * sc]),
            w.pt,
          ),
          { fill: 'ink2', alpha: 0.04 * a, stroke: 'ink2', width: 1.3, strokeAlpha: 0.8 * a, dash: [5, 3] },
        );
      for (const fw of FW) {
        const pt = [w.pt[0] + fw.pt[0] * sc, w.pt[1] + fw.pt[1] * sc];
        p.dot(pt, { r: Math.max(2.6, ro.r0 - 1), fill: 'ink2', alpha: a });
      }
      if (w.mult > 1) p.text('×' + w.mult, w.pt, { offset: [0, 16], color: 'ink2', size: 11, align: 'center', alpha: a });
    });
  }

  /** Small inset of the factor being multiplied in (top-right). */
  function drawInset(p, j) {
    const f = G.P.factors[j];
    if (!f || p.width < 380) return;
    const S0 = 24;
    const cx = p.width - 62;
    const cy = 74;
    const ctx = p.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fillStyle = p.color('surface');
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.color('grid');
    ctx.lineWidth = 1;
    ctx.stroke();
    const fo = M.outline(f[0], f[1]);
    if (fo.length >= 3) {
      ctx.beginPath();
      fo.forEach((q, i) => (i ? ctx.lineTo(cx + q[0] * S0, cy - q[1] * S0) : ctx.moveTo(cx + q[0] * S0, cy - q[1] * S0)));
      ctx.closePath();
      ctx.strokeStyle = p.color('ink2');
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    for (const w of M.weights(f[0], f[1])) {
      ctx.beginPath();
      ctx.arc(cx + w.pt[0] * S0, cy - w.pt[1] * S0, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = p.color('ink2');
      ctx.fill();
    }
    ctx.restore();
    p.tex(`\\otimes\\,${M.irrepTex(f[0], f[1])}`, [p.wx(cx), p.wy(cy + 44)], { key: 'insetlab', offset: [0, 12], small: true, color: 'ink2' });
  }

  // ------------------------------------------------------------ panel
  const secP = pg.section('Product');
  const sel = ui.select(secP, {
    options: M.PRODUCTS.map((x) => ({ value: x.id, label: x.label })),
    value: S.prod,
    onChange: (id) => {
      S.prod = id;
      S.t = 0;
      build();
      fit();
      play.set(true);
      refresh();
    },
  });
  const segLab = ui.segmented(secP, {
    label: 'Read the triplet as',
    options: [
      { value: 'flavour', label: 'flavour $u,d,s$' },
      { value: 'colour', label: 'colour $r,g,b$' },
    ],
    value: S.labels,
    onChange: (x) => {
      S.labels = x;
      refresh();
    },
  });
  const play = ui.playButton(secP, {
    playing: S.playing,
    onToggle: (x) => {
      S.playing = x;
      if (x && S.t >= G.total - 1e-6) S.t = 0;
      p.invalidate();
    },
  });
  ui.buttons(secP, [
    { label: 'Step ▸', small: true, onClick: () => stepNext() },
    { label: 'Restart', small: true, onClick: () => ((S.t = 0), play.set(true), refresh()) },
    { label: 'Result', small: true, onClick: () => ((S.t = G.total), play.set(false), refresh()) },
  ]);
  const prog = ui.slider(secP, {
    label: 'Progress',
    min: 0,
    max: 1,
    step: 0.001,
    value: S.t / G.total,
    format: (x) => Math.round(x * 100) + '%',
    onInput: (x) => {
      S.t = x * G.total;
      play.set(false);
      refresh();
    },
  });
  const speed = ui.slider(secP, { label: 'Speed', min: 0.25, max: 2.5, step: 0.05, value: S.speed, format: (x) => x.toFixed(2) + '×', onInput: (x) => (S.speed = x) });
  void speed;

  const secR = pg.section('Result');
  const eqOut = ui.readout(secR, {});
  const dimOut = ui.readout(secR, {});
  const badgeRow = ui.h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' } });
  secR.appendChild(badgeRow);
  const bSinglet = ui.badge(badgeRow, '', 'good');
  const bTri = ui.badge(badgeRow, '', '');
  const physOut = ui.h('p', { class: 'phys-text' });
  secR.appendChild(physOut);
  ui.legend(secR, [
    { color: 'grp', label: 'first factor (its Weyl orbit)' },
    { color: 'ink2', label: 'copies of the next factor' },
    { color: 'hi', label: 'current highest weight' },
    { color: 'muted', label: 'states not yet assigned', dot: true },
  ]);

  const secT = pg.section('Try this');
  const go = (id, labels) => {
    S.prod = id;
    S.labels = labels;
    sel.set(id, { silent: true });
    segLab.set(labels, { silent: true });
    S.t = 0;
    build();
    fit();
    play.set(true);
    refresh();
  };
  ui.experiments(secT, [
    {
      title: 'Mesons: $\\mathbf 3\\otimes\\overline{\\mathbf 3}=\\mathbf 8\\oplus\\mathbf 1$',
      text: 'Three copies of the upward triangle on the three quark weights fill a hexagon with a triple centre. Peel the octet; one state is left at the origin — the colour singlet $r\\bar r+g\\bar g+b\\bar b$, the colour state of every meson.',
      apply: () => go('3x3b', 'colour'),
    },
    {
      title: 'No free diquarks',
      text: '$\\mathbf 3\\otimes\\mathbf 3=\\mathbf 6\\oplus\\overline{\\mathbf 3}$: nothing is left at the origin. Two quarks always carry colour, so $qq$ is never seen alone.',
      apply: () => go('3x3', 'colour'),
    },
    {
      title: 'Baryons: $\\mathbf{10}\\oplus\\mathbf 8\\oplus\\mathbf 8\\oplus\\mathbf 1$',
      text: 'In flavour these are the decuplet and octet baryons; in colour the singlet $\\epsilon_{ijk}q^iq^jq^k$ is the reason three quarks can be colourless — and why it is antisymmetric.',
      apply: () => go('3x3x3', 'flavour'),
    },
    {
      title: 'Two gluons can be colourless',
      text: '$\\mathbf 8\\otimes\\mathbf 8$ contains a singlet, so glueballs — bound states of glue alone — are allowed. Note the two octets (symmetric $d_{abc}$, antisymmetric $f_{abc}$).',
      apply: () => go('8x8', 'colour'),
    },
    {
      title: 'Gluons cannot neutralise a quark',
      text: '$\\mathbf 3\\otimes\\mathbf 8=\\mathbf{15}\\oplus\\overline{\\mathbf 6}\\oplus\\mathbf 3$ has triality 1, and so has any number of extra gluons: a single quark can never be dressed into a colour singlet.',
      apply: () => go('3x8', 'colour'),
    },
    {
      title: 'Triality zero is not enough',
      text: '$\\mathbf 6\\otimes\\mathbf 3=\\mathbf{10}\\oplus\\mathbf 8$ has triality 0 but no singlet: a singlet needs a factor and its conjugate, here the antisymmetric $\\overline{\\mathbf 3}$ diquark.',
      apply: () => go('6x3', 'colour'),
    },
  ]);

  notes(pg);

  // ------------------------------------------------------------ logic
  function stepNext() {
    const s = segAt(S.t + 1e-6);
    S.t = s.type === 'done' ? G.total : Math.min(G.total, s.t1 + 1e-6);
    // land on the end of a peel step so its colours are fully visible
    const s2 = segAt(S.t);
    if (s2.type === 'peel' || s2.type === 'merge' || s2.type === 'copies') S.t = s2.t1 - 1e-6;
    play.set(false);
    refresh();
  }

  function refresh() {
    const P = G.P;
    const seg = segAt(S.t);
    const peeled = seg.type === 'done' ? G.T.copies.length : seg.type === 'peel' ? seg.k + ((S.t - seg.t0) / seg.dur > 0.5 ? 1 : 0) : 0;
    v.setTitle(`$${P.tex}$ &nbsp;·&nbsp; ${seg.type === 'show' ? 'first factor' : seg.type === 'copies' ? 'placing copies (Minkowski sum)' : seg.type === 'merge' ? 'all states of the product' : 'peeling off irreducible multiplets'}`);
    const parts = G.T.copies.map((c, i) => (i < peeled ? `\\col{${colorOf(i)}}{${M.irrepTex(c.p, c.q)}}` : null)).filter(Boolean);
    const rest = peeled < G.T.copies.length ? (parts.length ? '\\oplus\\cdots' : '\\;?') : '';
    eqOut.set(`${P.tex}=${parts.join('\\oplus ')}${rest}`);
    const dims = P.factors.map(([a, c]) => M.dim(a, c));
    const dparts = G.T.copies.map((c, i) => (i < peeled ? `\\col{${colorOf(i)}}{${M.dim(c.p, c.q)}}` : null)).filter(Boolean);
    dimOut.set(`${dims.join('\\times')}=${G.T.total}${dparts.length ? '=' + dparts.join('+') + (peeled < G.T.copies.length ? '+\\cdots' : '') : ''}`);
    const has = G.T.singlets > 0;
    bSinglet.set(has ? `contains $\\mathbf 1$: colourless state exists` : 'no singlet: always coloured', has ? 'good' : 'bad');
    bTri.set(`triality ${G.T.triality}`, '');
    const ph = PHYSICS[P.id];
    physOut.innerHTML = '';
    physOut.appendChild(ui.h('span', { html: ph ? ph[S.labels] : '' }));
    prog.set(S.t / G.total, { silent: true });
    p.invalidate();
  }

  let lastPeeled = -1;
  scope.frame((dt) => {
    if (!play.playing) return;
    S.t += dt * S.speed;
    if (S.t >= G.total) {
      S.t = G.total;
      play.set(false);
    }
    const seg = segAt(S.t);
    const key = seg.type + (seg.k ?? '') + (seg.j ?? '') + ((S.t - seg.t0) / seg.dur > 0.5 ? 'b' : 'a');
    if (key !== lastPeeled) {
      lastPeeled = key;
      refresh();
    } else {
      prog.set(S.t / G.total, { silent: true });
      p.invalidate();
    }
  });

  ready = true;
  fit();
  refresh();
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>The weights of a tensor product are all sums $\\mu+\\nu$ of a weight of the first factor and one of the second — the charges simply
  add, $T_3^{(1+2)}=T_3^{(1)}+T_3^{(2)}$. Geometrically: put a copy of the second diagram on every weight of the first (a Minkowski sum)
  and count states with multiplicity.</p>
  <p>Then decompose. The weight with the largest height $\\langle\\mu,\\rho\\rangle$ ($\\rho$ strictly dominant, here $\\rho=\\alpha_1+\\alpha_2$)
  cannot be reached by any raising operator, so it is the highest weight of an irreducible piece. Remove that whole multiplet
  (with its Freudenthal multiplicities) and repeat. Each colour is one irreducible multiplet.</p>`);
  pg.note(`<h2>The physics: confinement and colour singlets</h2>
  <p>QCD is an SU(3) gauge theory of colour. All observed hadrons are colour singlets — states invariant under every
  $e^{-i\\theta^aT_a}$. The singlet appears in $\\mathbf 3\\otimes\\overline{\\mathbf 3}$ (mesons) and $\\mathbf 3\\otimes\\mathbf 3\\otimes\\mathbf 3$
  (baryons), but not in $\\mathbf 3\\otimes\\mathbf 3$ or $\\mathbf 3\\otimes\\mathbf 8$.</p>
  <div class="callout physics"><span class="callout-title">Triality</span>The centre of SU(3) is $\\{1,\\omega,\\omega^2\\}$, $\\omega=e^{2\\pi i/3}$,
  acting on $(p,q)$ as $\\omega^{p-q}$. Triality $(p-q)\\bmod 3$ is additive in products, and the singlet has triality 0. Hence any colourless state
  has $N_q-N_{\\bar q}\\equiv0\\pmod 3$: $q\\bar q$, $qqq$, and exotics such as tetraquarks $qq\\bar q\\bar q$ and pentaquarks $qqqq\\bar q$ (seen at LHCb).</div>
  <p>The same decompositions with flavour labels give the quark model: $\\mathbf 3\\otimes\\overline{\\mathbf 3}=\\mathbf 8\\oplus\\mathbf 1$ is the meson nonet, and
  $\\mathbf 3\\otimes\\mathbf 3\\otimes\\mathbf 3=\\mathbf{10}\\oplus\\mathbf 8\\oplus\\mathbf 8\\oplus\\mathbf 1$ contains the baryon decuplet and octet.</p>`);
  pg.note(`<h2>The mathematics</h2>
  <p>Characters multiply, $\\chi_{A\\otimes B}=\\chi_A\\chi_B$, and the irreducible characters are linearly independent, so the peeling is unique.
  Two quick checks: dimensions add, and a singlet appears in $A\\otimes B$ exactly once iff $B\\cong\\overline A$ (Schur). For SU(3):
  $$\\mathbf 8\\otimes\\mathbf 8=\\mathbf{27}\\oplus\\mathbf{10}\\oplus\\overline{\\mathbf{10}}\\oplus\\mathbf 8\\oplus\\mathbf 8\\oplus\\mathbf 1,\\qquad 64=27+10+10+8+8+1 .$$
  The general rule is the Littlewood–Richardson rule (Young tableaux); the weight-diagram method shown here works for any compact group.</p>`);
  pg.note(`<h2>Going further</h2>
  <ul>
  <li>Spin addition $\\tfrac12\\otimes\\tfrac12=1\\oplus0$ is the SU(2) version of the same peeling — see <a href="#/reps">spin multiplets</a>.</li>
  <li>Why colour must be gauged and how the gluon charges are the roots of SU(3): next tab, and <a href="#/roots">roots &amp; weights</a>.</li>
  <li>Grand unification puts colour and the electroweak group into one simple group, e.g. SU(5) with $\\overline{\\mathbf 5}=(\\overline{\\mathbf 3},1)\\oplus(1,\\mathbf 2)$ — the classification is in <a href="#/roots">roots</a>.</li>
  </ul>`);
}
