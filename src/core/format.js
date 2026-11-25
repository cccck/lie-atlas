// Number → string formatting for readouts (plain text) and KaTeX sources.
// Pure functions, no DOM — usable from Node tests.

const MINUS = '−';

function clean(x, d) {
  if (!Number.isFinite(x)) return x;
  const r = Number(x.toFixed(d));
  return Object.is(r, -0) || Math.abs(r) < 0.5 * Math.pow(10, -d) ? 0 : r;
}

/** Plain-text number with a typographic minus: fmt(-0.5, 2) → '−0.50'. */
export function fmt(x, d = 2) {
  if (x === undefined || x === null || Number.isNaN(x)) return '—';
  if (x === Infinity) return '∞';
  if (x === -Infinity) return MINUS + '∞';
  if (Math.abs(x) >= 1e6) {
    return x.toExponential(Math.max(1, d - 1)).replace(/-/g, MINUS);
  }
  const s = clean(x, d).toFixed(d);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Signed plain text: fmtSigned(0.5) → '+0.50'. */
export function fmtSigned(x, d = 2) {
  const s = fmt(x, d);
  return s.startsWith(MINUS) || s === '—' ? s : '+' + s;
}

/** Trim trailing zeros: fmtShort(1.500, 3) → '1.5'. */
export function fmtShort(x, d = 3) {
  const s = fmt(x, d);
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/** Number for KaTeX source, e.g. texNum(-0.5) → '-0.50'. */
export function texNum(x, d = 2) {
  if (x === undefined || x === null || Number.isNaN(x)) return '\\text{—}';
  if (x === Infinity) return '\\infty';
  if (x === -Infinity) return '-\\infty';
  const a = Math.abs(x);
  if (a >= 1e6) {
    const [m, e] = x.toExponential(Math.max(1, d - 1)).split('e');
    return `${m}\\times10^{${Number(e)}}`;
  }
  return clean(x, d).toFixed(d);
}

/** KaTeX matrix: texMatrix([[1,0],[0,1]], 2) → '\begin{pmatrix}1.00&0.00\\0.00&1.00\end{pmatrix}'.
 *  Entries may be numbers, strings (raw TeX) or {re, im} complex numbers. */
export function texMatrix(M, d = 2, env = 'pmatrix') {
  const rows = M.map((row) => row.map((e) => texEntry(e, d)).join(' & '));
  return `\\begin{${env}} ${rows.join(' \\\\ ')} \\end{${env}}`;
}

/** Column vector. */
export function texVec(v, d = 2, env = 'pmatrix') {
  return texMatrix(v.map((x) => [x]), d, env);
}

/** Row tuple: (a, b, c). */
export function texTuple(v, d = 2) {
  return `(${v.map((x) => texEntry(x, d)).join(',\\,')})`;
}

function texEntry(e, d) {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 're' in e) return texComplex(e, d);
  return texNum(e, d);
}

/** Complex number for KaTeX: {re:1, im:-2} → '1.00 - 2.00i'. Drops a part that rounds to 0. */
export function texComplex(z, d = 2) {
  const re = clean(z.re, d);
  const im = clean(z.im, d);
  if (im === 0) return texNum(re, d);
  const imAbs = Math.abs(im).toFixed(d);
  if (re === 0) return (im < 0 ? '-' : '') + imAbs + 'i';
  return `${texNum(re, d)} ${im < 0 ? '-' : '+'} ${imAbs}i`;
}

/** Plain-text complex. */
export function fmtComplex(z, d = 2) {
  return texComplex(z, d).replace(/-/g, MINUS).replace(/\s+/g, ' ');
}

/** Best rational approximation p/q with q ≤ maxDen (continued fractions). */
export function rational(x, maxDen = 64, tol = 1e-9) {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  let a = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1;
  for (let i = 0; i < 40; i++) {
    const ai = Math.floor(a);
    const h2 = ai * h1 + h0;
    const k2 = ai * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(Math.abs(x) - h1 / k1) < tol) break;
    const frac = a - ai;
    if (frac < 1e-12) break;
    a = 1 / frac;
  }
  if (k1 === 0) return null;
  return { p: sign * h1, q: k1, value: (sign * h1) / k1, exact: Math.abs(Math.abs(x) - h1 / k1) < tol };
}

/** TeX for a number that is (close to) a simple fraction, else decimal: texFrac(0.5) → '\tfrac{1}{2}'. */
export function texFrac(x, d = 2, maxDen = 12) {
  const r = rational(x, maxDen, 1e-9);
  if (!r || !r.exact) return texNum(x, d);
  if (r.q === 1) return String(r.p);
  return `${r.p < 0 ? '-' : ''}\\tfrac{${Math.abs(r.p)}}{${r.q}}`;
}

/** Angle in radians as a multiple of π when that is clean: texAngle(Math.PI/2) → '\tfrac{\pi}{2}'. */
export function texAngle(rad, d = 2) {
  const r = rational(rad / Math.PI, 12, 1e-6);
  if (r && r.exact) {
    if (r.p === 0) return '0';
    const sgn = r.p < 0 ? '-' : '';
    const p = Math.abs(r.p);
    const num = p === 1 ? '\\pi' : `${p}\\pi`;
    return r.q === 1 ? sgn + num : `${sgn}\\tfrac{${num}}{${r.q}}`;
  }
  return texNum(rad, d);
}

/** Plain-text angle in degrees: fmtDeg(Math.PI) → '180.0°'. */
export function fmtDeg(rad, d = 1) {
  return fmt((rad * 180) / Math.PI, d) + '°';
}

/** Escape text for safe insertion as HTML. */
export function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
