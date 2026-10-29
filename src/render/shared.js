import * as THREE from 'three';
import { toonGradient } from './materials.js';

// Materials whose look changes with time of day; updated by the sky system.
export const windowMat = new THREE.MeshLambertMaterial({
  color: new THREE.Color('#8fb3c4'),
  emissive: new THREE.Color('#ffc766'),
  emissiveIntensity: 0,
});

export const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#efe6c8') });

export const roofGlassMat = new THREE.MeshLambertMaterial({
  color: new THREE.Color('#cfe3e8'),
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
  const font = opts.font || '600 46px -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", sans-serif';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  const h = opts.height || 84;
  c.width = w;
  c.height = h;
  g.font = font;
  if (opts.banner !== false) {
    // a soft frosted pill, like the garden game's labels
    const r = h / 2 - 6;
    g.fillStyle = opts.bg || 'rgba(255, 246, 230, 0.82)';
    g.shadowColor = 'rgba(60, 40, 18, 0.28)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
    g.beginPath();
    g.moveTo(6 + r, 6);
    g.lineTo(w - 6 - r, 6);
    g.arc(w - 6 - r, h / 2, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(6 + r, h - 6);
    g.arc(6 + r, h / 2, r, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(255, 250, 240, 0.9)';
    g.lineWidth = 2;
    g.stroke();
  }
  g.fillStyle = opts.color || '#4a3423';
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

// Many lantern glows in one draw call.
export const glowPointsMat = new THREE.PointsMaterial({
  map: glowTexture(),
  size: 2.2,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  color: 0xffffff,
});

export function glowPoints(positions, size = 2.2) {
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(g, glowPointsMat);
  pts.frustumCulled = false;
  return pts;
}
