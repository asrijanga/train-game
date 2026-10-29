import * as THREE from 'three';
import { Kit } from '../trains/kit.js';
import { toonGradient } from '../render/materials.js';
import { Rng, clamp, smoothstep, hash2 } from '../core/rng.js';
import { HALF, WATER } from './terrain.js';
import { windUniforms, seasonUniforms } from './nature.js';

// ------------------------------------------------------------------ species
// foliage is modelled white; the shader paints it by species and season.
export const SP = { PINE: 0, CEDAR: 1, OAK: 2, MAPLE: 3, CHERRY: 4, GINKGO: 5, HYDRANGEA: 6, BAMBOO: 7 };
const PAL = [
  // spring, summer, autumn, winter (foliage)
  ['#3f6f45', '#2f6140', '#36603f', '#3c5a4a'], // pine
  ['#4f7e45', '#3b6a3f', '#6b6a3a', '#4a5c48'], // cedar
  ['#97c95a', '#4f8f3c', '#e0952b', '#8b7a66'], // oak
  ['#a9cf5e', '#5c9c44', '#d7362a', '#7d6a62'], // maple
  ['#f7bfd3', '#5d9b47', '#cf6a2e', '#7f6c66'], // cherry
  ['#bbd86c', '#6aa64a', '#f4c53a', '#8c7d68'], // ginkgo
  ['#7fae52', '#8c9be3', '#a2803e', '#6b7a5c'], // hydrangea (blue blooms in early summer)
  ['#9ccc5a', '#86c052', '#a7b85a', '#9ab072'], // bamboo
];
const ALT = ['#2f5a3a', '#4a6a3a', '#c4552a', '#f08a2a', '#e7a3be', '#e9b42e', '#c98bd8', '#b6c860']; // second shade
const palUniform = PAL.flat().map((h) => new THREE.Color(h));
const altUniform = ALT.map((h) => new THREE.Color(h));

export const natureUniforms = {
  uPal: { value: palUniform },
  uAlt: { value: altUniform },
  uNearC: { value: new THREE.Vector2(0, 0) },
  uNearR: { value: 120 },
};

