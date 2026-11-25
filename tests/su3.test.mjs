// Numerical tests for src/modules/su3/math.js  —  node tests/su3.test.mjs
import {
  weights,
  weightMap,
  dim,
  casimir,
  triality,
  dynkinIndex,
  toIY,
  toPlane,
  fromIY,
  charge,
  key,
  unkey,
  WEYL,
  ROOTS,
  QUARKS,
  outline,
  shells,
  tensorProduct,
  PRODUCTS,
  irrepTex,
  MULTIPLETS,
  omegaPrediction,
  gmoOctet,
  su2Strings,
  LAMBDA,
  TGEN,
  YGEN,
  F,
  F_TABLE,
  fNumeric,
  generator,
  bracket,
  expand,
  rebuild,
  ip,
  SQ3,
} from '../src/modules/su3/math.js';
import { cmat, cx } from '../src/core/complex.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- coordinates & conventions
check('u = (1/2, 1/3)', close(toIY(QUARKS.u)[0], 0.5) && close(toIY(QUARKS.u)[1], 1 / 3));
check('d = (-1/2, 1/3)', close(toIY(QUARKS.d)[0], -0.5) && close(toIY(QUARKS.d)[1], 1 / 3));
check('s = (0, -2/3)', close(toIY(QUARKS.s)[0], 0) && close(toIY(QUARKS.s)[1], -2 / 3));
check('Q(u) = 2/3', close(charge(QUARKS.u), 2 / 3));
check('Q(d) = Q(s) = -1/3', close(charge(QUARKS.d), -1 / 3) && close(charge(QUARKS.s), -1 / 3));
const R = Object.fromEntries(ROOTS.map((r) => [r.id, toIY(r.dyn)]));
check('alpha1 = I+ = (1,0)', close(R['I+'][0], 1) && close(R['I+'][1], 0));
check('alpha2 = U+ = (-1/2,1)', close(R['U+'][0], -0.5) && close(R['U+'][1], 1));
check('alpha1+alpha2 = V+ = (1/2,1)', close(R['V+'][0], 0.5) && close(R['V+'][1], 1));
for (const r of ROOTS) {
  check(`|root ${r.id}| = 1 in (T3,T8)`, close(Math.hypot(...toPlane(r.dyn)), 1, 1e-12));
  // E_ij has root = weight(i) − weight(j) of the quark triplet
  const qs = [QUARKS.u, QUARKS.d, QUARKS.s];
  const diff = [qs[r.ij[0]][0] - qs[r.ij[1]][0], qs[r.ij[0]][1] - qs[r.ij[1]][1]];
  check(`root ${r.id} = q_i − q_j`, diff[0] === r.dyn[0] && diff[1] === r.dyn[1]);
}
check('I+ d = u', key([QUARKS.d[0] + 2, QUARKS.d[1] - 1]) === key(QUARKS.u));
check('U+ s = d', key([QUARKS.s[0] - 1, QUARKS.s[1] + 2]) === key(QUARKS.d));
check('V+ s = u', key([QUARKS.s[0] + 1, QUARKS.s[1] + 1]) === key(QUARKS.u));
for (const [a, b] of [
  [1, 0],
  [-1, 1],
  [3, -2],
  [0, 3],
])
  check('fromIY∘toIY', key(fromIY(toIY([a, b]))) === key([a, b]));

