import * as THREE from 'three';
import { Kit, wheelsetGeometry } from './kit.js';
import { toon } from '../render/materials.js';
import { lampMat } from '../render/shared.js';

// Liveries a player can pick for a train.
export const LIVERIES = [
  { id: 'brunswick', name: 'Brunswick green', body: '#2f6b4f', trim: '#d9b54a', dark: '#1f2a27', accent: '#b8322a' },
  { id: 'crimson', name: 'Crimson lake', body: '#9b2c2c', trim: '#e2c25a', dark: '#2a1d1e', accent: '#f0e2c0' },
  { id: 'garter', name: 'Garter blue', body: '#2c5d8f', trim: '#f2ead2', dark: '#1d2633', accent: '#c0392b' },
  { id: 'black', name: 'Lined black', body: '#2d2c30', trim: '#c4473a', dark: '#18181b', accent: '#d9b54a' },
  { id: 'marigold', name: 'Marigold', body: '#d8962c', trim: '#5a2f1e', dark: '#33251a', accent: '#2f6b4f' },
  { id: 'teal', name: 'Seaside teal', body: '#2f8a86', trim: '#f4ecd8', dark: '#173332', accent: '#e07a3a' },
];

const BLACK = '#2d2c30', STEEL = '#4a4d55', BRASS = '#d0a443', RED = '#b8322a', WOOD = '#8a5a3b';

function wheelset(r, spokes, color, tire, cw) {
  const mesh = new THREE.Mesh(wheelsetGeometry(r, spokes, color, tire, 0.18, cw), toon('#ffffff', { vertexColors: true }));
  mesh.castShadow = true;
  return mesh;
}

function buffers(k, x, dir, beam = RED) {
  k.box(0.07, 0.22, 0.78, beam, x, 0.46, 0);
  for (const z of [-0.27, 0.27]) {
    k.cyl(0.05, 0.16, STEEL, x + dir * 0.1, 0.46, z, 'x', 8);
    k.cyl(0.075, 0.03, '#77736c', x + dir * 0.19, 0.46, z, 'x', 10);
  }
  k.box(0.08, 0.05, 0.05, '#3a3a3e', x + dir * 0.08, 0.42, 0); // coupling hook
}

// A 2-axle bogie centred at x.
function bogie(k, wheels, x, r = 0.15, spread = 0.65) {
  k.box(spread + 0.5, 0.1, 0.5, '#2f2e33', x, r + 0.04, 0);
  for (const z of [-0.28, 0.28]) {
    k.box(spread + 0.45, 0.16, 0.05, '#3a393f', x, r + 0.02, z);
    k.box(0.12, 0.18, 0.06, '#57565c', x, r + 0.05, z + Math.sign(z) * 0.03); // spring
  }
  for (const dx of [-spread / 2, spread / 2]) {
    const w = wheelset(r, 0, '#3a3a3e', '#6b6a70');
    w.position.set(x + dx, r, 0);
    wheels.push({ mesh: w, r });
  }
}

// ---------------------------------------------------------------- locomotives

