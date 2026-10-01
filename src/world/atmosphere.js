import * as THREE from 'three';

// Time of day runs 0..1 (0 = midnight, 0.25 ≈ sunrise, 0.5 = noon, 0.75 ≈ sunset).
// Each keyframe is a full palette; we blend between neighbours.
const KEYS = [
  { t: 0.0, zen: '#070a1d', mid: '#101836', hor: '#202c55', amb: '#2a3360', sun: '#000000', stars: 1.0, light: 0.22 },
  { t: 0.19, zen: '#10173d', mid: '#2a2f63', hor: '#5d4577', amb: '#363563', sun: '#7a4060', stars: 0.65, light: 0.28 },
  { t: 0.235, zen: '#24346f', mid: '#83598a', hor: '#ee8a6c', amb: '#76668a', sun: '#ff9858', stars: 0.15, light: 0.45 },
  { t: 0.275, zen: '#4166a6', mid: '#d39a8f', hor: '#ffd08c', amb: '#c4a796', sun: '#ffc070', stars: 0.0, light: 0.7 },
  { t: 0.34, zen: '#5a8fd8', mid: '#9ec6ea', hor: '#e9e5d2', amb: '#d9d9d0', sun: '#fff0d2', stars: 0.0, light: 0.92 },
  { t: 0.5, zen: '#3d7ed8', mid: '#86bdf0', hor: '#cfe7f5', amb: '#efefe8', sun: '#fffaf0', stars: 0.0, light: 1.0 },
  { t: 0.64, zen: '#4a7bcb', mid: '#9abce0', hor: '#f0dbb6', amb: '#e8dcc6', sun: '#ffe2aa', stars: 0.0, light: 0.92 },
  { t: 0.705, zen: '#485d9c', mid: '#de9f8c', hor: '#ffc37a', amb: '#d0a184', sun: '#ffb24e', stars: 0.0, light: 0.72 },
  { t: 0.742, zen: '#2d3878', mid: '#c25f7c', hor: '#ff985a', amb: '#a0707f', sun: '#ff7638', stars: 0.05, light: 0.52 },
  { t: 0.78, zen: '#191e50', mid: '#4d3976', hor: '#bf5f7b', amb: '#5a4870', sun: '#a04060', stars: 0.35, light: 0.34 },
  { t: 0.84, zen: '#0b102f', mid: '#171f48', hor: '#323768', amb: '#2d3462', sun: '#000000', stars: 0.85, light: 0.24 },
  { t: 1.0, zen: '#070a1d', mid: '#101836', hor: '#202c55', amb: '#2a3360', sun: '#000000', stars: 1.0, light: 0.22 },
].map((k) => ({
  ...k,
  zen: new THREE.Color(k.zen),
  mid: new THREE.Color(k.mid),
  hor: new THREE.Color(k.hor),
  amb: new THREE.Color(k.amb),
  sun: new THREE.Color(k.sun),
}));

// Weather presets the scene state machine moves between.
export const WEATHER = {
  clear: { cover: 0.12, rain: 0, snow: 0, storm: 0, mist: 0.15, wind: 0.2 },
  fair: { cover: 0.38, rain: 0, snow: 0, storm: 0, mist: 0.15, wind: 0.3 },
  cloudy: { cover: 0.7, rain: 0, snow: 0, storm: 0, mist: 0.25, wind: 0.4 },
  misty: { cover: 0.55, rain: 0, snow: 0, storm: 0, mist: 0.8, wind: 0.15 },
  drizzle: { cover: 0.82, rain: 0.28, snow: 0, storm: 0, mist: 0.35, wind: 0.3 },
  rain: { cover: 0.93, rain: 0.62, snow: 0, storm: 0, mist: 0.4, wind: 0.45 },
  storm: { cover: 1.0, rain: 0.92, snow: 0, storm: 1, mist: 0.35, wind: 0.8 },
  flurries: { cover: 0.62, rain: 0, snow: 0.3, storm: 0, mist: 0.3, wind: 0.25 },
  snow: { cover: 0.88, rain: 0, snow: 0.75, storm: 0, mist: 0.45, wind: 0.35 },
};

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();
const GRAY_DAY = new THREE.Color('#8790a0');
const GRAY_NIGHT = new THREE.Color('#161a26');

function lerpKey(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = (t - a.t) / (b.t - a.t);
  return { a, b, u };
}

const desaturate = (c, amt, toward) => {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  tmp2.setRGB(l, l, l).lerp(toward, 0.35);
  return c.lerp(tmp2, amt);
};

export class Atmosphere {
  constructor() {
    this.time = 0.7;
    this.w = { ...WEATHER.clear };
    this.target = { ...WEATHER.clear };
    this.state = 'clear';
    this.nextChange = 0;
    this.flash = 0;

    // outputs
    this.zen = new THREE.Color();
    this.mid = new THREE.Color();
    this.hor = new THREE.Color();
    this.amb = new THREE.Color();
    this.sunCol = new THREE.Color();
    this.light = 1;
    this.stars = 0;
    this.sunElev = 0;
    this.moonElev = 0;
    this.night = 0;
    this.cloudLit = new THREE.Color();
    this.cloudMid = new THREE.Color();
    this.cloudShade = new THREE.Color();
    this.mistCol = new THREE.Color();
  }