// ---------------------------------------------------------------- multiplicities (Freudenthal)
function pointInPolygon(pt, poly, eps = 1e-9) {
  if (poly.length === 1) return Math.hypot(pt[0] - poly[0][0], pt[1] - poly[0][1]) < eps;
  if (poly.length === 2) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
    if (cr < -eps) return false; // counter-clockwise polygon: inside ⇔ all cross products ≥ 0
  }
  return true;
}
for (let p = 0; p <= 6; p++)
  for (let q = 0; q <= 6; q++) {
    const W = weights(p, q);
    const total = W.reduce((s, w) => s + w.mult, 0);
    check(`dim(${p},${q})`, total === dim(p, q), `${total} vs ${dim(p, q)}`);
    // highest weight
    const top = W.reduce((b, w) => (w.dyn[0] + w.dyn[1] > b.dyn[0] + b.dyn[1] ? w : b));
    check(`highest weight (${p},${q})`, top.dyn[0] === p && top.dyn[1] === q && top.mult === 1);
    const M = weightMap(p, q);
    // Weyl invariance of multiplicities
    let weylOK = true;
    for (const w of W) for (const g of WEYL) if (M.get(key(g(w.dyn))) !== w.mult) weylOK = false;
    check(`Weyl invariance (${p},${q})`, weylOK);
    // conjugation: m_(q,p)(−μ) = m_(p,q)(μ)
    const Mc = weightMap(q, p);
    check(`conjugate (${p},${q})`, W.every((w) => Mc.get(key([-w.dyn[0], -w.dyn[1]])) === w.mult));
    // shell structure (independent geometric check): m(μ) = #{k ≤ min(p,q) : μ ∈ hull(W(Λ − kρ))}
    let shellOK = true;
    for (const w of W) {
      let n = 0;
      for (let k = 0; k <= Math.min(p, q); k++) if (pointInPolygon(w.pt, outline(p - k, q - k))) n++;
      if (n !== w.mult) shellOK = false;
    }
    check(`shell rule (${p},${q})`, shellOK);
    // shells() covers every weight exactly once on its boundary/vertex set and multiplicities match
    const sh = shells(p, q);
    check(`shell multiplicities rise by one then saturate (${p},${q})`, sh.every((s, i) => s.mult === Math.min(i, Math.min(p, q)) + 1));
    // Casimir: Σ m |μ|² = dim·C2·rank/dimG = dim·C2/4 ; and C2 = ⟨Λ, Λ+2ρ⟩
    const s2 = W.reduce((s, w) => s + w.mult * (w.pt[0] ** 2 + w.pt[1] ** 2), 0);
    check(`Casimir trace (${p},${q})`, close(s2, (dim(p, q) * casimir(p, q)) / 4, 1e-9), `${s2}`);
    check(`C2 = <Λ,Λ+2ρ> (${p},${q})`, close(ip([p, q], [p + 2, q + 2]), casimir(p, q)));
    // triality: 3Y ≡ p − q (mod 3) for every weight
    check(`triality (${p},${q})`, W.every((w) => ((((Math.round(3 * w.iy[1]) - (p - q)) % 3) + 3) % 3) === 0));
    // every weight in the root-lattice coset of Λ
    check(`root lattice coset (${p},${q})`, W.every((w) => (((w.dyn[0] - p) * 2 + (w.dyn[1] - q)) % 3 + 3) % 3 === 0));
  }
check('C2(3) = 4/3', close(casimir(1, 0), 4 / 3));
check('C2(8) = 3', close(casimir(1, 1), 3));
check('C2(10) = 6', close(casimir(3, 0), 6));
check('T(3) = 1/2, T(8) = 3', close(dynkinIndex(1, 0), 0.5) && close(dynkinIndex(1, 1), 3));
check('triality 3 → 1, 3bar → 2, 8 → 0, 10 → 0', triality(1, 0) === 1 && triality(0, 1) === 2 && triality(1, 1) === 0 && triality(3, 0) === 0);
// explicit multiplicity patterns
const m8 = weightMap(1, 1);
check('octet: centre has multiplicity 2', m8.get('0,0') === 2 && m8.size === 7);
const m27 = weightMap(2, 2);
check('27: centre 3, inner hexagon 2, outer 1', m27.get('0,0') === 3 && m27.get('1,1') === 2 && m27.get('2,2') === 1);
const m10 = weightMap(3, 0);
check('decuplet: all multiplicities 1', [...m10.values()].every((m) => m === 1) && m10.size === 10);
const m64 = weightMap(3, 3);
check('64: centre multiplicity 4', m64.get('0,0') === 4);
const m60 = weightMap(4, 2);
check('(4,2): multiplicity saturates at 3 inside the triangle', Math.max(...m60.values()) === 3);
// highest weights (I3, Y) as in the physics literature
check('octet highest weight = proton (1/2, 1)', close(toIY([1, 1])[0], 0.5) && close(toIY([1, 1])[1], 1));
check('decuplet highest weight = Δ++ (3/2, 1)', close(toIY([3, 0])[0], 1.5) && close(toIY([3, 0])[1], 1));
check('irrepTex', irrepTex(0, 1) === '\\overline{\\mathbf{3}}' && irrepTex(4, 0) === "\\mathbf{15}'");

