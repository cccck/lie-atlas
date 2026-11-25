// A small stylised aeroplane used as the rigid body throughout the SO(3) module.
// Body frame: nose along +x (e'_1), left wing along +y (e'_2), fin along +z (e'_3) — right-handed, z up.
// Accents tie body features to the frame colours: nose cap = x colour, left wing-tip pod = y colour,
// fin tip = z colour. Everything else is neutral, so the frame arrows carry the colour.

import { THREE } from '../../core/three-kit.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

function shapeGeo(points, depth) {
  const s = new THREE.Shape(points.map(([x, y]) => V2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * aeroplane(k, opts) → THREE.Group with .setR(R) (3×3 rows) and .setQ([w,x,y,z]).
 * opts: { opacity (1), frame (false) → body-frame arrows e'_1..3, frameLength (1.1), labels (true),
 *         scale (1), parent (k.root), hull (colour) }
 */
export function aeroplane(k, opts = {}) {
  const pal = k.colors;
  const g = new THREE.Group();
  const op = opts.opacity ?? 1;
  const ghost = op < 1;
  const hullCol = opts.hull ?? (pal.dark ? '#cbc8bf' : '#aeaba2');
  const M = (c, extra = {}) => k.material(c, { opacity: op, roughness: 0.55, metalness: 0.06, ...extra });
  const hull = M(hullCol);
  const accent = (role) => (ghost ? hull : M(role, { roughness: 0.45 }));
  const glass = ghost ? hull : M(pal.dark ? '#3e5269' : '#6f8cab', { roughness: 0.25, metalness: 0.25 });
  const add = (geo, mat, pos, scale) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (ghost) m.renderOrder = -1;
    g.add(m);
    return m;
  };

  // fuselage (lathe around the body x axis) and the nose cap
  const body = [
    [0.0, -0.64], [0.034, -0.61], [0.058, -0.47], [0.083, -0.22], [0.098, 0.04], [0.098, 0.3], [0.09, 0.44], [0.08, 0.5],
  ].map(([r, y]) => V2(r, y));
  const nose = [[0.08, 0.5], [0.068, 0.57], [0.05, 0.625], [0.026, 0.67], [0.0, 0.69]].map(([r, y]) => V2(r, y));
  const fus = new THREE.LatheGeometry(body, 28);
  fus.rotateZ(-Math.PI / 2);
  const cap = new THREE.LatheGeometry(nose, 28);
  cap.rotateZ(-Math.PI / 2);
  add(fus, hull);
  add(cap, accent('x'));

  // swept wing (low wing), tailplane, fin
  const wing = shapeGeo([[0.17, 0], [-0.03, 0.7], [-0.17, 0.7], [-0.12, 0], [-0.17, -0.7], [-0.03, -0.7]], 0.024);
  add(wing, hull, [0, 0, -0.035]);
  const tail = shapeGeo([[-0.4, 0], [-0.53, 0.27], [-0.62, 0.27], [-0.6, 0], [-0.62, -0.27], [-0.53, -0.27]], 0.018);
  add(tail, hull, [0, 0, 0.005]);
  const finLow = shapeGeo([[-0.36, 0.05], [-0.4889, 0.25], [-0.6236, 0.25], [-0.61, 0.05]], 0.018);
  finLow.rotateX(Math.PI / 2);
  add(finLow, hull);
  const finTip = shapeGeo([[-0.4889, 0.25], [-0.55, 0.34], [-0.63, 0.34], [-0.6236, 0.25]], 0.018);
  finTip.rotateX(Math.PI / 2);
  add(finTip, accent('z'));

  // wing-tip pods: the left one (+y) in the y colour, the right one neutral
  const pod = new THREE.CapsuleGeometry(0.026, 0.17, 4, 12);
  pod.rotateZ(-Math.PI / 2);
  add(pod, accent('y'), [-0.1, 0.7, -0.035]);
  add(pod.clone(), hull, [-0.1, -0.7, -0.035]);

  // canopy on top, towards the nose: up and forward are never in doubt
  const canopy = new THREE.SphereGeometry(1, 20, 12);
  add(canopy, glass, [0.27, 0, 0.07], [0.15, 0.055, 0.05]);

  // optional body frame
  g.frameArrows = [];
  if (opts.frame) {
    const L = opts.frameLength ?? 1.1;
    const cols = ['x', 'y', 'z'];
    const names = ["e'_1", "e'_2", "e'_3"];
    for (let i = 0; i < 3; i++) {
      const tip = [0, 0, 0];
      tip[i] = L;
      g.frameArrows.push(k.arrow([0, 0, 0], tip, { color: cols[i], radius: 0.014, headLength: 0.1, headRadius: 0.036, parent: g }));
      if (opts.labels !== false) {
        const lp = [0, 0, 0];
        lp[i] = L + 0.13;
        k.label(names[i], lp, { parent: g, color: cols[i], small: true });
      }
    }
  }

  if (opts.scale) g.scale.setScalar(opts.scale);
  const m4 = new THREE.Matrix4();
  g.setR = (R) => {
    m4.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
    g.quaternion.setFromRotationMatrix(m4);
    return g;
  };
  g.setQ = (q) => {
    g.quaternion.set(q[1], q[2], q[3], q[0]).normalize();
    return g;
  };
  (opts.parent || k.root).add(g);
  return g;
}

/** THREE.Quaternion from a 3×3 rotation matrix (rows). */
export function threeQuatFromR(R, out = new THREE.Quaternion()) {
  const m4 = new THREE.Matrix4();
  m4.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
  return out.setFromRotationMatrix(m4);
}