function steamPacific(liv) {
  const k = new Kit();
  const wheels = [];
  const body = liv.body, dark = liv.dark, trim = liv.trim;
  const R = 0.34, axY = R;
  const drivers = [-0.6, 0.04, 0.68];
  // frames & running plate
  k.box(3.4, 0.16, 0.5, dark, 0.05, 0.42, 0);
  k.box(3.3, 0.04, 0.96, body, 0.05, 0.66, 0);
  k.box(3.3, 0.02, 0.98, trim, 0.05, 0.645, 0);
  // valances over the wheels
  for (const z of [-0.47, 0.47]) k.box(3.2, 0.1, 0.03, body, 0.05, 0.6, z);
  buffers(k, 1.78, 1);
  k.box(0.09, 0.05, 0.8, '#ffffff', 1.8, 0.585, 0); // white lining on beam
  // boiler, firebox & smokebox
  k.cyl(0.36, 2.0, body, 0.45, 0.98, 0, 'x', 20);
  for (const x of [-0.35, 0.2, 0.75, 1.2]) k.cyl(0.368, 0.035, trim, x, 0.98, 0, 'x', 20);
  k.cyl(0.38, 0.42, '#36353b', 1.56, 0.98, 0, 'x', 20);
  k.cyl(0.31, 0.04, '#4c4b52', 1.78, 0.98, 0, 'x', 20);
  k.cyl(0.05, 0.05, BRASS, 1.81, 0.98, 0, 'x', 8);
  k.box(0.04, 0.03, 0.28, BRASS, 1.81, 0.98, 0);
  k.box(0.7, 0.62, 0.74, body, -0.85, 0.96, 0); // firebox
  // smoke deflectors
  for (const z of [-0.43, 0.43]) k.box(0.62, 0.5, 0.025, dark, 1.4, 1.0, z);
  // chimney, dome, safety valves, whistle
  k.cyl(0.11, 0.3, '#2b2a2f', 1.5, 1.42, 0, 'y', 12, 0.13);
  k.cyl(0.15, 0.05, '#2b2a2f', 1.5, 1.58, 0, 'y', 12);
  k.cyl(0.14, 0.18, body, 0.55, 1.38, 0, 'y', 12);
  k.sphere(0.14, BRASS, 0.55, 1.47, 0, 0.6);
  k.cyl(0.05, 0.16, BRASS, -0.3, 1.38, 0, 'y', 8);
  k.cyl(0.03, 0.18, BRASS, -0.48, 1.42, 0, 'y', 6);
  // handrails
  for (const z of [-0.33, 0.33]) k.cyl(0.012, 1.8, BRASS, 0.5, 1.12, z, 'x', 4);
  // cab
  const cx0 = -1.62, cx1 = -0.98;
  for (const z of [-0.45, 0.45]) {
    k.box(cx1 - cx0, 0.42, 0.04, body, (cx0 + cx1) / 2, 0.88, z);
    k.box(0.12, 0.5, 0.04, body, cx0 + 0.06, 1.33, z);
    k.box(0.14, 0.5, 0.04, body, cx1 - 0.07, 1.33, z);
    k.box(cx1 - cx0, 0.02, 0.045, trim, (cx0 + cx1) / 2, 1.08, z);
    k.glass(0.36, 0.32, 0.02, (cx0 + cx1) / 2, 1.32, z * 0.99);
  }
  k.box(0.05, 1.0, 0.94, body, cx1 + 0.02, 1.12, 0); // cab front
  for (const z of [-0.24, 0.24]) k.cyl(0.11, 0.02, '#ffffff', cx1 + 0.05, 1.42, z, 'x', 12, 0.11);
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), dark, (cx0 + cx1) / 2 - 0.03, 1.55, 0, Math.PI / 2, 0, Math.PI / 2, 0.52, cx1 - cx0 + 0.16, 0.14);
  // cylinders and steam chests
  for (const z of [-0.42, 0.42]) {
    k.cyl(0.15, 0.62, dark, 1.2, 0.42, z, 'x', 14);
    k.cyl(0.155, 0.04, '#77736c', 0.9, 0.42, z, 'x', 14);
    k.cyl(0.155, 0.04, '#77736c', 1.5, 0.42, z, 'x', 14);
    k.box(0.5, 0.1, 0.04, '#5a5960', 0.55, 0.42, z * 1.05); // slide bars
  }
  // lamps
  k.lamp(0.07, 1.84, 0.68, 0);
  k.cyl(0.08, 0.1, BLACK, 1.8, 1.22, 0, 'y', 8);
  k.lamp(0.06, 1.85, 1.22, 0);
  const grp = k.build();

  // driving wheels with spokes & balance weights
  for (const x of drivers) {
    const w = wheelset(R, 8, liv.body, '#3a393e', true);
    w.position.set(x, axY, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: R });
  }
  // leading bogie and trailing truck
  for (const x of [1.18, 1.52]) {
    const w = wheelset(0.17, 6, liv.body, '#3a393e');
    w.position.set(x, 0.17, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: 0.17 });
  }
  const tw = wheelset(0.2, 6, liv.body, '#3a393e');
  tw.position.set(-1.3, 0.2, 0);
  grp.add(tw);
  wheels.push({ mesh: tw, r: 0.2 });

  // motion: coupling rods, connecting rods, piston rods (both sides)
  const rodMat = toon('#c9c6bf');
  const rods = [];
  for (const side of [-1, 1]) {
    const z = side * 0.31;
    const coupling = new THREE.Mesh(new THREE.BoxGeometry(drivers[2] - drivers[0] + 0.12, 0.05, 0.025), rodMat);
    const conn = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.055, 0.025), rodMat);
    const piston = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.03), rodMat);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), toon('#5a5960'));
    coupling.position.z = z + side * 0.03;
    conn.position.z = z + side * 0.06;
    piston.position.z = z + side * 0.07;
    cross.position.z = z + side * 0.07;
    for (const m of [coupling, conn, piston, cross]) { m.castShadow = true; grp.add(m); }
    rods.push({ coupling, conn, piston, cross, phase: side > 0 ? 0 : Math.PI / 2 });
  }
  const rc = 0.14, Lr = 1.0, cylX = 0.92, yc = 0.42;
  const animate = (dist) => {
    const th0 = -dist / R;
    for (const r of rods) {
      const th = th0 + r.phase;
      const cx = Math.cos(th) * rc, cy = Math.sin(th) * rc;
      r.coupling.position.set((drivers[0] + drivers[2]) / 2 + cx, axY + cy, r.coupling.position.z);
      const px = drivers[1] + cx, py = axY + cy;
      const hx = px + Math.sqrt(Math.max(0.01, Lr * Lr - (py - yc) * (py - yc)));
      r.conn.position.set((px + hx) / 2, (py + yc) / 2, r.conn.position.z);
      r.conn.rotation.z = Math.atan2(yc - py, hx - px);
      r.cross.position.set(hx, yc, r.cross.position.z);
      const plen = Math.max(0.05, cylX - hx);
      r.piston.scale.x = plen;
      r.piston.position.set(hx + plen / 2, yc, r.piston.position.z);
    }
  };
  return { group: grp, wheels, animate, smoke: [new THREE.Vector3(1.5, 1.62, 0)], steam: true, headlight: new THREE.Vector3(1.86, 0.68, 0), cab: new THREE.Vector3(-1.3, 1.4, 0) };
}

