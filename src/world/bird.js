import * as THREE from 'three';
import { SPECIES } from './species.js';

// ---------------------------------------------------------------------------
// Shared look: toon shading with a 3-step ramp + per-face vertex colours.
// ---------------------------------------------------------------------------
const ramp = new THREE.DataTexture(new Uint8Array([78, 160, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

export const birdMaterial = new THREE.MeshToonMaterial({
  vertexColors: true,
  gradientMap: ramp,
  side: THREE.DoubleSide,
});

const col = new THREE.Color();

function paint(geometry, fn) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    col.set(fn(cx, cy, cz, i / 3));
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = col.r;
      colors[(i + k) * 3 + 1] = col.g;
      colors[(i + k) * 3 + 2] = col.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function flatShape(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // shape y → +z (span axis)
  return g;
}

const geoCache = new Map();

function speciesGeometry(id) {
  if (geoCache.has(id)) return geoCache.get(id);
  const sp = SPECIES[id];
  const slender = sp.slender ? 0.84 : 1;
  const wl = sp.wingLen || 1;

  const body = new THREE.SphereGeometry(1, 9, 7);
  body.scale(0.27, 0.17 * slender, 0.16 * slender);
  const bodyG = paint(body, (x, y, z, f) => {
    if (sp.speckle && y > -0.05 && ((f * 7) % 5) < 1) return sp.speckle;
    if (y > 0.045) return sp.back;
    if (x > 0.07) return sp.breast;
    if (y < -0.03) return sp.belly;
    return x > -0.05 ? sp.breast : sp.back;
  });

  const head = new THREE.SphereGeometry(0.125, 8, 6);
  const headG = paint(head, (x, y, z) => {
    if (sp.mask && x > 0.05 && y > -0.05 && y < 0.05) return sp.mask;
    if (y > 0.045) return sp.cap;
    if (y < -0.035 && x > -0.03) return sp.throat;
    if (sp.cheek && Math.abs(z) > 0.07 && x < 0.07) return sp.cheek;
    return sp.face;
  });

  const thick = sp.beakThick || 1;
  const beak = new THREE.ConeGeometry(0.036 * thick, 0.11 * (sp.slender ? 0.8 : 1), 4);
  beak.rotateZ(-Math.PI / 2);
  const beakG = paint(beak, () => sp.beak);

  const eye = new THREE.BoxGeometry(0.035, 0.04, 0.02);
  const eyeG = paint(eye, () => '#0a0a10');

  const crestG = sp.crest
    ? paint(new THREE.ConeGeometry(0.05, 0.15, 4).rotateZ(0.65).translate(-0.04, 0.15, 0), () => sp.cap)
    : null;

  const tailPts = sp.forked
    ? [[0, -0.045], [-0.38, -0.1], [-0.22, 0], [-0.38, 0.1], [0, 0.045]]
    : [[0, -0.05], [-0.27, -0.075], [-0.29, 0], [-0.27, 0.075], [0, 0.05]];
  const tailG = paint(flatShape(tailPts), () => sp.tail);

  const innerG = paint(
    flatShape([[0.09, 0], [0.08, 0.16 * wl], [-0.1, 0.16 * wl], [-0.15, 0]]),
    (x) => (sp.wingbar && x > -0.06 && x < -0.02 ? sp.wingbar : sp.wing),
  );
  const outerG = paint(
    flatShape([[0.08, 0], [0.02, 0.15 * wl], [-0.04, 0.21 * wl], [-0.1, 0.12 * wl], [-0.1, 0]]),
    () => sp.tip,
  );

  const leg = new THREE.BoxGeometry(0.045, 0.13, 0.04);
  leg.translate(0, 0.065, 0);
  const legG = paint(leg, () => sp.legs);

  const out = { bodyG, headG, beakG, eyeG, crestG, tailG, innerG, outerG, legG };
  geoCache.set(id, out);
  return out;
}

// ---------------------------------------------------------------------------
// Rig: root sits at the feet. Everything is posed procedurally.
// ---------------------------------------------------------------------------
export class BirdRig {
  constructor(speciesId, worldScale) {
    const sp = SPECIES[speciesId];
    const g = speciesGeometry(speciesId);
    const m = birdMaterial;
    this.root = new THREE.Group();
    this.root.rotation.order = 'YZX';
    this.root.scale.setScalar(sp.scale * worldScale);

    this.legs = new THREE.Group();
    this.legs.position.set(0.0, 0.0, 0);
    for (const z of [-0.045, 0.045]) {
      const l = new THREE.Mesh(g.legG, m);
      l.position.z = z;
      this.legs.add(l);
    }
    this.legs.position.y = 0;
    this.root.add(this.legs);

    this.tilt = new THREE.Group();
    this.tilt.position.set(0, 0.1, 0);
    this.root.add(this.tilt);

    this.body = new THREE.Group();
    this.tilt.add(this.body);
    const bodyMesh = new THREE.Mesh(g.bodyG, m);
    bodyMesh.position.set(0, 0.12, 0);
    this.body.add(bodyMesh);

    this.neck = new THREE.Group();
    this.neck.position.set(0.17, 0.25, 0);
    this.body.add(this.neck);
    const head = new THREE.Mesh(g.headG, m);
    head.position.set(0.03, 0.03, 0);
    this.neck.add(head);
    const beak = new THREE.Mesh(g.beakG, m);
    beak.position.set(0.19, 0.015, 0);
    this.neck.add(beak);
    for (const z of [-0.105, 0.105]) {
      const e = new THREE.Mesh(g.eyeG, m);
      e.position.set(0.1, 0.06, z);
      this.neck.add(e);
    }
    if (g.crestG) this.neck.add(new THREE.Mesh(g.crestG, m));

    this.tail = new THREE.Group();
    this.tail.position.set(-0.21, 0.1, 0);
    this.tail.add(new THREE.Mesh(g.tailG, m));
    this.body.add(this.tail);

    this.wings = [];
    for (const side of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'ZYX';
      shoulder.position.set(0.04, 0.21, 0.125 * side);
      shoulder.scale.z = side;
      shoulder.add(new THREE.Mesh(g.innerG, m));
      const elbow = new THREE.Group();
      elbow.rotation.order = 'ZYX';
      elbow.position.set(0, 0, 0.16 * (sp.wingLen || 1));
      elbow.add(new THREE.Mesh(g.outerG, m));
      shoulder.add(elbow);
      this.body.add(shoulder);
      this.wings.push({ shoulder, elbow });
    }
  }

  // p: { pitch, flap, flapOuter, fold, sweep, headYaw, headPitch, tail, tailSpread, legs, crouch, fluff, wingLift }
  pose(p) {
    this.tilt.rotation.z = p.pitch;
    this.tilt.position.y = 0.1 - p.crouch * 0.04;
    const fl = p.fluff;
    this.body.scale.set(fl, fl, fl);
    this.neck.rotation.set(p.headRoll || 0, p.headYaw, p.headPitch, 'YZX');
    this.tail.rotation.z = p.tail;
    this.tail.scale.z = p.tailSpread;

    const fold = p.fold;
    const sx = THREE.MathUtils.lerp(p.flap, -1.42, fold);
    const sz = THREE.MathUtils.lerp(p.sweep, 1.75, fold);
    const ox = THREE.MathUtils.lerp(p.flapOuter, 0.0, fold);
    const oz = THREE.MathUtils.lerp(0, 0.12, fold);
    for (let i = 0; i < 2; i++) {
      const lift = i === 0 ? p.wingLift || 0 : 0;
      this.wings[i].shoulder.rotation.set(sx - lift, 0, sz - lift * 0.8);
      this.wings[i].elbow.rotation.set(ox, 0, oz);
    }

    // legs: 0 tucked back, 1 straight down, 2 reaching forward
    const l = p.legs;
    if (l <= 1) {
      this.legs.rotation.z = THREE.MathUtils.lerp(2.0, 0, l);
      this.legs.scale.y = THREE.MathUtils.lerp(0.55, 1, l);
    } else {
      this.legs.rotation.z = THREE.MathUtils.lerp(0, -0.55, l - 1);
      this.legs.scale.y = 1;
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Curves + easing
// ---------------------------------------------------------------------------
export class Bezier {
  constructor(p0, p1, p2, p3) {
    this.p = [p0.clone(), p1.clone(), p2.clone(), p3.clone()];
  }
  at(t, out) {
    const [a, b, c, d] = this.p;
    const it = 1 - t;
    const w0 = it * it * it;
    const w1 = 3 * it * it * t;
    const w2 = 3 * it * t * t;
    const w3 = t * t * t;
    return out.set(
      a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
      a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
      a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3,
    );
  }
  tangent(t, out) {
    const [a, b, c, d] = this.p;
    const it = 1 - t;
    const w0 = -3 * it * it;
    const w1 = 3 * it * it - 6 * it * t;
    const w2 = 6 * it * t - 3 * t * t;
    const w3 = 3 * t * t;
    return out.set(
      a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
      a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
      a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3,
    );
  }
  length() {
    let len = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    this.at(0, a);
    for (let i = 1; i <= 16; i++) {
      this.at(i / 16, b);
      len += a.distanceTo(b);
      a.copy(b);
    }
    return len;
  }
}

const APPROACH_EXP = 1.8;
const EXIT_EXP = 1.6;
const easeApproach = (u) => 1 - Math.pow(1 - u, APPROACH_EXP);
const easeApproachD = (u) => APPROACH_EXP * Math.pow(1 - u, APPROACH_EXP - 1);
const easeExit = (u) => Math.pow(u, EXIT_EXP);
const easeExitD = (u) => EXIT_EXP * Math.pow(Math.max(u, 1e-4), EXIT_EXP - 1);

const smooth = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const rand = (a, b) => a + Math.random() * (b - a);

const FLARE = 0.42;
const SETTLE = 0.45;
const CROUCH = 0.16;
const PERCH_PITCH = 0.3;

// ---------------------------------------------------------------------------
// A single visitor: arrives along a curve, perches, idles, leaves.
// All motion is a function of time so a background tab can catch up.
// ---------------------------------------------------------------------------
export class Bird {
  constructor({ id, speciesId, worldScale, wire, x, facing, yaw, landTime, approach, spawnTime }) {
    this.id = id;
    this.speciesId = speciesId;
    this.sp = SPECIES[speciesId];
    this.rig = new BirdRig(speciesId, worldScale);
    this.size = this.sp.scale * worldScale;
    this.radius = 0.34 * this.size;
    this.wire = wire;
    this.x = x;
    this.facing = facing;
    this.perchYaw = yaw;
    this.landTime = landTime;
    this.spawnTime = spawnTime;
    this.approach = approach;
    this.departTime = null;
    this.exit = null;
    this.exitDur = 0;
    this.aborted = false;
    this.gone = false;
    this.loadOn = false;

    this.flapPhase = Math.random() * Math.PI * 2;
    this.flightClock = Math.random() * 3;
    this.state = {
      yaw: 0, pitch: 0, roll: 0,
      headYaw: 0, headPitch: 0, headRoll: 0,
      fold: 0, tail: 0.3, fluff: 1,
    };
    this.headTarget = { yaw: 0, pitch: 0, roll: 0 };
    this.idle = { next: landTime + rand(0.6, 2.0), kind: null, start: 0, dur: 0, a: 0, b: 0 };
    this.shuffle = null;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
  }

  isPerched(t) {
    return !this.aborted && this.landTime <= t && (this.departTime == null || t < this.departTime);
  }

  occupies(t) {
    // reserved from planning until shortly after leaving
    return !this.aborted && (this.departTime == null || this.departTime > t - 0.6);
  }

  scheduleDeparture(time, exit, exitDur) {
    this.departTime = time;
    this.exit = exit;
    this.exitDur = exitDur;
  }

  cancelDeparture() {
    this.departTime = null;
    this.exit = null;
  }

  abort(now, exit, exitDur) {
    // turn away mid-approach without landing (used when skipping songs)
    this.aborted = true;
    this.departTime = now;
    this.exit = exit;
    this.exitDur = exitDur;
    this.landTime = Infinity;
  }

  flapPose(p, dt, mode, intensity = 1) {
    const sp = this.sp;
    const hz = sp.flapHz * (mode === 'takeoff' ? 1.25 : 1);
    this.flightClock += dt;
    let flapping = true;
    let tuck = 0;
    if (mode === 'cruise') {
      if (sp.flight === 'bound') {
        const c = this.flightClock % 0.75;
        if (c > 0.48) { flapping = false; tuck = 0.85; }
      } else if (sp.flight === 'glide') {
        const c = this.flightClock % 1.5;
        if (c > 0.62) flapping = false;
      } else {
        const c = this.flightClock % 2.6;
        if (c > 2.1) flapping = false;
      }
    }
    if (flapping) this.flapPhase += dt * hz * Math.PI * 2;
    const s = Math.sin(this.flapPhase);
    p.flap = flapping ? -0.15 - 0.95 * intensity * s : -0.12;
    p.flapOuter = flapping ? -0.55 * intensity * Math.sin(this.flapPhase - 0.9) : 0.05;
    p.sweep = 0;
    p.fold = tuck;
  }

  update(now, dt, world) {
    const st = this.state;
    const p = {
      pitch: PERCH_PITCH, flap: 0, flapOuter: 0, fold: 1, sweep: 0,
      headYaw: st.headYaw, headPitch: st.headPitch, headRoll: st.headRoll,
      tail: 0.3, tailSpread: 1, legs: 1, crouch: 0, fluff: 1, wingLift: 0,
    };
    let rootYaw = this.perchYaw;
    let rootPitch = 0;
    let rootRoll = 0;
    this.prevPos.copy(this.pos);

    if (now < this.landTime && !this.aborted) {
      // ---------------- incoming
      const total = this.landTime - this.spawnTime;
      const u = THREE.MathUtils.clamp((now - this.spawnTime) / total, 0, 1);
      // keep the end of the curve glued to the (moving) wire
      this.approach.p[3].set(this.x, world.wireY(this.wire, this.x), 0);
      const s = easeApproach(u);
      this.approach.at(s, this.pos);
      this.approach.tangent(s, this.vel).multiplyScalar(easeApproachD(u) / total);
      const remaining = this.landTime - now;
      this.lookAhead();
      const speedH = Math.hypot(this.vel.x, this.vel.z);
      const flightYaw = Math.atan2(-this.vel.z, this.vel.x);
      const flightPitch = THREE.MathUtils.clamp(Math.atan2(this.vel.y, speedH), -0.7, 0.7);
      if (remaining > FLARE) {
        this.flapPose(p, dt, remaining < 1.0 ? 'approach' : 'cruise');
        rootYaw = flightYaw;
        rootPitch = flightPitch;
        p.pitch = 0;
        p.legs = 0;
        p.tail = 0.05;
      } else {
        // flare: nose up, wings forward and beating, legs reaching
        const f = 1 - remaining / FLARE; // 0 → 1
        this.flapPhase += dt * this.sp.flapHz * 1.6 * Math.PI * 2;
        p.flap = -0.75 + 0.4 * Math.sin(this.flapPhase);
        p.flapOuter = -0.3 * Math.sin(this.flapPhase - 0.7);
        p.sweep = -0.5 * f;
        p.fold = 0;
        rootYaw = angleLerp(flightYaw, this.perchYaw, Math.min(1, f * 1.3));
        rootPitch = THREE.MathUtils.lerp(flightPitch, 0, f);
        p.pitch = THREE.MathUtils.lerp(0, 0.95, f);
        p.legs = 1 + f;
        p.tail = THREE.MathUtils.lerp(0.05, -0.2, f);
        p.tailSpread = 1 + 0.6 * f;
      }
      this.applyRoot(rootYaw, rootPitch, rootRoll, dt, true);
    } else if (this.departTime == null || now < this.departTime - CROUCH) {
      // ---------------- perched
      const sinceLand = now - this.landTime;
      this.updateIdle(now, dt, world, p);
      const y = world.wireY(this.wire, this.x);
      this.pos.set(this.x, y, 0);
      if (this.hop) {
        const h = (now - this.hop.start) / this.hop.dur;
        if (h >= 1) this.hop = null;
        else this.pos.y += Math.sin(h * Math.PI) * this.hop.height;
      }
      if (sinceLand < SETTLE) {
        const k = sinceLand / SETTLE;
        const e = 1 - Math.pow(1 - k, 3);
        p.fold = e;
        p.flap = -0.75 * (1 - e);
        p.sweep = -0.5 * (1 - e);
        p.pitch = THREE.MathUtils.lerp(0.95, PERCH_PITCH, e) + Math.sin(k * Math.PI * 2.5) * 0.12 * (1 - k);
        p.legs = 1;
        p.tailSpread = 1 + 0.6 * (1 - e);
        p.tail = THREE.MathUtils.lerp(-0.2, 0.3, e);
      }
      if (world.rain > 0.3) p.fluff = 1 + 0.06 * Math.min(1, world.rain);
      this.applyRoot(this.perchYaw, 0, 0, dt, false);
    } else if (now < this.departTime && !this.aborted) {
      // ---------------- crouch before take-off
      const k = 1 - (this.departTime - now) / CROUCH;
      this.pos.set(this.x, world.wireY(this.wire, this.x), 0);
      p.crouch = k;
      p.pitch = PERCH_PITCH - 0.25 * k;
      p.tail = 0.3 - 0.4 * k;
      p.fold = 1 - 0.25 * k;
      this.lookAhead();
      this.applyRoot(this.perchYaw, 0, 0, dt, false);
    } else {
      // ---------------- leaving
      const u = THREE.MathUtils.clamp((now - this.departTime) / this.exitDur, 0, 1);
      if (u >= 1 || !this.exit) {
        this.gone = true;
        return;
      }
      if (!this.exitStarted) {
        this.exitStarted = true;
        if (!this.aborted) this.exit.p[0].set(this.x, world.wireY(this.wire, this.x), 0);
      }
      const s = easeExit(u);
      this.exit.at(s, this.pos);
      this.exit.tangent(s, this.vel).multiplyScalar(easeExitD(u) / this.exitDur);
      const since = now - this.departTime;
      this.lookAhead();
      this.flapPose(p, dt, since < 0.6 ? 'takeoff' : 'cruise', since < 0.6 ? 1.1 : 1);
      const speedH = Math.hypot(this.vel.x, this.vel.z);
      const fy = Math.atan2(-this.vel.z, this.vel.x);
      const fp = THREE.MathUtils.clamp(Math.atan2(this.vel.y, speedH), -0.7, 0.8);
      const k = Math.min(1, since / 0.25);
      rootYaw = angleLerp(this.perchYaw, fy, k);
      rootPitch = fp * k;
      p.pitch = PERCH_PITCH * (1 - k);
      p.legs = since < 0.3 ? 1 : Math.max(0, 1 - (since - 0.3) * 4);
      p.tail = 0.05;
      this.applyRoot(rootYaw, rootPitch, 0, dt, true);
    }

    st.headYaw = smooth(st.headYaw, this.headTarget.yaw, 22, dt);
    st.headPitch = smooth(st.headPitch, this.headTarget.pitch, 18, dt);
    st.headRoll = smooth(st.headRoll, this.headTarget.roll, 18, dt);
    p.headYaw = st.headYaw;
    p.headPitch = st.headPitch;
    p.headRoll = st.headRoll;
    this.rig.root.position.copy(this.pos);
    this.rig.pose(p);
  }

  lookAhead() {
    this.headTarget.yaw = 0;
    this.headTarget.pitch = 0;
    this.headTarget.roll = 0;
  }

  applyRoot(yaw, pitch, roll, dt, flying) {
    const st = this.state;
    if (flying) {
      // bank into turns
      const next = angleLerp(st.yaw, yaw, 1 - Math.exp(-14 * dt));
      const rate = angleLerp(0, next - st.yaw, 1) / Math.max(dt, 1e-3);
      roll = THREE.MathUtils.clamp(-rate * 0.3, -0.75, 0.75);
      st.yaw = next;
      st.pitch = smooth(st.pitch, pitch, 12, dt);
      st.roll = smooth(st.roll, roll, 6, dt);
    } else {
      st.yaw = angleLerp(st.yaw, yaw, 1 - Math.exp(-20 * dt));
      st.pitch = smooth(st.pitch, pitch, 16, dt);
      st.roll = smooth(st.roll, 0, 10, dt);
    }
    this.rig.root.rotation.set(st.roll, st.yaw, st.pitch);
  }

  updateIdle(now, dt, world, p) {
    const id = this.idle;
    if (now - this.landTime < SETTLE) return;
    if (id.kind && now > id.start + id.dur) {
      id.kind = null;
      this.headTarget.roll = 0;
    }
    if (!id.kind && now > id.next) {
      const r = Math.random();
      id.start = now;
      if (r < 0.42) {
        id.kind = 'look';
        id.dur = rand(0.4, 2.2);
        // birds look around in quick snaps; often toward the camera
        this.headTarget.yaw = rand(-1.3, 1.3) * (Math.random() < 0.3 ? 0.3 : 1);
        this.headTarget.pitch = rand(-0.25, 0.35);
      } else if (r < 0.55) {
        id.kind = 'tilt';
        id.dur = rand(0.5, 1.2);
        this.headTarget.roll = rand(-0.5, 0.5);
        this.headTarget.yaw = rand(-0.9, 0.9);
      } else if (r < 0.66) {
        id.kind = 'preen';
        id.dur = rand(0.9, 1.8);
        id.a = Math.random() < 0.5 ? 1 : -1;
      } else if (r < 0.76) {
        id.kind = 'flick';
        id.dur = 0.35;
      } else if (r < 0.84) {
        id.kind = 'fluff';
        id.dur = 0.8;
      } else if (r < 0.9) {
        id.kind = 'stretch';
        id.dur = 0.9;
      } else if (r < 0.95 && world.canTurn(this, now)) {
        id.kind = 'turn';
        id.dur = 0.3;
        this.hop = { start: now, dur: 0.24, height: 0.12 * this.size };
        this.facing *= -1;
        this.perchYaw = this.facing > 0 ? -Math.abs(rand(0, 0.5)) : Math.PI + Math.abs(rand(0, 0.5));
      } else {
        const dx = (Math.random() < 0.5 ? -1 : 1) * rand(0.15, 0.3) * this.size;
        if (world.canShuffle(this, this.x + dx, now)) {
          id.kind = 'shuffle';
          id.dur = 0.4;
          id.a = this.x;
          id.b = this.x + dx;
          this.hop = { start: now, dur: 0.18, height: 0.06 * this.size };
          world.moveLoad(this, id.b);
        } else {
          id.kind = 'look';
          id.dur = 0.8;
          this.headTarget.yaw = rand(-1, 1);
        }
      }
      id.next = now + id.dur + rand(0.4, 3.2);
    }

    switch (id.kind) {
      case 'preen': {
        const k = (now - id.start) / id.dur;
        const w = Math.sin(Math.min(1, k) * Math.PI);
        this.headTarget.yaw = 2.3 * id.a * w;
        this.headTarget.pitch = -0.5 * w;
        p.wingLift = 0.12 * w;
        break;
      }
      case 'flick': {
        const k = (now - id.start) / id.dur;
        p.tail = 0.3 - 0.45 * Math.sin(Math.min(1, k) * Math.PI);
        break;
      }
      case 'fluff': {
        const k = (now - id.start) / id.dur;
        p.fluff = 1 + 0.12 * Math.sin(Math.min(1, k) * Math.PI);
        break;
      }
      case 'stretch': {
        const k = (now - id.start) / id.dur;
        const w = Math.sin(Math.min(1, k) * Math.PI);
        p.wingLift = 0.6 * w;
        p.tailSpread = 1 + 0.5 * w;
        break;
      }
      case 'shuffle': {
        const k = Math.min(1, (now - id.start) / id.dur);
        this.x = THREE.MathUtils.lerp(id.a, id.b, k * k * (3 - 2 * k));
        break;
      }
      default:
        break;
    }
  }

  dispose() {
    this.rig.dispose();
  }
}

export { rand };