// ---------------------------------------------------------------- su(2) subalgebras
const iso = su2Strings(1, 1, 'I').map((l) => l.spins.slice().sort().join('+'));
check('octet isospin content: N(1/2), Σ(1)+Λ(0), Ξ(1/2)', iso.sort().join(' ') === ['0+1', '0.5', '0.5'].sort().join(' '), iso.join(' '));
const isoDec = su2Strings(3, 0, 'I').map((l) => l.spins.join('+')).sort();
check('decuplet isospin: 3/2, 1, 1/2, 0', isoDec.join(' ') === ['0', '0.5', '1', '1.5'].sort().join(' '), isoDec.join(' '));
for (const w of ['I', 'U', 'V']) {
  const tot = su2Strings(2, 1, w).reduce((s, l) => s + l.spins.reduce((t, j) => t + 2 * j + 1, 0), 0);
  check(`${w}-spin multiplets fill the 15`, tot === 15);
}
// U-spin lines have constant charge
for (const l of su2Strings(3, 0, 'U')) {
  const qs = l.states.map((s) => charge(s.dyn));
  check('U-spin multiplet has constant Q', qs.every((x) => close(x, qs[0])));
}

// ---------------------------------------------------------------- tensor products
function dec(factors) {
  const t = tensorProduct(factors);
  return t.parts.map((x) => `${dim(x.p, x.q)}${x.p < x.q ? 'b' : ''}${x.n > 1 ? 'x' + x.n : ''}`).join('+');
}
check('3 x 3bar = 8 + 1', dec([[1, 0], [0, 1]]) === '8+1', dec([[1, 0], [0, 1]]));
check('3 x 3 = 6 + 3bar', dec([[1, 0], [1, 0]]) === '6+3b', dec([[1, 0], [1, 0]]));
check('3 x 3 x 3 = 10 + 8 + 8 + 1', dec([[1, 0], [1, 0], [1, 0]]) === '10+8x2+1', dec([[1, 0], [1, 0], [1, 0]]));
check('8 x 8 = 27 + 10 + 10bar + 8 + 8 + 1', dec([[1, 1], [1, 1]]) === '27+10+10b+8x2+1', dec([[1, 1], [1, 1]]));
check('3 x 8 = 15 + 6bar + 3', dec([[1, 0], [1, 1]]) === '15+6b+3', dec([[1, 0], [1, 1]]));
check('6 x 3 = 10 + 8', dec([[2, 0], [1, 0]]) === '10+8', dec([[2, 0], [1, 0]]));
for (const P of PRODUCTS) {
  const t = tensorProduct(P.factors);
  const prodDim = P.factors.reduce((s, [p, q]) => s * dim(p, q), 1);
  const sumDim = t.parts.reduce((s, x) => s + x.n * dim(x.p, x.q), 0);
  check(`dims add up: ${P.id}`, t.total === prodDim && sumDim === prodDim);
  // triality 0 is necessary (not sufficient: 6 ⊗ 3 = 10 ⊕ 8 has triality 0 and no singlet)
  check(`singlet ⇒ triality 0: ${P.id}`, !(t.singlets > 0) || t.triality === 0);
  check(`every part has the product's triality: ${P.id}`, t.parts.every((x) => triality(x.p, x.q) === t.triality));
}
// a bigger random-ish check: (2,1) x (1,2) dimensions
{
  const t = tensorProduct([
    [2, 1],
    [1, 2],
  ]);
  check('15 x 15bar dims', t.parts.reduce((s, x) => s + x.n * dim(x.p, x.q), 0) === 225 && t.singlets === 1);
}

