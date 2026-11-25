// Tab "Rotating a state": a function f = Σ_m c_m Y_ℓm on the sphere drawn as the radial surface
// r = |f| coloured by arg f, rotated by R(α,β,γ) = R_z(α)R_y(β)R_z(γ). The surface is computed from
// the transformed coefficients c' = D^ℓ(R) c (not by rotating the mesh), so the shape staying glued
// to the violet frame R e_i is the identity f(R⁻¹r) = Σ c'_m Y_ℓm(r) made visible. The ℓ-content of
// the rotated function is measured independently by quadrature of f(R⁻¹r).

import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { scene3d, THREE } from '../../core/three-kit.js';
import { TAU, clamp, mat, vec, expSO3, mulberry32, axisAngleOf } from '../../core/la.js';
import { fmt, fmtDeg, texMatrix } from '../../core/format.js';
import { inlineTex } from '../../core/tex.js';
import { wignerD, wignerSmallD, cmat } from '../../core/complex.js';
import {
  ORBITALS, realOrbital, basisState, randomState, mValues, eulerMatrix, eulerAngles, ylmTable, evalState, expectJ,
  sphereQuadrature, projectionTable, projectOnto,
} from './math.js';
import { texHalfSigned, textHalf } from './texfmt.js';
import { phaseLUT, phaseConic, phaseCSS } from './colour.js';
import { PIXEL_PLOT, px, roundRect, dial, text, seg } from './canvas.js';

const NT = 56; // θ segments of the surface grid
const NP = 112; // φ segments
const AXIS_R = 1.55; // radius of the draggable rotation-axis tip
const LMAX = 4;
const SPEED = 0.55; // rad/s about n̂ while playing
const LETTERS = 'spdfg';

