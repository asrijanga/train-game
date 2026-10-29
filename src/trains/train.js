import * as THREE from 'three';
import { buildVehicle, VEHICLES } from './vehicles.js';
import { findRoute, REVERSE_PENALTY, stopPoint } from './router.js';
import { RAIL_TOP } from '../rail/network.js';

const GAP = 0.12; // coupling gap between vehicles
const DWELL = 7;
const A_LAT = 1.6; // comfortable lateral acceleration for curve speed limits

const tmpS = {}, tmpA = {}, tmpB = {};
const vF = new THREE.Vector3(), vR = new THREE.Vector3();

export class Train {
  constructor(sys, data) {
    this.sys = sys;
    this.id = data.id;
    this.name = data.name;
    this.livery = data.livery;
    this.consistIds = data.consist; // e.g. ['pacific','tender','coach','coach']
    this.stops = data.stops.slice(); // station ids
    this.stopIdx = data.stopIdx ?? 0;
    this.speed = 0;
    this.state = 'dwell';
    this.timer = data.timer ?? 2;
    this.plan = null;
    this.odo = 0;
    this.status = '';
    this.group = new THREE.Group();
    this.vehicles = this.consistIds.map((id) => {
      const v = buildVehicle(id, this.livery);
      this.group.add(v.group);
      v.group.rotation.order = 'YZX';
      return v;
    });
    let off = 0;
    for (const v of this.vehicles) {
      v.offset = off;
      off += v.spec.length + GAP;
    }
    this.length = off - GAP;
    const loco = this.vehicles.find((v) => v.spec.kind === 'loco');
    this.maxSpeed = loco?.spec.maxSpeed ?? 6;
    this.accel = loco?.spec.accel ?? 1;
    this.head = null;
    this.trail = [];
    this.passengers = 0;
    this.capacity = this.vehicles.reduce((a, v) => a + (v.spec.passengers || 0), 0);
  }

  get nextStation() {
    return this.sys.stations.byId(this.stops[this.stopIdx % this.stops.length]);
  }

  // Place the train at a station, facing whichever way leads to its next stop.
  spawnAt(st) {
    const edge = st.edge;
    let best = null;
    for (const dir of [1, -1]) {
      const d = stopPoint(edge, st.d, dir, this.length);
      this.head = { edge, dir, d };
      this.trail = [{ edge, dir, from: d, to: d }];
      if (!this.extendTrail()) continue;
      const nxt = this.sys.stations.byId(this.stops[(this.stopIdx + 1) % this.stops.length]);
      const r = nxt && findRoute(this.sys.net, [{ edge, dir, d }], { edge: nxt.edge, d: nxt.d }, this.length);
      const cost = r ? r.cost : 1e9;
      if (!best || cost < best.cost) best = { dir, d, cost };
    }
    if (!best) best = { dir: 1, d: stopPoint(edge, st.d, 1, this.length) };
    this.head = { edge, dir: best.dir, d: best.d };
    this.trail = [{ edge, dir: best.dir, from: best.d, to: best.d }];
    this.extendTrail(true);
    this.state = 'dwell';
    this.timer = 3;
    this.atStation = st;
    this.place();
  }

  // Make sure the trail covers the whole train, walking back through the graph.
  extendTrail(force = false) {
    const need = this.length + 1;
    const net = this.sys.net;
    for (let guard = 0; guard < 50; guard++) {
      let total = 0;
      for (const s of this.trail) total += Math.abs(s.to - s.from);
      if (total >= need) return true;
      const first = this.trail[0];
      const boundary = first.dir > 0 ? 0 : first.edge.length;
      if (Math.abs(first.from - boundary) > 1e-4) {
        const want = need - total;
        const room = Math.abs(first.from - boundary);
        first.from = first.from - first.dir * Math.min(want, room);
        continue;
      }
      // previous edge through the node we entered from
      const { node, side } = first.edge.endOf(-first.dir);
      const deps = net.departures(node, side);
      if (!deps.length) {
        if (!force) return false;
        // dead end behind: slide the head forward instead
        const want = need - total;
        const cur = this.trail[this.trail.length - 1];
        const room = cur.dir > 0 ? cur.edge.length - cur.to : cur.to;
        const mv = Math.min(want, room);
        if (mv < 1e-3) return false;
        cur.to += cur.dir * mv;
        this.head.d = cur.to;
        continue;
      }
      const p = deps[0];
      const dir = -p.dir;
      const L = p.edge.length;
      this.trail.unshift({ edge: p.edge, dir, from: dir > 0 ? L : 0, to: dir > 0 ? L : 0 });
    }
    return false;
  }

