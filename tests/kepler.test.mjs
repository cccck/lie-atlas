#!/usr/bin/env node
// Numerical checks for src/modules/kepler/math.js — Kepler problem, LRL vector, hidden SO(4), Fock map, hydrogen.
//   node tests/kepler.test.mjs
import {
  TAU,
  makeModel,
  OrbitSim,
  angMom,
  energy,
  keplerEnergy,
  lrl,
  elements,
  hodograph,
  precessionFirstOrder,
  powerLawCircularPrecession,
  starkSecular,
  solveKepler,
  orbitPoint,
  orbitAtTime,
  orbitInvariants,
  chiOmegaFromPole,
  fockFromMomentum,
  momentumFromFock,
  hodographOf,
  LA3,
  poisson,
  so4Multiplet,
  levelEnergy,
  nEff,
  HARTREE_EV,
} from '../src/modules/kepler/math.js';
import { spinMatrices } from '../src/core/complex.js';
import { mat, mulberry32 } from '../src/core/la.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL', name, extra);
  }
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const rng = mulberry32(11);
const wrapPi = (x) => x - TAU * Math.floor((x + Math.PI) / TAU);

// ---------------------------------------------------------------- helpers
/** Initial state at aphelion (−r_a, 0) moving with −y velocity: a, e given, A along +x, L > 0. */
function aphelionState(a, e, k = 1) {
  const ra = a * (1 + e);
  const va = Math.sqrt(((k / a) * (1 - e)) / (1 + e));
  return [-ra, 0, 0, -va];
}

// ---------------------------------------------------------------- 1. pure Kepler: conservation, closed orbits
{
  const k = 1;
  const a = 1;
  const e = 0.55;
  const model = makeModel('kepler', 0, k);
  const s0 = aphelionState(a, e, k);
  const sim = new OrbitSim(model, s0, { ds: 0.004 });
  const E0 = energy(model, sim.s);
  const L0 = angMom(sim.s);
  const A0 = lrl(sim.s, k);
  const T = TAU * Math.sqrt(a ** 3 / k);
  check('initial osculating a', close(elements(sim.s, k).a, a, 1e-12));
  check('initial osculating e', close(elements(sim.s, k).e, e, 1e-12));
  check('A points to perihelion (+x)', A0[0] > 0 && Math.abs(A0[1]) < 1e-12, JSON.stringify(A0));
  let maxdE = 0;
  let maxdL = 0;
  let maxdA = 0;
  const N = 50;
  for (let i = 0; i < N * 40; i++) {
    sim.advance(T / 40);
    maxdE = Math.max(maxdE, Math.abs(energy(model, sim.s) - E0));
    maxdL = Math.max(maxdL, Math.abs(angMom(sim.s) - L0));
    const A = lrl(sim.s, k);
    maxdA = Math.max(maxdA, Math.hypot(A[0] - A0[0], A[1] - A0[1]));
  }
  console.log(`  Kepler e=${e}: ${N} orbits, steps=${sim.steps}, |ΔE|max=${maxdE.toExponential(2)}, |ΔL|max=${maxdL.toExponential(2)}, |ΔA|max=${maxdA.toExponential(2)}`);
  check('Kepler: energy drift tiny', maxdE / Math.abs(E0) < 1e-8, String(maxdE));
  check('Kepler: L conserved', maxdL < 1e-8, String(maxdL));
  check('Kepler: A conserved (no precession)', maxdA < 1e-7, String(maxdA));
  const prec = sim.precession();
  check('Kepler: measured precession ~ 0', Math.abs(prec) < 1e-6, String(prec));
  check('Kepler: perihelion found once per orbit', sim.perihelia.length >= N - 1, String(sim.perihelia.length));
  // perihelion times are spaced by the period T
  const P = sim.perihelia;
  const dt = P[P.length - 1].t - P[P.length - 2].t;
  check('Kepler: radial period = 2π sqrt(a³/k)', close(dt, T, 1e-5), `${dt} vs ${T}`);
}

