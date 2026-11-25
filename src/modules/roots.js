// Φ — roots, weights and the classification of simple Lie algebras.
// Four tabs: rank-2 root systems with Weyl reflections; rank 3 in 3D; Coxeter-plane gallery up to E8;
// classification (Dynkin diagrams, the E-series, SU(5) unification). Maths in ./roots/math.js (tests/roots.test.mjs).

import * as ui from '../core/ui.js';
import { mountRank2 } from './roots/rank2.js';
import { mountRank3 } from './roots/rank3.js';
import { mountGallery } from './roots/gallery.js';
import { mountClassify } from './roots/classify.js';

const CSS = `
.m-roots .dyn-wrap { display: flex; justify-content: center; margin: 6px 0 2px; overflow-x: auto; }
.m-roots .phys-text { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin: 8px 0 0; }
.m-roots .panel-section > h3 .katex { text-transform: none; letter-spacing: 0; font-size: 1.12em; color: var(--ink-2); }
.m-roots .btn-row .btn .katex { font-size: 1em; }
.m-roots .roots-card { height: auto; min-height: 0; padding: 46px 14px 14px; touch-action: auto; }
.m-roots .roots-card .view-title { white-space: normal; }
.m-roots .ladder-svg { display: flex; justify-content: center; overflow-x: auto; }
.m-roots .ladder-txt { font-size: 13.5px; color: var(--ink-2); line-height: 1.5; max-width: 760px; margin: 6px auto 0; }
.m-roots .ladder-head { font-size: 15px; color: var(--ink); margin-bottom: 2px; }
.m-roots .fam-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.m-roots .fam { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; background: var(--surface); }
.m-roots .fam-head { font-size: 13px; color: var(--ink); }
.m-roots .fam-svg { display: flex; justify-content: center; padding: 4px 0; overflow-x: auto; }
.m-roots .fam-phys { font-size: 12px; color: var(--ink-2); line-height: 1.4; }
`;

export default function mount(root, ctx) {
  const S = ctx.state;
  S.tab ??= 'rank2';
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({
    lede: 'Pick a maximal set of commuting generators — the charges you can measure simultaneously. Every other generator is a ladder operator carrying definite charges: a root. Root systems are so rigid that all simple Lie algebras fit in a short list, the menu from which physicists pick gauge groups and unified theories.',
    columns: 1,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'rank2',
        label: 'Rank 2',
        lede: 'Two commuting charges, so roots are arrows in a plane. Their mirrors generate the Weyl group, and the reflected probe visits every chamber: $|W|=4,6,8,12$ for $A_1{\\times}A_1$, $A_2$, $B_2=C_2$, $G_2$.',
        mount: (pg2, scope) => mountRank2(pg2, scope, ctx),
      },
      {
        id: 'rank3',
        label: 'Rank 3 in 3D',
        lede: 'Three commuting charges: the roots of $\\su(4)$, $\\so(7)$ and $\\sp(6)$ in $\\R^3$, their mirror planes and the 24 or 48 Weyl chambers. Each reflection flips the handedness of the probe.',
        mount: (pg2, scope) => mountRank3(pg2, scope, ctx),
      },
      {
        id: 'gallery',
        label: 'Coxeter-plane gallery',
        lede: 'Every simple Lie algebra up to rank 8, built from its Cartan matrix alone and projected onto the plane where its Coxeter element acts as a rotation by $2\\pi/h$. $E_8$: 240 roots in 8 rings of 30.',
        mount: (pg2, scope) => mountGallery(pg2, scope, ctx),
      },
      {
        id: 'classify',
        label: 'Classification & physics',
        lede: 'Four infinite families and five exceptions — nothing else. From this list physicists pick gauge groups: $SU(3)\\times SU(2)\\times U(1)$ for the Standard Model, $SU(5)$, $SO(10)$ or $E_6$ for unification, $E_8\\times E_8$ for the heterotic string.',
        mount: (pg2, scope) => mountClassify(pg2, scope, ctx),
      },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
