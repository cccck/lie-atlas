#!/usr/bin/env node
// Numerical tests for src/modules/loops/math.js — commutators as small loops, BCH, parallel transport.
//   node tests/loops.test.mjs        (exit code 1 on failure)
import {
  rotationWorld, boostWorld, fluxWorld, carWorld,
  KX, KY, LROT, G21, so21, so21Coords, expSO21, logSO21, lorentzDecompose, boostFromU, pureBoostBetween, thomasCircle,
  se2, expSE2, logSE2, se2Pose,
  loopNodes, loopAt, loopNet, loopPrediction, loopThirdOrder,
  sphereBasis, sphereLoop, sphereAt, sphereHolonomy, sphereRadialAngle, sphereNormalCoords, transportNumeric, geodesicTransport,
  bchTruncations, bchExactSO3, bchExactH3, brSO3, brH3, logm, sqrtm, vnorm, vsub, vadd, vscale,
} from '../src/modules/loops/math.js';
import { mat, vec, hat, expSO3, logSO3, mulberry32, randn, randomUnit3 } from '../src/core/la.js';

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
const vclose = (a, b, tol = 1e-9) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);
const rng = mulberry32(2024);
const fmtv = (v) => '[' + v.map((x) => x.toExponential(4)).join(', ') + ']';
/** least-squares slope of log|y| vs log x */
function slope(xs, ys) {
  const X = xs.map(Math.log);
  const Y = ys.map((y) => Math.log(Math.abs(y)));
  const mx = X.reduce((s, x) => s + x, 0) / X.length;
  const my = Y.reduce((s, y) => s + y, 0) / Y.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < X.length; i++) {
    num += (X[i] - mx) * (Y[i] - my);
    den += (X[i] - mx) ** 2;
  }
  return num / den;
}
const section = (t) => console.log('\n— ' + t);

// =================================================================== 1. SO(3)
section('SO(3): [L_x, L_y] = L_z, body/space loop');
{
  const W = rotationWorld();
  const Lx = hat([1, 0, 0]);
  const Ly = hat([0, 1, 0]);
  const Lz = hat([0, 0, 1]);
  check('[Lx,Ly]=Lz', mat.almostEqual(mat.comm(Lx, Ly), Lz, 1e-15));
  check('bracket coords', vclose(W.bracket(W.X, W.Y), [0, 0, 1], 1e-15));
  // e^{θ L_z} turns x into y (active, right-handed)
  check('right-hand rule', vclose(mat.mulv(expSO3([0, 0, Math.PI / 2]), [1, 0, 0]), [0, 1, 0], 1e-15));
  // Hermitian J = iL: [J_x, J_y] = i J_z  ⇔  [L_x, L_y] = L_z (with L = −iJ):  (−i)²[J_x,J_y] = −iJ_z = L_z ✓
  for (const eps of [0.3, 0.1, 0.03]) {
    const net = W.log(loopNet(W, eps, 'body'));
    const pred = loopPrediction(W, eps, 'body');
    const third = loopThirdOrder(W, eps);
    check(`SO3 body ε=${eps}: log g ≈ ε²Lz`, vnorm(vsub(net, pred)) < 1.2 * vnorm(third) + 1e-12, fmtv(net));
    check(`SO3 body ε=${eps}: third order`, vnorm(vsub(net, vadd(pred, third))) < 0.6 * eps ** 4 + 1e-13, fmtv(vsub(net, vadd(pred, third))));
    const nets = W.log(loopNet(W, eps, 'space'));
    check(`SO3 space ε=${eps}: log g ≈ −ε²Lz + same third order`, vnorm(vsub(nets, vadd(loopPrediction(W, eps, 'space'), third))) < 0.6 * eps ** 4 + 1e-13, fmtv(nets));
  }
  // explicit product order
  const e = 0.4;
  const gb = mat.chain(expSO3([e, 0, 0]), expSO3([0, e, 0]), expSO3([-e, 0, 0]), expSO3([0, -e, 0]));
  check('body = e^{εX}e^{εY}e^{−εX}e^{−εY}', mat.almostEqual(gb, loopNet(W, e, 'body'), 1e-14));
  const gs = mat.chain(expSO3([0, -e, 0]), expSO3([-e, 0, 0]), expSO3([0, e, 0]), expSO3([e, 0, 0]));
  check('space = e^{−εY}e^{−εX}e^{εY}e^{εX}', mat.almostEqual(gs, loopNet(W, e, 'space'), 1e-14));
  // loopAt endpoints
  check('loopAt(0) = 1', mat.almostEqual(loopAt(W, e, 0), mat.eye(3), 1e-15));
  check('loopAt(4) = net', mat.almostEqual(loopAt(W, e, 4), loopNet(W, e), 1e-14));
  check('loopAt(1.5)', mat.almostEqual(loopAt(W, e, 1.5), mat.mul(expSO3([e, 0, 0]), expSO3([0, e / 2, 0])), 1e-14));
  // angle α between the axes: [X, Y] = sin α L_z
  const W2 = rotationWorld(0.7);
  check('SO3 angle α: [X,Y] = sin α Lz', vclose(W2.bracket(W2.X, W2.Y), [0, 0, Math.sin(0.7)], 1e-15));
  const W0 = rotationWorld(0);
  check('parallel axes commute: loop closes', mat.almostEqual(loopNet(W0, 0.8), mat.eye(3), 1e-14));
  // the z-axis tip encloses solid angle ≈ ε² and the frame twists by ≈ ε² (holonomy on S²)
  console.log('  ε=0.6 body net rotation vector', fmtv(W.log(loopNet(W, 0.6))), ' |ω| =', vnorm(W.log(loopNet(W, 0.6))).toFixed(5));
}

