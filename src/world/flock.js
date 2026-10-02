import * as THREE from 'three';
import { Bird, Bezier, rand } from './bird.js';
import { SPECIES } from './species.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

export class Flock {
  constructor(parent, stage) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.stage = stage;
    this.birds = [];
    this.nextId = 1;
    this.rain = 0;
    this.onNote = null;
  }

  get lines() {
    return this.stage.lines;
  }

  get view() {
    return this.stage.view;
  }

  clear() {
    for (const b of this.birds) b.dispose();
    this.birds = [];
  }

  // ---------------------------------------------------------------- queries
  wireY(w, x) {
    return this.lines.y(w, x);
  }

  // how many birds the wires should hold on average
  targetPopulation() {
    const v = this.view;
    return Math.max(6, Math.min(26, Math.round((v.xMax - v.xMin) * v.wires * 0.13)));
  }

  // a scene shouldn't open on empty wires: seat some birds already settled
  populate(count, now, weights) {
    const v = this.view;
    let placed = 0;
    for (let i = 0; i < count * 6 && placed < count; i++) {
      const wire = Math.floor(Math.random() * v.wires);
      const x = rand(v.xMin + 0.8, v.xMax - 0.8);
      const speciesId = this.pickSpecies(weights, wire / Math.max(1, v.wires - 1));
      const r = 0.34 * SPECIES[speciesId].scale * v.birdScale;
      if (!this.isFree(wire, x, r, now)) continue;
      const bird = this.land({ wire, x, time: now - rand(3, 25), now: now - 40, speciesId });
      bird.loadOn = true;
      this.lines.setLoad(bird.id, wire, x, bird.size);
      placed++;
    }
  }

  population(t) {
    let n = 0;
    for (const b of this.birds) if (!b.aborted && b.landTime <= t + 0.01 && (b.departTime == null || b.departTime > t)) n++;
    return n;
  }

  // the bird the "playhead" should lift off this wire: oldest-looking one just ahead of it
  departCandidate(wire, px, t) {
    const v = this.view;
    const width = v.xMax - v.xMin;
    let best = null;
    let bestScore = Infinity;
    for (const b of this.birds) {
      if (b.wire !== wire || b.aborted || b.departTime != null) continue;
      if (b.landTime > t - 0.7) continue;
      const ahead = (((b.x - px) % width) + width) % width;
      const score = ahead + Math.random() * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }

  clearOfPoles(x, r) {
    for (const p of this.lines.poleXs) if (Math.abs(x - p) < 0.42 + r) return false;
    return true;
  }

  isFree(wire, x, r, t, ignore = null) {
    const v = this.view;
    if (x < v.xMin + 0.5 || x > v.xMax - 0.5) return false;
    if (!this.clearOfPoles(x, r)) return false;
    for (const b of this.birds) {
      if (b === ignore || b.wire !== wire || !b.occupies(t)) continue;
      if (Math.abs(b.x - x) < b.radius + r + 0.06) return false;
    }
    return true;
  }

  landingX(wire, px, t, r) {
    const steps = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];
    const jitter = rand(-0.12, 0.12);
    for (const s of steps) {
      const x = px + s + jitter;
      if (this.isFree(wire, x, r, t)) return x;
    }
    return null;
  }

  canTurn(bird, now) {
    return bird.departTime == null || bird.departTime - now > 1.2;
  }

  canShuffle(bird, x, now) {
    return this.canTurn(bird, now) && this.isFree(bird.wire, x, bird.radius, now, bird);
  }

  // switch every bird on screen to one kind (or back to the scene's mix)
  setKind(weights) {
    const v = this.view;
    for (const b of this.birds) {
      if (b.gone) continue;
      const id = this.pickSpecies(weights, b.wire / Math.max(1, v.wires - 1));
      if (id === b.speciesId && this.stage.birdKind !== 'mixed') continue;
      b.setSpecies(id, v.birdScale);
      if (b.loadOn) this.lines.setLoad(b.id, b.wire, b.x, b.size);
    }
  }

  // the wires moved (resize): keep each bird at the same place relative to the poles
  rescale(ratio, birdScale) {
    const v = this.view;
    for (const b of this.birds) {
      b.x *= ratio;
      if (b.departTime == null) b.x = Math.max(v.xMin + 0.5, Math.min(v.xMax - 0.5, b.x));
      b.size = b.sp.scale * birdScale;
      b.radius = 0.34 * b.size;
      b.rig.root.scale.setScalar(b.size);
    }
  }

  moveLoad(bird, x) {
    this.lines.setLoad(bird.id, bird.wire, x, bird.size);
  }

  pickSpecies(weights, pitchNorm) {
    const kind = this.stage.birdKind;
    if (kind && kind !== 'mixed' && SPECIES[kind]) return kind;
    const entries = Object.entries(weights);
    let total = 0;
    const ws = entries.map(([id, w]) => {
      const size = (SPECIES[id].scale - 0.8) / 0.8; // 0 small → 1 big
      const want = 1 - pitchNorm;
      const bias = Math.exp(-((size - want) ** 2) / 0.35);
      const v = w * (0.35 + bias);
      total += v;
      return v;
    });
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= ws[i];
      if (r <= 0) return entries[i][0];
    }
    return entries[0][0];
  }

  // ---------------------------------------------------------------- paths
  approachPath(target, facing, now, landTime) {
    const v = this.view;
    const avail = landTime - now;
    const styles = [
      ['side', 0.34],
      ['above', 0.28],
      ['deep', 0.24],
      ['camera', 0.14],
    ];
    let style = 'above';
    let r = Math.random();
    for (const [s, w] of styles) {
      r -= w;
      if (r <= 0) {
        style = s;
        break;
      }
    }
    const p0 = tmpA;
    if (style === 'side') {
      const fromX = facing > 0 ? v.xMin - 2.5 : v.xMax + 2.5;
      p0.set(fromX, target.y + rand(-0.5, 4), rand(-6, 4));
      if (Math.abs(fromX - target.x) > avail * 9) style = 'above';
    }
    if (style === 'above') p0.set(target.x - facing * rand(2, 7), v.topAt(0) + rand(1.5, 3), rand(-3, 3));
    if (style === 'deep') p0.set(target.x - facing * rand(3, 12), v.topAt(-28) + rand(1, 3), -28);
    if (style === 'camera') p0.set(target.x + rand(-4, 4), target.y + rand(-1.5, 2.5), v.camZ + 2.5);

    const p3 = target;
    const p2 = tmpB.set(target.x - facing * rand(1.4, 2.2), target.y + rand(0.9, 1.6), target.z + rand(-0.5, 0.5));
    const p1 = tmpC.copy(p0).lerp(p2, 0.4);
    p1.y += rand(-1, 1.5);
    const curve = new Bezier(p0, p1, p2, p3);
    const len = curve.length();
    const speed = rand(6.5, 9.5);
    const dur = THREE.MathUtils.clamp(len / speed, 1.4, Math.max(1.4, Math.min(3.6, avail)));
    return { curve, dur };
  }

  exitPath(from, facing) {
    const v = this.view;
    const r = Math.random();
    const p3 = tmpA;
    if (r < 0.33) p3.set(facing > 0 ? v.xMax + 3 : v.xMin - 3, from.y + rand(1, 5), rand(-6, 4));
    else if (r < 0.62) p3.set(from.x + facing * rand(1, 7), v.topAt(0) + 2.5, rand(-3, 2));
    else if (r < 0.86) p3.set(from.x + facing * rand(3, 12), v.topAt(-30) + 3, -30);
    else p3.set(from.x + rand(-3, 3), from.y + rand(-1, 2), v.camZ + 3);
    const p1 = tmpB.set(from.x + facing * rand(0.5, 1.0), from.y + rand(0.7, 1.2), from.z + rand(-0.3, 0.3));
    const p2 = tmpC.copy(p1).lerp(p3, 0.45);
    p2.y += rand(0, 1.5);
    const curve = new Bezier(from, p1, p2, p3);
    const dur = THREE.MathUtils.clamp(curve.length() / rand(6.5, 9), 1.4, 3.4);
    return { curve, dur };
  }

  // ---------------------------------------------------------------- actions
  land({ wire, x, time, now, speciesId }) {
    const facing = Math.random() < 0.5 ? 1 : -1;
    let yaw;
    const r = Math.random();
    if (r < 0.12) yaw = -Math.PI / 2 + rand(-0.25, 0.25); // facing the camera
    else if (r < 0.2) yaw = facing > 0 ? rand(0.1, 0.5) : Math.PI - rand(0.1, 0.5); // slightly away
    else yaw = facing > 0 ? -rand(0, 0.6) : Math.PI + rand(0, 0.6);

    const target = new THREE.Vector3(x, this.wireY(wire, x), 0);
    const { curve, dur } = this.approachPath(target, facing, now, time);
    const bird = new Bird({
      id: this.nextId++,
      speciesId,
      worldScale: this.view.birdScale,
      wire,
      x,
      facing,
      yaw,
      landTime: time,
      spawnTime: time - dur,
      approach: curve,
    });
    bird.rig.root.visible = false;
    this.group.add(bird.rig.root);
    this.birds.push(bird);
    return bird;
  }

  depart(bird, time) {
    const from = new THREE.Vector3(bird.x, this.wireY(bird.wire, bird.x), 0);
    const { curve, dur } = this.exitPath(from, bird.facing);
    bird.scheduleDeparture(time, curve, dur);
  }

  // used when skipping: anything not yet landed turns away silently
  abortFrom(time, now) {
    for (const b of this.birds) {
      if (b.aborted) continue;
      if (b.landTime > time) {
        const from = new THREE.Vector3();
        if (now >= b.spawnTime) {
          const total = b.landTime - b.spawnTime;
          const u = THREE.MathUtils.clamp((now - b.spawnTime) / total, 0, 1);
          b.approach.at(1 - Math.pow(1 - u, 1.8), from);
          const { curve, dur } = this.exitPath(from, -b.facing);
          b.abort(now, curve, dur);
        } else {
          b.abort(now, null, 0);
          b.gone = true;
        }
      } else if (b.departTime != null && b.departTime > time) {
        b.cancelDeparture();
      }
    }
  }

  // drop birds whose exit flight is over, even if no frames are being drawn
  // (a hidden tab keeps the music running but pauses rendering)
  prune(now) {
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      const done = b.gone || (b.departTime != null && now > b.departTime + b.exitDur + 0.2);
      if (!done) continue;
      if (b.loadOn) this.lines.removeLoad(b.id, b.wire);
      b.dispose();
      this.birds.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- frame
  update(now, dt, rain) {
    this.rain = rain;
    const lines = this.lines;
    for (const b of this.birds) {
      b.rig.root.visible = now >= b.spawnTime;
      const perched = b.isPerched(now);
      if (perched !== b.loadOn) {
        b.loadOn = perched;
        // these transitions happen exactly when the bird's note sounds
        if (perched) {
          lines.setLoad(b.id, b.wire, b.x, b.size);
          lines.pluck(b.wire, b.x, -0.13 * b.size);
          this.onNote?.(b, 'land', now);
        } else {
          lines.removeLoad(b.id, b.wire);
          if (!b.aborted) {
            lines.pluck(b.wire, b.x, 0.11 * b.size);
            this.onNote?.(b, 'depart', now);
          }
        }
      }
      if (now >= b.spawnTime) b.update(now, Math.min(dt, 0.1), this);
    }
    this.prune(now);
  }
}
