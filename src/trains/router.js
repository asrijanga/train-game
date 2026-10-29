// Directional shortest-path search over the rail graph. A state is "travelling
// along edge e in direction dir". Trains may only reverse at stations (the
// start) or at dead ends.
const REVERSE_PENALTY = 2500; // prefer carrying on round a loop over turning back
const DEAD_END_PENALTY = 120;

export function stopPoint(edge, stationD, dir, trainLen) {
  const s = stationD + dir * trainLen / 2;
  return Math.min(edge.length - 0.2, Math.max(0.2, s));
}

// starts: [{ edge, dir, d, cost, reversed }]
// goal: { edge, d } (station centre) ; trainLen
// Returns { steps: [{edge, dir}], stopD, endType: 'station'|'reverse', reversed, cost } or null
export function findRoute(net, starts, goal, trainLen, penalty) {
  const best = new Map(); // key -> cost
  const prev = new Map(); // key -> { key, edge, dir }
  const open = [];
  const key = (e, dir) => e.id * 2 + (dir > 0 ? 1 : 0);
  let bestGoal = null;

  for (const s of starts) {
    open.push({ edge: s.edge, dir: s.dir, pos: s.d, cost: s.cost || 0, start: s, k: key(s.edge, s.dir) });
  }

  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (bestGoal && cur.cost >= bestGoal.cost) break;
    const k = cur.k;
    if (!cur.start && best.has(k) && best.get(k) <= cur.cost) continue;
    if (!cur.start) best.set(k, cur.cost);

    const { edge, dir, pos } = cur;
    if (edge === goal.edge) {
      const sp = stopPoint(edge, goal.d, dir, trainLen);
      const ahead = (sp - pos) * dir;
      if (ahead >= -0.05) {
        const c = cur.cost + Math.max(0, ahead);
        if (!bestGoal || c < bestGoal.cost) bestGoal = { cost: c, node: cur, stopD: sp, endType: 'station' };
      }
    }
    const toEnd = dir > 0 ? edge.length - pos : pos;
    const endCost = cur.cost + toEnd + (penalty && !cur.start ? penalty(edge, dir) : 0);
    const { node, side } = edge.endOf(dir);
    const deps = net.departures(node, side);
    if (deps.length === 0) {
      // dead end: reverse here (train replans after reversing)
      const c = endCost + DEAD_END_PENALTY;
      if (!bestGoal || c < bestGoal.cost) {
        // only take a dead-end reversal if nothing better shows up; record as candidate
        const cand = { cost: c + 1e6, node: cur, stopD: dir > 0 ? edge.length : 0, endType: 'reverse' };
        if (!bestGoal) bestGoal = cand;
      }
      continue;
    }
    for (const dp of deps) {
      const nk = key(dp.edge, dp.dir);
      if (best.has(nk) && best.get(nk) <= endCost) continue;
      open.push({ edge: dp.edge, dir: dp.dir, pos: dp.dir > 0 ? 0 : dp.edge.length, cost: endCost, k: nk, parent: cur });
    }
  }
  if (!bestGoal) return null;
  const steps = [];
  let n = bestGoal.node;
  let start = null;
  while (n) {
    steps.push({ edge: n.edge, dir: n.dir });
    if (n.start) start = n.start;
    n = n.parent;
  }
  steps.reverse();
  return {
    steps,
    stopD: bestGoal.stopD,
    endType: bestGoal.endType,
    reversed: !!start?.reversed,
    cost: bestGoal.cost,
  };
}

export { REVERSE_PENALTY };
