// DOM & control helpers. Every label/text argument may contain inline TeX: 'Angle $\\theta$'.
// Controls return small handle objects: { el, value (getter), set(v, {silent}) }.

import { inlineTex, liveTex, typeset, texHTML } from './tex.js';
import { fmt } from './format.js';

// ------------------------------------------------------------------ element factory
/**
 * h('div', { class: 'x', style: {...}, on: { click: fn }, html: '...', text: '...', attrs... }, ...children)
 * Children may be strings (treated as inline-TeX HTML), Nodes, arrays, or null.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, sv);
            else el.style[sk] = sv;
          }
      } else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'html') el.innerHTML = inlineTex(v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) el.appendChild(c);
    else {
      const t = document.createElement('template');
      t.innerHTML = inlineTex(String(c));
      el.appendChild(t.content);
    }
  }
}

/** Inject module-scoped CSS; removed when the scope is disposed. */
export function css(scope, cssText) {
  const style = h('style', { text: cssText });
  document.head.appendChild(style);
  scope.add(() => style.remove());
  return style;
}

// ------------------------------------------------------------------ page layout
/**
 * Standard module page. Returns { el, head, stage, panel, notes, view(), section(), setColumns() }.
 *   opts.title   page title (defaults to the registry title)
 *   opts.kicker  small caps line above the title (defaults to the chapter)
 *   opts.lede    1–3 sentence introduction (inline TeX allowed)
 *   opts.columns number of view columns in the stage (default 1)
 *   opts.panel   false → no right-hand control panel
 */
export function page(root, opts = {}) {
  const el = h('div', { class: 'page' });
  const head = h(
    'header',
    { class: 'page-head' },
    h(
      'div',
      {},
      opts.kicker ? h('div', { class: 'kicker', html: opts.kicker }) : null,
      h('h1', { html: opts.title || '' }),
      opts.lede ? h('p', { class: 'lede', html: opts.lede }) : null,
    ),
  );
  const stage = h('div', { class: 'stage', style: { '--cols': String(opts.columns || 1) } });
  const panel = opts.panel === false ? null : h('aside', { class: 'panel', 'aria-label': 'Controls' });
  const body = h('div', { class: ['page-body', panel ? '' : 'no-panel'] }, stage, panel);
  if (opts.panelWidth) body.style.setProperty('--panel-w', typeof opts.panelWidth === 'number' ? opts.panelWidth + 'px' : opts.panelWidth);
  const notes = h('section', { class: 'notes', 'aria-label': 'Notes' });
  el.append(head, body, notes);
  root.appendChild(el);
  const ledeEl = head.querySelector('.lede');
  return {
    el,
    head,
    body,
    stage,
    panel,
    notes,
    /** Replace the lede paragraph (inline TeX allowed). */
    setLede(html) {
      let p = head.querySelector('.lede');
      if (!p) {
        p = h('p', { class: 'lede' });
        head.firstChild.appendChild(p);
      }
      p.innerHTML = inlineTex(html);
    },
    ledeEl,
    /** Add a visualisation card to the stage. */
    view: (vopts = {}) => view(stage, vopts),
    /** Add a titled section to the control panel. */
    section: (title, sopts) => section(panel, title, sopts),
    setColumns: (n) => stage.style.setProperty('--cols', String(n)),
    /** Add a notes card (prose with TeX) below the stage. */
    note: (html, nopts) => noteCard(notes, html, nopts),
  };
}

/**
 * A visualisation card. Returns { el, body, setTitle(html), setHint(html), overlay(pos) }.
 *   opts.title   caption chip (top-left), e.g. 'Lie algebra $\\so(3)\\cong\\R^3$'
 *   opts.hint    small text bottom-right, e.g. 'drag to rotate · scroll to zoom'
 *   opts.height  CSS height (number → px). Default var(--view-h)
 *   opts.span    true → span all stage columns
 */