  // Point at distance s behind the head (along the trail).
  pointBehind(s, out) {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const seg = this.trail[i];
      const len = Math.abs(seg.to - seg.from);
      if (s <= len || i === 0) {
        const d = seg.to - seg.dir * Math.min(s, len);
        return seg.edge.sample(d, out);
      }
      s -= len;
    }
    return null;
  }

  place() {
    for (const v of this.vehicles) {
      const inset = (v.spec.length - v.spec.bogie) / 2;
      const a = this.pointBehind(v.offset + inset, tmpA);
      const b = this.pointBehind(v.offset + inset + v.spec.bogie, tmpB);
      if (!a || !b) continue;
      vF.set(a.x, a.y, a.z);
      vR.set(b.x, b.y, b.z);
      const g = v.group;
      g.position.addVectors(vF, vR).multiplyScalar(0.5);
      g.position.y += RAIL_TOP;
      const dx = vF.x - vR.x, dy = vF.y - vR.y, dz = vF.z - vR.z;
      g.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, Math.hypot(dx, dz)));
      v.heading = Math.atan2(-dz, dx);
    }
  }

  totalTrail() {
    let t = 0;
    for (const s of this.trail) t += Math.abs(s.to - s.from);
    return t;
  }

  // Reverse direction in place: the old tail becomes the head.
  reverse() {
    const segs = [];
    let remaining = this.length;
    for (let i = this.trail.length - 1; i >= 0 && remaining > 0; i--) {
      const seg = this.trail[i];
      const len = Math.abs(seg.to - seg.from);
      const use = Math.min(len, remaining);
      const from = seg.to, to = seg.to - seg.dir * use;
      segs.push({ edge: seg.edge, dir: -seg.dir, from, to });
      remaining -= use;
    }
    this.trail = segs;
    const last = segs[segs.length - 1];
    this.head = { edge: last.edge, dir: last.dir, d: last.to };
    this.extendTrail(true);
    this.sys.effects?.puff(this.group.children[0]?.position, 1.6);
  }

  plannedStarts(allowReverse) {
    const starts = [{ edge: this.head.edge, dir: this.head.dir, d: this.head.d }];
    if (allowReverse) {
      const t = this.pointBehind(this.length, tmpS);
      // locate tail segment for a proper reversed start
      let s = this.length;
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const seg = this.trail[i];
        const len = Math.abs(seg.to - seg.from);
        if (s <= len || i === 0) {
          starts.push({ edge: seg.edge, dir: -seg.dir, d: seg.to - seg.dir * Math.min(s, len), cost: REVERSE_PENALTY, reversed: true });
          break;
        }
        s -= len;
      }
      void t;
    }
    return starts;
  }

  replan(allowReverse) {
    const st = this.nextStation;
    if (!st) { this.plan = null; this.status = 'No stops'; return false; }
    const r = findRoute(this.sys.net, this.plannedStarts(allowReverse), { edge: st.edge, d: st.d }, this.length);
    if (!r) { this.plan = null; this.status = `Can't find a way to ${st.name}`; return false; }
    if (r.reversed) this.reverse();
    this.plan = { steps: r.steps, idx: 0, stopD: r.stopD, endType: r.endType };
    this.status = r.endType === 'station' ? `Heading to ${st.name}` : 'Reversing…';
    return true;
  }

  distanceToTarget() {
    const p = this.plan;
    if (!p) return 0;
    const steps = p.steps;
    const h = this.head;
    if (p.idx === steps.length - 1) return Math.max(0, (p.stopD - h.d) * h.dir);
    let dist = h.dir > 0 ? h.edge.length - h.d : h.d;
    for (let i = p.idx + 1; i < steps.length - 1; i++) dist += steps[i].edge.length;
    const last = steps[steps.length - 1];
    dist += last.dir > 0 ? p.stopD : last.edge.length - p.stopD;
    return dist;
  }

  // Speed limit from curvature a little way ahead.
  curveLimit() {
    let lim = this.maxSpeed;
    const p = this.plan;
    let edge = this.head.edge, dir = this.head.dir, d = this.head.d, idx = p ? p.idx : 0;
    for (let look = 0; look <= 18; look += 3) {
      const R = edge.radiusAt(d);
      if (R < Infinity) {
        const v = Math.sqrt(A_LAT * R);
        // allow braking from current position to reach v by that point
        const allowed = Math.sqrt(v * v + 2 * 1.4 * look);
        lim = Math.min(lim, allowed);
      }
      d += dir * 3;
      if (d < 0 || d > edge.length) {
        if (!p || idx + 1 >= p.steps.length) break;
        const over = d < 0 ? -d : d - edge.length;
        idx++;
        edge = p.steps[idx].edge; dir = p.steps[idx].dir;
        d = dir > 0 ? over : edge.length - over;
      }
    }
    return lim;
  }

  advance(ds) {
    let rem = ds;
    const p = this.plan;
    for (let guard = 0; rem > 1e-6 && guard < 20; guard++) {
      const h = this.head;
      const cur = this.trail[this.trail.length - 1];
      const toEnd = h.dir > 0 ? h.edge.length - h.d : h.d;
      if (rem <= toEnd || !p || p.idx >= p.steps.length - 1) {
        const mv = Math.min(rem, toEnd);
        h.d += h.dir * mv;
        cur.to = h.d;
        rem -= mv;
        break;
      }
      h.d = h.dir > 0 ? h.edge.length : 0;
      cur.to = h.d;
      rem -= toEnd;
      p.idx++;
      const nx = p.steps[p.idx];
      this.head = { edge: nx.edge, dir: nx.dir, d: nx.dir > 0 ? 0 : nx.edge.length };
      this.trail.push({ edge: nx.edge, dir: nx.dir, from: this.head.d, to: this.head.d });
    }
    // prune trail behind the last carriage
    while (this.trail.length > 1) {
      const t = this.totalTrail();
      const first = this.trail[0];
      if (t - Math.abs(first.to - first.from) >= this.length + 1) this.trail.shift();
      else break;
    }
    this.odo += ds;
  }

  update(dt) {
    if (this.state === 'dwell') {
      this.speed = 0;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.replan(true)) { this.state = 'run'; this.atStation = null; this.sys.onDepart?.(this); }
        else this.timer = 3;
      }
    } else if (this.state === 'run') {
      if (!this.plan) { this.state = 'dwell'; this.timer = 2; return; }
      const dist = this.distanceToTarget();
      const brake = 1.4;
      let vt = Math.min(this.curveLimit(), Math.sqrt(2 * brake * Math.max(0, dist - 0.02)));
      vt = this.sys.limitFor?.(this, vt) ?? vt;
      if (this.speed < vt) this.speed = Math.min(vt, this.speed + this.accel * dt);
      else this.speed = Math.max(vt, this.speed - brake * 1.8 * dt);
      const ds = Math.min(this.speed * dt, dist);
      this.advance(ds);
      if (dist - ds < 0.03 && this.speed < 0.6) {
        this.speed = 0;
        if (this.plan.endType === 'reverse') {
          this.reverse();
          this.plan = null;
          this.state = 'dwell';
          this.timer = 2.5;
        } else {
          const st = this.nextStation;
          this.state = 'dwell';
          this.timer = DWELL;
          this.atStation = st;
          this.stopIdx = (this.stopIdx + 1) % this.stops.length;
          this.plan = null;
          this.status = `At ${st?.name ?? 'station'}`;
          this.sys.onArrive?.(this, st);
        }
      }
    }
    this.place();
    for (const v of this.vehicles) {
      for (const w of v.wheels) w.mesh.rotation.z = -this.odo / w.r;
      v.animate?.(this.odo);
    }
  }

  // Position of the lead vehicle for camera follow.
  leadPosition(out) {
    return out.copy(this.vehicles[0].group.position);
  }

  leadHeading() {
    return this.vehicles[0].heading ?? 0;
  }

  // Remap references after the network changes.
  onNetEvent(ev) {
    const remap = (ref, dKey) => {
      if (ref.edge !== ev.edge) return true;
      if (ev.type === 'remove') return false;
      if (ref[dKey] < ev.d || (ref[dKey] === ev.d && ref.dir < 0)) { ref.edge = ev.e1; }
      else { ref.edge = ev.e2; ref[dKey] -= ev.d; }
      return true;
    };
    if (ev.type === 'split') {
      // split trail segments that straddle the split point
      const nt = [];
      for (const seg of this.trail) {
        if (seg.edge !== ev.edge) { nt.push(seg); continue; }
        const lo = Math.min(seg.from, seg.to), hi = Math.max(seg.from, seg.to);
        if (hi <= ev.d) nt.push({ ...seg, edge: ev.e1 });
        else if (lo >= ev.d) nt.push({ ...seg, edge: ev.e2, from: seg.from - ev.d, to: seg.to - ev.d });
        else if (seg.dir > 0) {
          nt.push({ edge: ev.e1, dir: 1, from: seg.from, to: ev.d });
          nt.push({ edge: ev.e2, dir: 1, from: 0, to: seg.to - ev.d });
        } else {
          nt.push({ edge: ev.e2, dir: -1, from: seg.from - ev.d, to: 0 });
          nt.push({ edge: ev.e1, dir: -1, from: ev.d, to: seg.to });
        }
      }
      this.trail = nt;
      const last = nt[nt.length - 1];
      this.head = { edge: last.edge, dir: last.dir, d: last.to };
      if (this.state === 'run') { this.plan = null; if (!this.replan(false)) { this.state = 'dwell'; this.timer = 2; } }
      return true;
    }
    if (ev.type === 'remove') {
      if (this.trail.some((s) => s.edge === ev.edge)) return false;
      if (this.state === 'run' && this.plan?.steps.some((s) => s.edge === ev.edge)) {
        this.plan = null;
        if (!this.replan(false)) { this.speed = 0; this.state = 'dwell'; this.timer = 2; }
      }
      return true;
    }
    if (ev.type === 'add' && this.state === 'run') {
      // a new link might offer a shorter route; replan without reversing
      const keepSpeed = this.speed;
      if (this.replan(false)) this.speed = keepSpeed;
    }
    void remap;
    return true;
  }

  serialize() {
    return {
      id: this.id, name: this.name, livery: this.livery, consist: this.consistIds,
      stops: this.stops, stopIdx: this.stopIdx,
      head: { edge: this.head.edge.id, dir: this.head.dir, d: this.head.d },
      trail: this.trail.map((s) => ({ edge: s.edge.id, dir: s.dir, from: s.from, to: s.to })),
      state: this.state === 'run' ? 'dwell' : this.state, timer: 1,
      passengers: this.passengers,
    };
  }
}

export { VEHICLES };
