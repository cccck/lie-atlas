// Cyclic phase colour map for complex amplitudes (DOM-free). Hue runs through OKLCH at constant
// lightness and chroma, so no phase looks brighter than another:
//   arg = 0 → blue,  π/2 → rose,  π → amber,  3π/2 → green.
// Real functions therefore show two colours: positive = blue, negative = amber.

const TAU = 2 * Math.PI;
const H0 = 255; // OKLCH hue (degrees) of phase 0

function srgbGamma(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** OKLCH (L ∈ [0,1], C, hue in degrees) → sRGB [r, g, b] in [0, 1] (clamped) and an in-gamut flag. */
export function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const inGamut = lin.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
  return { rgb: lin.map((x) => Math.min(1, Math.max(0, srgbGamma(Math.min(1, Math.max(0, x)))))), inGamut };
}

/** Lightness/chroma per theme: slightly lighter on dark backgrounds. */
export const phaseStyle = (dark) => (dark ? { L: 0.71, C: 0.135 } : { L: 0.63, C: 0.14 });

/** Largest chroma at (L, hue) that is still inside sRGB (bisection). */
export function maxChroma(L, hDeg) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    if (oklchToRgb(L, m, hDeg).inGamut) lo = m;
    else hi = m;
  }
  return lo;
}

/** Phase φ (radians) → [r, g, b] in [0, 1]. Chroma is reduced only where sRGB requires it (cyans). */
export function phaseRGB(phi, dark = true) {
  const { L, C } = phaseStyle(dark);
  const deg = ((((phi / TAU) * 360) % 360) + 360) % 360;
  const h = H0 + deg;
  return oklchToRgb(L, Math.min(C, 0.985 * maxChroma(L, h)), h).rgb;
}

/** Phase φ → CSS 'rgb(r,g,b)'. */
export function phaseCSS(phi, dark = true) {
  const [r, g, b] = phaseRGB(phi, dark);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/**
 * Lookup table of n colours around the circle: { rgb (sRGB), lin (linear-light, for WebGL vertex
 * colours), css, index(φ) }.
 */
export function phaseLUT(n = 256, dark = true) {
  const rgb = new Float32Array(3 * n);
  const lin = new Float32Array(3 * n);
  const css = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = phaseRGB((TAU * i) / n, dark);
    for (let k = 0; k < 3; k++) {
      rgb[3 * i + k] = c[k];
      lin[3 * i + k] = toLinear(c[k]);
    }
    css[i] = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  }
  return { rgb, lin, css, n, index: (phi) => ((Math.round((phi / TAU) * n) % n) + n) % n };
}

/** CSS conic-gradient with phase 0 at 3 o'clock increasing counter-clockwise (maths convention). */
export function phaseConic(dark = true, steps = 24) {
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const a = (360 * i) / steps; // CSS angle, clockwise from 3 o'clock
    stops.push(`${phaseCSS(-(a * Math.PI) / 180, dark)} ${a}deg`);
  }
  return `conic-gradient(from 90deg, ${stops.join(', ')})`;
}
