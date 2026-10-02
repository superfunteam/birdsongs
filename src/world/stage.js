import * as THREE from 'three';
import { createSky, LAYER, MAX_LAYERS } from '../render/sky.js';
import { Atmosphere } from './atmosphere.js';
import { PowerLines, setPoleSilhouette } from './powerlines.js';
import { WeatherFX } from './weatherfx.js';
import { Flock } from './flock.js';
import { NotePips } from './pips.js';
import { setBirdSilhouette, SILHOUETTE } from './bird.js';
import { SCENES } from './scenes.js';

const CAM_Y = 1.7;
const CAM_Z = 22;
const HORIZON = 0.18; // screen fraction (from bottom) where the ground meets the sky
const WIRE_BAND = [0.49, 0.8]; // screen fractions for the lowest / highest wire
const WIRE_BAND_PORTRAIT = [0.5, 0.71];
const MIN_WIDTH = 12.5; // world units of wire that must always be visible
export const DAY_LENGTH = 40 * 60; // seconds for a full day/night cycle

const rnd = (a, b) => a + Math.random() * (b - a);

// "shuffle wires": a fresh staff each time: how many wires, how many poles,
// where they stand, how high, how slack
export function randomWireLayout() {
  const wires = 3 + Math.floor(Math.random() * 4); // 3-6
  const lo = rnd(0.42, 0.54);
  const hi = Math.min(0.86, lo + 0.065 * (wires - 1) + rnd(0, 0.07));
  const count = 1 + Math.floor(Math.random() * 3); // 1-3 poles on screen
  const xs = [];
  for (let tries = 0; xs.length < count && tries < 50; tries++) {
    const x = rnd(-0.9, 0.95);
    if (xs.every((o) => Math.abs(o - x) > 0.5)) xs.push(x);
  }
  const poles = xs.map((x) => ({
    x,
    lift: rnd(-0.7, 0.7),
    transformer: Math.random() < 0.3,
    lamp: Math.random() < 0.3,
    lampDir: Math.random() < 0.5 ? 1 : -1,
  }));
  return { wires, band: [lo, hi], poles, sagK: rnd(0.25, 0.85) };
}

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();
const WHITE = new THREE.Color('#ffffff');
const MOON = new THREE.Color('#8ea0d8');

export class Stage {
  constructor(pixel) {
    this.pixel = pixel;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, CAM_Y, CAM_Z);

    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.Fog('#000000', 45, 170);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#222222', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 1);
    this.sun.position.set(0, 1, -1);
    this.fill = new THREE.DirectionalLight('#ffffff', 0.4);
    this.fill.position.set(0.4, 0.6, 1);
    this.scene.add(this.hemi, this.sun, this.fill);

