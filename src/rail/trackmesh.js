import * as THREE from 'three';
import { GeoBuilder, lc } from '../render/geo.js';
import { toon, PALETTE } from '../render/materials.js';
import { KIND_BRIDGE, KIND_TUNNEL, GAUGE_HALF } from './network.js';
import { BED_DEPTH } from './earthworks.js';
import { hash2 } from '../core/rng.js';
import { WATER } from '../world/terrain.js';

const BALLAST_TOP = 0.5;
const BALLAST_BOT = 0.85;
const SLEEPER_SPACING = 0.42;
const RAIL_W = 0.035;
const RAIL_H = 0.07;
const SLEEPER_H = 0.05;

const up = new THREE.Vector3(0, 1, 0);

function frames(edge) {
  const n = edge.count, p = edge.pts;
  const f = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = p[b * 3] - p[a * 3], tz = p[b * 3 + 2] - p[a * 3 + 2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    f.push({ x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2], tx, tz, lx: -tz, lz: tx });
  }
  return f;
}

// Extrude a cross-section (list of [offset, height, colour]) along the frames.
function extrude(gb, fr, profile, i0 = 0, i1 = fr.length - 1) {
  for (let i = i0; i < i1; i++) {
    const A = fr[i], B = fr[i + 1];
    for (let k = 0; k < profile.length - 1; k++) {
      const [o0, h0] = profile[k], [o1, h1, c] = profile[k + 1];
      const P = (F, o, h) => ({ x: F.x + F.lx * o, y: F.y + h, z: F.z + F.lz * o });
      gb.quad(P(A, o0, h0), P(B, o0, h0), P(B, o1, h1), P(A, o1, h1), c);
    }
  }
}

