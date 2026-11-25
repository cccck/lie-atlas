// [X,Y] — Commutators as small loops (route #/loops).
// Tab "Small loops": the group commutator e^{εX}e^{εY}e^{−εX}e^{−εY} = exp(ε²[X,Y] + O(ε³)) in five physical
// worlds (rotations, boosts/Thomas precession, magnetic flux/Aharonov–Bohm, parallel parking, curvature).
// Tab "BCH formula": log(e^X e^Y) order by order in brackets, with measured error slopes.
// Maths in ./loops/math.js (tested by tests/loops.test.mjs).

import * as ui from '../core/ui.js';
import { mountSmallLoops } from './loops/small.js';
import { mountBCH } from './loops/bch.js';

export default function mount(root, ctx) {
  const S = ctx.state;
  const pg = ctx.page({
    lede: 'Move along $\\alg{X}$ for a moment, then $\\alg{Y}$, then back along $X$, then back along $Y$. If the moves do not commute you do not come home: the gap is $\\epsilon^2\\brk{[X,Y]}$.',
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'loops',
        label: 'Small loops',
        columns: 2,
        lede: 'Go along $\\alg{X}$ for a time $\\epsilon$, then $\\alg{Y}$, then back along both. If the moves do not commute you miss home by $\\epsilon^2\\brk{[X,Y]}+O(\\epsilon^3)$ — the one fact behind the angular-momentum algebra, Thomas precession, the Aharonov–Bohm phase, curvature and parallel parking.',
        mount: (p, scope) => mountSmallLoops(p, scope, ctx),
      },
      {
        id: 'bch',
        label: 'BCH formula',
        columns: 2,
        lede: 'Two exponentials compose into one, $e^{X}e^{Y}=e^{Z}$, and every correction to the naive $Z=X+Y$ is a bracket: $Z=X+Y+\\tfrac12[X,Y]+\\dots$ The algebra fixes the group near the identity; the group’s topology decides where the series fails.',
        mount: (p, scope) => mountBCH(p, scope, ctx),
      },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