// =================================================================== 2. Lorentz SO(2,1)
section('Lorentz (2+1): [K_x, K_y] = −L, Thomas–Wigner rotation');
{
  check('[Kx,Ky] = −L', mat.almostEqual(mat.comm(KX, KY), mat.scale(LROT, -1), 1e-15));
  check('[L,Kx] = Ky', mat.almostEqual(mat.comm(LROT, KX), KY, 1e-15));
  check('[L,Ky] = −Kx', mat.almostEqual(mat.comm(LROT, KY), mat.scale(KX, -1), 1e-15));
  check('so21 basis', mat.almostEqual(so21([1, 0, 0]), KX) && mat.almostEqual(so21([0, 1, 0]), KY) && mat.almostEqual(so21([0, 0, 1]), LROT));
  // generators preserve the metric: Aᵀ G + G A = 0
  for (const A of [KX, KY, LROT]) check('so(2,1) metric', mat.almostEqual(mat.add(mat.mul(mat.transpose(A), G21), mat.mul(G21, A)), mat.zeros(3), 1e-15));
  // active boost: e^{ηK_x} maps rest (1,0,0) to (cosh η, sinh η, 0): velocity tanh η along +x
  const eta = 0.8;
  check('boost along +x', vclose(mat.mulv(expSO21([eta, 0, 0]), [1, 0, 0]), [Math.cosh(eta), Math.sinh(eta), 0], 1e-14));
  check('L rotates x→y', vclose(mat.mulv(expSO21([0, 0, Math.PI / 2]), [0, 1, 0]), [0, 0, 1], 1e-14));
  // closed form exp & log
  for (let i = 0; i < 300; i++) {
    const sc = i < 30 ? 1e-6 : i < 60 ? 3 : 1.2;
    const c = [randn(rng) * sc, randn(rng) * sc, randn(rng) * sc];
    const E = expSO21(c);
    check('expSO21 = expm', mat.almostEqual(E, mat.expm(so21(c)), 1e-9 * Math.max(1, mat.maxAbs(E))), fmtv(c));
    check('Λᵀ G Λ = G', mat.almostEqual(mat.chain(mat.transpose(E), G21, E), G21, 1e-9 * Math.max(1, mat.maxAbs(E) ** 2)));
    // log round trip when the elliptic angle is < π
    const D = c[2] ** 2 - c[0] ** 2 - c[1] ** 2;
    if (D < 0 || Math.sqrt(D) < 3) {
      const l = logSO21(E);
      check('logSO21 roundtrip', mat.almostEqual(expSO21(l), E, 1e-8 * Math.max(1, mat.maxAbs(E))), fmtv(c) + ' → ' + fmtv(l));
      if (sc < 2) check('logSO21 principal', vclose(l, c, 1e-7), fmtv(c) + ' → ' + fmtv(l));
    }
  }
  // parabolic element
  const cp = [0.5, 0, 0.5];
  check('logSO21 parabolic', vclose(logSO21(expSO21(cp)), cp, 1e-10));
  // polar decomposition
  const Lm = mat.mul(expSO21([0.3, -0.7, 0]), expSO21([0, 0, 0.9]));
  const dec = lorentzDecompose(Lm);
  check('decompose: Λ = B(v)R', mat.almostEqual(mat.mul(boostFromU([dec.gamma * dec.v[0], dec.gamma * dec.v[1]]), dec.R), Lm, 1e-12));
  check('decompose: R is a rotation', close(dec.R[0][0], 1, 1e-12) && close(dec.R[1][1], dec.R[2][2], 1e-12));
  // the loop
  const W = boostWorld();
  check('bracket coords [Kx,Ky] = −L', vclose(W.bracket(W.X, W.Y), [0, 0, -1], 1e-15));
  for (const eps of [0.3, 0.1, 0.03]) {
    const N = loopNet(W, eps, 'body');
    const l = W.log(N);
    const pred = loopPrediction(W, eps);
    const third = loopThirdOrder(W, eps);
    check(`boost body ε=${eps}: log g = −ε²L + O(ε³)`, vnorm(vsub(l, vadd(pred, third))) < 0.8 * eps ** 4 + 1e-13, fmtv(l));
    const d = lorentzDecompose(N);
    check(`boost body ε=${eps}: gyroscope turns by ≈ −ε²`, Math.abs(d.angle + eps * eps) < 1.5 * eps ** 3, d.angle);
    check(`boost body ε=${eps}: residual speed O(ε³)`, Math.hypot(...d.v) < 1.5 * eps ** 3, Math.hypot(...d.v));
    const ds = lorentzDecompose(loopNet(W, eps, 'space'));
    check(`boost space ε=${eps}: turns by ≈ +ε²`, Math.abs(ds.angle - eps * eps) < 1.5 * eps ** 3, ds.angle);
  }
  // body-frame legs are straight lines in the velocity disk (Beltrami–Klein model: geodesics)
  {
    const eps = 0.7;
    const nodes = loopNodes(W, eps, 'body');
    for (let leg = 0; leg < 4; leg++) {
      const a = lorentzDecompose(loopAt(W, eps, leg, 'body', nodes)).v;
      const b = lorentzDecompose(loopAt(W, eps, leg + 1, 'body', nodes)).v;
      const m = lorentzDecompose(loopAt(W, eps, leg + 0.37, 'body', nodes)).v;
      const cross = (b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0]);
      check(`body leg ${leg + 1} straight in velocity space`, Math.abs(cross) < 1e-12, cross);
    }
    console.log('  ε=0.7 body: gyroscope angle', lorentzDecompose(loopNet(W, eps)).angle.toFixed(5), ' (−ε² =', (-eps * eps).toFixed(5) + ')');
  }
  // Thomas precession: a circular velocity loop of rapidity η rotates a Fermi–Walker gyroscope by −2π(cosh η − 1)
  for (const eta2 of [0.2, 0.6, 1.0]) {
    const got = thomasCircle(eta2, 6000);
    const want = -2 * Math.PI * (Math.cosh(eta2) - 1);
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    check(`Thomas circle η=${eta2}: angle = −2π(γ−1) (= −hyperbolic area)`, Math.abs(wrap(got - want)) < 2e-3, `${got} vs ${want}`);
  }
  // pure boost between two velocities maps u to w and is symmetric-type (pure)
  const u = [Math.cosh(0.4), Math.sinh(0.4), 0];
  const w = [Math.cosh(0.9), Math.sinh(0.9) * Math.cos(1), Math.sinh(0.9) * Math.sin(1)];
  const P = pureBoostBetween(u, w);
  check('pure boost maps u→w', vclose(mat.mulv(P, u), w, 1e-12));
  check('pure boost is Lorentz', mat.almostEqual(mat.chain(mat.transpose(P), G21, P), G21, 1e-12));
  // angle α between the boost directions: [K_x, K_n] = −sin α L
  const Wa = boostWorld(1.1);
  check('[Kx,Kn] = −sin α L', vclose(Wa.bracket(Wa.X, Wa.Y), [0, 0, -Math.sin(1.1)], 1e-15));
}