function treeMaterial(mode) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  m.defines = { [mode]: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms, seasonUniforms, natureUniforms);
    sh.vertexShader = `attribute vec2 aTree;
      uniform float uWindTime, uWindStrength; uniform vec2 uWindDir; uniform vec2 uNearC; uniform float uNearR;
      varying float vSeed; varying float vSp; varying float vNY;\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vSeed = aTree.x; vSp = aTree.y; vNY = normal.y;
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float nd = distance(ip.xz, uNearC);
       #ifdef NEAR
         if (nd > uNearR) transformed *= 0.0;
       #endif
       #ifdef FAR
         if (nd < uNearR) transformed *= 0.0;
       #endif
       float hh = max(0.0, position.y - 0.6);
       float ph = uWindTime * 1.7 - dot(ip.xz, uWindDir) * 0.06 + aTree.x * 6.28;
       float amp = (0.012 + 0.03 * uWindStrength) * hh * (0.65 + 0.35 * sin(ph * 0.31));
       transformed.xz += uWindDir * (sin(ph) * amp + uWindStrength * 0.02 * hh);`,
    );
    sh.fragmentShader = `uniform vec3 uPal[32]; uniform vec3 uAlt[8]; uniform vec4 uSeasonW;
      varying float vSeed; varying float vSp; varying float vNY;\n` + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         vec3 c = diffuseColor.rgb;
         float fol = smoothstep(0.45, 0.7, c.b);
         int sp = int(vSp + 0.5);
         vec4 w = uSeasonW;
         vec3 sc = uPal[sp * 4] * w.x + uPal[sp * 4 + 1] * w.y + uPal[sp * 4 + 2] * w.z + uPal[sp * 4 + 3] * w.w;
         // each tree has its own mood: some autumn trees run to the second colour
         float alt = step(0.55, vSeed) * (w.z + w.x * 0.4);
         sc = mix(sc, uAlt[sp], alt * 0.75);
         sc *= 0.86 + 0.28 * fract(vSeed * 7.13);
         vec3 folC = sc * (0.75 + 0.3 * c.r);
         float snow = w.w * smoothstep(0.25, 0.75, vNY) * 0.9;
         folC = mix(folC, vec3(0.92, 0.94, 0.98), snow);
         diffuseColor.rgb = mix(c, folC, fol);
       }`,
    );
  };
  m.customProgramCacheKey = () => 'tree-' + mode;
  return m;
}

// ------------------------------------------------------------------ models
const W = '#ffffff', W2 = '#e6e6e6', W3 = '#d2d2d2';
const BARK = '#6a4a35', BARK_D = '#4a3428', CHERRY_BARK = '#3f2c2a';

function blob(k, x, y, z, sx, sy, sz, c = W, det = 0) {
  k.add(new THREE.IcosahedronGeometry(1, det), c, x, y, z, x * 0.7, z * 0.9, 0, sx, sy, sz);
}

const MODELS = {
  [SP.PINE]: (k) => {
    // Japanese black pine: crooked trunk with flat cloud pads
    k.cyl(0.13, 1.3, BARK_D, 0, 0.65, 0, 'y', 6, 0.1);
    k.cyl(0.09, 1.2, BARK_D, 0.25, 1.75, 0.05, 'y', 6, 0.07);
    k.add(new THREE.CylinderGeometry(1, 1, 1, 6), BARK_D, 0.45, 2.0, 0.1, 0, 0, -1.0, 0.05, 0.9, 0.05);
    for (const [x, y, z, s] of [[0.3, 2.5, 0, 1.1], [-0.6, 1.9, 0.3, 0.8], [0.9, 2.1, -0.3, 0.75], [0.1, 3.0, 0.1, 0.7]]) {
      k.add(new THREE.CylinderGeometry(1, 0.9, 1, 9), x > 0.5 ? W2 : W, x, y, z, 0, x, 0, s, 0.32, s * 0.85);
      blob(k, x, y + 0.12, z, s * 0.85, 0.22, s * 0.7, W3, 0);
    }
  },
  [SP.CEDAR]: (k) => {
    k.cyl(0.12, 1.0, BARK, 0, 0.5, 0, 'y', 6);
    for (let i = 0; i < 4; i++) {
      const y = 1.0 + i * 0.75;
      k.cyl(0.95 - i * 0.2, 1.3, i % 2 ? W2 : W, 0, y + 0.5, 0, 'y', 8, 0.05);
    }
  },
  [SP.OAK]: (k) => {
    k.cyl(0.15, 1.5, BARK, 0, 0.75, 0, 'y', 6, 0.11);
    k.add(new THREE.CylinderGeometry(1, 1, 1, 5), BARK, 0.35, 1.6, 0, 0, 0, -0.7, 0.06, 0.8, 0.06);
    blob(k, 0, 2.25, 0, 1.3, 1.05, 1.25, W);
    blob(k, 0.75, 1.95, 0.35, 0.85, 0.75, 0.85, W2);
    blob(k, -0.65, 2.0, -0.3, 0.8, 0.7, 0.8, W2);
    blob(k, 0.1, 2.95, -0.2, 0.75, 0.6, 0.75, W);
  },
  [SP.MAPLE]: (k) => {
    k.cyl(0.11, 1.3, BARK_D, 0, 0.65, 0, 'y', 6, 0.08);
    for (const [x, y, z, s] of [[0, 1.7, 0, 1.05], [0.55, 2.2, 0.2, 0.75], [-0.5, 2.25, -0.2, 0.7], [0.05, 2.75, 0, 0.62]]) {
      k.add(new THREE.IcosahedronGeometry(1, 0), y > 2 ? W : W2, x, y, z, 0, x, 0, s * 1.1, s * 0.5, s * 1.1);
    }
  },
  [SP.CHERRY]: (k) => {
    // dark spreading trunk with wide, frothy blossom clouds
    k.cyl(0.14, 1.0, CHERRY_BARK, 0, 0.5, 0, 'y', 6, 0.12);
    k.add(new THREE.CylinderGeometry(1, 1, 1, 5), CHERRY_BARK, 0.45, 1.3, 0, 0, 0, -0.9, 0.07, 1.0, 0.07);
    k.add(new THREE.CylinderGeometry(1, 1, 1, 5), CHERRY_BARK, -0.45, 1.3, 0.1, 0, 0, 0.9, 0.07, 1.0, 0.07);
    for (const [x, y, z, s] of [[0.9, 1.75, 0, 0.85], [-0.9, 1.8, 0.2, 0.85], [0, 2.05, -0.5, 0.9], [0.1, 2.2, 0.6, 0.8], [0, 2.5, 0, 0.75]]) {
      blob(k, x, y, z, s * 1.15, s * 0.65, s * 1.05, y > 2.2 ? W : W2, 1);
    }
  },
  [SP.GINKGO]: (k) => {
    k.cyl(0.12, 1.4, BARK, 0, 0.7, 0, 'y', 6, 0.09);
    blob(k, 0, 2.1, 0, 0.95, 1.25, 0.95, W);
    blob(k, 0, 3.0, 0, 0.6, 0.8, 0.6, W2);
  },
  [SP.HYDRANGEA]: (k) => {
    blob(k, 0, 0.42, 0, 0.75, 0.5, 0.7, '#5d8e45', 0);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = 0.45;
      blob(k, Math.cos(a) * r, 0.6 + (i % 3) * 0.12, Math.sin(a) * r, 0.2, 0.18, 0.2, W, 0);
    }
  },
  [SP.BAMBOO]: (k) => {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05, r = 0.25 + (i % 2) * 0.25;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, hgt = 3.6 + (i % 3) * 0.6;
      k.cyl(0.045, hgt, '#7aa24a', x, hgt / 2, z, 'y', 5);
      for (let y = 0.7; y < hgt; y += 0.6) k.cyl(0.055, 0.04, '#5f8a3a', x, y, z, 'y', 5);
      k.add(new THREE.ConeGeometry(0.45, 1.0, 5), W, x, hgt - 0.3, z, 0, a, 0.2, 1, 1, 0.5);
      k.add(new THREE.ConeGeometry(0.35, 0.8, 5), W2, x + 0.1, hgt - 0.9, z, 0.3, a + 1, -0.2, 1, 1, 0.5);
    }
  },
};

function geoFrom(fn) {
  const k = new Kit();
  fn(k);
  return k.build().children[0].geometry;
}

// Far LOD: a puff on a stick, coloured by the same seasonal shader.
function farGeo() {
  const k = new Kit();
  k.cyl(0.12, 1.2, BARK, 0, 0.6, 0, 'y', 4);
  k.add(new THREE.IcosahedronGeometry(1, 0), W, 0, 2.1, 0, 0, 0, 0, 1.1, 1.0, 1.1);
  return k.build().children[0].geometry;
}

function rockGeo() {
  const k = new Kit();
  k.add(new THREE.DodecahedronGeometry(1, 0), '#9c968c', 0, 0.3, 0, 0.3, 0.6, 0.2, 1, 0.65, 0.85);
  k.add(new THREE.DodecahedronGeometry(1, 0), '#8a847b', 0.7, 0.15, 0.3, 0.8, 0.1, 0.5, 0.5, 0.35, 0.45);
  return k.build().children[0].geometry;
}

// ------------------------------------------------------------------ flowers & grass
function flowerMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms, seasonUniforms);
    sh.vertexShader = `attribute vec4 aFlower; uniform float uWindTime, uWindStrength; uniform vec2 uWindDir; uniform vec4 uSeasonW;
      varying vec3 vPetal; varying float vPet;\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vPetal = aFlower.yzw;
       vPet = smoothstep(0.45, 0.7, color.b);
       vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       // bloom depends on season; each flower has its own threshold
       float bloom = uSeasonW.x * 1.0 + uSeasonW.y * 0.9 + uSeasonW.z * 0.35;
       if (vPet > 0.5 && fract(aFlower.x * 3.7) > bloom) transformed *= 0.0;
       if (uSeasonW.w > 0.6) transformed.y *= 0.35;
       float ph = uWindTime * 2.3 - dot(ip.xz, uWindDir) * 0.11 + aFlower.x * 6.0;
       float bend = position.y * position.y * (0.08 + 0.22 * uWindStrength);
       transformed.xz += uWindDir * (sin(ph) * 0.5 + 0.6) * bend;`,
    );
    sh.fragmentShader = 'uniform vec4 uSeasonW; varying vec3 vPetal; varying float vPet;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       {
         vec3 c = diffuseColor.rgb;
         // stems & blades follow the season: lush, sunny, golden, straw
         vec3 g = c * (uSeasonW.x * vec3(0.95, 1.12, 0.85) + uSeasonW.y + uSeasonW.z * vec3(1.45, 1.05, 0.45) + uSeasonW.w * vec3(1.3, 1.15, 0.85));
         diffuseColor.rgb = mix(g, vPetal * (0.8 + 0.25 * c.r), vPet);
       }`,
    );
  };
  m.customProgramCacheKey = () => 'flower';
  return m;
}