function tender(liv) {
  const k = new Kit();
  const wheels = [];
  k.box(2.5, 0.14, 0.5, liv.dark, 0, 0.42, 0);
  k.box(2.4, 0.64, 0.92, liv.body, 0, 0.84, 0);
  k.box(2.42, 0.03, 0.94, liv.trim, 0, 0.62, 0);
  k.box(2.42, 0.03, 0.94, liv.trim, 0, 1.12, 0);
  k.box(2.44, 0.06, 0.96, liv.dark, 0, 1.18, 0);
  // coal heap
  k.add(new THREE.CylinderGeometry(1, 1, 1, 9, 1), '#24232a', 0.25, 1.16, 0, 0, 0, Math.PI / 2, 0.24, 1.6, 0.42);
  for (let i = 0; i < 9; i++) k.box(0.18, 0.12, 0.18, '#1d1c22', -0.3 + (i % 3) * 0.4 + Math.sin(i) * 0.08, 1.33 + (i % 2) * 0.03, -0.25 + Math.floor(i / 3) * 0.25, i, i * 2, 0);
  k.box(0.6, 0.3, 0.86, liv.body, -0.9, 1.3, 0); // water filler
  k.cyl(0.12, 0.08, BLACK, -0.9, 1.49, 0.2, 'y', 10);
  k.box(0.05, 0.4, 0.04, BRASS, 1.23, 0.95, 0.4);
  k.box(0.05, 0.4, 0.04, BRASS, 1.23, 0.95, -0.4);
  buffers(k, -1.25, -1);
  for (const z of [-0.47, 0.47]) for (const x of [-0.8, 0, 0.8]) k.box(0.3, 0.16, 0.03, '#3a393f', x, 0.24, z);
  const grp = k.build();
  for (const x of [-0.8, 0, 0.8]) {
    const w = wheelset(0.2, 6, liv.dark, '#3a393e');
    w.position.set(x, 0.2, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: 0.2 });
  }
  return { group: grp, wheels };
}

// ---------------------------------------------------------------- carriages

function coach(liv) {
  const k = new Kit();
  const wheels = [];
  const L = 4.2;
  const lower = liv.body, upper = liv.accent === '#b8322a' ? '#efe2c0' : liv.accent;
  k.box(L - 0.2, 0.14, 0.6, '#2f2e33', 0, 0.42, 0);
  k.box(L, 0.42, 0.9, lower, 0, 0.72, 0);
  k.box(L, 0.42, 0.9, upper, 0, 1.14, 0);
  k.box(L + 0.01, 0.03, 0.91, liv.trim, 0, 0.94, 0);
  k.box(L + 0.01, 0.03, 0.91, liv.trim, 0, 1.36, 0);
  // roof
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), '#6c6a6f', 0, 1.35, 0, Math.PI / 2, 0, Math.PI / 2, 0.5, L + 0.06, 0.18);
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.3; x += 0.9) k.cyl(0.05, 0.08, '#4f4e54', x, 1.55, 0, 'y', 8);
  // windows & doors
  for (const z of [-0.455, 0.455]) {
    for (let i = 0; i < 6; i++) {
      const x = -L / 2 + 0.55 + i * 0.62;
      k.glass(0.42, 0.28, 0.02, x, 1.16, z);
    }
    for (const x of [-L / 2 + 0.18, L / 2 - 0.18]) {
      k.box(0.28, 0.75, 0.02, lower, x, 0.93, z * 1.01);
      k.glass(0.16, 0.16, 0.02, x, 1.18, z * 1.02);
      k.box(0.02, 0.06, 0.03, BRASS, x + 0.1, 0.98, z * 1.03);
    }
  }
  // gangways
  for (const x of [-L / 2 - 0.05, L / 2 + 0.05]) k.box(0.12, 0.8, 0.6, '#3a393f', x, 0.95, 0);
  buffers(k, L / 2 + 0.02, 1, '#2f2e33');
  buffers(k, -L / 2 - 0.02, -1, '#2f2e33');
  // underframe details
  k.box(1.0, 0.18, 0.4, '#3a393f', 0, 0.3, 0);
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.4);
  bogie(bg, wheels, 1.4);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels, lit: true };
}

function logWagon() {
  const k = new Kit();
  const wheels = [];
  const L = 3.6;
  k.box(L, 0.14, 0.86, '#5e4632', 0, 0.48, 0);
  k.box(L, 0.08, 0.5, '#2f2e33', 0, 0.38, 0);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-0.42, 0.42]) k.box(0.06, 0.62, 0.06, '#3a2a1e', x, 0.84, z);
  const ck = new Kit();
  const logs = ['#8a5a3b', '#7a4f30', '#9a6a42'];
  let i = 0;
  for (const [y, zs] of [[0.7, [-0.27, 0, 0.27]], [0.93, [-0.14, 0.14]], [1.14, [0]]]) {
    for (const z of zs) {
      ck.cyl(0.13, L - 0.15, logs[i++ % 3], 0, y, z, 'x', 8);
      ck.cyl(0.11, 0.01, '#e2c79a', L / 2 - 0.07, y, z, 'x', 8);
      ck.cyl(0.11, 0.01, '#e2c79a', -L / 2 + 0.07, y, z, 'x', 8);
    }
  }
  ck.box(0.04, 0.04, 0.9, '#55545a', 0.6, 1.2, 0);
  ck.box(0.04, 0.04, 0.9, '#55545a', -0.6, 1.2, 0);
  buffers(k, L / 2, 1, '#2f2e33');
  buffers(k, -L / 2, -1, '#2f2e33');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.1);
  bogie(bg, wheels, 1.1);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels };
}

