import * as THREE from 'three';
import { Simplex } from '../core/noise.js';
import { Rng, clamp, lerp, smoothstep } from '../core/rng.js';
import { toonGradient } from '../render/materials.js';

export const WORLD_SIZE = 1024;
export const HALF = WORLD_SIZE / 2;
export const RES = 1; // world units per grid cell
export const N = WORLD_SIZE / RES; // cells per side
export const VN = N + 1; // vertices per side
export const WATER = 0;
const CHUNK = 128; // cells per chunk side
const CHUNKS = N / CHUNK;
const F = WORLD_SIZE / 400; // detail noise scale relative to the original island
const SKIRT = 4;

const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();

// Seasonal ground tint shared by all chunks.
export const groundUniforms = {
  uSnow: { value: 0 },
  uAutumn: { value: 0 },
  uSpring: { value: 0 },
};

function terrainMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms);
    sh.vertexShader = 'varying vec3 vWP;\nvarying float vNY;\n' + sh.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vNY = normalize(mat3(modelMatrix) * objectNormal).y;`,
    );
    sh.fragmentShader = 'uniform float uSnow, uAutumn, uSpring;\nvarying vec3 vWP;\nvarying float vNY;\n' +
      `float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
       float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
         return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }\n` +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 c = diffuseColor.rgb;
           float green = clamp((c.g - max(c.r, c.b)) * 6.0, 0.0, 1.0);
           float above = smoothstep(0.4, 1.0, vWP.y);
           float n = gn(vWP.xz * 0.08) * 0.6 + gn(vWP.xz * 0.5) * 0.4;
           // autumn: meadows turn golden and russet in drifting patches
           vec3 aut = c * mix(vec3(1.35, 1.0, 0.45), vec3(1.25, 0.72, 0.38), smoothstep(0.4, 0.8, n));
           c = mix(c, aut, uAutumn * green * above * 0.85);
           // spring: fresher, lighter green
           c = mix(c, c * vec3(0.95, 1.12, 0.85), uSpring * green * above * 0.6);
           // winter: snow settles on flat ground
           float snow = uSnow * smoothstep(0.72, 0.92, vNY + (n - 0.5) * 0.25) * above;
           c = mix(c, vec3(0.93, 0.95, 1.0), clamp(snow, 0.0, 0.95));
           diffuseColor.rgb = c;
         }`,
      );
  };
  return m;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

// Shared index buffers per LOD step (grid + skirt ring).
const indexCache = new Map();
function lodIndex(step) {
  let idx = indexCache.get(step);
  if (idx) return idx;
  const n = CHUNK / step; // cells per side
  const vn = n + 1;
  const arr = [];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = z * vn + x, b = a + 1, c = a + vn, d = c + 1;
      if ((x + z) & 1) arr.push(a, c, b, b, c, d);
      else arr.push(a, c, d, a, d, b);
    }
  }
  // skirt: a ring of vertices below the border, stitched to it
  const base = vn * vn;
  const ring = [];
  for (let x = 0; x < vn; x++) ring.push(x); // top row (z=0)
  for (let z = 1; z < vn; z++) ring.push(z * vn + n); // right column
  for (let x = n - 1; x >= 0; x--) ring.push(n * vn + x); // bottom row
  for (let z = n - 1; z >= 1; z--) ring.push(z * vn); // left column
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const sa = base + i, sb = base + ((i + 1) % ring.length);
    arr.push(a, b, sa, b, sb, sa);
    arr.push(a, sa, b, b, sa, sb); // both faces so it hides cracks from any side
  }
  idx = { index: new THREE.BufferAttribute(new Uint32Array(arr), 1), ring, vn };
  indexCache.set(step, idx);
  return idx;
}

