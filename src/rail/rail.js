import * as THREE from 'three';
import { Network, other } from './network.js';
import { resample, computeProfile, classify, applyEarthworks } from './earthworks.js';
import { buildTrackMesh } from './trackmesh.js';
import { VN } from '../world/terrain.js';
import { GeoBuilder, lc } from '../render/geo.js';
import { toon } from '../render/materials.js';
import { tailGlowMat } from '../render/shared.js';

const END_CLEAR = 2.5; // can't branch this close to an edge's end; snap to the node

// Owns the rail network, its meshes and the rules for adding/removing track.
export class RailSystem {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.net = new Network();
    this.group = new THREE.Group();
    this.group.name = 'rail';
    this.protect = new Uint8Array(VN * VN);
    this.net.on((ev) => this.onNetEvent(ev));
    this.stops = new THREE.Group();
    this.group.add(this.stops);
  }

  // Buffer stops wherever a line simply ends.
  refreshBufferStops() {
    for (const c of [...this.stops.children]) { this.stops.remove(c); if (c.geometry) c.geometry.dispose(); }
    const gb = new GeoBuilder();
    const red = lc('#b8322a'), white = lc('#f2ede0'), dark = lc('#3a393f'), wood = lc('#6b4a32');
    const lamps = [];
    for (const n of this.net.nodes.values()) {
      const used = n.a.length ? 'a' : n.b.length ? 'b' : null;
      if (!used || (n.a.length && n.b.length)) continue;
      // direction from the end of the line back along the track
      const o = n.outward(used);
      const fx = -o.x, fz = -o.y; // the free side points away from the track
      const X = new THREE.Vector3(fx, 0, fz), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(-fz, 0, fx);
      const c = new THREE.Vector3(n.pos.x + fx * 0.3, n.pos.y, n.pos.z + fz * 0.3);
      const at = (x, y, z) => ({ x: c.x + X.x * x + Z.x * z, y: c.y + y, z: c.z + X.z * x + Z.z * z });
      gb.box(at(0.1, -0.05, 0), X, Y, Z, 0.25, 0.08, 0.55, wood);
      for (const z of [-0.36, 0.36]) {
        gb.box(at(0, 0.3, z), X, Y, Z, 0.07, 0.32, 0.07, dark);
        gb.box(at(0.25, 0.25, z), X, Y, Z, 0.3, 0.04, 0.04, dark, false);
      }
      for (let i = 0; i < 6; i++) gb.box(at(-0.08, 0.5, -0.45 + i * 0.18 + 0.09), X, Y, Z, 0.06, 0.1, 0.09, i % 2 ? white : red);
      for (const z of [-0.18, 0.18]) gb.box(at(-0.2, 0.47, z), X, Y, Z, 0.12, 0.05, 0.05, lc('#77736c'));
      lamps.push(at(-0.05, 0.75, 0));
      gb.box(at(-0.02, 0.68, 0), X, Y, Z, 0.05, 0.06, 0.05, dark);
    }
    if (!gb.n) return;
    const mesh = new THREE.Mesh(gb.build(), toon('#ffffff', { vertexColors: true }));
    mesh.castShadow = true;
    this.stops.add(mesh);
    for (const p of lamps) {
      const s = new THREE.Sprite(tailGlowMat);
      s.position.set(p.x, p.y, p.z);
      s.scale.setScalar(0.7);
      this.stops.add(s);
    }
  }

  onNetEvent(ev) {
    if (ev.type === 'add') this.buildView(ev.edge);
    else if (ev.type === 'remove') this.disposeView(ev.edge);
    else if (ev.type === 'split') {
      this.disposeView(ev.edge);
      this.buildView(ev.e1);
      this.buildView(ev.e2);
    }
    this.game.onNetworkChanged?.(ev);
    clearTimeout(this._bsT);
    this._bsT = setTimeout(() => this.refreshBufferStops(), 0);
  }

  buildView(edge) {
    this.disposeView(edge);
    edge.view = buildTrackMesh(edge, this.terrain);
    this.group.add(edge.view);
  }

  disposeView(edge) {
    if (!edge.view) return;
    this.group.remove(edge.view);
    edge.view.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    edge.view = null;
  }

  isInStation(edge, d, pad = 1) {
    return this.game.stations?.blocks(edge, d, pad) ?? false;
  }

  // What does a touch at (x,z) start from? node / mid-edge / free ground.
  findAnchor(x, z, r) {
    const net = this.net;
    let node = net.nearestNode(x, z, r, (n) => n.a.length === 0 || n.b.length === 0);
    if (!node) node = net.nearestNode(x, z, r * 0.6);
    if (node) return { type: 'node', node, pos: node.pos.clone() };
    const hit = net.nearestEdge(x, z, r);
    if (hit) {
      const { edge, d } = hit;
      if (d < END_CLEAR) return { type: 'node', node: edge.n0, pos: edge.n0.pos.clone() };
      if (d > edge.length - END_CLEAR) return { type: 'node', node: edge.n1, pos: edge.n1.pos.clone() };
      const s = edge.sample(d, {});
      return { type: 'edge', edge, d, tx: s.tx, tz: s.tz, pos: new THREE.Vector3(s.x, s.y, s.z) };
    }
    const y = this.terrain.groundAt(x, z);
    return { type: 'free', pos: new THREE.Vector3(x, y, z) };
  }

  // Snap target near the finger, excluding the start of the current stroke.
  findSnap(x, z, r, start) {
    const net = this.net;
    const notStart = (n) => !(start.type === 'node' && start.node === n);
    let node = net.nearestNode(x, z, r, (n) => notStart(n) && (n.a.length === 0 || n.b.length === 0));
    if (!node) node = net.nearestNode(x, z, r * 0.6, notStart);
    if (node) return { type: 'node', node, pos: node.pos.clone(), ax: node.dir.x, az: node.dir.y };
    const hit = net.nearestEdge(x, z, r);
    if (!hit) return null;
    const { edge, d } = hit;
    if (start.type === 'edge' && start.edge === edge && Math.abs(start.d - d) < 12) return null;
    if (d < END_CLEAR || d > edge.length - END_CLEAR) {
      const n = d < END_CLEAR ? edge.n0 : edge.n1;
      if (!notStart(n)) return null;
      return { type: 'node', node: n, pos: n.pos.clone(), ax: n.dir.x, az: n.dir.y };
    }
    const s = edge.sample(d, {});
    return { type: 'edge', edge, d, pos: new THREE.Vector3(s.x, s.y, s.z), ax: s.tx, az: s.tz };
  }

  checkClear(xz, start, end) {
    if (start.type === 'edge' && this.isInStation(start.edge, start.d)) return { ok: false, reason: 'station in the way' };
    if (end && end.type === 'edge' && this.isInStation(end.edge, end.d)) return { ok: false, reason: 'station in the way' };
    if (start.type === 'node' && end && end.type === 'node' && start.node === end.node) return { ok: false, reason: 'loop too tight' };
    return { ok: true };
  }

  // Turn a validated draft plan into real track.
  commit(plan) {
    const net = this.net;
    const st = plan.start;
    let end = plan.end;
    let n0, s0, n1, s1;
    let h0 = null, h1 = null;

    if (st.type === 'node') {
      n0 = st.node; s0 = st.side; h0 = n0.pos.y;
    } else if (st.type === 'edge') {
      const { node, e1, e2 } = net.splitEdge(st.edge, st.d);
      n0 = node; s0 = st.sign > 0 ? 'b' : 'a'; h0 = node.pos.y;
      if (end && end.type === 'edge' && end.edge === st.edge) {
        end = { ...end };
        if (end.d < st.d) end.edge = e1;
        else { end.edge = e2; end.d -= st.d; }
      }
    }

    const xz = resample(plan.xz, 0.5);
    const n = xz.length / 2;
    const hx = xz[n * 2 - 2] - xz[n * 2 - 4], hz = xz[n * 2 - 1] - xz[n * 2 - 3];

    if (end) {
      let heading = end.heading || [hx, hz];
      if (end.type === 'node') {
        n1 = end.node;
      } else {
        n1 = net.splitEdge(end.edge, end.d).node;
      }
      const d = n1.dir;
      s1 = -heading[0] * d.x - heading[1] * d.y > 0 ? 'b' : 'a';
      h1 = n1.pos.y;
      xz[n * 2 - 2] = n1.pos.x; xz[n * 2 - 1] = n1.pos.z;
    }
    if (n0) { xz[0] = n0.pos.x; xz[1] = n0.pos.z; }

    const ys = computeProfile(xz, this.terrain, h0, h1);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pts[i * 3] = xz[i * 2];
      pts[i * 3 + 1] = ys[i];
      pts[i * 3 + 2] = xz[i * 2 + 1];
    }
    if (!n0) {
      const tx = xz[2] - xz[0], tz = xz[3] - xz[1];
      n0 = net.addNode(xz[0], ys[0], xz[1], tx, tz);
      s0 = 'b';
    }
    if (!n1) {
      n1 = net.addNode(xz[n * 2 - 2], ys[n - 1], xz[n * 2 - 1], hx, hz);
      s1 = 'a';
    }
    const kind = classify(pts, this.terrain);
    // terrain first, so the edge view (bridge piers) sees the final ground
    const tmpEdge = { pts, kind, count: n };
    applyEarthworks(tmpEdge, this.terrain, this.protect);
    this.terrain.flush();
    this.game.scenery?.clearAlong(pts, 2.4);
    const edge = net.addEdge(n0, s0, n1, s1, pts, kind);
    return edge;
  }

  removeEdge(edge) {
    this.net.removeEdge(edge);
  }

  rebuildAll() {
    for (const e of this.net.edges.values()) this.buildView(e);
  }

  clear() {
    for (const e of [...this.net.edges.values()]) this.disposeView(e);
    this.net.nodes.clear();
    this.net.edges.clear();
    this.protect.fill(0);
  }
}

export { other };
