import * as THREE from 'three';

// Paper grain + fibres, generated once.
function makePaperTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  // value noise at a few octaves
  const rnd = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const vnoise = (x, y, f) => {
    const xi = Math.floor(x / f), yi = Math.floor(y / f);
    const xf = x / f - xi, yf = y / f - yi;
    const w = S / f;
    const h = (a, b) => rnd(((a % w) + w) % w, ((b % w) + w) % w);
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = vnoise(x, y, 64) * 0.4 + vnoise(x, y, 16) * 0.3 + vnoise(x, y, 4) * 0.2 + rnd(x, y) * 0.1;
      const v = 200 + n * 55;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // fibres
  g.globalAlpha = 0.07;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 4 + Math.random() * 18;
    g.strokeStyle = Math.random() < 0.5 ? '#000' : '#fff';
    g.lineWidth = 0.6 + Math.random();
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5 - 2, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tPaper;
  uniform vec2 uRes;
  uniform float uScale;
  uniform float uNear, uFar;
  uniform mat4 uProjInv;
  uniform mat4 uViewInv;
  uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uInk;
  uniform float uNight, uTime, uInkStrength, uHatch;
  varying vec2 vUv;

  float viewZ(float d) {
    return (uNear * uFar) / ((uFar - uNear) * d - uFar);
  }
  float invZ(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    return -1.0 / viewZ(d);
  }
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  vec3 skyColor(vec3 dir) {
    float h = clamp(dir.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
    // watercolour clouds
    vec2 cp = dir.xz / max(0.12, dir.y + 0.15) * 1.3 + vec2(uTime * 0.01, 0.0);
    float cl = vnoise(cp * 1.4) * 0.6 + vnoise(cp * 3.1) * 0.3 + vnoise(cp * 7.0) * 0.1;
    float cloud = smoothstep(0.55, 0.78, cl) * smoothstep(-0.02, 0.25, dir.y);
    vec3 cloudCol = mix(vec3(1.0, 0.98, 0.94), uHorizon * 0.8, uNight * 0.8);
    col = mix(col, cloudCol, cloud * 0.75);
    // sun glow
    float s = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(s, 64.0) * 0.5 * (1.0 - uNight);
    col += uSunColor * pow(s, 6.0) * 0.12 * (1.0 - uNight);
    // stars
    if (uNight > 0.01) {
      vec2 sp = dir.xz / max(0.05, dir.y + 0.05) * 40.0;
      float st = step(0.985, hash(floor(sp))) * smoothstep(0.0, 0.3, dir.y);
      col += vec3(st) * uNight * 0.9;
    }
    return col;
  }

  vec3 worldAt(vec2 uv, float d) {
    vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vp /= vp.w;
    return (uViewInv * vec4(vp.xyz, 1.0)).xyz;
  }
  // world-anchored noise: strokes stay put on the surface when the camera moves
  float wn(vec3 p) { return vnoise(vec2(p.x + p.y * 0.71, p.z - p.y * 0.63)); }

  float edgeAt(vec2 uv, vec2 off, float wc) {
    float wl = invZ(uv - vec2(off.x, 0.0)), wr = invZ(uv + vec2(off.x, 0.0));
    float wd = invZ(uv - vec2(0.0, off.y)), wu = invZ(uv + vec2(0.0, off.y));
    float lap = abs(wl + wr + wd + wu - 4.0 * wc) / wc;
    float zc = 1.0 / wc;
    float jump = max(max(abs(1.0 / wl - zc), abs(1.0 / wr - zc)), max(abs(1.0 / wd - zc), abs(1.0 / wu - zc))) / zc;
    return max(smoothstep(0.02, 0.08, jump), smoothstep(0.012, 0.05, lap) * 0.85);
  }

  void main() {
    vec2 px = uScale / uRes;
    float dC = texture2D(tDepth, vUv).r;
    vec3 col = texture2D(tColor, vUv).rgb;
    bool sky = dC >= 0.99999;
    if (sky) {
      vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec4 vp = uProjInv * ndc;
      vec3 dir = normalize((uViewInv * vec4(vp.xyz / vp.w, 0.0)).xyz);
      col = skyColor(dir);
    }
    float zc = -viewZ(dC);
    float wc = 1.0 / zc;
    vec3 wp = sky ? vec3(vUv * 400.0, 0.0) : worldAt(vUv, dC);

    // a human hand: wobble, varying pressure and thickness, little gaps
    float ws = 0.35;
    vec2 wob = (vec2(wn(wp * ws), wn(wp * ws + 17.3)) - 0.5) * px * 2.4;
    float thick = 0.65 + 1.1 * wn(wp * 0.13 + 3.1);
    float pressure = 0.5 + 0.5 * smoothstep(0.15, 0.85, wn(wp * 0.21 + 9.7));
    float gaps = smoothstep(0.18, 0.42, wn(wp * 1.1 + 4.2));
    float ink = edgeAt(vUv + wob, px * thick, wc);
    // a second, lighter sketch stroke drifting off the first
    vec2 wob2 = (vec2(wn(wp * 0.5 + 41.0), wn(wp * 0.5 + 77.0)) - 0.5) * px * 5.0;
    float ink2 = edgeAt(vUv + wob2, px * 0.8, wc) * step(0.55, wn(wp * 0.09 + 13.0));
    ink = max(ink * pressure * gaps, ink2 * 0.4);

    // colour edges (windows, trims)
    vec2 uv = vUv + wob;
    vec3 cl = texture2D(tColor, uv - vec2(px.x, 0.0)).rgb, cr = texture2D(tColor, uv + vec2(px.x, 0.0)).rgb;
    vec3 cd = texture2D(tColor, uv - vec2(0.0, px.y)).rgb, cu = texture2D(tColor, uv + vec2(0.0, px.y)).rgb;
    float ce = length(cl - cr) + length(cd - cu);
    float cedge = smoothstep(0.22, 0.45, ce);
    ink = max(ink, cedge * 0.5 * pressure);

    float far = smoothstep(320.0, 100.0, zc);
    ink = sky ? 0.0 : clamp(ink * far * uInkStrength, 0.0, 0.9);

    // hatching drawn on the surfaces, strokes of uneven length and angle
    float L = lum(col);
    float ang = wn(wp * 0.05) * 1.2;
    vec2 hp = vec2(wp.x + wp.y * 0.6, wp.z - wp.y * 0.4);
    float h1c = (hp.x * cos(ang) + hp.y * sin(ang)) * 2.3 + wn(wp * 0.8) * 1.2;
    float h2c = (hp.x * cos(ang + 1.3) - hp.y * sin(ang + 1.3)) * 2.6 + wn(wp * 0.9 + 3.0) * 1.2;
    float stroke1 = smoothstep(0.32, 0.12, abs(fract(h1c) - 0.5)) * step(0.35, wn(wp * 2.2));
    float stroke2 = smoothstep(0.32, 0.12, abs(fract(h2c) - 0.5)) * step(0.4, wn(wp * 2.4 + 8.0));
    float hfade = smoothstep(90.0, 25.0, zc) * (sky ? 0.0 : 1.0);
    float shade = smoothstep(0.3, 0.12, L);
    float deep = smoothstep(0.16, 0.05, L);
    float hatch = (stroke1 * shade * 0.32 + stroke2 * deep * 0.28) * uHatch * hfade;
    vec2 sp = vUv * uRes / uScale;

    // paper
    vec3 paper = texture2D(tPaper, sp / 512.0 * 0.9).rgb;
    vec3 tint = vec3(1.0, 0.975, 0.93);
    col = col * mix(vec3(1.0), paper * 1.18 * tint, 0.55);
    // watercolour pigment pooling at colour boundaries
    col *= 1.0 - cedge * 0.08;

    col = mix(col, uInk, ink);
    col = mix(col, uInk, hatch);

    // soft sepia vignette
    vec2 q = vUv - 0.5;
    float vig = smoothstep(0.85, 0.35, length(q * vec2(1.0, 0.9)));
    col = mix(col * vec3(0.86, 0.8, 0.72), col, vig);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const ext = renderer.extensions;
    const half = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
      // high-DPI screens are sharp enough; MSAA only when rendering below 1.5x
      samples: renderer.getPixelRatio() >= 1.5 ? 0 : 4,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.uniforms = {
      tColor: { value: this.target.texture },
      tDepth: { value: this.target.depthTexture },
      tPaper: { value: makePaperTexture() },
      uRes: { value: size.clone() },
      uScale: { value: renderer.getPixelRatio() },
      uNear: { value: 0.5 },
      uFar: { value: 3000 },
      uProjInv: { value: new THREE.Matrix4() },
      uViewInv: { value: new THREE.Matrix4() },
      uZenith: { value: new THREE.Color('#9cc3d9') },
      uHorizon: { value: new THREE.Color('#efe6cf') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
      uSunColor: { value: new THREE.Color('#fff1c9') },
      uInk: { value: new THREE.Color('#2b2a33') },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uInkStrength: { value: 1 },
      uHatch: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.enabled = true;
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const samples = this.renderer.getPixelRatio() >= 1.5 ? 0 : 4;
    if (samples !== this.target.samples) {
      this.target.samples = samples;
      this.target.dispose();
    }
    this.target.setSize(size.x, size.y);
    this.uniforms.uRes.value.copy(size);
    this.uniforms.uScale.value = this.renderer.getPixelRatio();
  }

  render(scene, camera) {
    const r = this.renderer;
    const u = this.uniforms;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uViewInv.value.copy(camera.matrixWorld);
    camera.layers.set(0);
    if (this.enabled) {
      r.setRenderTarget(this.target);
      r.render(scene, camera);
      r.setRenderTarget(null);
      r.render(this.scene, this.cam);
    } else {
      r.setRenderTarget(null);
      r.render(scene, camera);
    }
    // overlay layer (labels, drawing preview) stays crisp on top
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    camera.layers.set(1);
    const bg = scene.background, fog = scene.fog;
    scene.background = null;
    r.render(scene, camera);
    scene.background = bg;
    scene.fog = fog;
    r.autoClear = ac;
    camera.layers.set(0);
  }
}
