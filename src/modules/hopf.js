// S^3 → S^2 — Hopf fibration & Berry phase (route #/hopf).
// Tab "Fibres":      Bloch sphere (base) · fibres e^{iχ}s(n) in R^3 by stereographic projection · components α, β.
// Tab "Berry phase": loop of the field direction on S^2 · its horizontal lift in S^3 · phase dial.
// Maths in ./hopf/math.js; the two tabs in ./hopf/fibres.js and ./hopf/berry.js.

import * as ui from '../core/ui.js';
import { mountFibres } from './hopf/fibres.js';
import { mountBerry } from './hopf/berry.js';

export default function mount(root, ctx) {
  const S = ctx.state;
  S.tab ??= 'fibres';
  S.fib ??= {};
  S.berry ??= {};

  ui.css(
    ctx.scope,
    `.m-hopf{--hopf-gap:12px;--hopf-sm:calc((var(--view-h) - var(--hopf-gap)) / 2)}
     .m-hopf .stage.hopf-stage{grid-template-columns:minmax(0,0.74fr) minmax(0,1.26fr);gap:var(--hopf-gap)}
     .m-hopf .hopf-tall{grid-row:span 2}
     .m-hopf .hopf-cap{font-size:11.5px;color:var(--muted);line-height:1.35;margin:4px 0 0}
     .m-hopf .hopf-badge{font-size:12px;white-space:normal;line-height:1.35}
     .m-hopf .hopf-ovl{font-size:12px;line-height:1.4;max-width:250px}
     .m-hopf .hopf-ovl .k{color:var(--muted)}
     .m-hopf .kv td:last-child{white-space:nowrap}
     @media (max-width: 900px){.m-hopf{--hopf-sm:320px}.m-hopf .hopf-tall{grid-row:auto}}`,
  );

  const pg = ctx.page({
    lede:
      'A qubit state $\\psi=(\\alpha,\\beta)\\in\\C^2$ with $|\\alpha|^2+|\\beta|^2=1$ is a point of the 3-sphere $\\grp{S^3}$. ' +
      'Physics cannot see the global phase, so physical states form $S^3/U(1)=S^2$, the Bloch sphere — and every point of it is a whole <b>circle</b> of phases in $S^3$. ' +
      'Any two of these circles are linked once: that twist is the Berry phase, and the topology of the Dirac monopole.',
    columns: 2,
  });
  pg.el.classList.add('m-hopf');
  pg.stage.classList.add('hopf-stage');

  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'fibres',
        label: 'Fibres',
        columns: 2,
        mount: (p, scope) => mountFibres(p, scope, ctx, S.fib),
      },
      {
        id: 'berry',
        label: 'Berry phase',
        columns: 2,
        lede:
          'Turn a magnetic field slowly around a closed loop $C$ and a spin-½ that follows it comes back to the same physical state — but its vector picks up a phase. ' +
          'The state slides along the fibres of $S^3\\to S^2$ without ever moving <i>along</i> them (parallel transport), so the loop on the Bloch sphere lifts to an open path in $S^3$: ' +
          'the gap is the Berry phase $\\gamma=-\\tfrac12\\,\\Omega(C)$, minus half the enclosed solid angle.',
        mount: (p, scope) => mountBerry(p, scope, ctx, S.berry),
      },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
