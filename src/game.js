import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { CameraRig } from './core/camera.js';
import { Input } from './core/input.js';
import { RailSystem } from './rail/rail.js';
import { TrackDraft } from './rail/builder.js';
import { TrackPreview } from './rail/preview.js';
import { UI, el, sketchify } from './ui/ui.js';
import { StationSystem } from './stations/stations.js';
import { STYLES } from './stations/styles.js';
import { TrainSystem } from './trains/trains.js';

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

    try {
      await Promise.all([document.fonts.load('700 56px Caveat'), document.fonts.load('20px "Patrick Hand"')]);
    } catch { /* fonts are a nicety */ }

    this.rail = new RailSystem(this);
    scene.add(this.rail.group);
    this.stations = new StationSystem(this);
    scene.add(this.stations.group);
    this.trains = new TrainSystem(this);
    scene.add(this.trains.group);
    this.preview = new TrackPreview(this.terrain);
    scene.add(this.preview.group);

    this.ui = new UI(this.uiRoot, this);
    this.undoStack = [];
    this.setTool('explore');
    this.__TrackDraft = TrackDraft;

    this.input = new Input(renderer.domElement, this.rig, {
      onTap: (x, y) => this.onTap(x, y),
      wantsDraw: () => this.tool === 'track',
      onDrawStart: (x, y) => this.drawStart(x, y),
      onDrawMove: (x, y) => this.drawMove(x, y),
      onDrawEnd: () => this.drawEnd(),
      onDrawCancel: () => this.drawCancel(),
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

  setTool(id) {
    const prev = this.tool;
    this.tool = id;
    this.drawCancel();
    this.ui.setTool(id);
    this.ui.setUndoEnabled(this.undoStack.length > 0);
    if (this.trains && id !== 'train') this.trains.draft = null;
    if (id === 'train') this.trains.openList();
    else if (prev !== id) this.ui.showPanel(null);
  }

  pick(x, y) {
    return this.terrain.raycast(this.rig.rayAt(x, y));
  }

  snapRadius() {
    return THREE.MathUtils.clamp(this.rig.cur.d * 0.03, 1.6, 9);
  }

  onNetworkChanged(ev) {
    this.stations?.onNetEvent(ev);
    this.trains?.onNetEvent?.(ev);
  }

  stationAt(p) {
    let best = null, bd = Infinity;
    for (const st of this.stations.list) {
      const d = st.center.distanceTo(p);
      if (d < st.length / 2 + 4 && d < bd) { bd = d; best = st; }
    }
    return best;
  }

  onTap(x, y) {
    const p = this.pick(x, y);
    if (!p) return;
    const r = this.snapRadius();
    if (this.tool === 'remove') {
      const tr = this.trains?.trainAt?.(p, r);
      if (tr) { this.pushUndo(); this.trains.remove(tr); return; }
      const st = this.stationAt(p);
      if (st && st.center.distanceTo(p) < st.length / 2 + 2) { this.pushUndo(); this.stations.remove(st); return; }
      const hit = this.rail.net.nearestEdge(p.x, p.z, r);
      if (hit) {
        this.pushUndo();
        this.rail.removeEdge(hit.edge);
      }
      return;
    }
    if (this.tool === 'station') {
      const st = this.stationAt(p);
      if (st) { this.openStation(st); return; }
      const hit = this.rail.net.nearestEdge(p.x, p.z, r * 1.5);
      if (!hit) { this.ui.toast('Tap right next to a piece of track'); return; }
      const s = hit.edge.sample(hit.d, {});
      const side = (p.x - s.x) * -s.tz + (p.z - s.z) * s.tx >= 0 ? 1 : -1;
      const snap = this.snapshot();
      const res = this.stations.place(hit.edge, hit.d, side);
      if (!res.ok) { this.ui.toast(res.reason); return; }
      this.undoStack.push(snap);
      this.ui.setUndoEnabled(true);
      this.openStation(res.station);
      return;
    }
    if (this.tool === 'train' && this.trains?.onTap?.(p)) return;
    if (this.tool === 'explore') {
      const tr = this.trains?.trainAt?.(p, r);
      if (tr) { this.trains.select(tr); return; }
      const st = this.stationAt(p);
      if (st) { this.openStation(st); return; }
      this.ui.showPanel(null);
      this.trains?.select?.(null);
    }
  }

  openStation(st) {
    const box = el('div');
    const h = el('h2', '', st.name);
    const style = el('p', '', `<i>${STYLES[st.style].label}</i>`);
    box.append(h, style);
    const stats = el('p', '', `Passengers welcomed: <b>${st.served}</b>`);
    box.append(stats);
    const row = el('div', 'row');
    const btn = (label, fn) => { const b = sketchify(el('button', 'btn', label)); b.onclick = fn; row.append(b); return b; };
    btn('Change style', () => { this.pushUndo(); this.stations.cycleStyle(st); this.openStation(st); });
    btn('Rename', () => {
      const n = prompt('Name this station', st.name);
      if (n && n.trim()) { st.name = n.trim().slice(0, 40); this.stations.buildView(st); this.openStation(st); }
    });
    btn('Visit', () => this.rig.flyTo(st.center.x, st.center.z, 30));
    btn('Remove', () => { this.pushUndo(); this.stations.remove(st); this.ui.showPanel(null); });
    box.append(row);
    this.ui.showPanel(box);
  }

  drawStart(x, y) {
    const p = this.pick(x, y);
    if (!p) return;
    this.draft = new TrackDraft(this.rail, p, this.snapRadius());
  }

  drawMove(x, y) {
    if (!this.draft) return;
    const p = this.pick(x, y);
    if (!p) return;
    this.draft.update(p.x, p.z);
    this.preview.show(this.draft.plan);
    if (this.draft.plan && !this.draft.plan.valid && this.draft.plan.reason) this.ui.setHint(this.draft.plan.reason);
  }

  drawEnd() {
    const plan = this.draft?.plan;
    this.draft = null;
    this.preview.hide();
    this.ui.setTool(this.tool);
    if (!plan) return;
    if (!plan.valid) {
      this.ui.toast(plan.reason || 'That track won\'t fit there');
      return;
    }
    this.pushUndo();
    this.rail.commit(plan);
  }

  drawCancel() {
    this.draft = null;
    this.preview?.hide();
  }

  // ---------- undo ----------
  snapshot() {
    return {
      terrain: this.terrain.snapshot(),
      net: this.rail.net.serialize(),
      protect: new Uint8Array(this.rail.protect),
      scenery: this.scenery?.snapshot?.(),
      stations: this.stations?.serialize?.(),
      trains: this.trains?.serialize?.(),
    };
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 25) this.undoStack.shift();
    this.ui.setUndoEnabled(true);
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.restore(s);
    this.ui.setUndoEnabled(this.undoStack.length > 0);
  }

  restore(s) {
    this.trains?.clear?.();
    this.stations?.clear?.();
    this.rail.clear();
    this.terrain.restore(s.terrain);
    this.rail.protect.set(s.protect);
    if (s.scenery) this.scenery?.restore?.(s.scenery);
    this.rail.net.load(s.net);
    if (s.stations) this.stations?.load?.(s.stations);
    if (s.trains) this.trains?.load?.(s.trains);
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
    this.preview.update(this.time);
    this.trains.update(dt);
    this.stations.update(dt, (this.time / 60 + 9) % 12);
    this.stations.setLabelOpacity(THREE.MathUtils.smoothstep(this.rig.cur.d, 35, 70));
    this.renderer.render(this.scene, this.camera);
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
