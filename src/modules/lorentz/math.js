// Lorentz group: DOM-free maths for the #/lorentz module. Checked by tests/lorentz.test.mjs.
//
// Conventions (site-wide, docs/ARCHITECTURE.md):
//   ħ = c = 1; metric (+,−,−,−) — in 2+1 D (+,−,−); coordinates (t, x, y, z); ACTIVE transformations.
//   Rapidity η, β = tanh η, γ = cosh η.
//   Hermitian generators J_i, K_i with Λ = exp(−i θ·J − i η·K) and
//     [J_i,J_j] = iε_ijk J_k,   [J_i,K_j] = iε_ijk K_k,   [K_i,K_j] = −iε_ijk J_k.
//   The real matrices that multiply 4-vectors are L_i = −iJ_i (antisymmetric) and B_i = −iK_i (symmetric):
//     [L_i,L_j] = ε_ijk L_k,   [L_i,B_j] = ε_ijk B_k,   [B_i,B_j] = −ε_ijk L_k.
//   SL(2,C): X = x^μ σ_μ (σ_0 = 1), X ↦ A X A†, det X = t² − |x|².
//   Sky coordinate ζ = (n_x + i n_y)/(1 + n_z) = e^{iφ} tan(θ/2) for the direction n̂ in which a star is SEEN:
//     stereographic projection from the backward pole −z, so the forward direction +z sits at ζ = 0.
//     With the spinor ψ = (cos θ/2, e^{iφ} sin θ/2) one has (1, n̂) = 2ψψ† and ζ = ψ₂/ψ₁, so
//     A = (a b; c d) acts on the sky as the Möbius map ζ ↦ (c + dζ)/(a + bζ).

import { mat, vec, clamp, wrapPi, mulberry32, randomUnit3, TAU } from '../../core/la.js';
import { cx, cmat, sigma, su2Rotation } from '../../core/complex.js';

export const BETA_MAX = 0.9999;

// ================================================================== 1+1 D
/** Real boost generator acting on column vectors (t, x): X = [[0,1],[1,0]], X² = 1. In the Hermitian convention X = −iK_x. */
export const X11 = [
  [0, 1],
  [1, 0],
];

/** Λ(η) = exp(ηX) = cosh η·1 + sinh η·X, acting on (t, x). */
export function boost11(eta) {
  const c = Math.cosh(eta);
  const s = Math.sinh(eta);
  return [
    [c, s],
    [s, c],
  ];
}

/** Active boost of an event written in PLOT order [x, t] (x horizontal, t vertical). Returns [x', t']. */
export function boostEvent(p, eta) {
  const c = Math.cosh(eta);
  const s = Math.sinh(eta);
  return [p[0] * c + p[1] * s, p[1] * c + p[0] * s];
}

/** Invariant interval t² − x² of an event [x, t]. */
export const interval2 = (p) => p[1] * p[1] - p[0] * p[0];
export const betaOf = (eta) => Math.tanh(eta);
export const gammaOf = (eta) => Math.cosh(eta);
export const rapidityOf = (b) => Math.atanh(clamp(b, -BETA_MAX, BETA_MAX));
/** Relativistic composition of collinear velocities. */
export const addVelocities = (b1, b2) => (b1 + b2) / (1 + b1 * b2);

/** Hyperbolic sector of the unit hyperbola t² − x² = 1 between rapidities a and b, as a polygon of [x, t]
 *  points (origin first). Its signed area is (b − a)/2: the rapidity is twice the sector area. */
export function sectorPolygon(a, b, n = 48) {
  const pts = [[0, 0]];
  for (let i = 0; i <= n; i++) {
    const e = a + ((b - a) * i) / n;
    pts.push([Math.sinh(e), Math.cosh(e)]);
  }
  return pts;
}

// ================================================================== 2+1 D (t, x, y)
export const G3 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];
/** Minkowski product, signature (+,−,−). */
export const mdot3 = (a, b) => a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
/** Real generators on (t,x,y): rotation L (turns x into y) = −iJ, boosts B_x, B_y = −iK_x, −iK_y. */
export const L3 = [
  [0, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
];
export const BX3 = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 0],
];
export const BY3 = [
  [0, 0, 1],
  [0, 0, 0],
  [1, 0, 0],
];

