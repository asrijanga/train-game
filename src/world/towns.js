import * as THREE from 'three';
import { GeoBuilder, lc } from '../render/geo.js';
import { toon } from '../render/materials.js';
import { windowMat, labelTexture } from '../render/shared.js';
import { Rng, clamp } from '../core/rng.js';
import { HALF, WATER } from './terrain.js';

const WALLS = ['#f1e6c8', '#f6f1e6', '#efd9a6', '#e8c8a0', '#d9d2c2', '#c97b5a', '#f3e3d0', '#e6d3b0'];
const ROOFS = ['#a8433a', '#8e3b30', '#5c6470', '#6b4a3a', '#b25a3c', '#4f5a52'];
const DOORS = ['#2f5d8a', '#2f6b4f', '#8a2a1e', '#5a3324', '#c08a3a'];
const CROPS = [
  { a: [0.86, 0.72, 0.36], b: [0.78, 0.62, 0.3] }, // wheat
  { a: [0.9, 0.82, 0.5], b: [0.83, 0.75, 0.45] }, // barley
  { a: [0.42, 0.6, 0.3], b: [0.55, 0.45, 0.3] }, // cabbages in rows
  { a: [0.58, 0.48, 0.72], b: [0.4, 0.5, 0.3] }, // lavender
  { a: [0.55, 0.42, 0.3], b: [0.47, 0.35, 0.25] }, // ploughed
  { a: [0.6, 0.72, 0.34], b: [0.5, 0.64, 0.3] }, // young green
];
const PRE = ['Little ', 'Upper ', 'Great ', 'Lower ', 'Old ', '', '', '', 'East ', 'West '];
const BASE = ['Puddlecombe', 'Tidmouth', 'Wellsworth', 'Bramblewick', 'Hollowfield', 'Mossby', 'Fairhaven', 'Cobblestead', 'Thornbury', 'Larkspur', 'Dunmere', 'Ravenhill', 'Applecross', 'Pennydale', 'Kettlewell'];

