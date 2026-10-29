import * as THREE from 'three';
import { Simplex } from '../core/noise.js';
import { Rng, clamp, lerp, smoothstep } from '../core/rng.js';
import { toon } from '../render/materials.js';

export const WORLD_SIZE = 400;
export const HALF = WORLD_SIZE / 2;
export const RES = 1; // world units per grid cell
export const N = WORLD_SIZE / RES; // cells per side
export const VN = N + 1; // vertices per side
export const WATER = 0;
const CHUNK = 50; // cells per chunk side
const CHUNKS = N / CHUNK;

const tmpC = new THREE.Color();

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

export class Terrain {
  constructor(seed) {
    this.seed = seed;
    this.noise = new Simplex(seed);
    this.noise2 = new Simplex(seed * 7 + 3);
    this.h = new Float32Array(VN * VN);
    this.moist = new Float32Array(VN * VN);
    this.disturb = new Float32Array(VN * VN); // 0..1 earthworks tint
    this.river = [];
    this.lakes = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.dirty = new Set();
    this.painters = [];
    this.generate();
    this.buildMeshes();
    this.buildWaterDepthTexture();
  }

  idx(ix, iz) {
    return iz * VN + ix;
  }

  generate() {
    const rng = new Rng(this.seed * 31 + 7);
    const n = this.noise, n2 = this.noise2;

    // A mountain range on one side of the island.
    const ang = rng.float(0, Math.PI * 2);
    const dir = [Math.cos(ang), Math.sin(ang)];
    const perp = [-dir[1], dir[0]];
    const mc = [dir[0] * 0.5, dir[1] * 0.5];
    const rangeLen = rng.float(0.35, 0.5);
    const ra = [mc[0] + perp[0] * rangeLen, mc[1] + perp[1] * rangeLen];
    const rb = [mc[0] - perp[0] * rangeLen, mc[1] - perp[1] * rangeLen];
    this.mountainDir = dir;

    // Lakes in the lowlands, away from the mountains.
    const lakes = [];
    for (let tries = 0; tries < 60 && lakes.length < 3; tries++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0.05, 0.55);
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      if (distToSeg(lx, lz, ra[0], ra[1], rb[0], rb[1]) < 0.35) continue;
      const rad = rng.float(0.07, 0.13);
      if (lakes.some((l) => Math.hypot(l.x - lx, l.z - lz) < l.r + rad + 0.12)) continue;
      lakes.push({ x: lx, z: lz, r: rad });
    }
    this.lakes = lakes.map((l) => ({ x: l.x * HALF, z: l.z * HALF, r: l.r * HALF }));

    const h = this.h;
    for (let iz = 0; iz < VN; iz++) {
      for (let ix = 0; ix < VN; ix++) {
        const x = -HALF + ix * RES, z = -HALF + iz * RES;
        const nx = x / HALF, nz = z / HALF;
        const wx = nx + 0.12 * n.fbm(nx * 1.7 + 11.3, nz * 1.7 - 4.1, 3);
        const wz = nz + 0.12 * n.fbm(nx * 1.7 - 7.7, nz * 1.7 + 2.9, 3);

        // Island mask (squircle so the island fills the square).
        const sq = Math.pow(Math.pow(Math.abs(wx), 4) + Math.pow(Math.abs(wz), 4), 0.25);
        const r = lerp(Math.hypot(wx, wz), sq, 0.55) + 0.1 * n.fbm(nx * 3.1, nz * 3.1, 3);
        const coast = 1 - smoothstep(0.7, 0.93, r);

        let e = 2.4 + 3.2 * (0.5 + 0.5 * n.fbm(wx * 2.4, wz * 2.4, 5));
        const hillMask = smoothstep(0.05, 0.55, n2.fbm(wx * 1.4 + 5, wz * 1.4 - 3, 3));
        e += hillMask * (5 + 9 * (0.5 + 0.5 * n.fbm(wx * 4.2 - 2, wz * 4.2 + 8, 4)));

        const dr = distToSeg(wx, wz, ra[0], ra[1], rb[0], rb[1]) + 0.12 * n2.fbm(wx * 2.5, wz * 2.5, 3);
        const mm = smoothstep(0.42, 0.04, dr);
        e += mm * (5 + 44 * n.ridged(wx * 2.1 + 3.3, wz * 2.1 - 1.7, 4) * (0.55 + 0.45 * mm));

        for (const l of lakes) {
          const d = Math.hypot(wx - l.x, wz - l.z) / l.r + 0.25 * n2.fbm(wx * 6, wz * 6, 2);
          const k = smoothstep(1.25, 0.55, d);
          if (k > 0) e = lerp(e, -2.2, k);
        }

        e = lerp(-7, e, coast);
        // Soft beaches: compress the band just above water.
        if (e > 0 && e < 2.5) e = 2.5 * Math.pow(e / 2.5, 1.35);
        h[this.idx(ix, iz)] = e;

        this.moist[this.idx(ix, iz)] = 0.5 + 0.5 * n2.fbm(nx * 3.3 + 40, nz * 3.3 - 12, 4);
      }
    }

