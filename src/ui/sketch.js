// Hand-drawn SVG helpers for the UI: wobbly rectangles and ink icons.
import { mulberry32 } from '../core/rng.js';

export function sketchBg(fill = '#f4ecd8', stroke = '#2b2a33', seed = 1, opts = {}) {
  const r = mulberry32(seed * 977 + 13);
  const j = (a) => (r() - 0.5) * a;
  const inset = opts.inset ?? 3;
  const w = 100, h = 100;
  const p = (x, y) => `${(x + j(1.6)).toFixed(1)} ${(y + j(1.6)).toFixed(1)}`;
  const line = () => {
    const a = inset, b = w - inset, c = inset, d = h - inset;
    return `M${p(a, c)} C${p(w * 0.3, c + j(2))} ${p(w * 0.7, c + j(2))} ${p(b, c)} ` +
      `C${p(b + j(2), h * 0.3)} ${p(b + j(2), h * 0.7)} ${p(b, d)} ` +
      `C${p(w * 0.7, d + j(2))} ${p(w * 0.3, d + j(2))} ${p(a, d)} ` +
      `C${p(a + j(2), h * 0.7)} ${p(a + j(2), h * 0.3)} ${p(a + 0.5, c + 0.8)}`;
  };
  const sw = opts.strokeWidth ?? 2.2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
    `<path d='${line()}' fill='${fill}' stroke='none'/>` +
    `<path d='${line()}' fill='none' stroke='${stroke}' stroke-width='${sw}' stroke-linecap='round' vector-effect='non-scaling-stroke'/>` +
    `<path d='${line()}' fill='none' stroke='${stroke}' stroke-opacity='0.45' stroke-width='${sw * 0.6}' stroke-linecap='round' vector-effect='non-scaling-stroke'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const S = (inner, vb = '0 0 48 48') =>
  `<svg viewBox='${vb}' fill='none' stroke='currentColor' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`;

export const ICONS = {
  explore: S(`<path d='M17 27V12.5a2.5 2.5 0 015 0V24'/><path d='M22 23V9.5a2.5 2.5 0 015 0V23'/><path d='M27 23V11.5a2.5 2.5 0 015 0V25'/><path d='M32 24v-6.5a2.5 2.5 0 015 0V29c0 8-5 13-12 13s-10-3-13-8l-4.5-7.5a2.6 2.6 0 014.3-2.8L17 28'/>`),
  track: S(`<path d='M8 40c6-10 12-16 22-22 4-2.5 7-4 10-5'/><path d='M14 44c6-10 12-16 22-22 4-2.5 7-4 10-5' opacity='.0'/><path d='M12 38l-4-3M17 31l-4-3.5M22 25.5l-3.5-4M28 21l-3-4.5M34 17l-2-5'/><path d='M8 40c6-10 12-16 22-22'/><path d='M14 43c6-10 13-17 23-22.5 3-1.7 6-3 9-4'/>`),
  station: S(`<path d='M6 40h36'/><path d='M10 40V22l14-11 14 11v18'/><path d='M7 24l17-14 17 14'/><path d='M20 40v-9h8v9'/><path d='M14 26h5v4h-5zM29 26h5v4h-5z'/><path d='M31 9v6'/>`),
  train: S(`<path d='M6 34h36'/><path d='M8 32V20h14v-6h8v6h8a4 4 0 014 4v8z'/><path d='M30 20V10h5v10'/><circle cx='14' cy='35' r='4'/><circle cx='26' cy='35' r='4'/><circle cx='36' cy='35' r='3'/><path d='M11 24h7v5h-7z'/>`),
  remove: S(`<path d='M15 38l-7-7a3 3 0 010-4.2L26 9a3 3 0 014.2 0l9.8 9.8a3 3 0 010 4.2L25 38z'/><path d='M18 17l13 13'/><path d='M15 38h26'/>`),
  undo: S(`<path d='M14 20h16a10 10 0 010 20H20'/><path d='M20 12l-8 8 8 8'/>`),
  play: S(`<path d='M16 11l22 13-22 13z'/>`),
  pause: S(`<path d='M17 11v26M31 11v26'/>`),
  fast: S(`<path d='M8 12l16 12-16 12zM24 12l16 12-16 12z'/>`),
  sun: S(`<circle cx='24' cy='24' r='8'/><path d='M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5L37 37M11 37l3.5-3.5M33.5 14.5L37 11'/>`),
  moon: S(`<path d='M33 33A15 15 0 0119 9a15 15 0 1014 24z'/>`),
  gear: S(`<circle cx='24' cy='24' r='6'/><path d='M24 6v6M24 36v6M6 24h6M36 24h6M11.5 11.5l4 4M32.5 32.5l4 4M11.5 36.5l4-4M32.5 15.5l4-4'/>`),
  camera: S(`<path d='M6 16h8l3-5h14l3 5h8v22H6z'/><circle cx='24' cy='26' r='7'/>`),
  music: S(`<path d='M18 36V12l20-4v24'/><circle cx='14' cy='36' r='4'/><circle cx='34' cy='32' r='4'/>`),
  mute: S(`<path d='M8 19h7l9-8v26l-9-8H8z'/><path d='M31 18l10 12M41 18L31 30'/>`),
  close: S(`<path d='M12 12l24 24M36 12L12 36'/>`),
  check: S(`<path d='M9 25l9 9 21-21'/>`),
  plus: S(`<path d='M24 10v28M10 24h28'/>`),
  minus: S(`<path d='M10 24h28'/>`),
  eye: S(`<path d='M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z'/><circle cx='24' cy='24' r='5'/>`),
  follow: S(`<circle cx='24' cy='24' r='14'/><circle cx='24' cy='24' r='4'/><path d='M24 4v8M24 36v8M4 24h8M36 24h8'/>`),
  cycle: S(`<path d='M38 20a14 14 0 00-26-4'/><path d='M10 28a14 14 0 0026 4'/><path d='M12 8v8h8M36 40v-8h-8'/>`),
  map: S(`<path d='M6 12l11-4 14 4 11-4v28l-11 4-14-4-11 4z'/><path d='M17 8v28M31 12v28'/>`),
  compass: S(`<circle cx='24' cy='24' r='17'/><path d='M24 11l5 13h-10z' fill='currentColor'/><path d='M24 37l-5-13h10z'/>`),
};