export class Towns {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.group = new THREE.Group();
    this.group.name = 'towns';
    this.list = [];
    this.fields = [];
    this.streets = [];
    this.sails = [];
  }

  generate() {
    const t = this.terrain;
    const rng = new Rng(t.seed * 23 + 9);
    const sites = [];
    for (let i = 0; i < 600 && sites.length < 5; i++) {
      const x = rng.float(-HALF + 45, HALF - 45), z = rng.float(-HALF + 45, HALF - 45);
      const h = t.heightAt(x, z);
      if (h < 1.8 || h > 10) continue;
      let ok = true;
      for (let a = 0; a < 8 && ok; a++) {
        const ang = (a / 8) * Math.PI * 2;
        for (const r of [6, 13]) {
          const hh = t.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
          if (hh < 0.8 || Math.abs(hh - h) > 1.6) ok = false;
        }
      }
      if (!ok) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < 80)) continue;
      sites.push({ x, z });
    }
    const names = new Set();
    sites.forEach((s, i) => {
      let name;
      for (let k = 0; k < 20; k++) { name = rng.pick(PRE) + rng.pick(BASE); if (!names.has(name)) break; }
      names.add(name);
      this.makeTown(s.x, s.z, i === 0, name, rng);
    });
    t.painters.push((x, z, out) => this.paint(x, z, out));
  }

  makeTown(cx, cz, big, name, rng) {
    const town = { x: cx, z: cz, big, name, houses: [], ang: rng.float(0, Math.PI), radius: big ? 24 : 15 };
    const ang = town.ang;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const streets = [{ x0: cx - dx * town.radius, z0: cz - dz * town.radius, x1: cx + dx * town.radius, z1: cz + dz * town.radius }];
    if (big) streets.push({ x0: cx + dz * 16, z0: cz - dx * 16, x1: cx - dz * 16, z1: cz + dx * 16 });
    this.streets.push(...streets);
    let id = 0;
    for (const s of streets) {
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const ux = (s.x1 - s.x0) / L, uz = (s.z1 - s.z0) / L;
      for (let d = 2; d < L - 2; d += rng.float(3.2, 4.4)) {
        for (const side of [-1, 1]) {
          if (rng.chance(0.18)) continue;
          const off = 3.1 + rng.float(0, 0.6);
          const hx = s.x0 + ux * d - uz * side * off, hz = s.z0 + uz * d + ux * side * off;
          if (Math.hypot(hx - cx, hz - cz) < 4.5 && big) continue; // square in the middle
          if (town.houses.some((h) => Math.hypot(h.x - hx, h.z - hz) < 2.9)) continue;
          const g = this.terrain.heightAt(hx, hz);
          if (g < 0.8) continue;
          town.houses.push({
            id: id++, x: hx, z: hz, rot: Math.atan2(uz * side, -ux * side),
            w: rng.float(2.0, 2.8), d: rng.float(1.7, 2.3), h: rng.chance(0.25) ? rng.float(2.3, 2.7) : rng.float(1.3, 1.7),
            wall: rng.pick(WALLS), roof: rng.pick(ROOFS), door: rng.pick(DOORS), chimney: rng.chance(0.7), timber: rng.chance(0.2),
            fence: rng.chance(0.3), hidden: false,
          });
        }
      }
    }
    if (big) {
      town.church = { x: cx + dz * 6.5 + dx * 7, z: cz - dx * 6.5 + dz * 7, rot: ang, hidden: false };
    }
    // a windmill on the outskirts
    const wa = rng.float(0, Math.PI * 2), wr = town.radius + rng.float(8, 16);
    const wx = cx + Math.cos(wa) * wr, wz = cz + Math.sin(wa) * wr;
    if (this.terrain.heightAt(wx, wz) > 1.2) town.mill = { x: wx, z: wz, rot: rng.float(0, Math.PI * 2), hidden: false };
    // fields
    const nf = big ? 7 : 4;
    for (let i = 0; i < nf; i++) {
      const fa = rng.float(0, Math.PI * 2), fr = town.radius + rng.float(8, 28);
      const fx = cx + Math.cos(fa) * fr, fz = cz + Math.sin(fa) * fr;
      const hw = rng.float(5, 10), hd = rng.float(4, 8);
      const h = this.terrain.heightAt(fx, fz);
      if (h < 1.2 || this.terrain.slopeAt(fx, fz) > 0.25) continue;
      this.fields.push({ x: fx, z: fz, hw, hd, ang: ang + rng.float(-0.4, 0.4), crop: rng.pick(CROPS), rows: rng.float(1.3, 2.4) });
    }
    this.list.push(town);
    this.buildTown(town);
  }

  // ------------------------------------------------------------ painting
  inField(x, z) {
    for (const f of this.fields) {
      const lx = (x - f.x) * Math.cos(f.ang) + (z - f.z) * Math.sin(f.ang);
      const lz = -(x - f.x) * Math.sin(f.ang) + (z - f.z) * Math.cos(f.ang);
      if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) return { f, lx, lz };
    }
    return null;
  }

  nearStreet(x, z) {
    let best = Infinity;
    for (const s of this.streets) {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
      const tt = clamp(((x - s.x0) * dx + (z - s.z0) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(s.x0 + dx * tt - x, s.z0 + dz * tt - z));
    }
    return best;
  }

  paint(x, z, out) {
    const fi = this.inField(x, z);
    if (fi) {
      const { f, lx, lz } = fi;
      const stripe = Math.sin(lz * Math.PI / f.rows * 2) > 0;
      const c = stripe ? f.crop.a : f.crop.b;
      const edge = Math.min(f.hw - Math.abs(lx), f.hd - Math.abs(lz));
      const k = clamp(edge / 1.2, 0, 1);
      out.r += (c[0] - out.r) * k; out.g += (c[1] - out.g) * k; out.b += (c[2] - out.b) * k;
    }
    const sd = this.nearStreet(x, z);
    if (sd < 1.6) {
      const k = clamp((1.6 - sd) / 0.8, 0, 1) * 0.85;
      out.r += (0.74 - out.r) * k; out.g += (0.65 - out.g) * k; out.b += (0.48 - out.b) * k;
    }
    for (const tw of this.list) {
      if (!tw.big) continue;
      const d = Math.hypot(x - tw.x, z - tw.z);
      if (d < 4.5) {
        const k = clamp((4.5 - d) / 1.2, 0, 1) * 0.8;
        out.r += (0.78 - out.r) * k; out.g += (0.73 - out.g) * k; out.b += (0.62 - out.b) * k;
      }
    }
  }

  // Keep trees off streets, gardens and fields.
  blocks(x, z) {
    if (this.inField(x, z)) return true;
    if (this.nearStreet(x, z) < 5.5) return true;
    for (const tw of this.list) {
      if (tw.mill && Math.hypot(x - tw.mill.x, z - tw.mill.z) < 4) return true;
      if (tw.church && Math.hypot(x - tw.church.x, z - tw.church.z) < 7) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ meshes
  buildTown(town) {
    if (town.view) {
      this.group.remove(town.view);
      town.view.traverse((o) => o.isMesh && o.geometry.dispose());
      this.sails = this.sails.filter((s) => s.town !== town);
    }
    const solid = new GeoBuilder(), glass = new GeoBuilder();
    const m = new THREE.Matrix4();
    town.chimneys = [];
    for (const h of town.houses) {
      if (h.hidden) continue;
      const gb = new GeoBuilder(), gg = new GeoBuilder();
      house(gb, gg, h);
      const y = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => this.terrain.heightAt(h.x + a * h.w / 2, h.z + b * h.d / 2))) - 0.05;
      m.makeRotationY(h.rot).setPosition(h.x, y, h.z);
      if (h.chimney) town.chimneys.push(new THREE.Vector3(h.w / 2 - 0.42, h.h + 1.5, -0.02).applyMatrix4(m));
      solid.append(gb, m);
      glass.append(gg, m);
    }
    if (town.church && !town.church.hidden) {
      const c = town.church;
      const gb = new GeoBuilder(), gg = new GeoBuilder();
      church(gb, gg);
      m.makeRotationY(-c.rot).setPosition(c.x, this.terrain.heightAt(c.x, c.z) - 0.1, c.z);
      solid.append(gb, m);
      glass.append(gg, m);
    }
    const grp = new THREE.Group();
    if (town.mill && !town.mill.hidden) {
      const c = town.mill;
      const gb = new GeoBuilder(), gg = new GeoBuilder();
      windmill(gb, gg);
      const y = this.terrain.heightAt(c.x, c.z) - 0.1;
      m.makeRotationY(c.rot).setPosition(c.x, y, c.z);
      solid.append(gb, m);
      glass.append(gg, m);
      const sails = makeSails();
      sails.position.set(c.x, y + 5.2, c.z);
      sails.rotation.y = c.rot;
      sails.children[0].position.z = 1.15;
      grp.add(sails);
      this.sails.push({ town, mesh: sails.children[0] });
    }
    if (solid.n) {
      const mesh = new THREE.Mesh(solid.build(), toon('#ffffff', { vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      grp.add(mesh);
    }
    if (glass.n) grp.add(new THREE.Mesh(glass.build(), windowMat));
    // label
    const lbl = labelTexture(town.name, { font: 'italic 700 60px Caveat, cursive', bg: 'rgba(240,232,210,0.85)' });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lbl.tex, transparent: true, depthTest: false, sizeAttenuation: false }));
    sp.scale.set((0.038 * lbl.w) / lbl.h, 0.038, 1);
    sp.position.set(town.x, this.terrain.heightAt(town.x, town.z) + 12, town.z);
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
      let changed = false;
      const objs = [...town.houses];
      if (town.church) objs.push({ ...town.church, ref: town.church, size: 6 });
      if (town.mill) objs.push({ ...town.mill, ref: town.mill, size: 2.5 });
      for (const o of objs) {
        const ref = o.ref || o;
        if (ref.hidden) continue;
        const size = o.size ?? Math.max(o.w, o.d) * 0.6;
        for (let i = 0; i < n; i += 2) {
          if (Math.hypot(pts[i * 3] - o.x, pts[i * 3 + 2] - o.z) < radius + size) { ref.hidden = true; changed = true; break; }
        }
      }
      if (changed) this.buildTown(town);
    }
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
      c: !!t.church?.hidden, m: !!t.mill?.hidden,
    }));
  }

  restore(s) {
    this.list.forEach((t, i) => {
      const d = s[i];
      if (!d) return;
      const hid = new Set(d.h);
      for (const h of t.houses) h.hidden = hid.has(h.id);
      if (t.church) t.church.hidden = d.c;
      if (t.mill) t.mill.hidden = d.m;
      this.buildTown(t);
    });
  }

  update(dt) {
    for (const s of this.sails) s.mesh.rotation.z += dt * 0.6;
  }

  setLabelOpacity(o) {
    for (const t of this.list) if (t.label) { t.label.material.opacity = o; t.label.visible = o > 0.02; }
  }
}

