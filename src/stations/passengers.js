import * as THREE from 'three';
import { Kit } from '../trains/kit.js';
import { toon } from '../render/materials.js';
import { labelTexture } from '../render/shared.js';
import { PLAT_Z0, PLAT_Z1, PLAT_H } from './styles.js';
import { Rng } from '../core/rng.js';

const MAX = 700;
const COATS = ['#b8322a', '#2f5d8a', '#2f6b4f', '#d8962c', '#6b4a7a', '#3a3a42', '#c97b5a', '#8a5a3b', '#e7d9b0', '#4f7f9a'];
const MAX_VISIBLE = 14;

// Little travellers: they gather on platforms, board and alight, and the
// towns they come from slowly grow as the railway serves them.
export class Passengers {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(game.seed * 5 + 77);
    const body = new Kit();
    body.cyl(0.11, 0.42, '#ffffff', 0, 0.42, 0, 'y', 8, 0.08);
    body.cyl(0.13, 0.12, '#ffffff', 0, 0.2, 0, 'y', 8, 0.12);
    body.box(0.07, 0.2, 0.06, '#3a3a42', 0, 0.08, 0.05);
    body.box(0.07, 0.2, 0.06, '#3a3a42', 0, 0.08, -0.05);
    const head = new Kit();
    head.sphere(0.075, '#f1c9a5', 0, 0.71, 0);
    head.cyl(0.085, 0.02, '#2d2c30', 0, 0.76, 0, 'y', 10);
    head.cyl(0.055, 0.07, '#2d2c30', 0, 0.8, 0, 'y', 10);
    this.bodyMesh = new THREE.InstancedMesh(body.build().children[0].geometry, toon('#ffffff', { vertexColors: true }), MAX);
    this.headMesh = new THREE.InstancedMesh(head.build().children[0].geometry, toon('#ffffff', { vertexColors: true }), MAX);
    for (const m of [this.bodyMesh, this.headMesh]) { m.count = 0; m.castShadow = true; m.frustumCulled = false; }
    this.group = new THREE.Group();
    this.group.add(this.bodyMesh, this.headMesh);
    this.people = []; // { x, y, z, tx, tz, face, state, color, st, life }
    this.pops = [];
    this.col = new THREE.Color();
  }

  // local station frame → world
  frame(st) {
    return this.game.stations.frame(st);
  }

  catchment(st) {
    const c = st.center;
    let pop = 4;
    for (const t of this.game.towns.list) {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < 70) pop += (t.houses.filter((h) => !h.hidden).length + (t.extra || 0)) * (1 - d / 70) * 1.6;
    }
    if (st.style === 'grand') pop *= 1.5;
    return pop;
  }

  spawnWaiting(st) {
    const m = this.frame(st);
    const L = st.length;
    const lx = this.rng.float(-L / 2 + 1.2, L / 2 - 1.2), lz = this.rng.float(PLAT_Z0 + 0.45, PLAT_Z1 - 0.35);
    const v = new THREE.Vector3(lx, PLAT_H, lz).applyMatrix4(m);
    const f = new THREE.Vector3(0, 0, -1).transformDirection(m);
    this.people.push({ x: v.x, y: v.y, z: v.z, face: Math.atan2(f.x, f.z) + this.rng.float(-0.6, 0.6), state: 'wait', color: this.rng.pick(COATS), st, ph: this.rng.float(0, 6) });
  }

  update(dt, t) {
    // trickle of new travellers
    for (const st of this.game.stations.list) {
      if (!st.center) continue;
      if (st.waiting === undefined) st.waiting = 0;
      st._acc = (st._acc || 0) + dt * this.catchment(st) * 0.012;
      while (st._acc > 1) {
        st._acc -= 1;
        if (st.waiting < 60) st.waiting++;
      }
      st._shown = 0;
    }
    for (const p of this.people) if (p.state === 'wait' && p.st) p.st._shown = (p.st._shown || 0) + 1;
    for (const st of this.game.stations.list) {
      if (st.center && st._shown < Math.min(st.waiting, MAX_VISIBLE) && this.people.length < MAX - 20) this.spawnWaiting(st);
    }
    // walk (compacting the list in place)
    let w = 0;
    const keep = { push: (p) => { this.people[w++] = p; } };
    for (const p of this.people) {
      if (p.state === 'walk' || p.state === 'board' || p.state === 'leave') {
        if (p.delay > 0) { p.delay -= dt; keep.push(p); continue; }
        const dx = p.tx - p.x, dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) {
          if (p.state === 'board' || p.state === 'leave') continue; // vanish into train / building
          p.state = 'wait';
        } else {
          const sp = Math.min(d, 1.3 * dt);
          p.x += (dx / d) * sp;
          p.z += (dz / d) * sp;
          p.face = Math.atan2(dx, dz);
          p.step = (p.step || 0) + sp;
        }
      }
      if (p.st && !p.st.view) continue;
      keep.push(p);
    }
    this.people.length = w;
    const n = Math.min(MAX, this.people.length);
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      const bob = p.step ? Math.abs(Math.sin(p.step * 6)) * 0.05 : 0;
      const sway = p.state === 'wait' ? Math.sin(t * 1.3 + p.ph) * 0.04 : 0;
      M.compose(V.set(p.x, p.y + bob, p.z), Q.setFromEuler(E.set(0, p.face, sway)), S.set(1, 1, 1));
      this.bodyMesh.setMatrixAt(i, M);
      this.headMesh.setMatrixAt(i, M);
      this.bodyMesh.setColorAt(i, this.col.set(p.color));
    }
    this.bodyMesh.count = this.headMesh.count = n;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    // floating "+n" notes
    this.pops = this.pops.filter((s) => {
      s.age += dt;
      s.sprite.position.y += dt * 1.2;
      s.sprite.material.opacity = Math.max(0, 1 - s.age / 2.5);
      if (s.age > 2.5) { this.group.remove(s.sprite); s.sprite.material.map.dispose(); s.sprite.material.dispose(); return false; }
      return true;
    });
  }

  doorPoints(train, st) {
    const m = this.frame(st);
    const inv = new THREE.Matrix4().copy(m).invert();
    const pts = [];
    for (const v of train.vehicles) {
      if (!v.spec.passengers) continue;
      const lp = v.group.position.clone().applyMatrix4(inv);
      for (const dx of [-1.2, 1.2]) {
        const w = new THREE.Vector3(lp.x + dx, PLAT_H, PLAT_Z0 + 0.2).applyMatrix4(m);
        pts.push(w);
      }
    }
    return pts;
  }

  onArrive(train, st) {
    if (!st || !st.center) return;
    const cap = train.capacity;
    const m = this.frame(st);
    const doors = this.doorPoints(train, st);
    // alight
    let alight = 0;
    if (train.passengers > 0) alight = Math.max(1, Math.round(train.passengers * this.rng.float(0.35, 0.8)));
    train.passengers -= alight;
    st.served = (st.served || 0) + alight;
    const exit = new THREE.Vector3(this.rng.float(-1, 1), PLAT_H, PLAT_Z1 + 0.6).applyMatrix4(m);
    for (let i = 0; i < Math.min(alight, 10) && doors.length; i++) {
      const d = doors[i % doors.length];
      this.people.push({ x: d.x, y: d.y, z: d.z, tx: exit.x + this.rng.float(-1.5, 1.5), tz: exit.z + this.rng.float(-0.5, 0.5), state: 'leave', color: this.rng.pick(COATS), st, delay: i * 0.35, ph: 0, face: 0 });
    }
    // board
    const board = Math.min(st.waiting || 0, Math.max(0, cap - train.passengers));
    st.waiting = (st.waiting || 0) - board;
    train.passengers += board;
    if (doors.length) {
      let k = 0;
      for (const p of this.people) {
        if (k >= board) break;
        if (p.st !== st || p.state !== 'wait') continue;
        let best = doors[0], bd = Infinity;
        for (const d of doors) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd) { bd = dd; best = d; } }
        p.state = 'board';
        p.tx = best.x; p.tz = best.z;
        p.delay = 1.2 + k * 0.25;
        k++;
      }
    }
    // freight: load timber at lumber halts and coal at mountain stations; unload in towns
    this.handleCargo(train, st);
    // towns grow when served
    if (alight > 0) {
      this.pop(st, `+${alight}`);
      this.game.towns.served(st.center, alight);
    }
  }

  handleCargo(train, st) {
    const loads = { forest: 'timber', alpine: 'coal', country: 'milk', lakeside: 'goods' }[st.style];
    let delivered = 0;
    for (const v of train.vehicles) {
      const c = v.spec.cargo;
      if (!c) continue;
      if (v.loaded && loads !== c) { v.loaded = false; delivered++; }
      else if (!v.loaded && loads === c) v.loaded = true;
      if (v.cargoMesh) v.cargoMesh.visible = !!v.loaded;
    }
    if (delivered) {
      st.goods = (st.goods || 0) + delivered;
      this.game.cargoDelivered = (this.game.cargoDelivered || 0) + delivered;
      this.pop(st, `+${delivered} ${delivered > 1 ? 'loads' : 'load'}`, '#5a3a1e');
    }
  }

  pop(st, text, color = '#2f6b4f') {
    const { tex, w, h } = labelTexture(text, { banner: false, font: '700 64px Caveat, cursive', color });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: false }));
    sp.scale.set((0.04 * w) / h, 0.04, 1);
    sp.position.copy(st.center).add(new THREE.Vector3(0, 4, 0));
    sp.layers.set(1);
    sp.renderOrder = 40;
    this.group.add(sp);
    this.pops.push({ sprite: sp, age: 0 });
  }

  clear() {
    this.people = [];
  }
}

const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
