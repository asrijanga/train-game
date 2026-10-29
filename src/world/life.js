import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit } from '../trains/kit.js';
import { toon, toonGradient } from '../render/materials.js';
import { Rng } from '../core/rng.js';
import { HALF, WATER } from './terrain.js';

// Ambient life: drifting clouds, sailing boats, bird flocks and grazing sheep.
export class Life {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.group = new THREE.Group();
    this.group.name = 'life';
    this.rng = new Rng(game.seed * 41 + 1);
    this.clouds = [];
    this.boats = [];
    this.flocks = [];
    this.herds = [];
    this.makeClouds();
    this.makeBoats();
    this.makeBirds();
    this.makeSheep();
  }

  // ---------------------------------------------------------------- clouds
  makeClouds() {
    // big Ghibli cumulus: flat sunlit bases, billowing towers
    const rng = this.rng;
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient(), transparent: true, opacity: 0.95, depthWrite: false });
      const grp = new THREE.Group();
      const tower = rng.chance(0.35);
      const n = rng.int(7, 12);
      const W = rng.float(12, 22);
      for (let k = 0; k < n; k++) {
        const s = rng.float(5, 10) * (W / 16);
        const m = new THREE.Mesh(CLOUD_GEO, mat);
        const up = tower ? rng.float(0, 1) : rng.float(0, 0.35);
        m.position.set(rng.float(-W, W) * (1 - up * 0.6), up * W * (tower ? 1.4 : 0.6) + s * 0.3, rng.float(-W, W) * 0.5 * (1 - up * 0.5));
        m.scale.set(s * rng.float(1, 1.3), s * 0.8, s);
        m.castShadow = true;
        grp.add(m);
      }
      // flat base
      const base = new THREE.Mesh(CLOUD_GEO, mat);
      base.scale.set(W * 1.1, W * 0.18, W * 0.55);
      base.castShadow = true;
      grp.add(base);
      // merge the puffs into a single mesh: one draw call per cloud
      const geos = grp.children.map((c) => { c.updateMatrix(); return CLOUD_GEO.clone().applyMatrix4(c.matrix); });
      const merged = new THREE.Mesh(mergeGeometries(geos, false), mat);
      geos.forEach((g) => g.dispose());
      merged.castShadow = true;
      grp.clear();
      grp.add(merged);
      grp.position.set(rng.float(-HALF, HALF), rng.float(85, 120), rng.float(-HALF, HALF));
      this.group.add(grp);
      this.clouds.push({ grp, mat, speed: rng.float(1.5, 3) });
    }
  }

  // ---------------------------------------------------------------- boats
  isDeep(x, z, d = -1.2) {
    if (!this.terrain.inBounds(x, z, 2)) return Math.abs(x) < HALF * 1.25 && Math.abs(z) < HALF * 1.25;
    return this.terrain.heightAt(x, z) < d;
  }

  clearLine(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= L; s += 2) if (!this.isDeep(ax + (bx - ax) * s / L, az + (bz - az) * s / L)) return false;
    return true;
  }

  makeBoats() {
    const rng = this.rng;
    const sails = ['#f7f1e3', '#e8c8a0', '#c0392b', '#f7f1e3', '#2f5d8a'];
    const hulls = ['#8a5a3b', '#2f5d8a', '#f2ede0', '#2d2c30', '#a8433a'];
    let made = 0;
    for (let tries = 0; tries < 1200 && made < 18; tries++) {
      const x = rng.float(-HALF * 1.1, HALF * 1.1), z = rng.float(-HALF * 1.1, HALF * 1.1);
      if (!this.isDeep(x, z, -2)) continue;
      const k = new Kit();
      const hull = rng.pick(hulls);
      k.box(1.6, 0.3, 0.6, hull, 0, 0.1, 0);
      k.add(new THREE.ConeGeometry(0.3, 0.6, 4), hull, 1.05, 0.1, 0, 0, Math.PI / 4, -Math.PI / 2, 1, 1, 0.75);
      k.box(1.2, 0.05, 0.5, '#c08a57', -0.1, 0.27, 0);
      k.cyl(0.03, 2.2, '#5a3a24', 0.2, 1.3, 0, 'y', 5);
      const sail = new THREE.BufferGeometry();
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0.18, 0.4, 0, 0.18, 2.3, 0, -0.9, 0.45, 0, 0.18, 0.4, 0, -0.9, 0.45, 0, 0.18, 2.3, 0], 3));
      sail.computeVertexNormals();
      k.add(sail, rng.pick(sails));
      k.add(new THREE.BufferGeometry().copy(sail), '#ffffff', 0.4, 0, 0, 0, 0, 0, 0.6, 0.85, 1);
      const grp = k.build();
      grp.traverse((o) => { if (o.isMesh) o.material = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide }); });
      const b = { grp, x, z, heading: rng.float(0, 6.28), target: null, speed: rng.float(0.7, 1.3), phase: rng.float(0, 6) };
      grp.position.set(x, WATER, z);
      this.group.add(grp);
      this.boats.push(b);
      made++;
    }
  }

  updateBoats(dt, t) {
    for (const b of this.boats) {
      if (!b.target || Math.hypot(b.target.x - b.x, b.target.z - b.z) < 2) {
        for (let i = 0; i < 20; i++) {
          const a = this.rng.float(0, 6.28), r = this.rng.float(10, 50);
          const tx = b.x + Math.cos(a) * r, tz = b.z + Math.sin(a) * r;
          if (this.isDeep(tx, tz, -1.5) && this.clearLine(b.x, b.z, tx, tz)) { b.target = { x: tx, z: tz }; break; }
        }
        if (!b.target) continue;
      }
      const want = Math.atan2(b.target.z - b.z, b.target.x - b.x);
      let d = want - b.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.heading += Math.max(-0.4 * dt, Math.min(0.4 * dt, d));
      const v = b.speed * (0.5 + 0.5 * Math.cos(d));
      b.x += Math.cos(b.heading) * v * dt;
      b.z += Math.sin(b.heading) * v * dt;
      if (!this.isDeep(b.x, b.z, -0.6)) { b.x -= Math.cos(b.heading) * v * dt * 2; b.z -= Math.sin(b.heading) * v * dt * 2; b.target = null; }
      b.grp.position.set(b.x, WATER + Math.sin(t * 1.7 + b.phase) * 0.05, b.z);
      b.grp.rotation.set(Math.sin(t * 1.3 + b.phase) * 0.06, -b.heading, 0, 'YXZ');
    }
  }

  // ---------------------------------------------------------------- birds
  makeBirds() {
    // all birds share three instanced meshes (body, left wing, right wing)
    const rng = this.rng;
    const birds = [];
    for (let f = 0; f < 14; f++) {
      const gull = f < 2;
      const n = rng.int(5, 9);
      const fl = { cx: rng.float(-HALF * 0.8, HALF * 0.8), cz: rng.float(-HALF * 0.8, HALF * 0.8), r: rng.float(18, 40), y: rng.float(18, 34), w: rng.float(0.1, 0.2) * (rng.chance(0.5) ? 1 : -1), a: rng.float(0, 6.28), birds: [], drift: [rng.float(-1, 1), rng.float(-1, 1)] };
      for (let i = 0; i < n; i++) {
        const b = { i: birds.length, s: gull ? 0.9 : 0.6, gull, off: [rng.float(-4, 4), rng.float(-1.5, 1.5), rng.float(-4, 4)], ph: rng.float(0, 6) };
        fl.birds.push(b);
        birds.push(b);
      }
      this.flocks.push(fl);
    }
    const mat = toon('#ffffff', { side: THREE.DoubleSide });
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat, birds.length);
      m.frustumCulled = false;
      const c = new THREE.Color();
      for (const b of birds) m.setColorAt(b.i, c.set(b.gull ? '#f7f3ea' : '#3a3a42'));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    this.birdBody = mk(BIRD_BODY);
    this.birdL = mk(WING);
    this.birdR = mk(WING);
  }

  updateBirds(dt, t) {
    for (const fl of this.flocks) {
      fl.a += fl.w * dt;
      fl.cx += fl.drift[0] * dt * 0.8;
      fl.cz += fl.drift[1] * dt * 0.8;
      if (Math.abs(fl.cx) > HALF * 0.9) fl.drift[0] *= -1;
      if (Math.abs(fl.cz) > HALF * 0.9) fl.drift[1] *= -1;
      const hx = fl.cx + Math.cos(fl.a) * fl.r, hz = fl.cz + Math.sin(fl.a) * fl.r;
      const heading = fl.a + (fl.w > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const b of fl.birds) {
        const ox = b.off[0] * Math.cos(heading) - b.off[2] * Math.sin(heading);
        const oz = b.off[0] * Math.sin(heading) + b.off[2] * Math.cos(heading);
        V.set(hx + ox, fl.y + b.off[1] + Math.sin(t * 0.7 + b.ph) * 0.5, hz + oz);
        const flap = Math.sin(t * 7 + b.ph) * 0.6 * (0.5 + 0.5 * Math.sin(t * 0.4 + b.ph));
        BE.set(0, -heading, 0, 'YXZ');
        M.compose(V, Q.setFromEuler(BE), S.set(b.s, b.s, b.s));
        this.birdBody.setMatrixAt(b.i, M);
        BE.set(flap, -heading, 0, 'YXZ');
        M.compose(V, Q.setFromEuler(BE), S.set(b.s, b.s, b.s));
        this.birdL.setMatrixAt(b.i, M);
        BE.set(-flap, -heading, 0, 'YXZ');
        M.compose(V, Q.setFromEuler(BE), S.set(b.s, b.s, -b.s));
        this.birdR.setMatrixAt(b.i, M);
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdL.instanceMatrix.needsUpdate = true;
    this.birdR.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- sheep
  makeSheep() {
    const rng = this.rng;
    const t = this.terrain;
    const sheepGeo = (() => {
      const k = new Kit();
      k.add(new THREE.IcosahedronGeometry(1, 1), '#f4f1ea', 0, 0.42, 0, 0, 0, 0, 0.42, 0.3, 0.3);
      k.add(new THREE.IcosahedronGeometry(1, 0), '#f4f1ea', 0.15, 0.55, 0, 0, 0, 0, 0.25, 0.2, 0.22);
      k.box(0.18, 0.18, 0.15, '#2d2c30', 0.45, 0.48, 0);
      k.box(0.06, 0.04, 0.2, '#2d2c30', 0.42, 0.56, 0);
      for (const [x, z] of [[0.2, 0.12], [0.2, -0.12], [-0.2, 0.12], [-0.2, -0.12]]) k.box(0.05, 0.22, 0.05, '#2d2c30', x, 0.12, z);
      return k.build().children[0].geometry;
    })();
    const sheep = [];
    for (let tries = 0; tries < 1500 && this.herds.length < 22; tries++) {
      const x = rng.float(-HALF + 30, HALF - 30), z = rng.float(-HALF + 30, HALF - 30);
      const h = t.heightAt(x, z);
      if (h < 1.5 || h > 14 || t.slopeAt(x, z) > 0.3) continue;
      if (this.game.scenery && this.game.scenery.treeDensityAt(x, z, 8) > 0.15) continue;
      if (this.game.towns?.blocks(x, z)) continue;
      const herd = { x, z, sheep: [] };
      const n = rng.int(4, 8);
      for (let i = 0; i < n; i++) {
        const s = { x: x + rng.float(-4, 4), z: z + rng.float(-4, 4), h: rng.float(0, 6.28), walk: 0, timer: rng.float(0, 5), herd };
        herd.sheep.push(s);
        sheep.push(s);
      }
      this.herds.push(herd);
    }
    this.sheep = sheep;
    this.sheepMesh = new THREE.InstancedMesh(sheepGeo, toon('#ffffff', { vertexColors: true }), Math.max(1, sheep.length));
    this.sheepMesh.castShadow = true;
    this.sheepMesh.count = sheep.length;
    this.group.add(this.sheepMesh);
  }

  updateSheep(dt, t) {
    const m = M, net = this.game.rail?.net;
    this.sheep.forEach((s, i) => {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = this.rng.float(2, 7);
        s.walk = this.rng.chance(0.45) ? this.rng.float(0.25, 0.5) : 0;
        const toHome = Math.atan2(s.herd.z - s.z, s.herd.x - s.x);
        const far = Math.hypot(s.herd.x - s.x, s.herd.z - s.z) > 6;
        s.h = far ? toHome : s.h + this.rng.float(-1.2, 1.2);
        if (net && net.edges.size) {
          const hit = net.nearestEdge(s.x, s.z, 3);
          if (hit) {
            const p = hit.edge.sample(hit.d, {});
            s.h = Math.atan2(s.z - p.z, s.x - p.x);
            s.walk = 0.6;
          }
        }
      }
      s.x += Math.cos(s.h) * s.walk * dt;
      s.z += Math.sin(s.h) * s.walk * dt;
      const y = this.terrain.groundAt(s.x, s.z);
      const bob = s.walk ? Math.abs(Math.sin(t * 8 + i)) * 0.04 : 0;
      m.compose(V.set(s.x, y + bob, s.z), Q.setFromAxisAngle(UP, -s.h), S.set(1, 1, 1));
      this.sheepMesh.setMatrixAt(i, m);
    });
    this.sheepMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, t, cam) {
    for (const c of this.clouds) {
      c.grp.position.x += c.speed * dt;
      c.grp.position.z += c.speed * 0.35 * dt;
      if (c.grp.position.x > HALF * 1.3) c.grp.position.x = -HALF * 1.3;
      if (c.grp.position.z > HALF * 1.3) c.grp.position.z = -HALF * 1.3;
      // fade clouds the camera is close to, so they never block the view
      const d = cam.position.distanceTo(c.grp.position);
      c.mat.opacity = THREE.MathUtils.clamp((d - 40) / 80, 0, 0.95);
      c.grp.visible = c.mat.opacity > 0.02;
    }
    this.updateBoats(dt, t);
    this.updateBirds(dt, t);
    this.updateSheep(dt, t);
  }
}

const CLOUD_GEO = new THREE.IcosahedronGeometry(1, 2);
const BIRD_BODY = new THREE.BoxGeometry(0.5, 0.1, 0.12);
const WING = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.15, 0, 0, -0.15, 0, 0, -0.05, 0, 0.75], 3));
  g.computeVertexNormals();
  return g;
})();
const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BE = new THREE.Euler();
