// Persist the railway in localStorage. Terrain is stored as a sparse diff from
// the procedurally generated original, so saves stay small.
const KEY = 'inkwell-railways-save-v1';

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function writeSave(game) {
  try {
    const data = serializeGame(game);
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function serializeGame(game) {
  const t = game.terrain;
  const idx = [], hs = [], ds = [];
  for (let i = 0; i < t.h.length; i++) {
    if (Math.abs(t.h[i] - t.original[i]) > 0.004 || t.disturb[i] > 0) {
      idx.push(i);
      hs.push(Math.round(t.h[i] * 100) / 100);
      ds.push(Math.round(t.disturb[i] * 100) / 100);
    }
  }
  const prot = [];
  const p = game.rail.protect;
  for (let i = 0; i < p.length; i++) if (p[i]) prot.push(i);
  return {
    v: 1,
    seed: game.seed,
    time: game.clockTime ?? 0,
    terrain: { i: delta(idx), h: hs, d: ds },
    protect: delta(prot),
    net: game.rail.net.serialize(),
    stations: game.stations.serialize(),
    trains: game.trains.serialize(),
    scenery: game.scenery?.snapshot?.() ?? null,
    settings: game.settings,
    camera: { ...game.rig.goal },
  };
}

export function applySave(game, data) {
  const t = game.terrain;
  const idx = undelta(data.terrain.i);
  idx.forEach((k, j) => {
    t.h[k] = data.terrain.h[j];
    t.disturb[k] = data.terrain.d[j];
  });
  t.restore({ h: t.h, disturb: t.disturb });
  for (const k of undelta(data.protect)) game.rail.protect[k] = 1;
  if (data.scenery) game.scenery?.restore?.(data.scenery);
  game.rail.net.load(data.net);
  game.stations.load(data.stations);
  game.trains.load(data.trains);
  if (data.camera) {
    Object.assign(game.rig.goal, data.camera);
    game.rig.setImmediate();
  }
  if (data.time !== undefined) game.clockTime = data.time;
}

function delta(arr) {
  const out = [];
  let prev = 0;
  for (const v of arr) { out.push(v - prev); prev = v; }
  return out;
}

function undelta(arr) {
  const out = [];
  let acc = 0;
  for (const v of arr) { acc += v; out.push(acc); }
  return out;
}
