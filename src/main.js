// App shell: sidebar navigation, hash router, theme switching, home page.
// Modules live in src/modules/<id>.js and export `default function mount(root, ctx)`.

import 'katex/dist/katex.min.css';
import './styles/app.css';
import { chapters, modules, findModule, chapterOf } from './registry.js';
import { Scope } from './core/scope.js';
import * as theme from './core/theme.js';
import { texHTML, inlineTex, typeset } from './core/tex.js';
import * as ui from './core/ui.js';

const { h } = ui;
const app = document.getElementById('app');
const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');
const scrim = document.getElementById('scrim');

const persistent = new Map(); // module id → state object kept across remounts (theme toggles, navigation)
let current = null; // { id, scope }

// Test/debug hook used by scripts/smoke.mjs
window.__lie = { route: null, ready: null, errors: [] };

// ------------------------------------------------------------------ errors
function showToast(msg) {
  if (!import.meta.env.DEV) return;
  let t = document.querySelector('.toast');
  if (!t) {
    t = h('div', { class: 'toast', role: 'alert' });
    document.body.appendChild(t);
  }
  t.textContent = '⚠ ' + msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.remove(), 7000);
}
window.addEventListener('error', (e) => {
  window.__lie.errors.push(String(e.message || e.error));
  showToast(e.message || 'Error');
});
window.addEventListener('unhandledrejection', (e) => {
  window.__lie.errors.push(String(e.reason && (e.reason.stack || e.reason)));
  showToast(String(e.reason && (e.reason.message || e.reason)));
});

// ------------------------------------------------------------------ sidebar
const LOGO = `<svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="30" cy="34" r="20" fill="none" stroke="var(--grp)" stroke-width="4.5"/>
  <path d="M50 12 L50 56" stroke="var(--alg)" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="50" cy="34" r="5" fill="var(--alg)"/>
  <path d="M50 34 A20 20 0 0 0 34.8 14.6" fill="none" stroke="var(--brk)" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;

function buildSidebar() {
  sidebar.innerHTML = '';
  const brand = h('a', { class: 'brand', href: '#/' });
  brand.innerHTML = `${LOGO}<span><div class="brand-name">Lie Atlas</div><div class="brand-sub">Symmetry for physicists</div></span>`;
  sidebar.appendChild(brand);
  const nav = h('nav', { class: 'nav' });
  nav.appendChild(navLink('home', '<span class="sym">⌂</span><span>Overview & dictionary</span>', '#/'));
  for (const ch of chapters) {
    nav.appendChild(h('div', { class: 'nav-chapter', text: `${ch.num} · ${ch.title}` }));
    for (const m of modules.filter((x) => x.chapter === ch.id)) {
      nav.appendChild(navLink(m.id, `<span class="sym">${texHTML(m.sym)}</span><span>${inlineTex(m.title)}</span>`, `#/${m.id}`));
    }
  }
  sidebar.appendChild(nav);

  const foot = h('div', { class: 'sidebar-foot' });
  const pref = theme.getPreference();
  ui.segmented(foot, {
    label: '',
    options: [
      { value: 'system', label: 'Auto' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    value: pref,
    onChange: (v) => theme.setPreference(v),
  });
  sidebar.appendChild(foot);
}

function navLink(id, html, href) {
  const a = h('a', { href, dataset: { id } });
  a.innerHTML = html;
  a.addEventListener('click', () => app.classList.remove('nav-open'));
  return a;
}

function markActive(id) {
  for (const a of sidebar.querySelectorAll('.nav a')) a.classList.toggle('active', a.dataset.id === id);
  const act = sidebar.querySelector('.nav a.active');
  if (act && act.scrollIntoView) {
    const r = act.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) act.scrollIntoView({ block: 'nearest' });
  }
}

scrim.addEventListener('click', () => app.classList.remove('nav-open'));