// a highly eccentric orbit (e = 0.97) — the Sundman step keeps it accurate
{
  const model = makeModel('kepler', 0, 1);
  const sim = new OrbitSim(model, aphelionState(1, 0.97), { ds: 0.004 });
  const E0 = energy(model, sim.s);
  const A0 = lrl(sim.s, 1);
  sim.advance(20 * TAU);
  const A = lrl(sim.s, 1);
  check('Kepler e=0.97: energy', Math.abs(energy(model, sim.s) - E0) < 1e-7, String(energy(model, sim.s) - E0));
  check('Kepler e=0.97: A conserved', Math.hypot(A[0] - A0[0], A[1] - A0[1]) < 1e-6);
}

// ---------------------------------------------------------------- 2. hodograph identity and circle
for (let i = 0; i < 200; i++) {
  const k = 0.5 + rng();
  const r = 0.3 + 2 * rng();
  const ph = TAU * rng();
  const vesc = Math.sqrt((2 * k) / r);
  const v = vesc * (0.1 + 0.85 * rng());
  const th = TAU * rng();
  const s = [r * Math.cos(ph), r * Math.sin(ph), v * Math.cos(th), v * Math.sin(th)];
  const L = angMom(s);
  const A = lrl(s, k);
  // v = (ẑ × A)/L + (k/L) ẑ × r̂
  const rh = [Math.cos(ph), Math.sin(ph)];
  const vp = [-A[1] / L + (k / L) * -rh[1], A[0] / L + (k / L) * rh[0]];
  check('hodograph identity v = (ẑ×A)/L + (k/L) ẑ×r̂', Math.hypot(vp[0] - s[2], vp[1] - s[3]) < 1e-9 * Math.max(1, Math.abs(1 / L)));
  const H = hodograph(s, k);
  const E = keplerEnergy(s, k);
  check('hodograph R² − |c|² = 2|E| = p0²', close(H.R ** 2 - (H.c[0] ** 2 + H.c[1] ** 2), -2 * E, 1e-8 * Math.max(1, H.R ** 2)));
  check('|A| = k e and e² = 1 + 2EL²/k²', close((A[0] ** 2 + A[1] ** 2) / k ** 2, 1 + (2 * E * L * L) / (k * k), 1e-9));
  check('A ⊥ L (A in plane): L·A = 0 trivially; A·v·… r·A = L²/m − k r', close(s[0] * A[0] + s[1] * A[1], L * L - k * r, 1e-9));
}

// ---------------------------------------------------------------- 3. GR-like −δ/r³: L, E conserved, A precesses at 6πδk/L⁴
{
  const k = 1;
  const d = 0.0005;
  const model = makeModel('gr', d, k);
  const sim = new OrbitSim(model, aphelionState(1, 0.55), { ds: 0.003 });
  const E0 = energy(model, sim.s);
  const L0 = angMom(sim.s);
  sim.advance(12 * TAU);
  check('GR: L conserved', Math.abs(angMom(sim.s) - L0) < 1e-9);
  check('GR: E conserved', Math.abs(energy(model, sim.s) - E0) < 1e-8);
  const meas = sim.precession();
  const theory = (6 * Math.PI * d * k) / L0 ** 4;
  const el = elements(sim.s, k);
  const lo = precessionFirstOrder(model.dU, el.E, L0, k);
  console.log(`  GR δ=${d}: precession/orbit measured ${meas.toFixed(6)} rad, 6πδk/L⁴ = ${theory.toFixed(6)}, LL first order = ${lo.toFixed(6)}`);
  check('GR: precession matches 6πδk/L⁴ (first order, δ small)', Math.abs(meas / theory - 1) < 0.015, `${meas} vs ${theory}`);
  check('GR: LL quadrature reproduces 6πδk/L⁴', Math.abs(lo / theory - 1) < 1e-4, `${lo} vs ${theory}`);
  check('GR: precession is prograde', meas > 0);
  check('GR: A rotates', Math.abs(elements(sim.s, k).omega) > 0.01);
}

// plunge: a low-L orbit inside the barrier is captured
{
  const model = makeModel('gr', 0.02, 1);
  const sim = new OrbitSim(model, [-1.2, 0, 0, -0.15]);
  sim.advance(20);
  check('GR: low-L orbit plunges (captured)', sim.captured);
}

