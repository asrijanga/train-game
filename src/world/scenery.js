import * as THREE from 'three';
import { Kit } from '../trains/kit.js';
import { toonGradient } from '../render/materials.js';
import { Rng, clamp, smoothstep } from '../core/rng.js';
import { HALF, WATER } from './terrain.js';

// Shared wind uniform for swaying foliage.
export const wind = { value: 0 };

function swayMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       #else
         vec3 ip = vec3(0.0);
       #endif
       float bend = max(0.0, position.y - 0.4) * 0.05;
       transformed.x += sin(uWind * 1.3 + ip.x * 0.21 + ip.z * 0.13) * bend;
       transformed.z += cos(uWind * 1.1 + ip.z * 0.19) * bend * 0.6;`,
    );
  };
  return m;
}

// --------------------------------------------------------------- tree models
function conifer(k, h = 1, snow = false) {
  k.cyl(0.12, 0.8, '#6b4a32', 0, 0.4, 0, 'y', 6);
  const greens = ['#2f5d3a', '#36683f', '#2a5434'];
  for (let i = 0; i < 3; i++) {
    const y = 0.7 + i * 0.75 * h;
    const r = (1.25 - i * 0.32);
    k.cyl(r, 1.25 * h, greens[i], 0, y + 0.62 * h, 0, 'y', 7, 0.02);
    if (snow) k.cyl(r * 0.55, 0.35, '#f4f6fb', 0, y + 1.0 * h, 0, 'y', 7, 0.02);
  }
}

function roundTree(k, tint = '#5d8f3e', tint2 = '#4f7f36') {
  k.cyl(0.13, 1.4, '#7a5636', 0, 0.7, 0, 'y', 6, 0.1);
  k.add(new THREE.IcosahedronGeometry(1, 0), tint, 0, 2.0, 0, 0.3, 0.5, 0, 1.15, 1.0, 1.15);
  k.add(new THREE.IcosahedronGeometry(1, 0), tint2, 0.55, 1.75, 0.3, 0.8, 0.2, 0.1, 0.75, 0.7, 0.75);
  k.add(new THREE.IcosahedronGeometry(1, 0), tint2, -0.5, 1.85, -0.25, 0.1, 0.9, 0.4, 0.7, 0.65, 0.7);
}

function birch(k) {
  k.cyl(0.08, 2.2, '#efeae0', 0, 1.1, 0, 'y', 6, 0.06);
  for (const y of [0.5, 0.9, 1.4, 1.8]) k.box(0.17, 0.04, 0.05, '#2d2c30', 0, y, 0.06);
  k.add(new THREE.IcosahedronGeometry(1, 0), '#9cbf4a', 0, 2.3, 0, 0, 0.4, 0, 0.75, 1.05, 0.75);
}

function poplar(k) {
  k.cyl(0.1, 0.8, '#6b4a32', 0, 0.4, 0, 'y', 6);
  k.add(new THREE.IcosahedronGeometry(1, 1), '#4f8a3d', 0, 2.2, 0, 0, 0, 0, 0.55, 1.9, 0.55);
}

function bush(k) {
  k.add(new THREE.IcosahedronGeometry(1, 0), '#5a8a3c', 0, 0.35, 0, 0, 0, 0, 0.6, 0.45, 0.6);
  k.add(new THREE.IcosahedronGeometry(1, 0), '#4c7a34', 0.35, 0.3, 0.1, 0.5, 0.2, 0, 0.4, 0.35, 0.4);
}

function autumn(k) {
  roundTree(k, '#d98a2b', '#c0582a');
}

function rock(k) {
  k.add(new THREE.DodecahedronGeometry(1, 0), '#9c968c', 0, 0.3, 0, 0.3, 0.6, 0.2, 1, 0.65, 0.85);
  k.add(new THREE.DodecahedronGeometry(1, 0), '#8a847b', 0.7, 0.15, 0.3, 0.8, 0.1, 0.5, 0.5, 0.35, 0.45);
}

function flowers(k) {
  const cols = ['#e05a6a', '#f2d04b', '#ffffff', '#9a6fd0', '#f08a3a'];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, r = 0.25 + (i % 3) * 0.18;
    k.cyl(0.015, 0.25, '#4f7f36', Math.cos(a) * r, 0.12, Math.sin(a) * r, 'y', 3);
    k.add(new THREE.OctahedronGeometry(1, 0), cols[i % cols.length], Math.cos(a) * r, 0.27, Math.sin(a) * r, 0, 0, 0, 0.07, 0.05, 0.07);
  }
  k.add(new THREE.ConeGeometry(1, 1, 5), '#6e9a45', 0, 0.12, 0, 0, 0, 0, 0.35, 0.25, 0.35);
}

function geomOf(fn, ...args) {
  const k = new Kit();
  fn(k, ...args);
  const g = k.build().children[0].geometry;
  return g;
}

const TYPES = [
  { id: 'conifer', make: () => geomOf(conifer, 1), sway: true },
  { id: 'coniferSnow', make: () => geomOf(conifer, 1.1, true), sway: true },
  { id: 'round', make: () => geomOf(roundTree), sway: true },
  { id: 'birch', make: () => geomOf(birch), sway: true },
  { id: 'poplar', make: () => geomOf(poplar), sway: true },
  { id: 'autumn', make: () => geomOf(autumn), sway: true },
  { id: 'bush', make: () => geomOf(bush), sway: true },
  { id: 'rock', make: () => geomOf(rock), sway: false },
  { id: 'flowers', make: () => geomOf(flowers), sway: true, noShadow: true },
];

const CELL = 8;

export class Scenery {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.group = new THREE.Group();
    this.group.name = 'scenery';
    this.items = []; // {type, x, z, s, r, tint, hidden}
    this.grid = new Map();
    this.meshes = {};
    this.removed = new Set();
  }

  generate(avoid) {
    const t = this.terrain;
    const rng = new Rng(t.seed * 17 + 3);
    const n = t.noise2;
    const step = 1.9;
    for (let z = -HALF + 4; z < HALF - 4; z += step) {
      for (let x = -HALF + 4; x < HALF - 4; x += step) {
        const px = x + rng.float(-0.9, 0.9), pz = z + rng.float(-0.9, 0.9);
        const h = t.heightAt(px, pz);
        if (h < 0.9) continue;
        if (avoid && avoid(px, pz)) continue;
        const slope = t.slopeAt(px, pz);
        const m = t.moistureAt(px, pz);
        const forest = smoothstep(0.48, 0.64, m + n.noise(px * 0.02, pz * 0.02) * 0.14);
        const r = rng.next();
        let type = null;
        if (h > 31 && slope < 1.4) {
          if (r < 0.04) type = 'rock';
        } else if (slope > 1.1) {
          if (r < 0.12) type = 'rock';
        } else if (h > 14) {
          if (r < 0.15 + forest * 0.6) type = h > 22 ? 'coniferSnow' : 'conifer';
          else if (r < 0.2 + forest * 0.6) type = 'rock';
        } else if (r < forest * 0.85) {
          const k = rng.next();
          const patch = n.noise(px * 0.04 + 9, pz * 0.04);
          type = patch > 0.62 ? 'autumn' : k < 0.45 ? 'round' : k < 0.65 ? 'conifer' : k < 0.82 ? 'birch' : 'bush';
        } else if (r < forest * 0.85 + 0.025) {
          type = rng.chance(0.5) ? 'round' : rng.chance(0.5) ? 'poplar' : 'bush';
        } else if (h < 1.6 && r < 0.06) {
          type = 'rock';
        } else if (r < 0.11 && m > 0.4 && h < 12) {
          type = 'flowers';
        }
        if (!type) continue;
        this.addItem(type, px, pz, rng);
      }
    }
    this.buildMeshes();
  }

  addItem(type, x, z, rng) {
    const s = type === 'rock' ? rng.float(0.5, 1.6) : type === 'flowers' ? rng.float(0.8, 1.3) : rng.float(0.75, 1.3);
    const it = { id: this.items.length, type, x, z, s, r: rng.float(0, Math.PI * 2), tint: rng.float(0.85, 1.12), hidden: false };
    this.items.push(it);
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let cell = this.grid.get(key);
    if (!cell) this.grid.set(key, (cell = []));
    cell.push(it);
    return it;
  }

  buildMeshes() {
    const byType = new Map();
    for (const it of this.items) {
      if (!byType.has(it.type)) byType.set(it.type, []);
      byType.get(it.type).push(it);
    }
    const sway = swayMaterial();
    const still = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
    for (const T of TYPES) {
      const list = byType.get(T.id);
      if (!list) continue;
      const geo = T.make();
      const mesh = new THREE.InstancedMesh(geo, T.sway ? sway : still, list.length);
      mesh.castShadow = !T.noShadow;
      mesh.receiveShadow = true;
      const col = new THREE.Color();
      list.forEach((it, i) => {
        it.mesh = mesh;
        it.index = i;
        col.setScalar(it.tint);
        mesh.setColorAt(i, col);
        this.writeMatrix(it);
      });
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.meshes[T.id] = mesh;
      this.group.add(mesh);
    }
  }

  writeMatrix(it) {
    const y = this.terrain.heightAt(it.x, it.z) - 0.05;
    const s = it.hidden ? 0 : it.s;
    M.compose(V.set(it.x, y, it.z), Q.setFromAxisAngle(UP, it.r), S.set(s, s * (it.type === 'rock' ? 0.8 : 1), s));
    it.mesh.setMatrixAt(it.index, M);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  near(x, z, r, fn) {
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
    const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const cell = this.grid.get(`${cx},${cz}`);
      if (cell) for (const it of cell) fn(it);
    }
  }

  // Hide scenery near a polyline [x,y,z,...]; re-seat the rest on the ground.
  clearAlong(pts, radius) {
    const n = pts.length / 3;
    const touched = new Set();
    for (let i = 0; i < n; i += 2) {
      const x = pts[i * 3], z = pts[i * 3 + 2];
      this.near(x, z, radius + 10, (it) => {
        const d = Math.hypot(it.x - x, it.z - z);
        if (d < radius + (it.type === 'rock' ? it.s * 0.8 : 0.6) && !it.hidden) {
          it.hidden = true;
          this.removed.add(it.id);
        }
        touched.add(it);
      });
    }
    for (const it of touched) this.writeMatrix(it);
    for (const m of Object.values(this.meshes)) m.computeBoundingSphere();
    this.game.towns?.clearAlong(pts, radius);
  }

  treeDensityAt(x, z, r) {
    let c = 0;
    this.near(x, z, r, (it) => {
      if (!it.hidden && it.type !== 'rock' && it.type !== 'flowers' && Math.hypot(it.x - x, it.z - z) < r) c++;
    });
    return (c * 4.4) / (Math.PI * r * r);
  }

  nearestTown(x, z, r) {
    return this.game.towns?.nearest(x, z, r) ?? null;
  }

  snapshot() {
    return { removed: [...this.removed], towns: this.game.towns?.snapshot() };
  }

  restore(s) {
    this.removed = new Set(s.removed || []);
    for (const it of this.items) {
      const h = this.removed.has(it.id);
      if (h !== it.hidden || true) { it.hidden = h; this.writeMatrix(it); }
    }
    if (s.towns) this.game.towns?.restore(s.towns);
  }

  update(t) {
    wind.value = t;
  }
}

const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export { clamp, WATER };