export function clampVel(u, max = BETA_MAX) {
  const n = Math.hypot(u[0], u[1]);
  if (!Number.isFinite(n)) return [0, 0];
  return n > max ? [(u[0] * max) / n, (u[1] * max) / n] : [u[0], u[1]];
}
export function gammaOfVel(u) {
  const u2 = Math.min(u[0] * u[0] + u[1] * u[1], BETA_MAX * BETA_MAX);
  return 1 / Math.sqrt(1 - u2);
}
/** 3-velocity → 4-velocity (γ, γu). */
export function fourVelocity(u) {
  const g = gammaOfVel(u);
  return [g, g * u[0], g * u[1]];
}
/** 4-vector (timelike) → 3-velocity. */
export const velocityOf = (U) => [U[1] / U[0], U[2] / U[0]];

/** Pure boost with velocity u = [ux, uy], |u| < 1: B(u)(1,0,0) = (γ, γu). Uses (γ−1)/u² = γ²/(γ+1), finite at u = 0. */
export function boost3(u) {
  const [ux, uy] = clampVel(u);
  const g = gammaOfVel([ux, uy]);
  const k = (g * g) / (g + 1);
  return [
    [g, g * ux, g * uy],
    [g * ux, 1 + k * ux * ux, k * ux * uy],
    [g * uy, k * ux * uy, 1 + k * uy * uy],
  ];
}
/** Pure boost with rapidity eta along the direction at angle phi (numerically safe for large eta). */
export function boostRapidity3(eta, phi) {
  const ch = Math.cosh(eta);
  const sh = Math.sinh(eta);
  const nx = Math.cos(phi);
  const ny = Math.sin(phi);
  const k = ch - 1;
  return [
    [ch, sh * nx, sh * ny],
    [sh * nx, 1 + k * nx * nx, k * nx * ny],
    [sh * ny, k * nx * ny, 1 + k * ny * ny],
  ];
}
/** Active rotation of the (x, y) plane by theta (counter-clockwise). */
export function rot3(th) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}
/** Inverse of a Lorentz matrix: Λ⁻¹ = G Λᵀ G. */
export function lorentzInv3(L) {
  return [
    [L[0][0], -L[1][0], -L[2][0]],
    [-L[0][1], L[1][1], L[2][1]],
    [-L[0][2], L[1][2], L[2][2]],
  ];
}

/** Einstein velocity addition: velocity (in S) of an object moving with v relative to a frame that moves with u
 *  relative to S (and is obtained from S by the pure boost B(u)). Equals velocityOf(B(u)B(v)e_0). */
export function einsteinAdd(u, v) {
  const gu = gammaOfVel(u);
  const uv = u[0] * v[0] + u[1] * v[1];
  const k = gu / (1 + gu);
  const den = 1 + uv;
  return [(u[0] + v[0] / gu + k * uv * u[0]) / den, (u[1] + v[1] / gu + k * uv * u[1]) / den];
}

/** Polar decomposition of a 2+1 D Lorentz matrix: Λ = B(w) R(angle), with w read off Λ's first column and
 *  R = B(w)⁻¹Λ a pure rotation (R e_0 = e_0). */
export function decompose3(L) {
  const w = [L[1][0] / L[0][0], L[2][0] / L[0][0]];
  const R = mat.mul(boost3([-w[0], -w[1]]), L);
  const angle = Math.atan2((R[2][1] - R[1][2]) / 2, (R[1][1] + R[2][2]) / 2);
  return { w, R, angle };
}

/** "Boost u, then boost v" in the sense of velocity addition: Λ = B(u)B(v) = B(u⊕v) R(ε). */
export function composeBoosts(u, v) {
  const L = mat.mul(boost3(u), boost3(v));
  return { L, ...decompose3(L) };
}

/** Closed form of the Thomas–Wigner angle of B(u)B(v) (sign: clockwise, i.e. negative, when v points
 *  counter-clockwise from u). cos ε = (1+γ+γ_u+γ_v)²/((1+γ)(1+γ_u)(1+γ_v)) − 1, γ = γ_uγ_v(1+u·v). */
export function wignerAngle(u, v) {
  const gu = gammaOfVel(u);
  const gv = gammaOfVel(v);
  const g = gu * gv * (1 + u[0] * v[0] + u[1] * v[1]);
  const c = ((1 + g + gu + gv) ** 2) / ((1 + g) * (1 + gu) * (1 + gv)) - 1;
  const cross = u[0] * v[1] - u[1] * v[0];
  return -Math.sign(cross) * Math.acos(clamp(c, -1, 1));
}