// =================================================================== 3. magnetic translations
section('Magnetic translations: [Π_x, Π_y] = iqB, BCH terminates, AB phase');
{
  // group law vs matrix representation N(a, qB b, c)
  for (const qB of [1, -0.7, 2.3]) {
    const W = fluxWorld(qB);
    const M = (g) => [
      [1, g[0], g[2] + (qB * g[0] * g[1]) / 2],
      [0, 1, qB * g[1]],
      [0, 0, 1],
    ];
    for (let i = 0; i < 20; i++) {
      const g = [randn(rng), randn(rng), randn(rng)];
      const h = [randn(rng), randn(rng), randn(rng)];
      check('Heisenberg law = matrix product', mat.almostEqual(M(W.mul(g, h)), mat.mul(M(g), M(h)), 1e-12));
      const Nmat = [
        [0, g[0], g[2]],
        [0, 0, qB * g[1]],
        [0, 0, 0],
      ];
      check('exp coords = symmetric gauge coords', mat.almostEqual(mat.expm(Nmat), M(W.exp(g)), 1e-12));
    }
    check('[X,Y] = qB Z', vclose(W.bracket(W.X, W.Y), [0, 0, qB], 1e-15));
    for (const eps of [2.0, 0.7, 0.05]) {
      check(`flux qB=${qB} ε=${eps}: body net = exactly e^{+iqBε²}`, vclose(loopNet(W, eps, 'body'), [0, 0, qB * eps * eps], 1e-13));
      check(`flux qB=${qB} ε=${eps}: space net = exactly e^{−iqBε²}`, vclose(loopNet(W, eps, 'space'), [0, 0, -qB * eps * eps], 1e-13));
    }
  }
  // the transported phase equals q∮A·dl (symmetric gauge about the start), and the loop value is gauge invariant
  {
    const qB = 1.3;
    const eps = 0.9;
    const W = fluxWorld(qB);
    const lineInt = (Afn, pts, n = 4000) => {
      let s = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [a, b] = [pts[k], pts[k + 1]];
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const A = Afn(p);
          s += (A[0] * (b[0] - a[0]) + A[1] * (b[1] - a[1])) / n;
        }
      }
      return s;
    };
    const sym = ([x, y]) => [(-qB * y) / 2, (qB * x) / 2]; // qA
    const landau = ([x]) => [0, qB * x];
    const sq = [
      [0, 0],
      [eps, 0],
      [eps, eps],
      [0, eps],
      [0, 0],
    ];
    const nodes = loopNodes(W, eps);
    for (let k = 1; k <= 4; k++) check(`node ${k}: phase = q∫A·dl (sym. gauge)`, close(nodes[k][2], lineInt(sym, sq.slice(0, k + 1)), 1e-9), `${nodes[k][2]}`);
    check('AB phase: symmetric gauge', close(lineInt(sym, sq), qB * eps * eps, 1e-9));
    check('AB phase: Landau gauge (gauge invariant)', close(lineInt(landau, sq), qB * eps * eps, 1e-9));
  }
  // operator check of the sign: [Π_x, Π_y] ψ = iqB ψ with Π = −i∇ − qA (ħ = 1), finite differences
  {
    const qB = 0.8;
    const C = (re, im = 0) => ({ re, im });
    const add = (a, b) => C(a.re + b.re, a.im + b.im);
    const sub = (a, b) => C(a.re - b.re, a.im - b.im);
    const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const sc = (a, k) => C(a.re * k, a.im * k);
    const psi = (x, y) => {
      const amp = Math.exp(-(x * x + y * y) / 2);
      const ph = 0.3 * x - 0.7 * y;
      return C(amp * Math.cos(ph), amp * Math.sin(ph));
    };
    const h = 1e-3;
    const Afns = {
      symmetric: (x, y) => [(-qB * y) / 2, (qB * x) / 2],
      landau: (x) => [0, qB * x],
    };
    for (const [gname, A] of Object.entries(Afns)) {
      // Π_x f = −i ∂_x f − qA_x f
      const Px = (f) => (x, y) => sub(mul(C(0, -1), sc(sub(f(x + h, y), f(x - h, y)), 1 / (2 * h))), sc(f(x, y), A(x, y)[0]));
      const Py = (f) => (x, y) => sub(mul(C(0, -1), sc(sub(f(x, y + h), f(x, y - h)), 1 / (2 * h))), sc(f(x, y), A(x, y)[1]));
      const x0 = 0.31;
      const y0 = -0.42;
      const lhs = sub(Px(Py(psi))(x0, y0), Py(Px(psi))(x0, y0));
      const rhs = mul(C(0, qB), psi(x0, y0));
      check(`[Πx,Πy] = iqB (${gname} gauge)`, Math.hypot(lhs.re - rhs.re, lhs.im - rhs.im) < 1e-5, JSON.stringify({ lhs, rhs }));
      // pseudo-momentum K = Π − q r×B :  K_x = Π_x − qB y,  K_y = Π_y + qB x  →  [K_x, K_y] = −iqB, [K_i, Π_j] = 0
      const Kx = (f) => (x, y) => sub(Px(f)(x, y), sc(f(x, y), qB * y));
      const Ky = (f) => (x, y) => add(Py(f)(x, y), sc(f(x, y), qB * x));
      const lk = sub(Kx(Ky(psi))(x0, y0), Ky(Kx(psi))(x0, y0));
      const rk = mul(C(0, -qB), psi(x0, y0));
      check(`[Kx,Ky] = −iqB (${gname} gauge)`, Math.hypot(lk.re - rk.re, lk.im - rk.im) < 1e-5);
      const kp = sub(Kx(Py(psi))(x0, y0), Py(Kx(psi))(x0, y0));
      check(`[Kx,Πy] = 0 (${gname} gauge)`, Math.hypot(kp.re, kp.im) < 1e-5);
    }
  }
}

