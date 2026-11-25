// Tab "The ladder": weight diagram of the spin-j multiplet with J± arcs and their matrix elements,
// the semiclassical vector model (cones of length √(j(j+1)) with projection m), and the exact
// matrices J_z, J±, J_x, J_y in the basis m = j … −j.

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d } from '../../core/three-kit.js';
import { TAU, clamp, easeInOut, lerp } from '../../core/la.js';
import { fmt, fmtDeg, texFrac } from '../../core/format.js';
import { texHTML, inlineTex } from '../../core/tex.js';
import { withAlpha } from '../../core/theme.js';
import { mValues, dimOf, casimir, ladderN, vectorModel, casimirCheck } from './math.js';
import { texHalf, textHalf, texSurd, texSpinMatrix } from './texfmt.js';
import { PIXEL_PLOT, px, qArrow, qPoint, disc, text, seg } from './canvas.js';

const R0 = 1.12; // radius of the |J| = √(j(j+1)) sphere in scene units
const CAM = [5.2, 3.5, 2.3]; // default camera (portrait view: far enough for the m labels)
const MAXN = 9;
const J_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) => ({ value: t, label: t % 2 ? `$\\tfrac{${t}}{2}$` : String(t / 2) }));

export function mountLadder(pg, scope, ctx) {
  const S = (ctx.state.ladder ??= { twoJ: 4, m: 1, playing: true });
  const col = (name) => ctx.colors[name];
  const jOf = () => S.twoJ / 2;
  const sanitize = () => {
    S.twoJ = clamp(Math.round(S.twoJ) || 0, 0, 8);
    const j = jOf();
    const k = clamp(Math.round(j - (Number.isFinite(S.m) ? S.m : j)), 0, Math.round(2 * j));
    S.m = j - k;
  };
  sanitize();

  let anim = null; // { dir, from, to (null → annihilated), t, dur }
  let flash = null; // { t, dur, top }
  let phi = 0.9; // precession phase of the vector-model arrow
  let seq = 0; // experiment sequence token
  const later = (ms, fn) => {
    const tok = seq;
    scope.timeout(() => tok === seq && fn(), ms);
  };

  // ------------------------------------------------------------------ views
  const vL = pg.view({ title: 'Weight diagram of $D^{(j)}$', hint: 'click a rung to select it', height: 500 });
  const v3 = pg.view({ title: 'Vector model', hint: 'drag to orbit · scroll to zoom', height: 500 });
  const vM = pg.view({ title: 'The generators as matrices in the basis $\\ket{j,m}$, $m=j,\\dots,-j$', span: true, height: 'auto' });
  vM.el.classList.add('reps-auto');
  const matBox = ui.h('div', { class: 'reps-mats' });
  vM.body.appendChild(matBox);

  // ------------------------------------------------------------------ ladder canvas
  function layout(W, H) {
    const j = jOf();
    const n = dimOf(j);
    const top = 96;
    const bot = H - 66;
    const end = 34; // extreme rung → "0" mark
    const step = n > 1 ? Math.min(62, (bot - top - 2 * end) / (n - 1)) : 0;
    const yc = (top + bot) / 2;
    const xc = Math.round(W * 0.5);
    const half = clamp(W * 0.09, 22, 42);
    const bul = clamp(step * 0.6 + 8, 18, 36);
    return { j, n, step, yc, xc, half, bul, end, Y: (m) => yc - m * step, xR: xc + half + 5, xL: xc - half - 5 };
  }
  const elemWidth = (N, Nmax) => 1.1 + (3.4 * Math.sqrt(N)) / Math.sqrt(Math.max(Nmax, 1));

  const p = plot2d(vL.body, scope, {
    ...PIXEL_PLOT,
    draw(p) {
      const g = p.ctx;
      const W = p.width;
      const H = p.height;
      const L = layout(W, H);
      const { j, step, Y, xc, half, bul, end, xR, xL } = L;
      const ms = mValues(j);
      const Nmax = Math.max(1, ...ms.map((m) => ladderN(j, m)));
      const ALG = col('alg');
      const HI = col('hi');
      const INK2 = col('ink2');
      const MUTED = col('muted');
      const active = anim ? { dir: anim.dir, from: anim.from, s: easeInOut(clamp(anim.t / anim.dur, 0, 1)), dead: anim.to === null } : null;

      // header & footer
      p.tex(`\\vec J^{\\,2}=${texFrac(casimir(j))}\\ \\text{on every rung}`, px(p, xc, H - 42), { key: 'foot', small: true });
      p.tex('m', px(p, xL - bul / 2 - 70, Y(j) - end), { key: 'mhead', small: true, color: 'muted' });

      // J+ arcs (right) and J− arcs (left) between neighbouring rungs
      for (const m of ms) {
        if (m < j) {
          const N = ladderN(j, m);
          const y0 = Y(m) - 1;
          const y1 = Y(m + 1) + 1;
          const on = active && !active.dead && active.dir > 0 && Math.abs(active.from - m) < 1e-9;
          qArrow(g, xR, y0, xR + bul, (y0 + y1) / 2, xR, y1, { color: ALG, width: elemWidth(N, Nmax) + (on ? 1.2 : 0), alpha: on ? 1 : 0.85 });
          p.tex(texSurd(N), px(p, xR + bul / 2 + 9, (y0 + y1) / 2), { key: `p${m}`, align: 'left', small: true, color: 'alg' });
        }
        if (m > -j) {
          const N = ladderN(j, m - 1);
          const y0 = Y(m) + 1;
          const y1 = Y(m - 1) - 1;
          const on = active && !active.dead && active.dir < 0 && Math.abs(active.from - m) < 1e-9;
          qArrow(g, xL, y0, xL - bul, (y0 + y1) / 2, xL, y1, { color: ALG, width: elemWidth(N, Nmax) + (on ? 1.2 : 0), alpha: on ? 1 : 0.85 });
          p.tex(texSurd(N), px(p, xL - bul / 2 - 9, (y0 + y1) / 2), { key: `m${m}`, align: 'right', small: true, color: 'alg' });
        }
      }
      // the ends of the ladder: J+|j,j⟩ = 0 and J−|j,−j⟩ = 0
      const zTop = [xR + 6, Y(j) - end];
      const zBot = [xL - 6, Y(-j) + end];
      const fl = flash ? 1 - flash.t / flash.dur : 0;
      for (const [Z, top] of [
        [zTop, true],
        [zBot, false],
      ]) {
        const y0 = top ? Y(j) - 1 : Y(-j) + 1;
        const y1 = top ? Z[1] + 9 : Z[1] - 9;
        const xs = top ? xR : xL;
        const on = active && active.dead && (active.dir > 0) === top;
        qArrow(g, xs, y0, xs + (top ? bul : -bul) * 0.8, (y0 + y1) / 2, Z[0], y1, { color: ALG, width: 1.3 + (on ? 1 : 0), dash: [3, 4], alpha: on ? 1 : 0.7 });
        const lit = flash && flash.top === top ? fl : 0;
        disc(g, Z[0], Z[1], 8 + 3 * lit, withAlpha(HI, 0.15 * lit), { stroke: lit ? HI : MUTED, width: 1.3 + lit });
        text(g, '0', Z[0], Z[1] + 0.5, { color: lit ? HI : INK2, size: 11.5, align: 'center' });
        const jt = texHalf(j);
        const lab = top ? `J_+\\ket{${jt},${jt}}=0` : `J_-\\ket{${jt},${texHalf(-j)}}=0`;
        p.tex(lab, px(p, Z[0] + (top ? 15 : -15), Z[1]), { key: top ? 'zt' : 'zb', align: top ? 'left' : 'right', small: true, color: lit ? 'hi' : 'ink2' });
      }

      // rungs
      for (const m of ms) {
        const y = Y(m);
        const sel = Math.abs(m - S.m) < 1e-9 && !(active && !active.dead && active.s > 0.5);
        const tgt = active && !active.dead && active.s > 0.5 && Math.abs(m - (active.from + active.dir)) < 1e-9;
        const hi = sel || tgt;
        seg(g, xc - half, y, xc + half, y, { color: hi ? HI : INK2, width: hi ? 3 : 2, alpha: hi ? 1 : 0.8 });
        disc(g, xc, y, hi ? 6 : 4, hi ? HI : INK2, { stroke: col('surface'), width: 2 });
        p.tex(texHalf(m), px(p, xL - bul / 2 - 58, y), { key: `ml${m}`, align: 'right', small: true, color: hi ? 'hi' : 'ink2' });
      }
      // selected state label
      const kSel = active && !active.dead && active.s > 0.5 ? active.from + active.dir : S.m;
      p.tex(`\\ket{${texHalf(j)},${texHalf(kSel)}}`, px(p, W - 14, Y(kSel)), { key: 'ket', align: 'right', color: 'hi' });

      // moving token (the state being acted on)
      if (active) {
        let pt;
        const s = active.s;
        if (!active.dead) {
          const m0 = active.from;
          const m1 = m0 + active.dir;
          const xs = active.dir > 0 ? xR : xL;
          const y0 = Y(m0);
          const y1 = Y(m1);
          pt = qPoint(xs, y0, xs + (active.dir > 0 ? bul : -bul), (y0 + y1) / 2, xs, y1, s);
        } else {
          const top = active.dir > 0;
          const Z = top ? zTop : zBot;
          const xs = top ? xR : xL;
          const y0 = top ? Y(j) : Y(-j);
          pt = qPoint(xs, y0, xs + (top ? bul : -bul) * 0.8, (y0 + Z[1]) / 2, Z[0], Z[1], s);
        }
        const fade = active.dead ? 1 - s * s : 1;
        disc(g, pt[0], pt[1], 6.5, withAlpha(HI, 0.95 * fade), { stroke: col('surface'), width: 2 });
      }
      void step;
    },
  });
  p.on('click', (pos) => {
    const L = layout(p.width, p.height);
    if (L.n < 2) return;
    const k = Math.round((pos.py - L.Y(L.j)) / L.step);
    if (k < 0 || k >= L.n) return;
    if (Math.abs(pos.py - L.Y(L.j - k)) > Math.max(14, L.step / 2)) return;
    seq++;
    setM(L.j - k);
  });

  // ------------------------------------------------------------------ vector model (3D)
  const k3 = scene3d(v3.body, scope, { camera: CAM });
  // J_x, J_y are undetermined in |j m⟩: draw their axes for orientation but label only J_z
  k3.axes({ length: 1.5, negative: true, labels: ['', '', 'J_z'] });
  k3.sphere({ radius: R0, color: 'muted', opacity: 0.06, segments: 48 });
  const rimDir = (() => {
    // screen-left direction for the default camera, so the m labels sit beside the circles
    const f = CAM.map((x) => -x);
    const n = Math.hypot(...f);
    const r = [f[1] / n, -f[0] / n, 0];
    const rn = Math.hypot(...r);
    return [-r[0] / rn, -r[1] / rn, 0];
  })();
  const circles = Array.from({ length: MAXN }, () => k3.line([], { color: 'muted', width: 1.3, opacity: 0.85 }));
  const mLabels = Array.from({ length: MAXN }, () => k3.label('', [0, 0, 0], { small: true }));
  const ticks = k3.dots(Array.from({ length: MAXN }, () => [0, 0, 0]), { radius: 0.026, color: 'muted', max: MAXN });
  const selCircle = k3.line([], { color: 'hi', width: 2.6 });
  const coneMesh = k3.surface(() => [0, 0, 0], [0, 1], [0, TAU], 1, 72, { color: 'hi', opacity: 0.15 });
  const arrow = k3.arrow([0, 0, 0], [0, 0, 1], { color: 'hi', radius: 0.03, headLength: 0.15, headRadius: 0.068 });
  const proj = k3.line([], { color: 'z', width: 1.6, dashed: true, dashSize: 0.05, gapSize: 0.045 });
  const foot = k3.dots([[0, 0, 0]], { radius: 0.04, color: 'z' });
  const zeroLab = k3.label('j=0:\\ \\vec J=0', [0.15, 0.15, 0.25], { small: true });
  const ov3 = v3.overlay('bl', 'overlay-card reps-overlay');

  function cone3(theta, len) {
    // scene coordinates: scale √(j(j+1)) → R0
    const j = jOf();
    const s = j > 0 ? R0 / Math.sqrt(casimir(j)) : 0;
    return { z: len * Math.cos(theta) * s, rho: len * Math.sin(theta) * s };
  }
  function rebuild3D() {
    const j = jOf();
    const ms = mValues(j);
    const tickPts = [];
    for (let i = 0; i < MAXN; i++) {
      if (i < ms.length && j > 0) {
        const vm = vectorModel(j, ms[i]);
        const { z, rho } = cone3(vm.theta, vm.len);
        const pts = [];
        for (let q = 0; q <= 96; q++) pts.push([rho * Math.cos((TAU * q) / 96), rho * Math.sin((TAU * q) / 96), z]);
        circles[i].setPoints(pts);
        circles[i].visible = true;
        mLabels[i].setText(`m=${texHalf(ms[i])}`);
        mLabels[i].setPosition([rimDir[0] * (rho + 0.16), rimDir[1] * (rho + 0.16), z]);
        mLabels[i].setVisible(true);
        tickPts.push([0, 0, z]);
      } else {
        circles[i].visible = false;
        mLabels[i].setVisible(false);
      }
    }
    ticks.setPoints(tickPts.length ? tickPts : [[0, 0, 0]]);
    ticks.visible = tickPts.length > 0;
    zeroLab.setVisible(j === 0);
  }
  function update3D() {
    const j = jOf();
    let theta;
    let len;
    if (j === 0) {
      arrow.visible = false;
      coneMesh.visible = false;
      selCircle.visible = false;
      proj.visible = false;
      foot.visible = false;
      return;
    }
    arrow.visible = coneMesh.visible = foot.visible = true;
    const vmS = vectorModel(j, S.m);
    if (anim) {
      const s = easeInOut(clamp(anim.t / anim.dur, 0, 1));
      if (anim.to !== null) {
        theta = lerp(vmS.theta, vectorModel(j, anim.to).theta, s);
        len = vmS.len;
      } else {
        theta = vmS.theta;
        len = vmS.len * (1 - s);
      }
    } else {
      theta = vmS.theta;
      len = vmS.len;
    }
    const { z, rho } = cone3(theta, len);
    const tip = [rho * Math.cos(phi), rho * Math.sin(phi), z];
    arrow.set([0, 0, 0], tip);
    arrow.visible = len > 1e-3;
    proj.setPoints([tip, [0, 0, z]]);
    proj.visible = len > 1e-3;
    foot.setPoints([[0, 0, z]]);
    foot.visible = len > 1e-3;
    const { z: zc, rho: rc } = cone3(theta, vmS.len);
    coneMesh.update((u, v) => [u * rc * Math.cos(v), u * rc * Math.sin(v), u * zc]);
    coneMesh.visible = !anim || anim.to !== null;
    const pts = [];
    for (let q = 0; q <= 96; q++) pts.push([rc * Math.cos((TAU * q) / 96), rc * Math.sin((TAU * q) / 96), zc]);
    selCircle.setPoints(pts);
    selCircle.visible = !anim || anim.to !== null;
  }

  // ------------------------------------------------------------------ matrices card
  function renderMatrices() {
    const j = jOf();
    const c = Math.round(j - S.m);
    const all = [
      ['J_z', 'z'],
      ['\\alg{J_+}', 'p'],
      ['\\alg{J_-}', 'm'],
      ['J_x', 'x'],
      ['J_y', 'y'],
    ];
    const list = j <= 2 ? all : all.slice(0, 3);
    const { err } = casimirCheck(j);
    let html = list.map(([nm, w]) => `<div class="reps-mat">${texHTML(`${nm}=${texSpinMatrix(j, w, c)}`, true)}</div>`).join('');
    const extra = j > 2 ? ` For $j>2$ only $J_z$ and $J_\\pm$ are shown; $J_x=\\tfrac12(J_++J_-)$, $J_y=\\tfrac1{2i}(J_+-J_-)$.` : '';
    html += `<div class="reps-mat-note">${inlineTex(`$J_x^2+J_y^2+J_z^2=${texFrac(casimir(j))}\\,\\id_{${dimOf(j)}}$ — computed from the matrices, largest deviation $${err < 1e-300 ? '0' : err.toExponential(1).replace('e', '\\times10^{') + '}'}$ <span class="ok">✓</span>. The highlighted column is the image of the selected state $\\ket{j,m}$.${extra}`)}</div>`;
    matBox.innerHTML = html;
  }

  // ------------------------------------------------------------------ panel
  const secM = pg.section('Multiplet');
  const segJ = ui.segmented(secM, { label: 'Spin $j$', options: J_OPTIONS, value: S.twoJ, onChange: (t) => (seq++, setJ(t)) });
  const sM = ui.slider(secM, {
    label: 'Selected state $m$',
    min: -jOf(),
    max: jOf(),
    step: 1,
    value: S.m,
    format: (v) => `$${texHalf(v)}$`,
    onInput: (v) => (seq++, setM(v)),
  });
  const row = ui.h('div', { class: 'btn-row' });
  secM.appendChild(row);
  ui.button(row, { label: 'Apply $J_+$', onClick: () => (seq++, applyLadder(+1)) });
  ui.button(row, { label: 'Apply $J_-$', onClick: () => (seq++, applyLadder(-1)) });
  const play = ui.playButton(row, { playing: S.playing, labels: ['▶ Precess', '❚❚ Pause'], onToggle: (v) => (S.playing = v) });
  const msg = ui.h('div', { class: 'reps-msg' });
  secM.appendChild(msg);

  const secR = pg.section('Selected state');
  const out = ui.readout(secR, {});
  const kv = ui.keyValue(secR, [
    ['Multiplet dimension $2j+1$', ''],
    ['$\\langle J_x\\rangle=\\langle J_y\\rangle$', '0'],
    ['$\\Delta J_x=\\Delta J_y=\\sqrt{(j(j+1)-m^2)/2}$', ''],
    ['Cone half-angle $\\arccos\\frac{m}{\\sqrt{j(j+1)}}$', ''],
  ]);
  ui.legend(secR, [
    { color: 'alg', label: '$J_\\pm$ (generators)' },
    { color: 'hi', label: 'selected $\\ket{j,m}$' },
    { color: 'z', label: 'projection $J_z=m$' },
    { color: 'muted', label: 'sphere $|\\vec J|=\\sqrt{j(j+1)}$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Spin ½: the qubit',
      text: 'Two rungs and $J_\\pm$ elements equal to $1$, so $\\vec J=\\vec\\sigma/2$. Special to spin ½: every state is the top state $m=+\\tfrac12$ along <em>some</em> axis — the Bloch sphere of <a href="#/su2">SU(2)</a>. For $j\\ge1$ most states are not.',
      apply: () => {
        seq++;
        setJ(1, 0.5);
      },
    },
    {
      title: 'Spin 1: three states, elements $\\sqrt2$',
      text: 'Same commutation relations, bigger matrices: $J_x=\\tfrac1{\\sqrt2}\\left(\\begin{smallmatrix}0&1&0\\\\1&0&1\\\\0&1&0\\end{smallmatrix}\\right)$. This is the vector representation of rotations, written in the spherical basis.',
      apply: () => {
        seq++;
        setJ(2, 0);
      },
    },
    {
      title: 'One Casimir for the whole multiplet',
      text: 'Steps through $j=\\tfrac32$: $J_z$ changes, but every cone ends on the same sphere and $\\vec J^{\\,2}=\\tfrac{15}{4}$ throughout. A rotation-invariant $H$ therefore cannot distinguish the rungs — the $2j+1$ states are degenerate.',
      apply: () => {
        seq++;
        setJ(3, 1.5);
        for (let i = 1; i <= 6; i++) later(900 * i, () => setM(1.5 - (i % 6 <= 3 ? i % 6 : 6 - (i % 6))));
      },
    },
    {
      title: 'Climb off the top',
      text: 'From $\\ket{2,-2}$, apply $J_+$ five times. The norm $\\|J_+\\ket{j,m}\\|^2=(j-m)(j+m+1)$ vanishes exactly at $m=j$: the fifth step gives the zero vector. A ladder that must end at both ends forces $2j\\in\\mathbb Z$.',
      apply: () => {
        seq++;
        setJ(4, -2);
        for (let i = 1; i <= 5; i++) later(250 + 1000 * i, () => applyLadder(+1));
      },
    },
    {
      title: 'Spin never points along $z$',
      text: 'Even the top state of spin ½ sits on a cone of half-angle $54.7^\\circ$: $\\langle J_x^2+J_y^2\\rangle=j(j+1)-m^2=j>0$. Then $j=4$: the cone narrows to $26.6^\\circ$ — it closes like $1/\\sqrt j$, the classical limit.',
      apply: () => {
        seq++;
        setJ(1, 0.5);
        later(2600, () => setJ(8, 4));
      },
    },
  ]);

  // ------------------------------------------------------------------ actions
  function setJ(t, m) {
    finishAnim();
    S.twoJ = clamp(Math.round(t), 0, 8);
    if (m !== undefined) S.m = m;
    sanitize();
    segJ.set(S.twoJ, { silent: true });
    const j = jOf();
    sM.setRange(-j, j, 1);
    sM.set(S.m, { silent: true });
    sM.disable(j === 0);
    msg.innerHTML = '';
    rebuild3D();
    refresh();
  }
  function setM(m) {
    finishAnim();
    S.m = m;
    sanitize();
    sM.set(S.m, { silent: true });
    msg.innerHTML = '';
    refresh();
  }
  function applyLadder(dir) {
    finishAnim();
    const j = jOf();
    const to = S.m + dir;
    const dead = Math.abs(to) > j + 1e-9;
    anim = { dir, from: S.m, to: dead ? null : to, t: 0, dur: dead ? 0.95 : 0.7 };
    const jt = texHalf(j);
    const N = dead ? 0 : ladderN(j, dir > 0 ? S.m : S.m - 1);
    msg.innerHTML = inlineTex(
      dead
        ? `$J_${dir > 0 ? '+' : '-'}\\ket{${jt},${texHalf(S.m)}}=0$: ${dir > 0 ? 'nothing above the top — this is the highest weight' : 'nothing below the bottom — the lowest weight'}.`
        : `$J_${dir > 0 ? '+' : '-'}\\ket{${jt},${texHalf(S.m)}}=${N === 1 ? '' : texSurd(N)}\\ket{${jt},${texHalf(to)}}$ (then normalised).`,
    );
    p.invalidate();
  }
  function finishAnim() {
    if (!anim) return;
    const a = anim;
    anim = null;
    if (a.to !== null) {
      S.m = a.to;
      sanitize();
      sM.set(S.m, { silent: true });
    } else flash = { t: 0, dur: 1.6, top: a.dir > 0 };
    refresh();
  }

  function refresh() {
    const j = jOf();
    const m = S.m;
    const jt = texHalf(j);
    const ket = (mm) => `\\ket{${jt},${texHalf(mm)}}`;
    const coef = (N) => (N === 1 ? '' : `${texSurd(N)}\\,`);
    const up = m < j - 1e-9 ? `${coef(ladderN(j, m))}${ket(m + 1)}` : '0';
    const dn = m > -j + 1e-9 ? `${coef(ladderN(j, m - 1))}${ket(m - 1)}` : '0';
    out.set(
      `\\begin{aligned} J_z${ket(m)}&=${texHalf(m)}\\,${ket(m)}\\\\ \\vec J^{\\,2}${ket(m)}&=${texFrac(casimir(j))}\\,${ket(m)}\\\\ \\alg{J_+}${ket(m)}&=${up}\\\\ \\alg{J_-}${ket(m)}&=${dn}\\end{aligned}`,
    );
    const vm = vectorModel(j, m);
    kv.set('Multiplet dimension $2j+1$', String(dimOf(j)));
    kv.set('$\\Delta J_x=\\Delta J_y=\\sqrt{(j(j+1)-m^2)/2}$', fmt(Math.sqrt(Math.max(0, casimir(j) - m * m) / 2), 3));
    kv.set('Cone half-angle $\\arccos\\frac{m}{\\sqrt{j(j+1)}}$', j > 0 ? fmtDeg(vm.theta) : '—');
    ov3.innerHTML = inlineTex(
        j > 0
          ? `$|\\vec J|=\\sqrt{j(j+1)}=${texSurd(Math.round(4 * casimir(j)), 2)}\\approx${fmt(vm.len, 2)}$<br>$J_z=m=${texHalf(m)}$, $\\ \\theta=${fmt((vm.theta * 180) / Math.PI, 1)}^\\circ$`
          : '$j=0$: one state, $\\vec J=0$',
    );
    renderMatrices();
    p.invalidate();
  }

  scope.frame((dt) => {
    if (S.playing) phi = (phi + 0.75 * dt) % TAU;
    if (anim) {
      anim.t += dt;
      if (anim.t >= anim.dur) finishAnim();
      p.invalidate();
    }
    if (flash) {
      flash.t += dt;
      if (flash.t >= flash.dur) flash = null;
      p.invalidate();
    }
    update3D();
  });

  setJ(S.twoJ);
  void play;
  void textHalf;

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>Left: the <strong>weight diagram</strong> of the spin-$j$ multiplet — one rung for each eigenvalue $m$ of $J_z$. The orange
    arcs are the ladder operators $\\alg{J_\\pm}=J_x\\pm iJ_y$, labelled by their matrix elements and drawn with a thickness that grows with them:</p>
    $$\\alg{J_\\pm}\\ket{j,m}=\\sqrt{j(j+1)-m(m\\pm1)}\\;\\ket{j,m\\pm1}.$$
    <p>The elements are largest in the middle of the ladder and vanish at its ends, where $J_+$ (or $J_-$) gives the zero vector rather than a new state.
    Right: the semiclassical <strong>vector model</strong>. Every state of the multiplet has the same length $|\\vec J|=\\sqrt{j(j+1)}$ — all circles lie on
    one sphere — but a different projection $J_z=m$. Below: the generators as matrices; the highlighted column is the image of the selected state.</p>`);
  pg.note(`<h2>The physics: why spectra come in multiplets</h2>
    <p>Everything here follows from $[J_i,J_j]=i\\epsilon_{ijk}J_k$ alone, rewritten as $[J_z,\\alg{J_\\pm}]=\\pm\\alg{J_\\pm}$ and $[\\alg{J_+},\\alg{J_-}]=2J_z$.
    The first relation says that $\\alg{J_\\pm}$ shifts the eigenvalue of $J_z$ by $\\pm1$. The identity $J_-J_+=\\vec J^{\\,2}-J_z^2-J_z$ gives the norm</p>
    $$\\|J_+\\ket{j,m}\\|^2=j(j+1)-m(m+1)\\ \\ge 0,$$
    <p>so the ladder must stop: $J_+$ annihilates a top state with $m=j$, $J_-$ a bottom state with $m=-j$. Getting from top to bottom in integer steps forces
    $2j\\in\\mathbb Z$ — integer $j$ for orbital motion, half-integers for spinors.</p>
    <div class="callout physics"><span class="callout-title">Degeneracy is Schur's lemma</span>If the Hamiltonian is rotation invariant, $[H,\\vec J]=0$,
    then $H$ commutes with $J_\\pm$ and all $2j+1$ states of a multiplet have the same energy: restricted to an irreducible multiplet, $H$ commutes with every
    $D^{(j)}(R)$ and is therefore a multiple of the identity. A magnetic field along $z$, $H=\\omega_L J_z$, keeps only rotations about $z$ and splits the
    multiplet into $2j+1$ equally spaced Zeeman levels: the weight diagram becomes the energy-level diagram, and a Stern–Gerlach magnet splits a beam into
    $2j+1$ components.</div>`);
  pg.note(`<h2>The mathematics: irreducible representations of $\\su(2)$</h2>
    <p>A <strong>representation</strong> assigns to every rotation a unitary operator with $U(R_1R_2)=U(R_1)\\,U(R_2)$ — a homomorphism from the group into
    the unitary operators on the Hilbert space. Its Hermitian generators obey the same Lie algebra, and $U(R)=e^{-i\\theta\\,\\hat n\\cdot\\vec J}$.
    For each $j\\in\\{0,\\tfrac12,1,\\dots\\}$ there is exactly one <strong>irreducible</strong> representation (up to equivalence), of dimension $2j+1$:
    no proper subspace is invariant, because repeated $J_\\pm$ connect every rung to every other.</p>
    <p>The <strong>Casimir</strong> $\\vec J^{\\,2}$ commutes with every generator, so on an irreducible representation it is a number, $j(j+1)$ — the label
    of the multiplet. $J_z$ spans the Cartan subalgebra; its eigenvalues $m$ are the <em>weights</em>, and $j$ is the <em>highest weight</em>.</p>
    $$J_x=\\tfrac12(J_++J_-),\\qquad J_y=\\tfrac1{2i}(J_+-J_-),\\qquad \\vec J^{\\,2}=J_-J_++J_z^2+J_z=j(j+1)\\,\\id .$$`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><strong>The cone is uncertainty.</strong> In $\\ket{j,m}$, $\\langle J_x\\rangle=\\langle J_y\\rangle=0$ but $\\langle J_x^2+J_y^2\\rangle=j(j+1)-m^2\\ge j$:
      spin never points along $z$. The smallest cone angle shrinks like $1/\\sqrt j$ — the classical limit of a large angular momentum.</li>
      <li><strong>Spin ½</strong> is the qubit, $\\vec J=\\vec\\sigma/2$, and its group is SU(2), not SO(3): <a href="#/su2">SU(2) and the double cover</a>.
      Rotations and their generators: <a href="#/so3">SO(3)</a>.</li>
      <li><strong>Bigger groups, same idea.</strong> SU(3) has two commuting generators, so weight diagrams are two-dimensional and multiplets become
      triangles and hexagons: <a href="#/su3">quarks and the Eightfold Way</a>; the general machinery is in <a href="#/roots">roots &amp; weights</a>.</li>
      <li><strong>Hidden symmetry.</strong> Hydrogen's levels are $n^2$-fold degenerate — more than $2l+1$ — because its symmetry is SO(4):
      <a href="#/kepler">Kepler &amp; hidden symmetry</a>.</li>
    </ul>
    <div class="callout warning"><span class="callout-title">About the precession</span>The circling arrow is a mnemonic for the undetermined $J_x$, $J_y$;
    a stationary state $\\ket{j,m}$ does not precess. Real (Larmor) precession of $\\langle\\vec J\\rangle$ needs a superposition of different $m$.</div>`);
}
