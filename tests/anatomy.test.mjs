import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BirdRig } from '../src/world/bird-rig.js';
import { ANATOMY } from '../src/world/bird-anatomy.js';
import { SPECIES } from '../src/world/species.js';
import { MAX_PERCHED_HEIGHT } from '../src/world/stage.js';

function restingPose(sp, extra = {}) {
  return { pitch: sp.motion.perchPitch, fold: 1, legs: 1, crouch: 0, fluff: 1,
    headYaw: 0, headPitch: 0, headRoll: 0, headBob: 0, tail: sp.motion.tailAngle,
    tailSpread: 1, flap: 0, flapOuter: 0, sweep: 0, wingLift: 0, step: 0, ...extra };
}

// Box3.setFromObject includes hidden flight surfaces and does not reliably
// reflect an animated skin. Measure only the geometry the user actually sees.
function visibleBounds(rig) {
  rig.root.updateMatrixWorld(true);
  rig.skin.skeleton.update();
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  rig.root.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
}

test('the common stage scale leaves headroom above every fully posed species', () => {
  let measuredMaximum = 0;
  for (const [id, sp] of Object.entries(SPECIES)) {
    const rig = new BirdRig(id, 1);
    rig.pose(restingPose(sp));
    const bounds = visibleBounds(rig);
    const a = ANATOMY[id];
    const crown = (a.rows.at(-1)[0] + a.leg + (a.crest ? 0.103 : 0)) * a.k * sp.scale;
    assert.ok(Math.abs(bounds.max.y - crown) < 1e-6, `${id}: profile must include its highest visible feature`);
    assert.ok(bounds.max.y * 0.88 / MAX_PERCHED_HEIGHT <= 0.880001, `${id}: crosses the next wire`);
    measuredMaximum = Math.max(measuredMaximum, bounds.max.y);
    rig.dispose();
  }
  assert.ok(Math.abs(measuredMaximum - MAX_PERCHED_HEIGHT) < 1e-6);
});

test('bills remain level when the body changes posture without a head gesture', () => {
  for (const [id, sp] of Object.entries(SPECIES)) {
    const rig = new BirdRig(id, 1);
    for (const delta of [-0.2, 0, 0.2]) {
      rig.pose(restingPose(sp, { pitch: sp.motion.perchPitch + delta }));
      rig.root.updateMatrixWorld(true);
      const origin = rig.neck.localToWorld(new THREE.Vector3());
      const billAxis = rig.neck.localToWorld(new THREE.Vector3(1, 0, 0)).sub(origin).normalize();
      assert.ok(Math.abs(billAxis.y) < 1e-8 && billAxis.x > 0.999, `${id}: bill tilts with its chest`);
    }
    rig.dispose();
  }
});

test('both feet grip the wire through body turns and legs remain joined to the hips', () => {
  const point = new THREE.Vector3(), origin = new THREE.Vector3();
  const triangle = new THREE.Triangle();
  for (const [id, sp] of Object.entries(SPECIES)) {
    const rig = new BirdRig(id, 1);
    const a = ANATOMY[id];
    for (const yaw of [0, -0.4, Math.PI / 2, Math.PI + 0.4]) {
      rig.root.rotation.y = yaw;
      rig.pose(restingPose(sp));
      rig.root.updateMatrixWorld(true);
      for (let i = 0; i < rig.feet.length; i++) {
        const foot = rig.feet[i], side = i ? 1 : -1;
        const bounds = new THREE.Box3().setFromObject(foot, true);
        assert.ok(bounds.min.y < 0 && bounds.max.y > 0, `${id}: claws must wrap below the wire`);
        // Project triangles onto YZ to measure their actual distance to the
        // entire wire axis; testing only height missed feet beside the cable.
        let closest = Infinity;
        const vertices = [triangle.a, triangle.b, triangle.c];
        for (let j = 0; j < foot.geometry.attributes.position.count; j += 3) {
          vertices.forEach((v, k) => {
            foot.getVertexPosition(j + k, v).applyMatrix4(foot.matrixWorld);
            v.x = 0;
          });
          triangle.closestPointToPoint(origin, point);
          if (Number.isFinite(point.length())) closest = Math.min(closest, point.length());
        }
        assert.ok(closest < 0.002 * a.k * sp.scale, `${id}: foot misses the wire at yaw ${yaw}`);
        const row = a.rows[1];
        const hip = rig.body.localToWorld(new THREE.Vector3((row[1] + row[2]) / 2, row[0], side * row[3] * 0.6));
        const attached = rig.legs[i].upper.localToWorld(new THREE.Vector3(0, -0.5, 0));
        assert.ok(hip.distanceTo(attached) < 1e-8, `${id}: leg separated from feathered hip`);
      }
    }
    rig.root.rotation.y = 0;
    rig.pose(restingPose(sp, { pitch: 0, fold: 0, legs: 0 }));
    rig.root.updateMatrixWorld(true);
    for (const foot of rig.feet) assert.ok(new THREE.Box3().setFromObject(foot, true).min.y > a.leg * a.k * sp.scale,
      `${id}: feet still dangle below the belly during flight`);
    assert.equal(rig.root.scale.x, sp.lengthCm / 16, `${id}: physical size ratio`);
    rig.dispose();
  }
});
