import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from '../render/materials.js';
import { windowMat, lampMat } from '../render/shared.js';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

// Collects primitives with colours and merges them into one vertex-coloured
// mesh (plus glass + lamp meshes). Vehicles: +x forward, y up from rail top.
export class Kit {
  constructor() {
    this.parts = { solid: [], glass: [], lamp: [] };
  }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, bucket = 'solid') {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
    g.applyMatrix4(m4);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    this.parts[bucket].push(g);
    return this;
  }

  box(w, h, d, color, x, y, z, rx, ry, rz) {
    return this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }

  // cylinder along an axis: 'x' | 'y' | 'z'
  cyl(r, len, color, x, y, z, axis = 'y', seg = 14, r2 = r) {
    const geo = cylGeo(seg, r2 / r);
    const rot = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    return this.add(geo, color, x, y, z, rot[0], rot[1], rot[2], r, len, r);
  }

  sphere(r, color, x, y, z, sy = 1) {
    return this.add(SPHERE, color, x, y, z, 0, 0, 0, r, r * sy, r);
  }

  glass(w, h, d, x, y, z) {
    return this.add(BOX, '#ffffff', x, y, z, 0, 0, 0, w, h, d, 'glass');
  }

  lamp(r, x, y, z) {
    return this.add(SPHERE, '#ffffff', x, y, z, 0, 0, 0, r, r, r, 'lamp');
  }

  build() {
    const grp = new THREE.Group();
    const mk = (list, mat, shadow) => {
      if (!list.length) return;
      const geo = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      grp.add(mesh);
      list.forEach((g) => g.dispose());
    };
    mk(this.parts.solid, toon('#ffffff', { vertexColors: true }), true);
    mk(this.parts.glass, windowMat, false);
    mk(this.parts.lamp, lampMat, false);
    return grp;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 12, 8);
const cylCache = new Map();
function cylGeo(seg, taper) {
  const key = seg + ':' + taper.toFixed(3);
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(taper, 1, 1, seg, 1, false);
    cylCache.set(key, g);
  }
  return g;
}

// A wheelset (two wheels + axle) as a reusable geometry; spins about z.
const wheelCache = new Map();
export function wheelsetGeometry(r, spokes = 0, color = '#2d2c30', tire = '#55545a', gauge = 0.18, cw = false) {
  const key = [r, spokes, color, tire, gauge, cw].join('|');
  let g = wheelCache.get(key);
  if (g) return g;
  const k = new Kit();
  for (const side of [-1, 1]) {
    const z = side * gauge;
    k.cyl(r, 0.05, tire, 0, 0, z, 'z', 18);
    k.cyl(r * 0.88, 0.07, color, 0, 0, z + side * 0.01, 'z', 18);
    if (spokes) {
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI;
        k.box(r * 1.7, r * 0.11, 0.03, tire, 0, 0, z + side * 0.05, 0, 0, a);
      }
      k.cyl(r * 0.85, 0.02, tire, 0, 0, z + side * 0.045, 'z', 18, r * 0.85);
      k.cyl(r * 0.22, 0.1, '#b9a35a', 0, 0, z + side * 0.06, 'z', 8);
      if (cw) k.box(r * 0.75, r * 0.34, 0.035, color, -r * 0.4, 0, z + side * 0.055);
    } else {
      k.cyl(r * 0.25, 0.09, '#77736c', 0, 0, z + side * 0.03, 'z', 8);
    }
  }
  k.cyl(0.035, gauge * 2, '#3a3a3e', 0, 0, 0, 'z', 6);
  const parts = k.parts.solid;
  g = mergeGeometries(parts, false);
  wheelCache.set(key, g);
  return g;
}
