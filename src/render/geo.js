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