export function buildTrackMesh(edge, terrain) {
  const fr = frames(edge);
  const gb = new GeoBuilder();
  const n = fr.length;

  // ballast (left slope, top, right slope) with a bit of colour grit
  const ballast = lc(PALETTE.ballast), ballastDark = lc('#8a8174');
  extrude(gb, fr, [
    [BALLAST_BOT, -BED_DEPTH - 0.08],
    [BALLAST_TOP, 0, ballastDark],
    [-BALLAST_TOP, 0, ballast],
    [-BALLAST_BOT, -BED_DEPTH - 0.08, ballastDark],
  ]);

  // sleepers
  const sleeper = lc(PALETTE.sleeper), sleeper2 = lc('#7a5638');
  const s = {};
  for (let d = SLEEPER_SPACING / 2; d < edge.length; d += SLEEPER_SPACING) {
    edge.sample(d, s);
    if (s.kind === KIND_TUNNEL) continue;
    const ax = new THREE.Vector3(-s.tz, 0, s.tx);
    const az = new THREE.Vector3(s.tx, 0, s.tz);
    const c = new THREE.Vector3(s.x, s.y + SLEEPER_H / 2, s.z);
    const jitter = (hash2(Math.round(s.x * 10), Math.round(s.z * 10)) - 0.5) * 0.05;
    ax.applyAxisAngle(up, jitter);
    az.applyAxisAngle(up, jitter);
    gb.box(c, ax, up, az, 0.36, SLEEPER_H / 2, 0.06, hash2(d * 7, edge.id) > 0.5 ? sleeper : sleeper2);
  }

  // rails: two sides + head
  const railSide = lc('#5b4d45'), railTop = lc(PALETTE.railTop);
  for (const side of [-1, 1]) {
    const o = side * GAUGE_HALF;
    extrude(gb, fr, [
      [o + RAIL_W, SLEEPER_H],
      [o + RAIL_W, SLEEPER_H + RAIL_H, railSide],
      [o - RAIL_W, SLEEPER_H + RAIL_H, railTop],
      [o - RAIL_W, SLEEPER_H, railSide],
    ]);
  }

  // bridges
  const runs = [];
  let i = 0;
  while (i < n) {
    if (edge.kind[i] !== KIND_BRIDGE) { i++; continue; }
    let j = i;
    while (j + 1 < n && edge.kind[j + 1] === KIND_BRIDGE) j++;
    runs.push([i, j]);
    i = j + 1;
  }
  for (const [a, b] of runs) buildBridge(gb, edge, fr, a, b, terrain);

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(gb.build(), toon('#ffffff', { vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // tunnel portals
  for (let k = 1; k < n; k++) {
    const pk = edge.kind[k - 1], ck = edge.kind[k];
    if (pk !== KIND_TUNNEL && ck === KIND_TUNNEL) group.add(makePortal(fr[k], 1));
    if (pk === KIND_TUNNEL && ck !== KIND_TUNNEL) group.add(makePortal(fr[k - 1], -1));
  }
  return group;
}

function buildBridge(gb, edge, fr, a, b, terrain) {
  // style by context: over water -> steel girders on stone piers, tall -> stone viaduct
  let maxGap = 0, wet = false;
  for (let i = a; i <= b; i++) {
    const g = terrain.heightAt(fr[i].x, fr[i].z);
    if (g < WATER + 0.3) wet = true;
    maxGap = Math.max(maxGap, fr[i].y - Math.max(g, WATER));
  }
  const viaduct = !wet && maxGap > 5;
  const deckCol = viaduct ? lc(PALETTE.stone) : lc('#7d3b2c');
  const deckDark = viaduct ? lc(PALETTE.stoneDark) : lc('#5e2a20');
  const top = -BED_DEPTH - 0.02, bot = viaduct ? -0.95 : -0.75;
  const half = 1.05;
  extrude(gb, fr, [
    [half, bot],
    [half, top + 0.35, deckCol],
    [half - 0.12, top + 0.35, deckCol],
    [half - 0.12, top, deckDark],
    [-half + 0.12, top, deckDark],
    [-half + 0.12, top + 0.35, deckDark],
    [-half, top + 0.35, deckCol],
    [-half, bot, deckCol],
    [half, bot, deckDark],
  ], a, b);

  if (!viaduct) {
    // girder ribs along the side
    const rib = lc('#4e2219');
    for (let d = edge.cum[a]; d < edge.cum[b]; d += 1.2) {
      const s = edge.sample(d, {});
      for (const side of [-1, 1]) {
        const c = new THREE.Vector3(s.x - s.tz * side * (half + 0.03), s.y + (top + bot) / 2 + 0.1, s.z + s.tx * side * (half + 0.03));
        gb.box(c, new THREE.Vector3(-s.tz, 0, s.tx), up, new THREE.Vector3(s.tx, 0, s.tz), 0.04, (top - bot) / 2 + 0.2, 0.05, rib);
      }
    }
  }

  // piers
  const span = viaduct ? 5.5 : 7;
  const len = edge.cum[b] - edge.cum[a];
  const count = Math.max(1, Math.round(len / span));
  const stone = lc(PALETTE.stone), stoneDark = lc(PALETTE.stoneDark);
  for (let k = 0; k <= count; k++) {
    const d = edge.cum[a] + (len * k) / count;
    const s = edge.sample(d, {});
    const g = terrain.heightAt(s.x, s.z);
    const foot = Math.min(g, WATER) - (g < WATER ? 1.5 : 0.6);
    const topY = s.y + bot;
    const h = topY - foot;
    if (h < 0.3) continue;
    const ax = new THREE.Vector3(-s.tz, 0, s.tx), az = new THREE.Vector3(s.tx, 0, s.tz);
    const wid = viaduct ? 1.0 : 0.85;
    gb.box(new THREE.Vector3(s.x, foot + h / 2, s.z), ax, up, az, wid, h / 2, viaduct ? 0.55 : 0.4, k % 2 ? stone : stoneDark);
    gb.box(new THREE.Vector3(s.x, topY - 0.12, s.z), ax, up, az, wid + 0.12, 0.12, (viaduct ? 0.55 : 0.4) + 0.1, stoneDark);
    if (viaduct) {
      // arches: a fan of blocks under the deck between this pier and the next
      if (k < count) {
        const d2 = edge.cum[a] + (len * (k + 1)) / count;
        const mid = (d + d2) / 2, r = (d2 - d) / 2 - 0.55;
        const sm = edge.sample(mid, {});
        const springY = sm.y + bot - r * 0.95;
        for (let q = 0; q <= 8; q++) {
          const ang = Math.PI * (q / 8);
          const along = -Math.cos(ang) * r;
          const sq = edge.sample(mid + along, {});
          const yy = springY + Math.sin(ang) * r;
          const fill = sm.y + bot - yy;
          if (fill <= 0.05) continue;
          gb.box(new THREE.Vector3(sq.x, yy + fill / 2, sq.z), new THREE.Vector3(-sq.tz, 0, sq.tx), up, new THREE.Vector3(sq.tx, 0, sq.tz), wid - 0.05, fill / 2, (r * Math.PI) / 16 + 0.08, q % 2 ? stone : stoneDark);
        }
      }
    }
  }
}

let portalGeo = null;
function getPortalGeo() {
  if (portalGeo) return portalGeo;
  const s = new THREE.Shape();
  s.moveTo(-2.3, -0.4); s.lineTo(2.3, -0.4); s.lineTo(2.3, 2.9); s.lineTo(1.9, 3.2); s.lineTo(-1.9, 3.2); s.lineTo(-2.3, 2.9); s.lineTo(-2.3, -0.4);
  const hole = new THREE.Path();
  hole.moveTo(-0.85, -0.4); hole.lineTo(0.85, -0.4); hole.lineTo(0.85, 1.35);
  hole.absarc(0, 1.35, 0.85, 0, Math.PI, false);
  hole.lineTo(-0.85, -0.4);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.35);
  const tube = new THREE.CylinderGeometry(0.86, 0.86, 7, 10, 1, true, Math.PI / 2, Math.PI);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 1.35, -3.5);
  const box = new THREE.BoxGeometry(1.7, 1.75, 7);
  box.translate(0, 0.475, -3.5);
  portalGeo = { face: g, tube, box };
  return portalGeo;
}

// Portal facing outward: `facing` is +1 if the tunnel continues along +tangent.
function makePortal(F, facing) {
  const g = getPortalGeo();
  const grp = new THREE.Group();
  const face = new THREE.Mesh(g.face, toon(PALETTE.stone));
  face.castShadow = true;
  const dark = toon('#1d1b22', { side: THREE.BackSide });
  const tube = new THREE.Mesh(g.tube, dark);
  const box = new THREE.Mesh(g.box, dark);
  grp.add(face, tube, box);
  grp.position.set(F.x, F.y - BED_DEPTH, F.z);
  // local -z points into the tunnel
  const ang = Math.atan2(F.tx * facing, F.tz * facing);
  grp.rotation.y = ang + Math.PI;
  return grp;
}
