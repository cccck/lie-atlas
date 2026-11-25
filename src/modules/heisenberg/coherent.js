// heisenberg · tab "Coherent states": a Gaussian coherent state displaced around a loop. Left: its Wigner function in
// phase space and the overlap dial ⟨ψ_i|ψ(t)⟩; right: ψ(x) with phase colouring (or Re/Im). After the loop
// ψ_f = e^{iA} ψ_i: same blob, same |ψ|, every colour shifted by the same angle A.
import * as ui from '../../core/ui.js';
import { plot2d } from '../../core/plot2d.js';
import { withAlpha } from '../../core/theme.js';
import { fmt, texNum, texComplex } from '../../core/format.js';
import * as M from './math.js';
import { shadeSignedArea, drawLoop, drawDial, drawHueWheel, hue, loopClock } from './common.js';
import { PRESET_OPTIONS } from './loops.js';

const SQ2 = Math.SQRT1_2;

/** Loops for this tab start at the origin (the vacuum). */
function coherentPoints(kind, s) {
  if (kind === 'square') {
    const a = 2 * s;
    const out = [];
    const c = [
      [0, 0],
      [a, 0],
      [a, a],
      [0, a],
    ];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 40; j++) {
        const A = c[i];
        const B = c[(i + 1) % 4];
        out.push([A[0] + ((B[0] - A[0]) * j) / 40, A[1] + ((B[1] - A[1]) * j) / 40]);
      }
    return out;
  }
  if (kind === 'eight') return M.presetPoints('eight', 1.25 * s);
  if (kind === 'triangle') return M.anchorAt(M.presetPoints('triangle', 1.45 * s));
  return M.anchorAt(M.presetPoints('circle', 0.95 * s));
}

