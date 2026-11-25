// Numerical tests for the Hopf fibration / Berry phase module (node tests/hopf.test.mjs).
// Checks the maths against independent constructions: the Bloch vector from the Pauli matrices, the
// Gauss linking integral, the torus of revolution, and the analytic Berry connection A = −sin²(θ/2) dφ.
import {
  TAU,
  wrapPi,
  sph,
  angles,
  section,
  sectionAt,
  withPhase,
  hopf,
  inner,
  rotAD,
  poleFibreBase,
  stereo4,
  project,
  fibrePoint,
  latitudeTorus,
  sampleClosed,
  horizontalLift,
  makeLoop,
  closedLift,
  triangleSolidAngle,
  loopSolidAngle,
} from '../src/modules/hopf/math.js';
import { sigma, cmat, cvec } from '../src/core/complex.js';
import { mulberry32, randomUnit3, expSO3, mat } from '../src/core/la.js';

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    if (fails.length < 25) fails.push(msg);
  }
}
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} (tol ${tol})`);
const nearV = (u, v, tol, msg) => ok(u.every((x, i) => Math.abs(x - v[i]) <= tol), `${msg}: got [${u}], want [${v}]`);
const norm = (v) => Math.hypot(...v);
const sub = (u, v) => u.map((x, i) => x - v[i]);
const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];

const rng = mulberry32(20261125);
function randomS3() {
  const g = () => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
  };
  const p = [g(), g(), g(), g()];
  const r = norm(p);
  return p.map((x) => x / r);
}
const toSpinor = ([a, b, c, d]) => [
  { re: a, im: b },
  { re: c, im: d },
];

// ------------------------------------------------------------------ Hopf map = Bloch vector
for (let t = 0; t < 400; t++) {
  const psi = randomS3();
  const n = hopf(psi);
  near(norm(n), 1, 1e-12, 'h(ψ) lies on S²');
  // independent: ⟨ψ|σ_i|ψ⟩ with the Pauli matrices of the core library
  const sp = toSpinor(psi);
  const bloch = sigma.map((s) => cvec.dot(sp, cmat.apply(s, sp)).re);
  nearV(n, bloch, 1e-12, 'h(ψ) = ⟨ψ|σ|ψ⟩');
  // fibres: the global phase does not move the base point
  const chi = TAU * rng();
  const psiChi = withPhase(psi, chi);
  near(norm(psiChi), 1, 1e-12, 'e^{iχ}ψ stays on S³');
  nearV(hopf(psiChi), n, 1e-12, 'h(e^{iχ}ψ) = h(ψ)');
  const z = inner(psi, psiChi);
  nearV(z, [Math.cos(chi), Math.sin(chi)], 1e-12, '⟨ψ|e^{iχ}ψ⟩ = e^{iχ}');
  // ⟨p|q⟩ = conj ⟨q|p⟩, ⟨ψ|ψ⟩ = 1
  const q = randomS3();
  const pq = inner(psi, q);
  const qp = inner(q, psi);
  nearV(pq, [qp[0], -qp[1]], 1e-12, '⟨p|q⟩ = conj⟨q|p⟩');
  nearV(inner(psi, psi), [1, 0], 1e-12, '⟨ψ|ψ⟩ = 1');
  // rotAD is an isometry of S³ (and τ = 0 is the identity)
  near(norm(rotAD(psi, 0.7)), 1, 1e-12, 'rotAD preserves the norm');
  nearV(rotAD(psi, 0), psi, 0, 'rotAD(ψ, 0) = ψ');
}

// ------------------------------------------------------------------ section
for (let t = 0; t < 200; t++) {
  const th = Math.PI * rng() * 0.999;
  const ph = TAU * rng() - Math.PI;
  const s = section(th, ph);
  near(norm(s), 1, 1e-12, 'section on S³');
  nearV(hopf(s), sph(th, ph), 1e-12, 'h(s(θ, φ)) = n(θ, φ)');
  const n = randomUnit3(rng);
  nearV(hopf(sectionAt(n)), n, 1e-12, 'h(sectionAt(n)) = n');
  const a = angles(sph(th, ph));
  near(a.theta, th, 1e-9, 'angles θ round trip');
  if (th > 1e-6) near(wrapPi(a.phi - ph), 0, 1e-9, 'angles φ round trip');
}

// ------------------------------------------------------------------ stereographic picture
// the projection point (0,0,0,1) lies on the fibre over −ẑ
nearV(hopf([0, 0, 0, 1]), [0, 0, -1], 1e-15, 'pole lies on the fibre over the south pole');
for (const tau of [0, 0.3, 1.1, -0.8]) {
  // poleFibreBase(τ) is the base point whose fibre goes through the projection point after rotAD(·, τ)
  const preimage = rotAD([0, 0, 0, 1], -tau); // R⁻¹ e_d
  nearV(hopf(preimage), poleFibreBase(tau), 1e-12, `poleFibreBase(${tau})`);
}
nearV(stereo4([0, 0, 1, 0]), [0, 0, 1], 1e-15, 'stereo of e_c');
ok(!Number.isFinite(stereo4([0, 0, 0, 1])[0]), 'stereo of the pole is at infinity');

// every fibre (except the one through the pole) projects to a round circle
function circleFit(P) {
  // plane through three points, circumcentre, then check all points
  const [a, b, c] = [P[0], P[Math.floor(P.length / 3)], P[Math.floor((2 * P.length) / 3)]];
  const ab = sub(b, a);
  const ac = sub(c, a);
  const nrm = cross(ab, ac);
  const n2 = dot(nrm, nrm);
  const centre = a.map(
    (x, i) => x + (cross(nrm, ab)[i] * dot(ac, ac) + cross(ac, nrm)[i] * dot(ab, ab)) / (2 * n2),
  );
  const R = norm(sub(a, centre));
  const nn = nrm.map((x) => x / Math.sqrt(n2));
  let planeErr = 0;
  let radErr = 0;
  for (const p of P) {
    planeErr = Math.max(planeErr, Math.abs(dot(sub(p, a), nn)));
    radErr = Math.max(radErr, Math.abs(norm(sub(p, centre)) - R));
  }
  return { centre, R, planeErr, radErr };
}
for (let t = 0; t < 60; t++) {
  const n = randomUnit3(rng);
  if (n[2] < -0.95) continue; // close to the fibre through the pole: huge circle, poorly conditioned
  const s = sectionAt(n);
  const P = [];
  for (let k = 0; k < 64; k++) P.push(fibrePoint(s, (TAU * k) / 64));
  const f = circleFit(P);
  const tol = 1e-8 * Math.max(1, f.R);
  ok(f.planeErr < tol && f.radErr < tol, `fibre over [${n.map((x) => x.toFixed(3))}] is a round circle (plane ${f.planeErr}, radius ${f.radErr})`);
}

// fibres over a latitude θ sweep the torus of revolution about z with R = 1/cos(θ/2), r = tan(θ/2)
for (const th of [0.3, 1, Math.PI / 2, 2.2, 2.8]) {
  const { R, r } = latitudeTorus(th);
  let err = 0;
  for (let i = 0; i < 24; i++) {
    const s = section(th, (TAU * i) / 24);
    for (let k = 0; k < 24; k++) {
      const p = fibrePoint(s, (TAU * k) / 24);
      const rho = Math.hypot(p[0], p[1]);
      err = Math.max(err, Math.abs(Math.hypot(rho - R, p[2]) - r));
    }
  }
  ok(err < 1e-9 * (1 + R), `latitude θ=${th}: fibres lie on the torus R=1/cos(θ/2), r=tan(θ/2) (err ${err})`);
}

// any two distinct fibres are linked exactly once (Gauss linking integral), all with the same sign
function linking(P, Q) {
  // Gauss integral over two closed polygons (midpoint rule on segments)
  let L = 0;
  for (let i = 0; i < P.length; i++) {
    const a0 = P[i];
    const a1 = P[(i + 1) % P.length];
    const da = sub(a1, a0);
    const am = a0.map((x, k) => (x + a1[k]) / 2);
    for (let j = 0; j < Q.length; j++) {
      const b0 = Q[j];
      const b1 = Q[(j + 1) % Q.length];
      const db = sub(b1, b0);
      const bm = b0.map((x, k) => (x + b1[k]) / 2);
      const r = sub(am, bm);
      const d = norm(r);
      L += dot(r, cross(da, db)) / (d * d * d);
    }
  }
  return L / (4 * Math.PI);
}
const fibre = (n, m = 160) => {
  const s = sectionAt(n);
  return Array.from({ length: m }, (_, k) => fibrePoint(s, (TAU * k) / m));
};
const links = [];
for (let t = 0; t < 8; t++) {
  let n1;
  let n2;
  do {
    n1 = randomUnit3(rng);
    n2 = randomUnit3(rng);
  } while (n1[2] < -0.6 || n2[2] < -0.6 || dot(n1, n2) > 0.8);
  const lk = linking(fibre(n1), fibre(n2));
  links.push(lk);
  near(Math.abs(lk), 1, 0.02, 'two Hopf fibres have linking number ±1');
}
ok(links.every((l) => Math.sign(l) === Math.sign(links[0])), 'all pairs of fibres link with the same sign');

// sampleClosed: a fibre away from the pole comes back closed and inside the clip radius;
// a fibre through the projection point is an infinite line and comes back open
{
  const s = sectionAt([0.3, 0.2, 0.93]);
  const res = sampleClosed((t) => fibrePoint(s, TAU * t), { rClip: 14 });
  ok(res.closed, 'ordinary fibre samples as a closed curve');
  ok(res.pts.every((p) => norm(p) <= 14 + 1e-9), 'samples stay inside the clip radius');
  nearV(res.pts[0], res.pts[res.pts.length - 1], 1e-9, 'closed curve repeats its first point');
  const sp = sectionAt([0, 0, -1]);
  const open = sampleClosed((t) => fibrePoint(sp, TAU * t), { rClip: 14 });
  ok(!open.closed, 'fibre through the projection point is open (a line through infinity)');
  ok(open.pts.every((p) => norm(p) <= 14 + 1e-6), 'clipped line stays inside the clip radius');
}

// ------------------------------------------------------------------ solid angles
near(triangleSolidAngle([1, 0, 0], [0, 1, 0], [0, 0, 1]), Math.PI / 2, 1e-12, 'octant solid angle = π/2');
near(triangleSolidAngle([0, 1, 0], [1, 0, 0], [0, 0, 1]), -Math.PI / 2, 1e-12, 'reversed octant = −π/2');
for (const th of [0.2, 1, Math.PI / 2, 2.5]) {
  const L = makeLoop('latitude', th, 2000);
  near(L.omegaExact, TAU * (1 - Math.cos(th)), 1e-12, `latitude ${th}: Ω = 2π(1 − cos θ)`);
  // the fan uses geodesic chords between samples, so it differs from the smooth latitude by O(1/N²)
  near(loopSolidAngle(L.pts, [0, 0, 1]), L.omegaExact, 1e-5, `latitude ${th}: fan solid angle`);
}

// ------------------------------------------------------------------ Berry phase of spin ½: γ = −Ω/2
// Parallel transport along the loop; the holonomy arg⟨ψ_0|ψ_N⟩ must equal −Ω/2 (mod 2π).
// Analytic: A = i⟨s|ds⟩ = −sin²(θ/2) dφ for s = (cos θ/2, e^{iφ} sin θ/2), so ∮A = −π(1 − cos θ) = −Ω/2.
for (const th of [0.15, 0.6, Math.PI / 3, Math.PI / 2, 2.0, 2.6]) {
  const L = makeLoop('latitude', th, 1440);
  const { gamma, chi, psi } = horizontalLift(L.pts);
  near(wrapPi(gamma - -L.omegaExact / 2), 0, 2e-5, `latitude θ=${th.toFixed(3)}: γ = −Ω/2`);
  near(chi[chi.length - 1], -L.omegaExact / 2, 2e-5, `latitude θ=${th.toFixed(3)}: unwrapped χ = ∮A = −Ω/2`);
  // the lift is horizontal: consecutive overlaps real and positive, and it stays over the loop
  let maxIm = 0;
  let minRe = 1;
  let maxBase = 0;
  for (let k = 1; k < psi.length; k++) {
    const z = inner(psi[k - 1], psi[k]);
    maxIm = Math.max(maxIm, Math.abs(z[1]));
    minRe = Math.min(minRe, z[0]);
    maxBase = Math.max(maxBase, norm(sub(hopf(psi[k]), L.pts[k % L.pts.length])));
  }
  ok(maxIm < 1e-12 && minRe > 0.99, `latitude θ=${th.toFixed(3)}: lift is horizontal (Im ${maxIm})`);
  ok(maxBase < 1e-12, `latitude θ=${th.toFixed(3)}: lift projects onto the loop`);
}
// θ = π/2: Ω = 2π, γ = −π, i.e. ψ → −ψ (the spinor sign flip after a 2π rotation)
{
  const { psi } = horizontalLift(makeLoop('latitude', Math.PI / 2, 2000).pts);
  const z = inner(psi[0], psi[psi.length - 1]);
  nearV(z, [-1, 0], 1e-5, 'equator: ψ comes back as −ψ');
}
// geodesic triangle ẑ → x̂ → ŷ: Ω = π/2 → γ = −π/4; figure-eight: lobes cancel → γ = 0
{
  const T = makeLoop('triangle', Math.PI / 2, 3000);
  near(T.omegaExact, Math.PI / 2, 1e-12, 'octant triangle encloses π/2');
  near(wrapPi(horizontalLift(T.pts).gamma + Math.PI / 4), 0, 1e-5, 'octant triangle: γ = −π/4');
  for (const th of [0.3, 0.6]) {
    const E = makeLoop('eight', th, 3000);
    near(loopSolidAngle(E.pts, E.centre), 0, 1e-9, `figure-eight ${th}: lobes enclose opposite solid angles`);
    near(wrapPi(horizontalLift(E.pts).gamma), 0, 1e-5, `figure-eight ${th}: γ = 0`);
  }
}
// gauge / orientation independence: rotate the loop rigidly anywhere on the sphere (through the
// section's singular point too), γ stays −Ω/2; reversing the loop flips the sign
for (let t = 0; t < 12; t++) {
  const th = 0.3 + 2.4 * rng();
  const R = expSO3(randomUnit3(rng).map((x) => x * Math.PI * rng()));
  const L = makeLoop('latitude', th, 1440);
  const pts = L.pts.map((p) => mat.mulv(R, p));
  near(wrapPi(horizontalLift(pts).gamma + L.omegaExact / 2), 0, 3e-5, `rotated loop ${t}: γ = −Ω/2`);
  near(wrapPi(horizontalLift(pts.slice().reverse()).gamma - L.omegaExact / 2), 0, 3e-5, `reversed loop ${t}: γ = +Ω/2`);
}
// closedLift: a smooth closed curve in S³ over the loop (the holonomy spread uniformly)
{
  const L = makeLoop('latitude', 1.1, 720);
  const lift = closedLift(L.pts);
  const z = inner(lift[lift.length - 1], lift[0]);
  ok(z[0] > 0.9999 && Math.abs(z[1]) < 0.01, 'closedLift closes up');
  ok(lift.every((p, k) => norm(sub(hopf(p), L.pts[k])) < 1e-12), 'closedLift stays over the loop');
}

// ------------------------------------------------------------------ report
for (const f of fails) console.log('FAIL', f);
console.log(`hopf: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