// ---------------------------------------------------------------- hadron data
for (const [name, M] of Object.entries(MULTIPLETS)) {
  const W = weightMap(...M.pq);
  const counts = new Map();
  for (const P of M.particles) counts.set(key(P.dyn), (counts.get(key(P.dyn)) || 0) + 1);
  check(`${name}: particles sit on weights with the right multiplicity`, [...counts].every(([k, n]) => W.get(k) === n) && counts.size === W.size);
}
const expectQ = { p: 1, n: 0, '\\Sigma^+': 1, '\\Sigma^0': 0, '\\Lambda': 0, '\\Sigma^-': -1, '\\Xi^0': 0, '\\Xi^-': -1, '\\Delta^{++}': 2, '\\Delta^-': -1, '\\Omega^-': -1, 'K^+': 1, 'K^-': -1, '\\pi^+': 1, '\\pi^-': -1, '\\bar K^0': 0 };
for (const M of Object.values(MULTIPLETS))
  for (const P of M.particles) if (P.tex in expectQ) check(`Q(${P.tex})`, close(charge(P.dyn), expectQ[P.tex]));
// quark content reproduces (I3, Y)
const QW = { u: QUARKS.u, d: QUARKS.d, s: QUARKS.s };
for (const P of [...MULTIPLETS.baryons.particles, ...MULTIPLETS.decuplet.particles]) {
  const w = [...P.q].reduce((s, ch) => [s[0] + QW[ch][0], s[1] + QW[ch][1]], [0, 0]);
  check(`quark content of ${P.tex}`, key(w) === key(P.dyn));
}
const om = omegaPrediction();
check('Ω⁻ prediction within 10 MeV', Math.abs(om.predicted - om.observed) < 10, JSON.stringify(om));
const g = gmoOctet();
check('GMO octet within 1%', Math.abs(g.rel) < 0.01, JSON.stringify(g));

// ---------------------------------------------------------------- Gell-Mann matrices
const herm = (A) => cmat.almostEqual(A, cmat.dagger(A), 1e-14);
for (let a = 0; a < 8; a++) {
  check(`λ${a + 1} Hermitian`, herm(LAMBDA[a]));
  check(`λ${a + 1} traceless`, cx.abs(cmat.trace(LAMBDA[a])) < 1e-14);
  for (let b = 0; b < 8; b++) {
    const t = cmat.trace(cmat.mul(TGEN[a], TGEN[b]));
    check(`tr(T${a + 1}T${b + 1}) = δ/2`, close(t.re, a === b ? 0.5 : 0, 1e-14) && close(t.im, 0, 1e-14));
    // [T_a, T_b] = i f_abc T_c
    let rhs = cmat.zeros(3);
    for (let c = 0; c < 8; c++) if (F[a][b][c]) rhs = cmat.add(rhs, cmat.scale(TGEN[c], { re: 0, im: F[a][b][c] }));
    check(`[T${a + 1},T${b + 1}] = i f T`, cmat.almostEqual(cmat.comm(TGEN[a], TGEN[b]), rhs, 1e-14));
    for (let c = 0; c < 8; c++) check(`f numeric ${a}${b}${c}`, close(fNumeric(a, b, c), F[a][b][c], 1e-13));
  }
}
// total antisymmetry and normalisation Σ f_acd f_bcd = 3 δ_ab (C2(adjoint) = 3)
for (let a = 0; a < 8; a++)
  for (let b = 0; b < 8; b++) {
    let s = 0;
    for (let c = 0; c < 8; c++) for (let d = 0; d < 8; d++) s += F[a][c][d] * F[b][c][d];
    check(`Σ f f = 3δ (${a},${b})`, close(s, a === b ? 3 : 0, 1e-12));
  }