// =================================================================== 4. car, SE(2)
section('Parallel parking: SE(2), [F, Θ] = −S');
{
  const F = se2([1, 0, 0]);
  const T = se2([0, 1, 0]);
  const S = se2([0, 0, 1]);
  check('[F,Θ] = −S', mat.almostEqual(mat.comm(F, T), mat.scale(S, -1), 1e-15));
  check('[Θ,S] = −F', mat.almostEqual(mat.comm(T, S), mat.scale(F, -1), 1e-15));
  check('[Θ,F] = S', mat.almostEqual(mat.comm(T, F), S, 1e-15));
  check('[F,S] = 0', mat.almostEqual(mat.comm(F, S), mat.zeros(3), 1e-15));
  for (let i = 0; i < 200; i++) {
    const c = [randn(rng) * 2, (rng() * 2 - 1) * 3.1, randn(rng) * 2];
    const E = expSE2(c);
    check('expSE2 = expm', mat.almostEqual(E, mat.expm(se2(c)), 1e-12), fmtv(c));
    check('logSE2 roundtrip', vclose(logSE2(E), c, 1e-9), fmtv(c));
  }
  check('expSE2 small ω', mat.almostEqual(expSE2([1, 1e-9, 0.5]), mat.expm(se2([1, 1e-9, 0.5])), 1e-14));
  for (const kappa of [1, 0.6, -1]) {
    const W = carWorld(kappa);
    check(`car κ=${kappa}: [X,Y] = −κS`, vclose(W.bracket(W.X, W.Y), [0, 0, -kappa], 1e-15));
    for (const eps of [0.4, 0.1, 0.03]) {
      const l = W.log(loopNet(W, eps));
      check(`car κ=${kappa} ε=${eps}: log g = −κε²S + O(ε³)`, vnorm(vsub(l, vadd(loopPrediction(W, eps), loopThirdOrder(W, eps)))) < 0.6 * eps ** 4 + 1e-13, fmtv(l));
    }
  }
  // by hand: forward ε, arc ε (curvature κ), reverse straight ε, reverse along the arc ε
  {
    const kappa = 1;
    const eps = 0.5;
    let x = 0;
    let y = 0;
    let th = 0;
    const straight = (d) => {
      x += d * Math.cos(th);
      y += d * Math.sin(th);
    };
    const arc = (d) => {
      // integrate exactly: heading changes by κd
      const th1 = th + kappa * d;
      x += (Math.sin(th1) - Math.sin(th)) / kappa;
      y += (-Math.cos(th1) + Math.cos(th)) / kappa;
      th = th1;
    };
    straight(eps);
    arc(eps);
    straight(-eps);
    arc(-eps);
    const pose = se2Pose(loopNet(carWorld(kappa), eps, 'body'));
    check('car body loop = driving by hand', close(pose.x, x, 1e-12) && close(pose.y, y, 1e-12) && close(pose.th, th, 1e-12), JSON.stringify({ pose, x, y, th }));
    check('car: net heading 0, moved right (y < 0)', close(th, 0, 1e-14) && y < 0, JSON.stringify({ x, y }));
    console.log(`  κ=1, ε=0.5 by hand: Δx = ${x.toExponential(3)} (≈ ε³/2·…), Δy = ${y.toFixed(5)} (−κε² = ${(-kappa * eps * eps).toFixed(5)})`);
  }
}

