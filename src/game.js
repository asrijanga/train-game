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
import { readSave, writeSave, clearSave, applySave } from './save.js';
import { ICONS } from './ui/sketch.js';
import { PostFX } from './render/post.js';
import { Sky } from './render/sky.js';
import { Scenery } from './world/scenery.js';
import { Towns } from './world/towns.js';
import { Life } from './world/life.js';
import { Effects } from './render/effects.js';
import { AudioEngine } from './audio/audio.js';
import { Passengers } from './stations/passengers.js';

export class Game {
  constructor(container, uiRoot, say) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.say = say;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.save = readSave();
    const qs = new URLSearchParams(location.search);
    const qseed = parseInt(qs.get('seed'), 10);
    if (qseed && this.save?.seed !== qseed) this.save = null;
    this.seed = this.save?.seed ?? (qseed || 1 + Math.floor(Math.random() * 999983));
    this.settings = { timeScale: 1, dayCycle: 'cycle', ...(this.save?.settings || {}) };
    this.dirty = false;
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
    this.post = new PostFX(renderer);
    this.audio = new AudioEngine(this);

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
    this.sunDir = new THREE.Vector3(0.55, 0.75, 0.35).normalize();
    this.sky = new Sky(this);

    this.say('raising mountains…');
    await tick();
    this.terrain = new Terrain(this.seed);
    scene.add(this.terrain.group);

    this.say('filling the lakes…');
    await tick();
    this.water = createWater(this.terrain);
    scene.add(this.water.mesh);

    this.say('building villages…');
    await tick();
    this.towns = new Towns(this);
    this.towns.generate();
    scene.add(this.towns.group);
    this.terrain.recolorAll();
    this.say('planting forests…');
    await tick();
    this.scenery = new Scenery(this);
    this.scenery.generate((x, z) => this.towns.blocks(x, z));
    scene.add(this.scenery.group);
    this.life = new Life(this);
    scene.add(this.life.group);
    this.effects = new Effects();
    scene.add(this.effects.mesh);

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
    this.passengers = new Passengers(this);
    scene.add(this.passengers.group);
    this.preview = new TrackPreview(this.terrain);
    scene.add(this.preview.group);

    this.ui = new UI(this.uiRoot, this);
    this.undoStack = [];
    this.setTool('explore');
    this.__TrackDraft = TrackDraft;

    if (this.save) {
      this.say('unrolling your map…');
      await tick();
      try { applySave(this, this.save); } catch (e) { console.warn('could not load save', e); }
    } else {
      this.introCamera();
    }
    this.buildHud();
    setInterval(() => this.autosave(), 15000);
    addEventListener('pagehide', () => this.autosave(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(true); });

    this.input = new Input(renderer.domElement, this.rig, {
      onTap: (x, y) => this.onTap(x, y),
      wantsDraw: () => this.tool === 'track',
      onDrawStart: (x, y) => this.drawStart(x, y),
      onDrawMove: (x, y) => this.drawMove(x, y),
      onDrawEnd: () => this.drawEnd(),
      onDrawCancel: () => this.drawCancel(),
      onCabExit: () => this.ui.setTool(this.tool),
      onAnyTouch: () => {
        this.idle = 0;
        if (this.relax) { this.setRelax(false); return true; }
        return false;
      },
    });

