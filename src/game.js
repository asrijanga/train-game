import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';

export class Game {
  constructor(container, uiRoot, say) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.say = say;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.seed = 1234;
  }

  async init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9e2cc');
    scene.fog = new THREE.Fog('#e9e2cc', 300, 900);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 3000);

    this.hemi = new THREE.HemisphereLight('#fff6e0', '#6f8a6a', 1.25);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff2d6', 2.2);
    sun.position.set(120, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.4;
    const sc = sun.shadow.camera;
    sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 1; sc.far = 700;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.say('raising mountains…');
    await tick();
    this.terrain = new Terrain(this.seed);
    scene.add(this.terrain.group);

    this.say('filling the lakes…');
    await tick();
    this.water = createWater(this.terrain);
    scene.add(this.water.mesh);

    this.rig = new CameraRig(this.camera, this.terrain);
    this.rig.setImmediate();
    this.rig.apply();

    this.input = new Input(renderer.domElement, this.rig, {
      onTap: (x, y) => this.onTap(x, y),
    });

    addEventListener('resize', () => this.resize());
    this.resize();
    renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  onTap(x, y) {
    const p = this.terrain.raycast(this.rig.rayAt(x, y));
    if (p) console.log('tap', p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1));
  }

  updateSunShadow() {
    // keep the shadow frustum centred on what the camera is looking at
    const t = this.rig.target;
    const span = THREE.MathUtils.clamp(this.rig.cur.d * 0.9, 40, 260);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) > 2) {
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.updateProjectionMatrix();
    }
    const dir = new THREE.Vector3(0.55, 0.75, 0.35).normalize();
    this.sun.position.copy(t).addScaledVector(dir, 300);
    this.sun.target.position.copy(t);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    this.rig.update(dt);
    this.updateSunShadow();
    this.water.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