// =================================================================== 5. sphere: curvature as a commutator
section('Sphere: parallel transport, holonomy = K × area, Foucault');
{
  // closed-form transport vs numerical ODE along each leg
  for (const [lat0deg, eps] of [
    [30, 0.6],
    [-50, 0.4],
    [0, 0.7],
    [45, 0.75],
  ]) {
    const lat0 = (lat0deg * Math.PI) / 180;
    const P = sphereLoop(lat0, eps);
    const pathOf = (k) => (t) => sphereAt(P, k + t).p;
    let V = sphereAt(P, 0).V;
    for (let k = 0; k < 4; k++) {
      V = transportNumeric(pathOf(k), V, 3000);
      const want = sphereAt(P, k + 1).V;
      check(`transport closed form = ODE (λ0=${lat0deg}°, leg ${k + 1})`, vclose(V, want, 2e-7), fmtv(vsub(V, want)));
    }
    const hol = sphereHolonomy(P);
    const st = sphereAt(P, 4);
    check(`holonomy = enclosed area (λ0=${lat0deg}°)`, close(st.alpha - sphereAt(P, 0).alpha, hol, 1e-14));
    // exact enclosed area by numerical integration of cos λ dλ dφ
    let area = 0;
    const n = 400;
    for (let i = 0; i < n; i++) area += Math.cos(lat0 + ((i + 0.5) / n) * P.dLat) * (P.dLat / n) * P.dLon;
    check(`Gauss–Bonnet: area = ∫cos λ dλ dφ (λ0=${lat0deg}°)`, close(hol, area, 1e-6));
    check(`holonomy ≈ ε² + O(ε³) (λ0=${lat0deg}°)`, Math.abs(hol - eps * eps) < 0.6 * eps ** 3 * (Math.abs(Math.tan(lat0)) + 0.3) + 1e-12, `${hol} vs ${eps * eps}`);
    // the radial-gauge angle at the end equals the holonomy
    const B0 = sphereBasis(lat0, 0);
    const V0 = sphereAt(P, 0).V;
    check('radial angle at end = holonomy', close(sphereRadialAngle(B0.p, V0, st), hol, 1e-12));
    check('radial angle at start = 0', close(sphereRadialAngle(B0.p, V0, sphereAt(P, 0)), 0, 1e-14));
    check('normal coords at the end = 0', vnorm(sphereNormalCoords(B0, st.p)) < 1e-12);
    check('normal coords after leg 1 ≈ (ε, ·)', Math.abs(sphereNormalCoords(B0, sphereAt(P, 1).p)[0] - eps) < 0.2 * eps);
  }
  // ε → 0 slope of holonomy: 2
  {
    const lat0 = 0.5;
    const es = [0.004, 0.008, 0.016, 0.032];
    const sl = slope(es, es.map((e) => sphereHolonomy(sphereLoop(lat0, e))));
    check('holonomy slope 2', Math.abs(sl - 2) < 0.01, sl);
    const sl3 = slope(es, es.map((e) => sphereHolonomy(sphereLoop(lat0, e)) - e * e));
    check('holonomy − ε² slope 3', Math.abs(sl3 - 3) < 0.02, sl3);
  }
  // anticlockwise octant triangle: vector turns by +π/2 (sign check of "anticlockwise loop → anticlockwise rotation")
  {
    const N = [0, 0, 1];
    const A = [1, 0, 0];
    const B = [0, 1, 0];
    const gc = (p, q) => (t) => {
      const ang = Math.acos(vec.dot(p, q));
      return vadd(vscale(p, Math.sin((1 - t) * ang) / Math.sin(ang)), vscale(q, Math.sin(t * ang) / Math.sin(ang)));
    };
    let V = [1, 0, 0];
    V = transportNumeric(gc(N, A), V, 2000);
    V = transportNumeric(gc(A, B), V, 2000);
    V = transportNumeric(gc(B, N), V, 2000);
    check('octant: (1,0,0) at N comes back as (0,1,0): +90° anticlockwise', vclose(V, [0, 1, 0], 1e-6), fmtv(V));
    check('geodesic transport = ODE', vclose(geodesicTransport(N, A, [1, 0, 0]), transportNumeric(gc(N, A), [1, 0, 0], 2000), 1e-8));
  }
  // Foucault: carried once round a latitude circle eastwards, the swing plane turns by −2π sin λ (mod 2π)
  for (const latDeg of [48.85, 90, 0, -33.9]) {
    const lat = (latDeg * Math.PI) / 180;
    const circ = (t) => sphereBasis(lat, 2 * Math.PI * t).p;
    if (Math.abs(latDeg) === 90) continue;
    const B = sphereBasis(lat, 0);
    const V = transportNumeric(circ, B.north, 8000);
    const ang = Math.atan2(vec.dot(B.p, vec.cross(B.north, V)), vec.dot(B.north, V)); // anticlockwise from north
    const want = Math.atan2(Math.sin(-2 * Math.PI * Math.sin(lat)), Math.cos(-2 * Math.PI * Math.sin(lat)));
    check(`Foucault λ=${latDeg}°: rotation −2π sin λ (≡ 2π(1 − sin λ))`, Math.abs(Math.atan2(Math.sin(ang - want), Math.cos(ang - want))) < 1e-5, `${ang} vs ${want}`);
  }
}

