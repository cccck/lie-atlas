// H_3 — the Heisenberg group & [x,p] = i (route #/heisenberg). Three tabs:
//   loops     a closed loop of phase-space translations D(q,p) returns a state up to e^{iA}; the horizontal lift in H_3
//   coherent  a coherent state displaced round a loop: Wigner blob, ψ(x) with phase colouring, overlap dial
//   flux      magnetic translations in a uniform field, the Aharonov–Bohm double slit, Landau degeneracy
// Maths: ./heisenberg/math.js. Convention: D(q0,p0) = e^{i(p0 x − q0 p)}; a counter-clockwise loop gives e^{+iA}.
import * as ui from '../core/ui.js';
import { mountLoops } from './heisenberg/loops.js';
import { mountCoherent } from './heisenberg/coherent.js';
import { mountFlux } from './heisenberg/flux.js';

export default function mount(root, ctx) {
  const pg = ctx.page({
    lede:
      'In quantum mechanics a translation in position and a translation in momentum do not commute: $[x,p]=i\\hbar$. Walk a state round a closed loop of such translations and it comes back to itself multiplied by a <b>phase equal to the enclosed area</b> in units of $\\hbar$. This central extension — the Heisenberg group — underlies the uncertainty principle, coherent states, Landau levels and the Aharonov–Bohm effect.',
    columns: 2,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'loops',
        label: 'Loops in phase space',
        columns: 2,
        lede: 'Momentum generates translations in $q$, position generates kicks in $p$, and $[x,p]=i\\hbar$ says the two do not commute. Take a state round a closed loop of phase-space translations and it returns as $e^{i\\brk{A}/\\hbar}\\psi$, where $\\brk{A}$ is the <b>signed area</b> enclosed (counter-clockwise positive). Lifted into the Heisenberg group, the loop no longer closes: it ends exactly $\\brk{A}$ above its start.',
        mount: (p, scope) => mountLoops(p, scope, ctx),
      },
      {
        id: 'coherent',
        label: 'Coherent states',
        columns: 2,
        lede: 'A coherent state is the vacuum displaced in phase space — a minimum-uncertainty Gaussian with $\\Delta x\\,\\Delta p=\\hbar/2$. Push it round a loop and it comes back <b>unchanged except for a global phase</b> $e^{i\\brk{A}/\\hbar}$: same blob, same $|\\psi|$, every value of $\\psi$ turned by the same angle — visible only through interference.',
        mount: (p, scope) => mountCoherent(p, scope, ctx),
      },
      {
        id: 'flux',
        label: 'Magnetic flux',
        columns: 2,
        lede: 'For a charge in a magnetic field the kinetic momenta obey $[\\pi_x,\\pi_y]=iqB$ — the Heisenberg algebra again, with <b>area replaced by flux</b>. Transport round a loop multiplies the state by $e^{iq\\Phi}$, even when the field never touches the path (Aharonov–Bohm), and the flux quantum $h/q$ sets both the period of the fringes and the number of states in a Landau level.',
        mount: (p, scope) => mountFlux(p, scope, ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}
