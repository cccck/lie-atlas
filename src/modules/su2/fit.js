// Fit a perspective camera to its card: keep the viewing direction and choose the distance so that a sphere
// of radius rV fits vertically and one of radius rH fits horizontally (tall, narrow cards need more distance).
// Re-applied whenever the card is resized.

export function fitCamera(k, el, scope, { rV, rH = rV, fov = 34 }) {
  const fit = () => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const t = Math.tan(((fov / 2) * Math.PI) / 180);
    const vHalf = Math.atan(t);
    const hHalf = Math.atan((r.width / r.height) * t);
    const d = Math.max(rV / Math.sin(vHalf), rH / Math.sin(hHalf));
    const target = k.controls ? k.controls.target : null;
    const p = k.camera.position;
    const off = target ? p.clone().sub(target) : p.clone();
    const l = off.length() || 1;
    off.multiplyScalar(d / l);
    if (target) p.copy(target).add(off);
    else p.copy(off);
  };
  scope.observeResize(el, fit);
  fit();
  return fit;
}