// Shared steam motion (coupling + connecting rods) for n driving wheels.
function steamMotion(grp, drivers, R, axY, opts) {
  const rodMat = toon('#c9c6bf');
  const rods = [];
  const { rc = 0.13, Lr = 0.95, cylX, yc = 0.4, z0 = 0.3 } = opts;
  for (const side of [-1, 1]) {
    const z = side * z0;
    const span = drivers[drivers.length - 1] - drivers[0];
    const coupling = span > 0.01 ? new THREE.Mesh(new THREE.BoxGeometry(span + 0.12, 0.045, 0.025), rodMat) : null;
    const conn = new THREE.Mesh(new THREE.BoxGeometry(Lr, 0.05, 0.025), rodMat);
    const piston = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.03), rodMat);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), toon('#5a5960'));
    if (coupling) { coupling.position.z = z + side * 0.03; grp.add(coupling); }
    conn.position.z = z + side * 0.06;
    piston.position.z = z + side * 0.07;
    cross.position.z = z + side * 0.07;
    grp.add(conn, piston, cross);
    rods.push({ coupling, conn, piston, cross, phase: side > 0 ? 0 : Math.PI / 2 });
  }
  const main = drivers[drivers.length - 1];
  const mid = (drivers[0] + drivers[drivers.length - 1]) / 2;
  return (dist) => {
    const th0 = -dist / R;
    for (const r of rods) {
      const th = th0 + r.phase;
      const cx = Math.cos(th) * rc, cy = Math.sin(th) * rc;
      if (r.coupling) r.coupling.position.set(mid + cx, axY + cy, r.coupling.position.z);
      const px = main + cx, py = axY + cy;
      const hx = px + Math.sqrt(Math.max(0.01, Lr * Lr - (py - yc) * (py - yc)));
      r.conn.position.set((px + hx) / 2, (py + yc) / 2, r.conn.position.z);
      r.conn.rotation.z = Math.atan2(yc - py, hx - px);
      r.cross.position.set(hx, yc, r.cross.position.z);
      const plen = Math.max(0.05, cylX - hx);
      r.piston.scale.x = plen;
      r.piston.position.set(hx + plen / 2, yc, r.piston.position.z);
    }
  };
}

