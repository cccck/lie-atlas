#!/usr/bin/env node
// Numerical checks for src/modules/torus/math.js:  node tests/torus.test.mjs
import {
  TAU,
  wrapPi,
  torusPoint,
  torusTangents,
  torusDist,
  lissajous,
  continuedFraction,
  convergents,
  gcd,
  ratioInfo,
  traverse,
  Coverage,
  flatSegments,
  pointSegmentDist,
  ReturnTracker,
  energy,
  degeneracy,
  spectrum,
  torusKnotCrossings,
  torusKnotName,
  logMap,
  logInv,
} from '../src/modules/torus/math.js';
import { mulberry32 } from '../src/core/la.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const rng = mulberry32(5);
const rand = (a, b) => a + (b - a) * rng();
const PHI = (1 + Math.sqrt(5)) / 2;
const fib = [1, 1];
while (fib.length < 40) fib.push(fib.at(-1) + fib.at(-2));

// ---------------------------------------------------------------- group T^2 = U(1) x U(1)
for (let i = 0; i < 200; i++) {
  const a = [rand(-20, 20), rand(-20, 20)];
  const b = [rand(-20, 20), rand(-20, 20)];
  // exp(a)·exp(b) = exp(a+b) componentwise (abelian): angle addition mod 2π
  const lhs = [wrapPi(a[0] + b[0]), wrapPi(a[1] + b[1])];
  const rhs = [wrapPi(wrapPi(a[0]) + wrapPi(b[0])), wrapPi(wrapPi(a[1]) + wrapPi(b[1]))];
  check('homomorphism mod 2π', torusDist(lhs, rhs) < 1e-12);
  // kernel 2πZ^2
  const k = [Math.round(rand(-3, 3)), Math.round(rand(-3, 3))];
  check('kernel 2πZ²', torusDist(a, [a[0] + TAU * k[0], a[1] + TAU * k[1]]) < 1e-11);
  check('wrapPi range', wrapPi(a[0]) > -Math.PI && wrapPi(a[0]) <= Math.PI);
  // embedding: |P| relations and tangent vectors by finite differences
  const R = 2;
  const r = 0.75;
  const P = torusPoint(R, r, a[0], a[1]);
  check('on torus', close(Math.pow(Math.hypot(P[0], P[1]) - R, 2) + P[2] * P[2], r * r, 1e-12));
  const [T1, T2] = torusTangents(R, r, a[0], a[1]);
  const h = 1e-6;
  const P1 = torusPoint(R, r, a[0] + h, a[1]);
  const P2 = torusPoint(R, r, a[0], a[1] + h);
  check('dP/dθ1', [0, 1, 2].every((c) => close((P1[c] - P[c]) / h, T1[c], 1e-5)));
  check('dP/dθ2', [0, 1, 2].every((c) => close((P2[c] - P[c]) / h, T2[c], 1e-5)));
  check('tangents orthogonal', close(T1[0] * T2[0] + T1[1] * T2[1] + T1[2] * T2[2], 0, 1e-12));
  // Lissajous is the projection to configuration space
  const L = lissajous(a[0], a[1]);
  check('lissajous', close(L[0], Math.cos(a[0])) && close(L[1], Math.cos(a[1])));
}
check('torusDist max is π√2', close(torusDist([0, 0], [Math.PI, Math.PI]), Math.PI * Math.SQRT2, 1e-12));

