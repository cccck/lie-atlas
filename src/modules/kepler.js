// #/kepler — SO(4): Kepler & hidden symmetry.
// (a) Noether & precession: which conservation laws survive which perturbations (orbit, hodograph, time traces).
// (b) Hidden SO(4): orbits of one energy as a sphere of (L, A′); Fock's sphere turns hodographs into great circles.
// (c) Hydrogen's n²: the (j, j) multiplet of SO(4) = SU(2)×SU(2)/Z₂, its SO(3) content, and symmetry breaking by a core.
// Maths in ./kepler/math.js (tested by tests/kepler.test.mjs).
import * as ui from '../core/ui.js';
import { mountNoether } from './kepler/noether.js';
import { mountHidden } from './kepler/hidden.js';
import { mountHydrogen } from './kepler/hydrogen.js';

const CSS = `
.m-kepler .kp-orbit-view { --h: min(52vh, 470px); }
.m-kepler .kp-series-view { --h: 172px; min-height: 150px; }
.m-kepler .kp-series { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.m-kepler .kp-series-cell { position: relative; min-width: 0; }
.m-kepler .kp-series-cell + .kp-series-cell { border-left: 1px solid var(--border); }
.m-kepler .kp-series-head { position: absolute; top: 0; left: 0; right: 0; height: 26px; display: flex; align-items: center;
  justify-content: space-between; gap: 8px; padding: 0 10px; font-size: 13px; white-space: nowrap; overflow: hidden; }
.m-kepler .kp-series-value { font-family: var(--mono); font-size: 12px; color: var(--ink); font-variant-numeric: tabular-nums; }
.m-kepler .kp-series-plot { position: absolute; top: 26px; left: 0; right: 0; bottom: 0; }
.m-kepler .kp-badge-row { margin: 2px 0 4px; }
.m-kepler .kp-top-view { --h: min(37vh, 330px); }
.m-kepler .kp-fock-view { --h: min(40vh, 360px); }
.m-kepler .kp-h-view { --h: min(62vh, 560px); }
.m-kepler .kp-caption { font-size: 12.5px; pointer-events: none; }
.m-kepler .view-overlay.bl { max-width: calc(100% - 16px); }
@media (max-width: 640px) {
  .m-kepler .kp-series-view { --h: 440px; }
  .m-kepler .kp-series { grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(3, minmax(0, 1fr)); }
  .m-kepler .kp-series-cell + .kp-series-cell { border-left: 0; border-top: 1px solid var(--border); }
  .m-kepler .kp-orbit-view, .m-kepler .kp-top-view { --h: 380px; }
  .m-kepler .kp-fock-view { --h: 400px; }
  .m-kepler .kp-h-view { --h: 430px; }
}
`;

const LEDE_A =
  'Rotational symmetry makes $\\vec L$ conserved (Noether). But Kepler orbits also <em>close</em> — the perihelion never moves — because of a second conserved vector, the Laplace–Runge–Lenz vector $\\alg{\\vec A}=\\vec p\\times\\vec L-mk\\,\\hat r$. Perturb the $1/r$ law and watch which conservation law survives.';
const LEDE_B =
  'At fixed energy $L^2+|\\vec A\\,\'|^2=mk^2/2|E|$ with $\\vec A\\,\'=\\vec A/\\sqrt{2m|E|}$: one vector of fixed length, which a hidden symmetry rotates. It turns circles into ellipses of the same energy and period; in momentum space it is a rotation of Fock’s sphere.';
const LEDE_C =
  'In quantum mechanics the hidden symmetry is why hydrogen’s $2s$ and $2p$ — all $l$ of a shell — have the same energy: the $n^2$ states form one irreducible multiplet $(j,j)$ of $SO(4)\\cong SU(2)\\times SU(2)/\\Z_2$. Screen the nucleus and the degeneracy splits.';

export default function mount(root, ctx) {
  const S = ctx.state;
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({ lede: LEDE_A, columns: 2 });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      { id: 'noether', label: 'Noether & precession', lede: LEDE_A, columns: 2, mount: (p, scope) => mountNoether(p, scope, ctx) },
      { id: 'hidden', label: 'Hidden $SO(4)$', lede: LEDE_B, columns: 2, mount: (p, scope) => mountHidden(p, scope, ctx) },
      { id: 'hydrogen', label: 'Hydrogen’s $n^2$', lede: LEDE_C, columns: 2, mount: (p, scope) => mountHydrogen(p, scope, ctx) },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