    this.smoothHighlands();
    this.carveRiver(rng, mc, dir);
    this.original = new Float32Array(h);
  }

  // Soften jagged peaks so slopes read as painted shapes rather than spikes.
  smoothHighlands() {
    const h = this.h;
    for (let pass = 0; pass < 2; pass++) {
      const src = new Float32Array(h);
      for (let iz = 1; iz < N; iz++) {
        for (let ix = 1; ix < N; ix++) {
          const k = this.idx(ix, iz);
          if (src[k] < 6) continue;
          const avg = (src[k - 1] + src[k + 1] + src[k - VN] + src[k + VN] + src[k] * 4) / 8;
          h[k] = lerp(src[k], avg, clamp((src[k] - 6) / 10, 0, 1));
        }
      }
    }
  }

  carveRiver(rng, mc, dir) {
    // Start at the foothills and meander away from the range towards the sea.
    let x = mc[0] * HALF * 0.55, z = mc[1] * HALF * 0.55;
    let a = Math.atan2(-dir[1], -dir[0]) + rng.float(-0.7, 0.7);
    const pts = [];
    for (let i = 0; i < 400; i++) {
      pts.push([x, z]);
      a += this.noise2.noise(i * 0.05, 3.7) * 0.09;
      x += Math.cos(a) * 2;
      z += Math.sin(a) * 2;
      if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) break;
      if (i > 20 && this.sampleRaw(x, z) < -3) break;
    }
    this.river = pts;
    const h = this.h;
    const total = pts.length;
    pts.forEach(([px, pz], i) => {
      const t = i / total;
      const w = 1.6 + t * 2.6;
      const R = w + 16;
      const ix0 = Math.max(0, Math.floor((px - R + HALF) / RES)), ix1 = Math.min(N, Math.ceil((px + R + HALF) / RES));
      const iz0 = Math.max(0, Math.floor((pz - R + HALF) / RES)), iz1 = Math.min(N, Math.ceil((pz + R + HALF) / RES));
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const vx = -HALF + ix * RES, vz = -HALF + iz * RES;
          const d = Math.hypot(vx - px, vz - pz);
          if (d > R) continue;
          const k = this.idx(ix, iz);
          let target;
          if (d < w) target = -1.6 + (d / w) * 0.8;
          else target = -0.8 + (d - w) * 0.55 + Math.pow(Math.max(0, d - w - 4), 1.4) * 0.08;
          if (target < h[k]) h[k] = target;
        }
      }
    });
  }

  sampleRaw(x, z) {
    return this.heightAt(x, z);
  }

  heightAt(x, z) {
    const fx = clamp((x + HALF) / RES, 0, N - 1e-4);
    const fz = clamp((z + HALF) / RES, 0, N - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h = this.h;
    const a = h[iz * VN + ix], b = h[iz * VN + ix + 1];
    const c = h[(iz + 1) * VN + ix], d = h[(iz + 1) * VN + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  groundAt(x, z) {
    return Math.max(this.heightAt(x, z), WATER);
  }

  slopeAt(x, z) {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  moistureAt(x, z) {
    const ix = clamp(Math.round((x + HALF) / RES), 0, N), iz = clamp(Math.round((z + HALF) / RES), 0, N);
    return this.moist[this.idx(ix, iz)];
  }

  inBounds(x, z, margin = 0) {
    return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin;
  }

  // ---------- colouring ----------
  colorAt(ix, iz, out) {
    const k = this.idx(ix, iz);
    const e = this.h[k];
    const x = -HALF + ix * RES, z = -HALF + iz * RES;
    const n = this.noise;
    const m = this.moist[k];
    const gx = Math.min(ix + 1, N), gz = Math.min(iz + 1, N), lx = Math.max(ix - 1, 0), lz = Math.max(iz - 1, 0);
    const slope = Math.hypot(this.h[this.idx(gx, iz)] - this.h[this.idx(lx, iz)], this.h[this.idx(ix, gz)] - this.h[this.idx(ix, lz)]) / (2 * RES);
    const brush = n.noise(x * 0.09 + z * 0.02, z * 0.35) * 0.5 + n.noise(x * 0.4, z * 0.4) * 0.5;

    if (e < 0.55 + brush * 0.25) {
      out.setRGB(0.91, 0.83, 0.6); // sand
      if (e < -0.5) out.lerp(tmpC.setRGB(0.62, 0.66, 0.52), clamp(-e / 4, 0, 1));
    } else {
      // grass: dry -> lush by moisture
      const dry = tmpC.setRGB(0.74, 0.76, 0.42);
      out.setRGB(0.47, 0.67, 0.33).lerp(dry, clamp((0.45 - m) * 2.5, 0, 1));
      out.lerp(tmpC.setRGB(0.3, 0.5, 0.27), clamp((m - 0.58) * 3, 0, 0.85));
      // highland meadow fades to rock
      const rocky = clamp((slope - 0.8) * 2.0, 0, 1) + clamp((e - 22) / 10, 0, 1) * 0.7;
      out.lerp(tmpC.setRGB(0.58, 0.55, 0.5), clamp(rocky, 0, 1));
      if (e > 26) out.lerp(tmpC.setRGB(0.5, 0.49, 0.5), clamp((e - 26) / 8, 0, 0.6));
      const snowLine = 31 + brush * 4;
      if (e > snowLine && slope < 1.3) out.lerp(tmpC.setRGB(0.96, 0.97, 1.0), smoothstep(snowLine, snowLine + 2.5, e));
    }
    if (e >= 0.55) for (const p of this.painters) p(x, z, out);
    const d = this.disturb[k];
    if (d > 0) out.lerp(tmpC.setRGB(0.6, 0.53, 0.38), d * 0.75);
    const v = 1 + brush * 0.07;
    out.r *= v; out.g *= v; out.b *= v;
    return out.convertSRGBToLinear();
  }

  // ---------- meshes ----------
  buildMeshes() {
    const mat = toon('#ffffff', { vertexColors: true });
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const vn = CHUNK + 1;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vn * vn * 3), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vn * vn * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vn * vn * 3), 3));
        const idx = [];
        for (let z = 0; z < CHUNK; z++) {
          for (let x = 0; x < CHUNK; x++) {
            const a = z * vn + x, b = a + 1, c = a + vn, d = c + 1;
            // alternate diagonals to avoid a directional grain
            if ((x + z) & 1) idx.push(a, c, b, b, c, d);
            else idx.push(a, c, d, a, d, b);
          }
        }
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.userData.chunk = { cx, cz };
        this.group.add(mesh);
        this.chunks.push(mesh);
        this.updateChunk(cx, cz);
      }
    }
  }

  updateChunk(cx, cz) {
    const mesh = this.chunks[cz * CHUNKS + cx];
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const col = geo.attributes.color.array;
    const vn = CHUNK + 1;
    const h = this.h;
    let i = 0;
    for (let z = 0; z < vn; z++) {
      for (let x = 0; x < vn; x++, i += 3) {
        const ix = cx * CHUNK + x, iz = cz * CHUNK + z;
        const k = this.idx(ix, iz);
        pos[i] = -HALF + ix * RES;
        pos[i + 1] = h[k];
        pos[i + 2] = -HALF + iz * RES;
        const hl = h[this.idx(Math.max(ix - 1, 0), iz)], hr = h[this.idx(Math.min(ix + 1, N), iz)];
        const hd = h[this.idx(ix, Math.max(iz - 1, 0))], hu = h[this.idx(ix, Math.min(iz + 1, N))];
        let nx = hl - hr, ny = 2 * RES, nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l;
        this.colorAt(ix, iz, tmpC2);
        col[i] = tmpC2.r; col[i + 1] = tmpC2.g; col[i + 2] = tmpC2.b;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }

  recolorAll() {
    for (let i = 0; i < CHUNKS * CHUNKS; i++) this.dirty.add(i);
    this.flush();
  }

  markDirty(ix0, iz0, ix1, iz1) {
    // include neighbours for normals
    const c0x = clamp(Math.floor((ix0 - 1) / CHUNK), 0, CHUNKS - 1), c1x = clamp(Math.floor((ix1 + 1) / CHUNK), 0, CHUNKS - 1);
    const c0z = clamp(Math.floor((iz0 - 1) / CHUNK), 0, CHUNKS - 1), c1z = clamp(Math.floor((iz1 + 1) / CHUNK), 0, CHUNKS - 1);
    for (let z = c0z; z <= c1z; z++) for (let x = c0x; x <= c1x; x++) this.dirty.add(z * CHUNKS + x);
    this.depthDirty = true;
  }

  flush() {
    for (const k of this.dirty) this.updateChunk(k % CHUNKS, Math.floor(k / CHUNKS));
    this.dirty.clear();
    if (this.depthDirty) {
      this.updateWaterDepthTexture();
      this.depthDirty = false;
    }
  }

  // Encodes water depth (0..8 units) for the water shader's colour and foam.
  buildWaterDepthTexture() {
    this.depthData = new Uint8Array(VN * VN * 4);
    this.depthTex = new THREE.DataTexture(this.depthData, VN, VN, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.wrapS = this.depthTex.wrapT = THREE.ClampToEdgeWrapping;
    this.updateWaterDepthTexture();
  }

  updateWaterDepthTexture() {
    const d = this.depthData, h = this.h;
    for (let i = 0; i < VN * VN; i++) {
      const depth = clamp((WATER - h[i]) / 8, -1, 1);
      d[i * 4] = Math.round(clamp(depth, 0, 1) * 255);
      d[i * 4 + 1] = Math.round(clamp(-depth, 0, 1) * 255); // height above water
      d[i * 4 + 2] = 0;
      d[i * 4 + 3] = 255;
    }
    this.depthTex.needsUpdate = true;
  }

  snapshot() {
    return { h: new Float32Array(this.h), disturb: new Float32Array(this.disturb) };
  }

  restore(s) {
    this.h.set(s.h);
    this.disturb.set(s.disturb);
    for (let i = 0; i < CHUNKS * CHUNKS; i++) this.dirty.add(i);
    this.depthDirty = true;
    this.flush();
  }

  // Ray-march the heightfield (water counts as ground) — fast picking.
  raycast(ray, maxDist = 2000) {
    const o = ray.origin, d = ray.direction;
    let t = 0;
    // jump to the top of the terrain box
    const top = 60;
    if (o.y > top && d.y < 0) t = (o.y - top) / -d.y;
    let prevT = t;
    let step = 0.5;
    for (let i = 0; i < 4000 && t < maxDist; i++) {
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
      step = Math.max(0.35, (y - g) * 0.4);
      t += step;
    }
    if (d.y < 0) {
      const tt = (o.y - WATER) / -d.y;
      return new THREE.Vector3(o.x + d.x * tt, WATER, o.z + d.z * tt);
    }
    return null;
  }
}

const tmpC2 = new THREE.Color();