// ---------------------------------------------------------------- 4. power-law force: Bertrand
{
  const k = 1;
  for (const d of [0.05, -0.05]) {
    // near-circular orbit
    const model = makeModel('power', d, k);
    const r0 = 1;
    const vc = Math.sqrt(k * Math.pow(r0, -1 - d));
    const sim = new OrbitSim(model, [r0, 0, 0, vc * 1.01], { ds: 0.003 });
    sim.advance(12 * TAU);
    const meas = sim.precession();
    const pred = powerLawCircularPrecession(d);
    console.log(`  power δ=${d}: near-circular precession ${meas.toFixed(5)} vs 2π(1/√(1−δ)−1) = ${pred.toFixed(5)}`);
    check(`power δ=${d}: near-circular apsidal angle π/√(1−δ)`, Math.abs(meas - pred) < 0.02 * Math.abs(pred) + 2e-4, `${meas} vs ${pred}`);
    check(`power δ=${d}: sign (prograde iff δ>0)`, Math.sign(meas) === Math.sign(d));
    // eccentric orbit vs first-order theory
    const sim2 = new OrbitSim(model, aphelionState(1, 0.5), { ds: 0.003 });
    const L0 = angMom(sim2.s);
    sim2.advance(10 * TAU);
    const meas2 = sim2.precession();
    const th2 = precessionFirstOrder(model.dU, keplerEnergy(sim2.s, k), L0, k);
    console.log(`  power δ=${d}, e≈0.5: measured ${meas2.toFixed(5)} vs first order ${th2.toFixed(5)}`);
    check(`power δ=${d}: first-order theory within 8%`, Math.abs(meas2 / th2 - 1) < 0.08, `${meas2} vs ${th2}`);
    check(`power δ=${d}: L conserved`, Math.abs(angMom(sim2.s) - L0) < 1e-9);
  }
}

// ---------------------------------------------------------------- 5. uniform field: Noether fails, secular Stark rotation
{
  const k = 1;
  const eps = 0.01;
  const model = makeModel('field', eps, k);
  const s0 = aphelionState(1, 0.55);
  const sim = new OrbitSim(model, s0, { ds: 0.003 });
  const E0 = energy(model, sim.s);
  const L0 = angMom(sim.s);
  const el0 = elements(sim.s, k);
  const sec = starkSecular([0, eps], L0, el0.A, el0.E, k);
  // secular theory: (L, A'_x) rotate at ω_S:  L(t) = L0 cos ω_S t − A'_x0 sin ω_S t  (compare after whole orbits)
  const T = TAU;
  const p0 = Math.sqrt(-2 * el0.E);
  sim.advance(3 * T);
  const t = sim.s[4];
  const Lsec = L0 * Math.cos(sec.omegaS * t) - (el0.A[0] / p0) * Math.sin(sec.omegaS * t);
  const dL = angMom(sim.s) - L0;
  console.log(`  Stark ε=${eps}: ΔL over 3 orbits = ${dL.toFixed(5)}, secular solution ${(Lsec - L0).toFixed(5)} (initial rate ${sec.dLdt.toFixed(5)}/time), ω_S=${sec.omegaS.toFixed(4)}`);
  check('field: L not conserved', Math.abs(dL) > 1e-3);
  check('field: E still conserved (time-independent V)', Math.abs(energy(model, sim.s) - E0) < 1e-8);
  check('field: secular Stark rotation of (L, A′) at ω_S = (3/2)ε sqrt(a/k) (±5%)', Math.abs(dL / (Lsec - L0) - 1) < 0.05, `${dL} vs ${Lsec - L0}`);
  // long run: L and A'_x rotate into each other, L passes through 0 and the orbit survives near-collisions
  const sim2 = new OrbitSim(makeModel('field', 0.03, k), s0, { ds: 0.003 });
  const E2 = energy(sim2.model, sim2.s);
  let Lmin = Infinity;
  let Lmax = -Infinity;
  for (let i = 0; i < 2000; i++) {
    sim2.advance(0.1, 200000);
    const L = angMom(sim2.s);
    Lmin = Math.min(Lmin, L);
    Lmax = Math.max(Lmax, L);
  }
  console.log(`  Stark ε=0.03 over t=200: L ∈ [${Lmin.toFixed(3)}, ${Lmax.toFixed(3)}], energy error ${(energy(sim2.model, sim2.s) - E2).toExponential(2)}, steps ${sim2.steps}`);
  check('field: L changes sign (orbit turns inside out)', Lmin < -0.3 && Lmax > 0.5);
  check('field: energy conserved through near-collisions', Math.abs(energy(sim2.model, sim2.s) - E2) < 1e-5);
}

