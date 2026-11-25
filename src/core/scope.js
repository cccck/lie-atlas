// Lifetime management. Every module mount gets a root Scope; everything a module
// creates (listeners, timers, frame callbacks, WebGL renderers, observers) is
// registered on it and torn down automatically when the user navigates away or
// the theme changes (which remounts the module).

// ---------------------------------------------------------------- ticker
// One shared requestAnimationFrame loop. Two phases per frame:
//   'update' callbacks (module logic) run first, then 'render' callbacks
//   (scenes/plots draw), so a frame never renders stale state.
const phases = { update: new Set(), render: new Set() };
let rafId = 0;
let last = 0;
let elapsed = 0;

function tick(now) {
  rafId = 0;
  const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
  last = now;
  elapsed += dt;
  for (const phase of ['update', 'render']) {
    for (const fn of [...phases[phase]]) {
      if (!phases[phase].has(fn)) continue; // removed during this frame
      try {
        fn(dt, elapsed);
      } catch (err) {
        console.error('[frame callback]', err);
        phases[phase].delete(fn); // a throwing callback would spam the console every frame
      }
    }
  }
  if (phases.update.size || phases.render.size) rafId = requestAnimationFrame(tick);
  else last = 0;
}

function addFrame(fn, phase = 'update') {
  phases[phase].add(fn);
  if (!rafId) rafId = requestAnimationFrame(tick);
  return () => phases[phase].delete(fn);
}

// ---------------------------------------------------------------- Scope
export class Scope {
  constructor(parent = null) {
    this._fns = [];
    this.disposed = false;
    if (parent) parent.add(() => this.dispose());
  }

  /** Register a cleanup function. Returns it. If already disposed, runs it now. */
  add(fn) {
    if (this.disposed) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
      return fn;
    }
    this._fns.push(fn);
    return fn;
  }

  /** addEventListener that is removed on dispose. Returns an `off()` function. */
  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    const off = () => target.removeEventListener(type, handler, options);
    this.add(off);
    return off;
  }

  timeout(fn, ms) {
    const id = setTimeout(fn, ms);
    this.add(() => clearTimeout(id));
    return id;
  }

  interval(fn, ms) {
    const id = setInterval(fn, ms);
    this.add(() => clearInterval(id));
    return id;
  }

  /**
   * Run fn(dt, t) every animation frame until disposed (dt in seconds, clamped to 0.1).
   * Returns a stop() function. Use for simulation/animation updates; scenes and
   * plots render themselves after all update callbacks.
   */
  frame(fn, phase = 'update') {
    const stop = addFrame(fn, phase);
    this.add(stop);
    return stop;
  }

  /** ResizeObserver on an element; callback receives the content rect. */
  observeResize(el, fn) {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) fn(e.contentRect);
    });
    ro.observe(el);
    this.add(() => ro.disconnect());
    return ro;
  }

  /** A child scope: disposed with the parent, or earlier via child.dispose(). */
  child() {
    return new Scope(this);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const fns = this._fns.splice(0);
    for (let i = fns.length - 1; i >= 0; i--) {
      try {
        fns[i]();
      } catch (err) {
        console.error('[scope cleanup]', err);
      }
    }
  }
}