// ---------------------------------------------------------------- continued fractions
{
  const cfG = continuedFraction(1 / PHI);
  check('1/φ = [0;1,1,1,...]', cfG[0] === 0 && cfG.slice(1, 12).every((a) => a === 1), JSON.stringify(cfG));
  const cvG = convergents(cfG);
  // convergents of 1/φ are ratios of consecutive Fibonacci numbers
  for (let k = 1; k < Math.min(cvG.length, 12); k++)
    check('Fibonacci convergents', cvG[k].p === fib[k - 1] && cvG[k].q === fib[k], JSON.stringify(cvG[k]));
  const cfS = continuedFraction(1 / Math.SQRT2);
  check('1/√2 = [0;1,2,2,2,...]', cfS[0] === 0 && cfS[1] === 1 && cfS.slice(2, 10).every((a) => a === 2), JSON.stringify(cfS));
  const cvS = convergents(cfS);
  check('√2 convergents 2/3, 5/7, 12/17', cvS[2].p === 2 && cvS[2].q === 3 && cvS[3].p === 5 && cvS[3].q === 7 && cvS[4].p === 12 && cvS[4].q === 17);
  const cfP = continuedFraction(1 / Math.PI);
  check('1/π = [0;3,7,15,1,292,...]', [0, 3, 7, 15, 1, 292].every((a, i) => cfP[i] === a), JSON.stringify(cfP));
  const cvP = convergents(cfP);
  check('1/π convergents 1/3, 7/22, 106/333, 113/355', cvP[1].q === 3 && cvP[2].p === 7 && cvP[2].q === 22 && cvP[3].q === 333 && cvP[4].p === 113 && cvP[4].q === 355);
  check('π CF', [3, 7, 15, 1, 292].every((a, i) => continuedFraction(Math.PI)[i] === a));
  check('2/3 terminates', JSON.stringify(continuedFraction(2 / 3)) === '[0,1,2]');
  check('3/5 terminates', JSON.stringify(continuedFraction(3 / 5)) === '[0,1,1,2]');
  check('integer', JSON.stringify(continuedFraction(2)) === '[2]');
  // classical properties for random reals
  for (let i = 0; i < 200; i++) {
    const x = rand(0.05, 5);
    const cv = convergents(continuedFraction(x));
    for (let k = 0; k < cv.length; k++) {
      const { p, q } = cv[k];
      check('|x - p/q| < 1/q²', Math.abs(x - p / q) < 1 / (q * q) + 1e-12, JSON.stringify({ x, p, q }));
      check('convergent in lowest terms', gcd(p, q) === 1);
      if (k > 0) check('p_k q_{k-1} - p_{k-1} q_k = ±1', Math.abs(p * cv[k - 1].q - cv[k - 1].p * q) === 1);
      // best approximation of the second kind (Lagrange): |q x - p| beats every smaller denominator
      if (q <= 300 && k >= 1) {
        const e = Math.abs(q * x - p);
        let best = Infinity;
        for (let qq = 1; qq < q; qq++) best = Math.min(best, Math.abs(qq * x - Math.round(qq * x)));
        check('best approximation 2nd kind', e < best + 1e-12, JSON.stringify({ x, p, q, e, best }));
      }
    }
  }
}

// ---------------------------------------------------------------- ratioInfo / closure
{
  const r23 = ratioInfo(2, 3);
  check('2:3 rational', r23.rational && r23.rational.p === 2 && r23.rational.q === 3 && close(r23.rational.T, TAU, 1e-12));
  const r11 = ratioInfo(1, 1);
  check('1:1 period 2π', r11.rational.p === 1 && r11.rational.q === 1 && close(r11.rational.T, TAU, 1e-12));
  const r42 = ratioInfo(4, 2);
  check('4:2 -> 2:1, T = π', r42.rational.p === 2 && r42.rational.q === 1 && close(r42.rational.T, Math.PI, 1e-12));
  check('golden irrational', ratioInfo(1, PHI).rational === null);
  check('√2 irrational', ratioInfo(1, Math.SQRT2).rational === null);
  check('π irrational', ratioInfo(1, Math.PI).rational === null);
  const sl = ratioInfo(1.37, 2.0); // slider values are always rational
  check('slider 1.37:2 = 137:200', sl.rational && sl.rational.p === 137 && sl.rational.q === 200, JSON.stringify(sl.rational));
  // a closed orbit really closes after T and not before: the orbit returns to the start
  for (const [p, q] of [
    [1, 1],
    [1, 2],
    [2, 3],
    [3, 5],
    [5, 7],
  ]) {
    const w1 = p * 0.7;
    const w2 = q * 0.7;
    const { rational } = ratioInfo(w1, w2);
    const T = rational.T;
    check(`${p}:${q} closes at T`, torusDist([w1 * T, 0.3 + w2 * T], [0, 0.3]) < 1e-9);
    // first return: no time in (0, T) away from the endpoints comes back to the start; the closest
    // approach is the spacing of the parallel strands, 2π/√(p²+q²)
    let minD = Infinity;
    const te = Math.PI / Math.hypot(w1, w2);
    for (let i = 1; i < 20000; i++) {
      const t = (T * i) / 20000;
      if (t < te || t > T - te) continue;
      minD = Math.min(minD, torusDist([w1 * t, w2 * t], [0, 0]));
    }
    check(`${p}:${q} no earlier return`, minD > 0.99 * (TAU / Math.hypot(p, q)) || minD >= Math.PI - 1e-6, `${minD} vs ${TAU / Math.hypot(p, q)}`);
    check(`${p}:${q} windings`, rational.p === p && rational.q === q && close(w1 * T, TAU * p, 1e-9) && close(w2 * T, TAU * q, 1e-9));
  }
}

