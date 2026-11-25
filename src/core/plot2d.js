// 2D canvas kit: world↔screen transforms, HiDPI, grid/axes, pan/zoom, draggable handles,
// KaTeX labels, vector fields. Redraws on demand (p.invalidate()) or every frame (p.animate()).
//
//   const p = plot2d(view.body, ctx.scope, { x: [-3, 3], y: [-2, 2], draw(p) { p.line(pts, { color: 'grp' }) } });
//   p.handle({ get: () => pt, set: (v) => { pt = v; p.invalidate(); }, color: 'alg', label: '$X$' });
//
// Colours anywhere below may be semantic names ('alg','grp','brk','hi','x','y','z','ink','ink2','muted',
// 'grid','axis','c1'..'c8','surface') or any CSS colour string.

import { colors as themeColors, withAlpha } from './theme.js';
import { texHTML } from './tex.js';

export function plot2d(container, scope, opts = {}) {
  const o = {
    x: [-3, 3],
    y: [-3, 3],
    equal: true,
    pan: true,
    zoom: true,
    grid: true,
    axes: true,
    ticks: false,
    tickFormat: null,
    axisLabels: null,
    background: true,
    padding: 0,
    minScale: 1e-6,
    maxScale: 1e7,
    ...opts,
  };
  const pal = themeColors();
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;';
  const labelLayer = document.createElement('div');
  labelLayer.className = 'plot-labels';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);
  container.appendChild(labelLayer);
  const ctx = canvas.getContext('2d');

  let W = 1;
  let H = 1;
  let dpr = 1;
  let home = { x: o.x.slice(), y: o.y.slice() };
  let cx = (home.x[0] + home.x[1]) / 2;
  let cy = (home.y[0] + home.y[1]) / 2;
  let kx = 50;
  let ky = 50;
  let userMoved = false;
  let dirty = true;
  let animating = 0;
  const handles = [];
  const listeners = { down: [], move: [], up: [], hover: [], click: [], wheel: [], view: [] };
  const labels = new Map(); // key → {el, src, used}
  let labelCounter = 0;

  function fit() {
    const pad = o.padding;
    const w = Math.max(1, W - 2 * pad);
    const hh = Math.max(1, H - 2 * pad);
    const sx = w / (home.x[1] - home.x[0]);
    const sy = hh / (home.y[1] - home.y[0]);
    if (o.equal) kx = ky = Math.min(sx, sy);
    else {
      kx = sx;
      ky = sy;
    }
    cx = (home.x[0] + home.x[1]) / 2;
    cy = (home.y[0] + home.y[1]) / 2;
  }

  // drawNow=false is used once, inside the constructor: the module that is creating this plot has not
  // finished setting up yet (its draw() may reference variables declared after the plot2d() call), so
  // the first draw is left to the shared frame loop, which runs after the mount has completed.
  function resize(_rect, drawNow = true) {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!userMoved) fit();
    dirty = true;
    if (drawNow) render();
  }

  // ------------------------------------------------------------ transforms
  const sx = (x) => W / 2 + (x - cx) * kx;
  const sy = (y) => H / 2 - (y - cy) * ky;
  const wx = (px) => cx + (px - W / 2) / kx;
  const wy = (py) => cy - (py - H / 2) / ky;
  const color = (c, fallback = 'ink') => {
    if (!c) c = fallback;
    return pal[c] !== undefined && typeof pal[c] === 'string' ? pal[c] : c;
  };

  // ------------------------------------------------------------ primitives
  function stroke(st = {}, fallbackColor = 'ink') {
    ctx.strokeStyle = color(st.color ?? st.stroke, fallbackColor);
    ctx.lineWidth = st.width ?? 2;
    ctx.lineCap = st.cap ?? 'round';
    ctx.lineJoin = st.join ?? 'round';
    ctx.setLineDash(st.dash || []);
    ctx.globalAlpha = st.alpha ?? 1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const api = {
    canvas,
    ctx,
    colors: pal,
    color,
    get width() {
      return W;
    },
    get height() {
      return H;
    },
    /** pixels per world unit (x) */
    get scale() {
      return kx;
    },
    get scaleY() {
      return ky;
    },
    sx,
    sy,
    wx,
    wy,
    toScreen: ([x, y]) => [sx(x), sy(y)],
    toWorld: ([px, py]) => [wx(px), wy(py)],
    /** Currently visible world rectangle. */
    get view() {
      return { x: [wx(0), wx(W)], y: [wy(H), wy(0)] };
    },
    /** Set the home view (and reset to it). */
    setView(v) {
      home = { x: (v.x || home.x).slice(), y: (v.y || home.y).slice() };
      userMoved = false;
      fit();
      api.invalidate();
    },
    resetView() {
      userMoved = false;
      fit();
      api.invalidate();
      emit('view', api.view);
    },
    invalidate() {
      dirty = true;
    },
    /** Register a per-frame update fn(dt, t); the plot redraws every frame while any exist. Returns stop(). */
    animate(fn) {
      animating++;
      const stop = scope.frame((dt, t) => {
        fn(dt, t);
        dirty = true;
      });
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        animating--;
        stop();
      };
    },
    redraw: () => {
      dirty = true;
      render();
    },
    on(type, fn) {
      listeners[type].push(fn);
      return () => {
        const i = listeners[type].indexOf(fn);
        if (i >= 0) listeners[type].splice(i, 1);
      };
    },

    /** Polyline through world points [[x,y],...]. style: {color,width,dash,alpha,closed} */
    line(points, st = {}) {
      if (!points || points.length < 2) return;
      ctx.beginPath();
      let pen = false;
      for (const p of points) {
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
          pen = false;
          continue;
        }
        const X = sx(p[0]);
        const Y = sy(p[1]);
        if (!pen) {
          ctx.moveTo(X, Y);
          pen = true;
        } else ctx.lineTo(X, Y);
      }
      if (st.closed) ctx.closePath();
      stroke(st);
    },
    segment(a, b, st = {}) {
      api.line([a, b], st);
    },
    /** Arrow from a to b (world). style: {color, width, head (px), alpha, dash} */
    arrow(a, b, st = {}) {
      const X0 = sx(a[0]);
      const Y0 = sy(a[1]);
      const X1 = sx(b[0]);
      const Y1 = sy(b[1]);
      const len = Math.hypot(X1 - X0, Y1 - Y0);
      if (len < 0.5) return;
      const head = Math.min(st.head ?? 10, len * 0.6);
      const ux = (X1 - X0) / len;
      const uy = (Y1 - Y0) / len;
      const bx = X1 - ux * head;
      const by = Y1 - uy * head;
      ctx.beginPath();
      ctx.moveTo(X0, Y0);
      ctx.lineTo(bx + ux * head * 0.2, by + uy * head * 0.2);
      stroke(st);
      ctx.beginPath();
      ctx.moveTo(X1, Y1);
      ctx.lineTo(bx - uy * head * 0.45, by + ux * head * 0.45);
      ctx.lineTo(bx + uy * head * 0.45, by - ux * head * 0.45);
      ctx.closePath();
      ctx.fillStyle = color(st.color, 'ink');
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    /** Circle of world radius r. style: {stroke|color, fill, width, dash, alpha, fillAlpha} */
    circle(c, r, st = {}) {
      ctx.beginPath();
      if (o.equal || kx === ky) ctx.arc(sx(c[0]), sy(c[1]), Math.abs(r * kx), 0, Math.PI * 2);
      else ctx.ellipse(sx(c[0]), sy(c[1]), Math.abs(r * kx), Math.abs(r * ky), 0, 0, Math.PI * 2);
      if (st.fill) {
        ctx.fillStyle = color(st.fill);
        ctx.globalAlpha = st.fillAlpha ?? st.alpha ?? 1;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (st.stroke !== false && (st.stroke || st.color || !st.fill)) stroke(st);
    },
    /** Dot with radius in PIXELS. style: {r, fill|color, stroke, width, alpha} */
    dot(c, st = {}) {
      if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return;
      ctx.beginPath();
      ctx.arc(sx(c[0]), sy(c[1]), st.r ?? 4, 0, Math.PI * 2);
      ctx.fillStyle = color(st.fill ?? st.color, 'ink');
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (st.stroke) {
        ctx.strokeStyle = color(st.stroke);
        ctx.lineWidth = st.width ?? 2;
        ctx.stroke();
      }
    },
    /** Filled polygon. style: {fill, alpha, stroke, width, dash} */
    polygon(points, st = {}) {
      if (!points || points.length < 3) return;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))));
      ctx.closePath();
      if (st.fill) {
        ctx.fillStyle = color(st.fill);
        ctx.globalAlpha = st.alpha ?? 0.25;
        ctx.fill(st.fillRule || 'nonzero');
        ctx.globalAlpha = 1;
      }
      if (st.stroke) stroke({ ...st, color: st.stroke, alpha: st.strokeAlpha ?? 1 });
    },
    /** Canvas text at a world point. style: {color, size, weight, align, baseline, offset:[dx,dy] px, font, alpha} */
    text(str, pos, st = {}) {
      const [dx, dy] = st.offset || [0, 0];
      ctx.font = `${st.weight || 400} ${st.size || 12}px ${st.font || 'system-ui, "Segoe UI", sans-serif'}`;
      ctx.fillStyle = color(st.color, 'ink2');
      ctx.textAlign = st.align || 'left';
      ctx.textBaseline = st.baseline || 'middle';
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.fillText(String(str), sx(pos[0]) + dx, sy(pos[1]) + dy);
      ctx.globalAlpha = 1;
    },
    /**
     * KaTeX label (HTML overlay) at a world point. Call it inside draw() every frame you want it shown.
     * style: {key, offset:[dx,dy] px, align:'center'|'left'|'right', valign:'middle'|'top'|'bottom', color, small, size}
     */
    tex(src, pos, st = {}) {
      const key = st.key ?? `#${labelCounter}`;
      labelCounter++;
      let L = labels.get(key);
      if (!L) {
        const el = document.createElement('div');
        el.className = 'plot-label';
        labelLayer.appendChild(el);
        L = { el, src: null, used: false, cls: '' };
        labels.set(key, L);
      }
      if (L.src !== src) {
        L.el.innerHTML = texHTML(src, false);
        L.src = src;
      }
      const cls = 'plot-label' + (st.small ? ' small' : '');
      if (L.cls !== cls) {
        L.el.className = cls;
        L.cls = cls;
      }
      L.el.style.color = st.color ? color(st.color) : '';
      L.el.style.fontSize = st.size ? st.size + 'px' : '';
      const [dx, dy] = st.offset || [0, 0];
      const tx = st.align === 'left' ? '0%' : st.align === 'right' ? '-100%' : '-50%';
      const ty = st.valign === 'top' ? '0%' : st.valign === 'bottom' ? '-100%' : '-50%';
      const X = sx(pos[0]) + dx;
      const Y = sy(pos[1]) + dy;
      const visible = Number.isFinite(X) && Number.isFinite(Y) && X > -200 && X < W + 200 && Y > -100 && Y < H + 100;
      L.el.style.display = visible ? '' : 'none';
      if (visible) L.el.style.transform = `translate(${X.toFixed(1)}px, ${Y.toFixed(1)}px) translate(${tx}, ${ty})`;
      L.used = true;
    },
    /** Arrows of a vector field f(x,y) → [u,v] on a pixel grid. style: {step(px), color, width, scale, maxLen(px), alpha, normalize} */
    vectorField(f, st = {}) {
      const step = st.step ?? 36;
      const maxLen = st.maxLen ?? step * 0.8;
      const samples = [];
      let maxMag = 0;
      for (let px = step / 2; px < W; px += step)
        for (let py = step / 2; py < H; py += step) {
          const x = wx(px);
          const y = wy(py);
          const v = f(x, y);
          if (!v || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) continue;
          const m = Math.hypot(v[0] * kx, v[1] * ky);
          maxMag = Math.max(maxMag, m);
          samples.push([px, py, v, m]);
        }
      if (!samples.length) return;
      const k = st.scale !== undefined ? st.scale : maxMag > 0 ? maxLen / maxMag : 0;
      ctx.strokeStyle = color(st.color, 'muted');
      ctx.fillStyle = color(st.color, 'muted');
      ctx.lineWidth = st.width ?? 1.25;
      ctx.globalAlpha = st.alpha ?? 0.55;
      for (const [px, py, v, m] of samples) {
        let ux = v[0] * kx;
        let uy = -v[1] * ky;
        let len = m * k;
        if (st.normalize) len = maxLen * 0.8;
        len = Math.min(len, maxLen);
        if (len < 1.5 || m === 0) continue;
        ux /= m;
        uy /= m;
        const x0 = px - (ux * len) / 2;
        const y0 = py - (uy * len) / 2;
        const x1 = px + (ux * len) / 2;
        const y1 = py + (uy * len) / 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const hd = Math.min(5, len * 0.4);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ux * hd - uy * hd * 0.5, y1 - uy * hd + ux * hd * 0.5);
        ctx.lineTo(x1 - ux * hd + uy * hd * 0.5, y1 - uy * hd - ux * hd * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    /** Draw grid lines with a "nice" step (auto unless st.step). */
    grid(st = {}) {
      const step = st.step ?? niceStep(80 / kx);
      const stepY = st.stepY ?? (o.equal ? step : niceStep(80 / ky));
      const v = api.view;
      ctx.beginPath();
      for (let x = Math.ceil(v.x[0] / step) * step; x <= v.x[1]; x += step) {
        const X = Math.round(sx(x)) + 0.5;
        ctx.moveTo(X, 0);
        ctx.lineTo(X, H);
      }
      for (let y = Math.ceil(v.y[0] / stepY) * stepY; y <= v.y[1]; y += stepY) {
        const Y = Math.round(sy(y)) + 0.5;
        ctx.moveTo(0, Y);
        ctx.lineTo(W, Y);
      }
      ctx.strokeStyle = color(st.color, 'grid');
      ctx.lineWidth = 1;
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return { step, stepY };
    },
    /** Draw the coordinate axes (and optional tick labels). */
    axes(st = {}) {
      const X0 = Math.round(sx(0)) + 0.5;
      const Y0 = Math.round(sy(0)) + 0.5;
      ctx.beginPath();
      if (X0 >= 0 && X0 <= W) {
        ctx.moveTo(X0, 0);
        ctx.lineTo(X0, H);
      }
      if (Y0 >= 0 && Y0 <= H) {
        ctx.moveTo(0, Y0);
        ctx.lineTo(W, Y0);
      }
      ctx.strokeStyle = color(st.color, 'axis');
      ctx.lineWidth = 1.25;
      ctx.stroke();
      if (st.ticks ?? o.ticks) {
        const fmtT = st.tickFormat || o.tickFormat || ((v) => String(+v.toFixed(6)).replace('-', '−'));
        const step = niceStep(80 / kx);
        const stepY = o.equal ? step : niceStep(80 / ky);
        const v = api.view;
        ctx.font = '11px system-ui, "Segoe UI", sans-serif';
        ctx.fillStyle = color('muted');
        const yLab = Math.min(Math.max(Y0 + 4, 4), H - 16);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let x = Math.ceil(v.x[0] / step) * step; x <= v.x[1]; x += step) {
          if (Math.abs(x) < step * 1e-6) continue;
          ctx.fillText(fmtT(x, 'x'), sx(x), yLab);
        }
        const xLab = Math.min(Math.max(X0 - 5, 30), W - 4);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.ceil(v.y[0] / stepY) * stepY; y <= v.y[1]; y += stepY) {
          if (Math.abs(y) < stepY * 1e-6) continue;
          ctx.fillText(fmtT(y, 'y'), xLab, sy(y));
        }
      }
      const al = st.labels ?? o.axisLabels;
      if (al) {
        if (al[0]) api.tex(al[0], [wx(W - 14), wy(Y0)], { key: '__ax0', offset: [0, -12], align: 'right', small: true });
        if (al[1]) api.tex(al[1], [wx(X0), wy(14)], { key: '__ax1', offset: [10, 0], align: 'left', small: true });
      }
    },
    /**
     * Draggable handle. opts: { get() → [x,y], set([x,y], event), color, r (px), hit (px), label (TeX),
     *   labelOffset [dx,dy], shape 'dot'|'ring', visible() → bool, constrain([x,y]) → [x,y], onStart, onEnd }
     * Returns { remove() }.
     */
    handle(hopts) {
      const hd = { r: 7, hit: 16, color: 'alg', shape: 'dot', ...hopts, hover: false, active: false };
      handles.push(hd);
      api.invalidate();
      return {
        remove() {
          const i = handles.indexOf(hd);
          if (i >= 0) handles.splice(i, 1);
          api.invalidate();
        },
      };
    },
  };

  // ------------------------------------------------------------ rendering
  function render() {
    if (!dirty) return;
    dirty = false;
    labelCounter = 0;
    for (const L of labels.values()) L.used = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (o.background) {
      ctx.fillStyle = color('surface');
      ctx.fillRect(0, 0, W, H);
    }
    if (o.grid) api.grid(typeof o.grid === 'object' ? o.grid : {});
    if (o.axes) api.axes(typeof o.axes === 'object' ? o.axes : {});
    try {
      o.draw && o.draw(api, ctx);
    } catch (err) {
      console.error('[plot2d draw]', err);
    }
    for (const hd of handles) {
      if (hd.visible && !hd.visible()) continue;
      const p = hd.get();
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const X = sx(p[0]);
      const Y = sy(p[1]);
      const col = color(hd.color, 'alg');
      if (hd.hover || hd.active) {
        ctx.beginPath();
        ctx.arc(X, Y, hd.r + 6, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(col, 0.18);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(X, Y, hd.r, 0, Math.PI * 2);
      if (hd.shape === 'ring') {
        ctx.fillStyle = color('surface');
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = col;
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color('surface');
        ctx.stroke();
      }
      if (hd.label) api.tex(hd.label, p, { key: '__h' + handles.indexOf(hd), offset: hd.labelOffset || [14, -14], color: hd.labelColor });
    }
    for (const L of labels.values()) if (!L.used) L.el.style.display = 'none';
  }
  scope.frame(() => render(), 'render');

  // ------------------------------------------------------------ interaction
  let drag = null; // {type:'handle', hd} | {type:'pan', ...} | {type:'listener', fn}
  const evPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    return { px, py, x: wx(px), y: wy(py), event: e, buttons: e.buttons };
  };
  const hitHandle = (px, py) => {
    for (let i = handles.length - 1; i >= 0; i--) {
      const hd = handles[i];
      if (hd.visible && !hd.visible()) continue;
      const p = hd.get();
      if (!p) continue;
      if (Math.hypot(sx(p[0]) - px, sy(p[1]) - py) <= hd.hit) return hd;
    }
    return null;
  };
  function emit(type, arg) {
    let captured = false;
    for (const fn of listeners[type]) if (fn(arg) === true) captured = fn;
    return captured;
  }

  scope.listen(canvas, 'pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pos = evPos(e);
    const hd = hitHandle(pos.px, pos.py);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* synthetic events */
    }
    if (hd) {
      drag = { type: 'handle', hd };
      hd.active = true;
      hd.onStart && hd.onStart();
      api.invalidate();
      e.preventDefault();
      return;
    }
    const cap = emit('down', pos);
    if (cap) {
      drag = { type: 'listener', fn: cap };
      e.preventDefault();
      return;
    }
    if (o.pan) {
      drag = { type: 'pan', px: pos.px, py: pos.py, cx, cy, moved: false };
      canvas.style.cursor = 'grabbing';
    } else drag = { type: 'click', px: pos.px, py: pos.py };
  });
  scope.listen(canvas, 'pointermove', (e) => {
    const pos = evPos(e);
    if (!drag) {
      const hd = hitHandle(pos.px, pos.py);
      let changed = false;
      for (const h of handles) {
        const v = h === hd;
        if (h.hover !== v) {
          h.hover = v;
          changed = true;
        }
      }
      canvas.style.cursor = hd ? 'grab' : o.pan ? 'default' : '';
      if (changed) api.invalidate();
      emit('hover', pos);
      return;
    }
    if (drag.type === 'handle') {
      let p = [pos.x, pos.y];
      if (drag.hd.constrain) p = drag.hd.constrain(p);
      drag.hd.set(p, e);
      canvas.style.cursor = 'grabbing';
      api.invalidate();
    } else if (drag.type === 'pan') {
      const dx = pos.px - drag.px;
      const dy = pos.py - drag.py;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      cx = drag.cx - dx / kx;
      cy = drag.cy + dy / ky;
      userMoved = true;
      api.invalidate();
      emit('view', api.view);
    } else if (drag.type === 'listener') {
      listeners.move.forEach((fn) => fn(pos));
    }
  });
  const end = (e) => {
    if (!drag) return;
    const pos = evPos(e);
    if (drag.type === 'handle') {
      drag.hd.active = false;
      drag.hd.onEnd && drag.hd.onEnd();
    } else if (drag.type === 'listener') listeners.up.forEach((fn) => fn(pos));
    else if ((drag.type === 'pan' && !drag.moved) || drag.type === 'click') emit('click', pos);
    drag = null;
    canvas.style.cursor = '';
    api.invalidate();
  };
  scope.listen(canvas, 'pointerup', end);
  scope.listen(canvas, 'pointercancel', end);
  scope.listen(canvas, 'pointerleave', () => {
    let changed = false;
    for (const h of handles) if (h.hover) (h.hover = false), (changed = true);
    if (changed) api.invalidate();
  });
  scope.listen(
    canvas,
    'wheel',
    (e) => {
      if (emit('wheel', { ...evPos(e), deltaY: e.deltaY })) {
        e.preventDefault();
        return;
      }
      if (!o.zoom) return;
      e.preventDefault();
      const pos = evPos(e);
      const f = Math.exp(-e.deltaY * 0.0015);
      const nk = Math.min(o.maxScale, Math.max(o.minScale, kx * f));
      const g = nk / kx;
      // keep the world point under the cursor fixed
      cx = pos.x - (pos.px - W / 2) / (kx * g);
      cy = pos.y + (pos.py - H / 2) / (ky * g);
      kx *= g;
      ky *= g;
      userMoved = true;
      api.invalidate();
      emit('view', api.view);
    },
    { passive: false },
  );
  scope.listen(canvas, 'dblclick', () => {
    if (o.pan || o.zoom) api.resetView();
  });

  scope.observeResize(container, resize);
  scope.add(() => {
    canvas.remove();
    labelLayer.remove();
  });
  resize(null, false);
  return api;
}

/** A "nice" grid step ≥ raw (1, 2, 5 × 10^k). */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
