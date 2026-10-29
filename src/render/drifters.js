import * as THREE from 'three';

const MAX = 500;

// Little things drifting on the wind near the camera: sakura petals in spring,
// fireflies on summer nights, maple leaves in autumn, snowflakes in winter.
export class Drifters {
  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.off = new Float32Array(MAX * 3);
    this.par = new Float32Array(MAX * 4); // size, rot, kind, alpha
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(this.off, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(this.par, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.geo = geo;
    this.uniforms = { uLight: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aOff; attribute vec4 aPar;
        varying vec2 vUv; varying float vKind; varying float vA;
        void main() {
          vUv = uv; vKind = aPar.z; vA = aPar.w;
          float c = cos(aPar.y), s = sin(aPar.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aPar.x;
          vec4 mv = modelViewMatrix * vec4(aOff, 1.0);
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying vec2 vUv; varying float vKind; varying float vA;
        void main() {
          vec2 p = vUv - 0.5;
          vec3 col; float a;
          if (vKind < 0.5) {            // petal: soft notched oval
            float d = length(p * vec2(1.0, 1.7));
            a = smoothstep(0.42, 0.34, d) * (1.0 - smoothstep(0.05, 0.0, abs(p.x)) * step(0.3, p.y));
            col = mix(vec3(1.0, 0.86, 0.92), vec3(0.96, 0.62, 0.74), d * 1.6);
            col *= uLight;
          } else if (vKind < 1.5) {     // leaf: pointed with a vein
            float d = abs(p.x) * 2.2 + abs(p.y) * 1.3;
            a = smoothstep(0.55, 0.47, d);
            col = mix(vec3(0.86, 0.22, 0.12), vec3(0.95, 0.62, 0.15), vUv.y);
            col = mix(col, col * 0.6, smoothstep(0.03, 0.0, abs(p.x)));
            col *= uLight;
          } else if (vKind < 2.5) {     // snowflake
            float d = length(p);
            a = smoothstep(0.42, 0.15, d);
            col = vec3(1.0) * max(uLight, 0.75);
          } else {                      // firefly glow
            float d = length(p);
            a = smoothstep(0.5, 0.0, d);
            col = vec3(1.0, 0.95, 0.55) * 1.6;
          }
          gl_FragColor = vec4(col, a * vA);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, kind: -1, ph: Math.random() * 6.28, s: 0.2, life: 0 });
  }

  update(dt, center, zoom, season, night, wind, terrain) {
    // which kind of drifter, and how many, for this moment
    let kind = -1, want = 0;
    if (season === 0) { kind = 0; want = 260; }
    else if (season === 1 && night > 0.5) { kind = 3; want = 140; }
    else if (season === 2) { kind = 1; want = 200; }
    else if (season === 3) { kind = 2; want = 500; }
    const active = zoom < 170 ? want : 0;
    const R = Math.min(70, 20 + zoom * 0.45);
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const q = this.p[i];
      const dead = q.kind !== kind || Math.abs(q.x - center.x) > R || Math.abs(q.z - center.z) > R || q.y < q.floor || q.life <= 0;
      if (dead) {
        if (i >= active) { q.kind = -1; continue; }
        q.kind = kind;
        q.x = center.x + (Math.random() * 2 - 1) * R;
        q.z = center.z + (Math.random() * 2 - 1) * R;
        const g = terrain.groundAt(q.x, q.z);
        q.floor = g - 0.2;
        q.y = kind === 3 ? g + 0.5 + Math.random() * 3 : g + 4 + Math.random() * 18;
        q.s = kind === 2 ? 0.08 + Math.random() * 0.1 : kind === 3 ? 0.35 : 0.13 + Math.random() * 0.08;
        q.spin = (Math.random() - 0.5) * 4;
        q.life = 20 + Math.random() * 20;
        q.vx = 0; q.vz = 0;
      }
      q.life -= dt;
      q.ph += dt;
      const fall = kind === 2 ? 0.9 : kind === 3 ? 0 : 0.55;
      const flutter = Math.sin(q.ph * 2.3) * (kind === 3 ? 0.4 : 0.6);
      q.vx += (wind[0] * 1.6 + flutter - q.vx) * dt;
      q.vz += (wind[1] * 1.6 + Math.cos(q.ph * 1.7) * 0.4 - q.vz) * dt;
      q.x += q.vx * dt;
      q.z += q.vz * dt;
      q.y += (kind === 3 ? Math.sin(q.ph * 0.9) * 0.3 : -fall * (0.7 + 0.3 * Math.sin(q.ph * 3.1))) * dt;
      q.rot += q.spin * dt;
      this.off[n * 3] = q.x; this.off[n * 3 + 1] = q.y; this.off[n * 3 + 2] = q.z;
      this.par[n * 4] = q.s;
      this.par[n * 4 + 1] = q.rot;
      this.par[n * 4 + 2] = kind;
      this.par[n * 4 + 3] = kind === 3 ? 0.5 + 0.5 * Math.sin(q.ph * 3 + i) : Math.min(1, q.life);
      n++;
    }
    this.geo.instanceCount = n;
    if (n) {
      this.geo.attributes.aOff.needsUpdate = true;
      this.geo.attributes.aPar.needsUpdate = true;
    }
    this.uniforms.uLight.value = 1 - night * 0.55;
  }
}
