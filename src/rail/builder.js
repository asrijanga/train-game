import * as THREE from 'three';
import { MIN_RADIUS } from './network.js';
import { resample } from './earthworks.js';
import { clamp } from '../core/rng.js';

const STEP = 3; // arc chord length while drawing
const SPACING = 0.5;

const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

// Append a circular arc from (p, t) heading toward `target`, chord length L,
// clamped so the radius never drops below MIN_RADIUS. Mutates chain.
function appendArc(chain, tx, tz, L) {
  const n = chain.pts.length;
  const px = chain.pts[n - 2], pz = chain.pts[n - 1];
  const [hx, hz] = chain.tan;
  let cx = tx - px, cz = tz - pz;
  const cl = Math.hypot(cx, cz) || 1;
  cx /= cl; cz /= cl;
  const cross = hx * cz - hz * cx, dot = hx * cx + hz * cz;
  let th = Math.atan2(cross, dot);
  const thMax = Math.asin(Math.min(1, L / (2 * MIN_RADIUS)));
  th = clamp(th, -thMax, thMax);
  const segs = Math.max(1, Math.ceil(L / SPACING));
  if (Math.abs(th) < 1e-5) {
    for (let k = 1; k <= segs; k++) chain.pts.push(px + hx * (L * k) / segs, pz + hz * (L * k) / segs);
  } else {
    const R = L / (2 * Math.sin(Math.abs(th)));
    const sgn = Math.sign(th);
    const ox = px + -hz * R * sgn, oz = pz + hx * R * sgn; // centre (left for +)
    const vx = px - ox, vz = pz - oz;
    for (let k = 1; k <= segs; k++) {
      const a = (2 * th * k) / segs;
      const [rx, rz] = rot(vx, vz, a);
      chain.pts.push(ox + rx, oz + rz);
    }
    chain.tan = rot(hx, hz, 2 * th);
  }
}

function bezierJoin(p0x, p0z, t0x, t0z, p3x, p3z, t3x, t3z) {
  const dist = Math.hypot(p3x - p0x, p3z - p0z);
  const k = dist * 0.42;
  const p1x = p0x + t0x * k, p1z = p0z + t0z * k;
  const p2x = p3x - t3x * k, p2z = p3z - t3z * k;
  const out = [];
  const steps = Math.max(8, Math.ceil(dist / 0.25));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push(
      u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x,
      u * u * u * p0z + 3 * u * u * t * p1z + 3 * u * t * t * p2z + t * t * t * p3z,
    );
  }
  return out;
}

// Smallest radius along a dense xz polyline (approximate).
export function minRadius(xz, from = 0) {
  let minR = Infinity;
  const look = 4; // points either side (~2 units)
  for (let i = from + look; i < xz.length / 2 - look; i += 2) {
    const ax = xz[(i - look) * 2], az = xz[(i - look) * 2 + 1];
    const bx = xz[i * 2], bz = xz[i * 2 + 1];
    const cx = xz[(i + look) * 2], cz = xz[(i + look) * 2 + 1];
    const a = Math.hypot(bx - ax, bz - az), b = Math.hypot(cx - bx, cz - bz), c = Math.hypot(cx - ax, cz - az);
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    if (area2 < 1e-6) continue;
    const R = (a * b * c) / (2 * area2);
    if (R < minR) minR = R;
  }
  return minR;
}

// Interactive drawing session. Produces a plan:
// { xz: [...], start: anchor, end: anchor|null, valid }
export class TrackDraft {
  constructor(rail, startWorld, snapR) {
    this.rail = rail;
    this.snapR = snapR;
    this.start = rail.findAnchor(startWorld.x, startWorld.z, snapR);
    const sp = this.start.pos;
    this.chain = { pts: [sp.x, sp.z], tan: null };
    this.tans = [];
    this.plan = null;
  }