// ---------------------------------------------------------------- hyperbolic velocity space
/** Point of the unit hyperboloid (rapidity space H²) for a velocity in Beltrami–Klein coordinates (= the velocity). */
export const hypPoint = (u) => fourVelocity(u);
/** Hyperbolic distance = relative rapidity: cosh d = γ_aγ_b(1 − a·b). */
export function hypDistance(a, b) {
  return Math.acosh(Math.max(1, mdot3(hypPoint(a), hypPoint(b))));
}
/** Interior angle at A of the geodesic triangle A, B, C (4-velocities on the hyperboloid). */
function angleAt(A, B, C) {
  const ab = mdot3(A, B);
  const ac = mdot3(A, C);
  const tB = [B[0] - ab * A[0], B[1] - ab * A[1], B[2] - ab * A[2]];
  const tC = [C[0] - ac * A[0], C[1] - ac * A[1], C[2] - ac * A[2]];
  const nB = -mdot3(tB, tB);
  const nC = -mdot3(tC, tC);
  if (!(nB > 1e-18) || !(nC > 1e-18)) return 0;
  return Math.acos(clamp(-mdot3(tB, tC) / Math.sqrt(nB * nC), -1, 1));
}
/** Geodesic triangle in velocity space (vertices given as velocities = Klein coordinates).
 *  Returns { angles: [α_a, α_b, α_c], area (= angular defect π − Σα, curvature −1), sides, orientation (±1, 0) }. */
export function hypTriangle(a, b, c) {
  const A = hypPoint(a);
  const B = hypPoint(b);
  const C = hypPoint(c);
  const angles = [angleAt(A, B, C), angleAt(B, C, A), angleAt(C, A, B)];
  const area = Math.max(0, Math.PI - angles[0] - angles[1] - angles[2]);
  const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return { angles, area, orientation: Math.sign(cr), sides: [hypDistance(b, c), hypDistance(c, a), hypDistance(a, b)] };
}

/** Points along the geodesic from velocity a to velocity b (returned as velocities / Klein coordinates). */
export function geodesic(a, b, n = 40) {
  const A = hypPoint(a);
  const B = hypPoint(b);
  const d = Math.acosh(Math.max(1, mdot3(A, B)));
  const pts = [];
  if (d < 1e-9) {
    for (let i = 0; i <= n; i++) pts.push(vec.lerp(a, b, i / n));
    return pts;
  }
  const sd = Math.sinh(d);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const wa = Math.sinh((1 - s) * d) / sd;
    const wb = Math.sinh(s * d) / sd;
    const P = [wa * A[0] + wb * B[0], wa * A[1] + wb * B[1], wa * A[2] + wb * B[2]];
    pts.push([P[1] / P[0], P[2] / P[0]]);
  }
  return pts;
}
/** Klein (= velocity) → Poincaré disk coordinate p = u/(1 + √(1−u²)) = tanh(η/2) û. */
export function kleinToPoincare(u) {
  const g = gammaOfVel(u);
  const k = g / (1 + g);
  return [u[0] * k, u[1] * k];
}
/** Poincaré → Klein: u = 2p/(1 + |p|²). */
export function poincareToKlein(p) {
  const k = 2 / (1 + p[0] * p[0] + p[1] * p[1]);
  return [p[0] * k, p[1] * k];
}

// ---------------------------------------------------------------- Thomas precession
/** Velocity on a counter-clockwise circular orbit with speed beta, at orbital (position) angle phi. */
export const orbitVelocity = (beta, phi) => [-beta * Math.sin(phi), beta * Math.cos(phi)];

/** One composition step: the frame L (with L e_0 = current 4-velocity) is boosted, IN ITS OWN REST FRAME, by the
 *  pure boost that carries it to the new velocity u. Returns the new frame, re-projected onto SO⁺(2,1). */
function stepFrame(L, u) {
  const U = fourVelocity(u);
  const Up = mat.mulv(lorentzInv3(L), U);
  const M = mat.mul(L, boost3([Up[1] / Up[0], Up[2] / Up[0]]));
  const { angle } = decompose3(M);
  return { L: mat.mul(boost3(u), rot3(angle)), angle };
}

