import * as THREE from 'three';
import { GeoBuilder, lc } from '../render/geo.js';
import { toon } from '../render/materials.js';
import { windowMat, lampMat, glowPoints, labelTexture } from '../render/shared.js';
import { Rng, clamp } from '../core/rng.js';
import { HALF, N, WATER } from './terrain.js';
import { SP } from './scenery.js';

// Ghibli-flavoured Japanese towns: machiya rows, thatched farmhouses, shrines,
// pagodas, market stalls, lanterns, flower beds, rice paddies and tea fields.

const PLASTER = ['#f1ead9', '#efe3c8', '#e8dcc0', '#f4efe4'];
const WOOD = ['#5a3a26', '#6b4630', '#4e3424', '#7a5236'];
const TILE = ['#4b5560', '#555f6b', '#3f4a55', '#5d5a58', '#6b4f45'];
const NOREN = ['#2f4f7a', '#8a2a2e', '#2f6b4f', '#3a3a52', '#a85a2a', '#6b3f6f'];
const AWNING = [['#d94f3d', '#f4ead2'], ['#2f6fa8', '#f4ead2'], ['#e8a23a', '#fff4dc'], ['#3f8a5a', '#f4ead2'], ['#c4568a', '#fdf0f5']];
const BLOOMS = ['#e2526a', '#f4c23a', '#ffffff', '#8b6fd6', '#f08a3a', '#e97ab0', '#6f86e6'];
const NAMES1 = ['Kiri', 'Hana', 'Mizu', 'Sakura', 'Yama', 'Kaze', 'Hotaru', 'Tsuki', 'Momiji', 'Ao', 'Kawa', 'Hoshi', 'Matsu', 'Take', 'Yuki', 'Asa', 'Mori', 'Shiro'];
const NAMES2 = ['hama', 'mura', 'sawa', 'zaka', 'dani', 'machi', 'gawa', 'ura', 'oka', 'shima', 'no', 'bashi', 'ta', 'kubo'];

const OCC = 2; // occupancy grid cell size
const OCCN = Math.ceil(N / OCC) + 1;

