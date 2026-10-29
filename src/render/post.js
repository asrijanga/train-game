import * as THREE from 'three';

// A soft, painterly pipeline in the style of the garden game: the scene renders once into a
// half-float target, a gentle bloom is built at quarter resolution and below, and one final pass
// paints the sky, adds bloom, tone maps (Khronos Neutral), applies a warm storybook grade,
// a touch of sharpening and a soft vignette.

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightFrag = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
  varying vec2 vUv;
  vec3 bright(vec2 uv) {
    vec3 c = texture2D(tSrc, uv).rgb;
    float l = max(c.r, max(c.g, c.b));
    return c * smoothstep(uThreshold, uThreshold + 0.25, l);
  }
  void main() {
    vec2 o = uTexel;
    vec3 c = bright(vUv + vec2(-o.x, -o.y)) + bright(vUv + vec2(o.x, -o.y)) + bright(vUv + vec2(-o.x, o.y)) + bright(vUv + vec2(o.x, o.y));
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;

const downFrag = /* glsl */ `
  uniform sampler2D tSrc; uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 o = uTexel;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
    gl_FragColor = vec4(c / 8.0, 1.0);
  }
`;

const upFrag = /* glsl */ `
  uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 o = uTexel;
    vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
    c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
  }
`;

const finalFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene, tDepth, tBloom;
  uniform float uBloom, uSaturation, uVignette, uAspect, uSharpen, uNight, uTime;
  uniform vec3 uLift, uGain, uZenith, uHorizon, uSunDir, uSunColor;
  uniform vec2 uTexel;
  uniform mat4 uProjInv, uViewInv;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  vec3 neutral(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }

  // Soft sky: a warm horizon glow rising to clear blue, with wispy high cloud.
  vec3 sky(vec3 dir) {
    float h = clamp(dir.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.6, h));
    vec2 cp = dir.xz / max(0.1, dir.y + 0.12) * 0.8 + vec2(uTime * 0.004, 0.0);
    float cl = vnoise(cp * 1.3) * 0.6 + vnoise(cp * 3.2) * 0.3 + vnoise(cp * 7.0) * 0.1;
    float cloud = smoothstep(0.58, 0.82, cl) * smoothstep(0.0, 0.3, dir.y) * (1.0 - uNight * 0.7);
    col = mix(col, mix(vec3(1.0, 0.98, 0.95), uHorizon, 0.25), cloud * 0.55);
    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 300.0) * 2.5 + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.08) * (1.0 - uNight * 0.85);
    if (uNight > 0.01) {
      vec2 sp = dir.xz / max(0.05, dir.y + 0.05) * 40.0;
      col += vec3(step(0.986, hash(floor(sp))) * smoothstep(0.0, 0.3, dir.y)) * uNight;
    }
    return col;
  }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    float d = texture2D(tDepth, vUv).r;
    if (d >= 0.99999) {
      vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 dir = normalize((uViewInv * vec4(vp.xyz / vp.w, 0.0)).xyz);
      c = sky(dir);
    } else {
      // contrast-aware sharpening, clamped to the neighbourhood so nothing rings
      vec3 n = texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb;
      vec3 s = texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb;
      vec3 e = texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb;
      vec3 w = texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 lo = min(c, min(min(n, s), min(e, w)));
      vec3 hi = max(c, max(max(n, s), max(e, w)));
      c = clamp(c + (c - (n + s + e + w) * 0.25) * uSharpen, lo, hi);
    }
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c = toSRGB(clamp(neutral(c), 0.0, 1.0));
    // lift shadows toward warm brown so darks never go dead black
    c = uLift * 0.35 + c * (uGain - uLift * 0.35);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSaturation);
    vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
    float vig = smoothstep(0.95, 0.25, length(v) * 1.1);
    c *= mix(1.0 - uVignette, 1.0, vig);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const LEVELS = 3;