check('F table has 9 independent entries', F_TABLE.length === 9);
// Casimir in the 3: Σ T_a T_a = 4/3
let cas = cmat.zeros(3);
for (const T of TGEN) cas = cmat.add(cas, cmat.mul(T, T));
check('Σ T_a² = 4/3 · 1', cmat.almostEqual(cas, cmat.scale(cmat.eye(3), 4 / 3), 1e-14));
check('Y = diag(1/3,1/3,−2/3)', close(YGEN[0][0].re, 1 / 3) && close(YGEN[1][1].re, 1 / 3) && close(YGEN[2][2].re, -2 / 3));
// Cartan eigenvalues on the quark basis reproduce the weights (T3, T8)
const basis = [QUARKS.u, QUARKS.d, QUARKS.s];
basis.forEach((q, i) => {
  check(`T3 eigenvalue of quark ${i}`, close(TGEN[2][i][i].re, toPlane(q)[0]));
  check(`T8 eigenvalue of quark ${i}`, close(TGEN[7][i][i].re, toPlane(q)[1]));
});
// ladder operators: [H, E_α] = α(H) E_α, and E_α = T ± iT combinations
for (const r of ROOTS) {
  const E = generator(r.id);
  const [a3, a8] = toPlane(r.dyn);
  check(`[T3, E_${r.id}] = α3 E`, cmat.almostEqual(cmat.comm(TGEN[2], E), cmat.scale(E, a3), 1e-14));
  check(`[T8, E_${r.id}] = α8 E`, cmat.almostEqual(cmat.comm(TGEN[7], E), cmat.scale(E, a8), 1e-14));
}
const Ip = cmat.add(TGEN[0], cmat.scale(TGEN[1], { re: 0, im: 1 }));
const Vp = cmat.add(TGEN[3], cmat.scale(TGEN[4], { re: 0, im: 1 }));
const Up = cmat.add(TGEN[5], cmat.scale(TGEN[6], { re: 0, im: 1 }));
check('I+ = T1 + iT2', cmat.almostEqual(Ip, generator('I+'), 1e-14));
check('V+ = T4 + iT5', cmat.almostEqual(Vp, generator('V+'), 1e-14));
check('U+ = T6 + iT7', cmat.almostEqual(Up, generator('U+'), 1e-14));
// brackets: roots add
const br = (x, y) => bracket(x, y).terms.map((t) => `${t.id}:${+t.coef.re.toFixed(6)}${t.coef.im ? 'i' + t.coef.im.toFixed(6) : ''}`).join(' ');
check('[I+,U+] = V+', br('I+', 'U+') === 'V+:1', br('I+', 'U+'));
check('[I+,I-] = 2 T3', br('I+', 'I-') === 'T3:2', br('I+', 'I-'));
check('[U+,U-] = −T3 + √3 T8', br('U+', 'U-') === `T3:-1 T8:${+SQ3.toFixed(6)}`, br('U+', 'U-'));
check('[I+,V+] = 0 (2α1+α2 not a root)', bracket('I+', 'V+').terms.length === 0);
check('[T3, V+] = ½ V+', br('T3', 'V+') === 'V+:0.5', br('T3', 'V+'));
for (const x of ['I+', 'I-', 'U+', 'U-', 'V+', 'V-', 'T3', 'T8'])
  for (const y of ['I+', 'I-', 'U+', 'U-', 'V+', 'V-', 'T3', 'T8']) {
    const { M, terms } = bracket(x, y);
    check(`expansion rebuilds [${x},${y}]`, cmat.almostEqual(rebuild(terms), M, 1e-13));
  }
// Jacobi identity on random combinations
{
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0; t < 20; t++) {
    const mk = () => TGEN.reduce((A, T) => cmat.add(A, cmat.scale(T, rnd())), cmat.zeros(3));
    const X = mk(),
      Y = mk(),
      Z = mk();
    const J = cmat.add(cmat.add(cmat.comm(X, cmat.comm(Y, Z)), cmat.comm(Y, cmat.comm(Z, X))), cmat.comm(Z, cmat.comm(X, Y)));
    check('Jacobi', cmat.maxAbs(J) < 1e-13);
  }
}
// a singlet appears in A ⊗ B iff B is the conjugate of A (two factors)
for (const [A, Bq] of [[[1,0],[0,1]],[[1,1],[1,1]],[[2,0],[1,0]],[[2,1],[1,2]],[[2,1],[2,1]],[[3,0],[0,3]]]) {
  const t = tensorProduct([A, Bq]);
  check(`singlet iff conjugate ${A}x${Bq}`, (t.singlets === 1) === (A[0] === Bq[1] && A[1] === Bq[0]));
}
void expand;
void unkey;

console.log(`su3: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