// ---------------------------------------------------------------- 6. Poisson brackets: so(4), so(3,1), Noether
{
  const eps = (i, j, k) => ((i - j) * (j - k) * (k - i)) / 2;
  let worst = 0;
  let worstLor = 0;
  for (let trial = 0; trial < 12; trial++) {
    const k = 1;
    const r = [rng() - 0.5, rng() - 0.5, rng() - 0.5].map((x) => 2 * x);
    const p = [rng() - 0.5, rng() - 0.5, rng() - 0.5].map((x) => 2 * x);
    const z = [...r, ...p];
    const F = (z) => LA3(z.slice(0, 3), z.slice(3), k);
    const { L, A, H } = F(z);
    const Lf = (i) => (zz) => F(zz).L[i];
    const Af = (i) => (zz) => F(zz).A[i];
    const Hf = (zz) => F(zz).H;
    for (let i = 0; i < 3; i++) {
      worst = Math.max(worst, Math.abs(poisson(Hf, Lf(i), z)), Math.abs(poisson(Hf, Af(i), z)));
      for (let j = 0; j < 3; j++) {
        let eL = 0;
        let eA = 0;
        let eAA = 0;
        for (let m = 0; m < 3; m++) {
          eL += eps(i, j, m) * L[m];
          eA += eps(i, j, m) * A[m];
          eAA += -2 * H * eps(i, j, m) * L[m];
        }
        worst = Math.max(worst, Math.abs(poisson(Lf(i), Lf(j), z) - eL), Math.abs(poisson(Lf(i), Af(j), z) - eA));
        const d = Math.abs(poisson(Af(i), Af(j), z) - eAA);
        if (H < 0) worst = Math.max(worst, d);
        else worstLor = Math.max(worstLor, d);
      }
    }
  }
  console.log(`  Poisson brackets: max deviation ${worst.toExponential(2)} (E<0), ${worstLor.toExponential(2)} (E>0)`);
  check('{H,L} = {H,A} = 0, {L_i,L_j} = ε L, {L_i,A_j} = ε A, {A_i,A_j} = −2E ε L', worst < 1e-5, String(worst));
  check('same bracket for E > 0 (so(3,1) after rescaling)', worstLor < 1e-5, String(worstLor));
}

