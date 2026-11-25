// SU(3) — quarks and the Eightfold Way.
// Three tabs: weight diagrams of irreps (p,q) with hadron overlays; tensor products peeled into irreps
// (colour singlets!); and the algebra itself (Gell-Mann matrices, structure constants, gluons as roots).
// Maths lives in ./su3/math.js and is tested by tests/su3.test.mjs.

import * as ui from '../core/ui.js';
import { mountWeights } from './su3/weights-tab.js';
import { mountProducts } from './su3/products-tab.js';
import { mountAlgebra } from './su3/algebra-tab.js';

const CSS = `
.m-su3 .su3-card { height: auto; min-height: 0; padding: 44px 14px 14px; touch-action: auto; }
.m-su3 .su3-card .view-title { white-space: normal; }
.m-su3 .gm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.m-su3 .gm-tile { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); padding: 6px 8px 7px;
  cursor: pointer; text-align: left; color: var(--ink-2); font-size: 12px; line-height: 1.35; transition: border-color .12s, background .12s; }
.m-su3 .gm-tile:hover { border-color: var(--border-strong); }
.m-su3 .gm-tile.on { border-color: var(--alg); background: color-mix(in srgb, var(--alg) 7%, var(--surface)); }
.m-su3 .gm-tile .katex { font-size: 1.02em; }
.m-su3 .gm-tile .cap { display: block; margin-top: 2px; color: var(--muted); font-size: 11.5px; }
.m-su3 .gm-tile .cap .katex { font-size: 1em; }
.m-su3 .eqline { font-size: 13px; color: var(--ink-2); margin: 6px 0 2px; }
.m-su3 .fgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 8px; font-size: 12.5px; color: var(--ink-2); }
.m-su3 .fgrid .katex { font-size: 1em; }
.m-su3 .phys-text { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin: 6px 0 0; }
.m-su3 .btn-row .btn.small .katex { font-size: 1em; }
.m-su3 .seg button .katex { font-size: 0.95em; }
.m-su3 .panel-section > h3 .katex { text-transform: none; letter-spacing: 0; font-size: 1.15em; color: var(--ink-2); }
`;

export default function mount(root, ctx) {
  const S = ctx.state;
  S.tab ??= 'weights';
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({
    lede:
      'SU(3) has two commuting generators — isospin $I_3$ and hypercharge $Y$ — so its multiplets are patterns in a plane: triangles and hexagons. Gell-Mann sorted the hadrons into these patterns, and an empty corner predicted the $\\Omega^-$. The same group, as colour, explains why only colour singlets are seen.',
    columns: 1,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'weights',
        label: 'Weight diagrams',
        columns: 1,
        lede: 'SU(3) has two commuting generators — isospin $I_3$ and hypercharge $Y$ — so its multiplets are 2D patterns: triangles and hexagons. Gell-Mann arranged the hadrons into octets and a decuplet, and the empty corner of the decuplet predicted the $\\Omega^-$.',
        mount: (pg2, scope) => mountWeights(pg2, scope, ctx),
      },
      {
        id: 'products',
        label: 'Building hadrons',
        columns: 1,
        lede: 'Combining particles means multiplying representations: put a copy of one weight diagram on every weight of the other, then peel off irreducible multiplets from the top. Only products that contain the singlet can be colourless — which is why we see $q\\bar q$ and $qqq$ but never $qq$.',
        mount: (pg2, scope) => mountProducts(pg2, scope, ctx),
      },
      {
        id: 'algebra',
        label: 'The algebra',
        columns: 1,
        lede: 'Eight generators: two commuting charges $T_3,T_8$ and six ladder operators, each carrying a definite charge — a root. In QCD they are the eight gluons; the commutator of two ladder operators carries the sum of their charges.',
        mount: (pg2, scope) => mountAlgebra(pg2, scope, ctx),
      },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
