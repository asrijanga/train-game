import { GeoBuilder, lc } from '../render/geo.js';
import { PALETTE } from '../render/materials.js';

// Station buildings in a local frame: x along the track, +z away from the track,
// y up from the track bed. The platform occupies z ∈ [PLAT_Z0, PLAT_Z1].
export const PLAT_Z0 = 0.62;
export const PLAT_Z1 = 2.2;
export const PLAT_H = 0.34;

export const STYLES = {
  country: { label: 'Country halt', length: 18 },
  village: { label: 'Town station', length: 20 },
  lakeside: { label: 'Lakeside pier', length: 18 },
  alpine: { label: 'Alpine lodge', length: 18 },
  forest: { label: 'Lumber halt', length: 18 },
  grand: { label: 'Grand terminal', length: 26 },
};
export const STYLE_ORDER = Object.keys(STYLES);

const C = (h) => lc(h);

function windowAt(g, x, y, z, w, h, frame, facing = -1) {
  // frame on the wall, glass inset slightly
  const t = 0.05 * facing;
  g.solid.abox(x - w / 2 - 0.06, y - h / 2 - 0.06, Math.min(z, z + t), x + w / 2 + 0.06, y + h / 2 + 0.06, Math.max(z, z + t), frame);
  g.glass.abox(x - w / 2, y - h / 2, Math.min(z + t, z + t * 1.6), x + w / 2, y + h / 2, Math.max(z + t, z + t * 1.6), frame);
  // sill
  g.solid.abox(x - w / 2 - 0.1, y - h / 2 - 0.1, Math.min(z, z + t * 2.5), x + w / 2 + 0.1, y - h / 2 - 0.04, Math.max(z, z + t * 2.5), frame);
  // mullion cross
  g.solid.abox(x - 0.025, y - h / 2, Math.min(z + t * 1.6, z + t * 2), x + 0.025, y + h / 2, Math.max(z + t * 1.6, z + t * 2), frame);
  g.solid.abox(x - w / 2, y - 0.025, Math.min(z + t * 1.6, z + t * 2), x + w / 2, y + 0.025, Math.max(z + t * 1.6, z + t * 2), frame);
}

function door(g, x, y0, z, w, h, color, frame, facing = -1) {
  const t = 0.06 * facing;
  g.solid.abox(x - w / 2 - 0.07, y0, Math.min(z, z + t), x + w / 2 + 0.07, y0 + h + 0.07, Math.max(z, z + t), frame);
  g.solid.abox(x - w / 2, y0, Math.min(z + t, z + t * 1.5), x + w / 2, y0 + h, Math.max(z + t, z + t * 1.5), color);
  g.solid.abox(x + w / 2 - 0.12, y0 + h * 0.45, Math.min(z + t * 1.5, z + t * 2.2), x + w / 2 - 0.06, y0 + h * 0.5, Math.max(z + t * 1.5, z + t * 2.2), C(PALETTE.brass));
}

function lampPost(g, x, z, h = 2.0, color = C('#2f3b36')) {
  g.solid.cyl(x, PLAT_H, z, 0.07, PLAT_H + 0.2, color, 6, 0.09);
  g.solid.cyl(x, PLAT_H + 0.2, z, 0.04, PLAT_H + h, color, 6, 0.04);
  g.solid.abox(x - 0.13, PLAT_H + h, z - 0.13, x + 0.13, PLAT_H + h + 0.04, z + 0.13, color);
  g.glass.abox(x - 0.1, PLAT_H + h + 0.04, z - 0.1, x + 0.1, PLAT_H + h + 0.3, z + 0.1, color);
  g.solid.hip(x - 0.13, x + 0.13, z - 0.13, z + 0.13, PLAT_H + h + 0.3, 0.14, color, 0.03);
  g.lamps.push([x, PLAT_H + h + 0.17, z]);
}