// ---------------------------------------------------------------- traversal & coverage
{
  // traversal covers the time interval exactly and visits adjacent cells
  for (let i = 0; i < 100; i++) {
    const x0 = rand(-5, 5);
    const y0 = rand(-5, 5);
    const vx = rand(-3, 3);
    const vy = rand(-3, 3);
    const T = rand(0.1, 20);
    const h = rand(0.05, 1);
    let last = null;
    let total = 0;
    let ok = true;
    traverse(x0, y0, vx, vy, h, T, (ci, cj, t0, t1) => {
      // the midpoint of each interval lies in the reported cell
      const tm = (t0 + t1) / 2;
      const cx = Math.floor((x0 + vx * tm) / h);
      const cy = Math.floor((y0 + vy * tm) / h);
      if (cx !== ci || cy !== cj) ok = false;
      if (last) {
        if (Math.abs(last.t1 - t0) > 1e-9) ok = false;
        if (Math.abs(ci - last.i) + Math.abs(cj - last.j) > 2) ok = false;
      }
      total += t1 - t0;
      last = { i: ci, j: cj, t1 };
    });
    check('traverse cells correct & contiguous', ok);
    check('traverse covers [0,T]', close(total, T, 1e-9));
  }
  // number of cells crossed = 1 + number of grid lines crossed (generic line)
  {
    const h = 0.1;
    let n = 0;
    traverse(0.0123, 0.0456, 1, Math.SQRT2, h, 10, () => n++);
    const lines = Math.floor((0.0123 + 10) / h) - Math.floor(0.0123 / h) + Math.floor((0.0456 + 10 * Math.SQRT2) / h) - Math.floor(0.0456 / h);
    check('cells = 1 + crossings', n === 1 + lines, `${n} vs ${1 + lines}`);
  }
  // coverage of a closed p:q orbit saturates at N(p+q) cells (generic start), i.e. (p+q)/N of the torus
  const N = 60;
  for (const [p, q] of [
    [1, 1],
    [1, 2],
    [2, 3],
    [3, 5],
    [5, 7],
  ]) {
    const cov = new Coverage(N);
    const w1 = p * 0.9;
    const w2 = q * 0.9;
    const phi = 1.234;
    const T = (TAU * p) / w1;
    // add in several chunks (as the animation does)
    let t = 0;
    while (t < 3 * T) {
      const dt = Math.min(0.37, 3 * T - t);
      cov.add(w1 * t, phi + w2 * t, w1, w2, dt);
      t += dt;
    }
    check(`coverage ${p}:${q} = N(p+q)`, cov.count === N * (p + q), `${cov.count} vs ${N * (p + q)}`);
    check(`fraction ${p}:${q}`, close(cov.fraction, (p + q) / N, 1e-12));
  }
  // an irrational (golden) orbit eventually visits every cell; a rational one never exceeds its band
  {
    const cov = new Coverage(N);
    let t = 0;
    const w1 = 1;
    const w2 = PHI;
    while (t < 600) {
      cov.add(w1 * t, 0.5 + w2 * t, w1, w2, 0.5);
      t += 0.5;
    }
    check('golden fills the torus', cov.fraction === 1, String(cov.fraction));
    const cov2 = new Coverage(N);
    t = 0;
    while (t < 600) {
      cov2.add(1.0 * t, 0.5 + 1.6 * t, 1.0, 1.6, 0.5); // 5:8 — close to golden but rational
      t += 0.5;
    }
    check('5:8 saturates at 13/60', close(cov2.fraction, 13 / 60, 1e-12), String(cov2.fraction));
  }
}

