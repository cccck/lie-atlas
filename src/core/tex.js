// KaTeX helpers. All maths on the site goes through here so macros are shared.
//
// Colour macros (match the visual roles in the canvases):
//   \alg{X}  Lie-algebra objects (generators, tangent vectors)      → var(--alg)
//   \grp{g}  group elements / finite transformations                → var(--grp)
//   \brk{..} brackets / commutators / curvature                     → var(--brk)
//   \hi{..}  highlight                                              → var(--hi)
//   \cx{..} \cy{..} \cz{..}  x/y/z axis colours
//   \col{c3}{..}  any token: alg grp brk hi x y z c1..c8 muted
// Physics shorthands: \ket{ψ} \bra{ψ} \braket{a}{b} \expval{A} \comm{A}{B} \acomm{A}{B}
//   \R \C \Z \N \Q, \su \so \sl \sp \gl \uu \g (fraktur), \tr \Tr \Ad \ad \diag \id \dd \vb{v} \abs{x} \norm{x}

import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';
import { escapeHTML } from './format.js';

export const MACROS = {
  '\\R': '\\mathbb{R}',
  '\\C': '\\mathbb{C}',
  '\\Z': '\\mathbb{Z}',
  '\\N': '\\mathbb{N}',
  '\\Q': '\\mathbb{Q}',
  '\\g': '\\mathfrak{g}',
  '\\su': '\\mathfrak{su}',
  '\\so': '\\mathfrak{so}',
  '\\sl': '\\mathfrak{sl}',
  '\\sp': '\\mathfrak{sp}',
  '\\gl': '\\mathfrak{gl}',
  '\\uu': '\\mathfrak{u}',
  '\\hh': '\\mathfrak{h}',
  '\\tr': '\\operatorname{tr}',
  '\\Tr': '\\operatorname{Tr}',
  '\\Ad': '\\operatorname{Ad}',
  '\\ad': '\\operatorname{ad}',
  '\\diag': '\\operatorname{diag}',
  '\\sgn': '\\operatorname{sgn}',
  '\\id': '\\mathbb{1}',
  '\\dd': '\\mathrm{d}',
  '\\ee': '\\mathrm{e}',
  '\\ii': '\\mathrm{i}',
  '\\vb': '\\mathbf{#1}',
  '\\abs': '\\left\\lvert #1 \\right\\rvert',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
  '\\ket': '\\left\\lvert #1 \\right\\rangle',
  '\\bra': '\\left\\langle #1 \\right\\rvert',
  '\\braket': '\\left\\langle #1 \\middle\\vert #2 \\right\\rangle',
  '\\expval': '\\left\\langle #1 \\right\\rangle',
  '\\comm': '\\left[ #1 , #2 \\right]',
  '\\acomm': '\\left\\{ #1 , #2 \\right\\}',
  '\\alg': '\\htmlClass{tx-alg}{#1}',
  '\\grp': '\\htmlClass{tx-grp}{#1}',
  '\\brk': '\\htmlClass{tx-brk}{#1}',
  '\\hi': '\\htmlClass{tx-hi}{#1}',
  '\\cx': '\\htmlClass{tx-x}{#1}',
  '\\cy': '\\htmlClass{tx-y}{#1}',
  '\\cz': '\\htmlClass{tx-z}{#1}',
  '\\col': '\\htmlClass{tx-#1}{#2}',
};

export const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: '#e34948',
  macros: MACROS,
  strict: 'ignore',
  trust: (context) => context.command === '\\htmlClass',
  output: 'html',
};

const cache = new Map();

/** Render TeX source to an HTML string (cached). */
export function texHTML(src, display = false) {
  const key = (display ? 'D:' : 'I:') + src;
  let out = cache.get(key);
  if (out === undefined) {
    try {
      out = katex.renderToString(String(src), { ...KATEX_OPTIONS, macros: { ...MACROS }, displayMode: display });
    } catch (err) {
      out = `<span style="color:var(--critical)">${escapeHTML(src)}</span>`;
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, out);
  }
  return out;
}

/** New <span> containing rendered TeX. */
export function tex(src, display = false) {
  const span = document.createElement(display ? 'div' : 'span');
  span.innerHTML = texHTML(src, display);
  return span;
}

/** Render TeX into an existing element (replaces its content). */
export function renderTex(el, src, display = false) {
  el.innerHTML = texHTML(src, display);
}

/**
 * Convert a string with $…$ (inline) and $$…$$ (display) TeX into HTML.
 * Non-math text is NOT escaped (so you may include <b>, <em> …); use escapeHTML yourself for untrusted text.
 * In JS template literals remember that `${` starts interpolation — write `$ {` or `\${` if you need it.
 */
export function inlineTex(str) {
  if (str == null) return '';
  const s = String(str);
  if (!s.includes('$')) return s;
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') {
      out += '$';
      i += 2;
      continue;
    }
    if (s[i] === '$') {
      const display = s[i + 1] === '$';
      const open = display ? 2 : 1;
      const close = s.indexOf(display ? '$$' : '$', i + open);
      if (close < 0) {
        out += s.slice(i);
        break;
      }
      out += texHTML(s.slice(i + open, close), display);
      i = close + open;
      continue;
    }
    out += s[i++];
  }
  return out;
}

/** Auto-render $…$, $$…$$, \(…\), \[…\] inside an element (e.g. after setting innerHTML). */
export function typeset(el) {
  renderMathInElement(el, {
    ...KATEX_OPTIONS,
    macros: { ...MACROS },
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
  });
}

/**
 * A live TeX slot that re-renders only when the source changes, at most once per animation frame.
 * const set = liveTex(el, true); set('\\theta = 1.00');
 */
export function liveTex(el, display = false) {
  let current = null;
  let pending = null;
  let raf = 0;
  return function set(src) {
    pending = String(src);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pending !== current) {
        current = pending;
        el.innerHTML = texHTML(current, display);
      }
    });
  };
}
