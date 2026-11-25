// Tab (a): weight diagrams of SU(3) irreps (p, q) with multiplicities, ladder operators, hadron overlays.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { mulberry32, easeInOut, clamp } from '../../core/la.js';
import { fmt, texFrac } from '../../core/format.js';
import * as M from './math.js';
import { ringStack, stackRadius, outlinePoly, bounds, axisArrow, fracText } from './draw.js';

const PRESETS = [
  [0, 0, '$\\mathbf 1$'],
  [1, 0, '$\\mathbf 3$'],
  [0, 1, '$\\overline{\\mathbf 3}$'],
  [2, 0, '$\\mathbf 6$'],
  [1, 1, '$\\mathbf 8$'],
  [3, 0, '$\\mathbf{10}$'],
  [2, 2, '$\\mathbf{27}$'],
];
/** What each ladder operator does to a quark (on antiquarks it acts with the conjugate rule). */
const QUARK_RULE = { 'I+': 'd\\to u', 'I-': 'u\\to d', 'U+': 's\\to d', 'U-': 'd\\to s', 'V+': 's\\to u', 'V-': 'u\\to s' };
const SU2_DIR = { I: [1, 0], U: [-0.5, M.SQ3 / 2], V: [0.5, M.SQ3 / 2] };
const U_DIR = SU2_DIR.U;