// =================================================================== 6. group commutator: slope 2 for every world
section('|log g| ~ ε² |[X,Y]| in every world');
{
  const worlds = { rot: rotationWorld(), boost: boostWorld(), flux: fluxWorld(1), car: carWorld(1) };
  const es = [0.005, 0.01, 0.02, 0.04];
  for (const [name, W] of Object.entries(worlds)) {
    for (const frame of ['body', 'space']) {
      const nets = es.map((e) => vnorm(W.log(loopNet(W, e, frame))));
      const sl = slope(es, nets);
      check(`${name} ${frame}: slope 2`, Math.abs(sl - 2) < 0.01, sl);
      const res = es.map((e) => vnorm(vsub(W.log(loopNet(W, e, frame)), loopPrediction(W, e, frame))));
      if (name !== 'flux') {
        const s3 = slope(es, res);
        check(`${name} ${frame}: residual slope 3`, Math.abs(s3 - 3) < 0.03, s3);
      } else check(`flux ${frame}: residual ≡ 0`, Math.max(...res) < 1e-15, Math.max(...res));
    }
  }
}

// =================================================================== 7. BCH
section('BCH: truncation errors scale as ε^(n+1)');
{
  // so(3)
  for (let trial = 0; trial < 6; trial++) {
    const x = vscale(randomUnit3(rng), 0.6 + rng());
    const y = vscale(randomUnit3(rng), 0.6 + rng());
    const es = [0.02, 0.03, 0.045, 0.065];
    const errs = [0, 1, 2, 3, 4].map((n) => es.map((e) => vnorm(vsub(bchExactSO3(vscale(x, e), vscale(y, e)), bchTruncations(vscale(x, e), vscale(y, e), brSO3).Z[n]))));
    const slopes = errs.map((er) => slope(es, er));
    slopes.forEach((s, n) => check(`so(3) trial ${trial}: Z${n + 1} error slope ${n + 2}`, Math.abs(s - (n + 2)) < 0.06, slopes.map((v) => v.toFixed(3)).join(' ')));
    if (trial === 0) console.log('  so(3) slopes:', slopes.map((v) => v.toFixed(3)).join(', '));
  }
  // quaternion cross-check of the exact so(3) log (small angles)
  {
    const x = [0.3, -0.2, 0.5];
    const y = [-0.4, 0.1, 0.2];
    const z = bchExactSO3(x, y);
    check('so(3) exact log: exp(z) = exp(x)exp(y)', mat.almostEqual(expSO3(z), mat.mul(expSO3(x), expSO3(y)), 1e-14));
  }
  // a generic (free-ish) algebra: gl(4) with random matrices and a general matrix log
  {
    const n = 4;
    const flat = (A) => A.flat();
    const unflat = (v) => Array.from({ length: n }, (_, i) => v.slice(i * n, i * n + n));
    const brGL = (a, b) => flat(mat.comm(unflat(a), unflat(b)));
    for (let trial = 0; trial < 3; trial++) {
      const X = Array.from({ length: n }, () => Array.from({ length: n }, () => randn(rng) * 0.5));
      const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => randn(rng) * 0.5));
      check('logm(expm(A)) = A', mat.almostEqual(logm(mat.expm(mat.scale(X, 0.3))), mat.scale(X, 0.3), 1e-12));
      const es = [0.04, 0.06, 0.09, 0.13];
      const errs = [0, 1, 2, 3, 4].map((k) =>
        es.map((e) => {
          const Zex = flat(logm(mat.mul(mat.expm(mat.scale(X, e)), mat.expm(mat.scale(Y, e)))));
          return vnorm(vsub(Zex, bchTruncations(flat(mat.scale(X, e)), flat(mat.scale(Y, e)), brGL).Z[k]));
        }),
      );
      const slopes = errs.map((er) => slope(es, er));
      slopes.forEach((s, k) => check(`gl(4) trial ${trial}: Z${k + 1} error slope ${k + 2}`, Math.abs(s - (k + 2)) < 0.12, slopes.map((v) => v.toFixed(3)).join(' ')));
      if (trial === 0) console.log('  gl(4) slopes:', slopes.map((v) => v.toFixed(3)).join(', '));
    }
    const A = [
      [1.2, 0.3, 0, 0.1],
      [0, 0.9, 0.2, 0],
      [0.1, 0, 1.1, 0.3],
      [0, 0.2, 0, 0.8],
    ];
    const r = sqrtm(A);
    check('sqrtm', mat.almostEqual(mat.mul(r, r), A, 1e-12));
  }
  // Heisenberg: Z = X + Y + ½[X,Y] exactly
  {
    const x = [0.7, -1.1, 0.4];
    const y = [-0.3, 0.8, 1.5];
    const { Z } = bchTruncations(x, y, brH3);
    const ex = bchExactH3(x, y);
    check('h3: Z2 exact', vclose(Z[1], ex, 1e-15));
    check('h3: Z3..Z5 = Z2', [2, 3, 4].every((k) => vclose(Z[k], ex, 1e-15)));
    // matrix check: [[0,a,c],[0,0,b],[0,0,0]]
    const Mh = (v) => [
      [0, v[0], v[2]],
      [0, 0, v[1]],
      [0, 0, 0],
    ];
    const P = mat.mul(mat.expm(Mh(x)), mat.expm(Mh(y)));
    check('h3: exp(Z) = exp(X)exp(Y) (matrices)', mat.almostEqual(mat.expm(Mh(ex)), P, 1e-13));
    check('h3: bracket', vclose(brH3([1, 0, 0], [0, 1, 0]), [0, 0, 1]));
  }
  // parallel generators: all brackets vanish
  {
    const x = [0.4, 0.2, -0.1];
    const y = vscale(x, 1.7);
    const { Z } = bchTruncations(x, y, brSO3);
    check('parallel: Z1 exact', vclose(Z[0], bchExactSO3(x, y), 1e-14) && vclose(Z[4], Z[0], 1e-15));
  }
  // the principal log of SO(3) jumps to the antipode when the composite angle crosses π transversally.
  // For unit x, y at angle γ: w = cos²(ε/2) − sin²(ε/2) cos γ, which crosses 0 at tan²(ε/2) = 1/cos γ.
  {
    const x = [1, 0, 0];
    const y = [0.6, 0.8, 0];
    const ec = 2 * Math.atan(Math.sqrt(1 / 0.6));
    const z1 = bchExactSO3(vscale(x, ec - 0.02), vscale(y, ec - 0.02));
    const z2 = bchExactSO3(vscale(x, ec + 0.02), vscale(y, ec + 0.02));
    check('|Z| ≤ π', vnorm(z1) <= Math.PI + 1e-12 && vnorm(z2) <= Math.PI + 1e-12);
    check('log jumps across π (antipode)', vec.dot(z1, z2) < -9, fmtv(z1) + ' ' + fmtv(z2));
    // equal perpendicular rotations only touch |Z| = π at ε = π (w = cos²(ε/2) ≥ 0): no jump
    const a = bchExactSO3([3.1, 0, 0], [0, 3.1, 0]);
    const b = bchExactSO3([3.18, 0, 0], [0, 3.18, 0]);
    check('perpendicular equal: touches π without jumping', vec.dot(a, b) > 9, fmtv(a) + ' ' + fmtv(b));
  }
}



console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