// ---------------------------------------------------------------- 7. fixed-energy family: Kepler III, Fock great circles
{
  const k = 1;
  const a = 1.3;
  const T = TAU * Math.sqrt(a ** 3 / k);
  const p0 = Math.sqrt(k / a);
  for (let trial = 0; trial < 60; trial++) {
    const chi = trial === 0 ? Math.PI / 2 : Math.PI * rng();
    const om = TAU * rng() - Math.PI;
    const inv = orbitInvariants(a, chi, om, k);
    check('L² + |A′|² = C² = k²/(2|E|)', close(inv.L ** 2 + inv.Ap[0] ** 2 + inv.Ap[1] ** 2, k * k / (2 * Math.abs(inv.E)), 1e-12));
    // sample the orbit, check its conserved quantities and the Fock picture
    for (let q = 0; q < 12; q++) {
      const Ecc = TAU * rng();
      const P = orbitPoint(a, chi, om, Ecc, k);
      const xi = P.fock;
      check('Fock point on unit sphere', close(Math.hypot(...xi), 1, 1e-12));
      check('Fock point on the great circle ⊥ N (plane through 0)', Math.abs(xi[0] * inv.N[0] + xi[1] * inv.N[1] + xi[2] * inv.N[2]) < 1e-12);
      const e = Math.abs(Math.sin(chi));
      if (1 - e * Math.cos(Ecc) > 1e-3) {
        const s = [...P.r, ...P.v];
        check('orbitPoint energy = −k/2a', close(keplerEnergy(s, k), inv.E, 1e-9));
        check('orbitPoint L = C cos χ', close(angMom(s), inv.L, 1e-9));
        const A = lrl(s, k);
        check('orbitPoint A = sqrt(2|E|) A′', close(A[0], p0 * inv.Ap[0], 1e-9) && close(A[1], p0 * inv.Ap[1], 1e-9));
        const xi2 = fockFromMomentum(P.v, p0);
        check('regular Fock formula = inverse stereographic projection of v/p0', Math.hypot(xi2[0] - xi[0], xi2[1] - xi[1], xi2[2] - xi[2]) < 1e-9);
        const back = momentumFromFock(xi, p0);
        check('stereographic round trip', Math.hypot(back[0] - P.v[0], back[1] - P.v[1]) < 1e-7 * Math.max(1, Math.hypot(...P.v)));
        if (Math.abs(Math.cos(chi)) > 1e-3) {
          const H = hodographOf(a, chi, om, k);
          check('velocity lies on hodograph circle', close(Math.hypot(P.v[0] - H.c[0], P.v[1] - H.c[1]), H.R, 1e-8 * H.R));
          check('hodograph: R² − |c|² = p0²', close(H.R ** 2 - H.c[0] ** 2 - H.c[1] ** 2, p0 * p0, 1e-8 * H.R ** 2));
        }
      }
    }
    // Fock point moves uniformly with the eccentric anomaly: angle between ξ(E1) and ξ(E2) = |E1 − E2|
    const E1 = 0.3;
    const E2 = 1.4;
    const x1 = orbitPoint(a, chi, om, E1, k).fock;
    const x2 = orbitPoint(a, chi, om, E2, k).fock;
    check('arc length on the Fock sphere = eccentric anomaly', close(Math.acos(x1[0] * x2[0] + x1[1] * x2[1] + x1[2] * x2[2]), E2 - E1, 1e-12));
    // Kepler III: after one period every orbit is back at perihelion
    const o0 = orbitAtTime(a, chi, om, 0, k);
    const oT = orbitAtTime(a, chi, om, T, k);
    check('Kepler III: same period for every χ', Math.hypot(oT.r[0] - o0.r[0], oT.r[1] - o0.r[1]) < 1e-9);
    // pole ↔ (χ, ω)
    const back = chiOmegaFromPole(inv.N);
    check('chiOmegaFromPole inverts the pole map', close(back.chi, chi, 1e-9) && (Math.sin(chi) < 1e-9 || Math.abs(wrapPi(back.omega - om)) < 1e-9));
  }
  // great-circle property from the hodograph side (task statement): circle with R² − |c|² = p0² ↦ great circle
  for (let i = 0; i < 50; i++) {
    const c = [3 * (rng() - 0.5), 3 * (rng() - 0.5)];
    const R = Math.sqrt(p0 * p0 + c[0] ** 2 + c[1] ** 2);
    const pts = [0, 1, 2, 3].map((q) => {
      const t = TAU * rng();
      return fockFromMomentum([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)], p0);
    });
    // the plane through three image points passes through the origin: det[x1 x2 x3] = 0
    const det = mat.det([pts[0], pts[1], pts[2]]);
    check('hodograph circles of energy E map to great circles', Math.abs(det) < 1e-10, String(det));
  }
  // equator = the p0 circle; south pole = p = 0
  const eq = fockFromMomentum([p0 * Math.cos(1), p0 * Math.sin(1)], p0);
  check('p0 circle ↦ equator', Math.abs(eq[2]) < 1e-14);
  check('p = 0 ↦ south pole', close(fockFromMomentum([0, 0], p0)[2], -1, 1e-15));
}

