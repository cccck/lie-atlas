// 3D kit on top of Three.js: scene + camera (z-up, physics convention) + orbit controls + lights +
// CSS2D labels (KaTeX), fat lines, arrows, tubes, parametric surfaces, instanced dots, and
// draggable objects. Everything is disposed with the scope.
//
//   const k = scene3d(view.body, ctx.scope, { camera: [4, 3, 2.5] });
//   const a = k.arrow([0,0,0], [1,0,0], { color: 'alg' });   a.set([0,0,0], [0,1,0]);
//   const c = k.line(points, { color: 'grp', width: 3 });     c.setPoints(newPoints);
//   k.label('\\vec\\omega', [1, 0, 0]);
//   k.onFrame((dt, t) => { ... });  // render happens automatically every frame
//
// Colours: semantic names ('alg','grp','brk','hi','x','y','z','ink','muted','c1'..'c8', …) or CSS colours.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { colors as themeColors } from './theme.js';
import { texHTML, inlineTex } from './tex.js';

export { THREE, CSS2DObject };

const V = (p) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2] ?? 0));
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * opts: {
 *   camera: [x,y,z] position (default [4.2, 3.4, 2.6]), target: [x,y,z], fov (38), zUp (true),
 *   controls (true), pan (true), zoom (true), autoRotate (false), minDistance, maxDistance,
 *   lights (true), grid (false | {size, divisions}), axes (false | {length, labels}),
 *   ortho (false) — orthographic camera with `orthoSize` half-height,
 * }
 */
