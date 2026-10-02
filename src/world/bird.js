import * as THREE from 'three';
import { SPECIES } from './species.js';
import { BirdRig } from './bird-rig.js';
export { BirdRig, birdMaterial, SILHOUETTE, setBirdSilhouette } from './bird-rig.js';

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
const easeApproach = (u) => 1 - Math.pow(1 - u, APPROACH_EXP);
const easeApproachD = (u) => APPROACH_EXP * Math.pow(1 - u, APPROACH_EXP - 1);
// The legs provide an initial push; the first flight frame is not motionless.
const easeExit = (u) => 0.22 * u + 0.78 * Math.pow(u, 1.6);
const easeExitD = (u) => 0.22 + 1.248 * Math.pow(u, 0.6);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const smooth = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const rand = (a, b) => a + Math.random() * (b - a);

export const BIRD_RADIUS = 0.46;
const DEFAULT_MOTION = {
  perchPitch: 0.28, tailAngle: 0.22, idlePace: 1, flapAmplitude: 0.9,
  flareTime: 0.4, settleTime: 0.42, launchTime: 0.42,
  boundPeriod: 0.78, boundDuty: 0.65, glidePeriod: 2.4, glideDuty: 0.45,
  headSpeed: 11, hopHeight: 0.045,
};

// Smooth the entry and exit of each coasting interval, including the cycle wrap.
function flightActivity(time, period, duty) {
  const phase = ((time / period) % 1 + 1) % 1;
  const edge = Math.min(0.1, duty * 0.2, (1 - duty) * 0.3);
  if (phase < duty - edge) return 1;
  if (phase < duty + edge) return 1 - smoothstep((phase - duty + edge) / (2 * edge));
  if (phase > 1 - 2 * edge) return smoothstep((phase - 1 + 2 * edge) / (2 * edge));
  return 0;
}

// A visitor's path and wing cycle use absolute time, so resuming a background
// tab keeps the visual landing and departure on the music's original timeline.
export class Bird {
  constructor({ id, speciesId, worldScale, wire, x, facing, yaw, landTime, approach, spawnTime }) {
    this.id = id;
    this.speciesId = speciesId;
    this.sp = SPECIES[speciesId];
    this.motion = { ...DEFAULT_MOTION, ...this.sp.motion };
    this.rig = new BirdRig(speciesId, worldScale);
    this.size = this.sp.scale * worldScale;
    this.radius = BIRD_RADIUS * this.size;
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
    this.exitStarted = false;
    this.aborted = false;
    this.gone = false;
    this.loadOn = false;
    this.flapPhase = Math.random() * Math.PI * 2;
    this.flightClock = Math.random() * 3;
    this.state = { yaw, pitch: 0, roll: 0, headYaw: 0, headPitch: 0, headRoll: 0 };
    this.headTarget = { yaw: 0, pitch: 0, roll: 0 };
    this.idle = { next: landTime + rand(0.8, 2.5) / this.motion.idlePace, kind: null, start: 0, dur: 0, a: 0, b: 0 };
    this.hop = null;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
  }

  isPerched(t) {
    return !this.aborted && this.landTime <= t && (this.departTime == null || t < this.departTime);
  }

  occupies(t) {
    return !this.aborted && (this.departTime == null || this.departTime > t - 0.6);
  }

  setSpecies(id, worldScale) {
    const old = this.rig;
    this.speciesId = id;
    this.sp = SPECIES[id];
    this.motion = { ...DEFAULT_MOTION, ...this.sp.motion };
    this.rig = new BirdRig(id, worldScale);
    this.size = this.sp.scale * worldScale;
    this.radius = BIRD_RADIUS * this.size;
    this.rig.root.position.copy(old.root.position);
    this.rig.root.rotation.copy(old.root.rotation);
    this.rig.root.visible = old.root.visible;
    old.root.parent?.add(this.rig.root);
    old.dispose();
  }

  scheduleDeparture(time, exit, exitDur) {
    this.departTime = time;
    this.exit = exit;
    this.exitDur = exitDur;
    this.exitStarted = false;
  }

  cancelDeparture() {
    this.departTime = null;
    this.exit = null;
    this.exitStarted = false;
  }

  abort(now, exit, exitDur) {
    this.aborted = true;
    this.scheduleDeparture(now, exit, exitDur);
    this.landTime = Infinity;
    this.hop = null;
  }