function grassTuft(k) {
  // a soft, low clump rather than spiky blades
  k.add(new THREE.ConeGeometry(0.22, 0.32, 5, 1, true), '#7cbc4c', 0, 0.15, 0, 0, 0, 0, 1, 1, 1);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    k.add(new THREE.ConeGeometry(0.07, 0.42 + (i % 2) * 0.1, 3, 1, true), '#86c455', Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
  }
}
function heads(k, n, shape, y0, sy) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 0.16 + (i % 3) * 0.13;
    k.add(shape, W, Math.cos(a) * r, y0 + (i % 2) * 0.08, Math.sin(a) * r, 0, a, 0, 0.09, sy, 0.09);
  }
}
const OCTA = new THREE.OctahedronGeometry(1, 0);
const CONE4 = new THREE.ConeGeometry(1, 1, 4, 1, true);
function daisies(k) {
  grassTuft(k);
  heads(k, 6, OCTA, 0.45, 0.03);
}
function spikes(k) {
  grassTuft(k);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7, r = 0.15 + (i % 2) * 0.12;
    k.add(CONE4, W, Math.cos(a) * r, 0.6, Math.sin(a) * r, 0, a, 0, 0.07, 0.36, 0.07);
  }
}
function cups(k) {
  grassTuft(k);
  heads(k, 5, OCTA, 0.5, 0.07);
}