export class Towns {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.group = new THREE.Group();
    this.group.name = 'towns';
    this.list = [];
    this.fields = [];
    this.streets = [];
    this.occ = new Uint8Array(OCCN * OCCN); // 1 = built, 2 = field/paddy, 3 = street
  }

  // ------------------------------------------------------------ occupancy
  oi(x, z) {
    const ix = Math.floor((x + HALF) / OCC), iz = Math.floor((z + HALF) / OCC);
    if (ix < 0 || iz < 0 || ix >= OCCN || iz >= OCCN) return -1;
    return iz * OCCN + ix;
  }

  mark(x, z, r, v) {
    for (let dz = -r; dz <= r; dz += OCC) for (let dx = -r; dx <= r; dx += OCC) {
      const k = this.oi(x + dx, z + dz);
      if (k >= 0 && this.occ[k] < v) this.occ[k] = v;
    }
  }

  markRect(cx, cz, ang, hw, hd, v) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let a = -hw; a <= hw; a += OCC * 0.7) for (let b = -hd; b <= hd; b += OCC * 0.7) {
      const k = this.oi(cx + a * c - b * s, cz + a * s + b * c);
      if (k >= 0 && this.occ[k] < v) this.occ[k] = v;
    }
  }

  // Trees stay off streets, buildings and fields; so do wildflowers.
  blocks(x, z) {
    const k = this.oi(x, z);
    return k >= 0 && this.occ[k] > 0;
  }

  // ------------------------------------------------------------ generation
  generate() {
    const t = this.terrain;
    const rng = new Rng(t.seed * 23 + 9);
    this.rng = rng;
    const sites = [];
    for (let i = 0; i < 3000 && sites.length < 13; i++) {
      const x = rng.float(-HALF + 60, HALF - 60), z = rng.float(-HALF + 60, HALF - 60);
      const h = t.heightAt(x, z);
      if (h < 1.8 || h > 12) continue;
      let ok = true;
      for (let a = 0; a < 10 && ok; a++) {
        const ang = (a / 10) * Math.PI * 2;
        for (const r of [8, 16, 24]) {
          const hh = t.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
          if (hh < 0.9 || Math.abs(hh - h) > 2.2) ok = false;
        }
      }
      if (!ok) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 95)) continue;
      sites.push({ x, z });
    }
    const names = new Set();
    sites.forEach((s, i) => {
      let name = '';
      for (let k = 0; k < 30; k++) { name = rng.pick(NAMES1) + rng.pick(NAMES2); if (!names.has(name)) break; }
      names.add(name);
      const size = i < 3 ? 'big' : i < 8 ? 'mid' : 'hamlet';
      this.makeTown(s.x, s.z, size, name, rng);
    });
    t.addPainter({ x0: -HALF, z0: -HALF, x1: HALF, z1: HALF, fn: (x, z, out) => this.paint(x, z, out) });
  }

  makeTown(cx, cz, size, name, rng) {
    const big = size === 'big', hamlet = size === 'hamlet';
    const town = { x: cx, z: cz, big, size, name, houses: [], props: [], ang: rng.float(0, Math.PI), radius: big ? 30 : hamlet ? 12 : 20, growth: 0, extra: 0 };
    const ang = town.ang;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const L = town.radius;
    const streets = [{ x0: cx - dx * L, z0: cz - dz * L, x1: cx + dx * L, z1: cz + dz * L, w: big ? 2.2 : 1.6 }];
    if (big) streets.push({ x0: cx + dz * 20, z0: cz - dx * 20, x1: cx - dz * 20, z1: cz + dx * 20, w: 1.8 });
    town.streets = streets;
    this.streets.push(...streets);
    for (const s of streets) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      for (let d = 0; d <= len; d += 1.5) this.mark(s.x0 + (s.x1 - s.x0) * d / len, s.z0 + (s.z1 - s.z0) * d / len, s.w + 0.5, 3);
    }
    const square = big ? 7 : size === 'mid' ? 5 : 0;
    let id = 0;
    for (const s of streets) {
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const ux = (s.x1 - s.x0) / len, uz = (s.z1 - s.z0) / len;
      for (let d = 2; d < len - 2; d += rng.float(3.0, 3.8)) {
        for (const side of [-1, 1]) {
          const kind = hamlet ? 'minka' : rng.chance(0.12) ? 'kura' : rng.chance(0.2) ? 'shop' : 'machiya';
          const depth = kind === 'minka' ? 3.2 : kind === 'kura' ? 2.2 : rng.float(3.0, 3.8);
          const off = s.w + 0.6 + depth / 2 + (kind === 'minka' ? 1.5 : 0);
          const hx = s.x0 + ux * d - uz * side * off, hz = s.z0 + uz * d + ux * side * off;
          if (square && Math.hypot(hx - cx, hz - cz) < square + 3) continue;
          if (rng.chance(hamlet ? 0.35 : 0.1)) continue;
          if (town.houses.some((h) => Math.hypot(h.x - hx, h.z - hz) < (kind === 'minka' ? 4.6 : 2.9))) continue;
          const g = this.terrain.heightAt(hx, hz);
          if (g < 0.8 || this.terrain.slopeAt(hx, hz) > 0.4) continue;
          const h = this.newHouse(id++, kind, hx, hz, Math.atan2(uz * side, -ux * side), rng);
          h.d = depth;
          town.houses.push(h);
          this.mark(hx, hz, 2.2, 1);
        }
      }
    }
    if (square) {
      town.market = { x: cx, z: cz, r: square, ang, hidden: false, seed: rng.int(1, 99999) };
      this.mark(cx, cz, square, 1);
    }
    if (!hamlet) {
      for (let tries = 0; tries < 20; tries++) {
        const a = ang + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1) + rng.float(-0.5, 0.5);
        const r = L * 0.55 + rng.float(8, 14);
        const sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r;
        const g = this.terrain.heightAt(sx, sz);
        if (g < 1 || this.terrain.slopeAt(sx, sz) > 0.35) continue;
        if (town.houses.some((h) => Math.hypot(h.x - sx, h.z - sz) < 7)) continue;
        town.shrine = { x: sx, z: sz, rot: Math.atan2(cx - sx, cz - sz), hidden: false };
        this.mark(sx, sz, 6, 1);
        break;
      }
    }
    if (big) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rng.float(0, Math.PI * 2), r = L * 0.5 + rng.float(6, 12);
        const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
        if (this.terrain.heightAt(px, pz) < 1 || this.terrain.slopeAt(px, pz) > 0.3) continue;
        if (town.houses.some((h) => Math.hypot(h.x - px, h.z - pz) < 5.5)) continue;
        if (town.shrine && Math.hypot(town.shrine.x - px, town.shrine.z - pz) < 12) continue;
        town.pagoda = { x: px, z: pz, rot: rng.float(0, Math.PI), hidden: false };
        this.mark(px, pz, 4, 1);
        break;
      }
    }
    const nf = big ? 9 : hamlet ? 5 : 6;
    for (let i = 0; i < nf; i++) {
      const fa = rng.float(0, Math.PI * 2), fr = L + rng.float(10, 36);
      const fx = cx + Math.cos(fa) * fr, fz = cz + Math.sin(fa) * fr;
      const hw = rng.float(5, 10), hd = rng.float(4, 8);
      const h = this.terrain.heightAt(fx, fz);
      if (h < 1.2 || this.terrain.slopeAt(fx, fz) > 0.3) continue;
      const fang = ang + rng.float(-0.35, 0.35);
      const kind = h > 6 && rng.chance(0.45) ? 'tea' : rng.chance(0.7) ? 'paddy' : rng.pick(['wheat', 'nanohana', 'cabbage']);
      const f = { x: fx, z: fz, hw, hd, ang: fang, kind, rows: rng.float(1.1, 1.8) };
      this.fields.push(f);
      town.props.push(f);
      this.markRect(fx, fz, fang, hw, hd, 2);
    }
    this.list.push(town);
  }

  newHouse(id, kind, x, z, rot, rng) {
    return {
      id, kind, x, z, rot,
      w: kind === 'minka' ? rng.float(3.6, 4.4) : kind === 'kura' ? 1.8 : rng.float(2.2, 2.8),
      d: 3,
      floors: kind === 'minka' || kind === 'kura' ? 1 : rng.chance(0.75) ? 2 : 1,
      plaster: rng.pick(PLASTER), wood: rng.pick(WOOD), tile: rng.pick(TILE), noren: rng.pick(NOREN),
      awning: rng.pick(AWNING), lantern: rng.chance(0.5), flowers: rng.chance(0.55), bloom: rng.pick(BLOOMS),
      hidden: false,
    };
  }

  // Trees for gardens, avenues and shrine groves (deterministic, after scenery exists).
  plantGardens(scenery) {
    const rng = new Rng(this.terrain.seed * 5 + 17);
    for (const t of this.list) {
      for (const s of t.streets) {
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
        const ux = (s.x1 - s.x0) / len, uz = (s.z1 - s.z0) / len;
        // a sakura (or maple) avenue leading out of town at each end
        for (const end of [-1, 1]) {
          for (let d = 2; d < 15; d += 3.2) {
            for (const side of [-1, 1]) {
              const bx = end > 0 ? s.x1 + ux * d : s.x0 - ux * d, bz = end > 0 ? s.z1 + uz * d : s.z0 - uz * d;
              const x = bx - uz * side * (s.w + 1.3), z = bz + ux * side * (s.w + 1.3);
              if (this.terrain.heightAt(x, z) < 0.8 || this.blocks(x, z)) continue;
              scenery.plant(t.size === 'hamlet' ? SP.MAPLE : SP.CHERRY, x, z, 0.85);
              this.mark(x, z, 1, 1);
            }
          }
        }
      }
      for (const h of t.houses) {
        if (!rng.chance(0.35)) continue;
        const a = h.rot + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1);
        const x = h.x + Math.sin(a) * (h.w / 2 + 0.9), z = h.z + Math.cos(a) * (h.w / 2 + 0.9);
        if (this.terrain.heightAt(x, z) < 0.8) continue;
        scenery.plant(rng.chance(0.6) ? SP.HYDRANGEA : rng.chance(0.5) ? SP.PINE : SP.MAPLE, x, z, 0.7);
      }
      if (t.shrine) {
        const s = t.shrine;
        for (let i = 0; i < 9; i++) {
          const a = s.rot + Math.PI + rng.float(-1.3, 1.3), r = rng.float(6, 11);
          const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
          if (this.terrain.heightAt(x, z) < 0.8) continue;
          scenery.plant(i < 3 ? SP.CEDAR : rng.chance(0.5) ? SP.MAPLE : SP.CHERRY, x, z, i < 3 ? 1.5 : 1);
        }
      }
    }
  }

  // ------------------------------------------------------------ painting
  fieldAt(x, z) {
    for (const f of this.fields) {
      const dx = x - f.x, dz = z - f.z;
      if (Math.abs(dx) > f.hw + f.hd || Math.abs(dz) > f.hw + f.hd) continue;
      const lx = dx * Math.cos(f.ang) + dz * Math.sin(f.ang);
      const lz = -dx * Math.sin(f.ang) + dz * Math.cos(f.ang);
      if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) return { f, lx, lz };
    }
    return null;
  }

  streetDist(x, z) {
    let best = Infinity;
    for (const s of this.streets) {
      if (x < Math.min(s.x0, s.x1) - 6 || x > Math.max(s.x0, s.x1) + 6 || z < Math.min(s.z0, s.z1) - 6 || z > Math.max(s.z0, s.z1) + 6) continue;
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
      const tt = clamp(((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(s.x0 + dx * tt - x, s.z0 + dz * tt - z) - s.w + 1.4);
    }
    return best;
  }

  paint(x, z, out) {
    const k = this.oi(x, z);
    if (k < 0) return;
    // look at neighbours so field and street edges are crisp
    let any = this.occ[k];
    if (!any) {
      const k2 = this.oi(x + OCC, z), k3 = this.oi(x, z + OCC), k4 = this.oi(x - OCC, z), k5 = this.oi(x, z - OCC);
      any = (k2 >= 0 && this.occ[k2]) || (k3 >= 0 && this.occ[k3]) || (k4 >= 0 && this.occ[k4]) || (k5 >= 0 && this.occ[k5]);
      if (!any) return;
    }
    const fi = this.fieldAt(x, z);
    if (fi) {
      const { f, lx, lz } = fi;
      const edge = Math.min(f.hw - Math.abs(lx), f.hd - Math.abs(lz));
      const k2 = clamp(edge / 1.0, 0, 1);
      let c;
      if (f.kind === 'paddy') {
        // flooded paddies: sky-blue water between rows of bright rice
        const row = Math.sin(lz * Math.PI / 0.55) > 0.15;
        const bund = Math.abs(lx) % 6 < 0.35 || edge < 0.45;
        c = bund ? [0.55, 0.62, 0.36] : row ? [0.45, 0.72, 0.3] : [0.55, 0.74, 0.72];
      } else if (f.kind === 'tea') {
        c = Math.sin(lz * Math.PI / f.rows) > 0.2 ? [0.6, 0.5, 0.36] : [0.3, 0.5, 0.25];
      } else if (f.kind === 'nanohana') {
        c = Math.sin(lz * Math.PI / f.rows * 2) > 0 ? [0.98, 0.86, 0.25] : [0.86, 0.8, 0.28];
      } else if (f.kind === 'cabbage') {
        c = Math.sin(lz * Math.PI / f.rows * 2) > 0 ? [0.5, 0.68, 0.38] : [0.55, 0.45, 0.3];
      } else {
        c = Math.sin(lz * Math.PI / f.rows * 2) > 0 ? [0.86, 0.74, 0.38] : [0.8, 0.66, 0.32];
      }
      out.r += (c[0] - out.r) * k2; out.g += (c[1] - out.g) * k2; out.b += (c[2] - out.b) * k2;
    }
    const sd = this.streetDist(x, z);
    if (sd < 1.6) {
      const kk = clamp((1.6 - sd) / 0.8, 0, 1) * 0.85;
      out.r += (0.78 - out.r) * kk; out.g += (0.7 - out.g) * kk; out.b += (0.55 - out.b) * kk;
    }
    for (const tw of this.list) {
      if (!tw.market) continue;
      const d = Math.hypot(x - tw.x, z - tw.z);
      if (d < tw.market.r + 1.5) {
        const kk = clamp((tw.market.r + 1.5 - d) / 1.2, 0, 1) * 0.85;
        const flag = (Math.floor(x * 1.2) + Math.floor(z * 1.2)) & 1 ? 0.04 : 0;
        out.r += (0.8 + flag - out.r) * kk; out.g += (0.75 + flag - out.g) * kk; out.b += (0.66 + flag - out.b) * kk;
      }
    }
  }

  // ------------------------------------------------------------ meshes
  buildAll() {
    for (const t of this.list) this.buildTown(t);
  }

  buildTown(town) {
    if (town.view) {
      this.group.remove(town.view);
      town.view.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    const solid = new GeoBuilder(), glass = new GeoBuilder(), lamps = new GeoBuilder();
    const m = new THREE.Matrix4();
    const grp = new THREE.Group();
    town.chimneys = [];
    town.lanterns = [];
    const place = (fn, x, z, rot, ...args) => {
      const gb = new GeoBuilder(), gg = new GeoBuilder(), gl = new GeoBuilder();
      const extra = fn(gb, gg, gl, ...args) || {};
      const y = this.terrain.heightAt(x, z) - 0.05;
      m.makeRotationY(rot).setPosition(x, y, z);
      solid.append(gb, m);
      glass.append(gg, m);
      lamps.append(gl, m);
      for (const c of extra.smoke || []) town.chimneys.push(new THREE.Vector3(...c).applyMatrix4(m));
      for (const c of extra.lights || []) town.lanterns.push(new THREE.Vector3(...c).applyMatrix4(m));
    };
    for (const h of town.houses) {
      if (h.hidden) continue;
      const fn = h.kind === 'minka' ? minka : h.kind === 'kura' ? kura : machiya;
      place(fn, h.x, h.z, h.rot, h);
    }
    if (town.shrine && !town.shrine.hidden) place(shrine, town.shrine.x, town.shrine.z, town.shrine.rot);
    if (town.pagoda && !town.pagoda.hidden) place(pagoda, town.pagoda.x, town.pagoda.z, town.pagoda.rot);
    if (town.market && !town.market.hidden) place(market, town.market.x, town.market.z, -town.market.ang, town.market.r, new Rng(town.market.seed));
    for (const f of town.props) if (f.kind === 'tea') place(teaRows, f.x, f.z, -f.ang, f);
    if (town.size !== 'hamlet') {
      const s = town.streets[0];
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      for (let d = 4; d < len - 3; d += 7) {
        const x = s.x0 + (s.x1 - s.x0) * d / len, z = s.z0 + (s.z1 - s.z0) * d / len;
        if (town.market && Math.hypot(x - town.x, z - town.z) < town.market.r + 2) continue;
        if (this.game.rail?.net.nearestEdge(x, z, s.w + 2)) continue;
        place(lanternPost, x, z, -town.ang, s.w);
      }
    }
    if (solid.n) {
      const mesh = new THREE.Mesh(solid.build(), toon('#ffffff', { vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      grp.add(mesh);
    }
    if (glass.n) grp.add(new THREE.Mesh(glass.build(), windowMat));
    if (lamps.n) grp.add(new THREE.Mesh(lamps.build(), lampMat));
    if (town.lanterns.length) grp.add(glowPoints(town.lanterns));
    const lbl = labelTexture(town.name, { font: 'italic 700 60px Caveat, cursive', bg: 'rgba(240,232,210,0.85)' });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lbl.tex, transparent: true, depthTest: false, sizeAttenuation: false }));
    sp.scale.set((0.038 * lbl.w) / lbl.h, 0.038, 1);
    sp.position.set(town.x, this.terrain.heightAt(town.x, town.z) + 14, town.z);
    sp.center.set(0.5, 0);
    sp.layers.set(1);
    sp.renderOrder = 29;
    grp.add(sp);
    town.label = sp;
    town.view = grp;
    this.group.add(grp);
  }

  clearAlong(pts, radius) {
    const n = pts.length / 3;
    for (const town of this.list) {
      let near = false;
      for (let i = 0; i < n; i += 4) if (Math.hypot(pts[i * 3] - town.x, pts[i * 3 + 2] - town.z) < town.radius + 50) { near = true; break; }
      if (!near && n > 1) continue;
      let changed = false;
      const objs = town.houses.map((h) => ({ o: h, x: h.x, z: h.z, size: Math.max(h.w, h.d) * 0.6 }));
      if (town.shrine) objs.push({ o: town.shrine, x: town.shrine.x, z: town.shrine.z, size: 4.5 });
      if (town.pagoda) objs.push({ o: town.pagoda, x: town.pagoda.x, z: town.pagoda.z, size: 3 });
      if (town.market) objs.push({ o: town.market, x: town.market.x, z: town.market.z, size: town.market.r });
      for (const { o, x, z, size } of objs) {
        if (o.hidden) continue;
        for (let i = 0; i < n; i += 2) {
          if (Math.hypot(pts[i * 3] - x, pts[i * 3 + 2] - z) < radius + size) { o.hidden = true; changed = true; break; }
        }
      }
      if (changed || near) this.buildTown(town);
    }
  }

  served(pos, n) {
    const town = this.nearest(pos.x, pos.z, 80);
    if (!town) return;
    town.growth = (town.growth || 0) + n;
    if (town.growth >= 14 && (town.extra || 0) < 16) {
      town.growth = 0;
      if (this.grow(town)) this.game.audio?.pop(1.8);
    }
  }

  grow(town) {
    const rng = this.growRng || (this.growRng = new Rng(this.terrain.seed * 91 + 5));
    const net = this.game.rail.net;
    for (let tries = 0; tries < 50; tries++) {
      const s = rng.pick(town.streets);
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const ux = (s.x1 - s.x0) / L, uz = (s.z1 - s.z0) / L;
      const d = rng.float(-12, L + 12), side = rng.chance(0.5) ? 1 : -1;
      const kind = town.size === 'hamlet' || rng.chance(0.3) ? 'minka' : rng.chance(0.25) ? 'shop' : 'machiya';
      const off = s.w + 2.5 + (kind === 'minka' ? 1.5 : 0) + (rng.chance(0.4) ? 4.5 : 0);
      const hx = s.x0 + ux * d - uz * side * off, hz = s.z0 + uz * d + ux * side * off;
      const g = this.terrain.heightAt(hx, hz);
      if (g < 0.8 || this.terrain.slopeAt(hx, hz) > 0.35) continue;
      if (town.houses.some((h) => !h.hidden && Math.hypot(h.x - hx, h.z - hz) < (kind === 'minka' ? 4.6 : 3.0))) continue;
      if (net.nearestEdge(hx, hz, 5)) continue;
      if (this.game.stations.list.some((st) => st.center && Math.hypot(st.center.x - hx, st.center.z - hz) < st.length / 2 + 6)) continue;
      const h = this.newHouse(town.houses.length, kind, hx, hz, Math.atan2(uz * side, -ux * side), rng);
      h.d = kind === 'minka' ? 3.2 : 3.4;
      h.grown = true;
      town.houses.push(h);
      town.extra = (town.extra || 0) + 1;
      this.mark(hx, hz, 2.2, 1);
      this.game.scenery?.clearAlong(new Float32Array([hx, g, hz]), 2.6);
      this.buildTown(town);
      this.game.effects?.puff(new THREE.Vector3(hx, g, hz), 1.5, 14);
      return true;
    }
    return false;
  }

  nearest(x, z, r) {
    let best = null, bd = r;
    for (const t of this.list) {
      const d = Math.hypot(t.x - x, t.z - z) - t.radius;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  snapshot() {
    return this.list.map((t) => ({
      h: t.houses.filter((h) => h.hidden).map((h) => h.id),
      s: !!t.shrine?.hidden, p: !!t.pagoda?.hidden, m: !!t.market?.hidden,
      g: t.houses.filter((h) => h.grown).map((h) => ({ ...h })),
      gr: t.growth || 0,
    }));
  }

  restore(s) {
    this.list.forEach((t, i) => {
      const d = s[i];
      if (!d) return;
      t.houses = t.houses.filter((h) => !h.grown);
      for (const h of d.g || []) t.houses.push({ ...h });
      t.extra = (d.g || []).length;
      t.growth = d.gr || 0;
      const hid = new Set(d.h);
      for (const h of t.houses) h.hidden = hid.has(h.id);
      if (t.shrine) t.shrine.hidden = !!d.s;
      if (t.pagoda) t.pagoda.hidden = !!d.p;
      if (t.market) t.market.hidden = !!d.m;
      this.buildTown(t);
    });
  }

  update() {}

  setLabelOpacity(o) {
    for (const t of this.list) if (t.label) { t.label.material.opacity = o; t.label.visible = o > 0.02; }
  }
}

// ---------------------------------------------------------------- buildings
// Local frame: +z faces the street; origin at the footprint centre, y=0 ground.

function tiledRoof(g, x0, x1, z0, z1, y, h, tile, o = 0.45) {
  const dark = lc(tile), light = lc('#8a919a');
  g.gable(x0, x1, z0, z1, y, h, dark, lc('#3a3633'), o, 0.12);
  const zm = (z0 + z1) / 2;
  g.abox(x0 - o - 0.05, y + h - 0.02, zm - 0.12, x1 + o + 0.05, y + h + 0.14, zm + 0.12, dark);
  for (const xe of [x0 - o - 0.05, x1 + o - 0.12]) g.abox(xe, y + h + 0.1, zm - 0.15, xe + 0.17, y + h + 0.32, zm + 0.15, dark);
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    const yy = y + h * f, zz = z1 + o - (z1 + o - zm) * f;
    g.abox(x0 - o, yy - 0.03, zz - 0.04, x1 + o, yy + 0.02, zz + 0.02, light);
    const zz2 = z0 - o + (zm - z0 + o) * f;
    g.abox(x0 - o, yy - 0.03, zz2 - 0.02, x1 + o, yy + 0.02, zz2 + 0.04, light);
  }
}

function machiya(g, gl, lamps, h) {
  const w = h.w, d = h.d;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const wood = lc(h.wood), plaster = lc(h.plaster), dark = lc('#3a2a20'), stone = lc('#9c917f');
  const shop = h.kind === 'shop';
  const A = (x, y, z) => ({ x, y, z });
  g.abox(x0 - 0.05, -0.3, z0 - 0.05, x1 + 0.05, 0.12, z1 + 0.05, stone);
  const f1 = 1.45;
  g.abox(x0, 0.12, z0, x1, f1, z1, wood);
  for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.11) g.abox(x - 0.018, 0.3, z1, x + 0.018, f1 - 0.1, z1 + 0.05, dark);
  g.abox(x0, 0.28, z1, x1, 0.33, z1 + 0.06, dark);
  gl.abox(x0 + 0.15, 0.35, z1 - 0.01, x1 - 0.15, f1 - 0.12, z1 + 0.005, plaster);
  g.abox(-0.45, 0.12, z1 + 0.01, 0.45, 1.25, z1 + 0.07, dark);
  const noren = lc(h.noren);
  for (const sx of [-0.3, 0, 0.3]) g.abox(sx - 0.14, 0.75, z1 + 0.08, sx + 0.14, 1.28, z1 + 0.1, noren);
  g.abox(-0.08, 0.95, z1 + 0.105, 0.08, 1.1, z1 + 0.11, lc('#f4ead2'));
  // pent roof between the floors
  g.quad(A(x0 - 0.1, f1 - 0.05, z1 + 0.75), A(x1 + 0.1, f1 - 0.05, z1 + 0.75), A(x1 + 0.1, f1 + 0.35, z1), A(x0 - 0.1, f1 + 0.35, z1), lc(h.tile));
  g.quad(A(x1 + 0.1, f1 - 0.12, z1 + 0.75), A(x0 - 0.1, f1 - 0.12, z1 + 0.75), A(x0 - 0.1, f1 + 0.28, z1), A(x1 + 0.1, f1 + 0.28, z1), dark);
  if (h.floors > 1) {
    const f2 = f1 + 1.15;
    g.abox(x0, f1, z0, x1, f2, z1 - 0.05, plaster);
    for (const sx of [x0, x1]) g.abox(sx - 0.06, f1, z1 - 0.12, sx + 0.06, f2, z1, wood);
    for (let x = -0.6; x <= 0.6; x += 0.13) g.abox(x - 0.03, f1 + 0.4, z1 - 0.05, x + 0.03, f1 + 0.85, z1 + 0.01, dark);
    gl.abox(-0.66, f1 + 0.42, z1 - 0.06, 0.66, f1 + 0.83, z1 - 0.04, plaster);
    tiledRoof(g, x0, x1, z0, z1, f2, 0.85, h.tile, 0.5);
  } else {
    tiledRoof(g, x0, x1, z0, z1, f1 + 0.35, 0.8, h.tile, 0.5);
  }
  gl.abox(-0.4, 0.6, z0 - 0.05, 0.4, 1.1, z0 - 0.02, plaster);
  const lights = [];
  if (h.lantern) {
    g.abox(x1 - 0.32, 1.05, z1 + 0.3, x1 - 0.28, 1.4, z1 + 0.34, dark);
    lamps.cyl(x1 - 0.3, 0.72, z1 + 0.32, 0.13, 1.05, plaster, 8, 0.13);
    lights.push([x1 - 0.3, 0.88, z1 + 0.32]);
  }
  if (shop) {
    const [a, b] = h.awning.map(lc);
    for (let i = 0; i < 8; i++) {
      const xa = x0 - 0.1 + (i * (w + 0.2)) / 8, xb = x0 - 0.1 + ((i + 1) * (w + 0.2)) / 8;
      g.quad(A(xa, 1.25, z1 + 1.1), A(xb, 1.25, z1 + 1.1), A(xb, 1.5, z1 + 0.1), A(xa, 1.5, z1 + 0.1), i % 2 ? a : b);
      g.quad(A(xb, 1.22, z1 + 1.1), A(xa, 1.22, z1 + 1.1), A(xa, 1.47, z1 + 0.1), A(xb, 1.47, z1 + 0.1), i % 2 ? a : b);
    }
    g.abox(x0 + 0.2, 0.12, z1 + 0.4, x1 - 0.2, 0.55, z1 + 0.95, lc('#8a5a3b'));
    for (let i = 0; i < 6; i++) g.abox(x0 + 0.3 + i * (w - 0.6) / 6, 0.55, z1 + 0.5, x0 + 0.3 + (i + 0.8) * (w - 0.6) / 6, 0.7, z1 + 0.85, lc(['#e2702a', '#d43b2e', '#7fb04a', '#f2c83a', '#9a5ad0', '#f08a3a'][i]));
  }
  if (h.flowers) {
    for (const sx of [x0 + 0.35, x1 - 0.35]) {
      g.abox(sx - 0.28, 0.12, z1 + 0.15, sx + 0.28, 0.42, z1 + 0.5, lc('#6b4a32'));
      for (let i = 0; i < 4; i++) g.abox(sx - 0.24 + i * 0.13, 0.42, z1 + 0.22 + (i % 2) * 0.12, sx - 0.15 + i * 0.13, 0.55, z1 + 0.33 + (i % 2) * 0.12, lc(i % 2 ? h.bloom : '#5b8f3a'));
    }
  }
  return { lights, smoke: h.floors === 1 ? [[x0 + 0.4, 2.9, z0 + 0.6]] : [] };
}

function minka(g, gl, lamps, h) {
  const w = h.w, d = h.d;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const wood = lc('#6b4a32'), plaster = lc('#efe6d0'), thatch = lc('#b39055'), thatchD = lc('#8e6d3a'), dark = lc('#3a2a20');
  g.abox(x0 - 0.1, -0.3, z0 - 0.1, x1 + 0.1, 0.35, z1 + 0.1, lc('#9c917f'));
  g.abox(x0, 0.35, z0, x1, 1.55, z1, plaster);
  for (let x = x0; x <= x1 + 0.01; x += w / 4) g.abox(x - 0.07, 0.35, z1 - 0.02, x + 0.07, 1.55, z1 + 0.06, wood);
  g.abox(x0, 1.45, z1 - 0.02, x1, 1.55, z1 + 0.06, wood);
  g.abox(x0, 0.35, z1, x1, 0.45, z1 + 0.6, lc('#a07a50'));
  gl.abox(x0 + 0.3, 0.6, z1 + 0.06, -0.3, 1.3, z1 + 0.08, plaster);
  gl.abox(0.3, 0.6, z1 + 0.06, x1 - 0.3, 1.3, z1 + 0.08, plaster);
  g.hip(x0, x1, z0, z1, 1.55, 2.3, thatch, 0.75);
  g.abox(-w * 0.18, 3.65, -0.25, w * 0.18, 3.95, 0.25, thatchD);
  g.abox(-w * 0.18, 3.95, -0.15, w * 0.18, 4.05, 0.15, dark);
  g.abox(x0 - 0.75, 1.3, z1 + 0.65, x1 + 0.75, 1.42, z1 + 0.8, thatchD);
  g.abox(x0 - 0.75, 1.3, z0 - 0.8, x1 + 0.75, 1.42, z0 - 0.65, thatchD);
  if (h.flowers) for (let i = 0; i < 5; i++) g.abox(x0 + 0.4 + i * 0.6, 0.0, z1 + 0.85, x0 + 0.7 + i * 0.6, 0.3, z1 + 1.1, lc(i % 2 ? h.bloom : '#5b8f3a'));
  for (let x = x0 - 1; x <= x1 + 1; x += 0.22) g.abox(x - 0.03, 0, z1 + 1.6, x + 0.03, 0.7, z1 + 1.66, lc('#b8b26a'));
  g.abox(x0 - 1, 0.45, z1 + 1.58, x1 + 1, 0.5, z1 + 1.68, lc('#6b6a3a'));
  return { smoke: [[0, 4.1, 0]], lights: [] };
}

function kura(g, gl, lamps, h) {
  const w = 1.8, d = 2.2;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const white = lc('#f4f1ea'), black = lc('#2d2c30'), grey = lc('#8a8a8f');
  g.abox(x0, -0.3, z0, x1, 0.9, z1, black);
  for (let x = x0 + 0.15; x < x1; x += 0.3) for (let y = 0.0; y < 0.85; y += 0.3) g.abox(x - 0.1, y + 0.05, z1, x + 0.1, y + 0.25, z1 + 0.03, grey);
  g.abox(x0, 0.9, z0, x1, 2.4, z1, white);
  g.abox(-0.3, 1.5, z1, 0.3, 2.0, z1 + 0.06, black);
  tiledRoof(g, x0, x1, z0, z1, 2.4, 0.75, h.tile, 0.3);
  return {};
}

function shrine(g, gl, lamps) {
  const red = lc('#d0482f'), black = lc('#2d2c30'), wood = lc('#7a5236'), white = lc('#f4efe4'), stone = lc('#a8a294'), copper = lc('#4e7d6a');
  const lights = [];
  for (let z = 1; z < 10; z += 0.9) g.abox(-0.6, -0.1, z - 0.4, 0.6, 0.06, z + 0.4, stone);
  for (const tz of [9.5, 6.2]) {
    for (const sx of [-1.25, 1.25]) {
      g.cyl(sx, -0.1, tz, 0.15, 3.0, red, 8, 0.13);
      g.cyl(sx, -0.1, tz, 0.19, 0.25, black, 8);
    }
    g.abox(-1.75, 2.45, tz - 0.12, 1.75, 2.62, tz + 0.12, red);
    g.abox(-2.1, 2.95, tz - 0.16, 2.1, 3.15, tz + 0.16, black);
    g.abox(-2.25, 3.05, tz - 0.14, -1.9, 3.3, tz + 0.14, black);
    g.abox(1.9, 3.05, tz - 0.14, 2.25, 3.3, tz + 0.14, black);
    g.abox(-1.9, 2.8, tz - 0.14, 1.9, 2.95, tz + 0.14, red);
    g.abox(-0.12, 2.62, tz - 0.08, 0.12, 2.8, tz + 0.08, black);
  }
  for (const sx of [-1.7, 1.7]) {
    const z = 3.5;
    g.cyl(sx, -0.1, z, 0.28, 0.15, stone, 6);
    g.cyl(sx, 0.15, z, 0.1, 0.8, stone, 6);
    g.abox(sx - 0.24, 0.8, z - 0.24, sx + 0.24, 0.9, z + 0.24, stone);
    lamps.abox(sx - 0.15, 0.9, z - 0.15, sx + 0.15, 1.2, z + 0.15, stone);
    g.hip(sx - 0.25, sx + 0.25, z - 0.25, z + 0.25, 1.2, 0.3, stone, 0.08);
    g.cyl(sx, 1.5, z, 0.06, 1.65, stone, 6, 0.02);
    lights.push([sx, 1.05, z]);
  }
  g.abox(-2.4, -0.2, -2.6, 2.4, 0.7, 1.6, stone);
  for (let i = 0; i < 4; i++) g.abox(-0.9, 0.7 - (i + 1) * 0.18, 1.6 + i * 0.25, 0.9, 0.7 - i * 0.18, 1.85 + i * 0.25, wood);
  g.abox(-2.0, 0.7, -2.2, 2.0, 2.6, 1.2, white);
  for (const sx of [-2.0, -0.7, 0.7, 2.0]) for (const sz of [-2.2, 1.2]) g.abox(sx - 0.12, 0.7, sz - 0.12, sx + 0.12, 2.6, sz + 0.12, red);
  g.abox(-2.1, 2.45, 1.1, 2.1, 2.65, 1.35, red);
  gl.abox(-1.6, 1.0, 1.2, -0.8, 2.2, 1.24, white);
  gl.abox(0.8, 1.0, 1.2, 1.6, 2.2, 1.24, white);
  g.abox(-0.6, 0.7, 1.2, 0.6, 2.2, 1.26, lc('#5a3324'));
  g.abox(-1.3, 2.18, 1.38, 1.3, 2.34, 1.52, lc('#c9b27a'));
  for (const sx of [-0.8, 0, 0.8]) g.abox(sx - 0.07, 1.8, 1.48, sx + 0.07, 2.18, 1.5, white);
  g.hip(-2.0, 2.0, -2.2, 1.2, 2.6, 1.6, copper, 1.0);
  g.abox(-1.2, 4.15, -0.6, 1.2, 4.3, -0.4, copper);
  g.abox(-0.5, 0.7, 1.55, 0.5, 1.15, 2.0, wood);
  g.cyl(0, 1.9, 1.5, 0.12, 2.1, lc('#d0a443'), 8, 0.1);
  return { lights };
}

function pagoda(g, gl) {
  const red = lc('#c8462f'), white = lc('#f4efe4'), roof = lc('#3f4650'), stone = lc('#a8a294'), brass = lc('#d0a443');
  g.abox(-2.6, -0.3, -2.6, 2.6, 0.5, 2.6, stone);
  let y = 0.5;
  for (let i = 0; i < 5; i++) {
    const s = 1.6 - i * 0.22, hgt = 1.25 - i * 0.08;
    g.abox(-s, y, -s, s, y + hgt, s, white);
    for (const sx of [-s, s]) for (const sz of [-s, s]) g.abox(sx - 0.1, y, sz - 0.1, sx + 0.1, y + hgt, sz + 0.1, red);
    g.abox(-s - 0.02, y + hgt * 0.35, -0.35, -s, y + hgt * 0.85, 0.35, red);
    gl.abox(-0.35, y + hgt * 0.35, s, 0.35, y + hgt * 0.85, s + 0.02, white);
    y += hgt;
    const o = 1.0 - i * 0.08;
    g.hip(-s, s, -s, s, y, 0.55, roof, o);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.abox(sx * (s + o) - 0.12, y - 0.05, sz * (s + o) - 0.12, sx * (s + o) + 0.12, y + 0.18, sz * (s + o) + 0.12, roof);
    y += 0.25;
  }
  g.cyl(0, y, 0, 0.07, y + 2.6, brass, 6, 0.03);
  for (let i = 0; i < 9; i++) g.cyl(0, y + 0.5 + i * 0.2, 0, 0.17 - i * 0.008, y + 0.56 + i * 0.2, brass, 8);
  return {};
}

function market(g, gl, lamps, r, rng) {
  const lights = [];
  const wood = lc('#7a5236');
  const n = Math.max(4, Math.round(r * 1.1));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * (r - 1.6), z = Math.sin(a) * (r - 1.6);
    const rot = Math.atan2(-x, -z);
    const [ca, cb] = rng.pick(AWNING).map(lc);
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, ly, lz) => ({ x: x + lx * c + lz * s, y: ly, z: z - lx * s + lz * c });
    const box = (x0, y0, z0, x1, y1, z1, col) => {
      g.box(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), { x: c, y: 0, z: -s }, { x: 0, y: 1, z: 0 }, { x: s, y: 0, z: c }, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, col);
    };
    for (const sx of [-0.9, 0.9]) for (const sz of [-0.5, 0.5]) box(sx - 0.04, 0, sz - 0.04, sx + 0.04, sz > 0 ? 1.55 : 1.85, sz + 0.04, wood);
    for (let k = 0; k < 6; k++) {
      const xa = -1.05 + k * 0.35, xb = xa + 0.35;
      g.quad(P(xa, 1.5, 0.8), P(xb, 1.5, 0.8), P(xb, 1.95, -0.6), P(xa, 1.95, -0.6), k % 2 ? ca : cb);
      g.quad(P(xb, 1.47, 0.8), P(xa, 1.47, 0.8), P(xa, 1.92, -0.6), P(xb, 1.92, -0.6), k % 2 ? ca : cb);
    }
    box(-0.85, 0.6, -0.4, 0.85, 0.72, 0.45, wood);
    box(-0.85, 0, -0.4, 0.85, 0.6, -0.35, lc('#5a3a26'));
    const goods = [['#e2702a', '#f08a3a'], ['#d43b2e', '#e85d4a'], ['#7fb04a', '#9cc35a'], ['#f2c83a', '#f6dc6a'], ['#9a5ad0', '#c48be0'], ['#c9d9e6', '#8fb3c4'], ['#e7d9b0', '#b58a5a']];
    for (let k = 0; k < 4; k++) {
      const [g1, g2] = rng.pick(goods);
      box(-0.75 + k * 0.4, 0.72, -0.25, -0.45 + k * 0.4, 0.8, 0.3, lc('#8a5a3b'));
      for (let q = 0; q < 3; q++) box(-0.72 + k * 0.4 + q * 0.09, 0.8, -0.18 + (q % 2) * 0.2, -0.64 + k * 0.4 + q * 0.09, 0.9, -0.08 + (q % 2) * 0.2, lc(q % 2 ? g1 : g2));
    }
    box(1.0, 0, 0.1, 1.35, 0.3, 0.45, lc('#b8935a'));
    box(-1.4, 0, -0.2, -1.05, 0.35, 0.2, lc('#8a5a3b'));
  }
  // central round flower bed
  g.cyl(0, -0.1, 0, 1.7, 0.35, lc('#9c917f'), 14, 1.7);
  g.cyl(0, 0.35, 0, 1.55, 0.45, lc('#5a4030'), 14, 1.55);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, rr = 0.4 + (i % 5) * 0.24;
    const col = lc(BLOOMS[i % BLOOMS.length]);
    g.abox(Math.cos(a) * rr - 0.1, 0.45, Math.sin(a) * rr - 0.1, Math.cos(a) * rr + 0.1, 0.62, Math.sin(a) * rr + 0.1, i % 3 ? col : lc('#5b8f3a'));
  }
  // paper lantern strings across the square
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + 0.4, a1 = a0 + Math.PI;
    const ax = Math.cos(a0) * (r + 0.4), az = Math.sin(a0) * (r + 0.4), bx = Math.cos(a1) * (r + 0.4), bz = Math.sin(a1) * (r + 0.4);
    if (i < 2) {
      g.cyl(ax, 0, az, 0.06, 3.2, wood, 6);
      g.cyl(bx, 0, bz, 0.06, 3.2, wood, 6);
    }
    for (let k = 1; k < 8; k++) {
      const f = k / 8;
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      const y = 3.0 - Math.sin(f * Math.PI) * 0.6;
      lamps.cyl(x, y - 0.32, z, 0.14, y, wood, 8, 0.14);
      if (k % 2) lights.push([x, y - 0.16, z]);
    }
  }
  return { lights };
}