function bench(g, x, z, rot = 0) {
  const wood = C(PALETTE.woodLight), iron = C('#2f3b36');
  const y = PLAT_H;
  g.solid.abox(x - 0.55, y + 0.24, z - 0.14, x + 0.55, y + 0.29, z + 0.14, wood);
  g.solid.abox(x - 0.55, y + 0.32, z + 0.12, x + 0.55, y + 0.56, z + 0.17, wood);
  for (const sx of [-0.45, 0.45]) g.solid.abox(x + sx - 0.03, y, z - 0.12, x + sx + 0.03, y + 0.56, z + 0.15, iron);
}

function flowerTub(g, x, z, flower = '#d0485c') {
  g.solid.cyl(x, PLAT_H, z, 0.2, PLAT_H + 0.25, C(PALETTE.wood), 8, 0.24);
  g.solid.cyl(x, PLAT_H + 0.25, z, 0.22, PLAT_H + 0.42, C('#4f8a3a'), 7, 0.08);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    g.solid.abox(x + Math.cos(a) * 0.12 - 0.04, PLAT_H + 0.33, z + Math.sin(a) * 0.12 - 0.04, x + Math.cos(a) * 0.12 + 0.04, PLAT_H + 0.43, z + Math.sin(a) * 0.12 + 0.04, C(i % 2 ? flower : '#f2d04b'));
  }
}

function canopy(g, x0, x1, z0, z1, h, roof, post, valance) {
  const y = PLAT_H + h;
  // posts
  for (let x = x0 + 0.5; x <= x1 - 0.4; x += 2.2) {
    g.solid.cyl(x, PLAT_H, z0 + 0.35, 0.06, y, post, 6);
    g.solid.abox(x - 0.25, y - 0.3, z0 + 0.3, x + 0.25, y - 0.24, z0 + 0.4, post); // bracket
  }
  // sloping roof falling toward the track
  const A = (x, yy, z) => ({ x, y: yy, z });
  g.solid.quad(A(x1, y, z0), A(x0, y, z0), A(x0, y + 0.45, z1), A(x1, y + 0.45, z1), roof);
  g.solid.quad(A(x0, y - 0.06, z0), A(x1, y - 0.06, z0), A(x1, y + 0.39, z1), A(x0, y + 0.39, z1), C('#d9cfb6'));
  // valance: little wooden teeth along the edge
  for (let x = x0; x < x1; x += 0.22) {
    g.solid.abox(x, y - 0.22, z0 - 0.02, x + 0.15, y, z0 + 0.02, valance);
  }
}

function sign(g, x, z, h, board, post) {
  for (const sx of [-0.9, 0.9]) g.solid.cyl(x + sx, PLAT_H, z, 0.04, PLAT_H + h, post, 5);
  g.solid.abox(x - 1.05, PLAT_H + h - 0.05, z - 0.04, x + 1.05, PLAT_H + h + 0.42, z + 0.04, board);
  g.signs.push({ x, y: PLAT_H + h + 0.185, z, w: 1.9, h: 0.38 });
}

function chimney(g, x, z, y0, y1, col) {
  g.solid.abox(x - 0.2, y0, z - 0.2, x + 0.2, y1, z + 0.2, col);
  g.solid.abox(x - 0.25, y1, z - 0.25, x + 0.25, y1 + 0.1, z + 0.25, col);
  g.solid.cyl(x - 0.08, y1 + 0.1, z, 0.06, y1 + 0.3, C('#8b4a36'), 6);
  g.smoke.push([x, y1 + 0.35, z]);
}

function tiledRoofS(g, x0, x1, z0, z1, y, h, tile = '#4b5560', o = 0.4) {
  const dark = C(tile);
  g.solid.gable(x0, x1, z0, z1, y, h, dark, C('#3a3633'), o, 0.1);
  const zm = (z0 + z1) / 2;
  g.solid.abox(x0 - o - 0.05, y + h - 0.02, zm - 0.1, x1 + o + 0.05, y + h + 0.12, zm + 0.1, dark);
  for (const xe of [x0 - o - 0.05, x1 + o - 0.14]) g.solid.abox(xe, y + h + 0.08, zm - 0.13, xe + 0.19, y + h + 0.3, zm + 0.13, dark);
}

