import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Flock } from '../src/world/flock.js';
import { SPECIES } from '../src/world/species.js';
import { BIRD_RADIUS } from '../src/world/bird.js';

function makeFlock() {
  const loads = new Map();
  const stage = {
    birdKind: 'sparrow',
    current: { species: { sparrow: 1, crow: 1 } },
    view: { xMin: -8, xMax: 8, wires: 3, birdScale: 0.65, camZ: 22, topAt: () => 12 },
    lines: {
      poleXs: [],
      y: (wire, x) => 3 + wire * 1.5 + x * 0.002,
      setLoad: (id, wire, x, size) => loads.set(id, { wire, x, size }),
      removeLoad: (id) => loads.delete(id),
    },
  };
  return { flock: new Flock(new THREE.Group(), stage), stage, loads };
}

function assertClear(flock, now) {
  for (const b of flock.birds.filter((bird) => !bird.gone && bird.occupies(now))) {
    assert.ok(flock.isFree(b.wire, b.x, b.radius, now, b), `bird ${b.id} overlaps at ${b.x}`);
  }
}

test('landing reserves the entire real-size bird at screen edges and poles', () => {
  const { flock, stage } = makeFlock();
  stage.lines.poleXs = [0];
  const radius = BIRD_RADIUS * SPECIES.gull.scale * stage.view.birdScale;
  assert.equal(flock.isFree(0, -7.5, radius, 10), false);
  assert.equal(flock.isFree(0, 0.9, radius, 10), false);
  const x = flock.nearestFreeX(0, 0, 10, radius);
  assert.ok(Math.abs(x) >= radius + 0.42);
  assert.ok(flock.isFree(0, x, radius, 10));
});

test('landing searches past a crowded local playhead interval', () => {
  const { flock } = makeFlock();
  flock.birds = [-2.1, -1.05, 0, 1.05, 2.1].map((x) => ({ x, wire: 0, radius: 0.49, occupies: () => true }));
  const x = flock.nearestFreeX(0, 0, 10, 0.8);
  assert.ok(Math.abs(x) > 3);
  assert.ok(flock.isFree(0, x, 0.8, 10));
});

test('small-to-large species switches preserve planned events and clear excess residents', () => {
  const { flock, stage, loads } = makeFlock();
  flock.now = 10;
  for (let i = 0; i < 14; i++) {
    const b = flock.land({ wire: 1, x: -6.2 + i * 0.9, time: 2, now: -4, speciesId: 'sparrow' });
    b.loadOn = true;
    stage.lines.setLoad(b.id, b.wire, b.x, b.size);
  }
  const scheduled = flock.birds[7];
  flock.depart(scheduled, 15);
  stage.birdKind = 'crow';
  flock.setKind(stage.current.species);
  assert.equal(scheduled.aborted, false);
  assert.equal(scheduled.departTime, 15);
  assert.equal(scheduled.wire, 1);
  assert.ok(flock.birds.some((b) => b.aborted));
  assertClear(flock, 10);
  for (const b of flock.birds) {
    assert.equal(b.wire, 1);
    assert.equal(loads.has(b.id), !b.aborted);
    if (!b.aborted) assert.ok(Math.abs(b.approach.p[3].x - b.x) < 1e-9);
  }
  flock.clear();
});

test('resize updates real-size reservations and keeps flight endpoints on the new perch', () => {
  const { flock, stage } = makeFlock();
  flock.now = 10;
  for (const x of [-5, -2, 2, 5]) {
    flock.land({ wire: 1, x, time: 12, now: 8, speciesId: 'crow' });
  }
  stage.view.xMin = -6;
  stage.view.xMax = 6;
  stage.view.birdScale = 0.5;
  flock.rescale(0.75, 0.5);
  assertClear(flock, 12);
  for (const b of flock.birds) {
    assert.equal(b.radius, BIRD_RADIUS * SPECIES.crow.scale * 0.5);
    assert.ok(Math.abs(b.approach.p[3].x - b.x) < 1e-9);
    assert.ok(Math.abs(b.approach.p[3].y - flock.wireY(b.wire, b.x)) < 1e-9);
    assert.equal(b.landTime, 12);
  }
  flock.clear();
});

test('population target gives large birds more room while preserving mixed size ratios', () => {
  const { flock, stage } = makeFlock();
  const small = flock.targetPopulation();
  stage.birdKind = 'crow';
  assert.ok(flock.targetPopulation() < small);
  stage.birdKind = 'mixed';
  assert.equal(flock.meanSpeciesScale(), (SPECIES.crow.scale + SPECIES.sparrow.scale) / 2);
});
