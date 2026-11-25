# Lie Atlas — architecture & module contract

Lie Atlas is a local web app (Vite + vanilla ES modules + Three.js + KaTeX) that builds **physical
intuition for Lie groups and Lie algebras**. Audience: physics students and theorists. Every page should
answer *“what does this group do to a physical system, and why should a physicist care?”*

```
index.html            shell markup
src/main.js           router (#/<id>), sidebar, home page, theme switching
src/registry.js       table of contents (ids, titles, chapters) — modules are lazy-loaded
src/styles/app.css    design tokens (light + dark) and all shared styles
src/core/             shared library (read the JSDoc at the top of each file)
  scope.js            lifetime: Scope.add/listen/frame/timeout/observeResize/child/dispose
  theme.js            colours() snapshot, withAlpha(), mix(), toHex()
  la.js               vectors, matrices, expm, eigSym, 2×2 exp/eig, so(3)/SO(3), quaternions, rk4, stereo …
  complex.js          complex numbers & matrices, Pauli matrices, SU(2)↔quaternion, spin-j matrices, Wigner d/D, Möbius
  format.js           fmt(), texNum(), texMatrix(), texVec(), texComplex(), texAngle(), rational()
  tex.js              KaTeX: texHTML(), tex(), inlineTex('…$x$…'), typeset(el), liveTex(el); shared macros
  ui.js               h(), page(), view(), section(), slider(), toggle(), select(), segmented(), button(s)(),
                      playButton(), readout(), keyValue(), legend(), badge(), note(), tabs(), pageTabs(),
                      experiments(), prose(), texBlock(), css()
  plot2d.js           2D canvas kit (world coords, pan/zoom, handles, KaTeX labels, vector fields)
  three-kit.js        3D kit (z-up camera, orbit controls, arrows, fat lines, tubes, surfaces, dots, labels, dragging)
src/modules/<id>.js   one module per route; may use helpers in src/modules/<id>/
src/modules/_template.js   small reference module using every API (route #/_template)
scripts/smoke.mjs     headless Chrome smoke test + screenshots (see “Testing”)
scripts/test-core.mjs numerical tests of src/core
tests/<id>.test.mjs   per-module numerical tests (node, no DOM)
```

## Module contract

```js
// src/modules/<id>.js
export default function mount(root, ctx) {
  const pg = ctx.page({ lede: '…', columns: 2 });   // header + stage (views) + right panel + notes
  const v = pg.view({ title: 'Group $SO(3)$', hint: 'drag to rotate' });
  const k = scene3d(v.body, ctx.scope, { … });      // or plot2d(v.body, ctx.scope, { … })
  …
  // optional: return a cleanup function (most cleanup is automatic via ctx.scope)
}
```

`ctx` = `{ id, entry, chapter, scope, state, colors, isDark, navigate(id), link(id), page(opts) }`

* `ctx.scope` — register **everything** with it (`scope.listen`, `scope.frame`, `scope.timeout`, …).
  plot2d/scene3d take it and clean themselves up. Never use bare `requestAnimationFrame`, `setInterval`
  or `window.addEventListener` without the scope.
* `ctx.state` — a plain object that survives remounts (theme toggle remounts the page) and navigation
  within the session. Keep slider values / active tab there: `S.theta ??= 1`.
* `ctx.colors` — resolved theme colours (`alg, grp, brk, hi, x, y, z, ink, ink2, muted, grid, axis,
  surface, c1…c8`). Changing theme remounts the module, so read colours once.
* Animation: `ctx.scope.frame((dt, t) => …)` (dt in seconds). Scenes/plots render automatically after
  all update callbacks each frame (`plot2d` redraws when `p.invalidate()` was called or while
  `p.animate(fn)` callbacks are registered).
* Tabs for multi-part modules: `ui.pageTabs(pg, ctx.scope, [{ id, label, lede, columns, mount(pg, scope) }],
  { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) })`. Inside a tab use **its** `scope`.

## Page anatomy (every module)

1. **Lede** (1–3 sentences): the physical punchline, not a definition.
2. **Views**: 1–3 visualisation cards. The default state must already show something interesting
   (and usually be gently animated). Title chips name what is shown (`Lie algebra $\so(3)\cong\R^3$`).
   Hints say how to interact (`drag the tip · scroll to zoom`).
