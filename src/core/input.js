// Touch-first gesture recogniser built on pointer events.
//  - one finger: pan (explore) or draw (when a drawing tool is active)
//  - two fingers: pan + pinch zoom + twist rotate
//  - three fingers: vertical drag tilts
//  - mouse: left = pan/draw, right/middle = rotate & tilt, wheel = zoom
export class Input {
  constructor(el, rig, handlers) {
    this.el = el;
    this.rig = rig;
    this.h = handlers; // { onTap, onDrawStart, onDrawMove, onDrawEnd, onDrawCancel, wantsDraw, onHover }
    this.pointers = new Map();
    this.state = 'idle';
    this.prev = null;
    this.panSamples = [];
    this.lastNav = 0;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('lostpointercapture', (e) => this.pointers.has(e.pointerId) && this.up(e, true));
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    }
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  down(e) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType };
    this.pointers.set(e.pointerId, p);
    this.rig.vel.set(0, 0);
    this.h.onUserInput?.();
    const n = this.pointers.size;
    if (n === 1) {
      if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1)) {
        this.state = 'orbit';
      } else {
        this.state = this.h.wantsDraw?.() ? 'pendingDraw' : 'pendingPan';
      }
      this.prev = { x: p.x, y: p.y };
      this.panSamples = [];
    } else {
      if (this.state === 'drawing') {
        if (performance.now() - this.drawStart < 280) this.h.onDrawCancel?.();
        else return; // ignore extra fingers mid-stroke
      }
      this.state = n === 2 ? 'nav2' : 'nav3';
      this.prev = this.metrics();
    }
  }

  metrics() {
    const ps = [...this.pointers.values()];
    let cx = 0, cy = 0;
    for (const p of ps) { cx += p.x; cy += p.y; }
    cx /= ps.length; cy /= ps.length;
    let dist = 0, ang = 0;
    if (ps.length >= 2) {
      const dx = ps[1].x - ps[0].x, dy = ps[1].y - ps[0].y;
      dist = Math.hypot(dx, dy);
      ang = Math.atan2(dy, dx);
    }
    return { x: cx, y: cy, dist, ang, n: ps.length };
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.onHover?.(e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
    switch (this.state) {
      case 'pendingPan':
        if (moved > 6) { this.state = 'pan'; this.prev = { x: p.sx, y: p.sy }; }
        else break;
      // falls through
      case 'pan': {
        this.rig.follow = null;
        this.rig.grab(this.prev.x, this.prev.y, p.x, p.y);
        this.panSamples.push({ t: performance.now(), x: this.rig.goal.x, z: this.rig.goal.z });
        if (this.panSamples.length > 6) this.panSamples.shift();
        this.prev = { x: p.x, y: p.y };
        break;
      }
      case 'pendingDraw':
        if (moved > 5) {
          this.state = 'drawing';
          this.drawStart = performance.now();
          this.h.onDrawStart?.(p.sx, p.sy);
          this.h.onDrawMove?.(p.x, p.y);
        }
        break;
      case 'drawing':
        this.h.onDrawMove?.(p.x, p.y);
        break;
      case 'orbit': {
        const dx = p.x - this.prev.x, dy = p.y - this.prev.y;
        this.rig.goal.yaw -= dx * 0.006;
        this.rig.goal.tilt += dy * 0.004;
        this.rig.clampGoal();
        this.rig.cur.yaw = this.rig.goal.yaw;
        this.rig.cur.tilt = this.rig.goal.tilt;
        this.rig.apply();
        this.prev = { x: p.x, y: p.y };
        break;
      }
      case 'nav2': {
        const m = this.metrics();
        const pv = this.prev;
        this.rig.follow = null;
        if (pv.dist > 0 && m.dist > 0) {
          let da = m.ang - pv.ang;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          this.rig.rotateAt(pv.x, pv.y, -da);
          this.rig.zoomAt(pv.x, pv.y, pv.dist / m.dist);
        }
        this.rig.grab(pv.x, pv.y, m.x, m.y);
        this.prev = m;
        break;
      }
      case 'nav3': {
        const m = this.metrics();
        this.rig.goal.tilt += (m.y - this.prev.y) * 0.004;
        this.rig.clampGoal();
        this.rig.cur.tilt = this.rig.goal.tilt;
        this.rig.apply();
        this.prev = m;
        break;
      }
    }
  }

  up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const dur = performance.now() - p.t;
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
    if (this.pointers.size === 0) {
      if (!cancelled && (this.state === 'pendingPan' || this.state === 'pendingDraw') && dur < 450 && moved < 12) {
        this.h.onTap?.(p.x, p.y);
      } else if (this.state === 'drawing') {
        if (cancelled) this.h.onDrawCancel?.();
        else this.h.onDrawEnd?.(p.x, p.y);
      } else if (this.state === 'pan' && this.panSamples.length >= 2) {
        const a = this.panSamples[0], b = this.panSamples[this.panSamples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0 && performance.now() - b.t < 80) {
          this.rig.vel.set((b.x - a.x) / dt, (b.z - a.z) / dt);
          if (this.rig.vel.length() > 400) this.rig.vel.setLength(400);
        }
      }
      this.state = 'idle';
    } else {
      // dropping from 3->2 or 2->1 fingers: continue navigating, never draw
      this.state = this.pointers.size === 2 ? 'nav2' : this.pointers.size >= 3 ? 'nav3' : 'pan';
      this.prev = this.pointers.size === 1 ? (() => { const q = [...this.pointers.values()][0]; return { x: q.x, y: q.y }; })() : this.metrics();
      this.panSamples = [];
    }
  }

  wheel(e) {
    e.preventDefault();
    this.rig.follow = null;
    if (e.ctrlKey) {
      // trackpad pinch
      this.rig.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
    } else {
      this.rig.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015), false);
    }
  }
}
