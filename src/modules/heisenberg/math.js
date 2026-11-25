// Heisenberg group H_3 — pure maths (no DOM). Conventions (ħ = 1):
//   D(q0,p0) = exp(i(p0 x − q0 p)),  (Dψ)(x) = e^{i p0 x − i q0 p0/2} ψ(x − q0)
//   D(a) D(b) = e^{−(i/2) ω(a,b)} D(a+b),   ω(a,b) = a_q b_p − a_p b_q
// Applying D(δz_1), then D(δz_2), … around a closed loop gives e^{+iA} with A the signed (counter-clockwise > 0)
// area. Labelling the state e^{iφ} D(q,p) ψ0 by (q,p,φ), a further displacement D(δ) maps the label to
// (q,p,φ)·(δ,0) in the polarised law below, so the transported state follows the horizontal lift
// dφ = ½(q dp − p dq) and ends A above its start.

export const TAU = 2 * Math.PI;
export const PI = Math.PI;

/** Symplectic form ω(a,b) = a_q b_p − a_p b_q (= cross product in the q–p plane). */
export const omega = (a, b) => a[0] * b[1] - a[1] * b[0];

/** Polarised group law of H_3: (q,p,φ)(q',p',φ') = (q+q', p+p', φ+φ'+½(qp'−pq')). */
export const hmul = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2] + 0.5 * (a[0] * b[1] - a[1] * b[0])];
export const hinv = (a) => [-a[0], -a[1], -a[2]];

/** Group commutator e^{εX} e^{εY} e^{−εX} e^{−εY} in H_3 — exactly (0, 0, ε²). */
export function groupCommutator(eps) {
  const X = [eps, 0, 0];
  const Y = [0, eps, 0];
  return hmul(hmul(hmul(X, Y), hinv(X)), hinv(Y));
}

/** Signed area of a closed polygon (shoelace; counter-clockwise > 0). */
export function signedArea(pts) {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const finite2 = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * Loop object from a closed polygon pts (last point ≠ first). Precomputes cumulative arc length and the
 * horizontal lift φ_k = ½ Σ_{j<k} (q_j p_{j+1} − p_j q_{j+1}) (exact for straight segments), φ_n = A.
 */
export function makeLoop(ptsIn) {
  let pts = (ptsIn || []).filter(finite2).map((p) => [p[0], p[1]]);
  // drop a duplicated closing point
  if (pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) pts = pts.slice(0, -1);
  }
  if (pts.length < 3) pts = [
    [0, 0],
    [1e-3, 0],
    [0, 1e-3],
  ];
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  const phi = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    cum[k + 1] = cum[k] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    phi[k + 1] = phi[k] + 0.5 * (a[0] * b[1] - a[1] * b[0]);
  }
  return { pts, n, cum, phi, L: cum[n], area: phi[n] };
}

/** Point at progress s ∈ [0,1] (by arc length): { z, phi, t (unit tangent), seg }. */
export function loopAt(loop, s) {
  const { pts, n, cum, phi, L } = loop;
  const u = Math.min(1, Math.max(0, Number.isFinite(s) ? s : 0)) * L;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= u) lo = mid;
    else hi = mid;
  }
  const k = Math.min(lo, n - 1);
  const a = pts[k];
  const b = pts[(k + 1) % n];
  const len = cum[k + 1] - cum[k];
  const f = len > 1e-12 ? (u - cum[k]) / len : 0;
  const z = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const t = len > 1e-12 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
  return { z, phi: phi[k] + (phi[k + 1] - phi[k]) * f, t, seg: k };
}

/** The part of the loop traversed up to progress s (polyline, includes the current point). */
export function loopPrefix(loop, s) {
  const at = loopAt(loop, s);
  const out = loop.pts.slice(0, at.seg + 1);
  out.push(at.z);
  return out;
}

/** m+1 samples uniform in arc length: [{z, phi}] (for 3D curves). Vertices are inserted so corners stay sharp. */
export function sampleLoop(loop, m = 240) {
  const out = [];
  const { pts, n, cum, phi, L } = loop;
  let k = 0;
  for (let i = 0; i <= m; i++) {
    const u = (i / m) * L;
    while (k < n - 1 && cum[k + 1] < u) {
      k++;
      out.push({ z: pts[k], phi: phi[k] });
    }
    const len = cum[k + 1] - cum[k];
    const f = len > 1e-12 ? Math.min(1, Math.max(0, (u - cum[k]) / len)) : 0;
    const a = pts[k];
    const b = pts[(k + 1) % n];
    out.push({ z: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], phi: phi[k] + (phi[k + 1] - phi[k]) * f });
  }
  return out;
}

// ------------------------------------------------------------------ presets
// Each preset is a closed polygon in counter-clockwise order (except the figure-eight, whose lobes have
// opposite orientations). `start` is the first vertex.
function polySides(corners, perSide) {
  const out = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < perSide; j++) {
      const f = j / perSide;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  return out;
}