export function mountWeights(pg, scope, ctx) {
  const S = (ctx.state.w ??= {
    p: 1,
    q: 1,
    names: true,
    octet: 'baryons',
    hideOmega: false,
    charge: false,
    strings: 'off',
    shells: true,
    sel: '1,1',
    playing: true,
  });

  // ------------------------------------------------------------ derived data (per irrep)
  let D = null;
  function derive() {
    const W = M.weights(S.p, S.q);
    const map = new Map(W.map((w) => [M.key(w.dyn), w]));
    const mult = M.multipletFor(S.p, S.q, S.octet);
    const byKey = new Map();
    if (mult) for (const P of mult.particles) (byKey.get(M.key(P.dyn)) || byKey.set(M.key(P.dyn), []).get(M.key(P.dyn))).push(P);
    const b = bounds(W.map((w) => w.pt));
    const maxMult = Math.max(...W.map((w) => w.mult));
    const rows = [...new Set(W.map((w) => w.iy[1]))].sort((a, c) => c - a);
    D = { W, map, mult, byKey, b, maxMult, rows, strings: {}, shells: M.shells(S.p, S.q) };
    for (const s of ['I', 'U', 'V']) D.strings[s] = M.su2Strings(S.p, S.q, s);
    if (!map.has(S.sel)) S.sel = M.key([S.p, S.q]);
  }
  derive();
  const showNames = () => S.names && !!D.mult;

  // ------------------------------------------------------------ view
  let ready = false; // draw() runs inside plot2d() before the panel exists
  const v = pg.view({ title: '', hint: 'hover or click a state · arrows: ladder operators $E_\\alpha$' });
  const p = plot2d(v.body, scope, { grid: false, axes: false, pan: false, zoom: false, draw });

  let hover = null; // key of hovered weight
  let anim = null; // { from, to, root, t }
  let idle = 0;
  let lastRoot = null;
  const rng = mulberry32(7);

  function fit() {
    const { b } = D;
    const masses = showNames() && D.mult.rows;
    const x0 = Math.min(b.x0, -0.5) - 0.85;
    const x1 = Math.max(b.x1, 0.5) + (masses ? 2.55 : 0.8);
    const y0 = Math.min(b.y0, -0.45) - 0.55;
    const y1 = Math.max(b.y1, 0.45) + 0.7;
    p.setView({ x: [x0, x1], y: [y0, y1] });
  }

  function ringOpts() {
    const px = p.scale; // pixels per unit (nearest-neighbour distance of weights is 1)
    const gap = clamp((px * 0.36 - 4.5) / Math.max(1, D.maxMult - 1), 1.7, 3.8);
    return { r0: clamp(px * 0.07, 3.2, 5.2), gap };
  }

  // ------------------------------------------------------------ drawing
  function draw(p) {
    if (!ready) return;
    const { W, map, b } = D;
    const ro = ringOpts();
    const vw = p.view;
    // axes
    axisArrow(p, [Math.min(b.x0, -0.5) - 0.45, 0], [Math.max(b.x1, 0.5) + 0.5, 0], 'I_3', { key: 'axI', offset: [4, 13], align: 'left' });
    axisArrow(p, [0, Math.min(b.y0, -0.45) - 0.35], [0, Math.max(b.y1, 0.45) + 0.45], 'Y', { key: 'axY', offset: [10, 2], align: 'left' });
    // Y rows (isospin multiplets live on rows)
    for (const Y of D.rows) {
      const y = (Y * M.SQ3) / 2;
      p.line(
        [
          [b.x0 - 0.35, y],
          [b.x1 + 0.35, y],
        ],
        { color: 'grid', width: 1, dash: [3, 4] },
      );
      p.text('Y = ' + fracText(Y), [vw.x[0], y], { offset: [8, 0], color: 'muted', size: 11 });
    }
    // shells and outline
    if (S.shells)
      for (const sh of D.shells.slice(1)) if (sh.pts.length >= 3) p.polygon(sh.pts, { stroke: 'muted', width: 1, dash: [4, 4], strokeAlpha: 0.55 });
    outlinePoly(p, [S.p, S.q], { fillAlpha: 0.055 });
    // charge lines Q = I3 + Y/2 (parallel to U-spin)
    if (S.charge) drawChargeLines(p);
    if (S.strings !== 'off') drawStrings(p, S.strings, ro);
    // ladder operators from the focus state
    drawLadders(p, ro);
    // weights
    const hw = M.key([S.p, S.q]);
    for (const w of W) {
      const k = M.key(w.dyn);
      const hidden = isHiddenOmega(k);
      if (hidden) {
        p.circle(w.pt, 9 / p.scale, { color: 'hi', width: 1.5, dash: [3, 3] });
        p.tex('?', w.pt, { key: 'om?', color: 'hi', size: 15 });
        continue;
      }
      ringStack(p, w.pt, w.mult, { ...ro, color: 'ink', ringColor: 'ink2' });
    }
    // highest weight marker
    const hwW = map.get(hw);
    if (hwW && !isHiddenOmega(hw)) {
      const r = stackRadius(hwW.mult, ro) + 4.5;
      p.circle(hwW.pt, r / p.scale, { color: 'hi', width: 2 });
      // up-left (150°): between the U₊ stub (120°) and the I₋ arrow (180°)
      if (!showNames()) p.tex('\\Lambda', hwW.pt, { key: 'Lam', offset: [-(r + 9) * 0.87, -(r + 9) * 0.5], color: 'hi', align: 'right' });
    }
    // selection / walker
    drawWalker(p, ro);
    if (showNames()) drawNames(p, ro);
    drawRootLegend(p);
  }

  function isHiddenOmega(k) {
    return S.hideOmega && S.p === 3 && S.q === 0 && showNames() && k === M.key(M.fromIY([0, -2]));
  }

  function drawChargeLines(p) {
    const groups = new Map();
    for (const w of D.W) {
      const Q = Math.round(M.charge(w.dyn) * 6) / 6;
      if (!groups.has(Q)) groups.set(Q, []);
      groups.get(Q).push(w.pt);
    }
    for (const [Q, pts] of groups) {
      // parametrise along U direction
      const ts = pts.map((q) => q[0] * U_DIR[0] + q[1] * U_DIR[1]);
      const t0 = Math.min(...ts) - 0.42;
      const t1 = Math.max(...ts) + 0.42;
      const base = pts[0];
      const tb = base[0] * U_DIR[0] + base[1] * U_DIR[1];
      const A = [base[0] + (t0 - tb) * U_DIR[0], base[1] + (t0 - tb) * U_DIR[1]];
      const Bp = [base[0] + (t1 - tb) * U_DIR[0], base[1] + (t1 - tb) * U_DIR[1]];
      p.line([A, Bp], { color: 'c1', width: 1.4, dash: [6, 4], alpha: 0.85 });
      p.tex(`Q=${Q > 0 ? '+' : ''}${texFrac(Q)}`, Bp, { key: 'Q' + Q, offset: [-4, -9], color: 'c1', small: true, align: 'right' });
    }
  }

  function drawStrings(p, which, ro) {
    const dir = SU2_DIR[which];
    for (const [i, line] of D.strings[which].entries()) {
      const pts = line.states.map((s) => M.toPlane(s.dyn));
      const a = pts[0];
      const z = pts[pts.length - 1];
      const ext = 0.22;
      const A = [a[0] - dir[0] * ext, a[1] - dir[1] * ext];
      const Z = [z[0] + dir[0] * ext, z[1] + dir[1] * ext];
      p.line([A, Z], { color: 'alg', width: Math.max(8, 2 * stackRadius(1, ro) + 4), alpha: 0.16 });
      const spins = line.spins.map((j) => texFrac(j)).join('\\oplus ');
      // U-spin lines coincide with the constant-Q lines (whose labels sit at the upper end), so label U at the lower end
      if (which === 'U') p.tex(`U=${spins}`, A, { key: 'str' + i, offset: [6, 12], color: 'alg', small: true, align: 'left', valign: 'top' });
      else p.tex(`${which}=${spins}`, Z, { key: 'str' + i, offset: [dir[0] * 16 + 4, -dir[1] * 14 - 2], color: 'alg', small: true, align: 'left' });
    }
  }

  function focusKey() {
    if (hover && D.map.has(hover)) return hover;
    return S.sel;
  }

  function drawLadders(p, ro) {
    const fk = anim ? anim.from : focusKey();
    const w = D.map.get(fk);
    if (!w) return;
    const k = p.scale;
    const playingIdle = play.playing && !anim && !hover;
    const baseAlpha = anim ? 0.22 : playingIdle ? clamp(idle / 0.45, 0, 1) * 0.8 : 0.95;
    for (const r of M.ROOTS) {
      const tgt = M.add(w.dyn, r.dyn);
      const T = D.map.get(M.key(tgt));
      const d = M.toPlane(r.dyn);
      const chosen = anim && anim.root.id === r.id;
      if (chosen) continue; // drawn by the walker
      if (T) {
        const r1 = (stackRadius(w.mult, ro) + 3) / k;
        const r2 = (stackRadius(T.mult, ro) + 4) / k;
        const A = [w.pt[0] + d[0] * r1, w.pt[1] + d[1] * r1];
        const Bp = [T.pt[0] - d[0] * r2, T.pt[1] - d[1] * r2];
        p.arrow(A, Bp, { color: 'alg', width: 1.8, head: 8, alpha: baseAlpha });
        if (baseAlpha > 0.3) {
          const mid = [w.pt[0] + d[0] * 0.55, w.pt[1] + d[1] * 0.55];
          p.tex(r.tex, mid, { key: 'lad' + r.id, offset: [-d[1] * 11, -d[0] * 11], color: 'alg', small: true });
        }
      } else if (!anim && baseAlpha > 0.3) {
        const r1 = (stackRadius(w.mult, ro) + 3) / k;
        const len = Math.min(0.3, 26 / k);
        const A = [w.pt[0] + d[0] * r1, w.pt[1] + d[1] * r1];
        const Bp = [w.pt[0] + d[0] * (r1 + len), w.pt[1] + d[1] * (r1 + len)];
        p.line([A, Bp], { color: 'alg', width: 1.2, dash: [2, 3], alpha: baseAlpha * 0.45 });
        p.text('0', Bp, { offset: [d[0] * 7, -d[1] * 7], color: 'muted', size: 10, align: 'center', alpha: baseAlpha * 0.9 });
      }
    }
  }

  function drawWalker(p, ro) {
    const k = p.scale;
    if (anim) {
      const from = D.map.get(anim.from);
      const to = D.map.get(anim.to);
      if (!from || !to) return;
      const e = easeInOut(clamp(anim.t, 0, 1));
      const pos = [from.pt[0] + (to.pt[0] - from.pt[0]) * e, from.pt[1] + (to.pt[1] - from.pt[1]) * e];
      const d = M.toPlane(anim.root.dyn);
      const r1 = (stackRadius(from.mult, ro) + 3) / k;
      const r2 = (stackRadius(to.mult, ro) + 4) / k;
      const A = [from.pt[0] + d[0] * r1, from.pt[1] + d[1] * r1];
      const Bp = [to.pt[0] - d[0] * r2, to.pt[1] - d[1] * r2];
      p.arrow(A, Bp, { color: 'alg', width: 3, head: 11 });
      const mid = [from.pt[0] + d[0] * 0.5, from.pt[1] + d[1] * 0.5];
      p.tex(`E_{${anim.root.tex}}`, mid, { key: 'walkLab', offset: [-d[1] * 15, -d[0] * 15], color: 'alg' });
      p.dot(pos, { r: 6.5, fill: 'hi', alpha: 0.95 });
      return;
    }
    const fk = focusKey();
    const w = D.map.get(fk);
    if (w && !isHiddenOmega(fk)) {
      p.circle(w.pt, (stackRadius(w.mult, ro) + 3) / k, { color: 'hi', width: 2.5 });
      p.dot(w.pt, { r: 4, fill: 'hi' });
    }
  }

  function drawNames(p, ro) {
    const k = p.scale;
    for (const [kk, list] of D.byKey) {
      const w = D.map.get(kk);
      if (!w) continue;
      const R = stackRadius(w.mult, ro);
      if (isHiddenOmega(kk)) continue;
      if (list.length === 1) {
        const P = list[0];
        p.tex(P.tex, w.pt, { key: 'nm' + kk, offset: [0, -R - 5], valign: 'bottom', size: 14.5 });
        p.tex(P.q, w.pt, { key: 'qc' + kk, offset: [0, R + 5], valign: 'top', small: true, color: 'ink2', size: 11.5 });
      } else {
        for (const P of list) {
          const s = P.side || 1;
          p.tex(P.tex, w.pt, { key: 'nm' + kk + P.tex, offset: [s * (R + 9), -9], align: s > 0 ? 'left' : 'right' });
          p.tex(P.q, w.pt, { key: 'qc' + kk + P.tex, offset: [s * (R + 9), 11], align: s > 0 ? 'left' : 'right', small: true, color: 'ink2', size: 11.5 });
        }
      }
    }
    // mass column (MeV): SU(3) is broken by m_s, so each strange quark costs ~150 MeV
    const rows = D.mult.rows;
    if (!rows) return;
    const x = D.b.x1 + 0.95;
    const yTop = (rows[0].Y * M.SQ3) / 2;
    p.text('mass / MeV', [x, yTop], { offset: [0, -30], color: 'muted', size: 11 });
    rows.forEach((row, i) => {
      const y = (row.Y * M.SQ3) / 2;
      let src;
      if (row.omega && S.hideOmega) {
        const om = M.omegaPrediction();
        src = `\\Omega^-\\;\\col{hi}{\\approx ${Math.round(om.predicted)}\\,?}`;
      } else src = `${row.tex}\\;${fmt(row.m, 0)}` + (row.tex2 ? `,\\;\\;${row.tex2}\\;${fmt(row.m2, 0)}` : '');
      p.tex(src, [x, y], { key: 'mass' + i, align: 'left', size: 13.5 });
      if (i > 0 && D.mult === M.MULTIPLETS.decuplet) {
        const prev = rows[i - 1];
        const ym = ((row.Y + prev.Y) / 2) * (M.SQ3 / 2);
        const hidden = row.omega && S.hideOmega;
        const dm = hidden ? M.omegaPrediction().step2 : row.m - prev.m;
        p.tex(`${hidden ? '\\approx' : ''}{+}${fmt(dm, 0)}`, [x, ym], { key: 'dm' + i, align: 'left', small: true, color: hidden ? 'hi' : 'muted', offset: [14, 0] });
      }
    });
    void k;
  }

  function drawRootLegend(p) {
    if (p.width < 520 || p.height < 380) return;
    // only where the bottom-left corner is free of weights and row labels
    const yLow = p.sy(D.b.y0);
    if (yLow > p.height - 112) {
      const xLeft = p.sx(D.b.x0);
      if (xLeft < 120 || D.rows.length > 1) return;
    }
    const cx = 54;
    const cy = p.height - 56;
    const R = 30;
    const ctx = p.ctx;
    ctx.save();
    for (const r of M.ROOTS) {
      const d = M.toPlane(r.dyn);
      const x1 = cx + d[0] * R;
      const y1 = cy - d[1] * R;
      ctx.strokeStyle = p.color('alg');
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x1, y1, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = p.color('alg');
      ctx.fill();
      p.tex(r.tex, [p.wx(cx + d[0] * (R + 12)), p.wy(cy - d[1] * (R + 11))], { key: 'leg' + r.id, small: true, color: 'alg', size: 10.5 });
    }
    ctx.restore();
    p.text('roots', [p.wx(cx), p.wy(cy + R + 18)], { color: 'muted', size: 10.5, align: 'center' });
  }

  // ------------------------------------------------------------ interaction
  const hitTest = (pos) => {
    let best = null;
    let bd = 18;
    for (const w of D.W) {
      const d = Math.hypot(p.sx(w.pt[0]) - pos.px, p.sy(w.pt[1]) - pos.py);
      if (d < bd) {
        bd = d;
        best = M.key(w.dyn);
      }
    }
    return best;
  };
  p.on('hover', (pos) => {
    const h = hitTest(pos);
    if (h !== hover) {
      hover = h;
      p.canvas.style.cursor = h ? 'pointer' : '';
      refreshState();
      p.invalidate();
    }
  });
  scope.listen(p.canvas, 'pointerleave', () => {
    if (hover) {
      hover = null;
      refreshState();
      p.invalidate();
    }
  });
  p.on('click', (pos) => {
    const h = hitTest(pos);
    if (!h) return;
    anim = null;
    S.sel = h;
    play.set(false);
    refreshState();
    p.invalidate();
  });

  // ------------------------------------------------------------ panel
  const secRep = pg.section('Multiplet $(p,q)$');
  const sp = ui.slider(secRep, { label: '$p$ (quark index)', min: 0, max: 6, step: 1, value: S.p, format: (x) => String(x), onInput: (x) => setPQ(x, S.q) });
  const sq = ui.slider(secRep, { label: '$q$ (antiquark index)', min: 0, max: 6, step: 1, value: S.q, format: (x) => String(x), onInput: (x) => setPQ(S.p, x) });
  ui.buttons(
    secRep,
    PRESETS.map(([a, c, lab]) => ({ label: lab, small: true, onClick: () => setPQ(a, c) })),
  );
  const kv = ui.keyValue(secRep, [
    ['Dimension', ''],
    ['Casimir $C_2$', ''],
    ['Triality $(p-q)\\bmod 3$', ''],
    ['Highest weight $(I_3,Y)$', ''],
    ['Distinct weights · max mult.', ''],
  ]);
  const dimOut = ui.readout(secRep, {});

  const secShow = pg.section('Show');
  const tNames = ui.toggle(secShow, { label: 'Particles (3, 3̄, 8, 10)', value: S.names, onChange: (x) => ((S.names = x), changed()) });
  const segOct = ui.segmented(secShow, {
    label: 'Octet',
    options: [
      { value: 'baryons', label: 'baryons $\\tfrac12^+$' },
      { value: 'mesons', label: 'mesons $0^-$' },
    ],
    value: S.octet,
    onChange: (x) => ((S.octet = x), changed()),
  });
  const tOmega = ui.toggle(secShow, { label: 'Hide $\\Omega^-$ (predict it)', value: S.hideOmega, onChange: (x) => ((S.hideOmega = x), changed()) });
  const tCharge = ui.toggle(secShow, { label: 'Charge lines $Q=I_3+\\tfrac{Y}{2}$', value: S.charge, onChange: (x) => ((S.charge = x), p.invalidate()) });
  const tShells = ui.toggle(secShow, { label: 'Inner shells', value: S.shells, onChange: (x) => ((S.shells = x), p.invalidate()) });
  const segStr = ui.segmented(secShow, {
    label: '$\\su(2)$ subalgebras',
    options: [
      { value: 'off', label: 'off' },
      { value: 'I', label: 'I-spin' },
      { value: 'U', label: 'U-spin' },
      { value: 'V', label: 'V-spin' },
    ],
    value: S.strings,
    onChange: (x) => ((S.strings = x), p.invalidate()),
  });
  const play = ui.playButton(secShow, {
    playing: S.playing,
    labels: ['▶ Ladder walk', '❚❚ Pause walk'],
    onToggle: (x) => {
      S.playing = x;
      anim = null;
      idle = 0;
      p.invalidate();
    },
  });

  const secSel = pg.section('Selected state');
  const selOut = ui.readout(secSel, {});
  const ladKV = ui.keyValue(
    secSel,
    M.ROOTS.map((r) => [`$E_{${r.tex}}$ <span class="tx-muted">$(${QUARK_RULE[r.id]})$</span>`, '']),
  );
  ui.legend(secSel, [
    { color: 'ink', label: 'state (weight); rings = multiplicity', dot: true },
    { color: 'hi', label: 'highest weight $\\Lambda$ / current state' },
    { color: 'alg', label: 'ladder operator $E_\\alpha$: shifts the weight by the root $\\alpha$' },
    { color: 'grp', label: 'Weyl orbit of $\\Lambda$ (outer shell)' },
  ]);

  const secTry = pg.section('Try this');
  ui.experiments(secTry, [
    {
      title: 'The octet’s double centre',
      text: 'Two baryons share $I_3=Y=0$: $\\Sigma^0$ (isospin 1) and $\\Lambda$ (isospin 0). Turn on I-spin lines: the middle row is $1\\oplus0$. Multiplicity 2 at the centre = rank: the adjoint always has as many zero weights as commuting charges.',
      apply: () => {
        Object.assign(S, { names: true, octet: 'baryons', strings: 'I', hideOmega: false });
        sync();
        setPQ(1, 1, '0,0');
        play.set(false);
      },
    },
    {
      title: 'Predict the $\\Omega^-$',
      text: 'In the decuplet each strange quark adds ≈150 MeV: 1232 → 1385 → 1530. Extrapolate one more step to an $sss$ state with $Q=-1$ at ≈1675 MeV, then untick “Hide $\\Omega^-$”. Found at Brookhaven in 1964 (today’s value 1672 MeV) — the triumph of the Eightfold Way.',
      apply: () => {
        Object.assign(S, { names: true, hideOmega: true, strings: 'off', charge: false });
        sync();
        setPQ(3, 0, M.key([3, 0]));
      },
    },
    {
      title: 'Charge runs along U-spin',
      text: 'With charge lines on, every line of constant $Q=I_3+Y/2$ is parallel to $U_\\pm$: $[Q,U_\\pm]=0$. So U-spin multiplets ($\\Delta^-,\\Sigma^{*-},\\Xi^{*-},\\Omega^-$) share their charge, and in the SU(3) limit their magnetic moments (Coleman–Glashow: $\\mu_{\\Sigma^+}=\\mu_p$).',
      apply: () => {
        Object.assign(S, { names: true, hideOmega: false, charge: true, strings: 'U' });
        sync();
        setPQ(3, 0);
      },
    },
    {
      title: '$\\Delta^{++}=uuu$ needs colour',
      text: '$\\Delta^{++}$ with $J_z=+\\tfrac32$ is $u{\\uparrow}u{\\uparrow}u{\\uparrow}$ in an s-wave: flavour, spin and space are all symmetric, yet quarks are fermions. A third, antisymmetric label is required: colour, in the singlet $\\epsilon_{ijk}q^iq^jq^k$ (see the next tab).',
      apply: () => {
        Object.assign(S, { names: true, hideOmega: false, charge: false, strings: 'off' });
        sync();
        setPQ(3, 0, M.key([3, 0]));
        play.set(false);
      },
    },
    {
      title: 'Shells of a big multiplet',
      text: 'For $(4,2)$ the multiplicity is 1 on the outer hexagon, 2 on the next, 3 on the triangle inside — and stays 3 from there on. In general it rises by one per hexagonal shell until the shell degenerates into a triangle, at $\\min(p,q)+1$.',
      apply: () => {
        Object.assign(S, { strings: 'off', charge: false, shells: true });
        sync();
        setPQ(4, 2);
      },
    },
    {
      title: 'Quarks versus antiquarks',
      text: 'The $\\mathbf 3$ is a triangle with its apex down ($s$ has $Y=-\\tfrac23$), the $\\overline{\\mathbf 3}$ points up. Their trialities are 1 and 2; mesons ($q\\bar q$) and baryons ($qqq$) have triality 0. Hover a quark: $E_{I_+}$ turns $d$ into $u$, $E_{V_+}$ turns $s$ into $u$.',
      apply: () => {
        Object.assign(S, { names: true, strings: 'off', charge: true });
        sync();
        setPQ(1, 0, M.key(M.QUARKS.d));
        play.set(false);
      },
    },
  ]);

  // ------------------------------------------------------------ notes
  notes(pg);

  // ------------------------------------------------------------ logic
  function setPQ(a, c, sel) {
    S.p = a;
    S.q = c;
    sp.set(a, { silent: true });
    sq.set(c, { silent: true });
    anim = null;
    hover = null;
    derive();
    S.sel = sel && D.map.has(sel) ? sel : M.key([S.p, S.q]);
    changed(false);
  }
  function sync() {
    tNames.set(S.names, { silent: true });
    segOct.set(S.octet, { silent: true });
    tOmega.set(S.hideOmega, { silent: true });
    tCharge.set(S.charge, { silent: true });
    tShells.set(S.shells, { silent: true });
    segStr.set(S.strings, { silent: true });
  }
  function changed(rederive = true) {
    if (rederive) {
      anim = null;
      derive();
    }
    const isOct = S.p === 1 && S.q === 1;
    segOct.el.style.display = isOct ? '' : 'none';
    tOmega.el.style.display = S.p === 3 && S.q === 0 ? '' : 'none';
    const mname = D.mult && S.names ? D.mult.title : `$${M.irrepTex(S.p, S.q)}$`;
    v.setTitle(`Weight diagram: ${mname} &nbsp;·&nbsp; $(I_3,\\,Y)$ plane`);
    const d = M.dim(S.p, S.q);
    kv.set('Dimension', `$${M.irrepTex(S.p, S.q)}$`);
    kv.set('Casimir $C_2$', `$${texFrac(M.casimir(S.p, S.q))}$`);
    kv.set('Triality $(p-q)\\bmod 3$', String(M.triality(S.p, S.q)));
    const [I3, Y] = M.toIY([S.p, S.q]);
    kv.set('Highest weight $(I_3,Y)$', `$(${texFrac(I3)},\\,${texFrac(Y)})$`);
    kv.set('Distinct weights · max mult.', `${D.W.length} · ${D.maxMult}`);
    dimOut.set(`\\dim=\\tfrac12(p{+}1)(q{+}1)(p{+}q{+}2)=\\tfrac12\\cdot${S.p + 1}\\cdot${S.q + 1}\\cdot${S.p + S.q + 2}=${d}`);
    fit();
    refreshState();
    p.invalidate();
  }

  function refreshState() {
    const fk = focusKey();
    const w = D.map.get(fk);
    if (!w) return;
    const [I3, Y] = w.iy;
    const Q = M.charge(w.dyn);
    const parts = showNames() ? D.byKey.get(fk) : null;
    const hiddenOm = isHiddenOmega(fk);
    let name = '';
    if (hiddenOm) name = '\\text{?}\\;(sss)';
    else if (parts) name = parts.map((P) => P.tex).join('/') + `\\;(${parts[0].q.includes('frac') ? '\\dots' : parts[0].q})`;
    const massTxt = parts && !hiddenOm && parts[0].m ? `,\\;\\; m=${parts.map((P) => fmt(P.m, 1)).join('/')}\\,\\mathrm{MeV}` : '';
    selOut.set(
      `${name ? name + ':\\;\\;' : ''}(I_3,Y)=(${texFrac(I3)},${texFrac(Y)}),\\;\\; Q=${texFrac(Q)},\\;\\; \\text{mult.}\\ ${w.mult}${massTxt}`,
    );
    for (const r of M.ROOTS) {
      const tgt = M.add(w.dyn, r.dyn);
      const T = D.map.get(M.key(tgt));
      let val = '$0$';
      if (T) {
        const tp = showNames() ? D.byKey.get(M.key(tgt)) : null;
        if (tp && !isHiddenOmega(M.key(tgt))) val = `$${tp.map((P) => P.tex).join('/')}$`;
        else if (isHiddenOmega(M.key(tgt))) val = '$?$';
        else val = `$(${texFrac(T.iy[0])},${texFrac(T.iy[1])})$`;
      }
      ladKV.set(`$E_{${r.tex}}$ <span class="tx-muted">$(${QUARK_RULE[r.id]})$</span>`, val);
    }
  }

  function startHop() {
    const w = D.map.get(S.sel);
    if (!w) return;
    const opts = M.ROOTS.filter((r) => D.map.has(M.key(M.add(w.dyn, r.dyn))) && !isHiddenOmega(M.key(M.add(w.dyn, r.dyn))));
    if (!opts.length) {
      idle = 0;
      return;
    }
    let cand = opts.filter((r) => !lastRoot || r.id !== lastRoot.pair);
    if (!cand.length) cand = opts;
    const r = cand[Math.floor(rng() * cand.length) % cand.length];
    anim = { from: S.sel, to: M.key(M.add(w.dyn, r.dyn)), root: r, t: 0 };
  }

  scope.frame((dt) => {
    if (!play.playing) return;
    if (anim) {
      anim.t += dt / 0.8;
      if (anim.t >= 1) {
        S.sel = anim.to;
        lastRoot = anim.root;
        anim = null;
        idle = 0;
        refreshState();
      }
      p.invalidate();
    } else {
      idle += dt;
      if (idle < 0.6) p.invalidate();
      if (idle > 1.35 && !hover) startHop();
    }
  });

  ready = true;
  changed(false);
}

