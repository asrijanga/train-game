import * as THREE from 'three';
import { WORLD_SIZE, HALF, VN, WATER } from './terrain.js';

// Opaque, painterly water: depth-tinted, with hand-drawn ripple contours and
// shoreline foam. Depth comes from the terrain's encoded depth texture.
export function createWater(terrain) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDepth: { value: null },
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#7fc6c0') },
      uDeep: { value: new THREE.Color('#2f6f93') },
      uFoam: { value: new THREE.Color('#fbf8ee') },
      uLight: { value: 1 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      uSky: { value: new THREE.Color('#ffffff') },
    },
  ]);
  uniforms.uDepth.value = terrain.depthTex;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDepth;
      uniform float uTime;
      uniform vec3 uShallow, uDeep, uFoam, uSky;
      uniform float uLight;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      void main() {
        vec2 uv = (vWorld.xz + ${HALF.toFixed(1)}) / ${WORLD_SIZE.toFixed(1)};
        uv = uv * ${((VN - 1) / VN).toFixed(6)} + ${(0.5 / VN).toFixed(6)};
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec4 dt = texture2D(uDepth, clamp(uv, 0.0, 1.0));
        float depth = mix(1.0, dt.r, inside);

        float n = vnoise(vWorld.xz * 0.15 + uTime * 0.05) * 0.6 + vnoise(vWorld.xz * 0.6 - uTime * 0.08) * 0.4;
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.55, depth + (n - 0.5) * 0.08));

        // painted brush variation
        col *= 0.95 + 0.1 * vnoise(vec2(vWorld.x * 0.05 + vWorld.z * 0.01, vWorld.z * 0.25));

        // hand-drawn ripple contours that hug the shore and drift outward
        float d = depth * 8.0;
        float ring = fract(d * 1.4 - uTime * 0.12 + n * 0.35);
        float ringLine = smoothstep(0.08, 0.0, abs(ring - 0.5) - 0.02) * smoothstep(2.6, 0.2, d);
        float broken = step(0.45, vnoise(vWorld.xz * 0.9 + vec2(uTime * 0.1, 0.0)));
        col = mix(col, uFoam, ringLine * broken * 0.55);

        // little wave dashes on open water
        vec2 q = vWorld.xz * vec2(0.35, 1.2) + vec2(uTime * 0.25, 0.0);
        float dash = step(0.93, vnoise(q)) * smoothstep(0.15, 0.5, depth);
        col = mix(col, mix(uFoam, uShallow, 0.3), dash * 0.6);

        // shoreline foam
        float foam = smoothstep(0.06, 0.015, depth + (n - 0.5) * 0.03);
        col = mix(col, uFoam, foam);

        col *= uLight;
        col = mix(col, uSky, 0.08);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 6, WORLD_SIZE * 6, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER;
  mesh.receiveShadow = false;
  mesh.name = 'water';
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}