// ---------------------------------------------------------------- flat segments
for (let i = 0; i < 50; i++) {
  const w1 = rand(0.2, 4);
  const w2 = rand(0.2, 4);
  const phi = rand(0, TAU);
  const ta = rand(0, 30);
  const tb = ta + rand(0.1, 40);
  const segs = flatSegments(0, phi, w1, w2, ta, tb);
  let ok = true;
  let len = 0;
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    for (const pt of [s.a, s.b]) if (pt[0] < -1e-9 || pt[0] > TAU + 1e-9 || pt[1] < -1e-9 || pt[1] > TAU + 1e-9) ok = false;
    len += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (k > 0 && torusDist(segs[k - 1].b, s.a) > 1e-9) ok = false; // consecutive pieces glue mod 2π
    // endpoints are the true (wrapped) positions at the segment times
    if (torusDist(s.a, [w1 * s.ta, phi + w2 * s.ta]) > 1e-9) ok = false;
  }
  check('flat segments inside the square and glued', ok);
  check('flat segments length = |ω|Δt', close(len, Math.hypot(w1, w2) * (tb - ta), 1e-8));
}

// ---------------------------------------------------------------- closest returns
{
  check('point-segment distance', close(pointSegmentDist([0, 1], [-1, 0], [1, 0]).d, 1) && close(pointSegmentDist([3, 0], [-1, 0], [1, 0]).d, 2));
  // brute-force comparison
  for (let i = 0; i < 30; i++) {
    const w1 = rand(0.3, 3);
    const w2 = rand(0.3, 3);
    const tr = new ReturnTracker(w1, w2);
    let t = 0;
    while (t < 60) {
      t += rand(0.01, 0.3);
      tr.update(t);
    }
    let brute = Infinity;
    const t0 = Math.PI / Math.hypot(w1, w2);
    for (let k = 0; k <= 200000; k++) {
      const tau = t0 + ((t - t0) * k) / 200000;
      brute = Math.min(brute, torusDist([w1 * tau, w2 * tau], [0, 0]));
    }
    check('return tracker = brute force', tr.best && Math.abs(tr.best.d - brute) < 2e-4 && tr.best.d <= brute + 1e-12, JSON.stringify({ w1, w2, best: tr.best, brute }));
    // the record lattice point is consistent with the reported time
    const b = tr.best;
    check('record point consistent', Math.abs(Math.hypot(w1 * b.tau - TAU * b.m, w2 * b.tau - TAU * b.n) - b.d) < 1e-9);
  }
  // rational orbit: exact return at T to the lattice point (p, q)
  {
    const tr = new ReturnTracker(2 * 0.8, 3 * 0.8);
    tr.update(2 * TAU / 0.8 / 2 + 0.5); // a little past T = 2π/0.8
    check('2:3 returns exactly', tr.best.d < 1e-9 && tr.best.m === 2 && tr.best.n === 3, JSON.stringify(tr.best));
  }
  // golden: successive record holders are Fibonacci pairs (convergents of ω1/ω2 = 1/φ)
  {
    const tr = new ReturnTracker(1, PHI);
    let t = 0;
    while (t < 3000) {
      t += 0.25;
      tr.update(t);
    }
    const recs = tr.records.filter((r) => r.n >= 2);
    const isFib = (m, n) => fib.some((f, k) => k > 0 && f === m && fib[k + 1] === n);
    check('golden records are Fibonacci', recs.length >= 6 && recs.every((r) => isFib(r.m, r.n)), JSON.stringify(tr.records.map((r) => [r.m, r.n])));
    // and the record distances shrink like 2π/(√5 q |ω|)·|ω2|... i.e. d·n is roughly constant
    const last = recs.at(-1);
    check('golden record scaling d ~ 1/n', last.d * last.n > 1 && last.d * last.n < 4, JSON.stringify(last));
  }
  // √2: records are convergents of 1/√2: (1,1),(2,3),(5,7),(12,17),...
  {
    const tr = new ReturnTracker(1, Math.SQRT2);
    let t = 0;
    while (t < 2000) {
      t += 0.25;
      tr.update(t);
    }
    const cv = convergents(continuedFraction(1 / Math.SQRT2));
    const isConv = (m, n) => cv.some((c) => c.p === m && c.q === n);
    const recs = tr.records.filter((r) => r.n >= 2);
    check('√2 records are convergents', recs.length >= 3 && recs.every((r) => isConv(r.m, r.n)), JSON.stringify(tr.records.map((r) => [r.m, r.n])));
  }
  // π: after 22 θ2-turns the orbit nearly closes (7 θ1-turns): 7/22 is a convergent of 1/π
  {
    const tr = new ReturnTracker(1, Math.PI);
    let t = 0;
    while (t < 50) {
      t += 0.1;
      tr.update(t);
    }
    check('π: (7,22) near-return', tr.best.m === 7 && tr.best.n === 22 && tr.best.d < 0.1, JSON.stringify(tr.best));
  }
}