  flapPose(p, now, mode, intensity = 1, cruiseBlend = 1) {
    const m = this.motion;
    const exiting = this.departTime != null && now >= this.departTime;
    const elapsed = Math.max(0, now - (exiting ? this.departTime : this.spawnTime));
    // A short, stronger launch effort eases into the same continuous wing cycle.
    const boost = exiting && !this.aborted ? 0.16 * m.launchTime * (1 - Math.exp(-elapsed / m.launchTime)) : 0;
    const phase = (this.flapPhase / (Math.PI * 2) + (elapsed + boost) * this.sp.flapHz) % 1;
    const power = phase < 0.43;
    const stroke = power ? phase / 0.43 : (phase - 0.43) / 0.57;
    const wing = power ? -Math.cos(stroke * Math.PI) : Math.cos(stroke * Math.PI);
    const recovery = power ? 0 : Math.sin(stroke * Math.PI);
    let activity = 1;
    let heave = 0;
    if (mode === 'cruise') {
      const clock = elapsed + this.flightClock;
      if (this.sp.flight === 'bound') {
        activity = flightActivity(clock, m.boundPeriod, m.boundDuty);
        const phase = ((clock / m.boundPeriod) % 1 + 1) % 1;
        // Powered beats lift the body into an arc; the tucked interval falls
        // gently out of it. Both joins have zero slope, avoiding a sawtooth bob.
        const arc = phase < m.boundDuty
          ? -Math.cos(Math.PI * phase / m.boundDuty)
          : Math.cos(Math.PI * (phase - m.boundDuty) / (1 - m.boundDuty));
        heave = arc * this.size * 0.045 * cruiseBlend;
      }
      if (this.sp.flight === 'glide') activity = flightActivity(clock, m.glidePeriod, m.glideDuty);
    }
    activity = lerp(1, activity, cruiseBlend);
    p.flap = lerp(-0.08, -0.1 + m.flapAmplitude * intensity * wing, activity);
    // The wrist flexes on recovery while the power stroke presents the full wing.
    p.flapOuter = lerp(0.06, -0.16 * Math.sin(stroke * Math.PI) + 0.58 * recovery, activity);
    p.sweep = 0.14 * recovery * activity;
    p.fold = this.sp.flight === 'bound' ? (1 - activity) * 0.94 : 0;
    p.fold += 0.07 * recovery * activity;
    return { activity, wing, heave };
  }