export function scene3d(container, scope, opts = {}) {
  const o = {
    camera: [4.2, 3.4, 2.6],
    target: [0, 0, 0],
    fov: 38,
    zUp: true,
    controls: true,
    pan: true,
    zoom: true,
    autoRotate: false,
    lights: true,
    grid: false,
    axes: false,
    ortho: false,
    orthoSize: 3,
    near: 0.01,
    far: 500,
    ...opts,
  };
  const pal = themeColors();
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    const msg = document.createElement('div');
    msg.className = 'loading';
    msg.textContent = 'WebGL is not available in this browser, so this 3D view cannot be shown.';
    container.appendChild(msg);
    throw new Error('WebGL unavailable: ' + err.message);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(pal.surface), 1);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  let camera;
  if (o.ortho) {
    camera = new THREE.OrthographicCamera(-o.orthoSize, o.orthoSize, o.orthoSize, -o.orthoSize, o.near, o.far);
  } else camera = new THREE.PerspectiveCamera(o.fov, 1, o.near, o.far);
  if (o.zUp) camera.up.set(0, 0, 1);
  camera.position.set(...o.camera);

  let controls = null;
  if (o.controls) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...o.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.enablePan = o.pan;
    controls.enableZoom = o.zoom;
    controls.autoRotate = o.autoRotate;
    controls.autoRotateSpeed = 0.8;
    if (o.minDistance) controls.minDistance = o.minDistance;
    if (o.maxDistance) controls.maxDistance = o.maxDistance;
    controls.update();
  } else camera.lookAt(...o.target);

  if (o.lights) {
    scene.add(new THREE.HemisphereLight(0xffffff, pal.dark ? 0x2a2a2a : 0x8a8a8a, pal.dark ? 1.5 : 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(5, 3, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-4, -6, -2);
    scene.add(fill);
  }

  const root = new THREE.Group();
  scene.add(root);

  const color = (c, fallback = 'ink') => {
    let s = c ?? fallback;
    if (s instanceof THREE.Color) return s.clone();
    if (typeof s === 'number') return new THREE.Color(s);
    if (pal[s] !== undefined && typeof pal[s] === 'string') s = pal[s];
    return new THREE.Color(s);
  };

  // ------------------------------------------------------------ materials
  function material(c, mo = {}) {
    const opacity = mo.opacity ?? 1;
    return new THREE.MeshStandardMaterial({
      color: color(c, 'grp'),
      roughness: mo.roughness ?? 0.5,
      metalness: mo.metalness ?? 0.05,
      transparent: opacity < 1 || !!mo.transparent,
      opacity,
      side: mo.side ?? (opacity < 1 ? THREE.DoubleSide : THREE.FrontSide),
      depthWrite: mo.depthWrite ?? opacity >= 1,
      wireframe: !!mo.wireframe,
      flatShading: !!mo.flat,
      emissive: mo.emissive ? color(mo.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: mo.emissiveIntensity ?? 1,
      vertexColors: !!mo.vertexColors,
      polygonOffset: !!mo.polygonOffset,
      polygonOffsetFactor: mo.polygonOffset ? 1 : 0,
      polygonOffsetUnits: mo.polygonOffset ? 1 : 0,
    });
  }
  function basic(c, mo = {}) {
    const opacity = mo.opacity ?? 1;
    return new THREE.MeshBasicMaterial({
      color: color(c, 'grp'),
      transparent: opacity < 1 || !!mo.transparent,
      opacity,
      side: mo.side ?? THREE.DoubleSide,
      depthWrite: mo.depthWrite ?? opacity >= 1,
      wireframe: !!mo.wireframe,
      vertexColors: !!mo.vertexColors,
    });
  }

  // ------------------------------------------------------------ primitives
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
  unitCylinder.translate(0, 0.5, 0);
  const unitCone = new THREE.ConeGeometry(1, 1, 24, 1);
  unitCone.translate(0, -0.5, 0); // tip at origin, pointing +y
  const shared = [unitCylinder, unitCone];

  /** Solid arrow. ao: {color, radius (0.022), headLength (0.14), headRadius (0.055), opacity, parent} */
  function arrow(from, to, ao = {}) {
    const g = new THREE.Group();
    const mat = material(ao.color ?? 'alg', { opacity: ao.opacity });
    const shaft = new THREE.Mesh(unitCylinder, mat);
    const head = new THREE.Mesh(unitCone, mat);
    g.add(shaft, head);
    const r = ao.radius ?? 0.022;
    const hl = ao.headLength ?? 0.14;
    const hr = ao.headRadius ?? 0.055;
    const tmp = new THREE.Vector3();
    g.set = (a, b) => {
      const A = V(a);
      const B = V(b);
      tmp.subVectors(B, A);
      const len = tmp.length();
      if (len < 1e-6) {
        shaft.visible = head.visible = false;
        return g;
      }
      shaft.visible = head.visible = true;
      const dir = tmp.clone().divideScalar(len);
      const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
      const h = Math.min(hl, len * 0.45);
      const k = h / hl;
      shaft.position.copy(A);
      shaft.quaternion.copy(q);
      shaft.scale.set(r, Math.max(len - h, 1e-6), r);
      head.position.copy(B);
      head.quaternion.copy(q);
      head.scale.set(hr * Math.max(k, 0.35), h, hr * Math.max(k, 0.35));
      return g;
    };
    g.setColor = (c) => {
      mat.color.copy(color(c));
      return g;
    };
    g.material = mat;
    g.set(from, to);
    (ao.parent || root).add(g);
    return g;
  }

  /** Fat polyline (constant pixel width). lo: {color, width (2.5 px), opacity, dashed, dashSize, gapSize, closed, parent, depthTest} */
  function line(points, lo = {}) {
    const mat = new LineMaterial({
      color: color(lo.color ?? 'grp'),
      linewidth: lo.width ?? 2.5,
      transparent: (lo.opacity ?? 1) < 1,
      opacity: lo.opacity ?? 1,
      dashed: !!lo.dashed,
      dashSize: lo.dashSize ?? 0.08,
      gapSize: lo.gapSize ?? 0.06,
      depthTest: lo.depthTest ?? true,
      worldUnits: false,
    });
    const ln = new Line2(new LineGeometry(), mat);
    ln.frustumCulled = false;
    ln.setPoints = (pts) => {
      let arr = (pts || []).filter((p) => p && Number.isFinite(p[0] ?? p.x));
      if (lo.closed && arr.length > 2) arr = [...arr, arr[0]];
      if (arr.length < 2) {
        ln.visible = false;
        return ln;
      }
      ln.visible = ln.userData.visible !== false;
      const flat = new Float32Array(arr.length * 3);
      arr.forEach((p, i) => {
        if (p instanceof THREE.Vector3) {
          flat[3 * i] = p.x;
          flat[3 * i + 1] = p.y;
          flat[3 * i + 2] = p.z;
        } else {
          flat[3 * i] = p[0];
          flat[3 * i + 1] = p[1];
          flat[3 * i + 2] = p[2] ?? 0;
        }
      });
      const old = ln.geometry;
      const geo = new LineGeometry();
      geo.setPositions(flat);
      ln.geometry = geo;
      old.dispose();
      if (mat.dashed) ln.computeLineDistances();
      return ln;
    };
    ln.setColor = (c) => {
      mat.color.copy(color(c));
      return ln;
    };
    ln.setWidth = (w) => {
      mat.linewidth = w;
      return ln;
    };
    ln.setPoints(points);
    (lo.parent || root).add(ln);
    return ln;
  }

  /** Line through samples of a parametric curve f(t) → [x,y,z], t ∈ [t0, t1]. */
  function curve(f, t0, t1, n = 200, lo = {}) {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(f(t0 + ((t1 - t0) * i) / n));
    return line(pts, lo);
  }

  /** Circle as a fat line loop. */
  function circle(center, normal, radius, lo = {}) {
    const n = V(normal).normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
    u.sub(n.clone().multiplyScalar(n.dot(u))).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    const c = V(center);
    const seg = lo.segments ?? 128;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(c.clone().addScaledVector(u, radius * Math.cos(a)).addScaledVector(w, radius * Math.sin(a)));
    }
    return line(pts, lo);
  }

  /** Sphere mesh. so: {radius (1), color, opacity, wireframe, position, segments, parent, basic} */
  function sphere(so = {}) {
    const geo = new THREE.SphereGeometry(so.radius ?? 1, so.segments ?? 64, Math.max(8, Math.round((so.segments ?? 64) / 2)));
    const mat = so.basic ? basic(so.color ?? 'grp', so) : material(so.color ?? 'grp', so);
    const m = new THREE.Mesh(geo, mat);
    if (so.position) m.position.copy(V(so.position));
    if (so.renderOrder !== undefined) m.renderOrder = so.renderOrder;
    (so.parent || root).add(m);
    return m;
  }

  /** Latitude/longitude guide lines on a sphere (thin). wo: {radius, color, opacity, lat (6), lon (12), parent} */
  function wireSphere(wo = {}) {
    const r = wo.radius ?? 1;
    const lat = wo.lat ?? 6;
    const lon = wo.lon ?? 12;
    const pos = [];
    const seg = 96;
    for (let i = 1; i < lat; i++) {
      const th = (i / lat) * Math.PI;
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const b = ((j + 1) / seg) * Math.PI * 2;
        pos.push(r * Math.sin(th) * Math.cos(a), r * Math.sin(th) * Math.sin(a), r * Math.cos(th));
        pos.push(r * Math.sin(th) * Math.cos(b), r * Math.sin(th) * Math.sin(b), r * Math.cos(th));
      }
    }
    for (let j = 0; j < lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI;
        const b = ((i + 1) / seg) * Math.PI;
        pos.push(r * Math.sin(a) * Math.cos(ph), r * Math.sin(a) * Math.sin(ph), r * Math.cos(a));
        pos.push(r * Math.sin(b) * Math.cos(ph), r * Math.sin(b) * Math.sin(ph), r * Math.cos(b));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: color(wo.color ?? 'muted'), transparent: true, opacity: wo.opacity ?? 0.35, depthWrite: false });
    const ls = new THREE.LineSegments(geo, mat);
    (wo.parent || root).add(ls);
    return ls;
  }

  /** Tube along points (rebuild with setPoints). to: {radius (0.02), color, opacity, closed, radialSegments, parent} */
  function tube(points, to = {}) {
    const mat = material(to.color ?? 'grp', to);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.setPoints = (pts) => {
      const arr = (pts || []).map(V);
      const old = mesh.geometry;
      if (arr.length < 2) {
        mesh.visible = false;
        return mesh;
      }
      mesh.visible = true;
      const c = new THREE.CatmullRomCurve3(arr, !!to.closed, 'centripetal');
      mesh.geometry = new THREE.TubeGeometry(c, Math.max(8, to.tubularSegments ?? arr.length * 2), to.radius ?? 0.02, to.radialSegments ?? 8, !!to.closed);
      old.dispose();
      return mesh;
    };
    mesh.setColor = (c2) => {
      mat.color.copy(color(c2));
      return mesh;
    };
    mesh.setPoints(points);
    (to.parent || root).add(mesh);
    return mesh;
  }

  /**
   * Parametric surface f(u, v) → [x,y,z] on [u0,u1]×[v0,v1] with nu×nv quads.
   * so: {color, opacity, wireframe, colorFn(u,v,[x,y,z]) → CSS colour | THREE.Color (vertex colours), parent, side}
   * Returns mesh with .update(f?) to recompute positions (same resolution).
   */
  function surface(f, [u0, u1], [v0, v1], nu = 64, nv = 32, so = {}) {
    const geo = new THREE.BufferGeometry();
    const count = (nu + 1) * (nv + 1);
    const pos = new Float32Array(count * 3);
    const cols = so.colorFn ? new Float32Array(count * 3) : null;
    const idx = [];
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j;
        const b = (i + 1) * (nv + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (cols) geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = material(so.color ?? 'grp', { ...so, vertexColors: !!cols, side: so.side ?? THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const tmpC = new THREE.Color();
    mesh.update = (g = f) => {
      f = g;
      let k = 0;
      for (let i = 0; i <= nu; i++) {
        const u = u0 + ((u1 - u0) * i) / nu;
        for (let j = 0; j <= nv; j++) {
          const v = v0 + ((v1 - v0) * j) / nv;
          const p = f(u, v);
          const ok = p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
          pos[3 * k] = ok ? p[0] : 0;
          pos[3 * k + 1] = ok ? p[1] : 0;
          pos[3 * k + 2] = ok ? p[2] : 0;
          if (cols) {
            const c = so.colorFn(u, v, p);
            tmpC.copy(c instanceof THREE.Color ? c : color(c));
            cols[3 * k] = tmpC.r;
            cols[3 * k + 1] = tmpC.g;
            cols[3 * k + 2] = tmpC.b;
          }
          k++;
        }
      }
      geo.attributes.position.needsUpdate = true;
      if (cols) geo.attributes.color.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      return mesh;
    };
    mesh.update();
    (so.parent || root).add(mesh);
    return mesh;
  }

  /** Many small spheres (InstancedMesh). do: {radius (0.04), color, colors: [per-point], max, parent}. Returns mesh with setPoints(points, colors?). */
  function dots(points, dop = {}) {
    const max = dop.max ?? Math.max(points.length, 1);
    const geo = new THREE.SphereGeometry(dop.radius ?? 0.04, 14, 10);
    const base = color(dop.color ?? 'ink');
    const mat = material(base, { ...dop, opacity: dop.opacity });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4();
    // three.js multiplies instance colours by the material colour. With per-point colours the
    // material is switched to white so every dot shows exactly its own colour (with the default 'ink'
    // base, light-theme dots would otherwise come out black); points without one get the base colour.
    let perPoint = false;
    let coloured = 0; // instances [0, coloured) have had an instance colour written
    mesh.setPoints = (pts, colorsArr) => {
      const n = Math.min(pts.length, max);
      const src = colorsArr || dop.colors || null;
      if (src && !perPoint) {
        perPoint = true;
        mat.color.set(0xffffff);
      }
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        m4.makeTranslation(p[0], p[1], p[2] ?? 0);
        if (dop.scales) {
          const s = dop.scales[i] ?? 1;
          m4.scale(new THREE.Vector3(s, s, s));
        }
        mesh.setMatrixAt(i, m4);
        if (src) mesh.setColorAt(i, src[i] ? color(src[i]) : base);
        else if (perPoint && i >= coloured) mesh.setColorAt(i, base);
      }
      if (perPoint) coloured = Math.max(coloured, n);
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return mesh;
    };
    mesh.setPoints(points);
    (dop.parent || root).add(mesh);
    return mesh;
  }

  /**
   * Label at a 3D point. By default `content` is raw TeX (no $). lo.html → content is HTML with inline $…$.
   * lo: {className ('label3d'), small, color, offset [dx,dy] px, parent}
   * Returns CSS2DObject with setText(content), setPosition(p), setVisible(bool).
   */
  function label(content, position, lo = {}) {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = ['label3d', lo.small ? 'small' : '', lo.className || ''].filter(Boolean).join(' ');
    if (lo.color) inner.style.color = typeof lo.color === 'string' && pal[lo.color] ? pal[lo.color] : lo.color;
    if (lo.offset) inner.style.transform = `translate(${lo.offset[0]}px, ${lo.offset[1]}px)`;
    outer.appendChild(inner);
    const obj = new CSS2DObject(outer);
    let last = null;
    obj.setText = (c) => {
      if (c === last) return obj;
      last = c;
      inner.innerHTML = lo.html ? inlineTex(c) : texHTML(c, false);
      return obj;
    };
    obj.setPosition = (p) => {
      obj.position.copy(V(p));
      return obj;
    };
    obj.setVisible = (v) => {
      obj.visible = !!v;
      outer.style.display = v ? '' : 'none';
      return obj;
    };
    obj.setText(content);
    obj.setPosition(position);
    (lo.parent || root).add(obj);
    return obj;
  }

  /** Coordinate axes as arrows with labels. ao: {length (1.4), labels ['x','y','z'] TeX | false, radius, colors, negative (false), parent} */
  function axes(ao = {}) {
    const len = ao.length ?? 1.4;
    const g = new THREE.Group();
    const cols = ao.colors ?? ['x', 'y', 'z'];
    const labs = ao.labels === false ? null : ao.labels ?? ['x', 'y', 'z'];
    const dirs = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    g.arrows = dirs.map((d, i) =>
      arrow(ao.negative ? d.map((x) => -x * len * 0.6) : [0, 0, 0], d.map((x) => x * len), {
        color: cols[i],
        radius: ao.radius ?? 0.012,
        headLength: 0.09,
        headRadius: 0.032,
        parent: g,
      }),
    );
    g.labels = labs ? dirs.map((d, i) => label(labs[i], d.map((x) => x * (len + 0.12)), { parent: g, color: cols[i] })) : [];
    (ao.parent || root).add(g);
    return g;
  }

  /** Grid in the xy-plane (z-up) or xz-plane (y-up). go: {size (4), divisions (8), parent, opacity} */
  function grid(go = {}) {
    const gh = new THREE.GridHelper(go.size ?? 4, go.divisions ?? 8, color('axis'), color('grid'));
    if (o.zUp) gh.rotation.x = Math.PI / 2;
    gh.material.transparent = true;
    gh.material.opacity = go.opacity ?? 0.9;
    gh.material.depthWrite = false;
    (go.parent || root).add(gh);
    return gh;
  }

  // ------------------------------------------------------------ picking & dragging
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.05 };
  const ndc = new THREE.Vector2();
  function rayFromEvent(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.clone();
  }
  /** Constraint helpers return functions ray → [x,y,z] | null. */
  const onPlane = (normal, point = [0, 0, 0]) => {
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(V(normal).normalize(), V(point));
    return (ray) => {
      const out = new THREE.Vector3();
      return ray.intersectPlane(pl, out) ? [out.x, out.y, out.z] : null;
    };
  };
  const onSphere = (center = [0, 0, 0], radius = 1) => {
    const C0 = V(center);
    const S = new THREE.Sphere(C0, radius);
    return (ray) => {
      const out = new THREE.Vector3();
      if (ray.intersectSphere(S, out)) return [out.x, out.y, out.z];
      // miss: closest point of the ray to the centre, pushed onto the sphere (silhouette)
      const cp = new THREE.Vector3();
      ray.closestPointToPoint(C0, cp);
      cp.sub(C0).setLength(radius).add(C0);
      return [cp.x, cp.y, cp.z];
    };
  };
  const alongLine = (origin, dir) => {
    const O = V(origin);
    const D = V(dir).normalize();
    return (ray) => {
      // closest point on the line O + sD to the ray
      const w0 = new THREE.Vector3().subVectors(O, ray.origin);
      const a = D.dot(D);
      const b = D.dot(ray.direction);
      const c = ray.direction.dot(ray.direction);
      const d = D.dot(w0);
      const e = ray.direction.dot(w0);
      const den = a * c - b * b;
      if (Math.abs(den) < 1e-9) return null;
      const s = (b * e - c * d) / den;
      const p = O.clone().addScaledVector(D, s);
      return [p.x, p.y, p.z];
    };
  };
  /** Free drag in the plane through the object facing the camera. */
  const cameraPlane = (point) => {
    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    return onPlane([n.x, n.y, n.z], point);
  };

  const draggables = [];
  /**
   * Make an object draggable. dopt: { constrain: (ray, startPoint) → [x,y,z]|null  (default camera plane),
   *   onDrag([x,y,z], event), onStart(), onEnd(), cursor }. Returns { remove() }.
   */
  function draggable(object, dopt = {}) {
    const d = { object, ...dopt };
    draggables.push(d);
    return {
      remove() {
        const i = draggables.indexOf(d);
        if (i >= 0) draggables.splice(i, 1);
      },
    };
  }
  let active = null;
  function pick(e) {
    if (!draggables.length) return null;
    const ray = rayFromEvent(e);
    raycaster.ray.copy(ray);
    let best = null;
    for (const d of draggables) {
      if (!d.object.visible) continue;
      const hits = raycaster.intersectObject(d.object, true);
      if (hits.length && (!best || hits[0].distance < best.dist)) best = { d, dist: hits[0].distance, point: hits[0].point };
    }
    return best;
  }
  const el = container;
  scope.listen(
    el,
    'pointerdown',
    (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const hit = pick(e);
      if (!hit) return;
      e.stopPropagation();
      e.preventDefault();
      const start = [hit.point.x, hit.point.y, hit.point.z];
      const objPos = new THREE.Vector3();
      hit.d.object.getWorldPosition(objPos);
      active = { d: hit.d, start, constrain: hit.d.constrain || cameraPlane([objPos.x, objPos.y, objPos.z]), pointerId: e.pointerId };
      if (controls) controls.enabled = false;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch (_) {
        /* synthetic events */
      }
      hit.d.onStart && hit.d.onStart();
      renderer.domElement.style.cursor = 'grabbing';
    },
    { capture: true },
  );
  scope.listen(renderer.domElement, 'pointermove', (e) => {
    if (active) {
      const p = active.constrain(rayFromEvent(e), active.start);
      if (p) active.d.onDrag && active.d.onDrag(p, e);
      return;
    }
    if (draggables.length && e.buttons === 0) {
      const hit = pick(e);
      renderer.domElement.style.cursor = hit ? hit.d.cursor || 'grab' : '';
    }
  });
  const endDrag = () => {
    if (!active) return;
    active.d.onEnd && active.d.onEnd();
    active = null;
    if (controls) controls.enabled = true;
    renderer.domElement.style.cursor = '';
  };
  scope.listen(renderer.domElement, 'pointerup', endDrag);
  scope.listen(renderer.domElement, 'pointercancel', endDrag);

  // ------------------------------------------------------------ sizing & rendering
  let W = 1;
  let H = 1;
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width));
    H = Math.max(1, Math.floor(r.height));
    renderer.setSize(W, H, false);
    labelRenderer.setSize(W, H);
    if (camera.isPerspectiveCamera) camera.aspect = W / H;
    else {
      const a = W / H;
      camera.left = -o.orthoSize * a;
      camera.right = o.orthoSize * a;
      camera.top = o.orthoSize;
      camera.bottom = -o.orthoSize;
    }
    camera.updateProjectionMatrix();
  }
  scope.observeResize(container, resize);
  resize();

  let paused = false;
  function render() {
    if (paused) return;
    if (controls) controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  scope.frame(render, 'render');

  if (o.grid) grid(typeof o.grid === 'object' ? o.grid : {});
  const axesGroup = o.axes ? axes(typeof o.axes === 'object' ? o.axes : {}) : null;

  // ------------------------------------------------------------ dispose
  scope.add(() => {
    paused = true;
    if (controls) controls.dispose();
    scene.traverse((obj) => {
      if (obj.geometry && !shared.includes(obj.geometry)) obj.geometry.dispose();
      const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const m of mats) {
        for (const key of ['map', 'alphaMap', 'envMap', 'normalMap']) if (m[key]) m[key].dispose();
        m.dispose();
      }
      if (obj.isCSS2DObject && obj.element) obj.element.remove();
    });
    shared.forEach((g) => g.dispose());
    renderer.dispose();
    try {
      renderer.forceContextLoss();
    } catch (_) {
      /* ignore */
    }
    renderer.domElement.remove();
    labelRenderer.domElement.remove();
  });

  return {
    THREE,
    scene,
    camera,
    renderer,
    controls,
    root,
    colors: pal,
    axesGroup,
    color,
    material,
    basic,
    add: (...objs) => {
      root.add(...objs);
      return objs[0];
    },
    remove: (...objs) => root.remove(...objs),
    arrow,
    line,
    curve,
    circle,
    sphere,
    wireSphere,
    tube,
    surface,
    dots,
    label,
    axes,
    grid,
    draggable,
    onPlane,
    onSphere,
    alongLine,
    cameraPlane,
    rayFromEvent,
    /** Per-frame update fn(dt, t) (runs before rendering). Returns stop(). */
    onFrame: (fn) => scope.frame(fn),
    /** World point → [x, y] CSS px within the container. */
    toScreen(p) {
      const v = V(p).project(camera);
      return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
    },
    setCamera(position, target) {
      camera.position.set(...position);
      if (target && controls) controls.target.set(...target);
      if (controls) controls.update();
      else camera.lookAt(...(target || o.target));
    },
    get size() {
      return { width: W, height: H };
    },
  };
}
