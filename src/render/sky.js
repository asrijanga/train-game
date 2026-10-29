import * as THREE from 'three';
import { windowMat, lampMat, glowMat, tailGlowMat } from './shared.js';

// Keyframed palette through a day (hour -> colours). Painted, not physical.
const KEYS = [
  { t: 0, zen: '#141c33', hor: '#2c3550', sun: '#9fb4ff', sunI: 0.5, sky: '#56669a', gnd: '#252b3c', hemiI: 0.75, night: 1, water: 0.3 },
  { t: 4.6, zen: '#18213a', hor: '#33395a', sun: '#9fb4ff', sunI: 0.5, sky: '#56669a', gnd: '#252b3c', hemiI: 0.75, night: 1, water: 0.3 },
  { t: 5.8, zen: '#5b6f9c', hor: '#f2a97e', sun: '#ffb08a', sunI: 1.0, sky: '#c9a7a4', gnd: '#4d4a52', hemiI: 0.8, night: 0.45, water: 0.7 },
  { t: 7.2, zen: '#7fb3dc', hor: '#f6dcb4', sun: '#ffe2b0', sunI: 1.9, sky: '#f4e6cf', gnd: '#6f7a62', hemiI: 1.1, night: 0, water: 0.95 },
  { t: 12, zen: '#5ea8e2', hor: '#e8f1ee', sun: '#fff4dc', sunI: 2.3, sky: '#fff6e0', gnd: '#6f8a6a', hemiI: 1.25, night: 0, water: 1 },
  { t: 16.5, zen: '#6aaede', hor: '#f1ead2', sun: '#ffe8bf', sunI: 2.1, sky: '#fbeed6', gnd: '#6f7d62', hemiI: 1.15, night: 0, water: 1 },
  { t: 18.2, zen: '#7d8fb8', hor: '#f6b57a', sun: '#ffb071', sunI: 1.6, sky: '#f3c9a0', gnd: '#5e5650', hemiI: 0.95, night: 0.1, water: 0.85 },
  { t: 19.4, zen: '#3f4a7a', hor: '#d9826b', sun: '#ff8a6a', sunI: 0.8, sky: '#9d7d92', gnd: '#3a3440', hemiI: 0.7, night: 0.6, water: 0.6 },
  { t: 20.6, zen: '#1b2440', hor: '#3a3d61', sun: '#9fb4ff', sunI: 0.5, sky: '#56669a', gnd: '#252b3c', hemiI: 0.75, night: 1, water: 0.3 },
  { t: 24, zen: '#141c33', hor: '#2c3550', sun: '#9fb4ff', sunI: 0.5, sky: '#56669a', gnd: '#252b3c', hemiI: 0.75, night: 1, water: 0.3 },
];
for (const k of KEYS) for (const p of ['zen', 'hor', 'sun', 'sky', 'gnd']) k[p] = new THREE.Color(k[p]);

const tmp = {};
const ca = new THREE.Color();

function sample(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = THREE.MathUtils.smoothstep(t, a.t, b.t);
  for (const p of ['zen', 'hor', 'sun', 'sky', 'gnd']) tmp[p] = (tmp[p] || new THREE.Color()).copy(a[p]).lerp(b[p], f);
  for (const p of ['sunI', 'hemiI', 'night', 'water']) tmp[p] = a[p] + (b[p] - a[p]) * f;
  return tmp;
}

export class Sky {
  constructor(game) {
    this.game = game;
    this.hour = 10;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
  }

  // dayMinutes: real minutes per in-game day
  advance(dt, dayMinutes = 24) {
    this.hour = (this.hour + (dt * 24) / (dayMinutes * 60)) % 24;
  }

  apply() {
    const g = this.game;
    const s = sample(this.hour);
    this.night = s.night;
    // sun arc; at night the moon takes over from the opposite side
    const a = ((this.hour - 6) / 12) * Math.PI;
    const up = Math.sin(a);
    if (up > -0.05) this.sunDir.set(Math.cos(a) * 0.85, Math.max(0.12, up), 0.42).normalize();
    else this.sunDir.set(-Math.cos(a) * 0.6, Math.max(0.25, -up * 0.8), -0.4).normalize();
    g.sunDir.copy(this.sunDir);
    g.sun.color.copy(s.sun);
    g.sun.intensity = s.sunI;
    g.hemi.color.copy(s.sky);
    g.hemi.groundColor.copy(s.gnd);
    g.hemi.intensity = s.hemiI;
    g.scene.fog.color.copy(ca.copy(s.hor).lerp(s.zen, 0.15));
    const pu = g.post?.uniforms;
    if (pu) {
      pu.uZenith.value.copy(s.zen);
      pu.uHorizon.value.copy(s.hor);
      pu.uSunDir.value.copy(this.sunDir);
      pu.uSunColor.value.copy(s.sun);
      pu.uNight.value = s.night;
      pu.uHatch.value = 1 - s.night * 0.6;
      pu.uInk.value.set(s.night > 0.5 ? '#151525' : '#2b2a33');
    }
    const wu = g.water?.uniforms;
    if (wu) {
      wu.uLight.value = s.water;
      wu.uSky.value.copy(s.hor);
    }
    const n = THREE.MathUtils.smoothstep(s.night, 0.15, 0.7);
    windowMat.emissiveIntensity = n * 1.3;
    lampMat.color.set(n > 0.05 ? '#ffd27a' : '#efe6c8').lerp(ca.set('#efe6c8'), 1 - n);
    glowMat.opacity = n * 0.95;
    tailGlowMat.opacity = n * 0.9;
    this.lightsOn = n;
  }
}
