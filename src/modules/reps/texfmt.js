// Exact TeX / plain-text formatting for the "reps" module: half-integers, surds √n, the spin
// matrices J_z, J_±, J_x, J_y with exact entries, and Clebsch–Gordan values ±√(p/q). No DOM.

import { mValues, ladderN } from './math.js';

const MINUS = '−';

function gcdInt(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** n = a² b with b square-free (n ≥ 1 integer). */
export function squareFree(n) {
  let a = 1;
  let b = Math.round(n);
  for (let p = 2; p * p <= b; p++) {
    while (b % (p * p) === 0) {
      b /= p * p;
      a *= p;
    }
  }
  return { a, b };
}

/** Half-integer (or integer) as TeX: 3/2 → '\tfrac{3}{2}', −1/2 → '-\tfrac{1}{2}', 2 → '2'. */
export function texHalf(x) {
  const t = Math.round(2 * x);
  if (t % 2 === 0) return String(t / 2);
  return `${t < 0 ? '-' : ''}\\tfrac{${Math.abs(t)}}{2}`;
}
/** Half-integer as plain text with a typographic minus: '3/2', '−1/2', '2'. */
export function textHalf(x) {
  const t = Math.round(2 * x);
  const s = t % 2 === 0 ? String(Math.abs(t / 2)) : `${Math.abs(t)}/2`;
  return t < 0 ? MINUS + s : s;
}
/** Signed TeX for m labels: +3/2 → '+\tfrac{3}{2}', 0 → '0'. */
export function texHalfSigned(x) {
  const s = texHalf(x);
  return x > 1e-9 ? '+' + s : s;
}

/**
 * TeX for (unit) · √n / over with exact simplification, n ≥ 0 integer, over ≥ 1 integer.
 * texSurd(12) → '2\sqrt{3}', texSurd(3, 2) → '\tfrac{\sqrt{3}}{2}', texSurd(1, 2, 'i') → '\tfrac{i}{2}'.
 */
export function texSurd(n, over = 1, unit = '') {
  if (!(n > 0)) return '0';
  const { a, b } = squareFree(n);
  const g = gcdInt(a, over);
  const num = a / g;
  const den = over / g;
  const rad = b === 1 ? '' : `\\sqrt{${b}}`;
  let top = (num === 1 && (rad || unit) ? '' : String(num)) + unit + rad;
  if (!top) top = '1';
  return den === 1 ? top : `\\tfrac{${top}}{${den}}`;
}
/** Plain text √n: textSurd(12) → '2√3', textSurd(4) → '2', textSurd(6) → '√6'. */
export function textSurd(n) {
  if (!(n > 0)) return '0';
  const { a, b } = squareFree(n);
  if (b === 1) return String(a);
  return (a === 1 ? '' : String(a)) + '√' + b;
}

/**
 * Exact spin-j matrix in the basis m = j … −j as a TeX pmatrix.
 * which: 'z' | 'p' (J₊) | 'm' (J₋) | 'x' | 'y'. hiCol: column index to highlight (the image of |j m⟩).
 */
export function texSpinMatrix(j, which, hiCol = -1) {
  const ms = mValues(j);
  const n = ms.length;
  const rows = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      let e = '0';
      const up = r === c - 1; // ⟨m+1| … |m⟩ (J₊ part)
      const dn = r === c + 1; // ⟨m−1| … |m⟩ (J₋ part)
      const Nup = up ? ladderN(j, ms[c]) : 0;
      const Ndn = dn ? ladderN(j, ms[r]) : 0;
      if (which === 'z') e = r === c ? texHalf(ms[r]) : '0';
      else if (which === 'p') e = up ? texSurd(Nup) : '0';
      else if (which === 'm') e = dn ? texSurd(Ndn) : '0';
      else if (which === 'x') e = up ? texSurd(Nup, 2) : dn ? texSurd(Ndn, 2) : '0';
      else if (which === 'y') e = up ? '-' + texSurd(Nup, 2, 'i') : dn ? texSurd(Ndn, 2, 'i') : '0';
      const structural = which === 'z' && r === c; // keep an explicit 0 on the J_z diagonal
      if (c === hiCol && (e !== '0' || structural)) e = `\\hi{${e}}`;
      else if (e === '0' && !structural) e = '\\cdot';
      row.push(e);
    }
    rows.push(row.join(' & '));
  }
  return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
}

const isqrt = (n) => {
  if (n < 0n) return -1n;
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
};
function squareFreeBig(n) {
  // only small primes are needed for the denominators that occur here
  let a = 1n;
  let b = n;
  for (let p = 2n; p * p <= b && p < 2000n; p++) {
    while (b % (p * p) === 0n) {
      b /= p * p;
      a *= p;
    }
  }
  return { a, b };
}

/**
 * TeX for sign·√(num/den) (num/den reduced BigInts), as used for Clebsch–Gordan coefficients:
 * rational when exact ('1', '\tfrac{1}{2}'), '\tfrac{1}{\sqrt{2}}' when num = 1 and den is square-free,
 * otherwise '\sqrt{\tfrac{2}{3}}'.
 */
export function texSqrtRational({ sign, num, den }) {
  if (!sign || num === 0n) return '0';
  const s = sign < 0 ? '-' : '';
  const rn = isqrt(num);
  const rd = isqrt(den);
  if (rn * rn === num && rd * rd === den) return s + (rd === 1n ? String(rn) : `\\tfrac{${rn}}{${rd}}`);
  if (num === 1n && squareFreeBig(den).a === 1n) return `${s}\\tfrac{1}{\\sqrt{${den}}}`;
  if (den === 1n) return `${s}\\sqrt{${num}}`;
  return `${s}\\sqrt{\\tfrac{${num}}{${den}}}`;
}
/** Plain text for sign·√(num/den): '−√(2/3)', '1/√2', '1'. */
export function textSqrtRational({ sign, num, den }) {
  if (!sign || num === 0n) return '0';
  const s = sign < 0 ? MINUS : '';
  const rn = isqrt(num);
  const rd = isqrt(den);
  if (rn * rn === num && rd * rd === den) return s + (rd === 1n ? String(rn) : `${rn}/${rd}`);
  if (num === 1n) return `${s}1/√${den}`;
  if (den === 1n) return `${s}√${num}`;
  return `${s}√(${num}/${den})`;
}

/** Ket label for one subsystem: spin ½ uses arrows, otherwise the (half-)integer m. */
export function texM(j, m) {
  if (Math.abs(j - 0.5) < 1e-9) return m > 0 ? '\\uparrow' : '\\downarrow';
  return texHalf(m);
}