export class Terrain {
  constructor(seed, defer = false) {
    this.seed = seed;
    this.noise = new Simplex(seed);
    this.noise2 = new Simplex(seed * 7 + 3);
    this.h = new Float32Array(VN * VN);
    this.moist = new Float32Array(VN * VN);
    this.disturb = new Float32Array(VN * VN); // 0..1 earthworks tint
    this.col = new Float32Array(VN * VN * 3);
    this.rivers = [];
    this.lakes = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.painters = [];
    this.generate();
    this.buildWaterDepthTexture();
    if (!defer) this.finish();
  }

  // Colour the land (after towns have registered their painters) and build meshes.
  finish() {
    this.recolor(0, 0, N, N);
    this.buildMeshes();
  }

  idx(ix, iz) {
    return iz * VN + ix;
  }

  generate() {
    const rng = new Rng(this.seed * 31 + 7);
    const n = this.noise, n2 = this.noise2;

    // Two mountain ranges.
    const ranges = [];
    const ang0 = rng.float(0, Math.PI * 2);
    for (let r = 0; r < 2; r++) {
      const ang = ang0 + r * rng.float(2.0, 3.6);
      const dir = [Math.cos(ang), Math.sin(ang)];
      const perp = [-dir[1], dir[0]];
      const d = r === 0 ? 0.5 : rng.float(0.35, 0.55);
      const mc = [dir[0] * d, dir[1] * d];
      const len = rng.float(0.22, 0.4) * (r === 0 ? 1.2 : 0.8);
      ranges.push({ dir, mc, a: [mc[0] + perp[0] * len, mc[1] + perp[1] * len], b: [mc[0] - perp[0] * len, mc[1] - perp[1] * len], w: r === 0 ? 0.3 : 0.2, hgt: r === 0 ? 1 : 0.75 });
    }
    this.ranges = ranges;

    const lakes = [];
    for (let tries = 0; tries < 200 && lakes.length < 8; tries++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0.05, 0.62);
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      if (ranges.some((R) => distToSeg(lx, lz, R.a[0], R.a[1], R.b[0], R.b[1]) < R.w + 0.06)) continue;
      const rad = rng.float(0.03, 0.065);
      if (lakes.some((l) => Math.hypot(l.x - lx, l.z - lz) < l.r + rad + 0.08)) continue;
      lakes.push({ x: lx, z: lz, r: rad });
    }
    this.lakes = lakes.map((l) => ({ x: l.x * HALF, z: l.z * HALF, r: l.r * HALF }));

    const h = this.h;
    for (let iz = 0; iz < VN; iz++) {
      for (let ix = 0; ix < VN; ix++) {
        const x = -HALF + ix * RES, z = -HALF + iz * RES;
        const nx = x / HALF, nz = z / HALF;
        const wx = nx + 0.1 * n.fbm(nx * 1.7 + 11.3, nz * 1.7 - 4.1, 3);
        const wz = nz + 0.1 * n.fbm(nx * 1.7 - 7.7, nz * 1.7 + 2.9, 3);

        // island mask: a squircle with bays and headlands
        const sq = Math.pow(Math.pow(Math.abs(wx), 4) + Math.pow(Math.abs(wz), 4), 0.25);
        const r = lerp(Math.hypot(wx, wz), sq, 0.55) + 0.09 * n.fbm(nx * 3.1, nz * 3.1, 3) + 0.035 * n2.noise(nx * 9, nz * 9);
        const coast = 1 - smoothstep(0.74, 0.95, r);

        const dx = wx * F, dz = wz * F;
        let e = 2.4 + 3.2 * (0.5 + 0.5 * n.fbm(dx * 2.4, dz * 2.4, 5));
        const hillMask = smoothstep(0.05, 0.55, n2.fbm(dx * 1.4 + 5, dz * 1.4 - 3, 3));
        e += hillMask * (5 + 9 * (0.5 + 0.5 * n.fbm(dx * 4.2 - 2, dz * 4.2 + 8, 3)));

        for (const R of ranges) {
          const dr = distToSeg(wx, wz, R.a[0], R.a[1], R.b[0], R.b[1]) + 0.06 * n2.fbm(dx * 2.5, dz * 2.5, 2);
          const mm = smoothstep(R.w, 0.02, dr);
          if (mm > 0) e += mm * R.hgt * (5 + 46 * n.ridged(dx * 1.2 + 3.3, dz * 1.2 - 1.7, 4) * (0.55 + 0.45 * mm));
        }

        for (const l of lakes) {
          const ddx = wx - l.x, ddz = wz - l.z;
          if (Math.abs(ddx) > l.r * 1.6 || Math.abs(ddz) > l.r * 1.6) continue;
          const d = Math.hypot(ddx, ddz) / l.r + 0.25 * n2.fbm(dx * 6, dz * 6, 2);
          const k = smoothstep(1.25, 0.55, d);
          if (k > 0) e = lerp(e, -2.2, k);
        }

        e = lerp(-7, e, coast);
        if (e > 0 && e < 2.5) e = 2.5 * Math.pow(e / 2.5, 1.35);
        h[iz * VN + ix] = e;
        this.moist[iz * VN + ix] = 0.5 + 0.5 * n2.fbm(nx * 3.3 * F * 0.6 + 40, nz * 3.3 * F * 0.6 - 12, 4);
      }
    }