// ---------------------------------------------------------------- buildings
function house(g, gl, h) {
  const { w, d } = h;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const wall = lc(h.wall), roof = lc(h.roof), trim = lc('#f7f3ea'), dark = lc('#4a3a30');
  g.abox(x0 - 0.05, -0.3, z0 - 0.05, x1 + 0.05, 0.15, z1 + 0.05, lc('#9c917f'));
  g.abox(x0, 0.15, z0, x1, h.h, z1, wall);
  if (h.timber) {
    for (let x = x0 + 0.3; x < x1; x += 0.55) g.abox(x - 0.04, 0.15, z1, x + 0.04, h.h, z1 + 0.03, dark);
    g.abox(x0, h.h * 0.55, z1, x1, h.h * 0.55 + 0.08, z1 + 0.03, dark);
  }
  g.gable(x0, x1, z0, z1, h.h, 0.9 + d * 0.1, roof, wall, 0.22);
  // door at the front (+z faces the street)
  g.abox(-0.25, 0.15, z1, 0.25, 1.05, z1 + 0.05, lc(h.door));
  g.abox(-0.32, 1.05, z1, 0.32, 1.12, z1 + 0.09, trim);
  // windows
  const wy = h.h > 2 ? [0.75, 1.75] : [0.85];
  for (const y of wy) for (const x of [x0 + 0.5, x1 - 0.5]) {
    g.abox(x - 0.27, y - 0.25, z1, x + 0.27, y + 0.25, z1 + 0.03, trim);
    gl.abox(x - 0.2, y - 0.19, z1 + 0.03, x + 0.2, y + 0.19, z1 + 0.05, trim);
    g.abox(x - 0.3, y - 0.3, z1, x + 0.3, y - 0.25, z1 + 0.1, trim);
  }
  for (const y of wy) {
    gl.abox(-0.2, y - 0.19, z0 - 0.05, 0.2, y + 0.19, z0 - 0.03, trim);
    gl.abox(x1 + 0.03, y - 0.19, -0.2, x1 + 0.05, y + 0.19, 0.2, trim);
  }
  if (h.chimney) {
    g.abox(x1 - 0.6, h.h + 0.3, -0.2, x1 - 0.25, h.h + 1.35, 0.15, lc('#a5523c'));
    g.abox(x1 - 0.65, h.h + 1.35, -0.25, x1 - 0.2, h.h + 1.45, 0.2, lc('#8f4532'));
  }
  if (h.fence) {
    for (let x = x0 - 0.6; x <= x1 + 0.6; x += 0.3) g.abox(x - 0.025, 0, z1 + 1.1, x + 0.025, 0.45, z1 + 1.15, trim);
    g.abox(x0 - 0.6, 0.3, z1 + 1.1, x1 + 0.6, 0.35, z1 + 1.16, trim);
  }
}