function american(liv) {
  const k = new Kit();
  const wheels = [];
  const body = liv.body, trim = liv.trim, dark = liv.dark;
  const R = 0.36, drivers = [-0.72, 0.12];
  k.box(3.0, 0.14, 0.46, dark, 0.1, 0.42, 0);
  k.box(2.6, 0.04, 0.9, dark, 0.0, 0.7, 0);
  k.box(0.08, 0.2, 0.86, liv.accent === '#f0e2c0' ? RED : liv.accent, 1.55, 0.5, 0);
  // cowcatcher slats
  for (let i = -3; i <= 3; i++) {
    const z = i * 0.12;
    k.box(0.55, 0.04, 0.04, '#b8322a', 1.8, 0.24, z * 0.9, 0, -z * 1.2, -0.65);
  }
  k.box(0.06, 0.05, 0.9, '#2d2c30', 1.6, 0.42, 0);
  // boiler with brass bands, smokebox, balloon stack
  k.cyl(0.32, 1.9, body, 0.4, 1.0, 0, 'x', 18);
  for (const x of [-0.4, 0.15, 0.7, 1.2]) k.cyl(0.33, 0.04, BRASS, x, 1.0, 0, 'x', 18);
  k.cyl(0.34, 0.35, '#36353b', 1.45, 1.0, 0, 'x', 18);
  k.cyl(0.07, 0.25, '#2d2c30', 1.45, 1.42, 0, 'y', 10);
  k.cyl(0.25, 0.45, '#2d2c30', 1.45, 1.72, 0, 'y', 12, 0.1);
  k.cyl(0.26, 0.06, '#3a393f', 1.45, 1.96, 0, 'y', 12);
  // headlamp
  k.box(0.32, 0.3, 0.3, '#2d2c30', 1.42, 1.48, 0);
  k.box(0.04, 0.18, 0.22, BRASS, 1.6, 1.5, 0);
  k.lamp(0.1, 1.6, 1.48, 0);
  // domes and bell
  k.cyl(0.13, 0.2, BRASS, 0.75, 1.4, 0, 'y', 10);
  k.sphere(0.13, BRASS, 0.75, 1.5, 0, 0.6);
  k.cyl(0.12, 0.22, BRASS, 0.05, 1.4, 0, 'y', 10);
  k.sphere(0.12, BRASS, 0.05, 1.5, 0, 0.6);
  k.cyl(0.03, 0.12, '#2d2c30', 0.4, 1.36, 0, 'y', 5);
  k.cyl(0.09, 0.12, BRASS, 0.4, 1.48, 0, 'y', 10, 0.05);
  // cylinders
  for (const z of [-0.4, 0.4]) k.cyl(0.14, 0.5, dark, 1.08, 0.42, z, 'x', 12);
  // wooden cab
  const wood = '#a0673a', woodD = '#7a4f30';
  const cx0 = -1.55, cx1 = -0.82;
  for (const z of [-0.44, 0.44]) {
    k.box(cx1 - cx0, 0.4, 0.05, wood, (cx0 + cx1) / 2, 0.92, z);
    k.box(0.1, 0.5, 0.05, wood, cx0 + 0.05, 1.37, z);
    k.box(0.1, 0.5, 0.05, wood, cx1 - 0.05, 1.37, z);
    k.box(0.12, 0.5, 0.05, wood, (cx0 + cx1) / 2, 1.37, z);
    k.glass(0.2, 0.3, 0.02, cx0 + 0.22, 1.36, z * 0.99);
    k.glass(0.2, 0.3, 0.02, cx1 - 0.22, 1.36, z * 0.99);
    for (let y = 0.78; y < 1.1; y += 0.1) k.box(cx1 - cx0, 0.015, 0.055, woodD, (cx0 + cx1) / 2, y, z);
  }
  k.box(0.05, 0.95, 0.9, wood, cx1 + 0.02, 1.15, 0);
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), '#4a3a33', (cx0 + cx1) / 2, 1.62, 0, Math.PI / 2, 0, Math.PI / 2, 0.55, cx1 - cx0 + 0.24, 0.12);
  // pilot lettering board & number plate
  k.box(0.02, 0.12, 0.3, BRASS, 1.63, 1.0, 0);
  const grp = k.build();
  for (const x of drivers) {
    const w = wheelset(R, 10, liv.accent === '#f0e2c0' ? '#b8322a' : body, '#3a393e', true);
    w.position.set(x, R, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: R });
  }
  for (const x of [0.95, 1.3]) {
    const w = wheelset(0.17, 6, '#b8322a', '#3a393e');
    w.position.set(x, 0.17, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: 0.17 });
  }
  const animate = steamMotion(grp, drivers, R, R, { cylX: 0.85, yc: 0.42, z0: 0.31, Lr: 0.85, rc: 0.13 });
  return { group: grp, wheels, animate, smoke: [new THREE.Vector3(1.45, 1.98, 0)], steam: true, headlight: new THREE.Vector3(1.66, 1.48, 0) };
}

function woodTender(liv) {
  const k = new Kit();
  const wheels = [];
  k.box(2.3, 0.14, 0.5, liv.dark, 0, 0.42, 0);
  k.box(2.2, 0.55, 0.9, liv.body, 0, 0.78, 0);
  k.box(2.22, 0.04, 0.92, liv.trim, 0, 1.04, 0);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) {
    const y = 1.12 + r * 0.14, z = -0.34 + i * 0.13 + r * 0.065;
    k.cyl(0.07, 1.3, i % 2 ? '#8a5a3b' : '#a0673a', 0.25, y, z, 'x', 6);
  }
  k.box(0.5, 0.35, 0.86, liv.body, -0.8, 1.2, 0);
  buffers(k, -1.15, -1, '#2d2c30');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -0.55, 0.17, 0.5);
  bogie(bg, wheels, 0.55, 0.17, 0.5);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels };
}

