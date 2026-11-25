// The loop lifted into the group: the path g(s) in canonical (exponential) coordinates, legs normalised by ε,
// the [X,Y]-direction normalised by ε². The projection onto the X–Y plane (nearly) closes; the lift does not —
// it ends at height ±[X,Y]. The same picture appears in every world.

import { scene3d } from '../../core/three-kit.js';
import { clamp } from '../../core/la.js';
import { LEGS, legFrac } from './common.js';

function revealable(line, pts) {
  line.setPoints(pts);
  line.userData.nSeg = Math.max(0, pts.length - 1);
  return line;
}
function reveal(line, frac) {
  const n = line.userData.nSeg || 0;
  const k = Math.round(clamp(frac, 0, 1) * n);
  line.visible = k > 0;
  if (line.geometry) line.geometry.instanceCount = k;
}

/** Axis labels per world: [horizontal 1, horizontal 2, vertical]. */
export const LIFT_LABELS = {
  rot: ['\\theta_x/\\epsilon', '\\theta_y/\\epsilon', '\\theta_z/\\epsilon^2'],
  boost: ['\\eta_x/\\epsilon', '\\eta_y/\\epsilon', '\\varphi/\\epsilon^2'],
  flux: ['x/\\epsilon', 'y/\\epsilon', '\\theta/\\epsilon^2'],
  car: ['x_\\parallel/\\epsilon', '\\psi/\\epsilon', 'y_\\perp/\\epsilon^2'],
  sphere: ['\\text{east}/\\epsilon', '\\text{north}/\\epsilon', '\\alpha/\\epsilon^2'],
};

export function liftView(el, scope) {
  const k = scene3d(el, scope, { camera: [2.9, -2.2, 2.0], target: [0.5, 0.45, 0.15], minDistance: 1.5, maxDistance: 12, fov: 34 });
  // axes
  const ax1 = k.arrow([0, 0, 0], [1.45, 0, 0], { color: 'x', radius: 0.008, headLength: 0.07, headRadius: 0.026 });
  const ax2 = k.arrow([0, 0, 0], [0, 1.45, 0], { color: 'y', radius: 0.008, headLength: 0.07, headRadius: 0.026 });
  const ax3 = k.arrow([0, 0, -1.25], [0, 0, 1.45], { color: 'brk', radius: 0.008, headLength: 0.07, headRadius: 0.026 });
  const lab = [k.label('', [1.6, 0, 0], { color: 'x', small: true }), k.label('', [0, 1.6, 0], { color: 'y', small: true }), k.label('', [0, 0, 1.6], { color: 'brk', small: true })];
  void ax1;
  void ax2;
  void ax3;
  // floor grid (unit cells)
  const grid = [];
  for (let i = -1; i <= 2; i++) {
    grid.push(
      k.line(
        [
          [i, -1, 0],
          [i, 2, 0],
        ],
        { color: 'grid', width: 1, opacity: 0.9 },
      ),
    );
    grid.push(
      k.line(
        [
          [-1, i, 0],
          [2, i, 0],
        ],
        { color: 'grid', width: 1, opacity: 0.9 },
      ),
    );
  }
  const shadow = LEGS.map(() => k.line([], { color: 'muted', width: 1.6, opacity: 0.75 }));
  const path = LEGS.map((L) => k.line([], { color: L.color, width: 3.2, dashed: L.dash, dashSize: 0.06, gapSize: 0.045 }));
  const drop = k.line([], { color: 'muted', width: 1, dashed: true, dashSize: 0.04, gapSize: 0.04, opacity: 0.8 });
  const start = k.sphere({ radius: 0.03, color: 'ink2' });
  const curDot = k.sphere({ radius: 0.038, color: 'grp' });
  const pred = k.arrow([0, 0, 0], [0, 0, 1], { color: 'brk', radius: 0.016, headLength: 0.09, headRadius: 0.04, opacity: 0.9 });
  const predLbl = k.label('', [0, 0, 1], { color: 'brk', small: true });
  const endDot = k.sphere({ radius: 0.042, color: 'grp' });
  const endLbl = k.label('\\log\\grp{g}', [0, 0, 1], { color: 'grp', small: true, offset: [26, 0] });
  let M = null;
  let layoutKey = null;
  function place(M) {
    // fit the camera to the loop's bounding box (only when the loop's shape class changes)
    let x0 = 0;
    let x1 = 1;
    let y0 = 0;
    let y1 = 1;
    let z0 = 0;
    let z1 = 0;
    for (const leg of M.lift)
      for (const p of leg) {
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
        z0 = Math.min(z0, p[2]);
        z1 = Math.max(z1, p[2]);
      }
    z0 = Math.min(z0, M.liftPred[2]);
    z1 = Math.max(z1, M.liftPred[2]);
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, clamp((z0 + z1) / 2, -0.8, 0.8)];
    const size = Math.max(x1 - x0, y1 - y0, Math.min(2.6, z1 - z0), 1.2);
    const d = 2.6 * size + 2.4;
    k.setCamera([c[0] + 0.6 * d, c[1] - 0.66 * d, c[2] + 0.45 * d], c);
  }
  function setAxes(M) {
    let zlo = 0;
    let zhi = 0;
    for (const leg of M.lift)
      for (const p of leg) {
        zlo = Math.min(zlo, p[2]);
        zhi = Math.max(zhi, p[2]);
      }
    zlo = Math.min(zlo, M.liftPred[2]);
    zhi = Math.max(zhi, M.liftPred[2]);
    const lo = clamp(zlo - 0.25, -2.6, -0.2);
    const hi = clamp(zhi + 0.45, 0.6, 2.8);
    ax3.set([0, 0, lo], [0, 0, hi]);
    lab[2].setPosition([0, 0, hi + 0.16]);
  }
  return {
    setModel(m) {
      M = m;
      const L = LIFT_LABELS[M.world];
      lab.forEach((l, i) => l.setText(L[i]));
      const floor = (pts) => pts.map((p) => [p[0], p[1], 0]);
      for (let i = 0; i < 4; i++) {
        revealable(path[i], M.lift[i]);
        revealable(shadow[i], floor(M.lift[i]));
      }
      const zp = M.liftPred[2];
      pred.set([0, 0, 0], [0, 0, zp]);
      pred.visible = Math.abs(zp) > 0.02;
      predLbl.setText(M.world === 'sphere' ? '\\brk{K\\epsilon^2}' : M.frame === 'space' ? '\\brk{-\\epsilon^2[X,Y]}' : '\\brk{\\epsilon^2[X,Y]}');
      predLbl.setPosition([-0.08, -0.08, zp + (zp >= 0 ? 0.16 : -0.16)]);
      predLbl.setVisible(Math.abs(zp) > 0.02);
      const end = M.lift[3][M.lift[3].length - 1];
      endDot.position.set(...end);
      endLbl.setPosition(end);
      setAxes(M);
      const key = M.layoutKey;
      if (key !== layoutKey) {
        layoutKey = key;
        place(M);
      }
    },
    setProgress(s) {
      if (!M) return;
      for (let i = 0; i < 4; i++) {
        reveal(path[i], legFrac(s, i));
        reveal(shadow[i], legFrac(s, i));
      }
      const p = M.liftAt(s);
      curDot.position.set(...p);
      drop.setPoints([p, [p[0], p[1], 0]]);
      drop.visible = Math.abs(p[2]) > 0.02;
      const done = s >= 4 - 1e-9;
      endDot.visible = done;
      endLbl.setVisible(done);
      curDot.visible = !done;
    },
  };
}
