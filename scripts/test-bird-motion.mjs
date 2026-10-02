import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Bird, Bezier, BIRD_RADIUS } from '../src/world/bird.js';
import { SPECIES } from '../src/world/species.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
const curve = (points) => new Bezier(...points.map((p) => new THREE.Vector3(...p)));
let clock = 0;
const loads = [];
const world = {
  rain: 0,
  wireY: () => 0.1 * Math.sin(clock * 1.3),
  canTurn: () => true,
  canShuffle: () => true,
  moveLoad: (bird, x) => loads.push([bird.id, x]),
};
function visitor(speciesId) {
  const bird = new Bird({
    id: speciesId, speciesId, worldScale: 0.7, wire: 0, x: 1, facing: 1, yaw: -0.2,
    landTime: 3, spawnTime: 0,
    approach: curve([[-6, 4, -3], [-3, 2, -1], [0, 1, 0], [1, 0, 0]]),
  });
  bird.idle.next = Infinity;
  const pose = bird.rig.pose.bind(bird.rig);
  bird.rig.pose = (p) => { bird.lastPose = { ...p }; pose(p); };
  return bird;
}
function advance(bird, now, dt = 1 / 120) {
  clock = now;
  bird.update(now, dt, world);
  bird.rig.root.updateMatrixWorld(true);
  bird.rig.root.traverse((obj) => assert.ok(obj.matrixWorld.elements.every(Number.isFinite), `${bird.speciesId} finite transform at ${now}`));
  if (bird.lastPose) assert.ok(Object.values(bird.lastPose).every(Number.isFinite), `${bird.speciesId} finite pose at ${now}`);
}
const exitCurve = () => curve([[1, 0, 0], [2, 1, 0], [4, 3, -1], [8, 5, -4]]);

for (const speciesId of Object.keys(SPECIES)) {
  const bird = visitor(speciesId);
  bird.loadOn = true;
  near(bird.radius, BIRD_RADIUS * bird.size, 'consistent reservation radius');
  bird.scheduleDeparture(7, exitCurve(), 2);
  assert.equal(bird.isPerched(3 - 1e-6), false);
  assert.equal(bird.isPerched(3), true);
  assert.equal(bird.isPerched(7 - 1e-6), true);
  assert.equal(bird.isPerched(7), false);
  let previousFold = null;
  for (let i = 0; i <= 1080; i++) {
    const now = i / 120;
    advance(bird, now);
    if (previousFold != null && !bird.gone) assert.ok(Math.abs(bird.lastPose.fold - previousFold) < 0.26, `${speciesId} continuous wing folding at ${now}`);
    previousFold = bird.lastPose.fold;
    if (now === 3 || (now >= 4 && now <= 7)) {
      near(bird.pos.y, world.wireY(), `${speciesId} feet origin follows wire`);
      near(bird.pos.x, 1, `${speciesId} landing x`);
    }
    if (now >= 4 && now <= 6.5) {
      near(bird.lastPose.pitch, bird.motion.perchPitch, `${speciesId} resting posture`);
      near(bird.lastPose.fold, 1, `${speciesId} folded on perch`);
      near(bird.lastPose.headBob, 0, `${speciesId} no stationary bobbing`);
      for (const foot of bird.rig.feet) {
        const clutch = foot.localToWorld(new THREE.Vector3(.022, .008, 0));
        near(clutch.y, world.wireY(), `${speciesId} planted feet height`);
        near(clutch.z, 0, `${speciesId} planted feet centered on wire`);
      }
    }
  }
  assert.equal(bird.gone, true, `${speciesId} exit completes`);
  bird.dispose();

  // A tab that misses landing frames still lands at the right point with a
  // completely settled pose, rather than replaying an old animation.
  const resumed = visitor(speciesId);
  advance(resumed, 0.1);
  advance(resumed, 5, 4.9);
  near(resumed.lastPose.fold, 1, 'background resume settles');
  near(resumed.pos.y, world.wireY(), 'background resume follows wire');
  resumed.dispose();
}

const first = visitor('goldfinch');
const skipped = visitor('goldfinch');
skipped.flapPhase = first.flapPhase;
skipped.flightClock = first.flightClock;
for (let i = 0; i <= 120; i++) advance(first, i / 120);
advance(skipped, 1, 1);
for (const key of ['flap', 'flapOuter', 'fold', 'sweep']) near(first.lastPose[key], skipped.lastPose[key], `wing cycle independent of frame count: ${key}`);

const bounding = visitor('sparrow');
const steady = visitor('swallow');
let lowest = Infinity;
let highest = -Infinity;
for (let i = 60; i <= 240; i++) {
  const now = i / 120;
  for (const bird of [bounding, steady]) {
    advance(bird, now);
    const pathPosition = bird.approach.at(1 - (1 - now / 3) ** 1.8, new THREE.Vector3());
    const heave = bird.pos.y - pathPosition.y;
    if (bird === steady) near(heave, 0, 'steady flying swallow does not bound');
    else {
      lowest = Math.min(lowest, heave);
      highest = Math.max(highest, heave);
      assert.ok(Math.abs(heave) <= bird.size * 0.046, 'bounding stays close to the planned route');
    }
  }
}
assert.ok(lowest < -0.01 && highest > 0.01, 'bounding flight rises and falls through tucked intervals');

const pigeon = visitor('pigeon');
pigeon.loadOn = true;
pigeon.idle = { kind: 'shuffle', start: 4, dur: 0.8, next: Infinity, a: 1, b: 1.2, walking: true };
advance(pigeon, 4.1);
assert.ok(Math.abs(pigeon.lastPose.step) > 0.1, 'walking bird takes alternating steps');
assert.ok(Math.abs(pigeon.lastPose.headBob) > 0.001, 'pigeon head thrust accompanies steps');
advance(pigeon, 5.5, 1.4);
near(pigeon.x, 1.2, 'skipped shuffle completes at target');
near(loads.at(-1)[1], 1.2, 'wire load follows completed shuffle');
near(pigeon.lastPose.step, 0, 'feet stop after walking');
near(pigeon.lastPose.headBob, 0, 'head bob stops after walking');

const aborted = visitor('crow');
advance(aborted, 0.5);
const from = aborted.pos.clone();
const exit = new Bezier(from, from.clone().add(new THREE.Vector3(1, 1, 0)), new THREE.Vector3(5, 6, 0), new THREE.Vector3(8, 8, 0));
aborted.abort(0.5, exit, 2);
advance(aborted, 0.5);
near(aborted.pos.distanceTo(from), 0, 'abort remains at current flight position');
near(aborted.lastPose.legs, 0, 'airborne abort does not reach for a wire');
near(aborted.lastPose.crouch, 0, 'airborne abort does not crouch');
advance(aborted, 3, 2.5);
assert.equal(aborted.gone, true);
const missingExit = visitor('sparrow');
missingExit.abort(0, null, 0);
advance(missingExit, 0);
assert.equal(missingExit.gone, true, 'zero-duration abort is safe');

for (const bird of [first, skipped, bounding, steady, pigeon, aborted, missingExit]) bird.dispose();
console.log(`Bird motion verified: ${Object.keys(SPECIES).length} species, exact contact/departure, finite transforms, planted feet, smooth folding, background resume, walking and aborts.`);