const FLOWER_COLORS = {
  daisies: ['#ffffff', '#fff6d0', '#f6d23a', '#f2a7c3'],
  spikes: ['#8b6fd6', '#b58be6', '#f2f2f2', '#e97ab0', '#6f86e6'],
  cups: ['#e23b2e', '#f06a3a', '#f4c13a', '#e85d8a', '#ffffff'],
};

const CELL = 24;
const FCELL = 12;
const ck = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

export class Scenery {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.group = new THREE.Group();
    this.group.name = 'scenery';
    this.items = [];
    this.grid = new Map();
    this.removed = new Set();
    this.nearC = { x: 1e9, z: 1e9, r: 0 };
    this.flowerCells = new Map();
    this.nearFlower = { x: 1e9, z: 1e9 };
  }

  forestAt(x, z) {
    const m = this.terrain.moistureAt(x, z);
    return smoothstep(0.48, 0.64, m + this.terrain.noise2.noise(x * 0.02, z * 0.02) * 0.14);
  }

  generate(avoid) {
    const t = this.terrain;
    const rng = new Rng(t.seed * 17 + 3);
    const n = t.noise2;
    this.avoid = avoid;
    const step = 2.0;
    for (let z = -HALF + 4; z < HALF - 4; z += step) {
      for (let x = -HALF + 4; x < HALF - 4; x += step) {
        const px = x + rng.float(-0.95, 0.95), pz = z + rng.float(-0.95, 0.95);
        const r = rng.next();
        const k = rng.next();
        const h = t.heightAt(px, pz);
        if (h < 0.9) continue;
        const slope = t.slopeAt(px, pz);
        const forest = this.forestAt(px, pz);
        let sp = null;
        if (h > 31) { if (r < 0.03) sp = 'rock'; }
        else if (slope > 1.1) { if (r < 0.1) sp = 'rock'; }
        else if (h > 14) {
          if (r < 0.12 + forest * 0.6) sp = k < 0.55 ? SP.CEDAR : k < 0.9 ? SP.PINE : SP.MAPLE;
          else if (r < 0.17 + forest * 0.6) sp = 'rock';
        } else if (r < forest * 0.85) {
          const bamboo = n.noise(px * 0.035 + 30, pz * 0.035);
          if (bamboo > 0.55) sp = SP.BAMBOO;
          else {
            const patch = n.noise(px * 0.025 - 9, pz * 0.025 + 4);
            sp = patch > 0.45 ? (k < 0.6 ? SP.MAPLE : SP.GINKGO)
              : k < 0.35 ? SP.OAK : k < 0.55 ? SP.CEDAR : k < 0.68 ? SP.MAPLE : k < 0.78 ? SP.CHERRY : k < 0.86 ? SP.GINKGO : k < 0.94 ? SP.PINE : SP.HYDRANGEA;
          }
        } else if (h < 2.2 && r < 0.05) {
          sp = SP.PINE; // coastal pines
        } else if (r < forest * 0.85 + 0.028) {
          sp = k < 0.4 ? SP.CHERRY : k < 0.6 ? SP.OAK : k < 0.75 ? SP.PINE : k < 0.88 ? SP.HYDRANGEA : SP.MAPLE;
        } else if (h < 1.6 && r < 0.07) sp = 'rock';
        if (sp === null) continue;
        if (avoid && avoid(px, pz)) continue;
        this.addItem(sp, px, pz, rng);
      }
    }
    this.buildNearMeshes();
    this.buildFar();
  }

  addItem(sp, x, z, rng) {
    const rock = sp === 'rock';
    const s = rock ? rng.float(0.5, 1.6) : sp === SP.HYDRANGEA ? rng.float(0.8, 1.2) : rng.float(0.8, 1.35);
    const it = { id: this.items.length, sp, x, z, s, r: rng.float(0, Math.PI * 2), seed: rng.next(), hidden: false, fi: -1 };
    this.items.push(it);
    const key = ck(Math.floor(x / CELL), Math.floor(z / CELL));
    let cell = this.grid.get(key);
    if (!cell) this.grid.set(key, (cell = []));
    cell.push(it);
    return it;
  }

  // Add a tree after generation (town gardens, shrine groves). Call buildFar() after.
  plant(sp, x, z, s = 1) {
    const rng = this.plantRng || (this.plantRng = new Rng(this.terrain.seed * 3 + 1));
    const it = this.addItem(sp, x, z, rng);
    it.s = s * rng.float(0.9, 1.15);
    return it;
  }

  matrixFor(it, out) {
    const y = this.terrain.heightAt(it.x, it.z) - 0.05;
    const s = it.hidden ? 0 : it.s;
    return out.compose(V.set(it.x, y, it.z), Q.setFromAxisAngle(UP, it.r), S.set(s, s * (it.sp === 'rock' ? 0.8 : 1), s));
  }

  buildFar() {
    if (this.far) { this.group.remove(this.far); this.far.geometry.dispose(); this.far.dispose(); }
    const trees = this.items.filter((i) => i.sp !== 'rock' && i.sp !== SP.HYDRANGEA);
    const mesh = new THREE.InstancedMesh(farGeo(), this.farMat || (this.farMat = treeMaterial('FAR')), Math.max(1, trees.length));
    const attr = new Float32Array(Math.max(1, trees.length) * 2);
    trees.forEach((it, i) => {
      it.fi = i;
      mesh.setMatrixAt(i, this.matrixFor(it, M));
      attr[i * 2] = it.seed;
      attr[i * 2 + 1] = it.sp;
    });
    mesh.geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(attr, 2));
    mesh.count = trees.length;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.far = mesh;
    this.group.add(mesh);
  }

  buildNearMeshes() {
    const cap = 7000;
    this.nearMeshes = {};
    const mat = treeMaterial('NEAR');
    for (const sp of Object.values(SP)) {
      const geo = geoFrom(MODELS[sp]);
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.nearMeshes[sp] = m;
      this.group.add(m);
    }
    const rock = new THREE.InstancedMesh(rockGeo(), new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() }), 3000);
    rock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rock.count = 0;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.frustumCulled = false;
    this.nearMeshes.rock = rock;
    this.group.add(rock);

    const fm = flowerMaterial();
    this.flowerMeshes = {};
    const fcap = 9000;
    for (const [name, fn] of [['grass', grassTuft], ['daisies', daisies], ['spikes', spikes], ['cups', cups]]) {
      const m = new THREE.InstancedMesh(geoFrom(fn), fm, fcap);
      m.geometry.setAttribute('aFlower', new THREE.InstancedBufferAttribute(new Float32Array(fcap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      this.flowerMeshes[name] = m;
      this.group.add(m);
    }
  }

  forEachCell(x, z, r, cellSize, map, fn) {
    const c0x = Math.floor((x - r) / cellSize), c1x = Math.floor((x + r) / cellSize);
    const c0z = Math.floor((z - r) / cellSize), c1z = Math.floor((z + r) / cellSize);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) fn(cx, cz, map ? map.get(ck(cx, cz)) : null);
  }

  near(x, z, r, fn) {
    this.forEachCell(x, z, r, CELL, this.grid, (cx, cz, cell) => { if (cell) for (const it of cell) fn(it); });
  }

  // Refill the detailed instances around the camera target (a few thousand).
  refreshNear(cx, cz, R) {
    const counts = this._counts || (this._counts = {});
    for (const k of Object.keys(this.nearMeshes)) counts[k] = 0;
    const R2 = (R + 6) * (R + 6);
    this.near(cx, cz, R + 6, (it) => {
      if (it.hidden) return;
      const dx = it.x - cx, dz = it.z - cz;
      if (dx * dx + dz * dz > R2) return;
      const key = it.sp === 'rock' ? 'rock' : it.sp;
      const m = this.nearMeshes[key];
      const i = counts[key];
      if (i >= m.instanceMatrix.count) return;
      m.setMatrixAt(i, this.matrixFor(it, M));
      if (key !== 'rock') {
        const a = m.geometry.attributes.aTree.array;
        a[i * 2] = it.seed;
        a[i * 2 + 1] = it.sp;
      }
      counts[key] = i + 1;
    });
    for (const k of Object.keys(this.nearMeshes)) {
      const m = this.nearMeshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.geometry.attributes.aTree) m.geometry.attributes.aTree.needsUpdate = true;
    }
    this.nearC = { x: cx, z: cz, r: R };
    natureUniforms.uNearC.value.set(cx, cz);
    natureUniforms.uNearR.value = R;
  }

  // ------------------------------------------------------------- flowers
  flowerCell(cx, cz) {
    const key = ck(cx, cz);
    let list = this.flowerCells.get(key);
    if (list) return list;
    list = [];
    const t = this.terrain;
    const protect = this.game.rail?.protect;
    const n = t.noise;
    for (let i = 0; i < 26; i++) {
      const x = (cx + hash2(cx * 31 + i, cz, 11)) * FCELL, z = (cz + hash2(cx, cz * 17 + i, 23)) * FCELL;
      if (!t.inBounds(x, z, 2)) continue;
      const h = t.heightAt(x, z);
      if (h < 1.0 || h > 18) continue;
      if (t.slopeAt(x, z) > 0.45) continue;
      const k = t.idx(Math.round(x + HALF), Math.round(z + HALF));
      if (t.disturb[k] > 0.05 || (protect && protect[k])) continue;
      const forest = this.forestAt(x, z);
      const meadow = 0.5 + 0.5 * n.noise(x * 0.03 + 50, z * 0.03);
      const r = hash2(Math.round(x * 13), Math.round(z * 7), 5);
      if (forest > 0.6 && r > 0.25) continue;
      if (this.avoid && this.avoid(x, z, true)) continue;
      let type = 'grass';
      if (r < meadow * 0.75) {
        const pick = n.noise(x * 0.05 - 20, z * 0.05 + 7);
        type = pick < -0.25 ? 'cups' : pick < 0.25 ? 'daisies' : 'spikes';
      }
      const palette = FLOWER_COLORS[type];
      const patch = n.noise(x * 0.07 + 3, z * 0.07 - 3);
      const col = palette ? palette[Math.floor((patch * 0.5 + 0.5) * palette.length * 0.999 + r * 1.5) % palette.length] : '#ffffff';
      list.push({ type, x, z, y: h - 0.03, s: 0.8 + r * 0.6, r: r * 6.28, seed: r, col: new THREE.Color(col) });
    }
    this.flowerCells.set(key, list);
    return list;
  }

  refreshFlowers(cx, cz, R) {
    const counts = { grass: 0, daisies: 0, spikes: 0, cups: 0 };
    const R2 = R * R;
    this.forEachCell(cx, cz, R, FCELL, null, (gx, gz) => {
      for (const f of this.flowerCell(gx, gz)) {
        const dx = f.x - cx, dz = f.z - cz;
        if (dx * dx + dz * dz > R2) continue;
        const m = this.flowerMeshes[f.type];
        const i = counts[f.type];
        if (i >= m.instanceMatrix.count) continue;
        M.compose(V.set(f.x, f.y, f.z), Q.setFromAxisAngle(UP, f.r), S.set(f.s, f.s, f.s));
        m.setMatrixAt(i, M);
        const a = m.geometry.attributes.aFlower.array;
        a[i * 4] = f.seed; a[i * 4 + 1] = f.col.r; a[i * 4 + 2] = f.col.g; a[i * 4 + 3] = f.col.b;
        counts[f.type] = i + 1;
      }
    });
    for (const k of Object.keys(this.flowerMeshes)) {
      const m = this.flowerMeshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      m.geometry.attributes.aFlower.needsUpdate = true;
    }
    this.nearFlower = { x: cx, z: cz };
  }

  // Called every frame: re-centre the detailed zones when the view has moved.
  updateView(target, zoom) {
    const R = clamp(zoom * 0.8, 55, 115);
    const n = this.nearC;
    if (this.forceNear || Math.hypot(target.x - n.x, target.z - n.z) > 14 || Math.abs(R - n.r) > n.r * 0.2) {
      this.forceNear = false;
      this.refreshNear(target.x, target.z, R);
    }
    const showFlowers = zoom < 180;
    for (const k in this.flowerMeshes) this.flowerMeshes[k].visible = showFlowers;
    if (showFlowers && (this.forceFlowers || Math.hypot(target.x - this.nearFlower.x, target.z - this.nearFlower.z) > 8)) {
      this.forceFlowers = false;
      this.refreshFlowers(target.x, target.z, clamp(zoom * 0.8, 45, 85));
    }
  }

  // Hide scenery near a polyline [x,y,z,...]; re-seat what's left on the ground.
  clearAlong(pts, radius) {
    const n = pts.length / 3;
    let farDirty = false;
    for (let i = 0; i < n; i += 2) {
      const x = pts[i * 3], z = pts[i * 3 + 2];
      this.near(x, z, radius + 4, (it) => {
        if (it.hidden) return;
        const reach = it.sp === 'rock' ? it.s * 0.8 : it.sp === SP.HYDRANGEA ? 0.8 * it.s : it.sp === SP.BAMBOO ? 0.7 : 1.15 * it.s;
        if (Math.hypot(it.x - x, it.z - z) < radius + reach) {
          it.hidden = true;
          this.removed.add(it.id);
          if (it.fi >= 0 && this.far) { this.far.setMatrixAt(it.fi, this.matrixFor(it, M)); farDirty = true; }
        }
      });
    }
    if (n && this.far) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) { x0 = Math.min(x0, pts[i * 3]); x1 = Math.max(x1, pts[i * 3]); z0 = Math.min(z0, pts[i * 3 + 2]); z1 = Math.max(z1, pts[i * 3 + 2]); }
      this.near((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 12, (it) => {
        if (it.fi >= 0 && !it.hidden) { this.far.setMatrixAt(it.fi, this.matrixFor(it, M)); farDirty = true; }
      });
      for (const key of [...this.flowerCells.keys()]) {
        const gx = Math.floor(key / 4096);
        const fx = (gx - 2048) * FCELL;
        const fz = (key - gx * 4096 - 2048) * FCELL;
        if (fx > x0 - 40 && fx < x1 + 40 && fz > z0 - 40 && fz < z1 + 40) this.flowerCells.delete(key);
      }
    }
    if (farDirty) this.far.instanceMatrix.needsUpdate = true;
    this.forceNear = true;
    this.forceFlowers = true;
    this.game.towns?.clearAlong(pts, radius);
  }

  treeDensityAt(x, z, r) {
    let c = 0;
    this.near(x, z, r, (it) => {
      if (!it.hidden && it.sp !== 'rock' && Math.hypot(it.x - x, it.z - z) < r) c++;
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
      it.hidden = this.removed.has(it.id);
      if (it.fi >= 0) this.far.setMatrixAt(it.fi, this.matrixFor(it, M));
    }
    this.far.instanceMatrix.needsUpdate = true;
    this.flowerCells.clear();
    this.forceNear = true;
    this.forceFlowers = true;
    if (s.towns) this.game.towns?.restore(s.towns);
  }

  update() {}
}

const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export { clamp, WATER };