    this.atmo = new Atmosphere();
    this.lines = new PowerLines(this.scene);
    this.fx = new WeatherFX(this.scene);
    this.flock = new Flock(this.scene, this);
    this.pips = new NotePips(this.scene);
    this.flock.onNote = (b, kind, now) => {
      const p = new THREE.Vector3(b.pos.x, b.pos.y + 0.7 * b.size, 0);
      this.pips.spawn(p, now, this.lines.layout.pxWorld, b.id);
    };
    this.birdKind = 'mixed';
    this.silhouette = false;
    this.shuffle = false;
    this.wireLayout = null; // null = the scene's own poles and wires
    this.onWiresChanged = null;
    this.cloudTime = 0;
    this.sceneIndex = -1;
    this.transition = null;
    this.onThunder = null;
    this.onSceneApplied = null;
    this.view = null;
  }

  get current() {
    return SCENES[this.sceneIndex];
  }

  // -------------------------------------------------------------- framing
  ndcToPlane(x, y) {
    ndc.set(x, y);
    ray.setFromCamera(ndc, this.camera);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  frame(vfov) {
    const cam = this.camera;
    cam.fov = vfov;
    const t = Math.tan(THREE.MathUtils.degToRad(vfov / 2));
    cam.rotation.set(Math.atan((1 - 2 * HORIZON) * t), 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  layout() {
    const cam = this.camera;
    const { width, height } = this.pixel;
    cam.aspect = width / height;
    let vfov = 40;
    for (let i = 0; i < 4; i++) {
      this.frame(vfov);
      const l = this.ndcToPlane(-1, 0.3);
      const r = this.ndcToPlane(1, 0.3);
      const w = r.x - l.x;
      if (w >= MIN_WIDTH) break;
      vfov = Math.min(88, vfov * Math.pow(MIN_WIDTH / w, 0.9));
    }
    this.frame(vfov);

    const sc = this.current;
    const W = this.wireLayout;
    let band = cam.aspect < 0.9 ? WIRE_BAND_PORTRAIT : WIRE_BAND;
    if (W) {
      // squeeze a shuffled band into the portrait range on tall screens
      band = cam.aspect < 0.9
        ? W.band.map((f) => WIRE_BAND_PORTRAIT[0] + ((f - 0.42) / 0.44) * (WIRE_BAND_PORTRAIT[1] - WIRE_BAND_PORTRAIT[0] + 0.04))
        : W.band;
    }
    const mid = band[0] + band[1] - 1; // ndc y of the band centre
    const left = this.ndcToPlane(-1, mid);
    const right = this.ndcToPlane(1, mid);
    const top = this.ndcToPlane(0, 1);
    const bottom = this.ndcToPlane(0, -1);
    const halfW = (right.x - left.x) / 2;
    const visH = top.y - bottom.y;

    const n = W ? W.wires : sc.wires;
    const heights = [];
    for (let i = 0; i < n; i++) {
      const f = band[0] + ((band[1] - band[0]) * i) / Math.max(1, n - 1);
      heights.push(this.ndcToPlane(0, f * 2 - 1).y);
    }
    const spacing = (heights[n - 1] - heights[0]) / Math.max(1, n - 1);
    const sag = spacing * (W ? W.sagK : 0.5);
    heights.forEach((h, i) => (heights[i] = h + sag * 0.55));

    // poles: the scene's visible ones + extras off both edges
    const refSpan = halfW * 1.2;
    const visible = (W ? W.poles : sc.poles).map((p) => ({ ...p, x: p.x * halfW }));
    visible.sort((a, b) => a.x - b.x);
    const poleXs = visible.map((p) => p.x);
    const poleOpts = new Map(visible.map((p) => [p.x, p]));
    let lx = poleXs[0];
    while (lx > left.x - 2) {
      lx -= refSpan * (0.85 + 0.3 * ((poleXs.length * 7) % 3) / 3);
      poleXs.unshift(lx);
    }
    let rx = poleXs[poleXs.length - 1];
    while (rx < right.x + 2) {
      rx += refSpan * 0.95;
      poleXs.push(rx);
    }

    const poleLift = new Map(visible.map((p) => [p.x, (p.lift || 0) * spacing]));

    this.lines.build({
      poleXs,
      poleOpts,
      poleLift,
      heights,
      sag,
      refSpan,
      pxWorld: visH / height,
      thickBottom: true,
    });

    const camZ = CAM_Z;
    const camPos = cam.position.clone();
    const topDir = new THREE.Vector3();
    ndc.set(0, 1);
    ray.setFromCamera(ndc, cam);
    topDir.copy(ray.ray.direction);
    const topAt = (z) => camPos.y + (topDir.y / -topDir.z) * (camZ - z);

    this.view = {
      xMin: left.x,
      xMax: right.x,
      halfW,
      visH,
      spacing,
      camZ,
      topAt,
      birdScale: Math.min(spacing * 0.95, (right.x - left.x) * 0.068),
      wires: n,
    };
    this.fx.setBounds({ spanX: halfW * 1.7 + 6, top: topAt(0) + 4 });
    this.sky.uniforms.uRes.value.set(width, height);
    this.sky.uniforms.uHorizon.value = HORIZON;
  }

  // -------------------------------------------------------------- scenes
  applyScene(index, now) {
    this.sceneIndex = (index + SCENES.length) % SCENES.length;
    const sc = this.current;
    this.sceneStart = now;
    this.wireLayout = this.shuffle ? randomWireLayout() : null;
    this.flock.clear();
    this.pips.clear();
    this.atmo.setScene(sc, now);
    this.layout();
    this.flock.populate(Math.round(this.flock.targetPopulation() * 0.6), now, sc.species);
    this.onSceneApplied?.(sc);
  }

  // same place and hour, new set of wires
  applyWires(layout, now) {
    this.wireLayout = layout;
    this.flock.clear();
    this.pips.clear();
    this.layout();
    this.flock.populate(Math.round(this.flock.targetPopulation() * 0.6), now, this.current.species);
    this.onWiresChanged?.();
  }

  // every change of wires or scene goes through a pixel dissolve
  transitionTo(apply, now) {
    if (this.transition) return false;
    this.transition = { start: now, apply, swapped: false };
    return true;
  }

  setScene(index, now, immediate = false) {
    if (immediate || this.sceneIndex < 0) {
      this.applyScene(index, now);
      return;
    }
    this.transitionTo((t) => this.applyScene(index, t), now);
  }

  setShuffle(on, now) {
    this.shuffle = on;
    this.transitionTo((t) => this.applyWires(on ? randomWireLayout() : null, t), now);
  }

  reshuffle(now) {
    if (this.shuffle) this.transitionTo((t) => this.applyWires(randomWireLayout(), t), now);
  }

  setBirdKind(kind) {
    this.birdKind = kind;
    this.flock.setKind(this.current.species);
  }

  setSilhouette(on) {
    this.silhouette = on;
    setBirdSilhouette(on);
    setPoleSilhouette(on, SILHOUETTE);
  }

  resize() {
    if (this.sceneIndex < 0) return;
    const oldHalfW = this.view.halfW;
    this.layout();
    // poles sit at fractions of the width, so slide birds along with them
    this.flock.rescale(this.view.halfW / oldHalfW, this.view.birdScale);
    // new wires: re-hang the weight of every bird already sitting on them
    for (const b of this.flock.birds) if (b.loadOn) this.lines.setLoad(b.id, b.wire, b.x, b.size);
  }

  timeOfDay(now) {
    return (this.current.start + (now - this.sceneStart) / DAY_LENGTH) % 1;
  }

  // -------------------------------------------------------------- frame
  update(now, dt) {
    if (this.transition) {
      const t = now - this.transition.start;
      if (!this.transition.swapped) {
        this.pixel.uniforms.uFade.value = Math.min(1, t / 0.7);
        if (t >= 0.75) {
          this.transition.swapped = true;
          this.transition.swapAt = now;
          this.transition.apply(now);
        }
      } else {
        const k = (now - this.transition.swapAt) / 1.1;
        this.pixel.uniforms.uFade.value = Math.max(0, 1 - k);
        if (k >= 1) this.transition = null;
      }
    }

    const sc = this.current;
    const a = this.atmo;
    a.update(now, dt, this.timeOfDay(now));
    const w = a.w;
    const U = this.sky.uniforms;
    const aspect = this.pixel.width / this.pixel.height;

    const strike = this.fx.update(now, dt, w, { spanX: this.view.halfW, top: this.view.topAt(0) });
    if (strike) this.onThunder?.(strike);
    const flash = this.fx.flash;

    this.cloudTime += dt * (0.35 + w.wind * 1.3);
    U.uTime.value = now;
    U.uCloudTime.value = this.cloudTime;
    U.uZenith.value.copy(a.zen);
    U.uMid.value.copy(a.mid);
    U.uHorizonCol.value.copy(a.hor);

    const sunLow = 1 - Math.min(1, Math.max(0, a.sunElev) * 2.5);
    U.uSun.value.set(a.sunAz * aspect * 0.5 * 0.78, HORIZON + a.sunElev * 0.95, 0.03 + 0.012 * sunLow);
    U.uSunCol.value.copy(a.sunCol);
    const coverHide = 1 - THREE.MathUtils.smoothstep(w.cover, 0.6, 1.0) * 0.92;
    U.uSunVis.value = THREE.MathUtils.clamp((a.sunElev + 0.06) / 0.08, 0, 1) * coverHide;
    U.uMoon.value.set(a.moonAz * aspect * 0.5 * 0.7, HORIZON + a.moonElev * 0.9, 0.022);
    U.uMoonVis.value = THREE.MathUtils.clamp((a.moonElev + 0.04) / 0.08, 0, 1) * coverHide * (0.4 + 0.6 * a.night);
    U.uStars.value = a.stars * (1 - Math.min(1, w.cover * 1.1));
    U.uCover.value = w.cover;
    U.uCloudLit.value.copy(a.cloudLit);
    U.uCloudMid.value.copy(a.cloudMid);
    U.uCloudShade.value.copy(a.cloudShade);
    U.uFlash.value = flash;
    U.uNight.value = a.night;
    U.uMist.value = w.mist;
    U.uMistCol.value.copy(a.mistCol);
    U.uHaze.value = Math.min(0.75, w.rain * 0.55 + w.snow * 0.45);

    const light = a.light;

    // landscape layer colours
    for (let i = 0; i < MAX_LAYERS; i++) {
      const L = sc.layers[i];
      if (!L) {
        U.uLayerType.value[i] = 0;
        continue;
      }
      U.uLayerType.value[i] = LAYER[L.type];
      U.uLayerA.value[i].set(L.base || 0, L.amp || 0, L.freq || 1, L.seed || 0);
      const b = L.b || [0, 0, 0, L.haze];
      U.uLayerB.value[i].set(b[0], L.type === 'headland' ? b[1] * aspect * 0.5 : b[1], b[2], b[3] ?? L.haze);
      const lit = (hex, out) => {
        out.set(hex).multiply(tmp2.copy(a.amb).multiplyScalar(1.08));
        out.lerp(a.hor, L.haze || 0);
        out.multiplyScalar(1 + flash * 0.6 * (L.haze || 0.2));
        return out;
      };
      if (L.type === 'sea') {
        // deep water picks up the sky overhead; the horizon mirrors it
        U.uLayerCol.value[i].copy(a.zen).lerp(tmp2.set(L.col), 0.45).multiplyScalar(0.75 + 0.25 * light);
      } else lit(L.col, U.uLayerCol.value[i]);
      const detail = (hex, mode, out) => {
        if (mode === 'emit') return out.set(hex);
        if (mode === 'sky') return out.copy(a.hor).lerp(a.mid, 0.15);
        if (mode === 'skylight') return out.copy(a.hor).lerp(WHITE, 0.3).lerp(a.sunCol, 0.15);
        return lit(hex || L.col, out);
      };
      detail(L.col2, L.col2Mode, U.uLayerCol2.value[i]);
      detail(L.col3, L.col3Mode, U.uLayerCol3.value[i]);
    }

    // lights on the 3D bits (birds, poles)
    this.hemi.color.copy(a.amb).lerp(a.mid, 0.25);
    this.hemi.groundColor.copy(a.amb).multiplyScalar(0.35);
    this.hemi.intensity = Math.PI * (0.62 + flash * 1.6);
    const sunUp = a.sunElev > -0.02;
    const elev = sunUp ? a.sunElev : a.moonElev;
    const az = sunUp ? a.sunAz : a.moonAz;
    this.sun.position.set(az * 0.9, Math.max(0.08, elev) * 1.2 + 0.1, -0.55);
    this.sun.color.copy(sunUp ? a.sunCol : MOON).lerp(WHITE, sunUp ? 0.2 : 0);
    const direct = sunUp ? THREE.MathUtils.clamp(elev * 3 + 0.2, 0, 1) : THREE.MathUtils.clamp(elev * 2, 0, 1) * 0.35;
    this.sun.intensity = Math.PI * 1.1 * direct * (1 - w.cover * 0.7);
    this.fill.color.copy(a.amb).lerp(WHITE, 0.2);
    this.fill.intensity = Math.PI * (0.3 + 0.25 * light) + flash * 3;

    this.scene.fog.color.copy(a.hor).lerp(a.mistCol, 0.5);
    this.scene.fog.near = 40 - w.mist * 20;

    tmp.copy(a.amb).multiplyScalar(0.16).add(tmp2.setRGB(0.03, 0.03, 0.045));
    const lampsOn = THREE.MathUtils.smoothstep(a.night, 0.3, 0.6);
    if (this.silhouette) tmp.copy(SILHOUETTE);
    this.lines.setColors(tmp, lampsOn);
    tmp.copy(a.amb).lerp(WHITE, 0.35).multiplyScalar(0.75 + flash * 0.6);
    tmp2.copy(a.amb).lerp(WHITE, 0.7);
    this.fx.setColors(tmp, tmp2);

    this.pixel.uniforms.uLift.value.copy(a.zen).multiplyScalar(0.35).lerp(tmp.set('#140f24'), 0.5);

    this.lines.update(now, Math.min(dt, 0.1), w.wind);
    this.flock.update(now, dt, w.rain);
    this.pips.update(now);
  }
}