  setScene(scene, now) {
    this.scene = scene;
    this.state = scene.weather.start;
    this.w = { ...WEATHER[this.state] };
    this.target = { ...WEATHER[this.state] };
    this.nextChange = now + 120 + Math.random() * 120;
  }

  pickNextWeather() {
    const weights = this.scene.weather.weights;
    const entries = Object.entries(weights).filter(([k]) => k !== this.state);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = Math.random() * total;
    for (const [k, v] of entries) {
      r -= v;
      if (r <= 0) return k;
    }
    return entries[0][0];
  }

  update(now, dt, timeOfDay) {
    this.time = timeOfDay;
    if (now > this.nextChange) {
      this.state = this.pickNextWeather();
      this.target = { ...WEATHER[this.state] };
      this.nextChange = now + 150 + Math.random() * 210;
    }
    // ease weather toward target (~45s time constant)
    const k = 1 - Math.exp(-Math.min(dt, 1) / 45);
    for (const key of Object.keys(this.w)) this.w[key] += (this.target[key] - this.w[key]) * k;
    const w = this.w;

    const { a, b, u } = lerpKey(timeOfDay);
    this.zen.copy(a.zen).lerp(b.zen, u);
    this.mid.copy(a.mid).lerp(b.mid, u);
    this.hor.copy(a.hor).lerp(b.hor, u);
    this.amb.copy(a.amb).lerp(b.amb, u);
    this.sunCol.copy(a.sun).lerp(b.sun, u);
    this.light = a.light + (b.light - a.light) * u;
    this.stars = a.stars + (b.stars - a.stars) * u;

    // scene tint (e.g. winter is cooler)
    const tint = this.scene?.tint;
    if (tint) {
      tmp.set(tint.color);
      for (const c of [this.zen, this.mid, this.hor, this.amb]) c.lerp(tmp, tint.amount);
    }

    // overcast: desaturate toward storm gray and darken
    const overcast = THREE.MathUtils.smoothstep(w.cover, 0.45, 1.0) * 0.85 + w.rain * 0.15 + w.snow * 0.1;
    const grayTarget = tmp.copy(GRAY_NIGHT).lerp(GRAY_DAY, THREE.MathUtils.clamp(this.light, 0, 1));
    if (w.snow > 0.05) grayTarget.lerp(tmp2.set('#b8bfcc'), 0.35 * this.light);
    for (const c of [this.zen, this.mid, this.hor]) desaturate(c, overcast * 0.8, grayTarget);
    desaturate(this.amb, overcast * 0.55, grayTarget);
    const darken = 1 - 0.28 * w.rain - 0.22 * w.storm;
    this.zen.multiplyScalar(darken);
    this.mid.multiplyScalar(darken);
    this.hor.multiplyScalar(darken * 0.98 + 0.02);
    this.amb.multiplyScalar(darken);
    this.light *= darken * (1 - overcast * 0.25);

    // sun & moon arcs
    const ang = (timeOfDay - 0.25) * Math.PI * 2;
    this.sunElev = Math.sin(ang);
    this.sunAz = -Math.cos(ang);
    const mAng = ang + Math.PI;
    this.moonElev = Math.sin(mAng);
    this.moonAz = -Math.cos(mAng);
    this.night = THREE.MathUtils.clamp(1 - (this.light - 0.22) / 0.45, 0, 1);

    // cloud colours: lit side picks up the sun, shade side the sky
    const sunLow = THREE.MathUtils.clamp(1 - Math.abs(this.sunElev) * 3.2, 0, 1) * (this.sunElev > -0.25 ? 1 : 0);
    tmp.set('#ffffff').multiplyScalar(0.3 + 0.68 * this.light);
    this.cloudLit.copy(tmp).lerp(this.sunCol, sunLow * 0.6).lerp(this.mid, 0.15);
    this.cloudMid.copy(this.cloudLit).lerp(this.mid, 0.32).lerp(this.hor, sunLow * 0.15);
    this.cloudShade.copy(this.cloudLit).lerp(this.zen, 0.5).lerp(this.mid, 0.12);
    if (this.scene?.cityGlow && this.night > 0.4) {
      // city light pollution warms the undersides of night clouds
      tmp.set('#6a4a52');
      this.cloudShade.lerp(tmp, 0.35 * this.night * w.cover);
      this.cloudMid.lerp(tmp, 0.2 * this.night * w.cover);
    }
    const stormy = Math.max(w.storm, overcast * 0.6);
    for (const c of [this.cloudLit, this.cloudMid, this.cloudShade]) desaturate(c, stormy * 0.6, grayTarget);
    this.cloudLit.multiplyScalar(1 - 0.25 * w.storm);
    this.cloudMid.multiplyScalar(1 - 0.3 * w.storm);
    this.cloudShade.multiplyScalar(1 - 0.35 * w.storm);

    this.mistCol.copy(this.hor).lerp(this.amb, 0.4);
  }
}