    addEventListener('resize', () => this.resize());
    this.resize();
    renderer.setAnimationLoop(() => this.frame());
  }

  introCamera() {
    // start somewhere green and pleasant
    let best = null;
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 220, z = (Math.random() - 0.5) * 220;
      const h = this.terrain.heightAt(x, z);
      if (h < 1.5 || h > 9 || this.terrain.slopeAt(x, z) > 0.25) continue;
      best = { x, z };
      break;
    }
    if (best) { this.rig.goal.x = best.x; this.rig.goal.z = best.z; }
    this.rig.goal.d = 150;
    this.rig.setImmediate();
  }

  autosave(force = false) {
    if (!this.dirty && !force) return;
    if (writeSave(this)) this.dirty = false;
  }

  markDirty() {
    this.dirty = true;
  }

  newIsland() {
    if (!confirm('Start a fresh island? Your current railway will be packed away for good.')) return;
    clearSave();
    this.autosave = () => {};
    location.reload();
  }

  buildHud() {
    // title cartouche with gentle stats
    const card = sketchify(el('div', 'cartouche'), '#f8f1de');
    card.innerHTML = `<div class="ttl">Inkwell Railways</div><div class="stats"></div>`;
    this.uiRoot.append(card);
    this.statsEl = card.querySelector('.stats');
    // top-right controls
    const tr = el('div', 'topright');
    const mk = (icon, title, fn) => { const b = sketchify(el('button', 'round', icon)); b.title = title; b.onclick = fn; tr.append(b); return b; };
    mk(ICONS.camera, 'Relax & watch', () => this.setRelax(true));
    this.speedBtn = mk(ICONS.play, 'Time speed', () => this.cycleSpeed());
    mk(ICONS.gear, 'Settings', () => this.openSettings());
    this.uiRoot.append(tr);
    this.updateSpeedBtn();
  }

  // Hide the interface and let the camera wander through the railway.
  setRelax(on) {
    this.relax = on;
    this.uiRoot.classList.toggle('relaxing', on);
    if (on) {
      this.ui.showPanel(null);
      this.tourT = 0;
      this.tourShot = -1;
      this.nextShot();
      this.ui.toast('Relax mode · touch anywhere to come back', 2600);
    } else {
      this.rig.exitCab();
      this.rig.follow = null;
      this.rig.followYaw = false;
      this.ui.setTool(this.tool);
    }
  }

  nextShot() {
    const trains = this.trains.list.filter((t) => !t.pending);
    const stations = this.stations.list;
    const rig = this.rig;
    rig.exitCab();
    rig.follow = null;
    rig.followYaw = false;
    this.orbit = null;
    const kinds = trains.length ? ['chase', 'cab', 'side', 'station', 'aerial'] : stations.length ? ['station', 'aerial'] : ['aerial'];
    this.tourShot = (this.tourShot + 1 + Math.floor(Math.random() * 2)) % kinds.length;
    const kind = kinds[this.tourShot];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    this.tourT = kind === 'cab' ? 22 : 16;
    if (kind === 'chase' || kind === 'side') {
      const t = pick(trains);
      this.trains.followTrain(t);
      rig.followYaw = kind === 'chase';
      rig.goal.d = kind === 'chase' ? 15 : 26;
      rig.goal.tilt = kind === 'chase' ? -0.12 : 0.05;
      if (kind === 'side') rig.goal.yaw = t.leadHeading() + Math.PI / 2;
    } else if (kind === 'cab') {
      this.trains.rideCab(pick(trains));
      this.ui.setHint('');
    } else if (kind === 'station') {
      const st = pick(stations);
      rig.flyTo(st.center.x, st.center.z, 30);
      rig.goal.tilt = -0.05;
      this.orbit = 0.08;
    } else {
      rig.flyTo(rig.goal.x + (Math.random() - 0.5) * 80, rig.goal.z + (Math.random() - 0.5) * 80, 190);
      rig.goal.tilt = -0.1;
      this.orbit = 0.03;
    }
  }

  updateRelax(dt) {
    if (!this.relax) {
      this.idle = (this.idle || 0) + dt;
      return;
    }
    this.tourT -= dt;
    if (this.orbit) this.rig.goal.yaw += this.orbit * dt;
    if (this.tourT <= 0) this.nextShot();
  }

  cycleSpeed() {
    const order = [1, 2, 4, 0];
    const i = order.indexOf(this.settings.timeScale);
    this.settings.timeScale = order[(i + 1) % order.length];
    this.updateSpeedBtn();
    this.markDirty();
  }

  updateSpeedBtn() {
    const ts = this.settings.timeScale;
    this.speedBtn.innerHTML = (ts === 0 ? ICONS.pause : ts === 1 ? ICONS.play : ICONS.fast) + (ts > 1 ? `<span class="badge">${ts}×</span>` : '');
  }

  openSettings() {
    const box = el('div');
    box.append(el('h2', '', 'Settings'));
    box.append(el('p', '', `Island no. <b>${this.seed}</b>`));
    const row = el('div', 'row');
    const b = (label, fn) => { const x = sketchify(el('button', 'btn', label)); x.onclick = fn; row.append(x); return x; };
    b('Save now', () => { this.autosave(true); this.ui.toast('Saved ✓'); });
    b('New island', () => this.newIsland());
    box.append(row);
    box.append(el('h3', '', 'Time of day'));
    const tod = el('div', 'row');
    for (const [id, label] of [['cycle', 'Day & night'], ['day', 'Always day'], ['golden', 'Golden hour'], ['night', 'Starry night']]) {
      const x = sketchify(el('button', 'chip' + (this.settings.dayCycle === id ? ' on' : ''), label), this.settings.dayCycle === id ? '#f3dfb0' : '#fbf6e8');
      x.onclick = () => { this.settings.dayCycle = id; this.markDirty(); this.openSettings(); };
      tod.append(x);
    }
    box.append(tod);
    box.append(el('h3', '', 'Sound'));
    const snd = el('div', 'row');
    const tog = (label, on, fn) => {
      const x = sketchify(el('button', 'chip' + (on ? ' on' : ''), `${label}: ${on ? 'on' : 'off'}`), on ? '#f3dfb0' : '#fbf6e8');
      x.onclick = () => { fn(!on); this.markDirty(); this.openSettings(); };
      snd.append(x);
    };
    tog('Sounds', this.audio.enabled, (v) => this.audio.setEnabled(v));
    tog('Music', this.audio.musicOn, (v) => this.audio.setMusic(v));
    box.append(snd);
    this.settingsExtra?.(box);
    box.append(el('p', 'blurb', '<i>Your railway saves itself every few moments.</i>'));
    this.ui.showPanel(box);
  }

  updateStats() {
    if (!this.statsEl) return;
    let served = 0;
    for (const s of this.stations.list) served += s.served;
    let goods = 0;
    for (const s of this.stations.list) goods += s.goods || 0;
    const txt = `${this.stations.list.length} stations · ${this.trains.list.length} trains · ${served} happy travellers` + (goods ? ` · ${goods} loads` : '');
    if (txt !== this._stats) { this._stats = txt; this.statsEl.textContent = txt; }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize();
  }

  setTool(id) {
    const prev = this.tool;
    if (prev && prev !== id) this.audio?.pop(0.8);
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

  onTrainDepart(t) {
    this.audio.whistle(t);
  }

  onTrainArrive(t, st) {
    if (st) this.audio.stationBell(st);
    this.passengers?.onArrive(t, st);
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
      this.markDirty();
      this.audio.pop(1.2);
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
    const stats = el('p', '', `Passengers welcomed: <b>${st.served}</b> · waiting: <b>${st.waiting || 0}</b>` + (st.goods ? ` · loads: <b>${st.goods}</b>` : ''));
    box.append(stats);
    const row = el('div', 'row');
    const btn = (label, fn) => { const b = sketchify(el('button', 'btn', label)); b.onclick = fn; row.append(b); return b; };
    btn('Change style', () => { this.pushUndo(); this.stations.cycleStyle(st); this.openStation(st); });
    btn('Rename', () => {
      const n = prompt('Name this station', st.name);
      if (n && n.trim()) { st.name = n.trim().slice(0, 40); this.stations.buildView(st); this.markDirty(); this.openStation(st); }
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
    const now = performance.now();
    if (this._lastDraw) {
      const sp = Math.hypot(x - this._lastDraw.x, y - this._lastDraw.y) / Math.max(1, now - this._lastDraw.t);
      this.audio.scratch(Math.min(1, sp * 0.6));
    }
    this._lastDraw = { x, y, t: now };
    const p = this.pick(x, y);
    if (!p) return;
    this.draft.update(p.x, p.z);
    this.preview.show(this.draft.plan);
    if (this.draft.plan && !this.draft.plan.valid && this.draft.plan.reason) this.ui.setHint(this.draft.plan.reason);
  }

  drawEnd() {
    const plan = this.draft?.plan;
    this.draft = null;
    this._lastDraw = null;
    this.audio.scratch(0);
    this.preview.hide();
    this.ui.setTool(this.tool);
    if (!plan) return;
    if (!plan.valid) {
      this.ui.toast(plan.reason || 'That track won\'t fit there');
      return;
    }
    this.pushUndo();
    this.rail.commit(plan);
    this.audio.thunk();
  }

  drawCancel() {
    this.draft = null;
    this._lastDraw = null;
    this.audio?.scratch(0);
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
    this.markDirty();
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 25) this.undoStack.shift();
    this.ui.setUndoEnabled(true);
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.restore(s);
    this.markDirty();
    this.ui.setUndoEnabled(this.undoStack.length > 0);
  }

  restore(s) {
    this.passengers?.clear();
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

  chimneySmoke(dt) {
    if (!dt) return;
    this._chim = (this._chim ?? 0) - dt;
    if (this._chim > 0) return;
    this._chim = 0.35;
    const t = this.rig.target;
    const R = Math.max(90, this.rig.cur.d * 0.9);
    const emit = (p) => {
      if (Math.abs(p.x - t.x) > R || Math.abs(p.z - t.z) > R || Math.random() > 0.3) return;
      this.effects.spawn(p.x, p.y, p.z, 0, 0.5, 0, 0.22, 4.5, 3.2, 0.25);
    };
    for (const tw of this.towns.list) for (const c of tw.chimneys || []) emit(c);
    for (const st of this.stations.list) for (const c of st.smoke || []) emit(c);
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
    this.sun.position.copy(t).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(t);
  }

  frame() {
    const rdt = Math.min(this.clock.getDelta(), 0.1);
    const dt = rdt * this.settings.timeScale;
    this.time += rdt;
    this.updateRelax(rdt);
    this.rig.update(rdt);
    this.updateStats();
    this.audio.update(rdt);
    this.updateSunShadow();
    this.water.uniforms.uTime.value = this.time;
    this.preview.update(this.time);
    this.trains.update(dt);
    this.passengers.update(dt, this.time);
    const cyc = this.settings.dayCycle;
    if (cyc === 'cycle') this.sky.advance(dt, 24);
    else this.sky.hour = { day: 11, golden: 17.9, night: 22.5 }[cyc] ?? 11;
    this.clockTime = this.sky.hour;
    this.sky.apply();
    this.post.uniforms.uTime.value = this.time;
    this.stations.update(dt, this.sky.hour % 12);
    this.stations.setLabelOpacity(THREE.MathUtils.smoothstep(this.rig.cur.d, 35, 70));
    this.towns.setLabelOpacity(THREE.MathUtils.smoothstep(this.rig.cur.d, 60, 110));
    this.towns.update(dt);
    this.scenery.update(this.time);
    this.life.update(dt, this.time, this.camera);
    this.chimneySmoke(dt);
    this.effects.uniforms.uLight.value = 1 - this.sky.night * 0.55;
    this.effects.update(rdt);
    this.post.render(this.scene, this.camera);
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