function country(g, L) {
  // a little wooden halt with a tiled roof, benches and tubs of flowers
  const wood = C('#6b4630'), plaster = C('#efe6d0'), dark = C('#3a2a20');
  const bz0 = 2.5, bz1 = 4.6, bx = 1.9, wh = 1.9;
  g.solid.abox(-bx - 0.1, 0, bz0 - 0.1, bx + 0.1, PLAT_H + 0.15, bz1 + 0.1, C(PALETTE.stoneDark));
  g.solid.abox(-bx, PLAT_H, bz0, bx, PLAT_H + wh, bz1, plaster);
  for (const sx of [-bx, -bx / 3, bx / 3, bx]) g.solid.abox(sx - 0.07, PLAT_H, bz0 - 0.07, sx + 0.07, PLAT_H + wh, bz0 + 0.02, wood);
  g.solid.abox(-bx, PLAT_H, bz0 - 0.05, bx, PLAT_H + 0.5, bz0, wood);
  g.solid.abox(-bx, PLAT_H + wh - 0.15, bz0 - 0.07, bx, PLAT_H + wh, bz0, wood);
  door(g, 0, PLAT_H, bz0, 0.8, 1.45, C('#8a6a45'), wood);
  for (const x of [-1.25, 1.25]) {
    windowAt(g, x, PLAT_H + 1.1, bz0, 0.6, 0.55, wood);
    for (let k = -2; k <= 2; k++) g.solid.abox(x + k * 0.1 - 0.012, PLAT_H + 0.85, bz0 - 0.08, x + k * 0.1 + 0.012, PLAT_H + 1.35, bz0 - 0.05, dark);
  }
  tiledRoofS(g, -bx, bx, bz0, bz1, PLAT_H + wh, 1.0);
  canopy(g, -bx - 1.5, bx + 1.5, PLAT_Z0 + 0.3, bz0, 2.05, C('#4b5560'), wood, wood);
  bench(g, -L / 2 + 3, 1.6);
  bench(g, L / 2 - 3.5, 1.6);
  for (const x of [-L / 2 + 1.2, -4.5, 4.5, L / 2 - 1.2]) lampPost(g, x, 1.85, 1.9, wood);
  flowerTub(g, -bx - 1.1, 1.75, '#e97ab0');
  flowerTub(g, bx + 1.1, 1.75, '#6f86e6');
  flowerTub(g, bx + 1.6, 1.95, '#f4c23a');
  sign(g, -L / 2 + 5.5, 2.05, 1.5, C(PALETTE.white), wood);
  for (let x = -L / 2 + 0.5; x <= L / 2 - 0.5; x += 0.2) {
    if (x > -bx - 0.3 && x < bx + 0.3) continue;
    g.solid.abox(x - 0.03, PLAT_H, PLAT_Z1 - 0.03, x + 0.03, PLAT_H + 0.6, PLAT_Z1 + 0.03, C('#b8b26a'));
  }
}

function picketFence(g, x0, x1, z, col, gap) {
  for (let x = x0; x <= x1; x += 0.35) {
    if (gap && x > gap[0] && x < gap[1]) continue;
    g.solid.abox(x - 0.035, PLAT_H, z - 0.03, x + 0.035, PLAT_H + 0.55, z + 0.03, col);
  }
  const segs = gap ? [[x0, gap[0]], [gap[1], x1]] : [[x0, x1]];
  for (const [a, b] of segs) if (b > a) g.solid.abox(a, PLAT_H + 0.38, z - 0.02, b, PLAT_H + 0.44, z + 0.04, col);
}

