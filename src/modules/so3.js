// SO(3) — rotations & angular momentum (route #/so3).
// Three parts (ui.pageTabs): (a) axis & angle + the π-ball, (b) non-commutativity, (c) Euler angles & gimbal lock.
// Maths: src/modules/so3/math.js (tested by tests/so3.test.mjs). Rigid body: so3/body.js.

import * as ui from '../core/ui.js';
import { mountAxis } from './so3/tab-axis.js';
import { mountComm } from './so3/tab-comm.js';
import { mountEuler } from './so3/tab-euler.js';

const CSS = `
.m-so3 .so3-row-label { font-size: 12px; color: var(--muted); align-self: center; margin-right: 2px; }
.m-so3 .so3-sub { font-size: 12px; color: var(--muted); margin: 2px 0 6px; line-height: 1.4; }
.m-so3 .so3-plotwrap { position: absolute; inset: 0; }
.m-so3 .so3-plot { position: absolute; left: 0; right: 0; }
.m-so3 .so3-panelplot { position: relative; height: 136px; margin: 4px 0 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
.m-so3 .so3-step { font-size: 12.5px; color: var(--ink-2); white-space: nowrap; }
.m-so3 .badge.so3-lock { font-weight: 600; }
`;

export default function mount(root, ctx) {
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({
    lede:
      'Every rotation is $\\grp{R}=e^{-i\\theta\\,\\hat n\\cdot\\vec J}$. Rotations do not commute, and the way they fail to commute is again a rotation, $\\brk{[J_x,J_y]=iJ_z}$. All rotations together form a ball of radius $\\pi$ with antipodal points glued — a space with a loop that cannot be shrunk, the seed of spin ½.',
    columns: 2,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'axis',
        label: 'Axis & angle',
        columns: 2,
        lede: 'Every rotation is $\\grp{R}=e^{-i\\theta\\,\\hat n\\cdot\\vec J}$: the generator $\\alg{\\hat n\\cdot\\vec J}$ is angular momentum about $\\hat n$, and following it for an “angle-time” $\\theta$ turns everything rigidly about $\\hat n$. All rotations together form a ball of radius $\\pi$ whose antipodal surface points are the same rotation — a space with a loop that cannot be shrunk, the seed of spin ½ (<a href="#/su2">SU(2)</a>).',
        mount: (p, scope) => mountAxis(p, scope, ctx),
      },
      {
        id: 'comm',
        label: 'Non-commutativity',
        columns: 2,
        lede: 'Rotations do not commute, and the way they fail to commute is again a rotation: a small loop $+x,+y,-x,-y$ leaves a net turn of $\\epsilon^2$ about $z$ — the group-level meaning of $\\brk{[J_x,J_y]=iJ_z}$, and the reason $J_x$ and $J_y$ cannot both be sharp in quantum mechanics.',
        mount: (p, scope) => mountComm(p, scope, ctx),
      },
      {
        id: 'euler',
        label: 'Euler angles & gimbal lock',
        columns: 2,
        lede: 'Three angles cannot label all rotations smoothly: at gimbal lock two rotation axes line up and one direction of motion is lost. The singularity lives in the coordinates, not in $SO(3)$ — which is why spacecraft steer with quaternions, while Wigner’s $D$-matrices keep using Euler angles.',
        mount: (p, scope) => mountEuler(p, scope, ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}
