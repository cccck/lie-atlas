// Scrolling time-series strip on top of plot2d (used for L(t), E(t), ϖ(t) in #/kepler).
//   const s = seriesPlot(cell, scope, { label: 'L_z(t)', color: 'z', range: [-1, 1], window: 60, format: (y) => '…' });
//   s.push(t, y); s.setRef(y0); s.clear();
// The cell gets a one-line header (TeX label + live value) above the plot, so nothing overlaps the trace.
import { plot2d, niceStep } from '../../core/plot2d.js';
import { texHTML } from '../../core/tex.js';
import { fmt } from '../../core/format.js';

export function seriesPlot(cell, scope, o) {
  const T = [];
  const Y = [];
  let now = 0;
  let ref = null;
  let win = o.window ?? 60;
  let range = (o.range || [-1, 1]).slice();
  const cap = o.cap ?? 3000;
  const valueFmt = o.format || ((y) => fmt(y, 3));

  const head = document.createElement('div');
  head.className = 'kp-series-head';
  const lab = document.createElement('span');
  lab.className = 'kp-series-label';
  lab.innerHTML = texHTML(o.label);
  const cssVar = (c) => (c === 'ink2' ? 'var(--ink-2)' : `var(--${c})`);
  if (o.color) lab.style.color = cssVar(o.labelColor ?? o.color);
  const val = document.createElement('span');
  val.className = 'kp-series-value';
  head.append(lab, val);
  const body = document.createElement('div');
  body.className = 'kp-series-plot';
  cell.append(head, body);
  let lastVal = '';

  const p = plot2d(body, scope, {
    x: [-win, 0],
    y: range,
    equal: false,
    pan: false,
    zoom: false,
    grid: false,
    axes: false,
    draw(p) {
      const ctx = p.ctx;
      const step = niceStep((range[1] - range[0]) / 3.2);
      ctx.font = '10.5px system-ui, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      for (let y = Math.ceil(range[0] / step - 1e-9) * step; y <= range[1] + 1e-12; y += step) {
        const Y0 = Math.round(p.sy(y)) + 0.5;
        if (Y0 < 3 || Y0 > p.height - 2) continue;
        ctx.strokeStyle = p.color(Math.abs(y) < step * 1e-6 ? 'axis' : 'grid');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Y0);
        ctx.lineTo(p.width, Y0);
        ctx.stroke();
        if (Y0 > 13) {
          ctx.fillStyle = p.color('muted');
          ctx.fillText((o.tickFormat || ((v) => fmt(v, step < 0.01 ? 3 : step < 0.1 ? 2 : 1)))(y), 4, Y0 - 1);
        }
      }
      if (ref !== null && Number.isFinite(ref)) p.segment([-win, ref], [0, ref], { color: 'muted', width: 1, dash: [4, 4], alpha: 0.8 });
      if (T.length > 1) {
        const pts = [];
        for (let i = 0; i < T.length; i++) {
          if (!Number.isFinite(Y[i])) {
            pts.push(null);
            continue;
          }
          if (i > 0 && o.wrap && Math.abs(Y[i] - Y[i - 1]) > o.wrap) pts.push(null);
          pts.push([T[i] - now, Y[i]]);
        }
        p.line(pts, { color: o.color, width: 1.8 });
        const yl = Y[Y.length - 1];
        if (Number.isFinite(yl)) p.dot([0, Math.max(range[0], Math.min(range[1], yl))], { r: 3.5, fill: o.color });
      }
    },
  });

  function showValue(y) {
    const s = Number.isFinite(y) ? valueFmt(y) : '—';
    if (s !== lastVal) {
      val.textContent = s;
      lastVal = s;
    }
  }

  return {
    p,
    push(t, y) {
      T.push(t);
      Y.push(y);
      now = t;
      showValue(y);
      if (T.length > cap + 200) {
        T.splice(0, T.length - cap);
        Y.splice(0, Y.length - cap);
      }
      let cut = 0;
      while (cut < T.length - 2 && T[cut + 1] < now - win) cut++;
      if (cut > 50) {
        T.splice(0, cut);
        Y.splice(0, cut);
      }
      p.invalidate();
    },
    clear() {
      T.length = 0;
      Y.length = 0;
      now = 0;
      showValue(NaN);
      p.invalidate();
    },
    setRef(v) {
      ref = v;
      p.invalidate();
    },
    setRange(r) {
      if (!r || !(r[1] > r[0])) return;
      range = r.slice();
      p.setView({ x: [-win, 0], y: range });
    },
    setWindow(w) {
      if (!(w > 0)) return;
      win = w;
      p.setView({ x: [-win, 0], y: range });
    },
  };
}