function village(g, L) {
  // an old timber town station: tiled roof, noren, red lanterns and a clock
  const wood = C('#5a3a26'), plaster = C('#f1ead9'), dark = C('#3a2a20'), tile = '#4b5560';
  const bz0 = 2.5, bz1 = 5.8;
  g.solid.abox(-4.6, 0, bz0 - 0.1, 4.6, PLAT_H + 0.2, bz1 + 0.1, C(PALETTE.stoneDark));
  g.solid.abox(-4.4, PLAT_H, bz0, 4.4, PLAT_H + 2.4, bz1, plaster);
  g.solid.abox(-4.4, PLAT_H, bz0 - 0.04, 4.4, PLAT_H + 0.8, bz0, wood);
  for (let x = -4.4; x <= 4.41; x += 1.1) g.solid.abox(x - 0.08, PLAT_H, bz0 - 0.08, x + 0.08, PLAT_H + 2.4, bz0 + 0.02, wood);
  g.solid.abox(-4.4, PLAT_H + 2.25, bz0 - 0.08, 4.4, PLAT_H + 2.4, bz0, wood);
  g.solid.abox(-1.4, PLAT_H, bz0 - 0.5, 1.4, PLAT_H + 3.2, bz0 + 0.6, plaster);
  for (const sx of [-1.4, 1.4]) g.solid.abox(sx - 0.1, PLAT_H, bz0 - 0.55, sx + 0.1, PLAT_H + 3.2, bz0 - 0.35, wood);
  door(g, 0, PLAT_H, bz0 - 0.5, 1.4, 1.8, dark, wood);
  for (const sx of [-0.45, 0, 0.45]) g.solid.abox(sx - 0.21, PLAT_H + 1.3, bz0 - 0.62, sx + 0.21, PLAT_H + 1.85, bz0 - 0.58, C('#2f4f7a'));
  g.solid.cyl(0, PLAT_H + 2.55, bz0 - 0.56, 0.36, PLAT_H + 2.55, plaster, 12);
  g.clocks.push([0, PLAT_H + 2.62, bz0 - 0.6, 0.32]);
  tiledRoofS(g, -1.5, 1.5, bz0 - 0.5, bz0 + 0.6, PLAT_H + 3.2, 0.9, tile, 0.35);
  for (const x of [-3.1, -2.2, 2.2, 3.1]) {
    windowAt(g, x, PLAT_H + 1.45, bz0, 0.6, 0.8, wood);
    for (let k = -2; k <= 2; k++) g.solid.abox(x + k * 0.1 - 0.012, PLAT_H + 1.1, bz0 - 0.09, x + k * 0.1 + 0.012, PLAT_H + 1.8, bz0 - 0.06, dark);
  }
  for (const x of [-3, 0, 3]) windowAt(g, x, PLAT_H + 1.45, bz1, 0.8, 0.8, wood, 1);
  tiledRoofS(g, -4.4, 4.4, bz0, bz1, PLAT_H + 2.4, 1.3, tile, 0.5);
  for (const sx of [-1.75, 1.75]) {
    g.solid.abox(sx - 0.02, PLAT_H + 1.75, bz0 - 0.62, sx + 0.02, PLAT_H + 2.1, bz0 - 0.58, dark);
    g.solid.cyl(sx, PLAT_H + 1.35, bz0 - 0.6, 0.18, PLAT_H + 1.78, C('#d94f3d'), 10, 0.18);
    g.lamps.push([sx, PLAT_H + 1.55, bz0 - 0.6]);
  }
  canopy(g, -L / 2 + 2, L / 2 - 2, PLAT_Z0 + 0.3, bz0 - 0.5, 2.3, C(tile), wood, wood);
  for (const x of [-L / 2 + 1.2, -6, 6, L / 2 - 1.2]) lampPost(g, x, 1.9, 1.9, wood);
  bench(g, -5.5, 1.75); bench(g, 5.5, 1.75);
  flowerTub(g, -2.3, 1.85, '#e97ab0'); flowerTub(g, 2.3, 1.85, '#f08a3a');
  sign(g, L / 2 - 4, 2.05, 1.6, C(PALETTE.white), wood);
}

