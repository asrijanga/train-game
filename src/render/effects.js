import * as THREE from 'three';

const MAX = 1600;

// Billboarded, hand-drawn smoke puffs: lumpy soft blobs with an ink rim.
export class Effects {
  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.offset = new Float32Array(MAX * 3);
    this.params = new Float32Array(MAX * 4); // size, alpha, seed, shade
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(this.offset, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(this.params, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.uniforms = { uLight: { value: 1 }, uInk: { value: new THREE.Color('#2b2a33') } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec4 aParams;
        varying vec2 vUv;
        varying vec4 vP;
        void main() {
          vUv = uv;
          vP = aParams;
          vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
          mv.xy += position.xy * aParams.x;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        uniform vec3 uInk;
        varying vec2 vUv;
        varying vec4 vP;
        void main() {
          vec2 p = vUv - 0.5;
          float a = atan(p.y, p.x);
          float seed = vP.z * 6.2831;
          float r = 0.36 + 0.05 * sin(a * 3.0 + seed) + 0.035 * sin(a * 5.0 - seed * 1.7) + 0.02 * sin(a * 9.0 + seed * 3.1);
          float d = length(p);
          if (d > r + 0.03) discard;
          float body = smoothstep(r, r - 0.05, d);
          float rim = smoothstep(0.035, 0.0, abs(d - r + 0.012));
          // a little inner swirl stroke
          float swirl = smoothstep(0.02, 0.0, abs(length(p - vec2(0.06, 0.05)) - r * 0.45)) * step(0.0, sin(a * 1.0 + seed)) * 0.6;
          vec3 base = mix(vec3(0.97, 0.96, 0.93), vec3(0.62, 0.6, 0.6), vP.w);
          vec3 shade = base * (0.82 + 0.18 * smoothstep(0.3, -0.3, p.y - p.x * 0.3));
          vec3 col = mix(shade, uInk, max(rim * 0.85, swirl * 0.5));
          float alpha = max(body, rim) * vP.y;
          gl_FragColor = vec4(col * uLight, alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.geo = geo;
    this.p = [];
  }

  spawn(x, y, z, vx, vy, vz, size, life, grow = 1.6, shade = 0) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, s0: size, grow, age: 0, life, seed: Math.random(), shade });
  }

  puff(pos, size = 1.5, n = 18) {
    if (!pos) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * size;
      this.spawn(pos.x + Math.cos(a) * r, pos.y + 0.6 + Math.random() * 1.2, pos.z + Math.sin(a) * r,
        Math.cos(a) * 0.8, 0.6 + Math.random() * 0.8, Math.sin(a) * 0.8, 0.9 + Math.random() * 0.8, 1.6 + Math.random(), 1.4);
    }
  }

  update(dt, wind = [0.5, 0.2]) {
    const ps = this.p;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const q = ps[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vx += (wind[0] - q.vx) * dt * 0.6;
      q.vz += (wind[1] - q.vz) * dt * 0.6;
      q.vy *= 1 - dt * 0.5;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      ps[w++] = q;
    }
    ps.length = w;
    const n = Math.min(w, MAX);
    for (let i = 0; i < n; i++) {
      const q = ps[i];
      const t = q.age / q.life;
      this.offset[i * 3] = q.x; this.offset[i * 3 + 1] = q.y; this.offset[i * 3 + 2] = q.z;
      this.params[i * 4] = q.s0 * (1 + t * q.grow);
      this.params[i * 4 + 1] = Math.min(1, q.age * 6) * (1 - t * t);
      this.params[i * 4 + 2] = q.seed;
      this.params[i * 4 + 3] = q.shade;
    }
    this.geo.instanceCount = n;
    this.geo.attributes.aOffset.needsUpdate = true;
    this.geo.attributes.aParams.needsUpdate = true;
  }
}
