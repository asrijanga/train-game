import * as THREE from 'three';
import { GeoBuilder, lc } from '../render/geo.js';
import { toon } from '../render/materials.js';
import { windowMat, lampMat, roofGlassMat, glowMat, labelTexture } from '../render/shared.js';
import { buildStationGeometry, STYLES, STYLE_ORDER, PLAT_Z0, PLAT_Z1, PLAT_H } from './styles.js';
import { stationName } from './names.js';
import { applyEarthworks, BED_DEPTH } from '../rail/earthworks.js';
import { KIND_GROUND } from '../rail/network.js';
import { Rng } from '../core/rng.js';
import { WATER } from '../world/terrain.js';

const clockFaceTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#fbf6e6';
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b2a33'; g.lineWidth = 5; g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 ? 3 : 6;
      g.beginPath();
      g.moveTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46);
      g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56);
      g.stroke();
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

export class Station {
  constructor(data) {
    Object.assign(this, data);
    this.view = null;
    this.waiting = data.waiting ?? 0;
    this.served = data.served ?? 0;
  }
}

export class StationSystem {
  constructor(game) {
    this.game = game;
    this.rail = game.rail;
    this.terrain = game.terrain;
    this.list = [];
    this.nextId = 1;
    this.group = new THREE.Group();
    this.group.name = 'stations';
    this.rng = new Rng(game.seed * 13 + 5);
    this.clocks = [];
  }

  byId(id) {
    return this.list.find((s) => s.id === id);
  }

  onEdge(edge) {
    return this.list.filter((s) => s.edge === edge);
  }

  blocks(edge, d, pad = 1) {
    return this.list.some((s) => s.edge === edge && Math.abs(s.d - d) < s.length / 2 + pad);
  }

  // Station span may extend onto neighbouring edges? Keep it simple: one edge.
  canPlace(edge, d, length) {
    if (edge.length < 12) return { ok: false, reason: 'That stretch is too short for a station' };
    const L = Math.min(length, edge.length - 1);
    const c = Math.min(Math.max(d, L / 2 + 0.5), edge.length - L / 2 - 0.5);
    for (const s of this.onEdge(edge)) {
      if (Math.abs(s.d - c) < (s.length + L) / 2 + 1) return { ok: false, reason: 'There\'s already a station here' };
    }
    // need solid ground (no bridges/tunnels) along the platform
    const smp = {};
    for (let x = c - L / 2; x <= c + L / 2; x += 1) {
      edge.sample(x, smp);
      if (smp.kind !== KIND_GROUND) return { ok: false, reason: 'Stations need solid ground — not bridges or tunnels' };
    }
    return { ok: true, d: c, length: L };
  }