    this.smoothHighlands();
    for (let i = 0; i < 3; i++) {
      const R = ranges[i % ranges.length];
      this.carveRiver(rng, R.mc, R.dir, i);
    }
    this.original = new Float32Array(h);
  }

  smoothHighlands() {
    const h = this.h;
    for (let pass = 0; pass < 2; pass++) {
      const src = new Float32Array(h);
      for (let iz = 1; iz < N; iz++) {
        for (let ix = 1; ix < N; ix++) {
          const k = iz * VN + ix;
          if (src[k] < 6) continue;
          const avg = (src[k - 1] + src[k + 1] + src[k - VN] + src[k + VN] + src[k] * 4) / 8;
          h[k] = lerp(src[k], avg, clamp((src[k] - 6) / 10, 0, 1));
        }
      }
    }
  }

  carveRiver(rng, mc, dir, i) {
    let x = mc[0] * HALF * 0.55, z = mc[1] * HALF * 0.55;
    const perp = [-dir[1], dir[0]];
    const side = (i - 1) * 0.35;
    x += perp[0] * side * HALF; z += perp[1] * side * HALF;
    let a = Math.atan2(-dir[1], -dir[0]) + rng.float(-0.8, 0.8);
    const pts = [];
    for (let k = 0; k < 900; k++) {
      pts.push([x, z]);
      a += this.noise2.noise(k * 0.04 + i * 17, 3.7) * 0.08;
      x += Math.cos(a) * 2;
      z += Math.sin(a) * 2;
      if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) break;
      if (k > 20 && this.heightAt(x, z) < -3) break;
    }
    if (pts.length < 30) return;
    this.rivers.push(pts);
    const h = this.h;
    const total = pts.length;
    pts.forEach(([px, pz], j) => {
      const t = j / total;
      const w = 1.8 + t * 3.2;
      const R = w + 18;
      const ix0 = Math.max(0, Math.floor((px - R + HALF) / RES)), ix1 = Math.min(N, Math.ceil((px + R + HALF) / RES));
      const iz0 = Math.max(0, Math.floor((pz - R + HALF) / RES)), iz1 = Math.min(N, Math.ceil((pz + R + HALF) / RES));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const vx = -HALF + ix * RES, vz = -HALF + iz * RES;
          const d = Math.hypot(vx - px, vz - pz);
          if (d > R) continue;
          const k = iz * VN + ix;
          let target;
          if (d < w) target = -1.6 + (d / w) * 0.8;
          else target = -0.8 + (d - w) * 0.55 + Math.pow(Math.max(0, d - w - 4), 1.4) * 0.08;
          if (target < h[k]) h[k] = target;
        }
      }
    });
  }

  get river() {
    return this.rivers[0] || [];
  }

  heightAt(x, z) {
    const fx = clamp((x + HALF) / RES, 0, N - 1e-4);
    const fz = clamp((z + HALF) / RES, 0, N - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h = this.h;
    const k = iz * VN + ix;
    const a = h[k], b = h[k + 1];
    const c = h[k + VN], d = h[k + VN + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  groundAt(x, z) {
    const g = this.heightAt(x, z);
    return g > WATER ? g : WATER;
  }

  slopeAt(x, z) {
    const dx = this.heightAt(x + 1, z) - this.heightAt(x - 1, z);
    const dz = this.heightAt(x, z + 1) - this.heightAt(x, z - 1);
    return Math.hypot(dx, dz) / 2;
  }

  moistureAt(x, z) {
    const ix = clamp(Math.round((x + HALF) / RES), 0, N), iz = clamp(Math.round((z + HALF) / RES), 0, N);
    return this.moist[iz * VN + ix];
  }

  inBounds(x, z, margin = 0) {
    return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin;
  }

  // ---------- colouring ----------
  addPainter(p) {
    // p: { x0, z0, x1, z1, fn(x, z, out) }
    this.painters.push(p);
  }

  colorAt(ix, iz, out) {
    const k = iz * VN + ix;
    const e = this.h[k];
    const x = -HALF + ix * RES, z = -HALF + iz * RES;
    const n = this.noise;
    const m = this.moist[k];
    const gx = Math.min(ix + 1, N), gz = Math.min(iz + 1, N), lx = Math.max(ix - 1, 0), lz = Math.max(iz - 1, 0);
    const slope = Math.hypot(this.h[iz * VN + gx] - this.h[iz * VN + lx], this.h[gz * VN + ix] - this.h[lz * VN + ix]) / (2 * RES);
    const brush = n.noise(x * 0.09 + z * 0.02, z * 0.35) * 0.5 + n.noise(x * 0.4, z * 0.4) * 0.5;

    if (e < 0.55 + brush * 0.25) {
      out.setRGB(0.91, 0.83, 0.6);
      if (e < -0.5) out.lerp(tmpC.setRGB(0.62, 0.66, 0.52), clamp(-e / 4, 0, 1));
    } else {
      // Ghibli meadows: saturated, sunlit greens with buttery dry patches
      const dry = tmpC.setRGB(0.78, 0.8, 0.42);
      out.setRGB(0.48, 0.72, 0.3).lerp(dry, clamp((0.45 - m) * 2.5, 0, 1));
      out.lerp(tmpC.setRGB(0.27, 0.52, 0.25), clamp((m - 0.58) * 3, 0, 0.85));
      const rocky = clamp((slope - 0.8) * 2.0, 0, 1) + clamp((e - 22) / 10, 0, 1) * 0.7;
      out.lerp(tmpC.setRGB(0.58, 0.55, 0.5), clamp(rocky, 0, 1));
      if (e > 26) out.lerp(tmpC.setRGB(0.5, 0.49, 0.52), clamp((e - 26) / 8, 0, 0.6));
      const snowLine = 31 + brush * 4;
      if (e > snowLine && slope < 1.3) out.lerp(tmpC.setRGB(0.96, 0.97, 1.0), smoothstep(snowLine, snowLine + 2.5, e));
      for (const p of this.painters) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) p.fn(x, z, out, e);
    }
    const d = this.disturb[k];
    if (d > 0) out.lerp(tmpC.setRGB(0.6, 0.53, 0.38), d * 0.75);
    const v = 1 + brush * 0.07;
    out.r *= v; out.g *= v; out.b *= v;
    return out.convertSRGBToLinear();
  }

  recolor(ix0, iz0, ix1, iz1) {
    const col = this.col;
    for (let iz = Math.max(0, iz0); iz <= Math.min(N, iz1); iz++) {
      for (let ix = Math.max(0, ix0); ix <= Math.min(N, ix1); ix++) {
        this.colorAt(ix, iz, tmpC2);
        const k = (iz * VN + ix) * 3;
        col[k] = tmpC2.r; col[k + 1] = tmpC2.g; col[k + 2] = tmpC2.b;
      }
    }
  }

  // ---------- meshes (chunked LOD with skirts) ----------
  buildMeshes() {
    this.material = terrainMaterial();
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        const c = { cx, cz, mesh, step: 0, geos: new Map(), dirty: new Set() };
        const x0 = -HALF + cx * CHUNK * RES, z0 = -HALF + cz * CHUNK * RES;
        c.center = new THREE.Vector3(x0 + (CHUNK * RES) / 2, 0, z0 + (CHUNK * RES) / 2);
        mesh.userData.chunk = c;
        this.group.add(mesh);
        this.chunks.push(c);
        this.setLod(c, 8);
      }
    }
  }

  buildGeo(c, step) {
    const { index, ring, vn } = lodIndex(step);
    const total = vn * vn + ring.length;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    const h = this.h, cc = this.col;
    let i = 0;
    for (let z = 0; z < vn; z++) {
      for (let x = 0; x < vn; x++, i += 3) {
        const ix = c.cx * CHUNK + x * step, iz = c.cz * CHUNK + z * step;
        const k = iz * VN + ix;
        pos[i] = -HALF + ix * RES;
        pos[i + 1] = h[k];
        pos[i + 2] = -HALF + iz * RES;
        const s = Math.max(1, step >> 1);
        const hl = h[iz * VN + Math.max(ix - s, 0)], hr = h[iz * VN + Math.min(ix + s, N)];
        const hd = h[Math.max(iz - s, 0) * VN + ix], hu = h[Math.min(iz + s, N) * VN + ix];
        const nx = hl - hr, ny = 2 * RES * s, nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l;
        col[i] = cc[k * 3]; col[i + 1] = cc[k * 3 + 1]; col[i + 2] = cc[k * 3 + 2];
      }
    }
    for (let r = 0; r < ring.length; r++, i += 3) {
      const j = ring[r] * 3;
      pos[i] = pos[j]; pos[i + 1] = pos[j + 1] - SKIRT * step; pos[i + 2] = pos[j + 2];
      nor[i] = nor[j]; nor[i + 1] = nor[j + 1]; nor[i + 2] = nor[j + 2];
      col[i] = col[j]; col[i + 1] = col[j + 1]; col[i + 2] = col[j + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(index);
    g.computeBoundingSphere();
    g.boundingSphere.radius += 2;
    return g;
  }

  setLod(c, step) {
    let g = c.geos.get(step);
    if (!g || c.dirty.has(step)) {
      if (g) g.dispose();
      g = this.buildGeo(c, step);
      c.geos.set(step, g);
      c.dirty.delete(step);
    }
    c.mesh.geometry = g;
    c.step = step;
  }

  // Pick a detail level per chunk from camera distance (a couple per frame).
  updateLod(camera, budget = 2) {
    const p = camera.position;
    let jobs = [];
    for (const c of this.chunks) {
      const dx = Math.max(0, Math.abs(p.x - c.center.x) - CHUNK / 2);
      const dz = Math.max(0, Math.abs(p.z - c.center.z) - CHUNK / 2);
      const d = Math.hypot(dx, dz, Math.max(0, p.y - 20) * 0.6);
      const want = d < 110 ? 1 : d < 260 ? 2 : d < 520 ? 4 : 8;
      if (want !== c.step || c.dirty.has(c.step)) jobs.push({ c, want, d });
    }
    if (!jobs.length) return;
    jobs.sort((a, b) => a.d - b.d);
    jobs = jobs.slice(0, budget);
    for (const j of jobs) this.setLod(j.c, j.want);
  }

  markDirty(ix0, iz0, ix1, iz1) {
    this.recolor(ix0 - 1, iz0 - 1, ix1 + 1, iz1 + 1);
    const c0x = clamp(Math.floor((ix0 - 2) / CHUNK), 0, CHUNKS - 1), c1x = clamp(Math.floor((ix1 + 2) / CHUNK), 0, CHUNKS - 1);
    const c0z = clamp(Math.floor((iz0 - 2) / CHUNK), 0, CHUNKS - 1), c1z = clamp(Math.floor((iz1 + 2) / CHUNK), 0, CHUNKS - 1);
    for (let z = c0z; z <= c1z; z++) for (let x = c0x; x <= c1x; x++) {
      const c = this.chunks[z * CHUNKS + x];
      for (const s of [1, 2, 4, 8]) c.dirty.add(s);
      this.pending = this.pending || new Set();
      this.pending.add(c);
    }
    this.depthBox = this.depthBox ? [Math.min(this.depthBox[0], ix0), Math.min(this.depthBox[1], iz0), Math.max(this.depthBox[2], ix1), Math.max(this.depthBox[3], iz1)] : [ix0, iz0, ix1, iz1];
  }

  // Apply queued edits immediately to the visible LOD of touched chunks.
  flush() {
    if (this.pending) {
      for (const c of this.pending) this.setLod(c, c.step || 8);
      this.pending = null;
    }
    if (this.depthBox) {
      this.updateWaterDepthTexture(...this.depthBox);
      this.depthBox = null;
    }
  }

  recolorAll() {
    this.recolor(0, 0, N, N);
    for (const c of this.chunks) { for (const s of [1, 2, 4, 8]) c.dirty.add(s); this.setLod(c, c.step || 8); }
  }

  buildWaterDepthTexture() {
    this.depthData = new Uint8Array(VN * VN * 4);
    this.depthTex = new THREE.DataTexture(this.depthData, VN, VN, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.wrapS = this.depthTex.wrapT = THREE.ClampToEdgeWrapping;
    this.updateWaterDepthTexture(0, 0, N, N);
  }

  updateWaterDepthTexture(ix0 = 0, iz0 = 0, ix1 = N, iz1 = N) {
    const d = this.depthData, h = this.h;
    for (let iz = Math.max(0, iz0 - 1); iz <= Math.min(N, iz1 + 1); iz++) {
      for (let ix = Math.max(0, ix0 - 1); ix <= Math.min(N, ix1 + 1); ix++) {
        const i = iz * VN + ix;
        const depth = clamp((WATER - h[i]) / 8, -1, 1);
        d[i * 4] = Math.round(clamp(depth, 0, 1) * 255);
        d[i * 4 + 1] = Math.round(clamp(-depth, 0, 1) * 255);
        d[i * 4 + 3] = 255;
      }
    }
    this.depthTex.needsUpdate = true;
  }

  snapshot() {
    return { h: new Float32Array(this.h), disturb: new Float32Array(this.disturb) };
  }

  restore(s) {
    if (s.h !== this.h) this.h.set(s.h);
    if (s.disturb !== this.disturb) this.disturb.set(s.disturb);
    this.recolor(0, 0, N, N);
    for (const c of this.chunks) {
      for (const s2 of [1, 2, 4, 8]) c.dirty.add(s2);
      this.setLod(c, c.step || 8);
    }
    this.updateWaterDepthTexture(0, 0, N, N);
  }

  raycast(ray, maxDist = 4000) {
    const o = ray.origin, d = ray.direction;
    let t = 0;
    const top = 60;
    if (o.y > top && d.y < 0) t = (o.y - top) / -d.y;
    let prevT = t;
    for (let i = 0; i < 6000 && t < maxDist; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const g = this.inBounds(x, z) ? this.groundAt(x, z) : WATER;
      if (y <= g) {
        let a = prevT, b = t;
        for (let j = 0; j < 12; j++) {
          const m = (a + b) / 2;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          const mg = this.inBounds(mx, mz) ? this.groundAt(mx, mz) : WATER;
          if (my <= mg) b = m; else a = m;
        }
        return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
      }
      prevT = t;
      t += Math.max(0.35, (y - g) * 0.4);
    }
    if (d.y < 0) {
      const tt = (o.y - WATER) / -d.y;
      return new THREE.Vector3(o.x + d.x * tt, WATER, o.z + d.z * tt);
    }
    return null;
  }
}