function tankEngine(liv) {
  const k = new Kit();
  const wheels = [];
  const body = liv.body, trim = liv.trim, dark = liv.dark;
  const R = 0.27, drivers = [-0.5, 0.05, 0.6];
  k.box(2.4, 0.14, 0.46, dark, 0.05, 0.36, 0);
  k.box(2.5, 0.04, 0.92, dark, 0.05, 0.58, 0);
  buffers(k, 1.28, 1);
  buffers(k, -1.2, -1);
  k.cyl(0.3, 1.2, body, 0.55, 0.9, 0, 'x', 18);
  k.cyl(0.32, 0.25, '#36353b', 1.08, 0.9, 0, 'x', 18);
  k.cyl(0.26, 0.03, '#4c4b52', 1.21, 0.9, 0, 'x', 18);
  for (const z of [-0.33, 0.33]) {
    k.box(1.2, 0.5, 0.26, body, 0.35, 0.86, z);
    k.box(1.22, 0.03, 0.27, trim, 0.35, 0.68, z);
    k.box(1.22, 0.03, 0.27, trim, 0.35, 1.08, z);
  }
  k.cyl(0.09, 0.42, '#2d2c30', 1.05, 1.32, 0, 'y', 10, 0.11);
  k.cyl(0.13, 0.05, '#2d2c30', 1.05, 1.54, 0, 'y', 10);
  k.cyl(0.13, 0.18, BRASS, 0.5, 1.26, 0, 'y', 10);
  k.sphere(0.13, BRASS, 0.5, 1.35, 0, 0.6);
  // cab + bunker
  k.box(0.62, 0.95, 0.92, body, -0.5, 1.07, 0);
  k.box(0.64, 0.03, 0.94, trim, -0.5, 0.82, 0);
  for (const z of [-0.47, 0.47]) k.glass(0.3, 0.26, 0.02, -0.5, 1.28, z);
  k.glass(0.02, 0.2, 0.2, -0.18, 1.32, 0.22);
  k.glass(0.02, 0.2, 0.2, -0.18, 1.32, -0.22);
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), dark, -0.5, 1.53, 0, Math.PI / 2, 0, Math.PI / 2, 0.5, 0.76, 0.12);
  k.box(0.45, 0.6, 0.9, body, -0.98, 0.9, 0);
  k.box(0.4, 0.12, 0.8, '#24232a', -0.98, 1.24, 0);
  for (const z of [-0.36, 0.36]) k.cyl(0.11, 0.4, dark, 0.95, 0.36, z, 'x', 12);
  k.lamp(0.06, 1.3, 0.62, 0);
  const grp = k.build();
  for (const x of drivers) {
    const w = wheelset(R, 8, body, '#3a393e', true);
    w.position.set(x, R, 0);
    grp.add(w);
    wheels.push({ mesh: w, r: R });
  }
  const animate = steamMotion(grp, drivers, R, R, { cylX: 0.78, yc: 0.36, z0: 0.29, Lr: 0.6, rc: 0.1 });
  return { group: grp, wheels, animate, smoke: [new THREE.Vector3(1.05, 1.58, 0)], steam: true, headlight: new THREE.Vector3(1.33, 0.62, 0) };
}

function dieselStreamliner(liv) {
  const k = new Kit();
  const wheels = [];
  const L = 4.6, body = liv.body, stripe = liv.trim, dark = liv.dark;
  k.box(L - 0.4, 0.2, 0.6, '#2f2e33', 0, 0.4, 0);
  k.box(L - 1.0, 0.95, 0.92, body, -0.5, 1.0, 0);
  // rounded nose
  k.add(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), body, L / 2 - 1.0, 0.55, 0, 0, 0, -Math.PI / 2, 0.55, 0.95, 0.46);
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), body, -0.5, 1.47, 0, Math.PI / 2, 0, Math.PI / 2, 0.46, L - 1.0, 0.16);
  k.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), body, L / 2 - 1.05, 1.0, 0, 0, 0, -Math.PI / 2, 0.5, 1.0, 0.46);
  // side stripes and nose chevrons
  for (const z of [-0.465, 0.465]) {
    k.box(L - 0.9, 0.08, 0.01, stripe, -0.45, 0.75, z);
    k.box(L - 0.9, 0.04, 0.01, stripe, -0.45, 0.88, z);
    for (let i = 0; i < 5; i++) k.glass(0.22, 0.16, 0.01, -1.6 + i * 0.36, 1.25, z);
  }
  k.box(0.36, 0.16, 0.8, stripe, L / 2 - 0.55, 0.85, 0, 0, 0, -0.5);
  k.glass(0.3, 0.2, 0.7, L / 2 - 0.85, 1.32, 0);
  k.lamp(0.1, L / 2 - 0.47, 1.05, 0);
  k.box(0.05, 0.08, 0.25, '#c9c6bf', L / 2 - 0.1, 0.62, 0);
  // roof fans and horn
  for (const x of [-1.6, -1.0, -0.4]) k.cyl(0.14, 0.05, '#4a4d55', x, 1.62, 0, 'y', 10);
  k.cyl(0.03, 0.18, '#c9c6bf', 0.6, 1.6, 0.15, 'x', 6);
  // fuel tank
  k.box(1.6, 0.3, 0.7, '#3a393f', -0.5, 0.3, 0);
  buffers(k, -L / 2 + 0.05, -1, '#2d2c30');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.4, 0.17, 0.75);
  bogie(bg, wheels, 1.15, 0.17, 0.75);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels, smoke: [new THREE.Vector3(-1.0, 1.66, 0)], headlight: new THREE.Vector3(L / 2 - 0.4, 1.05, 0) };
}