  update(now, dt, world) {
    if (this.gone) return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const m = this.motion;
    const crouchTime = clamp(m.launchTime, 0.1, 0.25);
    const launchBlendTime = clamp(m.launchTime * 2, 0.25, 0.55);
    const landingPitch = Math.min(0.76, m.perchPitch + 0.32);
    const st = this.state;
    const p = {
      pitch: m.perchPitch, flap: 0, flapOuter: 0, fold: 1, sweep: 0,
      headYaw: st.headYaw, headPitch: st.headPitch, headRoll: st.headRoll,
      headBob: 0, step: 0, tail: m.tailAngle, tailSpread: 1,
      legs: 1, crouch: 0, fluff: 1, wingLift: 0,
    };
    this.prevPos.copy(this.pos);

    if (now < this.landTime && !this.aborted) {
      const total = Math.max(0.001, this.landTime - this.spawnTime);
      const u = clamp((now - this.spawnTime) / total, 0, 1);
      this.approach.p[3].set(this.x, world.wireY(this.wire, this.x), 0);
      const s = easeApproach(u);
      this.approach.at(s, this.pos);
      this.approach.tangent(s, this.vel).multiplyScalar(easeApproachD(u) / total);
      const remaining = this.landTime - now;
      const flareTime = Math.min(m.flareTime, total * 0.7);
      const f = smoothstep(1 - remaining / flareTime);
      this.lookAhead();
      const speedH = Math.hypot(this.vel.x, this.vel.z);
      const flightYaw = speedH > 1e-6 ? Math.atan2(-this.vel.z, this.vel.x) : this.perchYaw;
      const flightPitch = clamp(Math.atan2(this.vel.y, speedH), -0.65, 0.65);
      const flight = this.flapPose(p, now, 'cruise', 1, smoothstep((remaining - flareTime) / 0.5));
      this.pos.y += flight.heave * smoothstep((now - this.spawnTime) / 0.35);
      // A pitched body, fanned tail and open wings shed speed. The feet extend
      // during the flare, then meet the moving wire at precisely landTime.
      const brake = smoothstep((f - 0.3) / 0.7);
      p.flap = lerp(p.flap, -0.7, brake);
      p.flapOuter = lerp(p.flapOuter, 0.15, brake);
      p.sweep = lerp(p.sweep, -0.28, f);
      p.fold *= 1 - f;
      p.pitch = landingPitch * f;
      p.legs = smoothstep(f * 1.6) + 0.32 * Math.sin(f * Math.PI);
      p.tail = lerp(0.04, m.tailAngle - 0.22, f);
      p.tailSpread = 1 + 0.28 * f;
      this.applyRoot(angleLerp(flightYaw, this.perchYaw, f), flightPitch * (1 - f), 0, dt, true, 1 - f);
    } else if (!this.aborted && (this.departTime == null || now < this.departTime - crouchTime)) {
      const sinceLand = now - this.landTime;
      this.updateIdle(now, world, p);
      this.pos.set(this.x, world.wireY(this.wire, this.x), 0);
      if (this.hop) {
        const h = (now - this.hop.start) / this.hop.dur;
        if (h >= 1) this.hop = null;
        else this.pos.y += Math.sin(clamp(h, 0, 1) * Math.PI) * this.hop.height;
      }
      if (sinceLand < m.settleTime) {
        const k = clamp(sinceLand / m.settleTime, 0, 1);
        const e = smoothstep(k);
        p.fold = e;
        p.flap = -0.7 * (1 - e);
        p.flapOuter = 0.15 * (1 - e);
        p.sweep = -0.28 * (1 - e);
        p.pitch = lerp(landingPitch, m.perchPitch, e);
        p.crouch = Math.sin(k * Math.PI) * 0.6;
        p.tailSpread = 1 + 0.28 * (1 - e);
        p.tail = lerp(m.tailAngle - 0.22, m.tailAngle, e);
      }
      if (world.rain > 0.3) p.fluff = Math.max(p.fluff, 1 + 0.04 * Math.min(1, world.rain));
      this.applyRoot(this.perchYaw, 0, 0, dt, false);
    } else if (!this.aborted && now < this.departTime) {
      const k = smoothstep(1 - (this.departTime - now) / crouchTime);
      this.finishShuffle(world);
      this.hop = null;
      this.pos.set(this.x, world.wireY(this.wire, this.x), 0);
      p.crouch = k * 0.8;
      p.pitch = m.perchPitch - 0.16 * k;
      p.tail = m.tailAngle - 0.18 * k;
      p.fold = 1 - 0.45 * k;
      p.flap = -0.25;
      this.lookAhead();
      this.applyRoot(this.perchYaw, 0, 0, dt, false);
    } else {
      if (!this.exit || this.exitDur <= 0 || now >= this.departTime + this.exitDur) {
        this.gone = true;
        return;
      }
      const since = Math.max(0, now - this.departTime);
      const u = clamp(since / this.exitDur, 0, 1);
      if (!this.exitStarted) {
        this.exitStarted = true;
        this.departureYaw = st.yaw;
        if (!this.aborted) {
          this.finishShuffle(world);
          this.exit.p[0].set(this.x, world.wireY(this.wire, this.x), 0);
        }
      }
      const s = this.aborted ? u : easeExit(u);
      this.exit.at(s, this.pos);
      this.exit.tangent(s, this.vel).multiplyScalar((this.aborted ? 1 : easeExitD(u)) / this.exitDur);
      this.lookAhead();
      const launchEffort = 1 + 0.08 * (1 - smoothstep(since / launchBlendTime));
      const flight = this.flapPose(p, now, 'cruise', launchEffort, this.aborted ? 1 : smoothstep((since - launchBlendTime) / 0.5));
      this.pos.y += flight.heave * smoothstep(since / 0.35);
      const speedH = Math.hypot(this.vel.x, this.vel.z);
      const yaw = speedH > 1e-6 ? Math.atan2(-this.vel.z, this.vel.x) : st.yaw;
      const pitch = clamp(Math.atan2(this.vel.y, speedH), -0.65, 0.8);
      const k = this.aborted ? 1 : smoothstep(since / launchBlendTime);
      p.pitch = (m.perchPitch - 0.16) * (1 - k);
      p.crouch = this.aborted ? 0 : 0.8 * (1 - smoothstep(since / (launchBlendTime * 0.35)));
      p.fold = lerp(0.55, p.fold, smoothstep(k * 2));
      p.flap = lerp(-0.25, p.flap, smoothstep(k * 2));
      p.legs = this.aborted ? 0 : 1 - smoothstep((since - launchBlendTime * 0.2) / (launchBlendTime * 0.8));
      p.tail = lerp(m.tailAngle - 0.18, 0.04, k);
      this.applyRoot(angleLerp(this.departureYaw, yaw, k), pitch * k, 0, dt, true, k);
    }

    // Short deliberate head turns settle into a held view. Larger species use
    // slower rates and longer pauses instead of continual idle oscillation.
    const headRate = m.headSpeed * 1.8;
    st.headYaw = smooth(st.headYaw, this.headTarget.yaw, headRate, dt);
    st.headPitch = smooth(st.headPitch, this.headTarget.pitch, headRate, dt);
    st.headRoll = smooth(st.headRoll, this.headTarget.roll, headRate, dt);
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

  applyRoot(yaw, pitch, roll, dt, flying, bankWeight = 1) {
    const st = this.state;
    if (flying) {
      const next = angleLerp(st.yaw, yaw, 1 - Math.exp(-14 * dt));
      const rate = angleLerp(0, next - st.yaw, 1) / Math.max(dt, 1e-3);
      roll += clamp(-rate * 0.15, -0.52, 0.52) * bankWeight;
      st.yaw = next;
      st.pitch = smooth(st.pitch, pitch, 14, dt);
      st.roll = smooth(st.roll, roll, 10, dt);
    } else {
      st.yaw = angleLerp(st.yaw, yaw, 1 - Math.exp(-20 * dt));
      // Feet are the rig origin: no residual flight bank should tilt them off
      // the wire. Landing impact is absorbed by the torso and legs above it.
      st.pitch = 0;
      st.roll = 0;
    }
    this.rig.root.rotation.set(st.roll, st.yaw, st.pitch);
  }

  finishShuffle(world) {
    if (this.idle.kind !== 'shuffle') return;
    this.x = this.idle.b;
    if (this.loadOn) world.moveLoad(this, this.x);
    this.idle.kind = null;
  }

  updateIdle(now, world, p) {
    const m = this.motion;
    const id = this.idle;
    if (now - this.landTime < m.settleTime) return;
    if (id.kind && now >= id.start + id.dur) {
      this.finishShuffle(world);
      id.kind = null;
      this.headTarget.roll = 0;
    }
    if (!id.kind && now >= id.next) {
      const r = Math.random();
      id.start = now;
      if (r < 0.63) {
        id.kind = 'look';
        id.dur = rand(0.5, 1.6) / m.idlePace;
        this.headTarget.yaw = rand(-1.05, 1.05);
        this.headTarget.pitch = rand(-0.18, 0.23);
      } else if (r < 0.72) {
        id.kind = 'tilt';
        id.dur = rand(0.5, 1.1) / m.idlePace;
        this.headTarget.roll = rand(-0.27, 0.27);
        this.headTarget.yaw = rand(-0.8, 0.8);
      } else if (r < 0.8) {
        id.kind = 'preen';
        id.dur = rand(1.0, 1.65) / Math.sqrt(m.idlePace);
        id.a = Math.random() < 0.5 ? 1 : -1;
      } else if (r < 0.87) {
        id.kind = 'flick';
        id.dur = 0.28 / Math.sqrt(m.idlePace);
      } else if (r < 0.91) {
        id.kind = 'fluff';
        id.dur = 0.7;
      } else if (r < 0.935) {
        id.kind = 'stretch';
        id.dur = 1.15;
      } else if (r < 0.965 && world.canTurn(this, now)) {
        id.kind = 'turn';
        id.dur = 0.32 / Math.sqrt(m.idlePace);
        this.hop = { start: now, dur: id.dur, height: m.hopHeight * this.size };
        this.facing *= -1;
        this.perchYaw = this.facing > 0 ? -Math.abs(rand(0, 0.4)) : Math.PI + Math.abs(rand(0, 0.4));
      } else {
        const dx = (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 0.2) * this.size;
        if (world.canShuffle(this, this.x + dx, now)) {
          id.kind = 'shuffle';
          id.walking = ['pigeon', 'crow', 'gull', 'starling'].includes(this.speciesId);
          id.dur = (id.walking ? 0.64 : 0.3) / Math.sqrt(m.idlePace);
          id.a = this.x;
          id.b = this.x + dx;
          if (!id.walking) this.hop = { start: now, dur: id.dur, height: m.hopHeight * this.size };
        } else {
          id.kind = 'look';
          id.dur = 0.7;
          this.headTarget.yaw = rand(-0.8, 0.8);
        }
      }
      id.next = now + id.dur + rand(1.1, 4.4) / m.idlePace;
    }

    const k = id.kind ? clamp((now - id.start) / id.dur, 0, 1) : 0;
    const w = Math.sin(k * Math.PI);
    switch (id.kind) {
      case 'preen':
        this.headTarget.yaw = 1.85 * id.a * w;
        this.headTarget.pitch = -0.3 * w;
        p.wingLift = 0.06 * w;
        break;
      case 'flick':
        p.tail = m.tailAngle - 0.19 * w;
        break;
      case 'fluff':
        p.fluff = 1 + 0.045 * w;
        break;
      case 'stretch':
        p.wingLift = 0.32 * w;
        p.tailSpread = 1 + 0.15 * w;
        break;
      case 'shuffle': {
        this.x = lerp(id.a, id.b, smoothstep(k));
        if (this.loadOn) world.moveLoad(this, this.x);
        if (id.walking) {
          p.step = Math.sin(k * Math.PI * 4) * w;
          if (this.speciesId === 'pigeon') {
            const phase = (k * 2) % 1;
            const thrust = phase < 0.18 ? lerp(-1, 1, smoothstep(phase / 0.18)) : 1 - 2 * (phase - 0.18) / 0.82;
            p.headBob = 0.025 * thrust * w;
          }
        }
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