// ---------------------------------------------------------------- quantum spectrum
{
  // 1:1 isotropic oscillator: degeneracy K+1 (SU(2) multiplets of spin K/2)
  for (let K = 0; K < 12; K++) check('1:1 degeneracy K+1', degeneracy(1, 1, K) === K + 1);
  for (let K = 0; K < 12; K++) check('1:2 degeneracy', degeneracy(1, 2, K) === Math.floor(K / 2) + 1);
  check('2:3, K=6 has (3,0) and (0,2)', degeneracy(2, 3, 6) === 2 && energy(2, 3, 3, 0) === energy(2, 3, 0, 2));
  const lv = spectrum(1, 1, 5.5);
  check('1:1 spectrum degeneracies 1,2,3,4,5', lv.map((l) => l.states.length).join(',') === '1,2,3,4,5', JSON.stringify(lv.map((l) => l.states.length)));
  check('1:1 ground energy 1', close(lv[0].E, 1));
  const lg = spectrum(1, PHI, 12);
  check('golden: no degeneracies', lg.every((l) => l.states.length === 1));
  const l23 = spectrum(2, 3, 30);
  const first = l23.find((l) => l.states.length > 1);
  check('2:3 first degeneracy at n=(3,0)~(0,2)', first && first.states.length === 2 && close(first.E, energy(2, 3, 3, 0)), JSON.stringify(first));
}

// ---------------------------------------------------------------- knots & helpers
check('trefoil crossings 3', torusKnotCrossings(2, 3) === 3 && torusKnotName(2, 3) === 'trefoil');
check('(3,5) crossings 10', torusKnotCrossings(3, 5) === 10);
check('(1,n) unknot', torusKnotName(1, 7) === 'unknot' && torusKnotName(4, 1) === 'unknot');
check('(2,5) cinquefoil', torusKnotName(5, 2) === 'cinquefoil');
check('log map round trip', close(logInv(logMap(0.3, 2, 400), 2, 400), 0.3, 1e-12) && close(logMap(0, 2, 400), 2) && close(logMap(1, 2, 400), 400, 1e-9));

console.log(`torus maths: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