function lanternPost(g, gl, lamps, w) {
  const wood = lc('#5a3a26');
  const lights = [];
  for (const side of [-1, 1]) {
    const z = side * (w + 0.4);
    g.cyl(0, 0, z, 0.06, 2.4, wood, 6);
    g.abox(-0.05, 2.25, Math.min(z, z - 0.25 * side), 0.05, 2.32, Math.max(z, z - 0.25 * side), wood);
    lamps.cyl(0, 1.75, z - 0.2 * side, 0.15, 2.2, wood, 8, 0.15);
    lights.push([0, 1.95, z - 0.2 * side]);
    g.abox(-0.6, 0, z + side * 0.1 - 0.25, 0.6, 0.25, z + side * 0.1 + 0.25, lc('#7a5a3a'));
    for (let i = 0; i < 5; i++) g.abox(-0.5 + i * 0.22, 0.25, z + side * 0.1 - 0.12, -0.38 + i * 0.22, 0.4, z + side * 0.1 + 0.12, lc(i % 2 ? BLOOMS[(i * 3) % BLOOMS.length] : '#5b8f3a'));
  }
  return { lights };
}

function teaRows(g, gl, lamps, f) {
  const green = lc('#3f6f35'), green2 = lc('#4e7f3f');
  for (let z = -f.hd + 0.6; z < f.hd - 0.4; z += f.rows) {
    for (let x = -f.hw + 0.6; x < f.hw - 0.6; x += 1.4) {
      g.box({ x, y: 0.35, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.72, 0.38, f.rows * 0.32, (Math.floor(x) & 1) ? green : green2);
    }
  }
  return {};
}

export { WATER };