/** Raw preset polygon at unit scale × s (centred near the origin). */
export function presetPoints(kind, s = 1) {
  const pts = [];
  if (kind === 'square') {
    const h = 1.15 * s;
    return polySides(
      [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ],
      48,
    );
  }
  if (kind === 'triangle') {
    const R = 1.35 * s;
    const c = (deg) => [R * Math.cos((deg * PI) / 180), R * Math.sin((deg * PI) / 180) - 0.2 * s];
    return polySides([c(210), c(330), c(90)], 64);
  }
  if (kind === 'eight') {
    // lemniscate of Gerono q = a sin t, p = b sin 2t: right lobe clockwise, left lobe counter-clockwise
    const a = 1.3 * s;
    const b = 0.8 * s;
    const N = 256;
    for (let i = 0; i < N; i++) {
      const t = (TAU * i) / N;
      pts.push([a * Math.sin(t), b * Math.sin(2 * t)]);
    }
    return pts;
  }
  // circle, starting at the leftmost point, counter-clockwise
  const R = 1.25 * s;
  const N = 240;
  for (let i = 0; i < N; i++) {
    const t = PI + (TAU * i) / N;
    pts.push([R * Math.cos(t), R * Math.sin(t)]);
  }
  return pts;
}

/** Translate so that the first point sits at `to` (default origin). */
export function anchorAt(pts, to = [0, 0]) {
  const d = [to[0] - pts[0][0], to[1] - pts[0][1]];
  return pts.map((p) => [p[0] + d[0], p[1] + d[1]]);
}

export const reversePts = (pts) => [pts[0], ...pts.slice(1).reverse()];

/** Resample a freehand polyline (treated as closed) to m points uniform in arc length. */
export function resampleClosed(raw, m = 220) {
  const pts = raw.filter(finite2);
  if (pts.length < 3) return pts;
  const lp = makeLoop(pts);
  const out = [];
  for (let i = 0; i < m; i++) out.push(loopAt(lp, i / m).z);
  return out;
}

// ------------------------------------------------------------------ winding-number scanlines
/**
 * Spans of non-zero winding number of the closed polygon along the horizontal line y:
 * [[x0, x1, w], …]. w > 0 inside counter-clockwise parts. ∫ w dq dp = signed area.
 */
export function windingSpans(pts, y) {
  const cr = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      cr.push([a[0] + t * (b[0] - a[0]), b[1] > a[1] ? 1 : -1]);
    }
  }
  cr.sort((u, v) => u[0] - v[0]);
  const spans = [];
  let w = 0; // winding number = Σ over crossings to the right of the point of their direction
  for (let i = 0; i < cr.length - 1; i++) {
    w -= cr[i][1];
    if (w !== 0) spans.push([cr[i][0], cr[i + 1][0], w]);
  }
  return spans;
}

// ------------------------------------------------------------------ coherent states (ħ = m = ω = 1)
const N0 = Math.pow(PI, -0.25);

/** ψ(x) of e^{iθ} D(q,p)|0⟩ = π^{-1/4} e^{iθ} e^{ipx − iqp/2} e^{−(x−q)²/2}; returns [Re, Im]. */
export function coherentPsi(x, q, p, theta = 0) {
  const amp = N0 * Math.exp(-0.5 * (x - q) * (x - q));
  const ph = theta + p * x - 0.5 * q * p;
  return [amp * Math.cos(ph), amp * Math.sin(ph)];
}

/** ⟨D(zs)0 | e^{iθ} D(z) 0⟩ = e^{iθ} e^{(i/2) ω(zs,z)} e^{−|z−zs|²/4}; returns [Re, Im]. */
export function coherentOverlap(zs, z, theta = 0) {
  const dq = z[0] - zs[0];
  const dp = z[1] - zs[1];
  const mod = Math.exp(-(dq * dq + dp * dp) / 4);
  const ph = theta + 0.5 * omega(zs, z);
  return [mod * Math.cos(ph), mod * Math.sin(ph)];
}

/** Wigner function of a coherent state centred at (q0,p0): (1/π) e^{−(q−q0)²−(p−p0)²}. */
export const wignerCoherent = (q, p, q0, p0) => Math.exp(-(q - q0) * (q - q0) - (p - p0) * (p - p0)) / PI;

// ------------------------------------------------------------------ magnetic flux
/** Aharonov–Bohm double slit: I(y) ∝ cos²(k d y /(2L) + qΦ/2) (upper path above the solenoid, B out of the plane). */
export function abIntensity(y, kdOverL, qPhi) {
  const c = Math.cos(0.5 * kdOverL * y + 0.5 * qPhi);
  return c * c;
}

/** Phase reduced to (−π, π]. */
export function wrapPi(x) {
  if (!Number.isFinite(x)) return 0;
  const r = ((((x + PI) % TAU) + TAU) % TAU) - PI;
  return r === -PI ? PI : r;
}