  decideStart(fx, fz) {
    const s = this.start;
    const sp = s.pos;
    const mx = fx - sp.x, mz = fz - sp.z;
    if (Math.hypot(mx, mz) < 1.2) return false;
    if (s.type === 'node') {
      const d = s.node.dir;
      s.side = mx * d.x + mz * d.y >= 0 ? 'b' : 'a';
      const o = s.node.outward(s.side);
      this.chain.tan = [o.x, o.y];
    } else if (s.type === 'edge') {
      const sgn = mx * s.tx + mz * s.tz >= 0 ? 1 : -1;
      s.sign = sgn;
      this.chain.tan = [s.tx * sgn, s.tz * sgn];
    } else {
      const l = Math.hypot(mx, mz);
      this.chain.tan = [mx / l, mz / l];
    }
    return true;
  }

  update(fx, fz) {
    if (!this.chain.tan && !this.decideStart(fx, fz)) {
      this.plan = null;
      return;
    }
    const ch = this.chain;
    // grow committed chain toward finger
    for (let guard = 0; guard < 200; guard++) {
      const n = ch.pts.length;
      const ex = ch.pts[n - 2], ez = ch.pts[n - 1];
      if (Math.hypot(fx - ex, fz - ez) <= STEP) break;
      appendArc(ch, fx, fz, STEP);
    }
    // tail: provisional arc up to the finger
    const tail = { pts: ch.pts.slice(), tan: ch.tan.slice() };
    const n = tail.pts.length;
    const rem = Math.hypot(fx - tail.pts[n - 2], fz - tail.pts[n - 1]);
    if (rem > 0.3) appendArc(tail, fx, fz, rem);

    let xz = tail.pts, endTan = tail.tan, end = null;
    const snap = this.rail.findSnap(fx, fz, this.snapR, this.start);
    if (snap) {
      const joined = this.tryJoin(ch.pts, snap);
      if (joined) { xz = joined; end = snap; endTan = null; }
    }
    const total = this.length(xz);
    let valid = total > 2.5;
    let reason = '';
    for (let i = 0; i < xz.length; i += 2) {
      if (!this.rail.terrain.inBounds(xz[i], xz[i + 1], 6)) { valid = false; reason = 'edge of the map'; break; }
    }
    if (valid) {
      const r = this.rail.checkClear(xz, this.start, end);
      if (!r.ok) { valid = false; reason = r.reason; }
    }
    this.plan = { xz, start: this.start, end, endTan, valid, reason };
  }

  length(xz) {
    let L = 0;
    for (let i = 2; i < xz.length; i += 2) L += Math.hypot(xz[i] - xz[i - 2], xz[i + 1] - xz[i - 1]);
    return L;
  }

  // Join the chain onto a snap target with a smooth Bézier, backing up along
  // the chain until the curve is gentle enough.
  tryJoin(pts, snap) {
    const np = pts.length / 2;
    const tp = snap.pos;
    for (let back = 0; back < np - 1; back += 2) {
      const i = np - 1 - back;
      if (i < 1) break;
      const px = pts[i * 2], pz = pts[i * 2 + 1];
      const dist = Math.hypot(tp.x - px, tp.z - pz);
      if (dist < 2.5) continue;
      if (dist > 40) break;
      let t0x = px - pts[i * 2 - 2], t0z = pz - pts[i * 2 - 1];
      const l0 = Math.hypot(t0x, t0z) || 1;
      t0x /= l0; t0z /= l0;
      // choose arrival heading (into the target) along its axis
      let hx = snap.ax, hz = snap.az;
      if (hx * (tp.x - px) + hz * (tp.z - pz) < 0) { hx = -hx; hz = -hz; }
      if (snap.type === 'node' && snap.forceHeading) { hx = snap.forceHeading[0]; hz = snap.forceHeading[1]; }
      const join = bezierJoin(px, pz, t0x, t0z, tp.x, tp.z, hx, hz);
      const full = pts.slice(0, i * 2 + 2).concat(join);
      const rs = resample(full, SPACING);
      const checkFrom = Math.max(0, i - 6);
      if (minRadius(rs, checkFrom) >= MIN_RADIUS * 0.8) {
        snap.heading = [hx, hz];
        return rs;
      }
    }
    return null;
  }
}