function lakeside(g, L) {
  const wall = C('#f3f1ea'), trim = C('#2f5d8a'), roof = C('#3d6f9e'), wood = C(PALETTE.woodLight);
  const bz0 = 2.5, bz1 = 4.9, bx = 2.3;
  // stilted boardwalk under the building
  g.solid.abox(-bx - 1, PLAT_H - 0.1, bz0 - 0.3, bx + 1, PLAT_H, bz1 + 1.2, wood);
  for (let x = -bx - 0.8; x <= bx + 0.8; x += 1.2) for (const z of [bz0, bz1 + 1]) g.solid.cyl(x, -1.6, z, 0.1, PLAT_H - 0.1, C(PALETTE.wood), 6);
  g.solid.abox(-bx, PLAT_H, bz0, bx, PLAT_H + 2.3, bz1, wall);
  for (let y = PLAT_H + 0.3; y < PLAT_H + 2.3; y += 0.28) g.solid.abox(-bx - 0.02, y, bz0 - 0.02, bx + 0.02, y + 0.03, bz1 + 0.02, C('#d8dde0'));
  g.solid.gable(-bx, bx, bz0, bz1, PLAT_H + 2.3, 1.1, roof, wall, 0.3);
  door(g, 0, PLAT_H, bz0, 0.8, 1.6, trim, wall);
  for (const x of [-1.4, 1.4]) { windowAt(g, x, PLAT_H + 1.25, bz0, 0.7, 0.75, trim); windowAt(g, x, PLAT_H + 1.25, bz1, 0.7, 0.75, trim, 1); }
  // little lantern tower
  const tx = bx + 1.6, tz = (bz0 + bz1) / 2;
  g.solid.cyl(tx, PLAT_H, tz, 0.55, PLAT_H + 3.6, wall, 10, 0.42);
  for (let y = PLAT_H + 0.6; y < PLAT_H + 3.4; y += 0.9) g.solid.cyl(tx, y, tz, 0.53 - (y - PLAT_H) * 0.035, y + 0.3, C(PALETTE.red), 10, 0.52 - (y - PLAT_H + 0.3) * 0.035);
  g.glass.cyl(tx, PLAT_H + 3.6, tz, 0.32, PLAT_H + 4.1, trim, 8);
  g.lamps.push([tx, PLAT_H + 3.85, tz]);
  g.solid.cyl(tx, PLAT_H + 4.1, tz, 0.45, PLAT_H + 4.6, C(PALETTE.red), 8, 0.0);
  // life ring
  g.solid.cyl(-bx - 0.6, PLAT_H + 1.0, bz0 - 0.15, 0.25, PLAT_H + 1.08, C('#e7553f'), 10);
  canopy(g, -bx - 0.3, bx + 0.3, PLAT_Z0 + 0.3, bz0, 2.1, roof, trim, wall);
  for (const x of [-L / 2 + 1.2, -4.5, 4.5, L / 2 - 1.2]) lampPost(g, x, 1.85, 1.9, trim);
  bench(g, -5.5, 1.7);
  bench(g, 6, 1.7);
  // bunting rope posts
  for (const x of [-L / 2 + 0.6, L / 2 - 0.6]) g.solid.cyl(x, PLAT_H, PLAT_Z1 - 0.1, 0.06, PLAT_H + 0.8, wood, 6);
  g.solid.abox(-L / 2 + 0.6, PLAT_H + 0.62, PLAT_Z1 - 0.12, L / 2 - 0.6, PLAT_H + 0.66, PLAT_Z1 - 0.08, C('#e6dcc4'));
  sign(g, -L / 2 + 4.5, 2.05, 1.45, wall, trim);
}

