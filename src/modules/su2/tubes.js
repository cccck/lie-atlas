// A set of tubes sharing one BufferGeometry whose vertices are updated in place every frame
// (no per-frame allocation, one draw call). Frames are propagated by parallel transport.
//
//   const ts = tubeSet(k, { count: 8, segments: 64, radius: 0.025, color: (i, u) => '#..' });
//   ts.setTube(i, points)   // segments + 1 points [x,y,z]
//   ts.commit()

import { THREE } from '../../core/three-kit.js';

export function tubeSet(k, opts) {
  const count = opts.count;
  const seg = opts.segments;
  const rad = opts.radial ?? 10;
  const radius = opts.radius ?? 0.025;
  const ringPts = seg + 1;
  const perTube = ringPts * rad;
  const nV = count * perTube;
  const pos = new Float32Array(nV * 3);
  const nor = new Float32Array(nV * 3);
  const col = new Float32Array(nV * 3);
  const idx = [];
  for (let i = 0; i < count; i++) {
    const base = i * perTube;
    for (let j = 0; j < seg; j++)
      for (let r = 0; r < rad; r++) {
        const a = base + j * rad + r;
        const b = base + j * rad + ((r + 1) % rad);
        const c = a + rad;
        const d = b + rad;
        idx.push(a, c, b, b, c, d);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // static colours
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++)
    for (let j = 0; j < ringPts; j++) {
      const c = opts.color ? opts.color(i, j / seg) : '#888888';
      tmp.copy(c instanceof THREE.Color ? c : k.color(c));
      for (let r = 0; r < rad; r++) {
        const v = (i * perTube + j * rad + r) * 3;
        col[v] = tmp.r;
        col[v + 1] = tmp.g;
        col[v + 2] = tmp.b;
      }
    }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.55, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  k.add(mesh);

  const cosR = Array.from({ length: rad }, (_, r) => Math.cos((2 * Math.PI * r) / rad));
  const sinR = Array.from({ length: rad }, (_, r) => Math.sin((2 * Math.PI * r) / rad));
  const T = new Float64Array(ringPts * 3);

  function setTube(i, pts) {
    // tangents (central differences)
    for (let j = 0; j < ringPts; j++) {
      const a = pts[Math.max(0, j - 1)];
      const b = pts[Math.min(seg, j + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      let tz = b[2] - a[2];
      const l = Math.hypot(tx, ty, tz) || 1;
      T[3 * j] = tx / l;
      T[3 * j + 1] = ty / l;
      T[3 * j + 2] = tz / l;
    }
    // initial normal: perpendicular to T0, built from a fixed reference so it does not flicker
    let nx;
    let ny;
    let nz;
    {
      const tx = T[0];
      const ty = T[1];
      const tz = T[2];
      const ref = Math.abs(tz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      nx = ty * ref[2] - tz * ref[1];
      ny = tz * ref[0] - tx * ref[2];
      nz = tx * ref[1] - ty * ref[0];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
    }
    const base = i * perTube;
    for (let j = 0; j < ringPts; j++) {
      const tx = T[3 * j];
      const ty = T[3 * j + 1];
      const tz = T[3 * j + 2];
      // parallel transport: remove the tangential part
      const d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx;
      ny -= d * ty;
      nz -= d * tz;
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) {
        const ref = Math.abs(tz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        nx = ty * ref[2] - tz * ref[1];
        ny = tz * ref[0] - tx * ref[2];
        nz = tx * ref[1] - ty * ref[0];
        l = Math.hypot(nx, ny, nz) || 1;
      }
      nx /= l;
      ny /= l;
      nz /= l;
      const bx = ty * nz - tz * ny;
      const by = tz * nx - tx * nz;
      const bz = tx * ny - ty * nx;
      const p = pts[j];
      for (let r = 0; r < rad; r++) {
        const ox = cosR[r] * nx + sinR[r] * bx;
        const oy = cosR[r] * ny + sinR[r] * by;
        const oz = cosR[r] * nz + sinR[r] * bz;
        const v = (base + j * rad + r) * 3;
        pos[v] = p[0] + radius * ox;
        pos[v + 1] = p[1] + radius * oy;
        pos[v + 2] = p[2] + radius * oz;
        nor[v] = ox;
        nor[v + 1] = oy;
        nor[v + 2] = oz;
      }
    }
  }
  function commit() {
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, setTube, commit, material: mat };
}
