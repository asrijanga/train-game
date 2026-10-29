import * as THREE from 'three';

// Tiny immediate-mode geometry builder with per-vertex colours. Used for track,
// bridges and other procedural meshes that are merged into one draw call.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }

  vert(x, y, z, nx, ny, nz, c) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    return this.n++;
  }

  // Quad a,b,c,d (counter-clockwise when seen from the front) with flat normal.
  quad(a, b, c, d, color) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = this.vert(a.x, a.y, a.z, nx, ny, nz, color);
    this.vert(b.x, b.y, b.z, nx, ny, nz, color);
    this.vert(c.x, c.y, c.z, nx, ny, nz, color);
    this.vert(d.x, d.y, d.z, nx, ny, nz, color);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // Oriented box: centre c, unit axes ax (right), ay (up), az (forward), half sizes.
  box(c, ax, ay, az, hx, hy, hz, color, skipBottom = true) {
    const P = (sx, sy, sz) => ({
      x: c.x + ax.x * sx * hx + ay.x * sy * hy + az.x * sz * hz,
      y: c.y + ax.y * sx * hx + ay.y * sy * hy + az.y * sz * hz,
      z: c.z + ax.z * sx * hx + ay.z * sy * hy + az.z * sz * hz,
    });
    const p000 = P(-1, -1, -1), p100 = P(1, -1, -1), p010 = P(-1, 1, -1), p110 = P(1, 1, -1);
    const p001 = P(-1, -1, 1), p101 = P(1, -1, 1), p011 = P(-1, 1, 1), p111 = P(1, 1, 1);
    this.quad(p010, p011, p111, p110, color); // top
    this.quad(p001, p101, p111, p011, color); // front (+z)
    this.quad(p100, p000, p010, p110, color); // back (-z)
    this.quad(p101, p100, p110, p111, color); // right (+x)
    this.quad(p000, p001, p011, p010, color); // left (-x)
    if (!skipBottom) this.quad(p000, p100, p101, p001, color);
  }

  tri(a, b, c, color) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = this.vert(a.x, a.y, a.z, nx, ny, nz, color);
    this.vert(b.x, b.y, b.z, nx, ny, nz, color);
    this.vert(c.x, c.y, c.z, nx, ny, nz, color);
    this.idx.push(i, i + 1, i + 2);
  }

  // Axis-aligned box from min to max corner.
  abox(x0, y0, z0, x1, y1, z1, color, bottom = false) {
    this.box({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, X, Y, Z, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, color, !bottom);
  }

  // Gabled roof over [x0,x1]×[z0,z1] starting at height y with ridge height h.
  // Ridge runs along x. Overhang o on all sides.
  gable(x0, x1, z0, z1, y, h, color, gableColor, o = 0.25, thick = 0.08) {
    const zm = (z0 + z1) / 2;
    const A = (x, yy, z) => ({ x, y: yy, z });
    const xa = x0 - o, xb = x1 + o, za = z0 - o, zb = z1 + o;
    const drop = (h * o) / ((z1 - z0) / 2);
    // slopes (top)
    this.quad(A(xa, y - drop, zb), A(xb, y - drop, zb), A(xb, y + h, zm), A(xa, y + h, zm), color);
    this.quad(A(xb, y - drop, za), A(xa, y - drop, za), A(xa, y + h, zm), A(xb, y + h, zm), color);
    // undersides
    this.quad(A(xa, y - drop - thick, zb), A(xa, y + h - thick, zm), A(xb, y + h - thick, zm), A(xb, y - drop - thick, zb), gableColor);
    this.quad(A(xb, y - drop - thick, za), A(xb, y + h - thick, zm), A(xa, y + h - thick, zm), A(xa, y - drop - thick, za), gableColor);
    // eave edges
    this.quad(A(xa, y - drop - thick, zb), A(xb, y - drop - thick, zb), A(xb, y - drop, zb), A(xa, y - drop, zb), gableColor);
    this.quad(A(xb, y - drop - thick, za), A(xa, y - drop - thick, za), A(xa, y - drop, za), A(xb, y - drop, za), gableColor);
    // gable triangles (walls)
    this.tri(A(x1, y, z1), A(x1, y, z0), A(x1, y + h * ((z1 - z0) / 2) / ((z1 - z0) / 2), zm), gableColor);
    this.tri(A(x0, y, z0), A(x0, y, z1), A(x0, y + h, zm), gableColor);
  }

  // Hipped/pyramid roof.
  hip(x0, x1, z0, z1, y, h, color, o = 0.25) {
    const A = (x, yy, z) => ({ x, y: yy, z });
    const xa = x0 - o, xb = x1 + o, za = z0 - o, zb = z1 + o;
    const inset = Math.min(x1 - x0, z1 - z0) / 2;
    const xm0 = (x0 + x1) / 2 - Math.max(0, (x1 - x0) / 2 - inset), xm1 = (x0 + x1) / 2 + Math.max(0, (x1 - x0) / 2 - inset);
    const zm0 = (z0 + z1) / 2 - Math.max(0, (z1 - z0) / 2 - inset), zm1 = (z0 + z1) / 2 + Math.max(0, (z1 - z0) / 2 - inset);
    const top = y + h;
    this.quad(A(xa, y, zb), A(xb, y, zb), A(xm1, top, zm1), A(xm0, top, zm1), color);
    this.quad(A(xb, y, za), A(xa, y, za), A(xm0, top, zm0), A(xm1, top, zm0), color);
    this.quad(A(xb, y, zb), A(xb, y, za), A(xm1, top, zm0), A(xm1, top, zm1), color);
    this.quad(A(xa, y, za), A(xa, y, zb), A(xm0, top, zm1), A(xm0, top, zm0), color);
  }

  // Vertical cylinder approximated with n sides.
  cyl(x, y0, z, r, y1, color, n = 8, r1 = r) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const A = { x: x + Math.cos(a0) * r, y: y0, z: z + Math.sin(a0) * r };
      const B = { x: x + Math.cos(a1) * r, y: y0, z: z + Math.sin(a1) * r };
      const C = { x: x + Math.cos(a1) * r1, y: y1, z: z + Math.sin(a1) * r1 };
      const D = { x: x + Math.cos(a0) * r1, y: y1, z: z + Math.sin(a0) * r1 };
      this.quad(B, A, D, C, color);
      if (r1 > 0.001) this.tri({ x, y: y1, z }, C, D, color);
    }
  }

  // Merge another builder's buffers into this one, transformed by matrix m.
  append(other, m) {
    const v = new THREE.Vector3(), nrm = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.n;
    for (let i = 0; i < other.n; i++) {
      v.fromArray(other.pos, i * 3).applyMatrix4(m);
      nrm.fromArray(other.nor, i * 3).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(nrm.x, nrm.y, nrm.z);
      this.col.push(other.col[i * 3], other.col[i * 3 + 1], other.col[i * 3 + 2]);
    }
    for (const k of other.idx) this.idx.push(k + base);
    this.n += other.n;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

// Linear colour from an sRGB hex, cached.
const colCache = new Map();
export function lc(hex) {
  let c = colCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colCache.set(hex, c);
  }
  return c;
}