/** Compose N small boosts per orbit around a circle of speed beta (a geodesic N-gon in velocity space).
 *  Returns the accumulated rotation of the comoving frame (Fermi–Walker transported gyroscope), unwrapped. */
export function thomasCompose(beta, N, turns = 1) {
  let L = boost3(orbitVelocity(beta, 0));
  let prev = 0;
  let acc = 0;
  const steps = Math.round(N * turns);
  for (let k = 1; k <= steps; k++) {
    const r = stepFrame(L, orbitVelocity(beta, (TAU * k) / N));
    L = r.L;
    acc += wrapPi(r.angle - prev);
    prev = r.angle;
  }
  return { angle: acc, L };
}
/** Area of the geodesic N-gon with vertices orbitVelocity(beta, 2πk/N) (fan triangulation from the centre). */
export function orbitPolygonArea(beta, N) {
  let a = 0;
  for (let k = 0; k < N; k++) a += hypTriangle([0, 0], orbitVelocity(beta, (TAU * k) / N), orbitVelocity(beta, (TAU * (k + 1)) / N)).area;
  return a;
}
/** Area of the hyperbolic disk of rapidity radius η (curvature −1): 2π(cosh η − 1) = 2π(γ − 1). */
export const hypDiskArea = (beta) => TAU * (gammaOfVel([beta, 0]) - 1);

/** Gyroscope on a circular orbit, for animation: state {L, phi, angle, prev}. */
export function gyroInit(beta, phi = 0) {
  return { L: boost3(orbitVelocity(beta, phi)), phi, angle: 0, prev: 0 };
}
/** Advance the orbital angle by dphi at speed beta, composing boosts in substeps of at most maxStep. */
export function gyroAdvance(g, beta, dphi, maxStep = TAU / 720) {
  const n = Math.max(1, Math.ceil(Math.abs(dphi) / maxStep));
  for (let i = 1; i <= n; i++) {
    const r = stepFrame(g.L, orbitVelocity(beta, g.phi + (dphi * i) / n));
    g.L = r.L;
    g.angle += wrapPi(r.angle - g.prev);
    g.prev = r.angle;
  }
  g.phi += dphi;
  return g;
}

// ================================================================== 3+1 D generators (t, x, y, z)
const EPS3 = (i, j, k) => ((i - j) * (j - k) * (k - i)) / 2;
export const G4 = mat.diag([1, -1, -1, -1]);

/** Real generators acting on 4-vectors: L_i (rotations, (L_i)_{jk} = −ε_ijk) and B_i (boosts, symmetric). */
export function realGenerators4() {
  const L = [0, 1, 2].map((i) => {
    const M = mat.zeros(4);
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) M[1 + j][1 + k] = -EPS3(i, j, k);
    return M;
  });
  const B = [0, 1, 2].map((i) => {
    const M = mat.zeros(4);
    M[0][1 + i] = 1;
    M[1 + i][0] = 1;
    return M;
  });
  return { L, B };
}
/** Hermitian-convention generators J_i = iL_i, K_i = iB_i (complex 4×4), so that Λ = exp(−iθ·J − iη·K). */
export function hermitianGenerators4() {
  const { L, B } = realGenerators4();
  const iTimes = (M) => M.map((r) => r.map((x) => ({ re: 0, im: x })));
  return { J: L.map(iTimes), K: B.map(iTimes) };
}
/** Λ = exp(θ·L + η·B): rotation vector θ and rapidity vector η. */
export function lorentz4(theta, eta) {
  const { L, B } = realGenerators4();
  return mat.expm(mat.combo([...theta, ...eta], [...L, ...B]));
}
/** Pure boost with velocity beta·n̂ (closed form). */
export function boost4(beta, n) {
  const nn = vec.normalize(n);
  const b = clamp(beta, -BETA_MAX, BETA_MAX);
  const g = 1 / Math.sqrt(1 - b * b);
  const M = mat.eye(4);
  M[0][0] = g;
  for (let i = 0; i < 3; i++) {
    M[0][1 + i] = M[1 + i][0] = g * b * nn[i];
    for (let j = 0; j < 3; j++) M[1 + i][1 + j] += (g - 1) * nn[i] * nn[j];
  }
  return M;
}