export function mountRotate(pg, scope, ctx) {
  const S = (ctx.state.rotate ??= { l: 2, sel: 'dz2', euler: [0, 0, 0], axis: [0.56, 0.3, 0.77], playing: true, ghost: false, seed: 3 });
  const dark = ctx.isDark;
  const col = (n) => ctx.colors[n];
  const lut = phaseLUT(256, dark);
  const cssPhase = (z) => lut.css[lut.index(Math.atan2(z.im, z.re))];

  // ------------------------------------------------------------------ derived state
  let c0 = []; // unrotated coefficients (m = ℓ … −ℓ)
  let c1 = []; // rotated coefficients D c0
  let D = [[{ re: 1, im: 0 }]];
  let R = mat.eye(3);
  let isReal = true;
  let scale = 1;
  let ytab = null;
  let lcontent = [0, 0, 0, 0, 0];
  let quadErr = 0;
  let turn = null; // { R0, t, dur } — a 2π turn about n̂
  let seq = 0;
  const later = (ms, fn) => {
    const tok = seq;
    scope.timeout(() => tok === seq && fn(), ms);
  };

  function sanitize() {
    S.l = clamp(Math.round(S.l) || 0, 0, LMAX);
    if (!Array.isArray(S.euler) || S.euler.length !== 3 || !S.euler.every(Number.isFinite)) S.euler = [0, 0, 0];
    const n = Math.hypot(...(S.axis || []));
    S.axis = n > 1e-6 ? S.axis.map((x) => x / n) : [0, 0, 1];
    const ok =
      typeof S.sel === 'string' &&
      (ORBITALS[S.l].some((o) => o.id === S.sel) ||
        (S.sel.startsWith('y:') && Math.abs(Number(S.sel.slice(2))) <= S.l && Number.isInteger(Number(S.sel.slice(2)))) ||
        S.sel === 'rand');
    if (!ok) S.sel = ORBITALS[S.l][0].id;
  }
  function stateCoeffs() {
    const l = S.l;
    if (S.sel.startsWith('y:')) return basisState(l, Number(S.sel.slice(2)));
    if (S.sel === 'rand') return randomState(2 * l + 1, mulberry32(1000 + S.seed));
    const o = ORBITALS[l].find((q) => q.id === S.sel);
    return realOrbital(l, o.m, o.type);
  }
  const stateTex = () => {
    if (S.sel.startsWith('y:')) return `Y_{${S.l},${Number(S.sel.slice(2))}}`;
    if (S.sel === 'rand') return '\\text{random}';
    return ORBITALS[S.l].find((q) => q.id === S.sel).tex;
  };

  // ------------------------------------------------------------------ views
  const v3 = pg.view({
    title: "The state on the sphere: radius $|f'|$, colour $\\arg f'$",
    hint: 'drag to orbit · drag the orange tip to tilt the axis $\\hat n$',
    height: 420,
    span: true,
  });
  const vc = pg.view({ title: "Coefficients: $c'_{m'}=\\sum_m \\grp{D^{\\ell}_{m'm}(R)}\\,c_m$", height: 264, span: true });

  // ------------------------------------------------------------------ 3D scene
  const k = scene3d(v3.body, scope, { camera: [3.95, 2.65, 1.95] });
  k.axes({ length: 1.38 });
  const NV = (NT + 1) * (NP + 1);
  const thetas = new Float64Array(NV);
  const phis = new Float64Array(NV);
  const dirs = new Float32Array(NV * 3);
  for (let i = 0, v = 0; i <= NT; i++) {
    const th = (Math.PI * i) / NT;
    for (let jj = 0; jj <= NP; jj++, v++) {
      const ph = (TAU * jj) / NP;
      thetas[v] = th;
      phis[v] = ph;
      dirs[3 * v] = Math.sin(th) * Math.cos(ph);
      dirs[3 * v + 1] = Math.sin(th) * Math.sin(ph);
      dirs[3 * v + 2] = Math.cos(th);
    }
  }
  const index = [];
  for (let i = 0; i < NT; i++)
    for (let jj = 0; jj < NP; jj++) {
      const a = i * (NP + 1) + jj;
      const b = (i + 1) * (NP + 1) + jj;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const pos = new Float32Array(NV * 3);
  const colArr = new Float32Array(NV * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, k.material('#ffffff', { vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
  k.add(mesh);

  // ghost: coarse wireframe of the unrotated state
  const ghostRings = [8, 16, 24, 32, 40, 48]; // θ indices
  const ghostMer = 12; // meridians
  const ghostCount = (ghostRings.length * NP + ghostMer * NT) * 2;
  const ghostPos = new Float32Array(ghostCount * 3);
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.BufferAttribute(ghostPos, 3));
  const ghost = new THREE.LineSegments(ghostGeo, new THREE.LineBasicMaterial({ color: k.color('muted'), transparent: true, opacity: 0.45, depthWrite: false }));
  ghost.frustumCulled = false;
  k.add(ghost);

  const frame = [0, 1, 2].map(() => k.arrow([0, 0, 0], [1, 0, 0], { color: 'grp', radius: 0.012, headLength: 0.08, headRadius: 0.032 }));
  const frameLabels = ["x'", "y'", "z'"].map((t) => k.label(t, [0, 0, 0], { small: true, color: 'grp' }));
  const axisArrow = k.arrow([0, 0, 0], [0, 0, 1], { color: 'alg', radius: 0.016, headLength: 0.1, headRadius: 0.04 });
  const axisTip = k.sphere({ radius: 0.075, color: 'alg', segments: 24 });
  const axisLabel = k.label('\\hat n', [0, 0, 0], { color: 'alg' });
  const Larrow = k.arrow([0, 0, 0], [0, 0, 0], { color: 'hi', radius: 0.024, headLength: 0.12, headRadius: 0.055 });
  const Llabel = k.label('\\langle\\vec L\\rangle', [0, 0, 0], { color: 'hi' });
  k.draggable(axisTip, {
    constrain: k.onSphere([0, 0, 0], AXIS_R),
    onDrag: (q) => {
      const n = Math.hypot(...q);
      if (n > 1e-6) S.axis = q.map((x) => x / n);
      placeAxis();
    },
  });

  // phase legend overlay
  const legendBox = v3.overlay('bl', 'overlay-card');
  function renderPhaseLegend() {
    const html = isReal
      ? `<div class="phase-text"><span class="sign-sw" style="background:${phaseCSS(0, dark)}"></span>$f'>0$&nbsp;&nbsp;<span class="sign-sw" style="background:${phaseCSS(Math.PI, dark)}"></span>$f'<0$<br><span style="color:var(--muted)">real state: two colours</span></div>`
      : `<div class="phase-legend"><div class="phase-ring"><div class="ring" style="background:${phaseConic(dark)}"></div><span class="r0">0</span><span class="r1">π/2</span><span class="r2">π</span><span class="r3">3π/2</span></div><div class="phase-text">colour = phase<br>$\arg f'(\hat r)$</div></div>`;
    legendBox.innerHTML = inlineTex(html);
  }

  // ------------------------------------------------------------------ quadrature (independent check)
  const quad = sphereQuadrature(10, 20);
  const ptab = projectionTable(LMAX, quad);
  function measureContent() {
    const Rinv = mat.transpose(R);
    const values = quad.dirs.map((d) => evalState(S.l, c0, mat.mulv(Rinv, d)));
    const { coeffs, weight } = projectOnto(ptab, values);
    lcontent = weight;
    quadErr = 0;
    coeffs[S.l].forEach((z, i) => (quadErr = Math.max(quadErr, Math.hypot(z.re - c1[i].re, z.im - c1[i].im))));
  }

  // ------------------------------------------------------------------ geometry updates
  function buildTable() {
    ytab = ylmTable(S.l, thetas, phis);
  }
  function fAt(c, v) {
    const d = ytab.d;
    const o = v * d;
    let fr = 0;
    let fi = 0;
    for (let q = 0; q < d; q++) {
      const cr = c[q].re;
      const ci = c[q].im;
      const yr = ytab.re[o + q];
      const yi = ytab.im[o + q];
      fr += cr * yr - ci * yi;
      fi += cr * yi + ci * yr;
    }
    return [fr, fi];
  }
  function updateSurface() {
    for (let v = 0; v < NV; v++) {
      const [fr, fi] = fAt(c1, v);
      const a = Math.hypot(fr, fi) * scale;
      pos[3 * v] = dirs[3 * v] * a;
      pos[3 * v + 1] = dirs[3 * v + 1] * a;
      pos[3 * v + 2] = dirs[3 * v + 2] * a;
      const li = 3 * lut.index(Math.atan2(fi, fr));
      colArr[3 * v] = lut.lin[li];
      colArr[3 * v + 1] = lut.lin[li + 1];
      colArr[3 * v + 2] = lut.lin[li + 2];
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  function updateGhost() {
    let q = 0;
    const put = (v) => {
      const [fr, fi] = fAt(c0, v);
      const a = Math.hypot(fr, fi) * scale;
      ghostPos[q++] = dirs[3 * v] * a;
      ghostPos[q++] = dirs[3 * v + 1] * a;
      ghostPos[q++] = dirs[3 * v + 2] * a;
    };
    for (const i of ghostRings)
      for (let jj = 0; jj < NP; jj++) {
        put(i * (NP + 1) + jj);
        put(i * (NP + 1) + jj + 1);
      }
    for (let mI = 0; mI < ghostMer; mI++) {
      const jj = Math.round((mI * NP) / ghostMer);
      for (let i = 0; i < NT; i++) {
        put(i * (NP + 1) + jj);
        put((i + 1) * (NP + 1) + jj);
      }
    }
    ghostGeo.attributes.position.needsUpdate = true;
    ghostGeo.computeBoundingSphere();
    ghost.visible = !!S.ghost;
  }
  function placeAxis() {
    const tip = S.axis.map((x) => x * AXIS_R);
    axisArrow.set([0, 0, 0], tip.map((x) => x * 0.955));
    axisTip.position.set(...tip);
    axisLabel.setPosition(S.axis.map((x) => x * (AXIS_R + 0.16)));
  }
  function placeFrame() {
    const ang = axisAngleOf(R).angle;
    for (let i = 0; i < 3; i++) {
      const e = [0, 1, 2].map((r) => R[r][i]);
      frame[i].set([0, 0, 0], e.map((x) => x * 1.16));
      frameLabels[i].setPosition(e.map((x) => x * 1.27));
      frameLabels[i].setVisible(ang > 0.04);
    }
    const L = expectJ(S.l, c1);
    const nL = Math.hypot(...L);
    const s = S.l > 0 ? 1.12 / S.l : 0;
    if (nL > 0.02) {
      Larrow.visible = true;
      Larrow.set([0, 0, 0], L.map((x) => x * s));
      Llabel.setPosition(L.map((x) => x * s + (x / nL) * 0.14));
      Llabel.setVisible(true);
    } else {
      Larrow.visible = false;
      Llabel.setVisible(false);
    }
  }

  // ------------------------------------------------------------------ recompute
  function setState(fromUser = true) {
    sanitize();
    if (fromUser) seq++;
    c0 = stateCoeffs();
    isReal = S.sel !== 'rand' && !S.sel.startsWith('y:') ? true : S.sel.startsWith('y:') ? Number(S.sel.slice(2)) === 0 : false;
    if (!ytab || ytab.d !== 2 * S.l + 1) buildTable();
    let mx = 0;
    for (let v = 0; v < NV; v++) {
      const [fr, fi] = fAt(c0, v);
      mx = Math.max(mx, Math.hypot(fr, fi));
    }
    scale = mx > 1e-12 ? 1.02 / mx : 1;
    updateGhost();
    renderPhaseLegend();
    paintStateControls();
    rotate();
  }
  function rotate() {
    R = eulerMatrix(...S.euler);
    D = wignerD(S.l, ...S.euler);
    c1 = cmat.apply(D, c0);
    measureContent();
    updateSurface();
    placeFrame();
    pc.invalidate();
    readoutsDirty = true;
  }
  function setEuler(e, { syncSliders = true } = {}) {
    S.euler = e;
    if (syncSliders) {
      sA.set(e[0], { silent: true });
      sB.set(e[1], { silent: true });
      sG.set(e[2], { silent: true });
    }
    rotate();
  }

  // ------------------------------------------------------------------ coefficient canvas
  const textSigned = (m) => (m > 0 ? '+' + textHalf(m) : textHalf(m));
  const pc = plot2d(vc.body, scope, {
    ...PIXEL_PLOT,
    draw(p) {
      const g = p.ctx;
      const W = p.width;
      const H = p.height;
      const l = S.l;
      const d = 2 * l + 1;
      if (c0.length !== d || c1.length !== d || D.length !== d) return;
      const ms = mValues(l);
      const INK = col('ink');
      const INK2 = col('ink2');
      const MUTED = col('muted');
      const GRID = col('grid');
      const SURF2 = col('surface2');
      const headY = 50;
      const colY = 68;
      const y0 = 80;
      const rowH = clamp((H - y0 - 12) / d, 14, 30);
      const cs = rowH;
      const showL = W >= 660;
      const lW = showL ? 120 : 0;
      const tight = W < 470;
      const mlab = tight ? 21 : 26;
      const dialW = tight ? 15 : 18;
      const gapEq = tight ? 16 : 24;
      const gapMul = tight ? 10 : 18;
      const fixed = 2 * (mlab + dialW) + gapEq + gapMul + d * cs + (showL ? lW + 30 : 0);
      const Lb = clamp((W - fixed - (tight ? 14 : 24)) / 2, 40, 180);
      const total = fixed + 2 * Lb;
      let x = Math.max(10, (W - total) / 2);
      const xA = x;
      x += mlab + dialW + Lb;
      const xEq = x + gapEq / 2;
      x += gapEq;
      const xD = x;
      x += d * cs + gapMul;
      const xB = x;
      x += mlab + dialW + Lb;
      const xL = x + 30;
      const rowY = (i) => y0 + i * rowH + rowH / 2;
      const bh = Math.max(6, rowH * 0.56);

      const bars = (x0, c, title, key) => {
        p.tex(title, px(p, x0 + mlab + dialW, headY), { key, align: 'left', small: true });
        for (let i = 0; i < d; i++) {
          const y = rowY(i);
          const z = c[i];
          const a2 = z.re * z.re + z.im * z.im;
          text(g, textSigned(ms[i]), x0 + mlab - 6, y, { color: INK2, size: 11.5, align: 'right' });
          const bx = x0 + mlab + dialW;
          g.fillStyle = SURF2;
          roundRect(g, bx, y - bh / 2, Lb, bh, 3);
          g.fill();
          if (a2 > 1e-6) {
            g.fillStyle = cssPhase(z);
            roundRect(g, bx, y - bh / 2, Math.max(2, a2 * Lb), bh, 3);
            g.fill();
          }
          dial(g, x0 + mlab + dialW / 2 - 1, y, Math.min(6.5, rowH * 0.3), Math.atan2(z.im, z.re), Math.sqrt(a2), { ring: MUTED, hand: INK });
          if (a2 >= 0.005) {
            const s = fmt(a2, 2);
            const inside = a2 * Lb > 40;
            text(g, s, inside ? bx + a2 * Lb - 5 : bx + a2 * Lb + 5, y + 0.5, { color: inside ? '#fff' : INK2, size: 10.5, align: inside ? 'right' : 'left' });
          }
        }
      };
      bars(xA, c1, "|c'_{m'}|^2\\ \\text{(after)}", 'hA');
      bars(xB, c0, '|c_m|^2\\ \\text{(before)}', 'hB');
      text(g, '=', xEq, y0 + (d * rowH) / 2, { color: INK2, size: 18, align: 'center' });

      // Hinton diagram of D: square area ∝ |D_{m'm}|², colour = phase
      p.tex(`\\grp{D^{${l}}_{m'm}(R)}`, px(p, xD + (d * cs) / 2, headY), { key: 'hD', small: true });
      for (let b = 0; b < d; b++) text(g, textSigned(ms[b]), xD + (b + 0.5) * cs, colY, { color: MUTED, size: 10, align: 'center' });
      g.strokeStyle = GRID;
      g.lineWidth = 1;
      g.strokeRect(xD + 0.5, y0 + 0.5, d * cs, d * rowH);
      for (let a = 0; a < d; a++)
        for (let b = 0; b < d; b++) {
          const z = D[a][b];
          const m = Math.hypot(z.re, z.im);
          if (m < 1e-3) continue;
          const s = cs * 0.88 * m;
          g.fillStyle = cssPhase(z);
          roundRect(g, xD + (b + 0.5) * cs - s / 2, rowY(a) - s / 2, s, s, Math.min(3, s / 4));
          g.fill();
        }
      text(g, 'm →', xD + d * cs + 2, colY, { color: MUTED, size: 10, align: 'left' });

      // ℓ-content of the rotated function, measured by quadrature of f(R⁻¹r)
      if (showL) {
        p.tex("\\text{weight of }f'\\text{ in each }\\ell", px(p, xL, headY), { key: 'hL', align: 'left', small: true });
        const bw = 15;
        const gap = 7;
        const base = y0 + d * rowH - 14;
        const hmax = Math.max(24, base - colY - 16);
        for (let q = 0; q <= LMAX; q++) {
          const bx = xL + q * (bw + gap);
          const w = clamp(lcontent[q], 0, 1);
          g.fillStyle = SURF2;
          g.fillRect(bx, base - hmax, bw, hmax);
          if (w > 1e-9) {
            g.fillStyle = q === l ? col('grp') : INK2;
            g.fillRect(bx, base - w * hmax, bw, w * hmax);
          }
          text(g, String(q), bx + bw / 2, base + 9, { color: q === l ? INK : MUTED, size: 11, align: 'center', weight: q === l ? 650 : 400 });
        }
        text(g, 'ℓ', xL + (LMAX + 1) * (bw + gap) + 2, base + 9, { color: MUTED, size: 11, align: 'left' });
        text(g, `${fmt(lcontent[l], 3)} in ℓ = ${l}`, xL, base - hmax - 8, { color: INK2, size: 10.5, align: 'left' });
      }
      void seg;
    },
  });
  // ------------------------------------------------------------------ panel
  const secS = pg.section('State $f=\\sum_m c_m\\,Y_{\\ell m}$');
  const segL = ui.segmented(secS, {
    label: 'Orbital angular momentum $\\ell$',
    options: [0, 1, 2, 3, 4].map((l) => ({ value: l, label: `${l}&thinsp;<span style="opacity:.65">${LETTERS[l]}</span>` })),
    value: S.l,
    onChange: (l) => {
      S.l = l;
      S.sel = ORBITALS[l][0].id;
      rebuildStateControls();
      setState();
    },
  });
  const realBox = ui.h('div');
  const ylmBox = ui.h('div');
  secS.append(realBox, ylmBox);
  let segReal = null;
  let segY = null;
  function rebuildStateControls() {
    realBox.innerHTML = '';
    ylmBox.innerHTML = '';
    const l = S.l;
    segReal = ui.segmented(realBox, {
      label: 'Real orbitals',
      options: ORBITALS[l].map((o) => ({ value: o.id, label: `$${o.tex}$` })),
      value: S.sel,
      onChange: (id) => {
        S.sel = id;
        setState();
      },
    });
    segY = ui.segmented(ylmBox, {
      label: '$Y_{\\ell m}$ with $m=$',
      options: mValues(l).map((m) => ({ value: 'y:' + m, label: `$${texHalfSigned(m)}$` })),
      value: S.sel,
      onChange: (id) => {
        S.sel = id;
        setState();
      },
    });
  }
  function paintStateControls() {
    if (segReal) segReal.set(S.sel, { silent: true });
    if (segY) segY.set(S.sel, { silent: true });
    segL.set(S.l, { silent: true });
  }
  ui.buttons(secS, [
    {
      label: 'Random superposition',
      onClick: () => {
        S.seed = (S.seed % 9973) + 1;
        S.sel = 'rand';
        setState();
      },
    },
  ]);
  ui.toggle(secS, {
    label: 'Show the unrotated state (wireframe)',
    value: S.ghost,
    onChange: (v) => {
      S.ghost = v;
      ghost.visible = v;
    },
  });

  const secR = pg.section('Rotation $\\grp{R}=R_z(\\alpha)R_y(\\beta)R_z(\\gamma)$');
  const sA = ui.slider(secR, { label: 'Euler $\\alpha$', min: 0, max: TAU, step: 0.002, value: S.euler[0], format: (v) => fmtDeg(v), onInput: (v) => userEuler(0, v) });
  const sB = ui.slider(secR, { label: 'Euler $\\beta$', min: 0, max: Math.PI, step: 0.002, value: S.euler[1], format: (v) => fmtDeg(v), onInput: (v) => userEuler(1, v) });
  const sG = ui.slider(secR, { label: 'Euler $\\gamma$', min: 0, max: TAU, step: 0.002, value: S.euler[2], format: (v) => fmtDeg(v), onInput: (v) => userEuler(2, v) });
  const rowR = ui.h('div', { class: 'btn-row' });
  secR.appendChild(rowR);
  const play = ui.playButton(rowR, {
    playing: S.playing,
    labels: ['▶ Rotate about $\\hat n$', '❚❚ Pause'],
    onToggle: (v) => {
      S.playing = v;
      if (v) turn = null;
    },
  });
  ui.button(rowR, { label: 'Reset $R=\\id$', onClick: () => (seq++, stopMotion(), setEuler([0, 0, 0])) });
  ui.button(rowR, { label: 'Turn by $2\\pi$', onClick: () => (seq++, startTurn()) });
  const turnMsg = ui.h('div', { class: 'reps-msg' });
  secR.appendChild(turnMsg);

  const secO = pg.section('Readout');
  const rD = ui.readout(secO, {});
  const kv = ui.keyValue(secO, [
    ['Rotation angle and axis of $R$', ''],
    ['$\\langle\\vec L^2\\rangle=\\ell(\\ell+1)$ (invariant)', ''],
    ["$\\langle L_z\\rangle=\\sum m'|c'_{m'}|^2$", ''],
    ["$\\sum|c'_{m'}|^2$ (unitarity)", ''],
    ["Weight of $f'$ in its $\\ell$ (quadrature)", ''],
    ["$\\max|c'(D)-c'(\\text{quadrature})|$", ''],
  ]);
  ui.legend(secO, [
    { color: 'grp', label: "frame $R\\,\\hat e_i$" },
    { color: 'alg', label: 'axis $\\hat n$ (generator $\\hat n\\cdot\\vec L$)' },
    { color: 'hi', label: '$\\langle\\vec L\\rangle$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: '$p_z$ becomes $p_x$',
      text: 'Rotate $p_z$ by $90^\\circ$ about $y$: $c=(0,1,0)$ goes to $(-\\tfrac1{\\sqrt2},0,\\tfrac1{\\sqrt2})$, which is $p_x$. The three $p$ orbitals are one multiplet: a rotation only reshuffles their coefficients, nothing leaks out of $\\ell=1$.',
      apply: () => {
        seq++;
        stopMotion();
        selectState(1, 'pz');
        animateEuler([0, 0, 0], [0, Math.PI / 2, 0], 1.8);
      },
    },
    {
      title: 'Rotate $Y_{22}$',
      text: 'The doughnut tilts and $|c\'_{m\'}|^2$ spreads over all five $m\'$ — yet the weight in $\\ell=2$ stays exactly $1$ and $\\langle\\vec L\\rangle$ (gold) turns rigidly with the frame: $\\langle\\vec L\\rangle\'=R\\langle\\vec L\\rangle$.',
      apply: () => {
        seq++;
        stopMotion();
        selectState(2, 'y:2');
        animateEuler([0, 0, 0], [0.6, 1.1, 0], 2.2);
      },
    },
    {
      title: 'About $z$, rotations are phases',
      text: 'With $\\hat n=\\hat z$, $D^{\\ell}_{m\'m}=e^{-im\\alpha}\\delta_{m\'m}$: the bars keep their lengths and only the phase dials turn, $m$ times faster for larger $m$. $J_z$ eigenstates are stationary under the rotations they generate.',
      apply: () => {
        seq++;
        stopMotion();
        selectState(2, 'rand');
        setEuler([0, 0, 0]);
        S.axis = [0, 0, 1];
        placeAxis();
        play.set(true);
      },
    },
    {
      title: 'A full turn',
      text: 'Turn by $2\\pi$ about $\\hat n$: every $c\'_{m\'}$ returns to $c_m$, since $D^{\\ell}(2\\pi)=\\id$ for integer $\\ell$. Functions on the sphere cannot carry half-integer $\\ell$; spinors can, and for them $D^{1/2}(2\\pi)=-\\id$ (<a href="#/su2">SU(2)</a>).',
      apply: () => {
        seq++;
        selectState(1, 'rand');
        S.axis = vec.normalize([0.5, -0.4, 0.77]);
        placeAxis();
        startTurn();
      },
    },
    {
      title: 'Real orbitals carry no $\\langle\\vec L\\rangle$',
      text: '$d_{xy}$ is a standing wave, $(Y_{2,-2}-Y_{22})\\,i/\\sqrt2$: equal weights in $m=\\pm2$, so $\\langle\\vec L\\rangle=0$ however it is rotated. $Y_{21}$, a travelling wave in $\\varphi$, has $\\langle L_z\\rangle=1$ and its arrow follows the rotation.',
      apply: () => {
        seq++;
        selectState(2, 'dxy');
        play.set(true);
        later(3200, () => selectState(2, 'y:1'));
      },
    },
    {
      title: '$s$ is the only invariant',
      text: '$Y_{00}$ is constant: every $R$ leaves it unchanged, $D^0(R)=1$. A state invariant under all rotations must be an $s$ state — the trivial representation.',
      apply: () => {
        seq++;
        selectState(0, 's');
        play.set(true);
      },
    },
  ]);

  // ------------------------------------------------------------------ interactions
  function userEuler(i, v) {
    seq++;
    stopMotion();
    const e = S.euler.slice();
    e[i] = v;
    setEuler(e, { syncSliders: false });
  }
  function stopMotion() {
    if (S.playing) play.set(false);
    turn = null;
    eAnim = null;
    turnMsg.innerHTML = '';
  }
  function selectState(l, sel) {
    S.l = l;
    S.sel = sel;
    if (sel === 'rand') S.seed = (S.seed % 9973) + 1;
    rebuildStateControls();
    setState(false);
  }
  let eAnim = null; // { from, to, t, dur }
  function animateEuler(from, to, dur) {
    setEuler(from);
    eAnim = { from, to, t: 0, dur };
  }
  function startTurn() {
    if (S.playing) play.set(false);
    eAnim = null;
    turn = { R0: eulerMatrix(...S.euler), t: 0, dur: 5 };
  }

  let readoutsDirty = true;
  let readoutClock = 0;
  function updateReadouts() {
    const l = S.l;
    if (l <= 1) rD.set(`\\grp{D^{${l}}(R)}=${texMatrix(D, 2)}`);
    else rD.set(`\\grp{d^{${l}}(\\beta)}=${texMatrix(wignerSmallD(l, S.euler[1]), 2)}`);
    const { axis, angle } = axisAngleOf(R);
    kv.set('Rotation angle and axis of $R$', angle < 1e-6 ? '0°' : `${fmtDeg(angle)} about (${axis.map((x) => fmt(x, 2)).join(', ')})`);
    kv.set('$\\langle\\vec L^2\\rangle=\\ell(\\ell+1)$ (invariant)', String(l * (l + 1)));
    const L = expectJ(l, c1);
    kv.set("$\\langle L_z\\rangle=\\sum m'|c'_{m'}|^2$", fmt(L[2], 3));
    kv.set("$\\sum|c'_{m'}|^2$ (unitarity)", fmt(c1.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0), 6));
    kv.set("Weight of $f'$ in its $\\ell$ (quadrature)", fmt(lcontent[l], 6));
    kv.set("$\\max|c'(D)-c'(\\text{quadrature})|$", quadErr < 1e-300 ? '0' : quadErr.toExponential(1).replace('-', '−'));
  }

  scope.frame((dt) => {
    if (eAnim) {
      eAnim.t += dt;
      const s = clamp(eAnim.t / eAnim.dur, 0, 1);
      const w = s * s * (3 - 2 * s);
      setEuler(eAnim.from.map((a, i) => a + (eAnim.to[i] - a) * w));
      if (s >= 1) eAnim = null;
    } else if (turn) {
      turn.t += dt;
      const s = clamp(turn.t / turn.dur, 0, 1);
      const ang = TAU * s;
      const Rt = s >= 1 ? turn.R0 : mat.mul(expSO3(vec.scale(S.axis, ang)), turn.R0);
      setEuler(eulerAngles(Rt));
      turnMsg.innerHTML = inlineTex(
        s >= 1
          ? `Turned by $2\\pi$: $c'=D^{${S.l}}(2\\pi)\\,c=c$ — back exactly where it started.`
          : `Turning about $\\hat n$: ${fmt((ang * 180) / Math.PI, 0)}° of 360°`,
      );
      if (s >= 1) turn = null;
    } else if (S.playing) {
      const Rn = mat.mul(expSO3(vec.scale(S.axis, SPEED * dt)), eulerMatrix(...S.euler));
      setEuler(eulerAngles(Rn));
    }
    readoutClock += dt;
    if (readoutsDirty && readoutClock > 0.12) {
      readoutClock = 0;
      readoutsDirty = false;
      updateReadouts();
    }
  });

  rebuildStateControls();
  placeAxis();
  setState(false);
  updateReadouts();

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>The surface is $r(\\hat r)=|f'(\\hat r)|$ for the rotated state $f'=\\grp{U(R)}f$; its colour is the phase $\\arg f'$ (two colours for a real
    function: blue where $f'>0$, amber where $f'<0$). It is computed from the transformed coefficients $c'=\\grp{D^{\\ell}(R)}\\,c$, not by turning
    the mesh — so the fact that it moves rigidly with the violet frame $R\\hat e_i$ <em>is</em> the identity below. The bars show
    $|c'_{m'}|^2$ (after) and $|c_m|^2$ (before) with phase dials; between them the Hinton diagram of $D^{\\ell}$, square area $\\propto|D_{m'm}|^2$.
    The grey-violet bars on the right are the weights of $f'$ in each $\\ell$, measured by quadrature of $f(R^{-1}\\hat r)$ itself.</p>
    $$\\big(\\grp{U(R)}f\\big)(\\hat r)=f(R^{-1}\\hat r)=\\sum_{m'}c'_{m'}\\,Y_{\\ell m'}(\\hat r),\\qquad c'_{m'}=\\sum_m\\grp{D^{\\ell}_{m'm}(R)}\\,c_m .$$`);
  pg.note(`<h2>The physics: rotations cannot change $\\ell$</h2>
    <p>The rotation operator on wavefunctions is $\\grp{U(R)}=e^{-i\\theta\\,\\hat n\\cdot\\vec L}$ with $\\vec L=-i\\,\\vec r\\times\\nabla$. Because
    $[\\vec L^2,\\vec L]=0$, every $U(R)$ commutes with $\\vec L^2$, so it maps the $(2\\ell+1)$-dimensional eigenspace of $\\vec L^2$ to itself: the
    harmonics $Y_{\\ell m}$ with fixed $\\ell$ form an invariant (and irreducible) subspace, and $D^{\\ell}(R)$ is the matrix of $U(R)$ on it.
    Probability moves between the $m$'s, never between $\\ell$'s.</p>
    <div class="callout physics"><span class="callout-title">Why the three $2p$ orbitals are degenerate</span>For a central potential $[H,\\vec L]=0$,
    so $H$ commutes with every $D^{\\ell}(R)$ on the multiplet and, by Schur's lemma, is a multiple of the identity there: all $2\\ell+1$ states share one
    energy. Lower the symmetry and the multiplet splits — in an octahedral crystal field the five $d$ orbitals break into $t_{2g}$ ($d_{xy},d_{yz},d_{xz}$)
    and $e_g$ ($d_{z^2},d_{x^2-y^2}$), because the cubic group does not mix those two sets.</div>`);
  pg.note(`<h2>The mathematics: Wigner matrices</h2>
    <p>With ZYZ Euler angles, $\\grp{D^{j}_{m'm}(\\alpha,\\beta,\\gamma)}=\\bra{j,m'}e^{-i\\alpha J_z}e^{-i\\beta J_y}e^{-i\\gamma J_z}\\ket{j,m}=e^{-im'\\alpha}\\,d^{j}_{m'm}(\\beta)\\,e^{-im\\gamma}$,
    and $D(R_1R_2)=D(R_1)D(R_2)$ — a homomorphism, which is what makes it a representation. For $\\ell=1$,</p>
    $$d^{1}(\\beta)=\\begin{pmatrix}\\frac{1+\\cos\\beta}2&-\\frac{\\sin\\beta}{\\sqrt2}&\\frac{1-\\cos\\beta}2\\\\ \\frac{\\sin\\beta}{\\sqrt2}&\\cos\\beta&-\\frac{\\sin\\beta}{\\sqrt2}\\\\ \\frac{1-\\cos\\beta}2&\\frac{\\sin\\beta}{\\sqrt2}&\\frac{1+\\cos\\beta}2\\end{pmatrix},$$
    <p>and $D^1(R)=U^\\dagger R\\,U$ is the ordinary $3\\times3$ rotation matrix written in the spherical basis $\\hat e_{\\pm1}=\\mp(\\hat e_x\\pm i\\hat e_y)/\\sqrt2$,
    $\\hat e_0=\\hat e_z$, because $Y_{1m}(\\hat r)=\\sqrt{3/4\\pi}\\;\\hat e_m\\!\\cdot\\hat r$: $p$ orbitals transform like a vector. The harmonics themselves are
    matrix elements of the representation, $Y_{\\ell m}(\\theta,\\varphi)=\\sqrt{\\tfrac{2\\ell+1}{4\\pi}}\\,D^{\\ell}_{m0}(\\varphi,\\theta,0)^*$
    (Condon–Shortley phases; all of these identities are checked numerically in <code>tests/reps.test.mjs</code>).</p>`);
  pg.note(`<h2>Going further</h2>
    <ul>
      <li><strong>Closed shells are round.</strong> $\\sum_m|Y_{\\ell m}(\\hat r)|^2=\\frac{2\\ell+1}{4\\pi}$ (Unsöld): the density of a filled subshell is
      rotation invariant — the reason noble gases and closed-shell ions are spherical.</li>
      <li><strong>Selection rules.</strong> The dipole operator $\\vec r$ is itself an $\\ell=1$ object, $r_q\\propto rY_{1q}$. Coupling $1\\otimes\\ell$
      (next tab) allows only $\\ell'=\\ell\\pm1$ (parity removes $\\ell'=\\ell$) and $\\Delta m=0,\\pm1$ — the Wigner–Eckart theorem in action.</li>
      <li><strong>Accidental degeneracy.</strong> In hydrogen, states with different $\\ell$ but the same $n$ are also degenerate: a larger, hidden
      SO(4) symmetry mixes different $\\ell$ — <a href="#/kepler">Kepler &amp; hidden symmetry</a>. Rotations and the $\\pi$-ball: <a href="#/so3">SO(3)</a>.</li>
    </ul>`);
}
