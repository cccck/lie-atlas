// Shared UI helpers for the #/lorentz tabs.

/** Module-scoped CSS (injected with ui.css on the module scope). */
export const CSS = `
.m-lorentz .lz-tall { grid-row: span 2; }
.m-lorentz .lz-kv-tight td { padding: 2px 0; }
.m-lorentz .lz-ovl { font-size: 12.5px; line-height: 1.5; color: var(--ink-2); max-width: 260px; }
.m-lorentz .lz-ovl b { color: var(--ink); font-weight: 600; }
.m-lorentz .lz-ovl .katex { font-size: 1.02em; }
.m-lorentz .lz-class { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 6px 0 2px; }
.m-lorentz .lz-class th { text-align: left; font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 6px 3px 0; border-bottom: 1px solid var(--border); }
.m-lorentz .lz-class td { padding: 4px 6px 4px 0; border-bottom: 1px solid var(--border); color: var(--ink-2); vertical-align: top; }
.m-lorentz .lz-class tr:last-child td { border-bottom: 0; }
.m-lorentz .lz-class tr.on td { color: var(--ink); background: var(--accent-wash); }
.m-lorentz .lz-class tr.on td:first-child { box-shadow: inset 3px 0 0 var(--accent); padding-left: 6px; }
.m-lorentz .lz-scale { height: 8px; border-radius: 4px; margin: 6px 0 2px; }
.m-lorentz .lz-scale-labels { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--muted); }
.m-lorentz .lz-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
@media (max-width: 900px) {
  .m-lorentz .lz-tall { grid-row: auto; }
  .m-lorentz .lz-half { --h: 300px !important; }
}
`;

/**
 * Rate-limited updater for KaTeX readouts: request() marks the readouts dirty; fn() runs on the next animation
 * frame, but at most once every `ms` milliseconds (so a running animation does not re-typeset every frame).
 */
export function throttled(scope, fn, ms = 90) {
  let dirty = true;
  let last = -1e9;
  scope.frame(() => {
    if (!dirty) return;
    const now = performance.now();
    if (now - last < ms) return;
    last = now;
    dirty = false;
    fn();
  });
  return {
    request() {
      dirty = true;
    },
  };
}

/** Signed angle in degrees for TeX, e.g. −28.07^\circ. */
export function texDeg(rad, d = 1) {
  const v = (rad * 180) / Math.PI;
  const s = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
  return `${s.toFixed(d)}^\\circ`;
}

/** Point where the ray from the origin along dir leaves the visible rectangle of a plot (inset by margin px). */
export function rayExit(p, dir, marginPx = 18) {
  const v = p.view;
  const mx = marginPx / p.scale;
  const my = marginPx / p.scaleY;
  const x0 = v.x[0] + mx;
  const x1 = v.x[1] - mx;
  const y0 = v.y[0] + my;
  const y1 = v.y[1] - my;
  let t = Infinity;
  if (dir[0] > 1e-12) t = Math.min(t, x1 / dir[0]);
  if (dir[0] < -1e-12) t = Math.min(t, x0 / dir[0]);
  if (dir[1] > 1e-12) t = Math.min(t, y1 / dir[1]);
  if (dir[1] < -1e-12) t = Math.min(t, y0 / dir[1]);
  if (!Number.isFinite(t) || t <= 0) return null;
  return [dir[0] * t, dir[1] * t];
}
