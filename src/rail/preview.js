import * as THREE from 'three';

const MAX_PTS = 6000;

// Pencil-sketch ribbon showing the track being drawn, plus snap markers.
export class TrackPreview {
  constructor(terrain) {
    this.terrain = terrain;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PTS * 2 * 3);
    this.uv = new Float32Array(MAX_PTS * 2 * 2);
    const idx = new Uint32Array((MAX_PTS - 1) * 6);
    for (let i = 0; i < MAX_PTS - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uniforms = { uColor: { value: new THREE.Color('#2f4a7a') }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float across = abs(vUv.y - 0.5) * 2.0;
          // two pencil rails
          float rails = smoothstep(0.16, 0.0, abs(across - 0.55));
          // sleeper ticks
          float tick = step(fract(vUv.x * 1.6), 0.28) * step(across, 0.95);
          // wobbly pencil grain
          float grain = 0.75 + 0.25 * hash(floor(vUv.x * 9.0) + floor(vUv.y * 5.0) * 17.0);
          float a = max(rails, tick * 0.55) * grain;
          // marching highlight to feel alive
          a *= 0.8 + 0.2 * sin(vUv.x * 0.8 - uTime * 6.0);
          if (a < 0.03) discard;
          gl_FragColor = vec4(uColor, a * 0.9);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;

    this.marker = makeRing('#2f4a7a');
    this.marker.visible = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.marker);
  }

  show(plan) {
    if (!plan || plan.xz.length < 4) { this.hide(); return; }
    const xz = plan.xz;
    const n = Math.min(MAX_PTS, xz.length / 2);
    const W = 0.6;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const x = xz[i * 2], z = xz[i * 2 + 1];
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = xz[b * 2] - xz[a * 2], tz = xz[b * 2 + 1] - xz[a * 2 + 1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      if (i) dist += Math.hypot(x - xz[i * 2 - 2], z - xz[i * 2 - 1]);
      const y = this.terrain.groundAt(x, z) + 0.45;
      this.pos.set([x - tz * W, y, z + tx * W, x + tz * W, y, z - tx * W], i * 6);
      this.uv.set([dist, 0, dist, 1], i * 4);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
    this.uniforms.uColor.value.set(plan.valid ? '#2f4a7a' : '#c0392b');
    this.mesh.visible = true;
    if (plan.end) {
      this.marker.visible = true;
      this.marker.position.set(plan.end.pos.x, plan.end.pos.y + 0.5, plan.end.pos.z);
      this.marker.material.color.set(plan.valid ? '#2e7d4f' : '#c0392b');
    } else this.marker.visible = false;
  }

  hide() {
    this.mesh.visible = false;
    this.marker.visible = false;
  }

  update(t) {
    this.uniforms.uTime.value = t;
    this.marker.scale.setScalar(1 + 0.12 * Math.sin(t * 6));
  }
}

export function makeRing(color, r = 1.3) {
  const geo = new THREE.RingGeometry(r * 0.72, r, 32);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false }));
  m.renderOrder = 21;
  return m;
}