// ================================================================== SL(2,C) → SO⁺(1,3)
const C0 = cmat.eye(2);
/** σ_μ = (1, σ_x, σ_y, σ_z). */
export const SIG4 = [C0, ...sigma];
/** X = x^μ σ_μ = [[t+z, x−iy], [x+iy, t−z]]. */
export const toHerm = (x) => cmat.combo(x, SIG4);
/** x^μ = ½ tr(σ_μ X). */
export const fromHerm = (X) => [0, 1, 2, 3].map((m) => 0.5 * cmat.trace(cmat.mul(SIG4[m], X)).re);
/** det X = t² − |x|² (real for Hermitian X). */
export const detHerm = (X) => cmat.det2(X).re;
/** The covering homomorphism: Λ(A)^μ_ν = ½ tr(σ_μ A σ_ν A†). Λ(−A) = Λ(A). */
export function lorentzOf(A) {
  const Ad = cmat.dagger(A);
  const M = mat.zeros(4);
  for (let m = 0; m < 4; m++) {
    const left = cmat.mul(SIG4[m], A);
    for (let n = 0; n < 4; n++) M[m][n] = 0.5 * cmat.trace(cmat.chain(left, SIG4[n], Ad)).re;
  }
  return M;
}
/** Boost with rapidity eta along unit n: A = exp(η n̂·σ/2) = cosh(η/2) + sinh(η/2) n̂·σ (Hermitian, det 1). */
export function slBoost(eta, n) {
  const [x, y, z] = vec.normalize(n);
  const c = Math.cosh(eta / 2);
  const s = Math.sinh(eta / 2);
  return [
    [cx.of(c + s * z), { re: s * x, im: -s * y }],
    [{ re: s * x, im: s * y }, cx.of(c - s * z)],
  ];
}
/** Rotation by phi about n: A = exp(−iφ n̂·σ/2) ∈ SU(2). */
export const slRotation = (phi, n) => su2Rotation(n, phi);

/** Sky coordinate of a unit direction: ζ = (n_x + i n_y)/(1 + n_z); the backward pole −z maps to ∞. */
export function skyZeta(n) {
  const d = 1 + n[2];
  if (d < 1e-12) return { re: Infinity, im: 0 };
  return { re: n[0] / d, im: n[1] / d };
}
/** Inverse stereographic map ζ → unit direction. */
export function zetaToDir(z) {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return [0, 0, -1];
  const r2 = z.re * z.re + z.im * z.im;
  const k = 1 / (1 + r2);
  return [2 * z.re * k, 2 * z.im * k, (1 - r2) * k];
}
/** Möbius action of A = (a b; c d) on ζ = ψ₂/ψ₁:  ζ ↦ (c + dζ)/(a + bζ). ∞ is {re: Infinity}. */
export function mobiusSky(A, z) {
  const [[a, b], [c, d]] = A;
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
    if (cx.abs(b) < 1e-15) return { re: Infinity, im: 0 };
    return cx.div(d, b);
  }
  const num = cx.add(c, cx.mul(d, z));
  const den = cx.add(a, cx.mul(b, z));
  if (cx.abs(den) < 1e-15) return { re: Infinity, im: 0 };
  return cx.div(num, den);
}
/** Holomorphic vector field dζ/ds of the one-parameter group exp(sM) on the sky, M ∈ sl(2,C) = (α β; γ δ):
 *  v(ζ) = γ + (δ − α)ζ − βζ². */
export function skyField(M, z) {
  const [[al, be], [ga, de]] = M;
  return cx.sub(cx.add(ga, cx.mul(cx.sub(de, al), z)), cx.mul(be, cx.mul(z, z)));
}

/** Apply a 4×4 Lorentz matrix to the null vector s = (1, n̂) of a star seen in direction n̂.
 *  Returns the new direction and the Doppler factor D = s'^0 = ω'/ω. */
export function transformDirection(Lam, n) {
  const s = [1, n[0], n[1], n[2]];
  const sp = mat.mulv(Lam, s);
  const k = 1 / sp[0];
  return { n: [sp[1] * k, sp[2] * k, sp[3] * k], D: sp[0] };
}
/** Aberration for an observer moving with speed beta along +z: cos θ' = (cos θ + β)/(1 + β cos θ). */
export const aberrationCos = (c, beta) => (c + beta) / (1 + beta * c);
/** Doppler factor in terms of the OBSERVED angle: D = 1/(γ(1 − β cos θ')). */
export const dopplerObserved = (cp, beta) => Math.sqrt(1 - beta * beta) / (1 - beta * cp);

