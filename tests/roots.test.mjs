// Numerical tests for src/modules/roots/math.js  —  node tests/roots.test.mjs
import {
  rootSystem,
  rootSystemA1A1,
  GALLERY,
  EXPECTED,
  coxeterPlane,
  coxeterOrbits,
  project,
  nearestEdges,
  weylOrbitSize,
  weylElements,
  reflectionMatrix,
  classifyCartan,
  cartanFromBonds,
  su5Roots,
  SU5_CHARGES,
  gram,
} from '../src/modules/roots/math.js';
import { mat, vec } from '../src/core/la.js';

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

for (const [t, n] of GALLERY) {
  const S = rootSystem(t, n);
  const tag = `${t}${n}`;
  check(`#roots ${tag}`, S.roots.length === EXPECTED.roots(t, n), `${S.roots.length}`);
  check(`h ${tag}`, S.h === EXPECTED.h(t, n), `${S.h}`);
  check(`h = #roots/rank ${tag}`, S.h * n === S.roots.length);
  check(`|W| from exponents ${tag}`, S.weylOrder === EXPECTED.weyl(t, n), `${S.weylOrder}`);
  check(`dim ${tag}`, S.dim === EXPECTED.dim(t, n), `${S.dim}`);
  check(`exponents sum = #pos roots ${tag}`, S.exponents.reduce((s, m) => s + m, 0) === S.positive.length);
  check(`smallest exponent 1, largest h−1 ${tag}`, S.exponents[0] === 1 && S.exponents[S.exponents.length - 1] === S.h - 1);
  // Cartan matrix ↔ Gram matrix of the Euclidean simple roots
  let cartanOK = true;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = S.simple[i];
      const b = S.simple[j];
      if (!close((2 * vec.dot(a, b)) / vec.dot(b, b), S.A[i][j], 1e-9)) cartanOK = false;
    }
  check(`A_ij = 2<a_i,a_j>/<a_j,a_j> ${tag}`, cartanOK);
  // root lengths: long = 2; ratio 2 (BCF) or 3 (G)
  const lens = [...new Set(S.roots.map((r) => Math.round(r.len2 * 1e6) / 1e6))].sort();
  const want = t === 'G' ? [0.666667, 2] : ['B', 'C', 'F'].includes(t) && n > 1 ? [1, 2] : [2];
  check(`root lengths ${tag}`, JSON.stringify(lens) === JSON.stringify(want), JSON.stringify(lens));
  // closure: reflection of any root in any root is a root
  const keys = new Set(S.roots.map((r) => r.v.map((x) => Math.round(x * 1e6)).join(',')));
  if (S.roots.length <= 130) {
    let closed = true;
    for (const a of S.roots)
      for (const b of S.roots) {
        const r = vec.sub(b.v, vec.scale(a.v, (2 * vec.dot(a.v, b.v)) / a.len2));
        if (!keys.has(r.map((x) => Math.round(x * 1e6)).join(','))) closed = false;
      }
    check(`closed under all reflections ${tag}`, closed);
  }
  // Coxeter element: w^h = 1, no smaller power on the roots (eigenvalue e^{2πi/h})
  const W = S.coxeter.matrix;
  check(`w^h = I ${tag}`, mat.almostEqual(mat.pow(W, S.h), mat.eye(n), 1e-9));
  if (S.h > 1) check(`w^(h/k) != I ${tag}`, !mat.almostEqual(mat.pow(W, S.h - 1), mat.eye(n), 1e-6));
  const orbits = coxeterOrbits(S);
  check(`Coxeter orbits have size h ${tag}`, orbits.every((o) => o.length === S.h) && orbits.length === n);
  // Coxeter plane: orthonormal, w acts on it as rotation by 2π/h
  if (n > 1) {
    const P = coxeterPlane(S);
    check(`plane orthonormal ${tag}`, close(vec.norm(P.x), 1) && close(vec.norm(P.y), 1) && Math.abs(vec.dot(P.x, P.y)) < 1e-9 && Math.abs(P.dot) < 1e-9);
    const wx = mat.mulv(W, P.x);
    const c = Math.cos((2 * Math.PI) / S.h);
    const s = Math.sin((2 * Math.PI) / S.h);
    // w(Re z) = Re(λ z) = c Re z − s Im z (z = Re + i Im, λ = e^{2πi/h})
    check(`w rotates the Coxeter plane by 2π/h ${tag}`, vec.dist(wx, vec.sub(vec.scale(P.x, c), vec.scale(P.y, s))) < 1e-9);
    // each Coxeter orbit projects to a regular h-gon on one ring
    const pts = project(S, P);
    check(`orbits on rings ${tag}`, orbits.every((o) => o.every((i) => close(Math.hypot(...pts[i]), Math.hypot(...pts[o[0]]), 1e-9))));
  }
}
// E8 Petrie picture: 240 roots on 8 rings of 30
{
  const S = rootSystem('E', 8);
  const pts = project(S, coxeterPlane(S));
  const rings = new Map();
  for (const p of pts) {
    const r = Math.round(Math.hypot(p[0], p[1]) * 1e6);
    rings.set(r, (rings.get(r) || 0) + 1);
  }
  check('E8: 8 rings', rings.size === 8, `${rings.size}`);
  check('E8: 30 roots per ring', [...rings.values()].every((c) => c === 30), JSON.stringify([...rings.values()]));
  const { edges, d2min } = nearestEdges(S);
  check('E8: 6720 nearest-neighbour edges (<a,b> = 1)', edges.length === 6720 && close(d2min, 2), `${edges.length} ${d2min}`);
}
// |W| by orbit enumeration (rank ≤ 4, and E6)
for (const [t, n] of GALLERY.filter(([t, n]) => n <= 4 || (t === 'E' && n === 6))) {
  const S = rootSystem(t, n);
  check(`|W| orbit ${t}${n}`, weylOrbitSize(S.A) === EXPECTED.weyl(t, n));
}
// rank-2 systems and their Weyl groups as explicit matrices
const R2 = [
  [rootSystemA1A1(), 4, 4, 2],
  [rootSystem('A', 2), 6, 6, 3],
  [rootSystem('B', 2), 8, 8, 4],
  [rootSystem('C', 2), 8, 8, 4],
  [rootSystem('G', 2), 12, 12, 6],
];
for (const [S, nr, nw, h] of R2) {
  check(`rank-2 #roots ${S.name}`, S.roots.length === nr);
  check(`rank-2 h ${S.name}`, S.h === h);
  const { els } = weylElements(S);
  check(`rank-2 |W| ${S.name}`, els.length === nw && S.weylOrder === nw);
  // the longest element has length = #positive roots
  check(`longest word = #positive roots ${S.name}`, Math.max(...els.map((e) => e.word.length)) === S.positive.length);
  // every element is orthogonal and maps roots to roots
  const keys = new Set(S.roots.map((r) => r.v.map((x) => Math.round(x * 1e6)).join(',')));
  check(`W permutes roots ${S.name}`, els.every((e) => S.roots.every((r) => keys.has(mat.mulv(e.M, r.v).map((x) => Math.round(x * 1e6)).join(',')))));
  // words reproduce the matrices
  check(`reduced words ${S.name}`, els.every((e) => mat.almostEqual(e.word.reduce((M, i) => mat.mul(M, reflectionMatrix(S.simple[i])), mat.eye(2)), e.M, 1e-9)));
}
// angle and length ratio of simple roots
const ang = (S) => (Math.acos(vec.dot(S.simple[0], S.simple[1]) / (vec.norm(S.simple[0]) * vec.norm(S.simple[1]))) * 180) / Math.PI;
check('A2 angle 120°', close(ang(rootSystem('A', 2)), 120, 1e-9));
check('B2 angle 135°', close(ang(rootSystem('B', 2)), 135, 1e-9));
check('G2 angle 150°, ratio √3', close(ang(rootSystem('G', 2)), 150, 1e-9) && close(vec.norm(rootSystem('G', 2).simple[1]) / vec.norm(rootSystem('G', 2).simple[0]), Math.sqrt(3)));
check('A1xA1 angle 90°', close(ang(rootSystemA1A1()), 90, 1e-9));
// rank 3: A3 cuboctahedron (24 edges), B3/C3 18 roots, |W| 24/48/48
check('A3: 12 roots, 24 cuboctahedron edges', rootSystem('A', 3).roots.length === 12 && nearestEdges(rootSystem('A', 3)).edges.length === 24);
check('B3/C3: 18 roots', rootSystem('B', 3).roots.length === 18 && rootSystem('C', 3).roots.length === 18);
check('|W(A3)|=24, |W(B3)|=|W(C3)|=48', weylElements(rootSystem('A', 3)).els.length === 24 && weylElements(rootSystem('B', 3)).els.length === 48 && weylElements(rootSystem('C', 3)).els.length === 48);
// positivity: why only these diagrams
check('finite: A4', classifyCartan(rootSystem('A', 4).A).kind === 'finite');
check('affine: triangle (A2 loop)', classifyCartan(cartanFromBonds(3, [[0, 1, 1], [1, 2, 1], [2, 0, 1]])).kind === 'affine');
check('affine: D4 with a 5th leg (Ẽ... star K_{1,4})', classifyCartan(cartanFromBonds(5, [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]])).kind === 'affine');
check('indefinite: E9 extended to E10', classifyCartan(cartanFromBonds(10, [[0, 2, 1], [2, 3, 1], [1, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 8, 1], [8, 9, 1]])).kind === 'indefinite');
check('affine: E8 extended (E9)', classifyCartan(cartanFromBonds(9, [[0, 2, 1], [2, 3, 1], [1, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 8, 1]])).kind === 'affine');
check('finite: E8', classifyCartan(rootSystem('E', 8).A).kind === 'finite');
check('Gram of E8 has det 1 (unimodular)', close(mat.det(gram(rootSystem('E', 8).A, rootSystem('E', 8).lengths)), 1, 1e-8));
// SU(5) GUT: 20 roots = 6 gluons + 2 W + 12 X/Y ; charges of X/Y bosons
const s5 = su5Roots();
const count = (t) => s5.filter((r) => r.type === t).length;
check('SU(5): 6 + 2 + 12 roots', count('gluon') === 6 && count('W') === 2 && count('XY') === 12);
const Yq = (r) => vec.dot(SU5_CHARGES.Y, r.v);
check('X/Y bosons have |Y| = 5/6', s5.filter((r) => r.type === 'XY').every((r) => close(Math.abs(Yq(r)), 5 / 6)));
check('gluons and W have Y = 0', s5.filter((r) => r.type !== 'XY').every((r) => close(Yq(r), 0)));
const Qem = (r) => vec.dot(SU5_CHARGES.T3w, r.v) + Yq(r);
check('X/Y charges ±4/3, ±1/3', s5.filter((r) => r.type === 'XY').every((r) => [4 / 3, 1 / 3].some((q) => close(Math.abs(Qem(r)), q))));
check('Y is traceless and orthogonal to colour/weak Cartans', close(SU5_CHARGES.Y.reduce((a, b) => a + b, 0), 0) && close(vec.dot(SU5_CHARGES.Y, SU5_CHARGES.T3w), 0) && close(vec.dot(SU5_CHARGES.Y, SU5_CHARGES.T8c), 0));

console.log(`roots: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