// ---------------------------------------------------------------- 8. Kepler's equation
{
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const e = i < 200 ? 1 - 1e-9 * rng() : i < 400 ? 1 : rng();
    const M = TAU * rng();
    const E = solveKepler(M, e);
    worst = Math.max(worst, Math.abs(E - e * Math.sin(E) - M));
  }
  check('solveKepler residual < 1e-12 for e ∈ [0, 1]', worst < 1e-12, String(worst));
}

// ---------------------------------------------------------------- 9. hydrogen: n² degeneracy and SU(2)×SU(2) → SO(3)
{
  for (let n = 1; n <= 7; n++) {
    let count = 0;
    for (let l = 0; l < n; l++) count += 2 * l + 1;
    check(`Σ(2l+1) = n² (n=${n})`, count === n * n);
    // hook assignment: exactly one state for every (l, m) with |m| ≤ l < n
    const st = so4Multiplet(n);
    const seen = new Set(st.map((s) => `${s.l},${s.m}`));
    let ok = st.length === n * n && seen.size === n * n;
    for (let l = 0; l < n; l++) for (let m = -l; m <= l; m++) ok = ok && seen.has(`${l},${m}`);
    check(`hook regrouping of the (m1,m2) grid is a bijection onto {(l,m)} (n=${n})`, ok);
    // L² = (J1 + J2)² on j⊗j has eigenvalues l(l+1), l = 0..n−1, multiplicity 2l+1
    const j = (n - 1) / 2;
    const S = spinMatrices(j);
    const I = mat.eye(S.dim);
    const Jz = mat.add(mat.kron(S.Jz, I), mat.kron(I, S.Jz));
    const Jp = mat.add(mat.kron(S.Jp, I), mat.kron(I, S.Jp));
    const Jm = mat.add(mat.kron(S.Jm, I), mat.kron(I, S.Jm));
    // L² = Jz² + (J+J− + J−J+)/2 (real symmetric)
    const L2 = mat.add(mat.mul(Jz, Jz), mat.scale(mat.add(mat.mul(Jp, Jm), mat.mul(Jm, Jp)), 0.5));
    const ev = mat.eigSym(L2).values.map((x) => Math.round((Math.sqrt(1 + 4 * x) - 1) / 2 * 1e6) / 1e6);
    const mult = {};
    for (const l of ev) mult[l] = (mult[l] || 0) + 1;
    let okL = true;
    for (let l = 0; l < n; l++) okL = okL && mult[l] === 2 * l + 1;
    check(`j⊗j = 0⊕1⊕…⊕(n−1) for j=(n−1)/2 (n=${n})`, okL, JSON.stringify(mult));
    // SO(4) Casimir: J1² = J2² = j(j+1), so L² + A′² = 4j(j+1) = n² − 1 and E = −1/(2(L²+A′²+1)) = −1/(2n²)
    check(`Pauli: −1/(2(4j(j+1)+1)) = E_n (n=${n})`, close(-1 / (2 * (4 * j * (j + 1) + 1)), levelEnergy(n, 0, 0), 1e-15));
  }
  // sodium-like quantum defects
  const E3s = levelEnergy(3, 0, 1) * HARTREE_EV;
  const E3p = levelEnergy(3, 1, 1) * HARTREE_EV;
  console.log(`  Na-like: 3s ${E3s.toFixed(3)} eV, 3p ${E3p.toFixed(3)} eV, D line ${(E3p - E3s).toFixed(3)} eV (exp. −5.14, −3.04, 2.10)`);
  check('Na 3s within 5% of −5.14 eV', Math.abs(E3s / -5.139 - 1) < 0.05);
  check('Na 3p within 5% of −3.04 eV', Math.abs(E3p / -3.035 - 1) < 0.05);
  check('screening keeps hydrogen at s=0', nEff(4, 0, 0) === 4 && close(levelEnergy(2, 1, 0), -0.125, 1e-15));
  check('screening lowers s below p below d (n=4)', levelEnergy(4, 0, 1) < levelEnergy(4, 1, 1) && levelEnergy(4, 1, 1) < levelEnergy(4, 2, 1));
}

console.log(`\nkepler: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
