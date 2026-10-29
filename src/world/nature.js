import * as THREE from 'three';
import { Simplex } from '../core/noise.js';

// Shared wind: slowly wandering direction, gusts that roll across the land.
export const windUniforms = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 0.5 },
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
};

// Season weights (spring, summer, autumn, winter) blended smoothly.
export const seasonUniforms = {
  uSeasonW: { value: new THREE.Vector4(1, 0, 0, 0) },
};

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export class Nature {
  constructor(seed) {
    this.noise = new Simplex(seed * 13 + 101);
    this.t = 0;
    this.season = 0.3; // 0..4
    this.strength = 0.5;
    this.gust = 0;
    this.dirAngle = 0.3;
  }

  // dt in game seconds; dayMinutes = real minutes per game day (one season per day)
  update(dt, rdt, opts) {
    this.t += rdt;
    const n = this.noise;
    // calm base breeze + slow swells + occasional gusts
    const swell = 0.5 + 0.5 * n.noise(this.t * 0.03, 1.7);
    const gust = Math.max(0, n.noise(this.t * 0.18, 9.1)) * 1.4;
    this.gust = gust;
    this.strength = 0.25 + swell * 0.45 + gust * 0.5;
    this.dirAngle += n.noise(this.t * 0.01, 4.4) * rdt * 0.05;
    windUniforms.uWindTime.value += rdt * (0.7 + this.strength * 0.8);
    windUniforms.uWindStrength.value = this.strength;
    windUniforms.uWindDir.value.set(Math.cos(this.dirAngle), Math.sin(this.dirAngle));

    if (opts.seasonMode === 'cycle') this.season = (this.season + dt / (opts.dayMinutes * 60)) % 4;
    else this.season = { spring: 0.3, summer: 1.5, autumn: 2.5, winter: 3.5 }[opts.seasonMode] ?? this.season;
    const w = this.weights(this.season);
    seasonUniforms.uSeasonW.value.set(w[0], w[1], w[2], w[3]);
  }

  // plateau weights with short transitions between seasons
  weights(s) {
    const w = [0, 0, 0, 0];
    const i = Math.floor(s) % 4;
    const f = s - Math.floor(s);
    const tr = 0.18;
    if (f > 1 - tr) {
      const k = (f - (1 - tr)) / tr;
      const e = k * k * (3 - 2 * k);
      w[i] = 1 - e;
      w[(i + 1) % 4] = e;
    } else w[i] = 1;
    return w;
  }

  get seasonIndex() {
    return Math.floor(this.season) % 4;
  }

  windVec() {
    const d = windUniforms.uWindDir.value;
    return [d.x * this.strength * 1.2, d.y * this.strength * 1.2];
  }
}