function notes(pg) {
  pg.note(`<h2>What you see</h2>
  <p>Each dot is a state $\\ket{\\mu}$ of an SU(3) multiplet, placed at its eigenvalues under the two commuting generators:
  isospin $I_3=T_3$ and hypercharge $Y=\\tfrac{2}{\\sqrt3}T_8$. Rings count states with the same charges (the multiplicity).
  The vertical axis is drawn as $T_8=\\tfrac{\\sqrt3}{2}Y$, the metric in which all six roots have equal length, so the
  six-fold Weyl symmetry is visible as the symmetry of a regular hexagon.</p>
  <p>The orange arrows are the six <b>ladder operators</b>. Each one has definite charges — a <b>root</b> $\\alpha$ — so
  $[T_3,E_\\alpha]=\\alpha_3E_\\alpha$, $[T_8,E_\\alpha]=\\alpha_8E_\\alpha$, and acting on $\\ket{\\mu}$ it produces a state of weight $\\mu+\\alpha$
  or zero. The highest weight $\\Lambda$ is the state annihilated by all three raising operators $E_{I_+},E_{U_+},E_{V_+}$.</p>`);
  pg.note(`<h2>The physics</h2>
  <p><b>Flavour SU(3)</b> rotates $u,d,s$ into one another. It would be exact if the three light quarks had equal masses; in reality
  $m_s-m_{u,d}\\approx 90\\,$MeV (≈150 MeV for constituent quarks), so the multiplets are split row by row — one strange quark per row.
  The Gell-Mann–Okubo formula $M=a+bY+c\\,[I(I+1)-\\tfrac14Y^2]$ (first order in $m_s$) gives equal spacing in the decuplet
  and $2(m_N+m_\\Xi)=3m_\\Lambda+m_\\Sigma$ in the octet ($4514$ vs $4540\\,$MeV).</p>
  <div class="callout physics"><span class="callout-title">Prediction</span>In 1962 nine of the ten $J^P=\\tfrac32^+$ baryons were known.
  The pattern demanded a tenth at the bottom corner: $S=-3$, $Q=-1$, mass ≈ 1680 MeV, stable against strong decay. The $\\Omega^-$ turned
  up in a Brookhaven bubble chamber in 1964 (Barnes et al.; today’s value 1672.5 MeV), decaying weakly as predicted.</div>
  <p><b>Colour SU(3)</b> is the same group acting on a different index. It is exact and gauged (QCD): the gluons sit in the adjoint
  $\\mathbf 8$, and only colour singlets — $q\\bar q$ and $qqq$, triality zero — appear as free particles.</p>`);
  pg.note(`<h2>The mathematics</h2>
  <p>A maximal set of commuting Hermitian generators (the <b>Cartan subalgebra</b> $\\{T_3,T_8\\}$, rank 2) can be diagonalised simultaneously;
  its joint eigenvalues are the <b>weights</b>. The irreps are labelled by Dynkin indices $(p,q)$ with highest weight
  $\\Lambda=p\\,\\omega_1+q\\,\\omega_2$, $\\omega_1=(\\tfrac12,\\tfrac13)$, $\\omega_2=(0,\\tfrac23)$ in $(I_3,Y)$:
  $$\\dim(p,q)=\\tfrac12(p+1)(q+1)(p+q+2),\\qquad C_2=\\sum_a T_aT_a=\\tfrac13(p^2+q^2+pq)+p+q .$$
  Multiplicities follow from Freudenthal’s recursion (used here, exactly, in integers):
  $$\\big(|\\Lambda+\\rho|^2-|\\mu+\\rho|^2\\big)\\,m(\\mu)=2\\sum_{\\alpha>0}\\sum_{k\\ge1}m(\\mu+k\\alpha)\\,\\langle\\mu+k\\alpha,\\alpha\\rangle ,$$
  which reproduces the shell rule: 1 on the outer hexagon, one more per shell, saturating at $\\min(p,q)+1$ once the shells are triangles.</p>
  <div class="callout intuition"><span class="callout-title">Intuition</span>Rows are isospin multiplets, lines parallel to $U_\\pm$ are U-spin
  multiplets (equal charge), lines parallel to $V_\\pm$ are V-spin multiplets. Three overlapping copies of SU(2) — and the multiplet must
  be a consistent spin multiplet along every one of them. That rigidity is what fixes the hexagons.</div>`);
  pg.note(`<h2>Going further</h2>
  <ul>
  <li>The SU(2) story — ladders, Casimir $j(j+1)$, multiplets — is in <a href="#/reps">spin multiplets</a>; SU(3) is the same idea with two commuting charges.</li>
  <li>The six arrows of the root diagram, Weyl reflections (here: permutations of $u,d,s$) and the classification of all such patterns: <a href="#/roots">roots, weights &amp; classification</a>.</li>
  <li>Why the pion octet is so light: chiral symmetry $SU(3)_L\\times SU(3)_R\\to SU(3)_V$ is spontaneously broken and the octet are its pseudo-Goldstone bosons — see <a href="#/ssb">spontaneous symmetry breaking</a>.</li>
  <li>Charm extends flavour to SU(4) (badly broken); the weight diagrams become 3D polyhedra.</li>
  </ul>`);
}