function church(g, gl) {
  const stone = lc('#cfc4ad'), stoneD = lc('#a99d86'), roof = lc('#5c6470');
  // nave along x
  g.abox(-3.2, -0.3, -1.5, 2.6, 2.6, 1.5, stone);
  g.gable(-3.2, 2.6, -1.5, 1.5, 2.6, 1.8, roof, stone, 0.25);
  // tower + spire at +x
  g.abox(2.6, -0.3, -1.0, 4.6, 5.2, 1.0, stone);
  g.abox(2.5, 5.2, -1.1, 4.7, 5.5, 1.1, stoneD);
  g.hip(2.6, 4.6, -1.0, 1.0, 5.5, 4.2, roof, 0.05);
  g.cyl(3.6, 9.7, 0, 0.04, 10.6, lc('#d0a443'), 4, 0.04);
  g.abox(3.6 - 0.22, 10.2, -0.03, 3.6 + 0.22, 10.27, 0.03, lc('#d0a443'));
  // arched-ish windows
  for (const x of [-2.4, -1.2, 0, 1.2]) for (const z of [-1.52, 1.52]) {
    gl.abox(x - 0.22, 0.8, Math.min(z, z * 1.02), x + 0.22, 1.9, Math.max(z, z * 1.02), stone);
    g.abox(x - 0.3, 1.9, Math.min(z, z * 1.03), x + 0.3, 2.05, Math.max(z, z * 1.03), stoneD);
  }
  gl.abox(4.6, 3.6, -0.3, 4.65, 4.4, 0.3, stone);
  g.abox(-3.25, -0.1, -0.45, -3.2, 1.6, 0.45, lc('#5a3324'));
  // graveyard stones
  for (let i = 0; i < 6; i++) g.abox(-2.5 + i * 0.9, -0.1, 2.3 + (i % 2) * 0.6, -2.3 + i * 0.9, 0.5, 2.38 + (i % 2) * 0.6, stoneD);
}

