// heisenberg · tab "Magnetic flux": a charge in a uniform field — transport along a then b differs from b then a by
// e^{iqΦ} (left); the Aharonov–Bohm double slit with a thin solenoid, fringes shifted by qΦ and periodic in the flux
// quantum 2π/q (right).
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { withAlpha } from '../../core/theme.js';
import { fmt, texNum, texComplex } from '../../core/format.js';
import * as M from './math.js';
import { shadeSignedArea, arrowHead, drawDial } from './common.js';

const TAU = M.TAU;
const O = [-1.35, -1.25]; // base point of the parallelogram
const LIM = 2.7;
// Aharonov–Bohm geometry (drawing units, not to scale)
const SRC = [-2.8, 0];
const D_SLIT = 1.1;
const L_SCR = 4;
const KD_L = TAU / 1.1; // fringe spacing 1.1
const SOL = [0.55, 0];

export function mountFlux(pg, scope, ctx) {
  const S = (ctx.state.flux ??= { qB: 1.2, a: [2.1, 0.25], b: [0.45, 1.9], f: 0.3, playing: true });

  // ------------------------------------------------------------------ view 1: uniform field
  const v1 = pg.view({
    title: 'Uniform $B$: transport along $\\alg{a}$ then $\\alg{b}$, or $\\alg{b}$ then $\\alg{a}$',
    hint: 'drag the tips of $\\alg{a}$ and $\\alg{b}$',
  });
  const p = plot2d(v1.body, scope, {
    x: [-LIM, LIM],
    y: [-LIM - 0.1, LIM + 0.1],
    pan: false,
    zoom: false,
    axisLabels: ['x', 'y'],
    draw: drawField,
  });
  const clampV = (v) => [Math.max(-LIM, Math.min(LIM, v[0])), Math.max(-LIM, Math.min(LIM, v[1]))];
  p.handle({
    get: () => [O[0] + S.a[0], O[1] + S.a[1]],
    set: (pt) => {
      const q = clampV(pt);
      S.a = [q[0] - O[0], q[1] - O[1]];
      updateField();
    },
    color: 'alg',
    label: '\\alg{a}',
    labelOffset: [14, 14],
  });
  p.handle({
    get: () => [O[0] + S.b[0], O[1] + S.b[1]],
    set: (pt) => {
      const q = clampV(pt);
      S.b = [q[0] - O[0], q[1] - O[1]];
      updateField();
    },
    color: 'alg',
    label: '\\alg{b}',
    labelOffset: [-14, -14],
  });

  function drawField(p, c2) {
    const qB = S.qB;
    // field symbols ⊙ (qB > 0) / ⊗ (qB < 0)
    if (Math.abs(qB) > 0.02) {
      const st = 0.5;
      const vw = p.view;
      c2.strokeStyle = p.color('muted');
      c2.fillStyle = p.color('muted');
      c2.lineWidth = 1;
      c2.globalAlpha = 0.3 + 0.3 * Math.min(1, Math.abs(qB) / 2);
      for (let x = Math.ceil(vw.x[0] / st) * st + st / 2; x < vw.x[1]; x += st)
        for (let y = Math.ceil(vw.y[0] / st) * st + st / 2; y < vw.y[1]; y += st) {
          const X = p.sx(x);
          const Y = p.sy(y);
          c2.beginPath();
          c2.arc(X, Y, 3.5, 0, TAU);
          c2.stroke();
          if (qB > 0) {
            c2.beginPath();
            c2.arc(X, Y, 1.1, 0, TAU);
            c2.fill();
          } else {
            c2.beginPath();
            c2.moveTo(X - 2.4, Y - 2.4);
            c2.lineTo(X + 2.4, Y + 2.4);
            c2.moveTo(X - 2.4, Y + 2.4);
            c2.lineTo(X + 2.4, Y - 2.4);
            c2.stroke();
          }
        }
      c2.globalAlpha = 1;
      // cells of one flux quantum each: area 2π/|qB|
      const ell = Math.sqrt(TAU / Math.abs(qB));
      if (ell > 0.3) {
        const lines = [];
        for (let i = -20; i <= 20; i++) {
          const x = O[0] + i * ell;
          const y = O[1] + i * ell;
          if (x > -LIM - 0.5 && x < LIM + 0.5) lines.push([[x, -LIM - 1], [x, LIM + 1]]);
          if (y > -LIM - 0.5 && y < LIM + 0.5) lines.push([[-LIM - 1, y], [LIM + 1, y]]);
        }
        for (const l of lines) p.line(l, { color: 'hi', width: 1, alpha: 0.45, dash: [2, 5] });
      }
    }
    const A = [O[0] + S.a[0], O[1] + S.a[1]];
    const Bp = [O[0] + S.b[0], O[1] + S.b[1]];
    const E = [O[0] + S.a[0] + S.b[0], O[1] + S.a[1] + S.b[1]];
    shadeSignedArea(p, c2, [O, A, E, Bp], { alpha: 0.2 });
    // path 1: a then b (solid); path 2: b then a (dashed)
    p.line([O, A, E], { color: 'grp', width: 2.75 });
    p.line([O, Bp, E], { color: 'grp', width: 2.25, dash: [7, 5] });
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    const dir = (u, v) => {
      const d = [v[0] - u[0], v[1] - u[1]];
      const n = Math.hypot(d[0], d[1]) || 1;
      return [d[0] / n, d[1] / n];
    };
    arrowHead(p, c2, mid(O, A), dir(O, A), 'grp', 11);
    arrowHead(p, c2, mid(A, E), dir(A, E), 'grp', 11);
    arrowHead(p, c2, mid(O, Bp), dir(O, Bp), 'grp', 10);
    arrowHead(p, c2, mid(Bp, E), dir(Bp, E), 'grp', 10);
    // labels just outside the parallelogram, on the side of each path
    const ctr = [(O[0] + E[0]) / 2, (O[1] + E[1]) / 2];
    const outward = (m) => {
      const d = [m[0] - ctr[0], m[1] - ctr[1]];
      const n = Math.hypot(d[0], d[1]) || 1;
      return [(d[0] / n) * 0.34, (d[1] / n) * 0.34];
    };
    const m1 = mid(A, E);
    const o1 = outward(m1);
    p.tex('\\grp{\\psi_{a\\to b}}', [m1[0] + o1[0], m1[1] + o1[1]], { key: 'p1', small: true });
    const m2 = mid(Bp, E);
    const o2 = outward(m2);
    p.tex('\\grp{\\psi_{b\\to a}}', [m2[0] + o2[0], m2[1] + o2[1]], { key: 'p2', small: true });
    p.dot(O, { r: 4.5, color: 'surface', stroke: 'ink', width: 2 });
    p.dot(E, { r: 4.5, color: 'ink' });
    p.tex('\\text{start}', O, { key: 'st', offset: [-10, 14], align: 'right', small: true });
    const phiQ = S.qB * M.omega(S.a, S.b);
    p.tex(`q\\Phi=${texNum(phiQ, 2)}`, ctr, { key: 'flux', small: true, color: Math.abs(phiQ) < 1e-9 ? 'ink2' : M.omega(S.a, S.b) > 0 ? 'brk' : 'c1' });
    const r = Math.max(24, Math.min(32, p.width * 0.065));
    drawDial(p, c2, {
      cx: p.width - r - 18,
      cy: r + 34,
      r,
      angle: phiQ,
      label: '\\psi_{a\\to b}/\\psi_{b\\to a}',
      key: 'fd',
      sub: 'relative phase',
    });
  }

  // ------------------------------------------------------------------ view 2: Aharonov–Bohm
  const v2 = pg.view({
    title: 'Aharonov–Bohm: flux $\\Phi$ in a thin solenoid, $B=0$ on both paths',
    hint: 'not to scale',
  });
  const w = plot2d(v2.body, scope, {
    x: [-3.3, 6.0],
    y: [-3.2, 3.2],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw: drawAB,
  });

  function drawAB(w, c2) {
    const qPhi = TAU * S.f;
    const vw = w.view;
    // barrier with two slits
    const sw = 0.09;
    const ys = D_SLIT / 2;
    w.line([[0, vw.y[0]], [0, -ys - sw]], { color: 'ink2', width: 3 });
    w.line([[0, -ys + sw], [0, ys - sw]], { color: 'ink2', width: 3 });
    w.line([[0, ys + sw], [0, vw.y[1]]], { color: 'ink2', width: 3 });
    // screen
    w.line([[L_SCR, vw.y[0]], [L_SCR, vw.y[1]]], { color: 'ink2', width: 2 });
    // source
    w.dot(SRC, { r: 5, color: 'ink' });
    w.tex('\\text{source}', SRC, { key: 'src', offset: [0, 18], small: true });
    w.tex('\\text{screen}', [L_SCR, vw.y[0]], { key: 'scr', offset: [0, -12], small: true, color: 'muted' });
    // the bright fringe nearest the centre, and the two paths to it
    const n = Math.round(qPhi / TAU);
    const yStar = (TAU * n - qPhi) / KD_L;
    const up = [0, ys];
    const dn = [0, -ys];
    const tgt = [L_SCR, yStar];
    w.line([SRC, up, tgt], { color: 'grp', width: 2.25 });
    w.line([SRC, dn, tgt], { color: 'grp', width: 2.25, dash: [7, 5] });
    w.dot(tgt, { r: 4, color: 'hi' });
    w.tex('1', [-1.4, 0.55 * ys + 0.12], { key: 'pa1', small: true, color: 'grp' });
    w.tex('2', [-1.4, -0.55 * ys - 0.12], { key: 'pa2', small: true, color: 'grp' });
    // solenoid: flux out of the plane, field confined inside
    const rr = 0.13;
    w.circle(SOL, rr, { fill: 'brk', fillAlpha: Math.min(0.85, 0.25 + 0.4 * Math.abs(S.f)), color: 'brk', width: 1.5 });
    w.tex('\\Phi', SOL, { key: 'solL', offset: [0, -20], small: true, color: 'brk' });
    // vector potential circulates outside (A = Φ/2πr φ̂), B = 0 there
    if (Math.abs(S.f) > 0.01) {
      const R = 0.5;
      const pts = [];
      for (let i = 0; i <= 64; i++) pts.push([SOL[0] + R * Math.cos((TAU * i) / 64), SOL[1] + R * Math.sin((TAU * i) / 64)]);
      w.line(pts, { color: 'alg', width: 1.25, alpha: 0.6 });
      const sgn = Math.sign(S.f);
      for (let i = 0; i < 4; i++) {
        const a = (TAU * (i + 0.125)) / 4;
        arrowHead(w, c2, [SOL[0] + R * Math.cos(a), SOL[1] + R * Math.sin(a)], [-sgn * Math.sin(a), sgn * Math.cos(a)], 'alg', 8, 0.85);
      }
      w.tex('\\alg{A}\\ne0,\\ B=0', [SOL[0] + 0.62, SOL[1] - 0.55], { key: 'Alab', small: true, align: 'left', color: 'alg' });
    }
    // intensity on the screen: reference (Φ = 0, dashed) and actual
    const amp = 1.45;
    const ref = [];
    const cur = [];
    for (let i = 0; i <= 400; i++) {
      const y = vw.y[0] + ((vw.y[1] - vw.y[0]) * i) / 400;
      ref.push([L_SCR + amp * M.abIntensity(y, KD_L, 0), y]);
      cur.push([L_SCR + amp * M.abIntensity(y, KD_L, qPhi), y]);
    }
    w.polygon([[L_SCR, vw.y[0]], ...cur, [L_SCR, vw.y[1]]], { fill: 'hi', alpha: 0.22 });
    w.line(ref, { color: 'muted', width: 1.25, dash: [4, 4] });
    w.line(cur, { color: 'hi', width: 2 });
    w.tex('I(y)', [L_SCR + amp, vw.y[1]], { key: 'Iy', offset: [0, 14], small: true, color: 'hi' });
    w.tex('\\Phi=0', [L_SCR + amp, vw.y[0]], { key: 'I0', offset: [-6, -14], small: true, color: 'muted' });
  }

  // ------------------------------------------------------------------ panel
  const secB = pg.section('Uniform field');
  const sQB = ui.slider(secB, {
    label: 'Charge × field $qB$ ($\\odot$: out of the plane)',
    min: -3,
    max: 3,
    step: 0.01,
    value: S.qB,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      S.qB = v;
      updateField();
    },
  });
  const outB = ui.readout(secB, { label: 'The two orders differ by the enclosed flux' });
  const kvB = ui.keyValue(secB, [
    ['oriented area $\\alg{a}\\times\\alg{b}$', ''],
    ['$q\\Phi=qB\\,(\\alg{a}\\times\\alg{b})$', ''],
    ['flux quanta $\\Phi/\\Phi_0=q\\Phi/2\\pi$', ''],
    ['states per Landau level inside', ''],
  ]);

  const secA = pg.section('Aharonov–Bohm');
  const sF = ui.slider(secA, {
    label: 'Solenoid flux $\\Phi/\\Phi_0$, $\\;\\Phi_0=2\\pi/q=h/q$',
    min: -2,
    max: 2,
    step: 0.005,
    value: S.f,
    format: (v) => fmt(v, 2),
    onInput: (v) => {
      S.f = v;
      play.set(false);
      updateAB();
    },
  });
  const rowA = ui.h('div', { class: 'btn-row' });
  secA.appendChild(rowA);
  const play = ui.playButton(rowA, { playing: S.playing, labels: ['▶ Ramp the flux', '❚❚ Pause'], onToggle: (v) => (S.playing = v) });
  ui.button(rowA, {
    label: '$\\Phi\\to\\Phi+\\Phi_0$',
    onClick: () => {
      play.set(false);
      setF(S.f + 1 > 2 ? S.f - 1 : S.f + 1);
    },
  });
  const outA = ui.readout(secA, { label: 'Fringes on the screen' });
  const kvA = ui.keyValue(secA, [
    ['AB phase $q\\Phi$ mod $2\\pi$', ''],
    ['fringe shift (in fringe spacings)', ''],
  ]);

  const secL = pg.section('Legend');
  ui.legend(secL, [
    { color: 'alg', label: 'translation vectors $\\alg{a},\\alg{b}$; vector potential $\\alg{A}$' },
    { color: 'grp', label: 'paths: solid $a$ then $b$ (or 1), dashed $b$ then $a$ (or 2)' },
    { color: 'brk', label: 'enclosed flux, counter-clockwise; solenoid' },
    { color: 'hi', label: 'flux-quantum cells; intensity $I(y)$' },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'One flux quantum: they commute again',
      text: 'Make the parallelogram enclose exactly one flux quantum, $q\\Phi=2\\pi$ (one dashed cell of area): the dial is back at $1$ and the two orders of translation agree. Magnetic translations of a crystal commute — and Bloch\u2019s theorem survives — only when the flux per unit cell is a rational multiple of $\\Phi_0$ (Hofstadter\u2019s butterfly).',
      apply: () => setField(1, [2.2, 0], [0.3, TAU / 2.2]),
    },
    {
      title: 'Fringes move, yet $B=0$ on the paths',
      text: 'Ramp the flux. Both paths run through field-free space, but the interference pattern slides: the lower path, which has the flux on its left, gains $q\\Phi$ on the upper one. The physical object is the holonomy $e^{iq\\oint A\\cdot dl}$, not the local field.',
      apply: () => {
        setF(0);
        play.set(true);
      },
    },
    {
      title: 'One flux quantum later',
      text: 'Step $\\Phi\\to\\Phi+\\Phi_0$: the pattern lands exactly on the $\\Phi=0$ reference (dashed). Interference measures the flux only modulo $\\Phi_0=h/q$ — the phase lives on the circle $U(1)$. In superconductors the charge is $2e$ and fluxoids come in $h/2e$.',
      apply: () => {
        play.set(false);
        setF(1);
      },
    },
    {
      title: 'Half a flux quantum',
      text: 'At $\\Phi=\\Phi_0/2$ the two paths arrive with opposite signs at the centre of the screen: a dark fringe where there was a bright one, $I(0)\\propto\\cos^2(\\pi/2)=0$.',
      apply: () => {
        play.set(false);
        setF(0.5);
      },
    },
    {
      title: 'Landau degeneracy: one state per cell',
      text: 'Strong field $qB=3$, large parallelogram: the dashed cells, each of area $2\\pi/qB$, count the states of one Landau level that fit inside, $N=\\Phi/\\Phi_0$. The guiding centre $(X,Y)$ is a phase-space pair with $[X,Y]=-i/qB$, so each state needs that much area.',
      apply: () => setField(3, [2.6, 0.1], [0.2, 2.4]),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p><b>Left.</b> A charge $q$ in a uniform field $B$ ($\\odot$: out of the plane for $qB>0$). Carrying its quantum state
    along $\\alg{a}$ and then $\\alg{b}$, or along $\\alg{b}$ and then $\\alg{a}$, ends at the same point — but the two amplitudes differ by
    the flux through the parallelogram:</p>
    $$\\grp{\\psi_{a\\to b}}=e^{\\,iq\\Phi}\\,\\grp{\\psi_{b\\to a}},\\qquad \\Phi=B\\,(\\alg{a}\\times\\alg{b}),$$
    <p>so a counter-clockwise loop picks up $e^{+iq\\Phi}$ — the exact analogue of $e^{+i\\brk{A}}$ in phase space, with area
    replaced by flux. The dashed cells each hold one flux quantum $\\Phi_0=2\\pi/q$ ($=h/q$).</p>
    <p><b>Right.</b> The Aharonov–Bohm double slit. The field is confined to a thin solenoid between the slits; outside it $B=0$ but
    $\\vec A=\\frac{\\Phi}{2\\pi r}\\hat\\varphi\\neq0$. Path 2 passes with the flux on its left and gains $q\\Phi$ relative to path 1, so</p>
    $$I(y)\\propto\\cos^2\\!\\Bigl(\\frac{kd\\,y}{2L}+\\frac{q\\Phi}2\\Bigr),$$
    <p>shifted by $q\\Phi$ and periodic in $\\Phi$ with period $\\Phi_0$. The dashed curve is $\\Phi=0$.</p>`);

  pg.note(`<h2>The physics</h2>
    <p>Minimal coupling replaces $p$ by the kinetic momentum $\\pi=p-qA$, and in a field the two components no longer commute:</p>
    $$[\\pi_x,\\pi_y]=iqB .$$
    <p>This is $[x,p]=i$ again with $\\hbar\\to qB$: covariant translations $e^{-i\\,a\\cdot\\pi}$ (parallel transport with
    the phase $e^{iq\\int A\\cdot dl}$) form a Heisenberg group, and around a closed loop they give the holonomy
    $e^{\\,iq\\oint A\\cdot dl}=e^{iq\\Phi}$ (Stokes). Aharonov and Bohm (1959) pointed out that this phase is observable even when the
    particle never meets the field; it was confirmed with electron holography around shielded toroidal magnets (Tonomura, 1986).</p>
    <div class="callout physics"><span class="callout-title">Landau levels</span>$H=\\pi^2/2m$ with $[\\pi_x,\\pi_y]=iqB$ is a
    harmonic oscillator: $E_n=\\omega_c(n+\\tfrac12)$, $\\omega_c=|q|B/m$. The guiding centre $X=x+\\pi_y/qB$, $Y=y-\\pi_x/qB$
    commutes with $\\pi$ and $H$ and obeys
    $$[X,Y]=-\\frac{i}{qB}\\qquad(=i\\ell_B^2\\ \\text{for an electron},\\ \\ell_B^2=\\hbar/eB),$$
    so $(X,Y)$ is a second phase-space pair. Each state of a Landau level needs area $2\\pi\\ell_B^2$: the degeneracy is
    $N=|q|B\\,S/2\\pi=\\Phi/\\Phi_0$, one state per flux quantum — the counting behind the quantum Hall effect.</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>The <b>magnetic translations</b> $T(a)=e^{-i\\,a\\cdot K}$, generated by $K=\\pi-q\\,\\vec r\\times\\vec B=qB\\,(-Y,X)$, commute with
    $H$ and form a projective representation of $\\R^2$:</p>
    $$T(a)T(b)=e^{\\frac i2 qB\\,(a\\times b)}\\,T(a+b),\\qquad T(a)T(b)=e^{\\,iqB\\,(a\\times b)}\\,T(b)T(a).$$
    <p>(They carry the opposite sign to the covariant translations because guiding-centre phase space has the opposite orientation.)
    The cocycle $e^{\\frac i2qB\\,a\\times b}$ is exactly the polarised group law of $H_3$ — the group of the first tab, with
    $(q,p)\\to(x,y)$ and $\\hbar\\to1/qB$. Geometrically $A$ is a connection on a $U(1)$ bundle over the plane with constant curvature
    $F=dA=B\\,dx\\wedge dy$; the Heisenberg group is the group of symmetries of this bundle, and its commutator is the curvature. On a
    lattice, $T(a)$ and $T(b)$ commute iff $q\\Phi(a,b)\\in2\\pi\\Z$. See <a href="#/u1">U(1)</a> for gauge phases and charge
    quantisation, and <a href="#/loops">commutators as small loops</a> for holonomy as a commutator.</p>`);

  // ------------------------------------------------------------------ state
  function setField(qB, a, b) {
    S.qB = qB;
    S.a = a.slice();
    S.b = b.slice();
    sQB.set(qB, { silent: true });
    updateField();
  }
  function setF(f) {
    S.f = Math.max(-2, Math.min(2, f));
    sF.set(S.f, { silent: true });
    updateAB();
  }
  function updateField() {
    const ab = M.omega(S.a, S.b);
    const qPhi = S.qB * ab;
    outB.set(
      `\\grp{\\psi_{a\\to b}}=e^{\\,iq\\Phi}\\,\\grp{\\psi_{b\\to a}},\\quad e^{\\,iq\\Phi}=${texComplex({ re: Math.cos(qPhi), im: Math.sin(qPhi) }, 3)}`,
    );
    kvB.set('oriented area $\\alg{a}\\times\\alg{b}$', fmt(ab, 3));
    kvB.set('$q\\Phi=qB\\,(\\alg{a}\\times\\alg{b})$', fmt(qPhi, 3));
    kvB.set('flux quanta $\\Phi/\\Phi_0=q\\Phi/2\\pi$', fmt(qPhi / TAU, 3));
    kvB.set('states per Landau level inside', '≈ ' + fmt(Math.abs(qPhi) / TAU, 2));
    p.invalidate();
  }
  function updateAB() {
    const qPhi = TAU * S.f;
    outA.set(`I(y)\\propto\\cos^2\\!\\Bigl(\\tfrac{kd\\,y}{2L}+\\tfrac{q\\Phi}{2}\\Bigr),\\quad q\\Phi=2\\pi\\times${texNum(S.f, 2)}`);
    kvA.set('AB phase $q\\Phi$ mod $2\\pi$', fmt(M.wrapPi(qPhi), 3));
    const sh = -S.f - Math.round(-S.f);
    kvA.set('fringe shift (in fringe spacings)', `${fmt(sh, 2)} (period 1 in $\\Phi/\\Phi_0$)`);
    w.invalidate();
  }

  scope.frame((dt) => {
    if (!play.playing) return;
    let f = S.f + dt * 0.12;
    if (f > 2) f -= 2;
    S.f = f;
    sF.set(f, { silent: true });
    updateAB();
  });

  updateField();
  updateAB();
}
