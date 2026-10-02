import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BirdRig, birdMaterial, setBirdSilhouette } from '../src/world/bird-rig.js';
import { SPECIES } from '../src/world/species.js';

const pose = (extra = {}) => ({ pitch: 0, flap: 0, flapOuter: 0, fold: 0, sweep: 0,
  headYaw: 0, headPitch: 0, tail: 0, tailSpread: 1, legs: 1, crouch: 0, fluff: 1, ...extra });

test('every species builds finite, colored geometry at measured length and wingspan ratios', () => {
  for (const [id, sp] of Object.entries(SPECIES)) {
    const rig = new BirdRig(id, 1);
    rig.pose(pose());
    rig.root.updateMatrixWorld(true);
    assert.equal(rig.root.scale.x, sp.lengthCm / 16, id);
    const bounds = new THREE.Box3();
    for (const wing of rig.wings) bounds.expandByObject(wing.shoulder, true);
    assert.ok(Math.abs(bounds.max.z - bounds.min.z - .85 * sp.wingspanCm / 16) < .00001, `${id} wingspan`);
    rig.root.traverse(node => {
      if (!node.isMesh) return;
      assert.ok(node.geometry.attributes.color, `${id} color`);
      for (const n of node.geometry.attributes.position.array) assert.ok(Number.isFinite(n), `${id} vertex`);
    });
  }
});

test('left and right wings mirror one another throughout the stroke and fold', () => {
  for (const id of Object.keys(SPECIES)) {
    const rig = new BirdRig(id, 1);
    for (const fold of [0,.35,.70,1]) for (const flap of [-1,-.4,0,.7,1]) {
      rig.pose(pose({ fold, flap, flapOuter: .35, sweep: -.20 }));
      rig.root.updateMatrixWorld(true);
      const tips = rig.wings.map(({ elbow }) => elbow.localToWorld(new THREE.Vector3(-.10,0,.20)));
      assert.ok(Math.abs(tips[0].x-tips[1].x)<1e-8, `${id} forward symmetry`);
      assert.ok(Math.abs(tips[0].y-tips[1].y)<1e-8, `${id} both wings rise together`);
      assert.ok(Math.abs(tips[0].z+tips[1].z)<1e-8, `${id} opposite sides`);
    }
  }
});

test('resting wings close onto the body and silhouette mode applies to all geometry', () => {
  for (const id of Object.keys(SPECIES)) {
    const rig = new BirdRig(id, 1);
    rig.pose(pose({ fold: 1 }));
    assert.ok(rig.wings.every(w => !w.shoulder.visible && w.folded.visible), id);
    rig.root.traverse(n => { if(n.isMesh) assert.equal(n.material,birdMaterial); });
  }
  setBirdSilhouette(true);
  assert.equal(birdMaterial.vertexColors,false);
  setBirdSilhouette(false);
  assert.equal(birdMaterial.vertexColors,true);
});