function windmill(g, gl) {
  const white = lc('#f2ede0'), roof = lc('#5a4a40'), wood = lc('#8a5a3b');
  g.cyl(0, -0.2, 0, 1.6, 4.8, white, 10, 1.05);
  g.cyl(0, 4.8, 0, 1.15, 6.3, roof, 10, 0.1);
  g.abox(-0.4, -0.1, 1.38, 0.4, 1.3, 1.48, wood);
  gl.abox(-0.22, 2.6, 1.2, 0.22, 3.2, 1.32, white);
  // gallery
  g.cyl(0, 2.2, 0, 1.75, 2.32, wood, 12, 1.75);
}

function makeSails() {
  const grp = new THREE.Group();
  const mat = toon('#ffffff', { vertexColors: true });
  const k = new GeoBuilder();
  const sail = lc('#efe6d2'), frame = lc('#7a5a3a');
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const ax = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const ay = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
    k.box({ x: ax.x * 2.2, y: ax.y * 2.2, z: 0 }, ax, ay, Z, 2.2, 0.06, 0.06, frame);
    k.box({ x: ax.x * 2.6 + ay.x * 0.35, y: ax.y * 2.6 + ay.y * 0.35, z: 0.02 }, ax, ay, Z, 1.6, 0.32, 0.02, sail);
  }
  k.cyl(0, -0.1, 0, 0.18, 0.1, frame, 8);
  const mesh = new THREE.Mesh(k.build(), mat);
  mesh.castShadow = true;
  grp.add(mesh);
  return grp;
}

export { WATER };
