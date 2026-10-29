import * as THREE from 'three';
import { toonGradient } from './materials.js';

// Materials whose look changes with time of day; updated by the sky system.
export const windowMat = new THREE.MeshToonMaterial({
  color: new THREE.Color('#8fb3c4'),
  gradientMap: toonGradient(),
  emissive: new THREE.Color('#ffc766'),
  emissiveIntensity: 0,
});

export const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#efe6c8') });

export const roofGlassMat = new THREE.MeshToonMaterial({
  color: new THREE.Color('#cfe3e8'),
  gradientMap: toonGradient(),
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Soft radial glow sprite texture for lamps and headlights.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.25, 'rgba(255,214,130,0.6)');
  grd.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export const glowMat = new THREE.SpriteMaterial({
  map: glowTexture(),
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

// Hand-lettered text on a paper banner, as a texture.
export function labelTexture(text, opts = {}) {
  const font = opts.font || '700 56px Caveat, "Patrick Hand", cursive';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  const h = opts.height || 84;
  c.width = w;
  c.height = h;
  g.font = font;
  if (opts.banner !== false) {
    g.fillStyle = opts.bg || 'rgba(246,239,220,0.94)';
    g.strokeStyle = '#2b2a33';
    g.lineWidth = 3;
    g.beginPath();
    const j = () => (Math.random() - 0.5) * 3;
    g.moveTo(8 + j(), 10 + j());
    g.lineTo(w - 8 + j(), 8 + j());
    g.lineTo(w - 12 + j(), h - 10 + j());
    g.lineTo(10 + j(), h - 8 + j());
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.fillStyle = opts.color || '#2b2a33';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, h };
}

export const tailGlowMat = new THREE.SpriteMaterial({
  map: glowTexture(),
  color: 0xff5a40,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
