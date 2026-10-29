import * as THREE from 'three';

// Track bed geometry constants (world units; 1 unit ≈ 4 m, model-railway scale)
export const MIN_RADIUS = 7;
export const RAIL_TOP = 0.12; // rail head above the track bed (edge.y)
export const GAUGE_HALF = 0.18;

export const KIND_GROUND = 0;
export const KIND_BRIDGE = 1;
export const KIND_TUNNEL = 2;

export const other = (side) => (side === 'a' ? 'b' : 'a');

export class RailNode {
  constructor(id, x, y, z, dx, dz) {
    this.id = id;
    this.pos = new THREE.Vector3(x, y, z);
    const l = Math.hypot(dx, dz) || 1;
    this.dir = new THREE.Vector2(dx / l, dz / l);
    this.a = [];
    this.b = [];
  }
  side(s) {
    return s === 'a' ? this.a : this.b;
  }
  // outward direction for edges on side s
  outward(s) {
    return s === 'b' ? this.dir.clone() : this.dir.clone().negate();
  }
  degree() {
    return this.a.length + this.b.length;
  }
}

export class RailEdge {
  constructor(id, n0, s0, n1, s1, pts, kind) {
    this.id = id;
    this.n0 = n0; this.s0 = s0;
    this.n1 = n1; this.s1 = s1;
    this.pts = pts; // Float32Array xyz
    this.count = pts.length / 3;
    this.kind = kind || new Uint8Array(this.count);
    this.cum = new Float32Array(this.count);
    let L = 0;
    for (let i = 1; i < this.count; i++) {
      const j = i * 3, k = j - 3;
      L += Math.hypot(pts[j] - pts[k], pts[j + 2] - pts[k + 2]);
      this.cum[i] = L;
    }
    this.length = L;
    this.computeBounds();
    this.view = null;
  }

  computeBounds() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const x = this.pts[i * 3], z = this.pts[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    this.bounds = { x0, z0, x1, z1 };
  }

  indexAt(d) {
    const cum = this.cum;
    if (d <= 0) return 0;
    if (d >= this.length) return this.count - 2;
    let lo = 0, hi = this.count - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= d) lo = m; else hi = m;
    }
    return lo;
  }

  // Position and unit tangent (along increasing d) at distance d.
  sample(d, out = {}) {
    const i = this.indexAt(d);
    const p = this.pts;
    const a = i * 3, b = a + 3;
    const seg = this.cum[i + 1] - this.cum[i] || 1e-6;
    const t = Math.min(1, Math.max(0, (d - this.cum[i]) / seg));
    out.x = p[a] + (p[b] - p[a]) * t;
    out.y = p[a + 1] + (p[b + 1] - p[a + 1]) * t;
    out.z = p[a + 2] + (p[b + 2] - p[a + 2]) * t;
    const tx = p[b] - p[a], tz = p[b + 2] - p[a + 2];
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l; out.tz = tz / l;
    out.grade = (p[b + 1] - p[a + 1]) / l;
    out.kind = this.kind[t < 0.5 ? i : i + 1];
    return out;
  }

  nearest(x, z) {
    let best = Infinity, bd = 0;
    const p = this.pts;
    for (let i = 0; i < this.count - 1; i++) {
      const ax = p[i * 3], az = p[i * 3 + 2], bx = p[i * 3 + 3], bz = p[i * 3 + 5];
      const dx = bx - ax, dz = bz - az;
      const ll = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / ll;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const dd = ex * ex + ez * ez;
      if (dd < best) { best = dd; bd = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t; }
    }
    return { d: bd, dist: Math.sqrt(best) };
  }

  // Node/side at the end reached when travelling in direction dir (+1/-1).
  endOf(dir) {
    return dir > 0 ? { node: this.n1, side: this.s1 } : { node: this.n0, side: this.s0 };
  }

  // Curvature radius around distance d (approx).
  radiusAt(d) {
    const a = this.sample(Math.max(0, d - 1.5), RA), b = this.sample(Math.min(this.length, d + 1.5), RB);
    const cross = a.tx * b.tz - a.tz * b.tx;
    const ang = Math.asin(Math.max(-1, Math.min(1, cross)));
    return Math.abs(ang) < 1e-4 ? Infinity : 3 / Math.abs(ang);
  }
}

const RA = {}, RB = {};

export class Network {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.nextId = 1;
    this.listeners = [];
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(ev) {
    for (const fn of this.listeners) fn(ev);
  }

  addNode(x, y, z, dx, dz, id) {
    const n = new RailNode(id ?? this.nextId++, x, y, z, dx, dz);
    if (id !== undefined) this.nextId = Math.max(this.nextId, id + 1);
    this.nodes.set(n.id, n);
    return n;
  }