export function view(parent, opts = {}) {
  const body = h('div', { class: 'view-body' });
  const title = h('div', { class: 'view-title', html: opts.title || '' });
  const hint = h('div', { class: 'view-hint', html: opts.hint || '' });
  const style = {};
  if (opts.height !== undefined) style['--h'] = typeof opts.height === 'number' ? opts.height + 'px' : opts.height;
  const el = h('div', { class: ['view', opts.span ? 'span-all' : ''], style }, body, opts.title ? title : null, opts.hint ? hint : null);
  parent.appendChild(el);
  return {
    el,
    body,
    setTitle(html) {
      title.innerHTML = inlineTex(html);
      if (!title.parentNode) el.appendChild(title);
    },
    setHint(html) {
      hint.innerHTML = inlineTex(html);
      if (!hint.parentNode) el.appendChild(hint);
    },
    /** Absolutely positioned overlay container: 'tr' | 'tl' | 'bl' | 'br'. */
    overlay(pos = 'tr', cls = 'overlay-card') {
      const o = h('div', { class: ['view-overlay', pos, cls] });
      el.appendChild(o);
      return o;
    },
  };
}

/** Panel section with an uppercase heading. Returns the section element (append controls to it). */
export function section(parent, title, opts = {}) {
  const sec = h('section', { class: 'panel-section' }, title ? h('h3', { html: title }) : null);
  if (opts.help) sec.appendChild(h('div', { class: 'small-note', html: opts.help }));
  parent.appendChild(sec);
  return sec;
}

function noteCard(parent, html, opts = {}) {
  const card = h('div', { class: ['note-card', 'prose', opts.class || ''] });
  card.innerHTML = html;
  typeset(card);
  parent.appendChild(card);
  return card;
}

/** Prose block (HTML with $…$ TeX). */
export function prose(parent, html, cls = '') {
  const el = h('div', { class: ['prose', cls] });
  el.innerHTML = html;
  typeset(el);
  if (parent) parent.appendChild(el);
  return el;
}

// ------------------------------------------------------------------ controls
function fillPct(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const v = Number(input.value);
  input.style.setProperty('--fill', `${((v - min) / (max - min || 1)) * 100}%`);
}

/**
 * Slider. opts: { label, min, max, step, value, format(v) → string | digits, unit, help, onInput(v), onChange(v) }
 * Returns { el, input, get value(), set(v, {silent}), setRange(min, max, step), setLabel(html), disable(bool) }.
 */
export function slider(parent, opts) {
  const { min = 0, max = 1, step = 0.01 } = opts;
  const digits = typeof opts.format === 'number' ? opts.format : Math.max(0, Math.min(4, Math.ceil(-Math.log10(step || 1))));
  const format = typeof opts.format === 'function' ? opts.format : (v) => fmt(v, digits) + (opts.unit || '');
  const input = h('input', { type: 'range', min, max, step, 'aria-label': stripTags(opts.label || '') });
  input.value = String(opts.value ?? min);
  const valueEl = h('span', { class: 'ctl-value' });
  const labelEl = h('span', { class: 'ctl-label', html: opts.label || '' });
  const el = h(
    'div',
    { class: 'ctl' },
    h('div', { class: 'ctl-row' }, labelEl, valueEl),
    input,
    opts.help ? h('div', { class: 'ctl-help', html: opts.help }) : null,
  );
  const show = () => {
    valueEl.innerHTML = inlineTex(format(Number(input.value)));
    fillPct(input);
  };
  input.addEventListener('input', () => {
    show();
    opts.onInput && opts.onInput(Number(input.value));
  });
  input.addEventListener('change', () => opts.onChange && opts.onChange(Number(input.value)));
  show();
  if (parent) parent.appendChild(el);
  return {
    el,
    input,
    get value() {
      return Number(input.value);
    },
    set(v, { silent = false } = {}) {
      input.value = String(v);
      show();
      if (!silent) opts.onInput && opts.onInput(Number(input.value));
    },
    setRange(a, b, s) {
      input.min = a;
      input.max = b;
      if (s !== undefined) input.step = s;
      show();
    },
    setLabel(html) {
      labelEl.innerHTML = inlineTex(html);
    },
    disable(d = true) {
      input.disabled = d;
    },
  };
}

/** Toggle switch. opts: { label, value, onChange(bool), help }. */
export function toggle(parent, opts) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!opts.value;
  const el = h('label', { class: 'toggle' }, h('span', { html: opts.label || '' }), input, h('span', { class: 'sw' }));
  input.addEventListener('change', () => opts.onChange && opts.onChange(input.checked));
  const wrap = opts.help ? h('div', {}, el, h('div', { class: 'ctl-help', html: opts.help })) : el;
  if (parent) parent.appendChild(wrap);
  return {
    el: wrap,
    input,
    get value() {
      return input.checked;
    },
    set(v, { silent = false } = {}) {
      input.checked = !!v;
      if (!silent) opts.onChange && opts.onChange(input.checked);
    },
  };
}