/** Seeded star field: unit directions with a brightness weight in (0, 1] (many faint, few bright). */
export function starField(n = 1400, seed = 20251125) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const dir = randomUnit3(rng);
    const b = Math.pow(rng(), 3.2);
    out.push({ n: dir, b });
  }
  return out;
}
/** Unit direction from polar angle theta (from +z) and azimuth phi. */
export const dirOf = (theta, phi) => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
/** Small circle on the sky: centre direction c, angular radius rho, n samples. */
export function skyCircle(c, rho, n = 64) {
  const cc = vec.normalize(c);
  const u = vec.perp(cc);
  const w = vec.cross(cc, u);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (TAU * i) / n;
    pts.push(vec.add(vec.scale(cc, Math.cos(rho)), vec.add(vec.scale(u, Math.sin(rho) * Math.cos(a)), vec.scale(w, Math.sin(rho) * Math.sin(a)))));
  }
  return pts;
}
/** Great-circle arc between two unit directions (slerp), n segments. */
export function skyArc(a, b, n = 16) {
  const om = Math.acos(clamp(vec.dot(a, b), -1, 1));
  if (om < 1e-9) return [a, b];
  const s = Math.sin(om);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(vec.add(vec.scale(a, Math.sin((1 - t) * om) / s), vec.scale(b, Math.sin(t * om) / s)));
  }
  return pts;
}

// ================================================================== momentum orbits in 2+1 D: (E, p_x, p_y)
/** Generator of the little group of p, W_p = E L + p_y B_x − p_x B_y (so(2,1) ≅ R^{2,1}, equivariant). W_p p = 0. */
export function littleGenerator(p) {
  return mat.combo([p[0], p[2], -p[1]], [L3, BX3, BY3]);
}
/** exp(sW) for W ∈ so(2,1): W³ = λ²W with λ² = b² + c² − a² (W = aL + bB_x + cB_y), λ² = −p·p for W = W_p. */
export function expSO21(W, s) {
  const a = W[2][1];
  const b = W[0][1];
  const c = W[0][2];
  const l2 = b * b + c * c - a * a;
  const x = l2 * s * s;
  let f1;
  let f2;
  if (Math.abs(x) < 1e-6) {
    f1 = s * (1 + x / 6);
    f2 = s * s * (0.5 + x / 24);
  } else if (l2 > 0) {
    const l = Math.sqrt(l2);
    f1 = Math.sinh(l * s) / l;
    f2 = (Math.cosh(l * s) - 1) / l2;
  } else {
    const w = Math.sqrt(-l2);
    f1 = Math.sin(w * s) / w;
    f2 = (1 - Math.cos(w * s)) / -l2;
  }
  const W2 = mat.mul(W, W);
  const R = mat.eye(3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] += f1 * W[i][j] + f2 * W2[i][j];
  return R;
}

export const ORBIT_TYPES = ['massive', 'massless', 'tachyonic'];
/** Representative momentum of each orbit: rest (m,0,0); null (1,1,0); spacelike (0,μ,0). */
export function refMomentum(type, m) {
  if (type === 'massless') return [1, 1, 0];
  if (type === 'tachyonic') return [0, m, 0];
  return [m, 0, 0];
}
/** Frame taking the representative momentum to p: Λ_p = R(φ) B_x(χ). */
export const orbitFrame = (chi, phi) => mat.mul(rot3(phi), boostRapidity3(chi, 0));
/** p = Λ_p p_ref: massive m(cosh χ, sinh χ n̂), massless e^χ(1, n̂), tachyonic μ(sinh χ, cosh χ n̂). */
export function orbitMomentum(type, m, chi, phi) {
  return mat.mulv(orbitFrame(chi, phi), refMomentum(type, m));
}
/** Inverse of orbitMomentum for a point q = (E, p_x, p_y) on the orbit. */
export function orbitParams(type, m, q, phiFallback = 0) {
  const ps = Math.hypot(q[1], q[2]);
  const phi = ps > 1e-9 ? Math.atan2(q[2], q[1]) : phiFallback;
  let chi;
  if (type === 'massless') chi = Math.log(Math.max(ps, 1e-6));
  else if (type === 'tachyonic') chi = Math.asinh(q[0] / m);
  else chi = Math.asinh(ps / m);
  return { chi, phi };
}
/** Classify a momentum by m² = p·p. */
export function classify(p, tol = 1e-9) {
  const m2 = mdot3(p, p);
  const scale = Math.max(1, p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  if (Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) < tol) return { m2, type: 'vacuum' };
  if (Math.abs(m2) <= tol * scale) return { m2, type: 'massless' };
  return { m2, type: m2 > 0 ? 'massive' : 'tachyonic' };
}

