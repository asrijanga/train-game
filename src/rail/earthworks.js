import { HALF, RES, N, VN, WATER } from '../world/terrain.js';
import { clamp, lerp, smoothstep } from '../core/rng.js';
import { KIND_GROUND, KIND_BRIDGE, KIND_TUNNEL } from './network.js';

export const BED_DEPTH = 0.22; // terrain sits this far below the track bed
const MAX_GRADE = 0.045;
const BRIDGE_GAP = 2.0;
const TUNNEL_DEPTH = 3.4;
const WATER_CLEAR = 1.5;

// Resample an xz polyline to ~step spacing. Returns flat [x,z,...].
export function resample(xz, step = 0.5) {
  const out = [xz[0], xz[1]];
  let carry = 0;
  for (let i = 2; i < xz.length; i += 2) {
    let ax = xz[i - 2], az = xz[i - 1];
    const bx = xz[i], bz = xz[i + 1];
    let seg = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= seg) {
      const f = t / seg;
      out.push(ax + (bx - ax) * f, az + (bz - az) * f);
      t += step;
    }
    carry = seg - (t - step);
  }
  const lx = xz[xz.length - 2], lz = xz[xz.length - 1];
  const px = out[out.length - 2], pz = out[out.length - 1];
  const rem = Math.hypot(lx - px, lz - pz);
  if (rem > step * 0.35) out.push(lx, lz);
  else { out[out.length - 2] = lx; out[out.length - 1] = lz; }
  return out;
}

// Smooth, grade-limited vertical profile with optional fixed end heights.
export function computeProfile(xz, terrain, h0 = null, h1 = null) {
  const n = xz.length / 2;
  const raw = new Float32Array(n);
  const cum = new Float32Array(n);
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2], z = xz[i * 2 + 1];
    const g = terrain.heightAt(x, z);
    water[i] = g < WATER + 0.25 ? 1 : 0;
    raw[i] = Math.max(g + BED_DEPTH, WATER + (water[i] ? WATER_CLEAR : 0.6));
    if (i) cum[i] = cum[i - 1] + Math.hypot(x - xz[i * 2 - 2], z - xz[i * 2 - 1]);
  }
  // box-blur passes (~gaussian, sigma ≈ 5 units)
  let s = raw;
  const win = 10;
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, c = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) { sum += s[k]; c++; }
      o[i] = sum / c;
    }
    s = o;
  }
  // a gentle bias towards the real ground so long lines still hug terrain
  for (let i = 0; i < n; i++) s[i] = lerp(s[i], raw[i], 0.25);
  const L = cum[n - 1] || 1;
  const d0 = h0 === null ? 0 : h0 - s[0];
  const d1 = h1 === null ? 0 : h1 - s[n - 1];
  for (let i = 0; i < n; i++) {
    const t = cum[i] / L;
    s[i] += d0 * (1 - t) + d1 * t;
  }
  if (h0 !== null) s[0] = h0;
  if (h1 !== null) s[n - 1] = h1;
  for (let i = 1; i < n; i++) {
    const g = MAX_GRADE * (cum[i] - cum[i - 1]);
    s[i] = clamp(s[i], s[i - 1] - g, s[i - 1] + g);
  }
  if (h1 !== null) s[n - 1] = h1;
  for (let i = n - 2; i >= 0; i--) {
    const g = MAX_GRADE * (cum[i + 1] - cum[i]);
    s[i] = clamp(s[i], s[i + 1] - g, s[i + 1] + g);
  }
  if (h0 !== null) s[0] = h0;
  for (let i = 0; i < n; i++) {
    if (water[i]) s[i] = Math.max(s[i], WATER + WATER_CLEAR);
    s[i] = Math.max(s[i], WATER + 0.5);
  }
  return s;
}