function target(w, h, samples = 0, depth = false) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: depth,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  return t;
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    this.halfOk = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.samples = renderer.getPixelRatio() >= 1.5 ? 0 : 4;
    this.sceneRT = this.makeSceneTarget(1, 1);
    this.bloomRTs = [];
    this.upRTs = [];
    for (let i = 0; i < LEVELS; i++) { this.bloomRTs.push(target(1, 1)); this.upRTs.push(target(1, 1)); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const pass = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.bright = pass(brightFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.95 } });
    this.down = pass(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(upFrag, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.uniforms = {
      tScene: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.5 },
      uLift: { value: new THREE.Color('#2a1a10') },
      uGain: { value: new THREE.Color('#fff4e6') },
      uSaturation: { value: 1.08 },
      uVignette: { value: 0.2 },
      uAspect: { value: 1 },
      uSharpen: { value: 0.5 },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uProjInv: { value: new THREE.Matrix4() },
      uViewInv: { value: new THREE.Matrix4() },
      uZenith: { value: new THREE.Color('#7fb4dc') },
      uHorizon: { value: new THREE.Color('#f2dcc0') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
      uSunColor: { value: new THREE.Color('#fff1c9') },
      uNight: { value: 0 },
      uTime: { value: 0 },
      // kept for the sky system's convenience (ink-style uniforms no longer used)
      uInk: { value: new THREE.Color() },
      uHatch: { value: 0 },
      uInkStrength: { value: 0 },
    };
    this.final = pass(finalFrag, this.uniforms);
    this.quad = new THREE.Mesh(geo, this.final);
    this.quad.frustumCulled = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.bloomEnabled = true;
    this.enabled = true;
    this.setSize();
  }

  makeSceneTarget(w, h) {
    const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: this.halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.samples,
      depthBuffer: true,
    });
    t.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
    t.depthTexture.type = THREE.UnsignedIntType;
    return t;
  }

  setSize() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = size.x, h = size.y;
    const samples = r.getPixelRatio() >= 1.5 ? 0 : 4;
    if (samples !== this.samples) {
      this.samples = samples;
      this.sceneRT.dispose();
      this.sceneRT = this.makeSceneTarget(w, h);
    }
    this.sceneRT.setSize(w, h);
    for (let i = 0; i < LEVELS; i++) {
      const k = 4 << i;
      this.bloomRTs[i].setSize(Math.ceil(w / k), Math.ceil(h / k));
      this.upRTs[i].setSize(Math.ceil(w / k), Math.ceil(h / k));
    }
    this.uniforms.uAspect.value = w / Math.max(1, h);
    this.uniforms.uTexel.value.set(1 / w, 1 / h);
    const stretch = Math.max(1, (window.devicePixelRatio || 1) / r.getPixelRatio());
    this.uniforms.uSharpen.value = Math.min(1.0, 0.45 + (stretch - 1) * 0.6);
  }

  setGrade(lift, gain, saturation, bloom) {
    this.uniforms.uLift.value.copy(lift);
    this.uniforms.uGain.value.copy(gain);
    this.uniforms.uSaturation.value = saturation;
    this.uniforms.uBloom.value = bloom;
  }

  blit(mat, to) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    const u = this.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uViewInv.value.copy(camera.matrixWorld);
    camera.layers.set(0);
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    let bloomTex = this.black;
    if (this.bloomEnabled) {
      this.bright.uniforms.tSrc.value = this.sceneRT.texture;
      this.bright.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.blit(this.bright, this.bloomRTs[0]);
      for (let i = 1; i < LEVELS; i++) {
        const src = this.bloomRTs[i - 1];
        this.down.uniforms.tSrc.value = src.texture;
        this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.blit(this.down, this.bloomRTs[i]);
      }
      let src = this.bloomRTs[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        this.up.uniforms.tSrc.value = src.texture;
        this.up.uniforms.tBase.value = this.bloomRTs[i].texture;
        this.up.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        this.blit(this.up, this.upRTs[i]);
        src = this.upRTs[i];
      }
      bloomTex = src.texture;
    }
    u.tScene.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.tBloom.value = bloomTex;
    this.blit(this.final, null);

    // overlay layer (labels, drawing preview) stays crisp on top
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    camera.layers.set(1);
    const bg = scene.background;
    scene.background = null;
    r.render(scene, camera);
    scene.background = bg;
    r.autoClear = ac;
    camera.layers.set(0);
  }
}
