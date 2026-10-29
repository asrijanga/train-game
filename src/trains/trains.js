import * as THREE from 'three';
import { Train } from './train.js';
import { VEHICLES, LIVERIES } from './vehicles.js';
import { el, sketchify } from '../ui/ui.js';
import { ICONS } from '../ui/sketch.js';
import { Rng } from '../core/rng.js';

const NAMES = [
  'Morning Lark', 'Silver Heron', 'Evening Star', 'Flying Thistle', 'Lady of the Lake', 'Old Faithful',
  'Highland Rambler', 'Bluebell Belle', 'Sleepy Badger', 'Golden Arrow', 'Pennine Wanderer', 'Duchess of Dale',
  'Merry Kestrel', 'Puffing Billy', 'Coronation', 'Moonlight Express', 'Copper Kettle', 'Brave Otter',
  'Wandering Wren', 'Saffron Comet', 'Thunder Hollow', 'Iron Duke', 'Gentle Giant', 'Fen Flyer',
];

const SM = new THREE.Vector3();

export const CAR_TYPES = () => Object.entries(VEHICLES).filter(([, v]) => v.kind === 'car');
export const LOCO_TYPES = () => Object.entries(VEHICLES).filter(([, v]) => v.kind === 'loco');

export class TrainSystem {
  constructor(game) {
    this.game = game;
    this.net = game.rail.net;
    this.stations = game.stations;
    this.list = [];
    this.nextId = 1;
    this.group = new THREE.Group();
    this.group.name = 'trains';
    this.rng = new Rng(game.seed * 3 + 11);
    this.selected = null;
    this.draft = null;
  }

  get effects() {
    return this.game.effects;
  }

  create({ consist, livery, stops, name }) {
    const st = this.stations.byId(stops[0]);
    if (!st) return null;
    const taken = new Set(this.list.map((t) => t.name));
    let nm = name;
    for (let i = 0; !nm && i < 30; i++) { const c = this.rng.pick(NAMES); if (!taken.has(c)) nm = c; }
    const t = new Train(this, { id: this.nextId++, name: nm || `Train ${this.nextId}`, livery, consist, stops, stopIdx: 0 });
    this.list.push(t);
    this.group.add(t.group);
    this.trySpawn(t);
    return t;
  }

  // Bring a train out of the depot onto its first platform once it is free.
  trySpawn(t) {
    const st = this.stations.byId(t.stops[0]);
    if (!st) return false;
    if (!this.platformFree(st, t)) {
      t.pending = true;
      t.group.visible = false;
      t.status = `Waiting in the depot for ${st.name} to be free`;
      return false;
    }
    t.pending = false;
    t.group.visible = true;
    t.stopIdx = 0;
    t.spawnAt(st);
    t.stopIdx = 1 % t.stops.length;
    t.place();
    this.effects?.puff(t.vehicles[0].group.position, 1.2, 10);
    return true;
  }