3. **Panel** (right): sections of controls, live readouts (KaTeX matrices/values via `ui.readout`,
   `ui.keyValue`), a legend, and a **“Try this”** section with 3–6 `ui.experiments` cards. Each experiment
   sets up a scenario (`apply()`) and its text says what to look for and why it matters physically.
4. **Notes** (below): 2–4 `pg.note(html)` cards — *What you see*, *The physics*, *The mathematics*,
   *Going further*. Use `<div class="callout intuition"><span class="callout-title">Intuition</span>…</div>`
   (`physics`, `warning` variants too). Display maths with `$$…$$`. Link other modules with
   `<a href="#/su2">SU(2)</a>`.

## Conventions (site-wide — do not deviate)

* $\hbar=c=1$. Hermitian generators: $U(\theta)=e^{-i\theta\,\hat n\cdot\vec J}$, $[J_i,J_j]=i\epsilon_{ijk}J_k$.
  When showing real/anti-Hermitian generators say so explicitly (e.g. $X=-iJ$, $[X_i,X_j]=\epsilon_{ijk}X_k$).
* Active right-handed rotations; z-up in 3D (the kit's default camera). Metric signature $(+,-,-,-)$,
  rapidity $\eta$, $v=\tanh\eta$.
* Quaternions `[w,x,y,z]`, $q=\cos\frac\theta2+\sin\frac\theta2\,\hat n$ ↔ rotation by $\theta$ about $\hat n$;
  SU(2) ↔ quaternions via $q\mapsto w\,\mathbb 1-i(x\sigma_x+y\sigma_y+z\sigma_z)$ (`complex.js`).
* Spin-j basis ordered $m=j,j-1,\dots,-j$.
* **Colour roles** (same in canvases and formulas): algebra/generators/tangent vectors = `alg` (orange,
  TeX `\alg{X}`); group elements/finite transformations/orbits = `grp` (violet, `\grp{g}`);
  brackets/commutators/curvature = `brk` (pink, `\brk{[X,Y]}`); highlight = `hi`; axes and the triple
  $J_x,J_y,J_z$ = `x`/`y`/`z` (red/green/blue). Other series: `c1…c8` in order (never cycle beyond 8).
  Text stays in ink colours; never rely on colour alone — label things.
* UI text in English, sentence case. Numbers via `fmt()`/`texNum()` (typographic minus, fixed digits).

## Design rules

* Calm, precise, uncluttered. Thin lines (1–3 px), recessive grids, few saturated colours at once.
* Every view fills its card; nothing overflows horizontally at 1440 px or 420 px wide.
* Interactions: drag handles (plot2d `p.handle`, three-kit `k.draggable`), sliders, play/pause.
  Respect the user: no animation that cannot be paused; reset buttons where state can get messy.
* Performance: 60 fps on a laptop. Reuse geometry; update positions instead of rebuilding per frame
  where easy; throttle KaTeX (use `ui.readout`, which re-renders only on change, once per frame).
* Physics correctness is the top priority. Put non-DOM maths in `src/modules/<id>/math.js` (or similar)
  and check it with `tests/<id>.test.mjs` (plain `node`, assert-style, exit code 1 on failure).

## Testing

`scripts/smoke.mjs` uses the dev server at http://localhost:5173 when it is running, and otherwise
starts a private one. Run one smoke process at a time: each starts a headless Chrome, and many in
parallel will saturate a laptop.

```
npm test                                    # every numerical suite (scripts/test-core.mjs + tests/*.test.mjs)
node scripts/smoke.mjs                      # every route, one headless browser, one page at a time
node scripts/smoke.mjs <id>                 # load page, collect errors, screenshot → screenshots/<id>.png
node scripts/smoke.mjs <id> --chaos         # + fuzz every control and drag on every canvas, tab by tab
                                            #   → <id>.chaos.png, or <id>.tab<k>.chaos.png per page tab
node scripts/smoke.mjs <id> --theme=light   # light theme → <id>.light.png
node scripts/smoke.mjs <id> --width=420 --height=900   # narrow layout → <id>.narrow.png
node scripts/smoke.mjs <id> --full          # full-page screenshot (includes notes)
node scripts/smoke.mjs <id> --click="Rotate 4π" --wait=3000   # click a button (by text) before the shot
node --test tests/<id>.test.mjs   or   node tests/<id>.test.mjs
```

Look at the screenshots with an image viewer (they are PNGs) — check layout, readability, label
collisions, and that the physics is visibly right. `npm run build` must succeed.