// ------------------------------------------------------------------ router
function currentId() {
  const raw = location.hash.replace(/^#\/?/, '');
  return decodeURIComponent(raw.split(/[?#]/)[0]) || 'home';
}

async function route() {
  const id = currentId();
  if (current) {
    current.scope.dispose();
    current = null;
  }
  main.innerHTML = '';
  window.__lie.route = id;
  window.__lie.ready = null;
  markActive(id);
  const scope = new Scope();
  current = { id, scope };

  const menu = ui.button(main, { label: '☰ Contents', small: true, onClick: () => app.classList.add('nav-open') });
  menu.classList.add('menu-btn');

  if (id === 'home') {
    document.title = 'Lie Atlas — Symmetry for Physicists';
    renderHome(main, scope);
    window.__lie.ready = id;
    return;
  }
  const entry = findModule(id);
  if (!entry) {
    main.appendChild(h('div', { class: 'error-card' }, h('h2', { text: 'Not found' }), h('p', { html: `No page called <code>${id}</code>. <a href="#/">Back to the overview</a>.` })));
    window.__lie.ready = id;
    return;
  }
  const chapter = chapterOf(entry);
  document.title = `${stripTex(entry.sym)} — ${stripTex(entry.title)} · Lie Atlas`;
  const root = h('div', { class: `module-root m-${entry.id}` });
  main.appendChild(root);
  const loading = h('div', { class: 'loading', text: 'Loading…' });
  root.appendChild(loading);
  try {
    const mod = await entry.load();
    if (!current || current.scope !== scope) return; // navigated away while loading
    loading.remove();
    if (!persistent.has(entry.id)) persistent.set(entry.id, {});
    const ctx = makeCtx(entry, chapter, scope, root);
    const mount = mod.default || mod.mount;
    const result = await mount(root, ctx);
    if (typeof result === 'function') scope.add(result);
    else if (result && typeof result.destroy === 'function') scope.add(() => result.destroy());
    window.__lie.ready = id;
  } catch (err) {
    console.error(err);
    loading.remove();
    window.__lie.errors.push(String((err && err.stack) || err));
    root.appendChild(
      h(
        'div',
        { class: 'error-card' },
        h('h2', { text: 'This page failed to load' }),
        h('p', { text: String((err && err.message) || err) }),
        h('pre', { text: String((err && err.stack) || '') }),
      ),
    );
    window.__lie.ready = id;
  }
}

function makeCtx(entry, chapter, scope, root) {
  return {
    id: entry.id,
    entry,
    chapter,
    scope,
    state: persistent.get(entry.id),
    colors: theme.colors(),
    isDark: theme.isDark(),
    navigate: (id) => {
      location.hash = '#/' + id;
    },
    link: (id) => '#/' + id,
    /** Standard page layout pre-filled with this module's title and chapter. */
    page: (opts = {}) =>
      ui.page(root, {
        kicker: `${chapter.num} · ${chapter.title}`,
        title: `$${entry.sym}$ <span style="color:var(--muted);font-weight:400">—</span> ${entry.title}`,
        ...opts,
      }),
  };
}

function stripTex(s) {
  return String(s)
    .replace(/\\R/g, 'ℝ')
    .replace(/\\hbar/g, 'ħ')
    .replace(/\\pi/g, 'π')
    .replace(/\\Phi/g, 'Φ')
    .replace(/\\to/g, '→')
    .replace(/\\!/g, '')
    .replace(/\\g/g, '𝔤')
    .replace(/\$|\\[a-zA-Z]+|[{}]/g, '')
    .replace(/\^\+/g, '⁺')
    .replace(/\^/g, '')
    .replace(/_/g, '');
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});
theme.onChange(() => {
  buildSidebar();
  markActive(currentId());
  route();
});

// ------------------------------------------------------------------ home
const DICTIONARY = [
  ['Lie group $G$', 'A continuous family of symmetry transformations — rotations, boosts, phase changes, translations.', 'so3'],
  ['Lie algebra $\\g = T_eG$', 'Infinitesimal symmetries: the <b>generators</b>. In quantum mechanics they are Hermitian observables — charge, momentum, angular momentum, energy.', 'u1'],
  ['Exponential map $\\exp:\\g\\to G$', 'A finite transformation built from a generator: $U(\\theta)=e^{-i\\theta\\,\\hat n\\cdot\\vec J}$.', 'u1'],
  ['Lie bracket $[X,Y]$', 'Commutation relations, e.g. $[J_i,J_j]=i\\epsilon_{ijk}J_k$. Geometrically: the failure of a small loop to close.', 'loops'],
  ['One-parameter subgroup', 'A symmetry flow. Noether: if it leaves the dynamics invariant, its generator is conserved.', 'kepler'],
  ['Representation $\\rho:G\\to GL(V)$', 'How states and fields transform: scalars, vectors, spinors, tensors, multiplets.', 'reps'],
  ['Irreducible representation', 'An elementary multiplet; for the Poincaré group, an elementary particle (Wigner).', 'lorentz'],
  ['Casimir operator', 'Labels a multiplet: $\\vec J^{\\,2}=j(j+1)$, $p^2=m^2$, the quadratic Casimir of SU(3).', 'reps'],
  ['Cartan subalgebra & weights', 'A maximal set of commuting generators = simultaneously measurable charges; weights are their eigenvalues.', 'su3'],
  ['Roots', 'The charges carried by ladder operators — in gauge theory, by the gauge bosons themselves.', 'roots'],
  ['Universal cover', 'Spinors: $SU(2)\\to SO(3)$ and $SL(2,\\C)\\to SO^+(1,3)$ are 2:1.', 'su2'],
  ['Homogeneous space $G/H$', 'Bloch sphere $SU(2)/U(1)$; the vacuum manifold of a broken symmetry.', 'ssb'],
  ['Compact vs non-compact', 'Compact groups have quantised charges and finite unitary multiplets; boosts do not.', 'lorentz'],
];

function renderHome(root, scope) {
  const el = h('div', { class: 'home' });
  root.appendChild(el);

  // hero
  const hero = h('section', { class: 'hero' });
  const left = h('div');
  left.innerHTML = `
    <div class="kicker">Interactive atlas</div>
    <h1>Continuous symmetry, made tangible</h1>
    <p>Conservation laws, spin, particle multiplets and the structure of spacetime are all statements about
    <strong>Lie groups</strong> and their <strong>Lie algebras</strong>. Here you can grab a generator,
    exponentiate it, commute it with another one, and watch what happens.</p>
    <p>Each page pairs a live visualisation with guided experiments and notes written for physicists:
    $\\hbar=c=1$, Hermitian generators, and the formulas you will meet in quantum mechanics, relativity and field theory.</p>`;
  const cta = h('div', { class: 'btn-row' });
  ui.button(cta, { label: 'Start with $U(1)$ →', kind: 'primary', onClick: () => (location.hash = '#/u1') });
  ui.button(cta, { label: 'Spin and $SU(2)$', onClick: () => (location.hash = '#/su2') });
  ui.button(cta, { label: 'Quarks and $SU(3)$', onClick: () => (location.hash = '#/su3') });
  left.appendChild(cta);
  typeset(left);
  hero.appendChild(left);
  hero.appendChild(heroFigure());
  el.appendChild(hero);

  // chapters
  el.appendChild(h('h2', { text: 'The atlas' }));
  el.appendChild(
    h('p', {
      class: 'section-lede',
      html: 'Read it in order as a short course, or jump straight to the group you need. Earlier chapters introduce the ideas (generators, brackets, covers, representations) that later ones use.',
    }),
  );
  for (const ch of chapters) {
    el.appendChild(
      h('div', { class: 'chapter-head' }, h('span', { class: 'num', text: `Chapter ${ch.num}` }), h('span', { class: 'title', text: ch.title }), h('span', { class: 'desc', text: ch.desc })),
    );
    const cards = h('div', { class: 'cards' });
    for (const m of modules.filter((x) => x.chapter === ch.id)) {
      const card = h('a', { class: 'card', href: `#/${m.id}` });
      card.innerHTML = `<div class="sym">${texHTML(m.sym)}</div><div class="title">${inlineTex(m.title)}</div><div class="blurb">${inlineTex(m.blurb)}</div>
        <div class="tags">${m.tags.map((t) => `<span class="badge">${t}</span>`).join('')}</div>`;
      cards.appendChild(card);
    }
    el.appendChild(cards);
  }

  // dictionary
  el.appendChild(h('h2', { text: 'The dictionary: mathematics ↔ physics' }));
  el.appendChild(h('p', { class: 'section-lede', text: 'The same structures appear under different names. This table is the Rosetta stone the atlas keeps returning to.' }));
  const table = h('table', { class: 'dict' });
  table.innerHTML = `<thead><tr><th>Mathematics</th><th>Physics</th><th>See</th></tr></thead>`;
  const tb = h('tbody');
  for (const [m, p, link] of DICTIONARY) {
    const target = modules.find((x) => x.id === link);
    tb.appendChild(
      h(
        'tr',
        {},
        h('td', { html: m }),
        h('td', { html: p }),
        h('td', {}, target ? h('a', { href: `#/${link}`, html: `$${target.sym}$` }) : ''),
      ),
    );
  }
  table.appendChild(tb);
  el.appendChild(table);

  // conventions
  el.appendChild(h('h2', { id: 'conventions', text: 'Conventions used throughout' }));
  const conv = h('div', { class: 'conv-grid' });
  conv.innerHTML = `
    <div class="conv"><h4>Units & generators</h4>$\\hbar=c=1$. Generators are Hermitian and finite transformations are
      $U(\\theta)=e^{-i\\theta\\,\\hat n\\cdot \\vec J}$, so $[J_i,J_j]=i\\epsilon_{ijk}J_k$. Mathematicians use anti-Hermitian
      $X=-iJ$, for which $[X_i,X_j]=\\epsilon_{ijk}X_k$ — the same algebra.</div>
    <div class="conv"><h4>Rotations & spacetime</h4>Rotations are active and right-handed: $R(\\theta,\\hat n)$ turns vectors
      counter-clockwise about $\\hat n$. Spacetime signature $(+,-,-,-)$; rapidity $\\eta$ with $v=\\tanh\\eta$. Repeated indices are summed.</div>
    <div class="conv"><h4>Colour code</h4>
      <span class="tx-alg">■ algebra</span> (generators, tangent vectors) ·
      <span class="tx-grp">■ group</span> (finite transformations, orbits) ·
      <span class="tx-brk">■ brackets</span> (commutators, curvature) ·
      <span class="tx-x">■ x</span> <span class="tx-y">■ y</span> <span class="tx-z">■ z</span> axes.
      The same colours are used in formulas, e.g. $\\grp{g}=\\exp(\\alg{X})$.</div>`;
  typeset(conv);
  el.appendChild(conv);
  el.appendChild(
    h('p', { class: 'small-note', style: { marginTop: '28px' }, html: 'Runs entirely in your browser (Three.js + KaTeX). Drag, scroll and double-click inside the views; every page has a “Try this” list of guided experiments.' }),
  );
  typeset(el.querySelector('.dict'));
}

function heroFigure() {
  const fig = h('div', { class: 'hero-figure' });
  const wrap = h('div', { style: { position: 'relative' } });
  wrap.innerHTML = `
  <svg viewBox="0 0 520 340" role="img" aria-label="A Lie group G as a curved surface, the Lie algebra as the tangent plane at the identity e, and the curve exp(tX)">
    <defs>
      <radialGradient id="hg" cx="38%" cy="30%" r="75%">
        <stop offset="0%" stop-color="var(--surface-3)"/>
        <stop offset="100%" stop-color="var(--surface-2)"/>
      </radialGradient>
    </defs>
    <circle cx="260" cy="200" r="120" fill="url(#hg)" stroke="var(--border-strong)" stroke-width="1.5"/>
    <path d="M140 200 A120 32 0 0 1 380 200" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 5" opacity="0.7"/>
    <path d="M140 200 A120 32 0 0 0 380 200" fill="none" stroke="var(--muted)" stroke-width="1.2" opacity="0.8"/>
    <path d="M124 92 L322 60 L398 76 L200 108 Z" fill="var(--alg)" fill-opacity="0.10" stroke="var(--alg)" stroke-opacity="0.65" stroke-width="1.5"/>
    <path d="M260 80 C 312 82, 356 116, 366 168 C 372 196, 368 224, 356 248" fill="none" stroke="var(--grp)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M260 80 C 214 84, 174 112, 160 150" fill="none" stroke="var(--grp)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="1 7" opacity="0.8"/>
    <line x1="260" y1="80" x2="336" y2="76" stroke="var(--alg)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M346 75.5 L332 70 L333 82 Z" fill="var(--alg)"/>
    <circle cx="366" cy="168" r="5.5" fill="var(--grp)"/>
    <circle cx="356" cy="248" r="4" fill="var(--grp)" opacity="0.8"/>
    <circle cx="260" cy="80" r="6" fill="var(--ink)"/>
  </svg>`;
  const lab = (html, x, y, cls = '') => {
    const d = h('div', { class: 'plot-label ' + cls, style: { left: x + '%', top: y + '%', transform: 'translate(-50%,-50%)' } });
    d.innerHTML = inlineTex(html);
    wrap.appendChild(d);
  };
  lab('$e$', 47.3, 19.5);
  lab('<span class="tx-alg">$\\g = T_eG$</span>', 20, 22);
  lab('<span class="tx-alg">$X$</span>', 66, 16.5);
  lab('<span class="tx-grp">$e^{tX}$</span>', 71.5, 30);
  lab('<span class="tx-grp">$e^{X}$</span>', 76, 49);
  lab('<span class="tx-grp">$e^{2X}$</span>', 77.5, 73);
  lab('Lie group $G$', 30, 86, 'small');
  lab('<span class="tx-muted">$e^{-tX}$</span>', 27, 47);
  fig.appendChild(wrap);
  fig.appendChild(
    h('div', {
      class: 'small-note',
      style: { padding: '4px 8px 2px' },
      html: 'A generator $\\alg{X}$ lives in the tangent space at the identity. Exponentiating it, $t\\mapsto \\grp{e^{tX}}$, sweeps out a one-parameter subgroup: the symmetry flow it generates.',
    }),
  );
  return fig;
}

// ------------------------------------------------------------------ boot
buildSidebar();
route();