  remove(t) {
    this.effects?.puff(t.group.children[0]?.position, 2);
    this.group.remove(t.group);
    t.group.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) { /* geometries are cached per type; keep */ } });
    this.list = this.list.filter((x) => x !== t);
    if (this.selected === t) this.select(null);
    if (this.game.rig.follow?.train === t) this.game.rig.follow = null;
  }

  onNetEvent(ev) {
    for (const t of [...this.list]) if (!t.onNetEvent(ev)) this.remove(t);
  }

  onStationRemoved(st) {
    for (const t of [...this.list]) {
      const idx = t.stops.indexOf(st.id);
      if (idx < 0) continue;
      t.stops = t.stops.filter((s) => s !== st.id);
      if (t.stops.length < 1) { this.remove(t); continue; }
      t.stopIdx = t.stopIdx % t.stops.length;
      if (t.state === 'run') { t.plan = null; if (!t.replan(false)) { t.state = 'dwell'; t.timer = 2; } }
    }
    if (this.draft) this.draft.stops = this.draft.stops.filter((s) => s !== st.id);
  }

  onArrive(t, st) {
    this.game.onTrainArrive?.(t, st);
  }

  onDepart(t) {
    this.game.onTrainDepart?.(t);
  }

  trainAt(p, r) {
    let best = null, bd = r + 1.2;
    for (const t of this.list) for (const v of t.vehicles) {
      if (t.pending) continue;
      const d = v.group.position.distanceTo(p);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  update(dt) {
    for (const t of this.list) {
      if (t.pending) {
        t._spawnTry = (t._spawnTry || 0) - dt;
        if (t._spawnTry <= 0) { t._spawnTry = 1.5; this.trySpawn(t); }
        continue;
      }
      t.update(dt);
      this.emitSmoke(t, dt);
    }
    if (this.selected && this._statusEl) this._statusEl.textContent = this.selected.status;
  }

  // Distance along t's planned path until it would touch another train.
  freeDistance(t, maxLook) {
    let best = { dist: Infinity, blocker: null, opposing: false };
    if (this.list.length < 2) return best;
    const others = [];
    for (const o of this.list) {
      if (o === t || o.pending) continue;
      if (t.ghost && t.ghost.other === o && t.odo < t.ghost.until) continue;
      if (o.ghost && o.ghost.other === t && o.odo < o.ghost.until) continue;
      others.push({ o, iv: o.bodyIntervals() });
    }
    if (t.ghost && t.odo >= t.ghost.until) t.ghost = null;
    const p = t.plan;
    let acc = 0;
    const visit = (edge, dir, a, b) => {
      for (const { o, iv } of others) for (const r of iv) {
        if (r.edge !== edge) continue;
        let d = Infinity;
        if (dir > 0 && r.hi >= a && r.lo <= b) d = acc + Math.max(0, r.lo - a);
        if (dir < 0 && r.lo <= a && r.hi >= b) d = acc + Math.max(0, a - r.hi);
        if (d < best.dist) best = { dist: d, blocker: o, opposing: r.dir !== dir && o.state === 'run' };
      }
      acc += Math.abs(b - a);
    };
    const h = t.head;
    if (!p) return best;
    for (let i = p.idx; i < p.steps.length && acc < maxLook + t.length; i++) {
      const st = p.steps[i];
      const a = i === p.idx ? h.d : st.dir > 0 ? 0 : st.edge.length;
      const last = i === p.steps.length - 1;
      const b = last ? Math.min(st.edge.length, Math.max(0, p.stopD + st.dir * 2)) : st.dir > 0 ? st.edge.length : 0;
      visit(st.edge, st.dir, a, b);
    }
    return best;
  }

  // Is another train on (or sitting at the end of) t's freshly planned route,
  // coming the other way? Then wait at the platform for a while.
  lineBusy(t, p) {
    if (!p) return false;
    const steps = new Map();
    for (const st of p.steps) steps.set(st.edge, st.dir);
    for (const o of this.list) {
      if (o === t || o.pending) continue;
      if (o.state !== 'run') continue;
      for (const r of o.bodyIntervals()) {
        const dir = steps.get(r.edge);
        if (dir !== undefined && r.dir !== dir) return true;
      }
    }
    return false;
  }

  // Routing cost for edges other trains are on: avoid oncoming traffic most.
  edgePenalty(t) {
    const occ = new Map();
    for (const o of this.list) {
      if (o === t || o.pending) continue;
      const moving = o.state === 'run';
      const ivs = o.bodyIntervals();
      if (moving && o.plan) for (let i = o.plan.idx; i < o.plan.steps.length; i++) ivs.push({ edge: o.plan.steps[i].edge, dir: o.plan.steps[i].dir });
      for (const r of ivs) {
        const k = r.edge;
        const e = occ.get(k) || { dir: 0, still: 0, moving: [] };
        if (moving) e.moving.push(r.dir); else e.still += 1;
        occ.set(k, e);
      }
    }
    return (edge, dir) => {
      const e = occ.get(edge);
      if (!e) return 0;
      let c = e.still * 160;
      for (const d of e.moving) c += d === dir ? 15 : 600;
      return c;
    };
  }

  platformFree(st, t) {
    for (const o of this.list) {
      if (o === t || o.pending) continue;
      for (const r of o.bodyIntervals()) {
        if (r.edge === st.edge && r.hi > st.d - st.length / 2 - 3 && r.lo < st.d + st.length / 2 + 3) return false;
      }
    }
    return true;
  }

  emitSmoke(t, dt) {
    const fx = this.effects;
    if (!fx || !dt) return;
    for (const v of t.vehicles) {
      if (!v.smoke) continue;
      v.group.updateMatrixWorld();
      const p = SM.copy(v.smoke[0]).applyMatrix4(v.group.matrixWorld);
      if (v.steam) {
        // chuffs: four per driving-wheel turn, bigger when working hard
        const per = (2 * Math.PI * 0.34) / 4;
        v._chuff = (v._chuff ?? 0) + t.speed * dt;
        const busy = t.speed > 0.2;
        if (busy && v._chuff > per) {
          v._chuff = 0;
          const k = Math.min(1, t.speed / 5);
          fx.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 2.2 + k * 1.2, (Math.random() - 0.5) * 0.4, 0.45 + k * 0.25, 2.6 + Math.random(), 2.2, 0.15);
          this.game.audio?.chuff?.(t, k);
        } else if (!busy) {
          v._idle = (v._idle ?? 0) - dt;
          if (v._idle <= 0) {
            v._idle = 0.7 + Math.random() * 0.6;
            fx.spawn(p.x, p.y, p.z, 0, 0.7, 0, 0.3, 3.2, 2.0, 0.05);
          }
        }
      } else {
        v._idle = (v._idle ?? 0) - dt;
        if (v._idle <= 0) {
          v._idle = t.speed > 0.2 ? 0.35 : 1.2;
          fx.spawn(p.x, p.y, p.z, 0, 1.2, 0, 0.18, 1.6, 2.5, 0.75);
        }
      }
    }
  }

  // ------------------------------------------------------------------ UI
  openList() {
    const ui = this.game.ui;
    const box = el('div');
    box.append(el('h2', '', 'Trains'));
    const nb = sketchify(el('button', 'btn', `New train`), '#e9f1e4');
    nb.onclick = () => this.startDraft();
    box.append(nb);
    if (!this.stations.list.length) box.append(el('p', '', '<i>Build a couple of stations first — trains need somewhere to go.</i>'));
    for (const t of this.list) {
      const row = sketchify(el('button', 'train-row'), '#fbf6e8');
      row.innerHTML = `<b>${t.name}</b><br><small>${t.status || ''}</small>`;
      row.onclick = () => { this.select(t); this.followTrain(t); };
      box.append(row);
    }
    ui.showPanel(box);
  }

  startDraft() {
    const locos = LOCO_TYPES();
    this.draft = {
      loco: locos[0][0],
      livery: this.rng.pick(LIVERIES).id,
      cars: ['coach', 'coach', 'coach'],
      stops: [],
    };
    this.renderDraft();
    this.game.ui.setHint('Tap stations on the map, in the order the train should visit them');
  }

  renderDraft() {
    const d = this.draft;
    const box = el('div', 'composer');
    box.append(el('h2', '', 'New train'));
    box.append(el('h3', '', 'Engine'));
    const engines = el('div', 'row');
    for (const [id, v] of LOCO_TYPES()) {
      const b = sketchify(el('button', 'chip' + (d.loco === id ? ' on' : ''), v.name), d.loco === id ? '#f3dfb0' : '#fbf6e8');
      b.onclick = () => { d.loco = id; this.renderDraft(); };
      engines.append(b);
    }
    box.append(engines);
    box.append(el('p', 'blurb', `<i>${VEHICLES[d.loco].blurb || ''}</i>`));
    box.append(el('h3', '', 'Livery'));
    const livs = el('div', 'row');
    for (const l of LIVERIES) {
      const b = el('button', 'swatch' + (d.livery === l.id ? ' on' : ''));
      b.style.background = `linear-gradient(135deg, ${l.body} 60%, ${l.trim} 60%)`;
      b.title = l.name;
      b.onclick = () => { d.livery = l.id; this.renderDraft(); };
      livs.append(b);
    }
    box.append(livs);
    box.append(el('h3', '', 'Carriages & wagons'));
    const cons = el('div', 'row');
    d.cars.forEach((c, i) => {
      const b = sketchify(el('button', 'chip small', `${VEHICLES[c].name} ✕`), '#fbf6e8');
      b.onclick = () => { d.cars.splice(i, 1); this.renderDraft(); };
      cons.append(b);
    });
    if (!d.cars.length) cons.append(el('span', '', '<i>just the engine</i>'));
    box.append(cons);
    const add = el('div', 'row');
    for (const [id, v] of CAR_TYPES()) {
      const b = sketchify(el('button', 'chip small add', `+ ${v.name}`), '#eef3e6');
      b.onclick = () => { if (d.cars.length < 8) d.cars.push(id); this.renderDraft(); };
      add.append(b);
    }
    box.append(add);
    box.append(el('h3', '', 'Stops'));
    const stops = el('ol', 'stops');
    for (const [i, sid] of d.stops.entries()) {
      const st = this.stations.byId(sid);
      const li = el('li', '', `${st?.name ?? '?'} <button class="x">✕</button>`);
      li.querySelector('.x').onclick = () => { d.stops.splice(i, 1); this.renderDraft(); };
      stops.append(li);
    }
    if (!d.stops.length) stops.append(el('p', '', '<i>Tap a station on the map…</i>'));
    box.append(stops);
    const row = el('div', 'row');
    const go = sketchify(el('button', 'btn go' + (d.stops.length >= 2 ? '' : ' disabled'), `${ICONS.check}<span>All aboard!</span>`), '#dcebd2');
    go.onclick = () => this.finishDraft();
    const cancel = sketchify(el('button', 'btn', 'Cancel'));
    cancel.onclick = () => { this.draft = null; this.openList(); this.game.ui.setTool('train'); };
    row.append(go, cancel);
    box.append(row);
    this.game.ui.showPanel(box);
  }

  // Train tool taps: add stations to the draft route.
  onTap(p) {
    if (!this.draft) {
      const t = this.trainAt(p, this.game.snapRadius());
      if (t) { this.select(t); return true; }
      return false;
    }
    const st = this.game.stationAt(p);
    if (!st) { this.game.ui.toast('Tap on a station'); return true; }
    const last = this.draft.stops[this.draft.stops.length - 1];
    if (last === st.id) return true;
    this.draft.stops.push(st.id);
    this.renderDraft();
    return true;
  }

  finishDraft() {
    const d = this.draft;
    if (!d || d.stops.length < 2) return;
    const consist = [d.loco];
    if (VEHICLES[d.loco].tender) consist.push(VEHICLES[d.loco].tender);
    consist.push(...d.cars);
    this.game.pushUndo();
    const t = this.create({ consist, livery: d.livery, stops: d.stops.slice() });
    this.draft = null;
    if (!t) { this.game.ui.toast('Could not place the train'); return; }
    // check the route exists from the first stop
    if (!t.route(true)) this.game.ui.toast(`Can't find a way to ${t.nextStation?.name ?? 'the next stop'} yet`);
    t.plan = null;
    t.state = 'dwell';
    t.timer = 2.5;
    this.game.ui.setTool('train');
    this.select(t);
    this.followTrain(t);
  }

  followTrain(t) {
    const rig = this.game.rig;
    rig.followYaw = false;
    rig.follow = {
      train: t,
      getPosition: (out) => t.leadPosition(out),
      getHeading: () => t.leadHeading(),
    };
    if (rig.goal.d > 60) rig.goal.d = 38;
  }

  select(t) {
    this.selected = t;
    if (!t) { this._statusEl = null; return; }
    const box = el('div');
    box.append(el('h2', '', t.name));
    const status = el('p', 'status', t.status);
    this._statusEl = status;
    box.append(status);
    const cars = t.consistIds.filter((c) => VEHICLES[c].kind === 'car').length;
    box.append(el('p', '', `${VEHICLES[t.consistIds[0]].name} · ${cars} ${cars === 1 ? 'carriage' : 'carriages'}`));
    box.append(el('h3', '', 'Journey'));
    const ol = el('ol', 'stops');
    for (const sid of t.stops) ol.append(el('li', '', this.stations.byId(sid)?.name ?? '?'));
    box.append(ol);
    const row = el('div', 'row');
    const b = (label, fn) => { const x = sketchify(el('button', 'btn', label)); x.onclick = fn; row.append(x); };
    b('Follow', () => this.followTrain(t));
    b('Ride along', () => { this.followTrain(t); this.game.rig.followYaw = true; this.game.rig.goal.d = 14; this.game.rig.goal.tilt = -0.1; });
    b('Remove', () => { this.game.pushUndo(); this.remove(t); this.game.ui.showPanel(null); });
    box.append(row);
    this.game.ui.showPanel(box);
  }

  // ------------------------------------------------------------------ save
  serialize() {
    return { nextId: this.nextId, list: this.list.map((t) => t.serialize()) };
  }

  load(data) {
    this.clear();
    this.nextId = data.nextId || 1;
    for (const d of data.list) {
      const t = new Train(this, d);
      const edge = this.net.edges.get(d.head.edge);
      const trail = d.trail.map((s) => ({ ...s, edge: this.net.edges.get(s.edge) }));
      if (!edge || trail.some((s) => !s.edge)) {
        if (d.pending) { this.list.push(t); this.group.add(t.group); t.pending = true; t.group.visible = false; }
        continue;
      }
      t.head = { edge, dir: d.head.dir, d: d.head.d };
      t.trail = trail;
      t.state = 'dwell';
      t.timer = d.timer ?? 1;
      t.passengers = d.passengers || 0;
      t.place();
      this.list.push(t);
      this.group.add(t.group);
    }
  }

  clear() {
    for (const t of this.list) this.group.remove(t.group);
    this.list = [];
    this.selected = null;
  }
}