export function classify(pts, terrain) {
  const n = pts.length / 3;
  const kind = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    const g = terrain.heightAt(x, z);
    const bed = y - BED_DEPTH;
    if (g < WATER + 0.3 || bed - g > BRIDGE_GAP) kind[i] = KIND_BRIDGE;
    else if (g - bed > TUNNEL_DEPTH) kind[i] = KIND_TUNNEL;
  }
  // clean up runs: tiny tunnels become cuttings, tiny gaps between bridges bridged
  const runs = (k) => {
    const out = [];
    let i = 0;
    while (i < n) {
      if (kind[i] !== k) { i++; continue; }
      let j = i;
      while (j + 1 < n && kind[j + 1] === k) j++;
      out.push([i, j]);
      i = j + 1;
    }
    return out;
  };
  for (const [a, b] of runs(KIND_TUNNEL)) if (b - a < 14) for (let i = a; i <= b; i++) kind[i] = KIND_GROUND;
  for (const [a, b] of runs(KIND_GROUND)) {
    if (a > 0 && b < n - 1 && kind[a - 1] === KIND_BRIDGE && kind[b + 1] === KIND_BRIDGE && b - a < 8) {
      for (let i = a; i <= b; i++) kind[i] = KIND_BRIDGE;
    }
  }
  for (const [a, b] of runs(KIND_BRIDGE)) {
    // extend bridges a little so abutments land on solid ground
    for (let i = Math.max(0, a - 2); i < a; i++) if (kind[i] === KIND_GROUND) kind[i] = KIND_BRIDGE;
    for (let i = b + 1; i <= Math.min(n - 1, b + 2); i++) if (kind[i] === KIND_GROUND) kind[i] = KIND_BRIDGE;
  }
  return kind;
}

// Reshape terrain along a track: embankments and cuttings blending into the
// landscape. Tunnels and bridges leave the ground alone (bridges only shave
// anything that would poke through the deck).
export function applyEarthworks(edge, terrain, protect) {
  const pts = edge.pts, kind = edge.kind;
  const n = edge.count;
  const best = new Map(); // vertex -> [weight, target, amount]
  for (let i = 0; i < n; i++) {
    const k = kind[i];
    if (k === KIND_TUNNEL) continue;
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
    const target = y - BED_DEPTH;
    const g = terrain.heightAt(x, z);
    if (k === KIND_BRIDGE && g < target - 0.4) continue;
    const diff = Math.abs(g - target);
    const flat = 1.1;
    const reach = flat + clamp(diff * 1.7, 1.2, 9);
    const ix0 = clamp(Math.floor((x - reach + HALF) / RES), 0, N), ix1 = clamp(Math.ceil((x + reach + HALF) / RES), 0, N);
    const iz0 = clamp(Math.floor((z - reach + HALF) / RES), 0, N), iz1 = clamp(Math.ceil((z + reach + HALF) / RES), 0, N);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const vx = -HALF + ix * RES, vz = -HALF + iz * RES;
        const d = Math.hypot(vx - x, vz - z);
        if (d > reach) continue;
        const w = d <= flat ? 1 : smoothstep(reach, flat, d);
        const key = iz * VN + ix;
        const cur = best.get(key);
        if (!cur || w > cur[0]) best.set(key, [w, target, diff, k]);
      }
    }
  }
  let x0 = N, z0 = N, x1 = 0, z1 = 0;
  for (const [key, [w, target, diff, k]] of best) {
    if (protect && protect[key] && w < 0.999) continue;
    const h0 = terrain.h[key];
    if (k === KIND_BRIDGE && h0 <= target - 0.4) continue;
    if (h0 < WATER + 0.1 && target > h0) continue; // don't fill lakes; bridges handle water
    const nh = lerp(h0, target, w);
    if (Math.abs(nh - h0) < 1e-3) continue;
    terrain.h[key] = nh;
    terrain.disturb[key] = Math.max(terrain.disturb[key], w * clamp(diff / 1.2, 0.25, 1) * (k === KIND_BRIDGE ? 0.4 : 1));
    const ix = key % VN, iz = (key / VN) | 0;
    if (ix < x0) x0 = ix; if (ix > x1) x1 = ix;
    if (iz < z0) z0 = iz; if (iz > z1) z1 = iz;
  }
  if (x1 >= x0) terrain.markDirty(x0, z0, x1, z1);
  // mark the track bed as protected for future earthworks
  if (protect) {
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3], z = pts[i * 3 + 2];
      const ix = Math.round((x + HALF) / RES), iz = Math.round((z + HALF) / RES);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx >= 0 && jz >= 0 && jx <= N && jz <= N) protect[jz * VN + jx] = 1;
      }
    }
  }
}
