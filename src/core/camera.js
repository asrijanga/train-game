import * as THREE from 'three';
import { clamp, lerp } from './rng.js';
import { HALF } from '../world/terrain.js';

const MIN_D = 9, MAX_D = 420;

// Map-style camera: a target on the ground, a distance, a heading (yaw) and a
// tilt that automatically flattens as you zoom in for cinematic close-ups.
export class CameraRig {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.target = new THREE.Vector3(0, 0, 0);
    this.goal = { x: 0, z: 0, d: 170, yaw: 0.6, tilt: 0 };
    this.cur = { ...this.goal };
    this.groundY = 0;
    this.vel = new THREE.Vector2();
    this.follow = null; // { getPosition(out), getHeading() }
    this.followYaw = false;
    this._ray = new THREE.Raycaster();
  }

  pitchFor(d, tilt) {
    const t = clamp((Math.log(d) - Math.log(MIN_D)) / (Math.log(MAX_D) - Math.log(MIN_D)), 0, 1);
    return clamp(lerp(0.32, 1.12, Math.pow(t, 0.8)) + tilt, 0.12, 1.45);
  }

  setImmediate() {
    Object.assign(this.cur, this.goal);
  }

  clampGoal() {
    const lim = HALF * 1.02;
    this.goal.x = clamp(this.goal.x, -lim, lim);
    this.goal.z = clamp(this.goal.z, -lim, lim);
    this.goal.d = clamp(this.goal.d, MIN_D, MAX_D);
    this.goal.tilt = clamp(this.goal.tilt, -0.35, 0.45);
  }

  update(dt) {
    if (this.cab) {
      this.updateCab(dt);
      return;
    }
    if (this.camera.near !== 0.5) { this.camera.near = 0.5; this.camera.updateProjectionMatrix(); }
    if (this.follow) {
      const p = this.follow.getPosition(tmpV);
      this.goal.x = p.x;
      this.goal.z = p.z;
      if (this.followYaw && this.follow.getHeading) {
        let want = this.follow.getHeading() + Math.PI;
        let dy = ((want - this.goal.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.goal.yaw += dy * Math.min(1, dt * 1.5);
      }
    } else if (this.vel.lengthSq() > 1e-4) {
      this.goal.x += this.vel.x * dt;
      this.goal.z += this.vel.y * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 4));
    }
    this.clampGoal();
    const k = 1 - Math.exp(-dt * (this.follow ? 6 : 10));
    const c = this.cur, g = this.goal;
    c.x = lerp(c.x, g.x, k);
    c.z = lerp(c.z, g.z, k);
    c.d = Math.exp(lerp(Math.log(c.d), Math.log(g.d), k));
    c.yaw = lerp(c.yaw, g.yaw, k);
    c.tilt = lerp(c.tilt, g.tilt, k);
    this.apply(dt);
  }

  apply(dt = 0) {
    const c = this.cur;
    const gy = this.terrain.inBounds(c.x, c.z) ? this.terrain.groundAt(c.x, c.z) : 0;
    this.groundY = dt ? lerp(this.groundY, gy, 1 - Math.exp(-dt * 3)) : gy;
    this.target.set(c.x, this.groundY, c.z);
    let p = this.pitchFor(c.d, c.tilt);
    const cam = this.camera;
    const place = (pitch) => {
      const cp = Math.cos(pitch);
      cam.position.set(
        c.x + Math.sin(c.yaw) * cp * c.d,
        this.groundY + Math.sin(pitch) * c.d,
        c.z + Math.cos(c.yaw) * cp * c.d,
      );
    };
    place(p);
    // keep the camera above hills
    for (let i = 0; i < 8; i++) {
      const gx = cam.position.x, gz = cam.position.z;
      const floor = (this.terrain.inBounds(gx, gz) ? this.terrain.groundAt(gx, gz) : 0) + 2.5;
      if (cam.position.y >= floor) break;
      p += 0.06;
      place(p);
    }
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
  }

  // First-person ride in the locomotive cab, looking down the line.
  updateCab(dt) {
    const v = this.cab.vehicle;
    const cam = this.camera;
    if (cam.near !== 0.12) { cam.near = 0.12; cam.updateProjectionMatrix(); }
    v.group.updateMatrixWorld();
    const eye = tmpA.copy(v.cab || tmpB.set(0, 1.5, 0)).applyMatrix4(v.group.matrixWorld);
    const fwd = tmpB.set(1, -0.06, 0).transformDirection(v.group.matrixWorld);
    // a little sway and look-around
    const sw = Math.sin(performance.now() / 600) * 0.012;
    eye.y += sw;
    if (!this._cabEye) { this._cabEye = eye.clone(); this._cabLook = fwd.clone(); }
    const k = 1 - Math.exp(-dt * 10);
    this._cabEye.lerp(eye, k);
    this._cabLook.lerp(fwd, 1 - Math.exp(-dt * 4)).normalize();
    cam.position.copy(this._cabEye);
    const yawOff = this.cabYaw || 0;
    const look = tmpV.copy(this._cabLook).applyAxisAngle(UPV, yawOff);
    cam.lookAt(tmpA.copy(cam.position).add(look));
    cam.updateMatrixWorld();
    this.target.copy(cam.position).addScaledVector(look, 20);
    this.groundY = this.terrain.groundAt(this.target.x, this.target.z);
    this.cur.x = this.goal.x = this.target.x;
    this.cur.z = this.goal.z = this.target.z;
  }

  enterCab(vehicle) {
    this.cab = { vehicle };
    this._cabEye = null;
    this.cabYaw = 0;
  }

  exitCab() {
    if (!this.cab) return;
    this.cab = null;
    this.goal.d = Math.max(this.goal.d, 20);
    this.cur.d = this.goal.d;
  }

  // World point on the horizontal plane through the target, under screen px.
  planePoint(sx, sy, out = new THREE.Vector3()) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const r = this._ray.ray;
    const planeY = this.groundY;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (planeY - r.origin.y) / r.direction.y;
    if (t < 0) return null;
    return out.copy(r.origin).addScaledVector(r.direction, Math.min(t, 3000));
  }

  rayAt(sx, sy) {
    const ndc = new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    return this._ray.ray;
  }

  // Keep world point under (ax, ay) fixed while moving to (bx, by).
  grab(ax, ay, bx, by) {
    const a = this.planePoint(ax, ay, tmpA);
    const b = this.planePoint(bx, by, tmpB);
    if (!a || !b) return;
    this.goal.x += a.x - b.x;
    this.goal.z += a.z - b.z;
    this.clampGoal();
    this.cur.x = this.goal.x;
    this.cur.z = this.goal.z;
    this.apply();
  }

  zoomAt(sx, sy, factor, immediate = true) {
    const before = this.planePoint(sx, sy, tmpA)?.clone();
    this.goal.d = clamp(this.goal.d * factor, MIN_D, MAX_D);
    if (!immediate) {
      // smooth zoom toward the cursor: shift goal proportionally
      if (before) {
        const f = 1 - this.goal.d / (this.goal.d / factor);
        this.goal.x += (before.x - this.goal.x) * f;
        this.goal.z += (before.z - this.goal.z) * f;
      }
      return;
    }
    this.cur.d = this.goal.d;
    this.apply();
    const after = this.planePoint(sx, sy, tmpB);
    if (before && after) {
      this.goal.x += before.x - after.x;
      this.goal.z += before.z - after.z;
      this.clampGoal();
      this.cur.x = this.goal.x;
      this.cur.z = this.goal.z;
      this.apply();
    }
  }

  rotateAt(sx, sy, dYaw) {
    const before = this.planePoint(sx, sy, tmpA)?.clone();
    this.goal.yaw += dYaw;
    this.cur.yaw = this.goal.yaw;
    this.apply();
    const after = this.planePoint(sx, sy, tmpB);
    if (before && after) {
      this.goal.x += before.x - after.x;
      this.goal.z += before.z - after.z;
      this.cur.x = this.goal.x;
      this.cur.z = this.goal.z;
      this.apply();
    }
  }

  flyTo(x, z, d) {
    this.follow = null;
    this.goal.x = x;
    this.goal.z = z;
    if (d) this.goal.d = d;
  }
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
