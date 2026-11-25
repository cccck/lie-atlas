// #/reps — D^(j): spin multiplets & representations.
// Three tabs: the J± ladder of one multiplet (weight diagram, vector model, matrices); rotating a
// state of definite ℓ with the Wigner matrix D^ℓ(R); adding two angular momenta (Clebsch–Gordan).
// DOM-free maths lives in ./reps/math.js and is checked by tests/reps.test.mjs.

import * as ui from '../core/ui.js';
import { REPS_CSS } from './reps/style.js';
import { mountLadder } from './reps/ladder.js';
import { mountRotate } from './reps/rotate.js';
import { mountCouple } from './reps/couple.js';

export default function mount(root, ctx) {
  ui.css(ctx.scope, REPS_CSS);
  const pg = ctx.page({
    lede: 'States of definite angular momentum come in multiplets of $2j+1$. Rotations only ever mix states <em>within</em> a multiplet, through the Wigner matrix $\\grp{D^{(j)}(R)}$ — that is what a representation is.',
    columns: 2,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'ladder',
        label: 'The ladder',
        columns: 2,
        lede: 'A multiplet is a ladder of $2j+1$ rungs $\\ket{j,m}$. The generators $\\alg{J_\\pm}$ step along it, the Casimir $\\vec J^{\\,2}=j(j+1)$ is the same on every rung, and the ladder has to end at both ends — which is why $j$ comes in halves.',
        mount: (p, s) => mountLadder(p, s, ctx),
      },
      {
        id: 'rotate',
        label: 'Rotating a state',
        columns: 1,
        lede: 'Rotating a wavefunction never changes its $\\ell$: the $2\\ell+1$ harmonics $Y_{\\ell m}$ are reshuffled among themselves by the unitary matrix $\\grp{D^{\\ell}(R)}$. A rigid turn of the shape is a unitary mixing of $2\\ell+1$ numbers.',
        mount: (p, s) => mountRotate(p, s, ctx),
      },
      {
        id: 'couple',
        label: 'Adding angular momenta',
        columns: 2,
        lede: 'Two angular momenta combine into a sum of multiplets, $j_1\\otimes j_2=|j_1-j_2|\\oplus\\dots\\oplus(j_1+j_2)$. Peel them off from the top state down, then read off the Clebsch–Gordan coefficients that build each $\\ket{J,M}$.',
        mount: (p, s) => mountCouple(p, s, ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}