function electricExpress(liv) {
  const k = new Kit();
  const wheels = [];
  const L = 5.0, white = '#f2efe7', body = liv.body;
  k.box(L - 0.6, 0.18, 0.6, '#2f2e33', -0.1, 0.4, 0);
  k.box(L - 1.6, 1.0, 0.94, white, -0.6, 1.0, 0);
  // long tapered nose
  k.add(new THREE.ConeGeometry(1, 1, 16, 1, false), white, L / 2 - 0.9, 0.98, 0, 0, 0, -Math.PI / 2, 0.5, 1.6, 0.47);
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), white, -0.6, 1.5, 0, Math.PI / 2, 0, Math.PI / 2, 0.47, L - 1.6, 0.12);
  for (const z of [-0.475, 0.475]) {
    k.box(L - 1.2, 0.12, 0.01, body, -0.3, 0.72, z);
    for (let i = 0; i < 6; i++) k.glass(0.36, 0.2, 0.01, -2.0 + i * 0.48, 1.18, z);
  }
  k.glass(0.5, 0.22, 0.6, L / 2 - 1.2, 1.25, 0);
  k.box(0.7, 0.06, 0.96, body, L / 2 - 1.15, 1.08, 0);
  k.lamp(0.07, L / 2 - 0.15, 0.85, 0.12);
  k.lamp(0.07, L / 2 - 0.15, 0.85, -0.12);
  // pantograph (diamond)
  const px = -1.4, py = 1.62;
  k.box(0.6, 0.06, 0.5, '#4a4d55', px, py, 0);
  k.box(0.05, 0.05, 0.7, '#c9c6bf', px, py + 0.75, 0);
  k.box(0.6, 0.03, 0.03, '#c9c6bf', px - 0.12, py + 0.38, 0, 0, 0, 1.0);
  k.box(0.6, 0.03, 0.03, '#c9c6bf', px + 0.12, py + 0.38, 0, 0, 0, -1.0);
  buffers(k, -L / 2 + 0.05, -1, '#2d2c30');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.6, 0.16, 0.7);
  bogie(bg, wheels, 1.0, 0.16, 0.7);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels, headlight: new THREE.Vector3(L / 2 - 0.1, 0.85, 0) };
}

function boxcar(liv) {
  const k = new Kit();
  const wheels = [];
  const L = 3.8, col = '#9b4a32', dark = '#6e3424';
  k.box(L, 0.12, 0.62, '#2f2e33', 0, 0.42, 0);
  k.box(L, 1.0, 0.9, col, 0, 1.0, 0);
  for (let x = -L / 2 + 0.2; x < L / 2; x += 0.3) for (const z of [-0.455, 0.455]) k.box(0.02, 0.98, 0.01, dark, x, 1.0, z);
  for (const z of [-0.462, 0.462]) {
    k.box(0.9, 0.85, 0.01, '#b5553c', 0, 0.98, z);
    k.box(0.9, 0.04, 0.02, '#3a393f', 0, 1.43, z * 1.01);
  }
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), '#5c5a5f', 0, 1.5, 0, Math.PI / 2, 0, Math.PI / 2, 0.48, L + 0.06, 0.1);
  buffers(k, L / 2, 1, '#2f2e33');
  buffers(k, -L / 2, -1, '#2f2e33');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.15);
  bogie(bg, wheels, 1.15);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels };
}

function hopper() {
  const k = new Kit();
  const wheels = [];
  const L = 3.4, col = '#4a4d55';
  k.box(L, 0.12, 0.6, '#2f2e33', 0, 0.42, 0);
  k.box(L, 0.7, 0.92, col, 0, 1.0, 0);
  for (const x of [-0.8, 0.8]) k.add(new THREE.ConeGeometry(0.5, 0.5, 4), col, x, 0.52, 0, Math.PI, Math.PI / 4, 0, 1.2, 1, 1.2);
  for (let x = -L / 2 + 0.3; x < L / 2; x += 0.55) for (const z of [-0.465, 0.465]) k.box(0.05, 0.7, 0.02, '#3a3d44', x, 1.0, z);
  const ck = new Kit();
  for (let i = 0; i < 14; i++) ck.box(0.4, 0.2, 0.35, i % 2 ? '#1d1c22' : '#26252b', -1.4 + (i % 7) * 0.47, 1.38 + (i % 3) * 0.04, -0.2 + Math.floor(i / 7) * 0.4, i, i * 0.7, 0.2);
  k.box(L - 0.1, 0.02, 0.86, '#2a2a30', 0, 1.3, 0);
  buffers(k, L / 2, 1, '#2f2e33');
  buffers(k, -L / 2, -1, '#2f2e33');
  const grp = k.build();
  const cargoMesh = ck.build();
  cargoMesh.visible = false;
  grp.add(cargoMesh);
  const bg = new Kit();
  bogie(bg, wheels, -1.0);
  bogie(bg, wheels, 1.0);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels, cargoMesh };
}

function tankCar() {
  const k = new Kit();
  const wheels = [];
  const L = 3.6;
  k.box(L, 0.12, 0.6, '#2f2e33', 0, 0.42, 0);
  k.box(L, 0.05, 0.98, '#3a393f', 0, 0.56, 0);
  k.cyl(0.45, L - 0.3, '#e9e4d6', 0, 1.02, 0, 'x', 18);
  k.sphere(0.45, '#e9e4d6', L / 2 - 0.15, 1.02, 0, 1);
  k.sphere(0.45, '#e9e4d6', -L / 2 + 0.15, 1.02, 0, 1);
  k.cyl(0.46, 0.25, '#c0392b', 0, 1.02, 0, 'x', 18);
  k.cyl(0.18, 0.2, '#e9e4d6', 0, 1.5, 0, 'y', 12);
  k.cyl(0.2, 0.04, '#3a393f', 0, 1.61, 0, 'y', 12);
  for (const z of [-0.47, 0.47]) k.cyl(0.015, L - 0.4, '#2d2c30', 0, 1.25, z, 'x', 4);
  buffers(k, L / 2, 1, '#2f2e33');
  buffers(k, -L / 2, -1, '#2f2e33');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -1.1);
  bogie(bg, wheels, 1.1);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels };
}