/** Dropdown. opts: { label, options: [{value, label}] | [string], value, onChange(value) }. */
export function select(parent, opts) {
  const sel = h('select', { class: 'select', 'aria-label': stripTags(opts.label || '') });
  const norm = (opts.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  for (const o of norm) sel.appendChild(h('option', { value: String(o.value), text: stripTex(o.label) }));
  if (opts.value !== undefined) sel.value = String(opts.value);
  const find = (s) => norm.find((o) => String(o.value) === s)?.value ?? s;
  sel.addEventListener('change', () => opts.onChange && opts.onChange(find(sel.value)));
  const el = h('div', { class: 'ctl' }, opts.label ? h('div', { class: 'ctl-row' }, h('span', { html: opts.label })) : null, sel);
  if (parent) parent.appendChild(el);
  return {
    el,
    select: sel,
    get value() {
      return find(sel.value);
    },
    set(v, { silent = false } = {}) {
      sel.value = String(v);
      if (!silent) opts.onChange && opts.onChange(find(sel.value));
    },
  };
}

/** Segmented control (radio buttons). opts: { label, options: [{value, label}], value, onChange(value) }. */
export function segmented(parent, opts) {
  const norm = (opts.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  let value = opts.value ?? norm[0]?.value;
  const bar = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': stripTags(opts.label || '') });
  const buttons = norm.map((o) => {
    const b = h('button', { type: 'button', role: 'radio', html: o.label, title: o.title ? stripTags(o.title) : null });
    b.addEventListener('click', () => api.set(o.value));
    bar.appendChild(b);
    return b;
  });
  const paint = () =>
    buttons.forEach((b, i) => {
      const on = norm[i].value === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  const el = h('div', { class: 'ctl' }, opts.label ? h('div', { class: 'ctl-row' }, h('span', { html: opts.label })) : null, bar);
  const api = {
    el,
    get value() {
      return value;
    },
    set(v, { silent = false } = {}) {
      value = v;
      paint();
      if (!silent) opts.onChange && opts.onChange(value);
    },
  };
  paint();
  if (parent) parent.appendChild(el);
  return api;
}

/** Button. opts: { label, onClick, kind: 'primary'|'ghost'|undefined, small, title }. */
export function button(parent, opts) {
  const b = h('button', {
    type: 'button',
    class: ['btn', opts.kind || '', opts.small ? 'small' : ''],
    html: opts.label,
    title: opts.title ? stripTags(opts.title) : null,
  });
  b.addEventListener('click', (e) => opts.onClick && opts.onClick(e));
  if (parent) parent.appendChild(b);
  return b;
}

/** Row of buttons: buttons(parent, [{label, onClick, kind}], {stretch}). Returns the row element; .buttons array. */
export function buttons(parent, list, opts = {}) {
  const row = h('div', { class: ['btn-row', opts.stretch ? 'stretch' : ''] });
  row.buttons = list.map((o) => button(row, o));
  if (parent) parent.appendChild(row);
  return row;
}

/** Play/pause toggle button. opts: { playing, onToggle(playing), labels: ['Play', 'Pause'] }. */
export function playButton(parent, opts = {}) {
  let playing = !!opts.playing;
  const [lp, lq] = opts.labels || ['▶ Play', '❚❚ Pause'];
  const b = button(parent, {
    label: playing ? lq : lp,
    kind: 'primary',
    onClick: () => api.set(!playing),
  });
  const api = {
    el: b,
    get playing() {
      return playing;
    },
    set(v, { silent = false } = {}) {
      playing = !!v;
      b.innerHTML = inlineTex(playing ? lq : lp);
      if (!silent) opts.onToggle && opts.onToggle(playing);
    },
  };
  return api;
}

/** Number input. opts: { label, value, step, min, max, onChange(v) }. */
export function numberInput(parent, opts) {
  const input = h('input', { type: 'number', class: 'num-input', step: opts.step ?? 'any' });
  if (opts.min !== undefined) input.min = opts.min;
  if (opts.max !== undefined) input.max = opts.max;
  input.value = String(opts.value ?? 0);
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) opts.onChange && opts.onChange(v);
  });
  const el = h('div', { class: 'ctl' }, opts.label ? h('div', { class: 'ctl-row' }, h('span', { html: opts.label })) : null, input);
  if (parent) parent.appendChild(el);
  return {
    el,
    input,
    get value() {
      return Number(input.value);
    },
    set(v) {
      input.value = String(v);
    },
  };
}

// ------------------------------------------------------------------ readouts
/**
 * Live TeX readout: const r = readout(sec, { label: 'Rotation matrix' }); r.set('R = ' + texMatrix(R));
 * Re-renders at most once per frame and only when the TeX changes. opts.display (default true).
 */
export function readout(parent, opts = {}) {
  const body = h('div');
  const el = h('div', { class: 'readout' }, opts.label ? h('div', { class: 'readout-label', html: opts.label }) : null, body);
  const setTex = liveTex(body, opts.display !== false);
  if (parent) parent.appendChild(el);
  if (opts.value) setTex(opts.value);
  return {
    el,
    set: setTex,
    /** Set plain HTML instead of TeX (inline $…$ still rendered). */
    setHTML(html) {
      body.innerHTML = inlineTex(html);
    },
  };
}

/** Key/value table: const kv = keyValue(sec, [['Angle', '0.00']]); kv.set('Angle', '1.23') or kv.setRows([...]). */
export function keyValue(parent, rows = []) {
  const table = h('table', { class: 'kv' });
  const tbody = h('tbody');
  table.appendChild(tbody);
  const cells = new Map();
  const add = (k, v) => {
    const vc = h('td', { html: v ?? '' });
    tbody.appendChild(h('tr', {}, h('td', { html: k }), vc));
    cells.set(k, { vc, last: v });
  };
  rows.forEach(([k, v]) => add(k, v));
  if (parent) parent.appendChild(table);
  return {
    el: table,
    set(k, v) {
      const c = cells.get(k);
      if (!c) return add(k, v);
      if (c.last !== v) {
        c.vc.innerHTML = inlineTex(v);
        c.last = v;
      }
    },
    setRows(list) {
      tbody.innerHTML = '';
      cells.clear();
      list.forEach(([k, v]) => add(k, v));
    },
  };
}

/** Legend: legend(parent, [{ color: 'alg' | '#hex' | 'var(--x)', label: '$X$ generator', dot: true }]). */
export function legend(parent, items) {
  const el = h('div', { class: 'legend' });
  for (const it of items) {
    const color = colorRef(it.color);
    el.appendChild(
      h('span', { class: 'item' }, h('span', { class: ['sw', it.dot ? 'dot' : ''], style: { color } }), h('span', { html: it.label })),
    );
  }
  if (parent) parent.appendChild(el);
  return el;
}

/** Small muted paragraph. */
export function note(parent, html) {
  const el = h('p', { class: 'small-note', html });
  if (parent) parent.appendChild(el);
  return el;
}

/** Badge: badge(parent, 'elliptic', 'grp'|'alg'|'brk'|'good'|'warn'|'bad'). Returns el with .set(text, kind). */
export function badge(parent, text, kind = '') {
  const el = h('span', { class: ['badge', kind], html: text });
  el.set = (t, k = kind) => {
    el.innerHTML = inlineTex(t);
    el.className = ['badge', k].filter(Boolean).join(' ');
  };
  if (parent) parent.appendChild(el);
  return el;
}

/**
 * Tabs strip. tabs(parent, [{ id, label }], { value, onChange(id) }) → { el, value, set(id) }.
 * The module owns the content; typically each tab mounts into a fresh child Scope.
 */
export function tabs(parent, items, opts = {}) {
  let value = opts.value ?? items[0]?.id;
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const btns = items.map((it) => {
    const b = h('button', { type: 'button', role: 'tab', html: it.label });
    // clicking the tab that is already open does nothing (a remount would throw away the tab's state)
    b.addEventListener('click', () => {
      if (it.id !== value) api.set(it.id);
    });
    bar.appendChild(b);
    return b;
  });
  const paint = () =>
    btns.forEach((b, i) => {
      const on = items[i].id === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  const api = {
    el: bar,
    get value() {
      return value;
    },
    set(id, { silent = false } = {}) {
      value = id;
      paint();
      if (!silent) opts.onChange && opts.onChange(id);
    },
  };
  paint();
  if (parent) parent.appendChild(bar);
  return api;
}

/**
 * Tabs that swap the whole page content (stage, panel, notes). Use for modules with several parts.
 *   pageTabs(pg, ctx.scope, [{ id, label, lede?, columns?, mount(pg, scope) }], { value, onChange(id) })
 * On every switch the previous tab's child scope is disposed (WebGL, listeners, frames) and the
 * stage/panel/notes are emptied before the new tab's mount(pg, scope) runs.
 * Persist the active tab with: { value: ctx.state.tab, onChange: (id) => (ctx.state.tab = id) }.
 */
export function pageTabs(pg, scope, items, opts = {}) {
  let sub = null;
  const defaultLede = pg.head.querySelector('.lede')?.innerHTML ?? '';
  const bar = tabs(null, items, { value: items.some((i) => i.id === opts.value) ? opts.value : items[0].id, onChange: (id) => show(id) });
  pg.el.insertBefore(bar.el, pg.body);
  function show(id) {
    if (sub) sub.dispose();
    pg.stage.innerHTML = '';
    if (pg.panel) pg.panel.innerHTML = '';
    pg.notes.innerHTML = '';
    const it = items.find((i) => i.id === id) || items[0];
    pg.setColumns(it.columns || 1);
    if (it.lede) pg.setLede(it.lede);
    else if (defaultLede) pg.head.querySelector('.lede').innerHTML = defaultLede;
    sub = scope.child();
    opts.onChange && opts.onChange(it.id);
    try {
      it.mount(pg, sub);
    } catch (err) {
      console.error(err);
      pg.stage.appendChild(h('div', { class: 'error-card' }, h('b', { text: 'This tab failed: ' }), String(err && err.message)));
      throw err;
    }
  }
  show(bar.value);
  return bar;
}

/**
 * Guided experiments ("Try this"). experiments(parent, [{ title, text, apply() }]).
 * Each card has a "Show me" button that runs apply() and marks the card active.
 */
export function experiments(parent, items) {
  const el = h('div', { class: 'experiments' });
  const cards = items.map((it) => {
    const btn = h('button', { type: 'button', class: 'btn small', text: it.button || 'Show me' });
    const card = h(
      'div',
      { class: 'exp' },
      h('div', { class: 'exp-head' }, h('div', { class: 'exp-title', html: it.title }), btn),
      it.text ? h('div', { class: 'exp-text', html: it.text }) : null,
    );
    btn.addEventListener('click', () => {
      cards.forEach((c) => c.classList.remove('on'));
      card.classList.add('on');
      it.apply && it.apply();
    });
    el.appendChild(card);
    return card;
  });
  if (parent) parent.appendChild(el);
  return { el, clear: () => cards.forEach((c) => c.classList.remove('on')) };
}

/** Display-math block. */
export function texBlock(parent, src) {
  const el = h('div', { html: texHTML(src, true) });
  if (parent) parent.appendChild(el);
  return el;
}

// ------------------------------------------------------------------ utils
export function colorRef(c) {
  if (!c) return 'currentColor';
  if (c.startsWith('#') || c.startsWith('rgb') || c.startsWith('var(') || c.startsWith('hsl')) return c;
  return `var(--${c})`;
}
function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/\$/g, '');
}
function stripTex(s) {
  return String(s)
    .replace(/\$([^$]*)\$/g, (_, t) =>
      t
        .replace(/\\(mathrm|text|operatorname|mathbf|mathfrak)\{([^}]*)\}/g, '$2')
        .replace(/\\([a-zA-Z]+)/g, (m, name) => GREEK[name] ?? name)
        .replace(/[{}^_]/g, ''),
    )
    .replace(/<[^>]*>/g, '');
}
const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν',
  pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', eta: 'η',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  R: 'ℝ', C: 'ℂ', Z: 'ℤ', otimes: '⊗', oplus: '⊕', times: '×', cdot: '·', to: '→', infty: '∞', hbar: 'ħ',
};
