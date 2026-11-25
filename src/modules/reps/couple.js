// Tab "Adding angular momenta": the product basis |j1 m1⟩|j2 m2⟩ as a grid with diagonals
// M = m1 + m2, the coupled basis |J M⟩ as one row per multiplet (the trapezoid of state counts),
// the peeling of multiplets from the top, and the exact Clebsch–Gordan coefficients of |J M⟩.
// In "coupled state" mode both subsystems can be rotated by the same R_y(β): the product-basis
// picture changes, the coupled-basis picture stays inside one row J.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { TAU, clamp, mat } from '../../core/la.js';
import { fmt, fmtDeg } from '../../core/format.js';
import { inlineTex, texHTML } from '../../core/tex.js';
import { withAlpha } from '../../core/theme.js';
import { mValues, dimOf, multiplets, productBasis, hooks, countM, coupledVector, coupledAmplitudes, productRotationY, cgExact, casimir, validJM } from './math.js';
import { texHalf, textHalf, texSqrtRational, texM } from './texfmt.js';
import { phaseCSS } from './colour.js';
import { PIXEL_PLOT, px, roundRect, disc, text, seg } from './canvas.js';

const RATE = 5; // dots per second while peeling
const GAP = 1.4; // pause between multiplets (in dot units)
const HOLD = 6; // pause before the peeling restarts
const MAX2J = 7;

