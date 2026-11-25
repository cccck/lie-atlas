// SU(2) — spin-½ and the double cover of SO(3). Three tabs:
//   (a) Dirac's string trick: a cube tethered by 8 strings; 2π twist stays tangled, 4π untangles.
//   (b) SU(2) → SO(3): the 2π-ball (S³ in exponential coordinates) and the π-ball (RP³); contracting the 4π loop.
//   (c) Spin in a magnetic field: Larmor precession on the Bloch sphere, spinor phasors, neutron interferometry.
// Maths in ./su2/math.js (tested by tests/su2.test.mjs).

import * as ui from '../core/ui.js';
import { mountStrings } from './su2/tabStrings.js';
import { mountCover } from './su2/tabCover.js';
import { mountSpin } from './su2/tabSpin.js';

export default function mount(root, ctx) {
  const pg = ctx.page({
    lede: 'Spin-½ states transform under $SU(2)$, which wraps twice around the rotation group $SO(3)$: a $2\\pi$ rotation multiplies a spinor by $\\grp{-1}$, only $4\\pi$ gives $\\grp{+1}$.',
    columns: 1,
  });
  ui.css(ctx.scope, CSS);
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'strings',
        label: 'Dirac’s string trick',
        lede: 'Spin-½ states transform under $SU(2)$, which wraps twice around $SO(3)$: a $2\\pi$ rotation gives $\\grp{-1}$, only $4\\pi$ gives $\\grp{+1}$. A body tethered to its surroundings feels the difference: a $2\\pi$ twist of the strings cannot be undone, a $4\\pi$ twist can.',
        columns: 1,
        mount: (p, scope) => mountStrings(p, scope, ctx),
      },
      {
        id: 'cover',
        label: 'SU(2) → SO(3)',
        lede: 'Every rotation $R$ has two lifts $\\pm\\grp{q}$ in $SU(2)\\cong S^3$. The $4\\pi$ rotation is a closed loop in $SU(2)$ that shrinks to a point; the $2\\pi$ rotation is not even closed there, and its image in $SO(3)$ can never be shrunk: $\\pi_1(SO(3))=\\Z_2$.',
        columns: 2,
        mount: (p, scope) => mountCover(p, scope, ctx),
      },
      {
        id: 'spin',
        label: 'Spin in a magnetic field',
        lede: 'A spin in a magnetic field precesses. After one full turn the Bloch vector is back, but the state has changed sign, $\\psi\\to-\\psi$. Invisible in any single beam, the sign shows up in interference: neutron interferometers measure a period of $4\\pi$, not $2\\pi$.',
        columns: 2,
        mount: (p, scope) => mountSpin(p, scope, ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}

const CSS = `
.m-su2 .su2-dial { position: relative; width: 236px; height: 122px; }
.m-su2 .view-overlay.bl.su2-dial-card { padding: 2px 4px 0; }
.m-su2 .su2-ov { min-width: 168px; text-align: left; }
.m-su2 .su2-ov .katex { font-size: 1.02em; }
.m-su2 .su2-ov .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.m-su2 .su2-ov .badge { margin-top: 4px; }
.m-su2 .su2-static .katex-display { margin: 0.25em 0; }
.m-su2 .su2-phasors { position: absolute; inset: 0; }
.m-su2 .view-overlay .legend { margin: 0; gap: 4px 12px; font-size: 12px; }
@media (max-width: 820px) {
  .m-su2 .su2-dial { width: 190px; height: 100px; }
  .m-su2 .su2-ov { min-width: 0; font-size: 11.5px; }
  .m-su2 .view.su2-main { --h: 540px !important; }
}
`;