function alpine(g, L) {
  const stone = C('#9c9488'), wood = C('#6b4228'), woodL = C('#a0673a'), roof = C('#4a3a33'), snow = C('#f5f7fb');
  const bz0 = 2.5, bz1 = 5.6, bx = 2.8;
  g.solid.abox(-bx, PLAT_H, bz0, bx, PLAT_H + 1.3, bz1, stone);
  g.solid.abox(-bx - 0.05, PLAT_H + 1.3, bz0 - 0.05, bx + 0.05, PLAT_H + 3.2, bz1 + 0.05, wood);
  for (let y = PLAT_H + 1.45; y < PLAT_H + 3.2; y += 0.25) g.solid.abox(-bx - 0.07, y, bz0 - 0.07, bx + 0.07, y + 0.04, bz1 + 0.07, woodL);
  // wide steep roof with snow ridge
  g.solid.gable(-bx, bx, bz0, bz1, PLAT_H + 3.2, 2.0, roof, wood, 0.7);
  g.solid.abox(-bx - 0.7, PLAT_H + 5.05, (bz0 + bz1) / 2 - 0.25, bx + 0.7, PLAT_H + 5.3, (bz0 + bz1) / 2 + 0.25, snow);
  // balcony with flower boxes
  g.solid.abox(-bx + 0.3, PLAT_H + 1.9, bz0 - 0.8, bx - 0.3, PLAT_H + 2.0, bz0, woodL);
  for (let x = -bx + 0.35; x <= bx - 0.3; x += 0.25) g.solid.abox(x - 0.03, PLAT_H + 2.0, bz0 - 0.8, x + 0.03, PLAT_H + 2.55, bz0 - 0.74, woodL);
  g.solid.abox(-bx + 0.3, PLAT_H + 2.5, bz0 - 0.82, bx - 0.3, PLAT_H + 2.6, bz0 - 0.72, woodL);
  for (let x = -bx + 0.6; x < bx - 0.4; x += 0.3) g.solid.abox(x - 0.07, PLAT_H + 2.6, bz0 - 0.82, x + 0.07, PLAT_H + 2.74, bz0 - 0.68, C(Math.round(x * 10) % 2 ? '#d33d4c' : '#f3c742'));
  door(g, 0, PLAT_H, bz0, 0.85, 1.25, wood, stone);
  for (const x of [-1.8, 1.8]) windowAt(g, x, PLAT_H + 0.75, bz0, 0.6, 0.55, wood);
  for (const x of [-1.6, 0, 1.6]) windowAt(g, x, PLAT_H + 2.5, bz0 - 0.02, 0.55, 0.65, C(PALETTE.white));
  chimney(g, -1.6, bz1 - 0.7, PLAT_H + 4.0, PLAT_H + 5.8, stone);
  // log pile and skis
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4 - i; k++) g.solid.abox(bx + 0.3, PLAT_H + i * 0.2, bz0 + 0.4 + k * 0.22 + i * 0.11, bx + 1.3, PLAT_H + i * 0.2 + 0.19, bz0 + 0.6 + k * 0.22 + i * 0.11, i % 2 ? woodL : C('#8a5a3b'));
  for (const x of [-bx - 0.3, -bx - 0.5]) g.solid.abox(x - 0.04, PLAT_H, bz0 + 0.5, x + 0.04, PLAT_H + 1.7, bz0 + 0.62, C('#c0392b'));
  canopy(g, -bx - 0.4, bx + 0.4, PLAT_Z0 + 0.3, bz0 - 0.8, 2.0, roof, wood, woodL);
  for (const x of [-L / 2 + 1.2, -5, 5, L / 2 - 1.2]) lampPost(g, x, 1.85, 1.8, wood);
  bench(g, -5.8, 1.7);
  sign(g, L / 2 - 4.5, 2.05, 1.4, woodL, wood);
}

