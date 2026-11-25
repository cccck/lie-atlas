// G/H — spontaneous symmetry breaking (route #/ssb).
// Three tabs: (a) the Mexican hat with a rolling field, Higgs and (pseudo-)Goldstone modes;
// (b) O(3) → O(2): the vacuum sphere, broken vs unbroken generators, type-A/B Goldstone counting;
// (c) counting Goldstones across physics, and the electroweak Higgs mechanism (Weinberg rotation).
// Maths lives in ./ssb/math.js.

import * as ui from '../core/ui.js';
import { mountHat } from './ssb/tab-hat.js';
import { mountO3 } from './ssb/tab-o3.js';
import { mountCount } from './ssb/tab-count.js';

const CSS = `
.m-ssb { --ssb-hat-h: min(52vh, 440px); --ssb-hist-h: 190px; --ssb-o3-h: min(64vh, 540px); --ssb-ew-h: 330px; }
.m-ssb .panel-section > h3 .katex { text-transform: none; letter-spacing: 0; font-size: 1.12em; color: var(--ink-2); }
.m-ssb .btn .katex { font-size: 1em; }
.m-ssb .ssb-inset { padding: 4px 6px 6px; width: 214px; }
.m-ssb .ssb-inset-cap { font-size: 11.5px; color: var(--muted); margin: 0 2px 2px; white-space: nowrap; }
.m-ssb .ssb-inset-plot { position: relative; width: 200px; height: 184px; border-radius: 6px; overflow: hidden; }
.m-ssb .ssb-hist { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.m-ssb .ssb-hist-cell { position: relative; min-width: 0; overflow: hidden; }
.m-ssb .ssb-hist-cell + .ssb-hist-cell { border-left: 1px solid var(--border); }
.m-ssb .ssb-cards-view { height: auto; min-height: 0; padding: 44px 12px 12px; touch-action: auto; }
.m-ssb .ssb-cards-view > .view-body { position: static; }
.m-ssb .ssb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(236px, 1fr)); gap: 10px; }
.m-ssb .ssb-card { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); padding: 9px 11px 10px;
  font-size: 12.5px; color: var(--ink-2); line-height: 1.45; transition: border-color .15s, background .15s; min-width: 0; }
.m-ssb .ssb-card.on { border-color: var(--hi); background: color-mix(in srgb, var(--hi) 7%, var(--surface)); }
.m-ssb .ssb-card-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 4px; }
.m-ssb .ssb-sys { font-weight: 650; color: var(--ink); font-size: 13px; min-width: 0; }
.m-ssb .ssb-gh { font-size: 13.5px; color: var(--ink); margin: 2px 0 6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.m-ssb .ssb-squares { display: flex; flex-wrap: wrap; gap: 2px; margin: 2px 0 4px; }
.m-ssb .ssb-squares .sq { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.m-ssb .ssb-out { color: var(--ink); font-weight: 560; margin: 2px 0 4px; }
.m-ssb .ssb-txt { color: var(--muted); font-size: 12px; }
.m-ssb .ssb-txt .katex, .m-ssb .ssb-out .katex, .m-ssb .ssb-count .katex { font-size: 1em; }
.m-ssb .ssb-nseg { margin: 4px 0 6px; }
.m-ssb .ssb-nseg .seg button { padding: 2px 6px; font-size: 12px; }
.m-ssb .badge { white-space: nowrap; }
@media (max-width: 820px) {
  .m-ssb { --ssb-hat-h: 400px; --ssb-hist-h: 300px; --ssb-o3-h: 420px; }
  .m-ssb .ssb-inset { width: 156px; }
  .m-ssb .ssb-inset-plot { width: 144px; height: 132px; }
  .m-ssb .ssb-hist { grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr 1fr; }
  .m-ssb .ssb-hist-cell + .ssb-hist-cell { border-left: 0; border-top: 1px solid var(--border); }
}
`;

export default function mount(root, ctx) {
  const S = ctx.state;
  S.tab ??= 'hat';
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({
    lede:
      'When the laws are symmetric but the ground state is not, the vacuum picks one point of a whole orbit of equivalent vacua, the coset $G/H$. Moving along the orbit costs no energy, so every broken generator brings a massless Goldstone boson — unless the symmetry is gauged, and the Goldstones are eaten.',
    columns: 1,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'hat',
        label: 'Mexican hat',
        columns: 1,
        lede:
          'The potential is symmetric under $\\phi\\to e^{i\\alpha}\\phi$, its ground state is not: the field must pick one point of the circle of vacua. Rolling <b>along</b> the circle costs nothing — a massless Goldstone mode; rattling <b>across</b> it is the massive Higgs mode. A small tilt gives the Goldstone a small mass, which is why pions are light.',
        mount: (pg2, scope) => mountHat(pg2, scope, ctx),
      },
      {
        id: 'o3',
        label: '$O(3)\\to O(2)$',
        columns: 2,
        lede:
          'With three field components the vacua form a sphere, $S^2=SO(3)/SO(2)$. Rotations about the chosen direction stay unbroken; the other two generators slide the vacuum over the sphere — two flat directions, two Goldstone bosons: the magnons of an antiferromagnet.',
        mount: (pg2, scope) => mountO3(pg2, scope, ctx),
      },
      {
        id: 'count',
        label: 'Counting Goldstones',
        columns: 2,
        lede:
          'Count the broken generators, $\\dim G-\\dim H$, and you know the light particles: one phonon in a superfluid, three pions, eight mesons. Gauge the symmetry and the Goldstones are eaten instead: the photon becomes massive in a superconductor, and $W^\\pm$, $Z$ get their masses in the Standard Model.',
        mount: (pg2, scope) => mountCount(pg2, scope, ctx),
      },
    ],
    { value: S.tab, onChange: (id) => (S.tab = id) },
  );
}