/**
 * Little-group flow lines in the REFERENCE frame (before applying Λ_p), as parametrised curves q(τ) on the orbit,
 * each with the sign of dτ/ds under exp(sW_ref) (so dots can be animated along the true flow).
 *   massive  : circles at rest-frame rapidity radius c: m(cosh c, sinh c cos τ, sinh c sin τ)       (elliptic)
 *   massless : parabolas q·p_ref = c on the cone: c((1+τ²)/2, (τ²−1)/2, τ)                           (parabolic)
 *   tachyonic: level sets q_x = c on the one-sheeted hyperboloid (hyperbolas or the two rulings)     (hyperbolic)
 * Returns [{ f(τ) → [E,px,py], tau: [τ0, τ1], dir: ±1, rate, special }].
 */
export function littleFlowFamilies(type, m) {
  const out = [];
  if (type === 'massive') {
    for (const c of [0.35, 0.7, 1.05, 1.4]) {
      out.push({ f: (t) => [m * Math.cosh(c), m * Math.sinh(c) * Math.cos(t), m * Math.sinh(c) * Math.sin(t)], tau: [0, TAU], dir: 1, rate: m, closed: true });
    }
  } else if (type === 'massless') {
    for (const c of [0.25, 0.55, 0.95, 1.5]) {
      out.push({ f: (t) => [(c * (1 + t * t)) / 2, (c * (t * t - 1)) / 2, c * t], tau: [-6, 6], dir: -1, rate: 1 });
    }
  } else {
    const mu = m;
    for (const c of [-1.6, -1, -0.5, 0, 0.5, 1, 1.6]) {
      const cc = c * mu;
      if (Math.abs(Math.abs(c) - 1) < 1e-9) {
        // the two null rulings through (0, ±μ, 0): fixed point p (c = 1) or −p (c = −1)
        out.push({ f: (t) => [t, cc, t], tau: [-4, 4], dir: 0, rate: mu, special: c > 0, line: true, sgnY: 1 });
        out.push({ f: (t) => [t, cc, -t], tau: [-4, 4], dir: 0, rate: mu, special: c > 0, line: true, sgnY: -1 });
      } else if (Math.abs(c) < 1) {
        const k = Math.sqrt(mu * mu - cc * cc);
        out.push({ f: (t) => [k * Math.sinh(t), cc, k * Math.cosh(t)], tau: [-3, 3], dir: -1, rate: mu });
        out.push({ f: (t) => [k * Math.sinh(t), cc, -k * Math.cosh(t)], tau: [-3, 3], dir: 1, rate: mu });
      } else {
        const k = Math.sqrt(cc * cc - mu * mu);
        out.push({ f: (t) => [k * Math.cosh(t), cc, k * Math.sinh(t)], tau: [-3, 3], dir: -1, rate: mu });
        out.push({ f: (t) => [-k * Math.cosh(t), cc, k * Math.sinh(t)], tau: [-3, 3], dir: 1, rate: mu });
      }
    }
  }
  return out;
}

/** Ray o + t·d (three.js coordinates [p_x, p_y, E]) against the orbit E² − p² = m2 (signed).
 *  sheet: +1 keeps E > 0 only (massive, massless), 0 keeps both. Returns the smallest t > 0 or null. */
export function rayHitOrbit(o, d, m2, sheet = 1) {
  const a = d[2] * d[2] - d[0] * d[0] - d[1] * d[1];
  const b = 2 * (o[2] * d[2] - o[0] * d[0] - o[1] * d[1]);
  const c = o[2] * o[2] - o[0] * o[0] - o[1] * o[1] - m2;
  const roots = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    roots.push((-b - s) / (2 * a), (-b + s) / (2 * a));
  }
  roots.sort((x, y) => x - y);
  for (const t of roots) {
    if (!(t > 1e-6)) continue;
    const E = o[2] + t * d[2];
    if (sheet > 0 && E <= 0) continue;
    return t;
  }
  return null;
}

export { TAU };