function forest(g, L) {
  const log = C('#7a4f30'), logL = C('#9a6a42'), roof = C('#5d6b3a'), end = C('#d9b98a');
  const bz0 = 2.6, bz1 = 5.0, bx = 2.2;
  // log cabin: alternating logs
  for (let i = 0, y = PLAT_H; y < PLAT_H + 2.2; i++, y += 0.22) {
    g.solid.abox(-bx - 0.2, y, bz0, bx + 0.2, y + 0.2, bz0 + 0.22, i % 2 ? log : logL);
    g.solid.abox(-bx - 0.2, y, bz1 - 0.22, bx + 0.2, y + 0.2, bz1, i % 2 ? logL : log);
    g.solid.abox(-bx, y + 0.1, bz0 - 0.15, -bx + 0.22, y + 0.3, bz1 + 0.15, i % 2 ? log : logL);
    g.solid.abox(bx - 0.22, y + 0.1, bz0 - 0.15, bx, y + 0.3, bz1 + 0.15, i % 2 ? logL : log);
  }
  g.solid.abox(-bx + 0.1, PLAT_H, bz0 + 0.1, bx - 0.1, PLAT_H + 2.2, bz1 - 0.1, log);
  g.solid.gable(-bx - 0.2, bx + 0.2, bz0, bz1, PLAT_H + 2.3, 1.2, roof, log, 0.4);
  door(g, -0.6, PLAT_H, bz0, 0.8, 1.55, logL, log);
  windowAt(g, 1.1, PLAT_H + 1.25, bz0, 0.7, 0.65, C('#e2c79a'));
  chimney(g, bx - 0.6, (bz0 + bz1) / 2, PLAT_H + 2.6, PLAT_H + 3.8, C('#8e877c'));
  // timber stacks with light end grain
  for (const x0 of [-L / 2 + 1.5, L / 2 - 4.5]) {
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
      const y = PLAT_H + r * 0.3, z = 2.9 + k * 0.32 + r * 0.16;
      g.solid.abox(x0, y, z, x0 + 3, y + 0.28, z + 0.28, r % 2 ? log : logL);
      g.solid.abox(x0 - 0.02, y + 0.04, z + 0.04, x0, y + 0.24, z + 0.24, end);
      g.solid.abox(x0 + 3, y + 0.04, z + 0.04, x0 + 3.02, y + 0.24, z + 0.24, end);
    }
  }
  // sawhorse + axe
  g.solid.abox(bx + 1.0, PLAT_H + 0.5, 1.5, bx + 2.2, PLAT_H + 0.6, 1.62, logL);
  for (const x of [bx + 1.1, bx + 2.1]) g.solid.abox(x - 0.04, PLAT_H, 1.45, x + 0.04, PLAT_H + 0.6, 1.67, log);
  canopy(g, -bx - 0.3, bx + 0.3, PLAT_Z0 + 0.3, bz0, 2.0, roof, log, logL);
  for (const x of [-4.5, 4.5]) lampPost(g, x, 1.85, 1.8, log);
  bench(g, -bx - 1.4, 1.7);
  sign(g, L / 2 - 2, 2.05, 1.4, logL, log);
}