function caboose() {
  const k = new Kit();
  const wheels = [];
  const L = 3.0, red = '#b8322a', trim = '#f2e6c8';
  k.box(L, 0.12, 0.62, '#2f2e33', 0, 0.42, 0);
  k.box(L, 0.05, 0.98, '#5e4632', 0, 0.55, 0);
  k.box(L - 0.8, 0.85, 0.9, red, 0, 1.0, 0);
  k.box(L - 0.8, 0.05, 0.95, trim, 0, 1.45, 0);
  k.box(1.0, 0.4, 0.75, red, 0, 1.68, 0);
  k.box(1.1, 0.05, 0.85, '#4a3a33', 0, 1.9, 0);
  for (const z of [-0.455, 0.455]) {
    for (const x of [-0.6, 0.6]) k.glass(0.28, 0.26, 0.02, x, 1.15, z);
    k.glass(0.25, 0.16, 0.02, 0, 1.68, z * 0.83);
  }
  for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) {
    k.box(0.04, 0.5, 0.9, '#2d2c30', x, 0.82, 0);
    k.box(0.4, 0.04, 0.9, '#5e4632', x, 1.05, 0);
  }
  k.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, Math.PI / 2, Math.PI), '#4a3a33', 0, 1.42, 0, Math.PI / 2, 0, Math.PI / 2, 0.52, L - 0.7, 0.1);
  k.cyl(0.05, 0.3, '#2d2c30', 0.9, 1.55, 0.25, 'y', 6);
  k.lamp(0.07, -L / 2 + 0.05, 1.0, 0.35);
  buffers(k, L / 2, 1, '#2f2e33');
  buffers(k, -L / 2, -1, '#2f2e33');
  const grp = k.build();
  const bg = new Kit();
  bogie(bg, wheels, -0.85, 0.15, 0.6);
  bogie(bg, wheels, 0.85, 0.15, 0.6);
  grp.add(bg.build());
  for (const w of wheels) grp.add(w.mesh);
  return { group: grp, wheels, smoke: [new THREE.Vector3(0.9, 1.72, 0.25)], tailLamp: new THREE.Vector3(-L / 2, 1.0, 0.35) };
}

function diningCar(liv) {
  const v = coach({ ...liv, body: '#5a2a3a', accent: '#efe2c0', trim: '#d9b54a' });
  return v;
}

// ---------------------------------------------------------------- catalogue

export const VEHICLES = {
  pacific: { name: 'Pacific steam', kind: 'loco', length: 3.75, bogie: 2.4, maxSpeed: 8, accel: 1.0, build: steamPacific, tender: 'tender', blurb: 'An elegant express engine with gleaming valve gear and smoke deflectors.' },
  american: { name: 'Frontier 4-4-0', kind: 'loco', length: 3.6, bogie: 2.2, maxSpeed: 6.5, accel: 0.9, build: american, tender: 'woodTender', blurb: 'Balloon stack, brass bell and a proud cowcatcher. Burns wood.' },
  tank: { name: 'Little tank engine', kind: 'loco', length: 2.75, bogie: 1.5, maxSpeed: 5.5, accel: 1.2, build: tankEngine, blurb: 'A cheerful little engine for branch lines and short trains.' },
  diesel: { name: 'Comet diesel', kind: 'loco', length: 4.7, bogie: 2.55, maxSpeed: 10, accel: 1.3, build: dieselStreamliner, blurb: 'A streamlined diesel with a rounded nose and bold stripes.' },
  electric: { name: 'Swift electric', kind: 'loco', length: 5.1, bogie: 2.6, maxSpeed: 13, accel: 1.6, build: electricExpress, blurb: 'A sleek, quiet express that glides across the island.' },
  tender: { name: 'Tender', kind: 'tender', length: 2.7, bogie: 1.6, build: tender },
  woodTender: { name: 'Wood tender', kind: 'tender', length: 2.4, bogie: 1.1, build: woodTender },
  coach: { name: 'Coach', kind: 'car', length: 4.4, bogie: 2.8, build: coach, passengers: 24 },
  dining: { name: 'Dining car', kind: 'car', length: 4.4, bogie: 2.8, build: diningCar, passengers: 12 },
  logs: { name: 'Log wagon', kind: 'car', length: 3.8, bogie: 2.2, build: logWagon, cargo: 'timber' },
  boxcar: { name: 'Box van', kind: 'car', length: 3.95, bogie: 2.3, build: boxcar, cargo: 'goods' },
  hopper: { name: 'Coal hopper', kind: 'car', length: 3.55, bogie: 2.0, build: hopper, cargo: 'coal' },
  tankcar: { name: 'Milk tanker', kind: 'car', length: 3.75, bogie: 2.2, build: tankCar, cargo: 'milk' },
  caboose: { name: 'Guard\'s van', kind: 'car', length: 3.15, bogie: 1.7, build: caboose },
};

export function buildVehicle(id, livery) {
  const spec = VEHICLES[id];
  const liv = LIVERIES.find((l) => l.id === livery) || LIVERIES[0];
  const v = spec.build(liv);
  v.spec = spec;
  v.id = id;
  return v;
}

export { lampMat };
