import * as THREE from 'three';

// Shared toon gradient: a few soft bands give the flat, painted look.
let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const steps = new Uint8Array([70, 70, 150, 150, 215, 215, 255, 255]);
  gradient = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map();

// Cached toon material by colour (+ options). Most props share these.
export function toon(color, opts = {}) {
  const key = `${color}|${opts.vertexColors ? 1 : 0}|${opts.emissive ?? ''}|${opts.side ?? ''}|${opts.transparent ? opts.opacity : ''}|${opts.flat ? 1 : 0}`;
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color),
    vertexColors: !!opts.vertexColors,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity;
    m.depthWrite = false;
  }
  cache.set(key, m);
  return m;
}

export const PALETTE = {
  ink: '#2b2a33',
  paper: '#f4ecd8',
  paperDark: '#e6d9b9',
  rail: '#6d6a68',
  railTop: '#c9c6bf',
  sleeper: '#6b4a32',
  ballast: '#a39a8c',
  stone: '#b9ab94',
  stoneDark: '#8f8270',
  brick: '#b5553c',
  roofRed: '#a8433a',
  roofSlate: '#5c6470',
  wood: '#8a5a3b',
  woodLight: '#c08a57',
  white: '#f7f3ea',
  cream: '#efe2c0',
  green: '#2f6b4f',
  brass: '#d0a443',
  black: '#2d2c30',
  steel: '#4a4d55',
  red: '#b8322a',
  blue: '#2f5d8a',
  glass: '#9cc3d5',
  glassNight: '#ffd27a',
};