function grand(g, L) {
  // a red-brick terminus with white stone bands and green copper domes
  const brick = C('#a8503a'), band = C('#efe6d4'), dome = C('#5f8f7a'), iron = C('#3f4f4a'), trim = C(PALETTE.cream), slate = C('#4b5560');
  const bz0 = 2.6, bz1 = 7.2, bx = 7.5;
  g.solid.abox(-bx, PLAT_H, bz0, bx, PLAT_H + 4.0, bz1, brick);
  g.solid.abox(-bx - 0.1, PLAT_H, bz0 - 0.1, bx + 0.1, PLAT_H + 0.5, bz1 + 0.1, band);
  for (const y of [1.9, 3.2]) g.solid.abox(-bx - 0.05, PLAT_H + y, bz0 - 0.06, bx + 0.05, PLAT_H + y + 0.18, bz1 + 0.06, band);
  g.solid.abox(-bx - 0.15, PLAT_H + 3.9, bz0 - 0.15, bx + 0.15, PLAT_H + 4.15, bz1 + 0.15, band);
  for (let x = -bx + 0.9; x <= bx - 0.9; x += 1.25) {
    if (Math.abs(x) < 2.2) continue;
    windowAt(g, x, PLAT_H + 1.2, bz0, 0.6, 1.0, band);
    windowAt(g, x, PLAT_H + 2.65, bz0, 0.6, 0.8, band);
    windowAt(g, x, PLAT_H + 1.6, bz1, 0.6, 1.2, band, 1);
  }
  g.solid.hip(-bx, bx, bz0, bz1, PLAT_H + 4.15, 1.2, slate, 0.3);
  for (const [cx, r, h] of [[-bx + 1.3, 1.5, 5.4], [bx - 1.3, 1.5, 5.4], [0, 1.9, 6.2]]) {
    g.solid.abox(cx - r, PLAT_H, bz0 - 0.4, cx + r, PLAT_H + h, bz0 + 2.6, brick);
    g.solid.abox(cx - r - 0.05, PLAT_H + h - 0.25, bz0 - 0.45, cx + r + 0.05, PLAT_H + h, bz0 + 2.65, band);
    g.solid.cyl(cx, PLAT_H + h, bz0 + 1.1, r * 0.95, PLAT_H + h + 0.5, dome, 8, r * 0.95);
    g.solid.cyl(cx, PLAT_H + h + 0.5, bz0 + 1.1, r * 0.95, PLAT_H + h + 2.0, dome, 8, 0.12);
    g.solid.cyl(cx, PLAT_H + h + 2.0, bz0 + 1.1, 0.06, PLAT_H + h + 2.7, C(PALETTE.brass), 5, 0.02);
  }
  g.solid.cyl(0, PLAT_H + 4.9, bz0 - 0.42, 0.7, PLAT_H + 4.9, trim, 16);
  g.clocks.push([0, PLAT_H + 4.9, bz0 - 0.45, 0.62]);
  door(g, 0, PLAT_H, bz0 - 0.4, 1.6, 2.4, C('#5a3324'), band);
  for (const x of [-bx + 1, bx - 1]) chimney(g, x, (bz0 + bz1) / 2 + 0.8, PLAT_H + 4.5, PLAT_H + 5.8, brick);
  const h0 = PLAT_H + 3.2, span0 = -2.2, span1 = PLAT_Z1 + 0.2;
  for (let x = -L / 2 + 0.6; x <= L / 2 - 0.5; x += 3) {
    g.solid.cyl(x, PLAT_H - 0.3, span0, 0.1, h0, iron, 6);
    g.solid.cyl(x, PLAT_H, span1, 0.1, h0, iron, 6);
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      const z = (span0 + span1) / 2 - Math.cos(a) * (span1 - span0) / 2;
      const y = h0 + Math.sin(a) * 1.6;
      if (prev) g.solid.abox(x - 0.07, Math.min(prev[1], y) - 0.06, Math.min(prev[0], z), x + 0.07, Math.max(prev[1], y) + 0.06, Math.max(prev[0], z), iron);
      prev = [z, y];
    }
  }
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI, a1 = ((k + 1) / 8) * Math.PI;
    const z0 = (span0 + span1) / 2 - Math.cos(a0) * (span1 - span0) / 2, z1 = (span0 + span1) / 2 - Math.cos(a1) * (span1 - span0) / 2;
    const y0 = h0 + Math.sin(a0) * 1.6, y1 = h0 + Math.sin(a1) * 1.6;
    const A = (x, y, z) => ({ x, y, z });
    g.roofGlass.quad(A(-L / 2 + 0.6, y0, z0), A(L / 2 - 0.5, y0, z0), A(L / 2 - 0.5, y1, z1), A(-L / 2 + 0.6, y1, z1), C('#cfe3e8'));
  }
  for (const x of [-L / 2 + 2, -L / 2 + 8, L / 2 - 8, L / 2 - 2]) lampPost(g, x, 1.9, 2.0, iron);
  for (const x of [-5, 5]) bench(g, x, 1.75);
  for (const x of [-3, 3]) flowerTub(g, x, 1.9, '#e97ab0');
  sign(g, -L / 2 + 5, 2.05, 1.9, C(PALETTE.white), iron);
}

const BUILDERS = { country, village, lakeside, alpine, forest, grand };

export function buildStationGeometry(style, L) {
  const g = {
    solid: new GeoBuilder(),
    glass: new GeoBuilder(),
    roofGlass: new GeoBuilder(),
    lamps: [],
    signs: [],
    clocks: [],
    smoke: [],
  };
  (BUILDERS[style] || country)(g, L);
  return g;
}