  addEdge(n0, s0, n1, s1, pts, kind, id) {
    const e = new RailEdge(id ?? this.nextId++, n0, s0, n1, s1, pts, kind);
    if (id !== undefined) this.nextId = Math.max(this.nextId, id + 1);
    this.edges.set(e.id, e);
    n0.side(s0).push(e);
    n1.side(s1).push(e);
    this.emit({ type: 'add', edge: e });
    return e;
  }

  removeEdge(e, silent = false) {
    if (!this.edges.has(e.id)) return;
    this.edges.delete(e.id);
    const rm = (n, s) => {
      const arr = n.side(s);
      const i = arr.indexOf(e);
      if (i >= 0) arr.splice(i, 1);
    };
    rm(e.n0, e.s0);
    rm(e.n1, e.s1);
    for (const n of [e.n0, e.n1]) if (n.degree() === 0) this.nodes.delete(n.id);
    if (!silent) this.emit({ type: 'remove', edge: e });
  }

  // Split edge at distance d; returns { node, e1, e2 }.
  splitEdge(e, d) {
    const s = e.sample(d, {});
    const i = e.indexAt(d);
    const p = e.pts;
    const before = [], after = [];
    const kb = [], ka = [];
    for (let k = 0; k <= i; k++) { before.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]); kb.push(e.kind[k]); }
    const lastB = e.cum[i];
    if (d - lastB < 0.05 && before.length > 3) { before.length -= 3; kb.pop(); }
    before.push(s.x, s.y, s.z); kb.push(s.kind);
    after.push(s.x, s.y, s.z); ka.push(s.kind);
    let k0 = i + 1;
    if (e.cum[k0] - d < 0.05 && k0 < e.count - 1) k0++;
    for (let k = k0; k < e.count; k++) { after.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]); ka.push(e.kind[k]); }

    const node = this.addNode(s.x, s.y, s.z, s.tx, s.tz);
    this.removeEdge(e, true);
    // removeEdge may have dropped end nodes with no other edges; re-add them
    if (!this.nodes.has(e.n0.id)) this.nodes.set(e.n0.id, e.n0);
    if (!this.nodes.has(e.n1.id)) this.nodes.set(e.n1.id, e.n1);
    const e1 = new RailEdge(this.nextId++, e.n0, e.s0, node, 'a', new Float32Array(before), new Uint8Array(kb));
    const e2 = new RailEdge(this.nextId++, node, 'b', e.n1, e.s1, new Float32Array(after), new Uint8Array(ka));
    for (const ne of [e1, e2]) {
      this.edges.set(ne.id, ne);
      ne.n0.side(ne.s0).push(ne);
      ne.n1.side(ne.s1).push(ne);
    }
    this.emit({ type: 'split', edge: e, e1, e2, d, node });
    return { node, e1, e2 };
  }

  // Departures from a node when arriving on `arrivalSide`.
  departures(node, arrivalSide) {
    const out = [];
    const s = other(arrivalSide);
    for (const e of node.side(s)) {
      if (e.n0 === node && e.s0 === s) out.push({ edge: e, dir: 1 });
      if (e.n1 === node && e.s1 === s) out.push({ edge: e, dir: -1 });
    }
    return out;
  }

  nearestEdge(x, z, maxDist) {
    let best = null;
    for (const e of this.edges.values()) {
      const b = e.bounds;
      if (x < b.x0 - maxDist || x > b.x1 + maxDist || z < b.z0 - maxDist || z > b.z1 + maxDist) continue;
      const r = e.nearest(x, z);
      if (r.dist <= maxDist && (!best || r.dist < best.dist)) best = { edge: e, d: r.d, dist: r.dist };
    }
    return best;
  }

  nearestNode(x, z, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const n of this.nodes.values()) {
      if (filter && !filter(n)) continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }

  serialize() {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return {
      nextId: this.nextId,
      nodes: [...this.nodes.values()].map((n) => [n.id, r3(n.pos.x), r3(n.pos.y), r3(n.pos.z), r3(n.dir.x), r3(n.dir.y)]),
      edges: [...this.edges.values()].map((e) => ({
        id: e.id, n0: e.n0.id, s0: e.s0, n1: e.n1.id, s1: e.s1,
        p: Array.from(e.pts, r3), k: Array.from(e.kind),
      })),
    };
  }

  load(data) {
    this.nodes.clear();
    this.edges.clear();
    for (const [id, x, y, z, dx, dz] of data.nodes) this.addNode(x, y, z, dx, dz, id);
    for (const e of data.edges) {
      const n0 = this.nodes.get(e.n0), n1 = this.nodes.get(e.n1);
      if (!n0 || !n1) continue;
      this.addEdge(n0, e.s0, n1, e.s1, new Float32Array(e.p), new Uint8Array(e.k), e.id);
    }
    this.nextId = Math.max(this.nextId, data.nextId || 1);
  }
}
