// Theme: light/dark resolved from <html data-theme> or the OS preference.
// Colours live in CSS custom properties (src/styles/app.css); JS reads them here.
// Changing the theme remounts the current module, so modules may read colours
// once at mount time (ctx.colors) and never need to listen for changes.

const KEY = 'lie-atlas-theme';
const listeners = new Set();
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

/** Semantic colour names → CSS custom property. */
export const COLOR_VARS = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  surface3: '--surface-3',
  ink: '--ink',
  ink2: '--ink-2',
  muted: '--muted',
  grid: '--grid',
  axis: '--axis',
  border: '--border',
  accent: '--accent',
  x: '--x',
  y: '--y',
  z: '--z',
  alg: '--alg',
  grp: '--grp',
  brk: '--brk',
  hi: '--hi',
  c1: '--c1',
  c2: '--c2',
  c3: '--c3',
  c4: '--c4',
  c5: '--c5',
  c6: '--c6',
  c7: '--c7',
  c8: '--c8',
  good: '--good',
  warning: '--warning',
  critical: '--critical',
};

/** 'system' | 'light' | 'dark' — what the user chose. */
export function getPreference() {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : 'system';
}

export function isDark() {
  const pref = getPreference();
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return !!(media && media.matches);
}

export function setPreference(pref) {
  if (pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (pref === 'light' || pref === 'dark') localStorage.setItem(KEY, pref);
    else localStorage.removeItem(KEY);
  } catch (e) {
    /* storage unavailable — theme still applies for this session */
  }
  emit();
}

export function toggle() {
  setPreference(isDark() ? 'light' : 'dark');
}

/** Read a CSS custom property, e.g. css('--alg') → '#d95926'. */
export function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Snapshot of every semantic colour as a CSS colour string. */
export function colors() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const [k, v] of Object.entries(COLOR_VARS)) out[k] = cs.getPropertyValue(v).trim();
  out.dark = isDark();
  out.categorical = [out.c1, out.c2, out.c3, out.c4, out.c5, out.c6, out.c7, out.c8];
  return out;
}

/** Subscribe to theme changes. Returns unsubscribe. */
export function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const cb of [...listeners]) {
    try {
      cb(isDark());
    } catch (e) {
      console.error(e);
    }
  }
}

if (media) {
  const onMedia = () => {
    if (getPreference() === 'system') emit();
  };
  if (media.addEventListener) media.addEventListener('change', onMedia);
  else if (media.addListener) media.addListener(onMedia);
}

/** Parse '#rrggbb' / '#rgb' / 'rgb(a)(...)' into [r,g,b,a] with r,g,b in 0..255. */
export function parseColor(str) {
  const s = String(str).trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return [128, 128, 128, 1];
}

/** Colour with alpha: withAlpha('#d95926', 0.3) → 'rgba(217,89,38,0.3)'. */
export function withAlpha(color, alpha) {
  const [r, g, b] = parseColor(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Linear blend of two colours (t=0 → a, t=1 → b), returns 'rgb(...)'. */
export function mix(a, b, t) {
  const A = parseColor(a);
  const B = parseColor(b);
  const c = [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** '#rrggbb' for any parsable colour (for THREE.Color etc). */
export function toHex(color) {
  const [r, g, b] = parseColor(color);
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