export function mountCoherent(pg, scope, ctx) {
  const S = (ctx.state.coherent ??= { kind: 'square', size: 1, playing: true, s: 0, mode: 'colour' });
  const clock = loopClock(S, { duration: 8, hold: 2.2 });
  let loop = M.makeLoop(coherentPoints(S.kind, S.size));
  const zs = () => loop.pts[0];

  // ------------------------------------------------------------------ view 1: phase space
  const v1 = pg.view({
    title: 'Phase space: Wigner function $W(q,p)$ of $\\grp{e^{i\\varphi}D(q,p)}\\ket{0}$',
    hint: 'scrub with the progress slider',
  });
  const p = plot2d(v1.body, scope, {
    x: [-2.3, 3.6],
    y: [-2.3, 3.3],
    pan: false,
    zoom: false,
    axisLabels: ['q', 'p'],
    draw: drawPhase,
  });

  function blob(p, c2, z, alpha = 1) {
    const col = p.color('c3');
    const X = p.sx(z[0]);
    const Y = p.sy(z[1]);
    const R = 2.1 * p.scale;
    const g = c2.createRadialGradient(X, Y, 0, X, Y, R);
    // W ∝ e^{−r²}: stops at r = 0, 0.5, 1, 1.5, 2.1
    for (const [r, w] of [
      [0, 1],
      [0.5, Math.exp(-0.25)],
      [1, Math.exp(-1)],
      [1.5, Math.exp(-2.25)],
      [2.1, 0],
    ])
      g.addColorStop(r / 2.1, withAlpha(col, 0.62 * w * alpha));
    c2.fillStyle = g;
    c2.beginPath();
    c2.arc(X, Y, R, 0, M.TAU);
    c2.fill();
  }

  function drawPhase(p, c2) {
    shadeSignedArea(p, c2, loop.pts, { alpha: 0.16 });
    const at = M.loopAt(loop, S.s);
    // initial state (ghost) and the moving coherent state
    p.circle(zs(), SQ2, { color: 'muted', width: 1.25, dash: [4, 4] });
    blob(p, c2, at.z);
    drawLoop(p, c2, loop, { color: 'grp', width: 1.5, alpha: 0.5, arrows: 4, head: 8 });
    p.line(M.loopPrefix(loop, S.s), { color: 'grp', width: 2.75 });
    p.circle(at.z, SQ2, { color: 'c3', width: 1.75 });
    p.dot(at.z, { r: 3.5, color: 'ink' });
    p.tex('\\Delta q\\,\\Delta p=\\tfrac12', [at.z[0] + SQ2 * 0.72, at.z[1] - SQ2 * 0.72], { key: 'unc', offset: [6, 10], align: 'left', small: true, color: 'c3' });
    p.tex('\\psi_i', [zs()[0] - SQ2 * 0.72, zs()[1] - SQ2 * 0.72], { key: 'psii', offset: [-4, 8], align: 'right', small: true, color: 'muted' });
    // dials: before (ψ_i itself) and the overlap now
    const r = Math.max(22, Math.min(30, p.width * 0.06));
    const ov = M.coherentOverlap(zs(), at.z, at.phi);
    const cy = r + 34;
    const cx2 = p.width - r - 16;
    const cx1 = cx2 - 2 * r - 30;
    drawDial(p, c2, { cx: cx1, cy, r, z: [1, 0], color: 'muted', label: '\\langle\\psi_i|\\psi_i\\rangle', key: 'd1', sub: 'before' });
    drawDial(p, c2, {
      cx: cx2,
      cy,
      r,
      z: ov,
      color: 'hi',
      label: '\\langle\\psi_i|\\psi(t)\\rangle',
      key: 'd2',
      sub: S.s >= 1 ? 'after' : 'now',
    });
  }

  // ------------------------------------------------------------------ view 2: the wavefunction
  const v2 = pg.view({
    title: 'Wavefunction $\\psi(x,t)$',
    hint: 'height $|\\psi|$, colour $\\arg\\psi$',
  });
  const w = plot2d(v2.body, scope, {
    x: [-3.6, 5.4],
    y: [-1.02, 1.02],
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    draw: drawPsi,
  });

  function drawPsi(w, c2) {
    const at = M.loopAt(loop, S.s);
    const [q, pp] = at.z;
    const th = at.phi;
    const z0 = zs();
    const step = 2;
    const Y0 = w.sy(0);
    if (S.mode === 'colour') {
      // top: ψ(x,t); bottom (mirrored): ψ_i(x)
      const top = [];
      const bot = [];
      for (let px = 0; px <= w.width; px += step) {
        const x = w.wx(px + step / 2);
        const a = M.coherentPsi(x, q, pp, th);
        const b = M.coherentPsi(x, z0[0], z0[1], 0);
        const ma = Math.hypot(a[0], a[1]);
        const mb = Math.hypot(b[0], b[1]);
        if (ma > 2e-3) {
          c2.fillStyle = hue(Math.atan2(a[1], a[0]));
          c2.fillRect(px, w.sy(ma), step + 0.6, Y0 - w.sy(ma));
        }
        if (mb > 2e-3) {
          c2.globalAlpha = 0.8;
          c2.fillStyle = hue(Math.atan2(b[1], b[0]));
          c2.fillRect(px, Y0, step + 0.6, w.sy(-mb) - Y0);
          c2.globalAlpha = 1;
        }
        top.push([x, ma]);
        bot.push([x, -mb]);
      }
      w.line(top, { color: 'ink2', width: 1.5 });
      w.line(bot, { color: 'muted', width: 1.25 });
      w.tex('\\psi(x,t)', [w.view.x[0], 0.86], { key: 'lt', offset: [10, 0], align: 'left', small: true });
      w.tex('\\psi_i(x)\\ \\text{(mirrored)}', [w.view.x[0], -0.86], { key: 'lb', offset: [10, 0], align: 'left', small: true, color: 'muted' });
      drawHueWheel(w, c2, w.width - 44, 64, 20, 'hw');
    } else {
      const re = [];
      const im = [];
      const ab = [];
      const ab0 = [];
      for (let px = 0; px <= w.width; px += step) {
        const x = w.wx(px);
        const a = M.coherentPsi(x, q, pp, th);
        const b = M.coherentPsi(x, z0[0], z0[1], 0);
        re.push([x, a[0]]);
        im.push([x, a[1]]);
        ab.push([x, Math.hypot(a[0], a[1])]);
        ab0.push([x, Math.hypot(b[0], b[1])]);
      }
      w.line(ab0, { color: 'muted', width: 1.25, dash: [4, 4] });
      w.line(ab.map(([x, y]) => [x, -y]), { color: 'ink2', width: 1, alpha: 0.5 });
      w.line(ab, { color: 'ink2', width: 1.5 });
      w.line(re, { color: 'c1', width: 2 });
      w.line(im, { color: 'c2', width: 2 });
      w.tex('\\mathrm{Re}\\,\\psi', [w.view.x[0], 0.86], { key: 'lt', offset: [10, 0], align: 'left', small: true, color: 'c1' });
      w.tex('\\mathrm{Im}\\,\\psi', [w.view.x[0], 0.86], { key: 'lb', offset: [62, 0], align: 'left', small: true, color: 'c2' });
      w.tex('|\\psi_i|', [z0[0], Math.pow(Math.PI, -0.25)], { key: 'l0', offset: [0, -12], small: true, color: 'muted' });
    }
    w.tex('x', [w.view.x[1], 0], { key: 'ax', offset: [-10, 12], align: 'right', small: true, color: 'muted' });
    // momentum = phase gradient: wavelength marker
    if (Math.abs(pp) > 0.35) {
      const lam = M.TAU / Math.abs(pp);
      w.tex(`\\lambda=2\\pi/p=${texNum(lam, 2)}`, [q, 0.84], { key: 'lam', small: true, color: 'ink2' });
    }
  }

  // ------------------------------------------------------------------ panel
  const sec = pg.section('Loop of displacements');
  const seg = ui.segmented(sec, {
    options: PRESET_OPTIONS,
    value: S.kind,
    onChange: (v) => {
      S.kind = v;
      changed(true);
    },
  });
  const sSize = ui.slider(sec, {
    label: 'Size',
    min: 0.4,
    max: 1.4,
    step: 0.01,
    value: S.size,
    format: (v) => '×' + fmt(v, 2),
    onInput: (v) => {
      S.size = v;
      changed(false);
    },
  });
  const sProg = ui.slider(sec, {
    label: 'Progress round the loop',
    min: 0,
    max: 1,
    step: 0.001,
    value: S.s,
    format: (v) => fmt(100 * v, 0) + ' %',
    onInput: (v) => {
      S.s = v;
      play.set(false);
      refresh();
    },
  });
  const row = ui.h('div', { class: 'btn-row' });
  sec.appendChild(row);
  const play = ui.playButton(row, { playing: S.playing, onToggle: (v) => (S.playing = v) });
  ui.button(row, {
    label: 'Restart',
    onClick: () => {
      clock.restart();
      play.set(true);
      refresh();
    },
  });
  ui.segmented(sec, {
    label: 'Show $\\psi(x)$ as',
    options: [
      { value: 'colour', label: 'Phase colour' },
      { value: 'reim', label: 'Re, Im, $|\\psi|$' },
    ],
    value: S.mode,
    onChange: (v) => {
      S.mode = v;
      w.invalidate();
    },
  });

  const secR = pg.section('State');
  const out = ui.readout(secR, { label: 'Displaced vacuum after the steps so far' });
  const kv = ui.keyValue(secR, [
    ['$\\langle x\\rangle,\\ \\langle p\\rangle$', ''],
    ['$\\Delta x\\,\\Delta p$', ''],
    ['$|\\langle\\psi_i|\\psi(t)\\rangle|=e^{-|\\Delta z|^2/4}$', ''],
    ['$\\arg\\langle\\psi_i|\\psi(t)\\rangle$', ''],
    ['enclosed area $\\brk{A}$', ''],
  ]);
  kv.set('$\\Delta x\\,\\Delta p$', `$${texNum(SQ2, 3)}\\times${texNum(SQ2, 3)}=\\tfrac12$`);
  const outF = ui.readout(secR, { label: 'After the full loop' });

  const secL = pg.section('Legend');
  ui.legend(secL, [
    { color: 'c3', label: 'Wigner function and its $1\\sigma$ disc, $\\Delta q\\Delta p=\\frac12$' },
    { color: 'grp', label: 'loop of displacements $\\grp{D(\\delta z)}$' },
    { color: 'brk', label: 'enclosed area (counter-clockwise $+$)' },
    { color: 'c1', label: 'clockwise area $-$; $\\mathrm{Re}\\,\\psi$' },
    { color: 'c2', label: '$\\mathrm{Im}\\,\\psi$' },
    { color: 'hi', label: 'overlap $\\langle\\psi_i|\\psi(t)\\rangle$', dot: true },
  ]);

  ui.experiments(pg.section('Try this'), [
    {
      title: 'Back home, up to a phase',
      text: 'Let the square finish. The blob, $|\\psi(x)|$ and every expectation value are back to the start — but compare the colours above and below the axis: every point of $\\psi$ has turned by the same angle $\\brk{A}=4$. That global phase $e^{i\\brk{A}}$ is the only memory of the loop.',
      apply: () => setPreset('square', 1),
    },
    {
      title: 'Momentum is a phase gradient',
      text: 'Stop at the top-right corner of the square: the $p$-kick has not moved the hump at all, but the colours now cycle along $x$ with wavelength $2\\pi/p$ — that is $e^{ipx}$. Only the following $q$-steps move the hump. Try the Re/Im display as well.',
      apply: () => {
        setPreset('square', 1);
        play.set(false);
        S.s = 0.5;
        refresh();
      },
    },
    {
      title: 'Watch the overlap dial',
      text: '$\\langle\\psi_i|\\psi(t)\\rangle$ shrinks like $e^{-|\\Delta z|^2/4}$ while the states separate, then returns to the unit circle — rotated by $\\brk{A}$. An interferometer that recombines a moved and an unmoved copy measures exactly this (geometric phase gates in ion traps use it to entangle qubits).',
      apply: () => setPreset('circle', 1.3),
    },
    {
      title: 'Figure-eight: truly nothing',
      text: 'Equal and opposite lobes: the overlap comes back to exactly $1$. The state has been pushed far round phase space and returned without any trace, because the net enclosed area vanishes.',
      apply: () => setPreset('eight', 1),
    },
    {
      title: 'Area $2\\pi$: invisible',
      text: 'A square of side $\\sqrt{2\\pi}$ encloses $2\\pi\\hbar=h$: the colours come back unchanged. Phase-space areas only matter modulo $h$.',
      apply: () => setPreset('square', Math.sqrt(2 * Math.PI) / 2),
    },
  ]);

  // ------------------------------------------------------------------ notes
  pg.note(`<h2>What you see</h2>
    <p>With $\\hbar=m=\\omega=1$ the oscillator ground state is $\\psi_0(x)=\\pi^{-1/4}e^{-x^2/2}$, a minimum-uncertainty
    Gaussian with $\\Delta x=\\Delta p=1/\\sqrt2$. Displacing it gives a <b>coherent state</b>,</p>
    $$\\psi(x,t)=e^{i\\varphi(t)}\\,(D(q,p)\\psi_0)(x)=\\pi^{-1/4}\\,e^{i\\varphi(t)}\\,e^{ipx-iqp/2}\\,e^{-(x-q)^2/2},\\qquad
      W(q^\\prime,p^\\prime)=\\tfrac1\\pi e^{-(q^\\prime-q)^2-(p^\\prime-p)^2}.$$
    <p>The Wigner function (teal) is moved rigidly — translations do not distort it — and $\\varphi(t)=\\tfrac12\\int(q\\,dp-p\\,dq)$
    is the same lift height as in the first tab. On the right the height of each bar is $|\\psi|$ and its colour is
    $\\arg\\psi$ (wheel); the lower half shows the initial state for comparison. After a closed loop
    $\\psi_{\\rm f}=e^{i\\brk{A}}\\psi_{\\rm i}$: the same shape, all colours shifted by one common angle.</p>
    <div class="callout intuition"><span class="callout-title">Intuition</span>A global phase is invisible in any single
    measurement of the state, so the loop seems to do nothing. It becomes visible when the moved state interferes with one
    that stayed home — the overlap dial — exactly as in Aharonov–Bohm (third tab).</div>`);

  pg.note(`<h2>The physics</h2>
    <p>Coherent states are the quantum states of a classical force: $H=-F(t)\\,x$ (or a classical current coupled to a
    field mode) produces displacements, so lasers, driven oscillators and trapped ions pushed by light all move along
    loops like these. The minimum uncertainty $\\Delta x\\Delta p=\\tfrac12$ is preserved at every instant. The overlap of two
    coherent states is</p>
    $$\\langle D(a)\\psi_0|D(b)\\psi_0\\rangle=e^{-|b-a|^2/4}\\;e^{\\frac i2\\,\\omega(a,b)},$$
    <p>so non-orthogonal states far apart in phase space are nearly orthogonal, and the phase of the overlap is the signed area
    of the triangle $(0,a,b)$. Around a closed loop all these triangle phases add up to $\\brk{A}$.</p>
    <div class="callout physics"><span class="callout-title">Geometric phase gates</span>In an ion trap a laser force that
    depends on the internal state $\\ket{\\uparrow}$ or $\\ket{\\downarrow}$ drives the motion around a loop in phase space and
    back. The motion ends unchanged, but the two internal states pick up phases proportional to their enclosed areas — a
    controllable, motion-insensitive two-qubit gate built from the Heisenberg group.</div>`);

  pg.note(`<h2>The mathematics</h2>
    <p>Coherent states form the orbit of $\\ket0$ under the Schrödinger representation of $H_3$ (Perelomov). The orbit in the
    projective Hilbert space is the plane $H_3/U(1)\\cong\\R^2$ with the symplectic form $dq\\wedge dp$, and the phase acquired by
    the displacement sequence is the enclosed symplectic area. In complex form $\\alpha=(q+ip)/\\sqrt2$, $D(\\alpha)=e^{\\alpha a^\\dagger-\\alpha^*a}$
    and $D(\\alpha)D(\\beta)=e^{(\\alpha\\beta^*-\\alpha^*\\beta)/2}D(\\alpha+\\beta)$.</p>
    <p>A remark for the careful: $e^{i\\brk{A}}$ is the total phase of the driven state. Its Berry–Pancharatnam (geometric) part,
    from the connection $i\\langle z|dz\\rangle=-\\tfrac12(q\\,dp-p\\,dq)$, is $-\\brk{A}$; the remaining $2\\brk{A}$ is the
    dynamical phase $-\\int\\langle H_t\\rangle dt$ of the driving Hamiltonian $H_t=\\dot q\\,p-\\dot p\\,x$. Both are fixed by the area.
    The linear symplectic maps of <a href="#/sp2">Sp(2,ℝ)</a> squeeze and rotate the blob instead of translating it — together with
    $H_3$ they form the Jacobi group of all quadratic Hamiltonians.</p>`);

  // ------------------------------------------------------------------ state
  function setPreset(kind, size) {
    S.kind = kind;
    S.size = size;
    seg.set(kind, { silent: true });
    sSize.set(size, { silent: true });
    changed(true);
  }
  function changed(restart) {
    loop = M.makeLoop(coherentPoints(S.kind, S.size));
    if (restart) {
      clock.restart();
      play.set(true);
    }
    const A = loop.area;
    outF.set(
      `\\psi_{\\rm f}=e^{\\,i\\brk{A}}\\,\\psi_{\\rm i},\\quad \\brk{A}=${texNum(A, 3)},\\quad e^{\\,i\\brk{A}}=${texComplex({ re: Math.cos(A), im: Math.sin(A) }, 3)}`,
    );
    kv.set('enclosed area $\\brk{A}$', fmt(A, 3));
    refresh();
  }
  function refresh() {
    sProg.set(S.s, { silent: true });
    const at = M.loopAt(loop, S.s);
    const ov = M.coherentOverlap(zs(), at.z, at.phi);
    out.set(
      `\\psi(t)=e^{\\,i\\varphi}\\,\\grp{D(q,p)}\\,\\psi_0,\\quad (q,p)=(${texNum(at.z[0], 2)},${texNum(at.z[1], 2)}),\\ \\varphi=${texNum(at.phi, 2)}`,
    );
    kv.set('$\\langle x\\rangle,\\ \\langle p\\rangle$', `${fmt(at.z[0], 2)}, ${fmt(at.z[1], 2)}`);
    kv.set('$|\\langle\\psi_i|\\psi(t)\\rangle|=e^{-|\\Delta z|^2/4}$', fmt(Math.hypot(ov[0], ov[1]), 3));
    kv.set('$\\arg\\langle\\psi_i|\\psi(t)\\rangle$', fmt(Math.atan2(ov[1], ov[0]), 3));
    p.invalidate();
    w.invalidate();
  }

  scope.frame((dt) => {
    if (!play.playing) return;
    clock.step(dt);
    refresh();
  });
  changed(false);
}