  pickStyle(x, z) {
    const t = this.terrain;
    let water = 0, high = 0;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (const r of [6, 12]) {
        const h = t.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
        if (h < WATER) water++;
      }
    }
    const y = t.heightAt(x, z);
    if (y > 16) high = 1;
    const forest = this.game.scenery?.treeDensityAt?.(x, z, 10) ?? 0;
    const town = this.game.scenery?.nearestTown?.(x, z, 30);
    if (high) return 'alpine';
    if (water >= 3) return 'lakeside';
    if (forest > 0.35) return 'forest';
    if (town) return town.big ? 'grand' : 'village';
    return 'country';
  }

  place(edge, d, side, style) {
    const s0 = edge.sample(d, {});
    style = style || this.pickStyle(s0.x - s0.tz * side * 4, s0.z + s0.tx * side * 4);
    const chk = this.canPlace(edge, d, STYLES[style].length);
    if (!chk.ok) return chk;
    const taken = new Set(this.list.map((s) => s.name));
    const st = new Station({
      id: this.nextId++,
      name: stationName(this.rng, style, taken),
      edge, d: chk.d, side, length: chk.length, style,
    });
    this.list.push(st);
    this.earthworks(st);
    this.buildView(st);
    return { ok: true, station: st };
  }

  remove(st) {
    this.disposeView(st);
    this.list = this.list.filter((s) => s !== st);
    this.game.trains?.onStationRemoved?.(st);
  }

  setStyle(st, style) {
    st.style = style;
    st.length = Math.min(STYLES[style].length, st.edge.length - 1);
    st.d = Math.min(Math.max(st.d, st.length / 2 + 0.5), st.edge.length - st.length / 2 - 0.5);
    this.earthworks(st);
    this.buildView(st);
  }

  cycleStyle(st) {
    const i = STYLE_ORDER.indexOf(st.style);
    this.setStyle(st, STYLE_ORDER[(i + 1) % STYLE_ORDER.length]);
  }

  frame(st) {
    const s = st.edge.sample(st.d, {});
    const side = st.side;
    const X = new THREE.Vector3(s.tx * side, 0, s.tz * side);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(-s.tz * side, 0, s.tx * side);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    m.setPosition(s.x, s.y, s.z);
    return m;
  }

  earthworks(st) {
    const m = this.frame(st);
    const L = st.length;
    const depth = st.style === 'grand' ? 7.6 : 6.0;
    const pts = [];
    const v = new THREE.Vector3();
    const y = st.edge.sample(st.d, {}).y;
    for (let x = -L / 2 - 0.5; x <= L / 2 + 0.5; x += 1) {
      for (let z = 0.8; z <= depth; z += 1) {
        v.set(x, 0, z).applyMatrix4(m);
        pts.push(v.x, y, v.z);
      }
    }
    const fake = { pts, kind: new Uint8Array(pts.length / 3), count: pts.length / 3 };
    applyEarthworks(fake, this.terrain, null);
    this.terrain.flush();
    this.game.scenery?.clearAlong(new Float32Array(pts), 2.2);
  }

  buildView(st) {
    this.disposeView(st);
    const grp = new THREE.Group();
    const edge = st.edge;
    const L = st.length;
    const side = st.side;

    // platform, extruded along the (possibly curved) track
    const gb = new GeoBuilder();
    const top = lc('#cbbfa6'), wall = lc('#a99b82'), edgeC = lc('#efe7cf');
    const d0 = st.d - L / 2, d1 = st.d + L / 2;
    const s = {};
    const prof = side > 0
      ? [[PLAT_Z1, -0.35, null], [PLAT_Z1, PLAT_H, wall], [PLAT_Z0 + 0.22, PLAT_H, top], [PLAT_Z0, PLAT_H, edgeC], [PLAT_Z0, -0.12, wall]]
      : [[-PLAT_Z0, -0.12, null], [-PLAT_Z0, PLAT_H, wall], [-PLAT_Z0 - 0.22, PLAT_H, edgeC], [-PLAT_Z1, PLAT_H, top], [-PLAT_Z1, -0.35, wall]];
    let prev = null;
    const step = 0.5;
    for (let d = d0; d <= d1 + 1e-3; d += step) {
      edge.sample(Math.min(d, d1), s);
      const lx = -s.tz, lz = s.tx;
      const cur = prof.map(([o, h]) => ({ x: s.x + lx * o, y: s.y + h, z: s.z + lz * o }));
      if (prev) for (let k = 0; k < prof.length - 1; k++) gb.quad(prev[k], cur[k], cur[k + 1], prev[k + 1], prof[k + 1][2]);
      else {
        // end cap facing backwards
        gb.quad(cur[0], cur[prof.length - 1], { ...cur[prof.length - 1], y: cur[prof.length - 2].y }, { ...cur[0], y: cur[1].y }, wall);
      }
      prev = cur;
    }
    if (prev) gb.quad(prev[prof.length - 1], prev[0], { ...prev[0], y: prev[1].y }, { ...prev[prof.length - 1], y: prev[prof.length - 2].y }, wall);
    const plat = new THREE.Mesh(gb.build(), toon('#ffffff', { vertexColors: true }));
    plat.castShadow = plat.receiveShadow = true;
    grp.add(plat);

    // the building & furniture in the station's local frame
    const g = buildStationGeometry(st.style, L);
    const m = this.frame(st);
    const solidB = new GeoBuilder();
    solidB.append(g.solid, m);
    const solid = new THREE.Mesh(solidB.build(), toon('#ffffff', { vertexColors: true }));
    solid.castShadow = solid.receiveShadow = true;
    grp.add(solid);
    if (g.glass.n) {
      const gl = new GeoBuilder();
      gl.append(g.glass, m);
      grp.add(new THREE.Mesh(gl.build(), windowMat));
    }
    if (g.roofGlass.n) {
      const rg = new GeoBuilder();
      rg.append(g.roofGlass, m);
      grp.add(new THREE.Mesh(rg.build(), roofGlassMat));
    }
    // lamps: bright bulbs + glow sprites
    const v = new THREE.Vector3();
    st.lamps = [];
    for (const [x, y, z] of g.lamps) {
      v.set(x, y, z).applyMatrix4(m);
      const bulb = new THREE.Mesh(bulbGeo, lampMat);
      bulb.position.copy(v);
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(v);
      glow.scale.setScalar(2.2);
      grp.add(bulb, glow);
      st.lamps.push(v.clone());
    }
    // name boards
    for (const sg of g.signs) {
      const { tex } = labelTexture(st.name, { banner: false, font: '700 64px Caveat, cursive', color: '#2b2a33', height: 96 });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      for (const face of [-1, 1]) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), mat);
        v.set(sg.x, sg.y, sg.z + 0.05 * face).applyMatrix4(m);
        plane.position.copy(v);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        plane.quaternion.copy(q);
        if (face < 0) plane.rotateY(Math.PI);
        grp.add(plane);
      }
    }
    // clocks with moving hands
    st.clockHands = [];
    for (const [x, y, z, r] of g.clocks) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ map: clockFaceTex() }));
      v.set(x, y, z).applyMatrix4(m);
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      face.position.copy(v);
      face.quaternion.copy(q);
      face.rotateY(Math.PI);
      grp.add(face);
      const handMat = toon('#2b2a33');
      const hh = new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, r * 0.55, 0.02), handMat);
      hh.geometry.translate(0, r * 0.25, 0);
      const mh = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.82, 0.02), handMat);
      mh.geometry.translate(0, r * 0.38, 0);
      const pivot = new THREE.Group();
      pivot.position.copy(face.position);
      pivot.quaternion.copy(face.quaternion);
      pivot.translateZ(0.02);
      pivot.add(hh, mh);
      grp.add(pivot);
      st.clockHands.push({ hh, mh });
    }
    st.smoke = g.smoke.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(m));

    // floating hand-lettered map label
    const lbl = labelTexture(st.name);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lbl.tex, transparent: true, depthTest: false, sizeAttenuation: false }));
    const hgt = 0.032;
    sprite.scale.set((hgt * lbl.w) / lbl.h, hgt, 1);
    v.set(0, st.style === 'grand' ? 13 : 7, 3.5).applyMatrix4(m);
    sprite.position.copy(v);
    sprite.renderOrder = 30;
    sprite.center.set(0.5, 0);
    grp.add(sprite);
    st.label = sprite;
    st.center = new THREE.Vector3().setFromMatrixPosition(m);

    st.view = grp;
    this.group.add(grp);
  }

  disposeView(st) {
    if (!st.view) return;
    this.group.remove(st.view);
    st.view.traverse((o) => {
      if (o.isMesh && o.geometry !== bulbGeo) o.geometry.dispose();
      if ((o.isMesh || o.isSprite) && o.material?.map && o.material.map !== clockFaceTex()) { o.material.map.dispose(); o.material.dispose(); }
    });
    st.view = null;
  }

  // keep station references valid as the network changes
  onNetEvent(ev) {
    if (ev.type === 'split') {
      for (const st of this.onEdge(ev.edge)) {
        if (st.d < ev.d) st.edge = ev.e1;
        else { st.edge = ev.e2; st.d -= ev.d; }
      }
    } else if (ev.type === 'remove') {
      for (const st of this.onEdge(ev.edge)) this.remove(st);
    }
  }

  update(dt, clockHours) {
    for (const st of this.list) {
      if (st.clockHands) for (const { hh, mh } of st.clockHands) {
        hh.rotation.z = -(clockHours / 12) * Math.PI * 2;
        mh.rotation.z = -(clockHours % 1) * Math.PI * 2;
      }
    }
  }

  setLabelOpacity(o) {
    for (const st of this.list) if (st.label) {
      st.label.material.opacity = o;
      st.label.visible = o > 0.02;
    }
  }

  serialize() {
    return this.list.map((s) => ({ id: s.id, name: s.name, edge: s.edge.id, d: s.d, side: s.side, length: s.length, style: s.style, served: s.served }));
  }

  load(data) {
    this.clear();
    for (const d of data) {
      const edge = this.rail.net.edges.get(d.edge);
      if (!edge) continue;
      const st = new Station({ ...d, edge });
      this.list.push(st);
      this.nextId = Math.max(this.nextId, st.id + 1);
      this.buildView(st);
    }
  }

  clear() {
    for (const st of this.list) this.disposeView(st);
    this.list = [];
  }
}

const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);
export { STYLES, BED_DEPTH, PLAT_H };
