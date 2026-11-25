// Sp(2,R) — linear phase-space flows. Three tabs:
//   flows      quadratic Hamiltonians as area-preserving linear flows; sp(2,R) ≅ so(2,1) and its adjoint orbits
//   stability  strong focusing (FODO), Floquet theory, the Mathieu stability chart and parametric resonance
//   damping    leaving Sp(2): gl(2,R) = R·1 ⊕ sl(2,R), the trace–determinant plane
// Maths: ./sp2/math.js (tested by tests/sp2.test.mjs).
import * as ui from '../core/ui.js';
import { mountFlows } from './sp2/flows.js';
import { mountStability } from './sp2/stability.js';
import { mountDamping } from './sp2/damping.js';

export default function mount(root, ctx) {
  const pg = ctx.page({
    lede:
      'Every quadratic Hamiltonian $H=\\tfrac12(ap^2+2bqp+cq^2)$ moves phase space by a linear, area-preserving map — an element of $Sp(2,\\R)=SL(2,\\R)$. Its generator is elliptic (oscillator), parabolic (free particle) or hyperbolic (inverted oscillator), and the stability of any periodic system is decided by one number: $|\\tr M|<2$.',
    columns: 2,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'flows',
        label: 'Hamiltonian flows',
        columns: 2,
        lede: 'Every quadratic Hamiltonian $H=\\tfrac12(ap^2+2bqp+cq^2)$ generates a linear, area-preserving flow of phase space — an element of $Sp(2,\\R)=SL(2,\\R)$. Its generator is <b>elliptic</b> (oscillator: rotation), <b>parabolic</b> (free particle: shear) or <b>hyperbolic</b> (inverted oscillator: squeeze), according to where it sits relative to a light cone in $\\sp(2,\\R)\\cong\\so(2,1)$.',
        mount: (p, scope) => mountFlows(p, scope, ctx),
      },
      {
        id: 'stability',
        label: 'Stability & resonance',
        columns: 3,
        lede: 'A periodic system is stable when its one-period map $M\\in Sp(2,\\R)$ is elliptic: $|\\tr M|<2$. That single number explains strong focusing in accelerators, the Paul trap, the Kapitza pendulum and why a swing is pumped at twice its natural frequency.',
        mount: (p, scope) => mountStability(p, scope, ctx),
      },
      {
        id: 'damping',
        label: 'Damping: leaving $Sp(2)$',
        columns: 2,
        lede: 'Friction breaks Liouville: the flow of $\\ddot q+\\gamma\\dot q+\\omega^2q=0$ shrinks phase-space area as $e^{-\\gamma t}$. Its generator lives in $\\gl(2,\\R)=\\R\\,\\id\\oplus\\sl(2,\\R)$ — the trace is the dissipation, the traceless part is a Hamiltonian flow.',
        mount: (p, scope) => mountDamping(p, scope, ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}