export function mountCouple(pg, scope, ctx) {
  const S = (ctx.state.couple ??= { tj1: 2, tj2: 2, mode: 'count', playing: true, peel: 0, J: 2, M: 0, beta: 0, spin: false });
  const dark = ctx.isDark;
  const col = (n) => ctx.colors[n];
  const kcol = (k) => col('c' + (1 + (k % 8)));
  const POS = phaseCSS(0, dark);
  const NEG = phaseCSS(Math.PI, dark);

  // ------------------------------------------------------------------ derived
  let j1 = 1;
  let j2 = 1;
  let Js = [];
  let H = [];
  let basis = null;
  let starts = [];
  let total = 0;
  let psi = null; // real product-basis amplitudes of the shown coupled state (after rotation)
  let amps = []; // [{J, M, k, a}] coupled-basis amplitudes of psi
  let seq = 0;
  const later = (ms, fn) => {
    const tok = seq;
    scope.timeout(() => tok === seq && fn(), ms);
  };

  function sanitize() {
    S.tj1 = clamp(Math.round(S.tj1) || 0, 0, MAX2J);
    S.tj2 = clamp(Math.round(S.tj2) || 0, 0, MAX2J);
    j1 = S.tj1 / 2;
    j2 = S.tj2 / 2;
    Js = multiplets(j1, j2);
    if (!Js.some((J) => Math.abs(J - S.J) < 1e-9)) S.J = Js[0];
    if (!validJM(S.J, S.M)) S.M = clamp(Math.round(S.M - (S.J % 1)) + (S.J % 1), -S.J, S.J);
    if (!validJM(S.J, S.M)) S.M = S.J;
    if (!Number.isFinite(S.beta)) S.beta = 0;
    if (!Number.isFinite(S.peel)) S.peel = 0;
    if (S.mode !== 'state') S.mode = 'count';
  }
  function rebuild() {
    sanitize();
    H = hooks(j1, j2);
    basis = productBasis(j1, j2);
    starts = [];
    let t = 0;
    for (const hk of H) {
      starts.push(t);
      t += hk.states.length + GAP;
    }
    total = t - GAP;
    S.peel = Math.min(S.peel, total + HOLD);
    computeState();
  }
  function computeState() {
    const v = Array.from(coupledVector(j1, j2, S.J, S.M));
    psi = Math.abs(S.beta) > 1e-12 ? mat.mulv(productRotationY(j1, j2, S.beta), v) : v;
    amps = coupledAmplitudes(j1, j2, psi);
  }
  const kOf = (J) => Js.findIndex((x) => Math.abs(x - J) < 1e-9);
  // peeling progress for hook k, position i (0 = top of the multiplet): lit / fresh fraction
  const litFrac = (k, i) => clamp(S.peel - (starts[k] + i), 0, 1);

  // ------------------------------------------------------------------ views
  const vG = pg.view({ title: 'Product basis $\\ket{j_1 m_1}\\ket{j_2 m_2}$', hint: 'click a dot: its $\\ket{J,M}$', height: 470 });
  const vK = pg.view({ title: 'Coupled basis $\\ket{J,M}$', hint: 'click a cell', height: 470 });
  const vT = pg.view({ title: 'Clebsch–Gordan coefficients $\\braket{j_1 m_1;\\,j_2 m_2}{J,M}$', span: true, height: 'auto' });
  vT.el.classList.add('reps-auto');
  const cgBox = ui.h('div', { class: 'reps-cg' });
  vT.body.appendChild(cgBox);

  // ------------------------------------------------------------------ product grid
  function gridLayout(W, Hh) {
    const d1 = dimOf(j1);
    const d2 = dimOf(j2);
    const padL = 58;
    const padR = 60;
    const padT = 78;
    const padB = 60;
    const s = Math.min(84, (W - padL - padR) / d1, (Hh - padT - padB) / d2);
    const x0 = padL + (W - padL - padR - s * d1) / 2;
    const y0 = padT + (Hh - padT - padB - s * d2) / 2;
    return { s, d1, d2, x0, y0, X: (m1) => x0 + (m1 + j1 + 0.5) * s, Y: (m2) => y0 + (j2 - m2 + 0.5) * s };
  }
  const pG = plot2d(vG.body, scope, {
    ...PIXEL_PLOT,
    draw(p) {
      if (!basis || !psi) return;
      const g = p.ctx;
      const L = gridLayout(p.width, p.height);
      const { s, d1, d2, x0, y0, X, Y } = L;
      const MUTED = col('muted');
      const INK2 = col('ink2');
      const GRID = col('grid');
      const state = S.mode === 'state';
      const r0 = clamp(s * 0.2, 3.5, 10);
      // which hook dot is being added right now
      let fresh = null;
      if (!state)
        H.forEach((hk, k) =>
          hk.states.forEach((st, i) => {
            const f = litFrac(k, i);
            if (f > 0 && f < 1) fresh = { k, st, f };
          }),
        );
      // diagonals M = const
      for (let M = -(j1 + j2); M <= j1 + j2 + 1e-9; M += 1) {
        const a = Math.max(-j1, M - j2);
        const b = Math.min(j1, M + j2);
        const e = 0.36 * s;
        const xa = X(a) - e;
        const ya = Y(M - a) - e;
        const xb = X(b) + e;
        const yb = Y(M - b) + e;
        const isFresh = fresh && Math.abs(fresh.st.M - M) < 1e-9;
        const isSel = state && Math.abs(S.M - M) < 1e-9;
        seg(g, xa, ya, xb, yb, { color: isFresh ? kcol(fresh.k) : isSel ? col('hi') : GRID, width: isFresh || isSel ? 2 : 1.2, alpha: isFresh ? 0.75 : isSel ? 0.55 : 1 });
        text(g, M > 0 ? '+' + textHalf(M) : textHalf(M), X(b) + 0.5 * s + 3, Y(M - b) + 0.5 * s + 3, { color: isSel ? col('hi') : MUTED, size: 10.5, align: 'left', baseline: 'top' });
      }
      // axes ticks
      for (const m1 of mValues(j1)) text(g, m1 > 0 ? '+' + textHalf(m1) : textHalf(m1), X(m1), y0 - 12, { color: INK2, size: 11, align: 'center' });
      for (const m2 of mValues(j2)) text(g, m2 > 0 ? '+' + textHalf(m2) : textHalf(m2), x0 - 10, Y(m2), { color: INK2, size: 11, align: 'right' });
      p.tex('m_1\\,\\rightarrow', px(p, x0 + s * d1 + 8, y0 - 12), { key: 'ax1', align: 'left', small: true });
      p.tex('m_2', px(p, x0 - 10, y0 + s * d2 + 12), { key: 'ax2', align: 'right', small: true });
      p.tex('\\text{diagonals: }M=m_1+m_2', px(p, x0 + (s * d1) / 2, y0 + s * d2 + 38), { key: 'axM', small: true, color: 'muted' });

      // dots
      if (!state) {
        H.forEach((hk, k) =>
          hk.states.forEach((st, i) => {
            const x = X(st.m1);
            const y = Y(st.m2);
            const f = litFrac(k, i);
            if (f <= 0) disc(g, x, y, r0 * 0.8, col('surface2'), { stroke: MUTED, width: 1 });
            else {
              if (f < 1) disc(g, x, y, r0 + 8 * (1 - f), withAlpha(kcol(k), 0.25 * (1 - f)));
              disc(g, x, y, r0, kcol(k), { stroke: col('surface'), width: 1.5 });
            }
          }),
        );
      } else {
        const showLabels = S.beta === 0 && s >= 46;
        let labelled = 0;
        basis.list.forEach((st) => {
          const x = X(st.m1);
          const y = Y(st.m2);
          disc(g, x, y, 2, MUTED);
          const a = psi[st.idx];
          if (Math.abs(a) < 1e-9) return;
          const r = 0.44 * s * Math.abs(a);
          disc(g, x, y, r, withAlpha(a > 0 ? POS : NEG, 0.92), { stroke: col('surface'), width: 1 });
          if (showLabels) {
            const e = cgExact(j1, st.m1, j2, st.m2, S.J, S.M);
            p.tex(texSqrtRational(e), px(p, x + r + 3, y - r - 3), { key: `cg${labelled++}`, align: 'left', valign: 'bottom', small: true });
          }
        });
      }
      void d2;
    },
  });
  pG.on('click', (pos) => {
    const { s, X, Y } = gridLayout(pG.width, pG.height);
    let best = null;
    for (const st of basis.list) {
      const d = Math.hypot(pos.px - X(st.m1), pos.py - Y(st.m2));
      if (d < s * 0.5 && (!best || d < best.d)) best = { st, d };
    }
    if (!best) return;
    seq++;
    selectState(Js[best.st.hook], best.st.M);
  });

  // ------------------------------------------------------------------ coupled basis (multiplet rows)
  function cakeLayout(W, Hh) {
    const Jmax = j1 + j2;
    const K = Js.length;
    const ncol = Math.round(2 * Jmax) + 1;
    const padL = 74;
    const padR = 58;
    const padT = 96;
    const padB = 66;
    const cw = Math.min(46, (W - padL - padR) / ncol);
    const rh = Math.min(40, (Hh - padT - padB) / K);
    const x0 = padL + (W - padL - padR - cw * ncol) / 2;
    const yb = padT + (Hh - padT - padB + rh * K) / 2;
    return { cw, rh, x0, yb, K, Jmax, X: (M) => x0 + (M + Jmax) * cw, Yrow: (k) => yb - (k + 1) * rh };
  }
  const pK = plot2d(vK.body, scope, {
    ...PIXEL_PLOT,
    draw(p) {
      if (!basis || !psi) return;
      const g = p.ctx;
      const L = cakeLayout(p.width, p.height);
      const { cw, rh, yb, X, Yrow, Jmax } = L;
      const MUTED = col('muted');
      const INK2 = col('ink2');
      const state = S.mode === 'state';
      p.tex('\\text{column height }n(M)=\\#\\{\\text{dots on diagonal }M\\}', px(p, p.width / 2, 58), { key: 'cap', small: true, color: 'muted' });
      // columns: counts n(M) and M ticks
      for (let M = -Jmax; M <= Jmax + 1e-9; M += 1) {
        const n = countM(j1, j2, M);
        text(g, String(n), X(M) + cw / 2, yb + 31, { color: INK2, size: 11, align: 'center' });
        text(g, M > 0 ? '+' + textHalf(M) : textHalf(M), X(M) + cw / 2, yb + 13, { color: MUTED, size: 10.5, align: 'center' });
      }
      p.tex('M', px(p, X(Jmax) + cw + 8, yb + 13), { key: 'axM', small: true, color: 'muted', align: 'left' });
      p.tex('n(M)', px(p, X(Jmax) + cw + 8, yb + 31), { key: 'axN', small: true, color: 'muted', align: 'left' });
      // rows
      Js.forEach((J, k) => {
        const y = Yrow(k);
        p.tex(`J=${texHalf(J)}`, px(p, X(-J) - 8, y + rh / 2), { key: `rl${k}`, align: 'right', small: true, color: kcol(k) });
        text(g, `(${Math.round(2 * J + 1)})`, X(J) + cw + 6, y + rh / 2, { color: MUTED, size: 10.5, align: 'left' });
        for (const M of mValues(J)) {
          const x = X(M);
          const i = Math.round(J - M);
          const inset = 1.5;
          if (!state) {
            const f = litFrac(k, i);
            g.save();
            roundRect(g, x + inset, y + inset, cw - 2 * inset, rh - 2 * inset, 4);
            if (f > 0) {
              g.globalAlpha = 0.25 + 0.75 * f;
              g.fillStyle = kcol(k);
              g.fill();
            } else {
              g.setLineDash([3, 3]);
              g.strokeStyle = MUTED;
              g.globalAlpha = 0.6;
              g.lineWidth = 1;
              g.stroke();
            }
            g.restore();
          } else {
            const a = amps.find((q) => q.k === k && Math.abs(q.M - M) < 1e-9);
            const pr = a ? a.a * a.a : 0;
            g.save();
            roundRect(g, x + inset, y + inset, cw - 2 * inset, rh - 2 * inset, 4);
            g.globalAlpha = 0.16;
            g.fillStyle = kcol(k);
            g.fill();
            g.restore();
            if (pr > 1e-6) {
              const side = (Math.min(cw, rh) - 6) * Math.sqrt(pr);
              g.save();
              roundRect(g, x + cw / 2 - side / 2, y + rh / 2 - side / 2, side, side, 3);
              g.fillStyle = kcol(k);
              g.fill();
              g.restore();
            }
            if (Math.abs(J - S.J) < 1e-9 && Math.abs(M - S.M) < 1e-9) {
              g.save();
              roundRect(g, x + 0.5, y + 0.5, cw - 1, rh - 1, 5);
              g.strokeStyle = col('hi');
              g.lineWidth = 2.2;
              g.stroke();
              g.restore();
            }
          }
        }
      });
    },
  });
  pK.on('click', (pos) => {
    const { cw, rh, X, Yrow } = cakeLayout(pK.width, pK.height);
    for (let k = 0; k < Js.length; k++) {
      const y = Yrow(k);
      if (pos.py < y || pos.py > y + rh) continue;
      for (const M of mValues(Js[k])) {
        if (pos.px >= X(M) && pos.px <= X(M) + cw) {
          seq++;
          selectState(Js[k], M);
          return;
        }
      }
    }
  });

  // ------------------------------------------------------------------ Clebsch–Gordan table
  const ketProd = (m1, m2) => `\\ket{${texM(j1, m1)},${texM(j2, m2)}}`;
  function expansionTex(J, M) {
    const terms = [];
    for (const m1 of mValues(j1)) {
      const m2 = M - m1;
      if (!validJM(j2, m2)) continue;
      const e = cgExact(j1, m1, j2, m2, J, M);
      if (!e.sign) continue;
      const mag = texSqrtRational({ ...e, sign: 1 });
      const coef = mag === '1' ? '' : mag;
      terms.push({ sign: e.sign, tex: `${coef}${ketProd(m1, m2)}` });
    }
    return terms.map((t, i) => (i === 0 ? (t.sign < 0 ? '-' : '') : t.sign < 0 ? '-' : '+') + t.tex).join('');
  }
  function renderTable() {
    const J = S.J;
    const k = kOf(J);
    const swatch = `<span class="sign-sw" style="background:${kcol(k)}"></span>`;
    const rows = mValues(J)
      .map((M) => {
        const sel = S.mode === 'state' && Math.abs(M - S.M) < 1e-9;
        return `<tr class="${sel ? 'sel' : ''}"><td class="lhs">${texHTML(`\\ket{${texHalf(J)},${texHalf(M)}}`)}</td><td class="eq">=</td><td>${texHTML(expansionTex(J, M))}</td></tr>`;
      })
      .join('');
    const sym = j1 === j2 ? ` Exchange symmetry of this multiplet: ${Math.round(2 * j1 - J) % 2 ? 'antisymmetric' : 'symmetric'}, $(-1)^{2j-J}$.` : '';
    cgBox.innerHTML = `<div class="reps-cg-head">${swatch}${inlineTex(
      `$J=${texHalf(J)}$ in $${texHalf(j1)}\\otimes${texHalf(j2)}$: each row is one state of the multiplet; only $m_1+m_2=M$ appears (Condon–Shortley phases, exact values).${sym}`,
    )}</div><table><tbody>${rows}</tbody></table>`;
  }

  // ------------------------------------------------------------------ panel
  const secJ = pg.section('Two angular momenta');
  const fmtJ = (v) => `$${texHalf(v / 2)}$`;
  const s1 = ui.slider(secJ, { label: 'First, $j_1$', min: 0, max: MAX2J, step: 1, value: S.tj1, format: fmtJ, onInput: (v) => (seq++, setJs(v, S.tj2)) });
  const s2 = ui.slider(secJ, { label: 'Second, $j_2$', min: 0, max: MAX2J, step: 1, value: S.tj2, format: fmtJ, onInput: (v) => (seq++, setJs(S.tj1, v)) });
  const rDec = ui.readout(secJ, {});

  const secV = pg.section('Show');
  const segMode = ui.segmented(secV, {
    options: [
      { value: 'count', label: 'Count multiplets' },
      { value: 'state', label: 'Coupled state $\\ket{J,M}$' },
    ],
    value: S.mode,
    onChange: (v) => (seq++, setMode(v)),
  });

  const secC = pg.section('Counting: peel from the top');
  const rowC = ui.h('div', { class: 'btn-row' });
  secC.appendChild(rowC);
  const play = ui.playButton(rowC, {
    playing: S.playing,
    onToggle: (v) => {
      S.playing = v;
      if (v) {
        if (S.mode !== 'count') setMode('count');
        if (S.peel >= total + HOLD - 1e-9) S.peel = 0;
      }
    },
  });
  ui.button(rowC, { label: 'Next multiplet', onClick: () => (seq++, stepPeel()) });
  ui.button(rowC, { label: 'Restart', onClick: () => (seq++, restartPeel()) });
  const peelMsg = ui.h('div', { class: 'reps-msg' });
  secC.appendChild(peelMsg);

  const secS = pg.section('Coupled state');
  const jBox = ui.h('div');
  secS.appendChild(jBox);
  let segJ = null;
  const sM = ui.slider(secS, { label: 'Projection $M$', min: -S.J, max: S.J, step: 1, value: S.M, format: (v) => `$${texHalf(v)}$`, onInput: (v) => (seq++, selectState(S.J, v)) });
  const sBeta = ui.slider(secS, {
    label: 'Rotate both by $R_y(\\beta)$',
    min: 0,
    max: 2 * TAU,
    step: 0.002,
    value: S.beta,
    format: (v) => fmtDeg(v, 0),
    onInput: (v) => {
      seq++;
      if (S.spin) spinT.set(false);
      S.beta = v;
      if (S.mode !== 'state') setMode('state');
      computeState();
      refresh();
    },
  });
  const spinT = ui.toggle(secS, {
    label: 'Keep rotating',
    value: S.spin,
    onChange: (v) => {
      S.spin = v;
      if (v && S.mode !== 'state') setMode('state');
    },
  });
  const rState = ui.readout(secS, {});
  const kv = ui.keyValue(secS, [
    ['$\\vec J^{\\,2}=J(J+1)$', ''],
    ['Return probability $|\\bra{J,M}U\\ket{J,M}|^2$', ''],
    ['Weight left in multiplet $J$', ''],
  ]);
  const legendBox = ui.h('div');
  secS.appendChild(legendBox);
  function rebuildJControls() {
    jBox.innerHTML = '';
    segJ = ui.segmented(jBox, {
      label: 'Multiplet $J$',
      options: Js.map((J, k) => ({ value: J, label: `<span style="color:${kcol(k)}">●</span> $${texHalf(J)}$` })),
      value: S.J,
      onChange: (J) => (seq++, selectState(J, S.M)),
    });
    legendBox.innerHTML = '';
    ui.legend(legendBox, [
      { color: POS, label: 'amplitude $>0$', dot: true },
      { color: NEG, label: 'amplitude $<0$', dot: true },
      { color: 'hi', label: 'selected $\\ket{J,M}$' },
    ]);
  }

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Two spin-½: singlet and triplet',
      text: '$\\tfrac12\\otimes\\tfrac12=1\\oplus0$. The singlet $(\\ket{\\uparrow\\downarrow}-\\ket{\\downarrow\\uparrow})/\\sqrt2$ is turned by $R_y(\\beta)$ and nothing happens: $J=0$ is rotation invariant — and maximally entangled (para-helium, the EPR/Bell pair).',
      apply: () => {
        seq++;
        S.beta = 0;
        setJs(1, 1);
        selectState(0, 0);
        spinT.set(true);
      },
    },
    {
      title: 'The triplet does move — within $J=1$',
      text: '$\\ket{1,0}=(\\ket{\\uparrow\\downarrow}+\\ket{\\downarrow\\uparrow})/\\sqrt2$ spreads onto $\\ket{\\uparrow\\uparrow}$ and $\\ket{\\downarrow\\downarrow}$ as $\\beta$ grows, but on the right all weight stays in the $J=1$ row: $D^{1/2}\\otimes D^{1/2}=D^{1}\\oplus D^{0}$ never mixes multiplets.',
      apply: () => {
        seq++;
        S.beta = 0;
        setJs(1, 1);
        selectState(1, 0);
        spinT.set(true);
      },
    },
    {
      title: 'Spin–orbit: $1\\otimes\\tfrac12=\\tfrac32\\oplus\\tfrac12$',
      text: 'A $p$ electron: six states peel into $j=\\tfrac32$ (four) and $j=\\tfrac12$ (two) — the $2p_{3/2}$ and $2p_{1/2}$ levels behind the sodium D lines. $\\vec L\\cdot\\vec S=\\tfrac12[J(J+1)-2-\\tfrac34]$ is $+\\tfrac12$ and $-1$ on them.',
      apply: () => {
        seq++;
        setJs(2, 1);
        restartPeel();
      },
    },
    {
      title: 'Two vectors: $1\\otimes1=2\\oplus1\\oplus0$',
      text: '$T_{ij}=u_iv_j$ splits into the scalar $\\vec u\\cdot\\vec v$ ($J=0$), the vector $\\vec u\\times\\vec v$ ($J=1$) and a symmetric traceless quadrupole ($J=2$): $9=1+3+5$. Two $p$ electrons give carbon’s ${}^1S$, ${}^3P$, ${}^1D$ terms.',
      apply: () => {
        seq++;
        setJs(2, 2);
        restartPeel();
      },
    },
    {
      title: 'Each multiplet starts at a top state',
      text: '$\\ket{J_{\\max},J_{\\max}}=\\ket{j_1j_1}\\ket{j_2j_2}$ is a single product state. The next multiplet starts on the next diagonal, in the combination orthogonal to $J_-\\ket{J_{\\max},J_{\\max}}$ — note the relative minus sign.',
      apply: () => {
        seq++;
        S.beta = 0;
        spinT.set(false);
        setJs(4, 3);
        selectState(3.5, 3.5);
        later(2600, () => selectState(2.5, 2.5));
      },
    },
    {
      title: 'Count a big one: $\\tfrac72\\otimes\\tfrac32$',
      text: '$8\\times4=32=10+8+6+4$. The number of multiplets is the length of the longest diagonal, $2\\min(j_1,j_2)+1=4$ — the flat top of the trapezoid of $n(M)$.',
      apply: () => {
        seq++;
        setJs(7, 3);
        restartPeel();
      },
    },
  ]);

  // ------------------------------------------------------------------ actions
  function setJs(t1, t2) {
    S.tj1 = t1;
    S.tj2 = t2;
    const keepPeel = false;
    if (!keepPeel) S.peel = 0;
    rebuild();
    s1.set(S.tj1, { silent: true });
    s2.set(S.tj2, { silent: true });
    rebuildJControls();
    syncStateSliders();
    refresh();
  }
  function setMode(m) {
    S.mode = m === 'state' ? 'state' : 'count';
    segMode.set(S.mode, { silent: true });
    if (S.mode === 'state' && S.playing) play.set(false);
    if (S.mode === 'count' && S.spin) spinT.set(false);
    refresh();
  }
  function selectState(J, M) {
    S.J = J;
    S.M = M;
    sanitize();
    if (S.mode !== 'state') setMode('state');
    computeState();
    syncStateSliders();
    refresh();
  }
  function syncStateSliders() {
    if (segJ) segJ.set(S.J, { silent: true });
    sM.setRange(-S.J, S.J, 1);
    sM.set(S.M, { silent: true });
    sM.disable(S.J === 0);
    sBeta.set(S.beta, { silent: true });
  }
  function restartPeel() {
    setMode('count');
    S.peel = 0;
    if (!S.playing) play.set(true);
    refresh();
  }
  function stepPeel() {
    setMode('count');
    if (S.playing) play.set(false);
    const k = starts.findIndex((st, i) => S.peel < st + H[i].states.length - 1e-9);
    if (k < 0) S.peel = 0;
    else S.peel = starts[k] + H[k].states.length;
    refresh();
  }

  let tableKey = '';
  function refresh() {
    // decomposition
    const lhs = `${texHalf(j1)}\\otimes${texHalf(j2)}`;
    const rhs = Js.slice()
      .reverse()
      .map((J) => `\\col{c${1 + kOf(J)}}{${texHalf(J)}}`)
      .join('\\oplus');
    const dims = Js.slice()
      .reverse()
      .map((J) => String(Math.round(2 * J + 1)))
      .join('+');
    rDec.set(`\\begin{gathered}${lhs}=${rhs}\\\\[2pt] ${dimOf(j1)}\\times${dimOf(j2)}=${dims}=${dimOf(j1) * dimOf(j2)}\\end{gathered}`);
    // coupled state readouts
    rState.set(`\\ket{${texHalf(S.J)},${texHalf(S.M)}}=${expansionTex(S.J, S.M)}`);
    kv.set('$\\vec J^{\\,2}=J(J+1)$', fmt(casimir(S.J), 2).replace(/\.00$/, ''));
    const v0 = coupledVector(j1, j2, S.J, S.M);
    let ov = 0;
    for (let i = 0; i < v0.length; i++) ov += v0[i] * psi[i];
    kv.set('Return probability $|\\bra{J,M}U\\ket{J,M}|^2$', fmt(ov * ov, 3));
    const inJ = amps.filter((q) => Math.abs(q.J - S.J) < 1e-9).reduce((s, q) => s + q.a * q.a, 0);
    kv.set('Weight left in multiplet $J$', fmt(inJ, 6));
    // peel message
    const done = H.filter((hk, k) => S.peel >= starts[k] + hk.states.length - 1e-9);
    peelMsg.innerHTML = inlineTex(
      done.length === 0
        ? 'Start: the top diagonal holds one state, so it must be $\\ket{J_{\\max},J_{\\max}}$.'
        : done.length < H.length
          ? `Peeled $J=${done.map((hk) => texHalf(hk.J)).join(',\\,')}$ — the leftover top state starts the next multiplet.`
          : `All ${dimOf(j1) * dimOf(j2)} states used: $${dimOf(j1) * dimOf(j2)}=${dims}$.`,
    );
    // table (only when its content changes)
    const key = `${S.tj1},${S.tj2},${S.J},${S.mode === 'state' ? S.M : 'x'}`;
    if (key !== tableKey) {
      tableKey = key;
      renderTable();
    }
    pG.invalidate();
    pK.invalidate();
  }

  let lastStep = -1;
  scope.frame((dt) => {
    if (S.mode === 'count' && S.playing) {
      S.peel += RATE * dt;
      if (S.peel > total + HOLD) S.peel = 0;
      const step = Math.floor(S.peel);
      if (step !== lastStep) {
        lastStep = step;
        refresh();
      }
      pG.invalidate();
      pK.invalidate();
    }
    if (S.mode === 'state' && S.spin) {
      S.beta = (S.beta + 0.7 * dt) % (2 * TAU);
      sBeta.set(S.beta, { silent: true });
      computeState();
      refreshThrottled(dt);
      pG.invalidate();
      pK.invalidate();
    }
  });
  let rClock = 0;
  function refreshThrottled(dt) {
    rClock += dt;
    if (rClock > 0.15) {
      rClock = 0;
      refresh();
    }
  }

  rebuild();
  rebuildJControls();
  syncStateSliders();
  refresh();

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left: the $(2j_1+1)(2j_2+1)$ product states $\\ket{j_1m_1}\\ket{j_2m_2}$. The total $J_z=J_z^{(1)}+J_z^{(2)}$ is diagonal in this basis, so every dot
    has a definite $M=m_1+m_2$; the diagonals collect equal $M$. Right: the coupled basis $\\ket{J,M}$, one row per multiplet, and the height of column $M$ is
    the number $n(M)$ of dots on that diagonal.</p>
    <p><strong>Counting.</strong> The top diagonal holds one state, so it must be $\\ket{J_{\\max},J_{\\max}}$ with $J_{\\max}=j_1+j_2$, and that multiplet uses
    one state on every diagonal down to $M=-J_{\\max}$. One state is left on the next diagonal: it starts $J_{\\max}-1$. Repeat until the diagonals are used up;
    the number of multiplets is the length of the longest diagonal, $2\\min(j_1,j_2)+1$.</p>
    <div class="callout warning"><span class="callout-title">Counting is not identification</span>The coloured hooks only count. An actual $\\ket{J,M}$ is a
    superposition of all dots on its diagonal — click a dot or a cell to see it (disc area $\\propto$ probability, blue/amber $=$ sign).</div>`);
  pg.note(`<h2>The physics: good quantum numbers of a composite system</h2>
    <p>Rotating a composite system rotates both parts, $U(R)=U_1(R)\\otimes U_2(R)=e^{-i\\theta\\,\\hat n\\cdot(\\vec J_1+\\vec J_2)}$, so its generator is the total
    $\\vec J=\\vec J_1+\\vec J_2$. When the parts interact through a scalar, $[H,\\vec J]=0$ while $[H,\\vec J_1]\\neq0$: energy eigenstates carry $J,M$, not $m_1,m_2$.</p>
    <ul>
      <li><strong>Fine structure.</strong> $H_{so}=\\xi\\,\\vec L\\cdot\\vec S=\\tfrac\\xi2\\big[\\vec J^{\\,2}-\\vec L^2-\\vec S^2\\big]$ is diagonal in the coupled basis;
      for $\\ell=1$, $s=\\tfrac12$ it is $+\\tfrac\\xi2$ on $j=\\tfrac32$ and $-\\xi$ on $j=\\tfrac12$ (Landé interval rule).</li>
      <li><strong>Exchange and entanglement.</strong> For two spin-½ the singlet is antisymmetric and the triplet symmetric under exchange; with the Pauli
      principle this ties spin to spatial symmetry (para- and ortho-helium) and drives the exchange interaction behind magnetism. The singlet is invariant under
      every joint rotation, so the spins are anticorrelated along <em>any</em> axis — the EPR/Bell state.</li>
    </ul>`);
  pg.note(`<h2>The mathematics: the Clebsch–Gordan series</h2>
    <p>A tensor product of irreducible representations is reducible,
    $D^{(j_1)}\\otimes D^{(j_2)}\\cong\\bigoplus_{J=|j_1-j_2|}^{j_1+j_2}D^{(J)}$. Characters make this a one-line check:
    $\\chi_j(\\theta)=\\frac{\\sin((2j+1)\\theta/2)}{\\sin(\\theta/2)}$ and $\\chi_{j_1}\\chi_{j_2}=\\sum_J\\chi_J$. The Clebsch–Gordan coefficients are the
    matrix of the unitary change of basis, non-zero only for $M=m_1+m_2$; here they come from Racah's formula in exact rational arithmetic,</p>
    $$\\begin{aligned}\\braket{j_1m_1;j_2m_2}{J,M}=\\;&\\sqrt{\\tfrac{(2J+1)(J+j_1-j_2)!\\,(J-j_1+j_2)!\\,(j_1+j_2-J)!}{(j_1+j_2+J+1)!}\\,(J+M)!\\,(J-M)!\\,\\textstyle\\prod_{i}(j_i-m_i)!\\,(j_i+m_i)!}\\\\
    &\\times\\sum_k\\frac{(-1)^k}{k!\\,(j_1+j_2-J-k)!\\,(j_1-m_1-k)!\\,(j_2+m_2-k)!\\,(J-j_2+m_1+k)!\\,(J-j_1-m_2+k)!}.\\end{aligned}$$
    <p>With the Condon–Shortley convention ($\\braket{j_1j_1;j_2\\,J{-}j_1}{J,J}>0$) all coefficients are real, and
    $\\braket{j_2m_2;j_1m_1}{J,M}=(-1)^{j_1+j_2-J}\\braket{j_1m_1;j_2m_2}{J,M}$: for two equal spins the top multiplet is symmetric and the multiplets
    alternate. The tests check orthonormality, that each $\\ket{J,M}$ is an eigenvector of $(\\vec J_1+\\vec J_2)^2$, and $D\\otimes D\\ket{J,M}=\\sum_{M'}D^{(J)}_{M'M}\\ket{J,M'}$.</p>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><strong>Wigner–Eckart theorem.</strong> Operators come in multiplets too: a rank-$k$ tensor operator $T^{(k)}_q$ transforms like $\\ket{k,q}$, and
      $\\bra{j'm'}T^{(k)}_q\\ket{jm}=\\braket{jm;kq}{j'm'}\\,\\langle j'\\|T^{(k)}\\|j\\rangle/\\sqrt{2j'+1}$. All the $m$-dependence is one Clebsch–Gordan coefficient,
      so selection rules ($|j-k|\\le j'\\le j+k$, $m'=m+q$) and intensity ratios follow from this table; dipole transitions have $k=1$.</li>
      <li><strong>Isospin.</strong> The same algebra acts on (p, n): two nucleons give $I=1\\oplus0$, and the deuteron is the isosinglet.</li>
      <li><strong>SU(3).</strong> $3\\otimes\\bar 3=8\\oplus1$ (mesons) and $3\\otimes3\\otimes3=10\\oplus8\\oplus8\\oplus1$ (baryons): <a href="#/su3">quarks &amp; the Eightfold Way</a>.
      Spinors and the sign under $2\\pi$: <a href="#/su2">SU(2)</a>; hydrogen's $n^2$: <a href="#/kepler">Kepler</a>.</li>
    </ul>`);
}
