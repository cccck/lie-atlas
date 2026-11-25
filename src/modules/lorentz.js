// SO⁺(1,3) — the Lorentz group (route #/lorentz). Four tabs:
//   (a) boosts & rapidity in 1+1 D        → lorentz/tab-boosts.js
//   (b) Thomas–Wigner rotation in 2+1 D   → lorentz/tab-thomas.js
//   (c) the sky under a boost, SL(2,C)    → lorentz/tab-sky.js
//   (d) particles as orbits (Wigner)      → lorentz/tab-orbits.js
// Maths (DOM-free) lives in lorentz/math.js and is checked by tests/lorentz.test.mjs.

import * as ui from '../core/ui.js';
import { CSS } from './lorentz/common.js';
import { mountBoosts } from './lorentz/tab-boosts.js';

// The default tab is 2D-only and loads eagerly; the others (two of which need three.js) load on first use.
function lazyTab(loader, name, ctx) {
  return (p, scope) => {
    const wait = ui.h('div', { class: 'loading', text: 'Loading…' });
    p.stage.appendChild(wait);
    loader()
      .then((mod) => {
        if (scope.disposed) return; // the user switched tabs meanwhile
        wait.remove();
        mod[name](p, scope, ctx);
      })
      .catch((err) => {
        console.error(err);
        wait.remove();
        if (!scope.disposed) p.stage.appendChild(ui.h('div', { class: 'error-card', text: 'This tab failed to load: ' + String((err && err.message) || err) }));
      });
  };
}

export default function mount(root, ctx) {
  ui.css(ctx.scope, CSS);
  const pg = ctx.page({
    lede:
      'A boost is a rotation by an imaginary angle: it slides events along hyperbolas, and rapidities, not velocities, simply add. Boosts in different directions leave a rotation behind; $SL(2,\\C)$ double-covers the group, acts on the sky by Möbius maps, and its orbits in momentum space are the particles.',
    columns: 2,
  });
  ui.pageTabs(
    pg,
    ctx.scope,
    [
      {
        id: 'boosts',
        label: 'Boosts & rapidity',
        columns: 2,
        lede: 'A boost is a rotation by an imaginary angle. Every event slides along its own hyperbola $t^2-x^2=\\text{const}$, the light cone stays put, and the rapidities $\\eta$ of successive boosts simply add — velocities $\\beta=\\tanh\\eta$ do not.',
        mount: (p, scope) => mountBoosts(p, scope, ctx),
      },
      {
        id: 'thomas',
        label: 'Thomas–Wigner rotation',
        columns: 2,
        lede: 'Boosts in different directions do not commute: a boost by $\\vec u$ followed by one by $\\vec v$ is a boost <em>and a rotation</em>. The rotation angle is the area of a triangle in hyperbolic velocity space — the geometric origin of Thomas precession and of the factor $\\tfrac12$ in spin–orbit coupling.',
        mount: lazyTab(() => import('./lorentz/tab-thomas.js'), 'mountThomas', ctx),
      },
      {
        id: 'sky',
        label: 'The sky under a boost',
        columns: 2,
        lede: 'Fly through the stars at speed $\\beta$: aberration crowds them towards the direction of motion, the Doppler factor turns them blue ahead and red behind. On the celestial sphere every Lorentz transformation is a Möbius map of $SL(2,\\C)$ — so circles stay circles.',
        mount: lazyTab(() => import('./lorentz/tab-sky.js'), 'mountSky', ctx),
      },
      {
        id: 'orbits',
        label: 'Particles as orbits',
        columns: 1,
        lede: 'Lorentz transformations move a momentum only along its mass shell $p^2=m^2$. Each orbit is a kind of particle, and the subgroup fixing $p$ — the little group — decides what spin means: rotations for massive particles, null rotations and helicity for massless ones.',
        mount: lazyTab(() => import('./lorentz/tab-orbits.js'), 'mountOrbits', ctx),
      },
    ],
    { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) },
  );
}
