import * as THREE from 'three';

// Everything behind the power lines is painted by one full-screen shader:
// banded dithered sky, sun/moon/stars, shaded pixel clouds and up to five
// silhouette layers (hills, mountains, city, pines, sea, ground, headland).
// It evaluates per *art pixel*, so every edge lands on the pixel grid.

export const MAX_LAYERS = 5;

export const LAYER = {
  none: 0,
  hills: 1,
  mountains: 2,
  city: 3,
  pines: 4,
  trees: 5,
  sea: 6,
  ground: 7,
  headland: 8,
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform vec2 uRes;
  uniform float uTime;
  uniform float uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizonCol;
  uniform vec3 uSun;        // x, y, radius (screen-height units)
  uniform vec3 uSunCol;
  uniform float uSunVis;
  uniform vec3 uMoon;
  uniform float uMoonVis;
  uniform float uMoonPhase;
  uniform float uStars;
  uniform float uCover;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudMid;
  uniform vec3 uCloudShade;
  uniform float uCloudTime;
  uniform float uFlash;
  uniform float uNight;
  uniform float uMist;
  uniform vec3 uMistCol;
  uniform float uHaze;

  uniform int uLayerType[${MAX_LAYERS}];
  uniform vec4 uLayerA[${MAX_LAYERS}];   // base, amp, freq, seed
  uniform vec4 uLayerB[${MAX_LAYERS}];   // per-type extras; w = haze/mist factor
  uniform vec3 uLayerCol[${MAX_LAYERS}];
  uniform vec3 uLayerCol2[${MAX_LAYERS}];
  uniform vec3 uLayerCol3[${MAX_LAYERS}];

  varying vec2 vUv;

  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise1(float x) { float i = floor(x); float f = fract(x); float u = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), u); }
  float fbm1(float x) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise1(x); x = x * 2.07 + 17.13; a *= 0.5; } return v; }
  float noise2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm4(vec2 p) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p = m * p; a *= 0.48; }
    return v / 0.9;
  }
  float fbm2(vec2 p) {
    float v = 0.0; float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = m * p; a *= 0.5; }
    return v;
  }
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  // cloud density for deck fl (0 = high/far, 1 = low/near)
  float cloudD(vec2 P, float fl) {
    vec2 sc = vec2(0.85 - 0.25 * fl, 1.9 - 0.5 * fl);
    vec2 cp = P * sc + vec2(uCloudTime * (0.018 + 0.03 * fl) + fl * 41.7, fl * 9.1);
    float base = uHorizon + (mix(0.44, 0.2, fl) + 0.05 * sin(P.x * 1.7 + fl * 3.0)) * (1.0 - uHorizon);
    float thick = mix(0.13, 0.19, fl) + 0.3 * uCover;
    float v = (P.y - base) / thick;
    float prof = v < 0.0 ? v * 5.0 : (v > 1.0 ? -(v - 1.0) * 1.4 : 0.24 * (1.0 - v));
    prof = mix(prof, 0.12, uCover * uCover * 0.85);
    float th = mix(0.64, 0.2, uCover) + 0.03 * fl;
    return fbm4(cp) + prof - th;
  }

  void main() {
    vec2 px = floor(gl_FragCoord.xy) + 0.5;
    float onePx = 1.0 / uRes.y;
    float aspect = uRes.x / uRes.y;
    vec2 P = vec2((px.x - uRes.x * 0.5) / uRes.y, px.y / uRes.y);
    float bd = bayer4(px);

    // ---------- sky gradient, banded + dithered
    float h = clamp((P.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
    float bandsF = h * 14.0;
    float bandFrac = fract(bandsF);
    float stepUp = bandFrac > 0.62 && (bandFrac - 0.62) / 0.38 > bd ? 1.0 : 0.0;
    float hq = clamp((floor(bandsF) + stepUp) / 14.0, 0.0, 1.0);
    vec3 col = hq < 0.38
      ? mix(uHorizonCol, uMid, hq / 0.38)
      : mix(uMid, uZenith, (hq - 0.38) / 0.62);

    // ---------- stars
    if (uStars > 0.01) {
      float s = hash21(px * 1.37);
      if (s > 0.9955) {
        float tw = 0.55 + 0.45 * sin(uTime * (0.7 + fract(s * 91.0) * 3.0) + s * 300.0);
        float b = (s - 0.9955) / 0.0045;
        col = mix(col, vec3(0.92, 0.92, 1.0), clamp(uStars * tw * (0.35 + b) * smoothstep(0.02, 0.25, h), 0.0, 1.0));
      }
    }

    // ---------- sun
    float sd = length(P - uSun.xy);
    if (uSunVis > 0.0) {
      float glow = exp(-sd * 5.0) * uSunVis;
      glow = floor(glow * 6.0 + bd) / 6.0;
      col = mix(col, uSunCol, glow * 0.6);
      if (sd < uSun.z) col = mix(col, mix(uSunCol, vec3(1.0, 0.97, 0.88), 0.55), uSunVis);
    }

    // ---------- moon (with phase + craters)
    float md = length(P - uMoon.xy);
    if (uMoonVis > 0.0) {
      float mg = exp(-md * 9.0) * uMoonVis;
      mg = floor(mg * 4.0 + bd) / 4.0;
      col = mix(col, vec3(0.72, 0.78, 0.95), mg * 0.22);
      if (md < uMoon.z) {
        vec2 mp = (P - uMoon.xy) / uMoon.z;
        float cr = noise2(mp * 2.6 + 3.7);
        vec3 mc = vec3(0.96, 0.94, 0.84) * (cr > 0.63 ? 0.82 : 1.0);
        float shadow = length(mp - vec2(uMoonPhase, 0.18)) < 0.98 ? 1.0 : 0.0;
        col = mix(col, mix(mc, col * 1.08 + 0.02, shadow), uMoonVis);
      }
    }

    // ---------- clouds (two drifting decks, 3-tone shading lit from the sun side)
    float cloudHit = 0.0;
    if (uCover > 0.02) {
      vec2 lightDir = normalize(vec2(clamp((uSun.x - P.x) * 0.6, -0.8, 0.8), 1.0));
      for (int L = 0; L < 2; L++) {
        float fl = float(L);
        float d = cloudD(P, fl);
        if (d > 0.0) {
          float d2 = cloudD(P + lightDir * vec2(0.018, 0.026), fl);
          float lit = clamp((d - d2) * 12.0 + 0.42, 0.0, 0.999);
          float tone = floor(lit * 3.0);
          vec3 cc = tone < 1.0 ? uCloudShade : (tone < 2.0 ? uCloudMid : uCloudLit);
          // nearer deck is a touch darker/heavier
          cc *= 1.0 - 0.07 * fl;
          col = cc;
          cloudHit = 1.0;
        }
      }
    }

    // ---------- lightning flash lights the whole sky (clouds most)
    col += uFlash * vec3(0.55, 0.55, 0.72) * (0.45 + 0.55 * cloudHit) * smoothstep(-0.05, 0.25, h);

    // ---------- landscape silhouettes, far → near
    for (int i = 0; i < ${MAX_LAYERS}; i++) {
      int type = uLayerType[i];
      if (type == 0) continue;
      vec4 A = uLayerA[i];
      vec4 B = uLayerB[i];
      float base = uHorizon + A.x;
      float amp = A.y;
      float freq = A.z;
      float seed = A.w;
      float X = P.x;
      vec3 lc = uLayerCol[i];
      bool hit = false;
      float top = -1.0;

      if (type == 1) {                                   // rolling hills
        top = base + amp * fbm1(X * freq + seed);
        hit = P.y < top;
        if (hit && B.x > 0.0 && P.y > top - B.x * onePx) lc = uLayerCol2[i];
      } else if (type == 2) {                            // mountains, snow caps
        float r = 1.0 - abs(noise1(X * freq + seed) * 2.0 - 1.0);
        r = r * r;
        top = base + amp * (0.62 * r + 0.38 * fbm1(X * freq * 2.4 + seed * 1.7));
        hit = P.y < top;
        if (hit && B.x > 0.0) {
          float capLine = base + amp * (0.62 - 0.25 * B.x) + 0.01 * noise1(X * 90.0);
          if (P.y > capLine) lc = uLayerCol2[i];
        }
      } else if (type == 3) {                            // city skyline + windows
        float w = 1.0 / freq;
        float g = X / w + seed;
        float cell = floor(g);
        float f = fract(g);
        float hc = hash11(cell * 1.73 + seed);
        float bh = base + amp * (0.18 + 0.82 * hc * hc);
        if (hc > 0.86 && f > 0.32 && f < 0.68) bh += amp * 0.22;      // stepped tower
        if (hc > 0.93 && abs(f - 0.5) * w < onePx) bh += amp * 0.35;  // antenna
        top = bh;
        hit = P.y < top;
        if (hit) {
          // building tone alternates slightly
          lc *= 0.92 + 0.12 * hash11(cell + 3.1);
          vec2 wp = mod(px, vec2(3.0, 3.0));
          if (wp.x < 1.0 && wp.y < 1.0 && P.y < top - 2.0 * onePx && f > 0.1 && f < 0.9) {
            float lit = hash21(floor(px / 3.0) + vec2(cell * 7.0, floor(uTime / 47.0 + hash11(cell) * 9.0)));
            if (lit < uNight * B.x) lc = uLayerCol2[i] * (0.75 + 0.25 * hash11(lit * 77.0));
            else if (lit > 0.97 && uNight > 0.3) lc = uLayerCol3[i];
          }
          // blinking aviation light
          if (hc > 0.86 && P.y > top - onePx * 1.5 && abs(f - 0.5) * w < onePx && fract(uTime * 0.5 + hc) < 0.5 && uNight > 0.2)
            lc = vec3(1.0, 0.25, 0.2);
        }
      } else if (type == 4) {                            // pine forest
        float w = 1.0 / freq;
        float g = X / w;
        float cell = floor(g);
        float ground = base + amp * 0.12 * fbm1(X * 4.0 + seed);
        top = ground;
        for (int k = -1; k <= 1; k++) {
          float c = cell + float(k);
          float hc = hash11(c * 3.17 + seed);
          float center = c + 0.5 + (hash11(c + seed * 2.0) - 0.5) * 0.7;
          float halfW = 0.55 + 0.35 * hc;
          float th = amp * (0.45 + 0.55 * hc);
          float t = 1.0 - abs(g - center) / halfW;
          if (t > 0.0) {
            // stepped branch tiers
            float tier = fract(t * 3.0);
            float prof = t + (tier < 0.35 ? 0.08 : 0.0);
            top = max(top, ground + th * prof);
          }
        }
        hit = P.y < top;
        if (hit && B.x > 0.0 && P.y > top - B.x * onePx && hash21(vec2(px.x, 3.0)) > 0.25) lc = uLayerCol2[i];
      } else if (type == 5) {                            // round deciduous trees / hedges
        float w = 1.0 / freq;
        float g = X / w;
        float cell = floor(g);
        float ground = base + amp * 0.1 * fbm1(X * 3.0 + seed);
        top = ground;
        for (int k = -1; k <= 1; k++) {
          float c = cell + float(k);
          float hc = hash11(c * 5.31 + seed);
          if (hc < 0.25) continue;
          float center = c + 0.5 + (hash11(c * 1.9 + seed) - 0.5) * 0.6;
          float r = 0.45 + 0.4 * hc;
          float dx = (g - center) / r;
          if (abs(dx) < 1.0) {
            float crown = sqrt(1.0 - dx * dx) * amp * (0.5 + 0.5 * hc);
            top = max(top, ground + amp * 0.35 * hc + crown * 0.8);
          }
        }
        hit = P.y < top;
        if (hit && P.y > top - 2.0 * onePx && bd > 0.5) lc = mix(lc, uLayerCol2[i], 0.6);
      } else if (type == 6) {                            // sea with glitter
        top = base;
        hit = P.y < top;
        if (hit) {
          float depth = clamp((top - P.y) / max(top, 0.05), 0.0, 1.0);
          float dq = floor(pow(depth, 0.7) * 7.0 + bd) / 7.0;
          vec3 water = mix(uLayerCol2[i], uLayerCol[i], dq);
          float row = floor(px.y);
          float drift = uTime * (0.4 + 0.8 * hash11(row)) * (hash11(row * 3.0) > 0.5 ? 1.0 : -1.0);
          float wl = noise2(vec2(px.x * (0.05 + depth * 0.05) + drift, row * 1.7));
          if (wl > 0.74 - 0.08 * depth) water = mix(water, uLayerCol3[i], 0.55);
          float cw = 0.012 + depth * 0.09;
          float jitter = noise2(vec2(row * 0.9, uTime * 1.5));
          if (uSunVis > 0.0 && abs(P.x - uSun.x) < cw * (0.3 + jitter)) {
            if (hash21(vec2(floor(px.x / 2.0), row + floor(uTime * 3.0))) > 0.4)
              water = mix(water, mix(uSunCol, vec3(1.0, 0.95, 0.8), 0.4), 0.85 * uSunVis);
          }
          if (uMoonVis > 0.0 && abs(P.x - uMoon.x) < cw * 0.7 * (0.3 + jitter)) {
            if (hash21(vec2(floor(px.x / 2.0), row + floor(uTime * 2.0))) > 0.5)
              water = mix(water, vec3(0.85, 0.88, 0.95), 0.7 * uMoonVis);
          }
          lc = water;
        }
      } else if (type == 7) {                            // near ground / field
        top = base + amp * fbm1(X * freq + seed);
        hit = P.y < top;
        if (hit) {
          if (P.y > top - onePx && hash21(vec2(px.x, 7.0)) > 0.45) lc = uLayerCol2[i];
          else if (hash21(px) > 0.92) lc = mix(lc, uLayerCol2[i], 0.5);
        }
      } else if (type == 8) {                            // headland + lighthouse
        float start = B.y;                               // x where the cliff begins
        float rise = smoothstep(start, start + 0.3, X);
        top = base + amp * rise * (0.55 + 0.6 * fbm1(X * freq * 0.5 + seed));
        hit = rise > 0.0 && P.y < top && P.y >= base - onePx;
        float lx = start + 0.3;
        float baseY = base + amp * smoothstep(start, start + 0.3, lx) * (0.55 + 0.6 * fbm1(lx * freq * 0.5 + seed)) - onePx;
        float towerH = 0.1;
        float halfW = (2.5 - 1.0 * clamp((P.y - baseY) / towerH, 0.0, 1.0)) * onePx;
        if (P.y >= baseY - onePx && P.y < baseY + towerH && abs(P.x - lx) < halfW) {
          float band = floor((P.y - baseY) / (towerH / 5.0));
          lc = mod(band, 2.0) < 1.0 ? uLayerCol2[i] : uLayerCol3[i];
          if (P.x > lx + 0.5 * onePx) lc *= 0.8;
          hit = true;
        }
        // lamp + sweeping beam
        float ly = baseY + towerH + 1.5 * onePx;
        if (abs(P.x - lx) < 2.0 * onePx && P.y >= baseY + towerH && P.y < ly + 1.5 * onePx) {
          lc = mix(uLayerCol[i] * 0.6, vec3(1.0, 0.92, 0.6), uNight);
          hit = true;
        }
        if (uNight > 0.15) {
          float ang = uTime * 0.9;
          float dir = cos(ang);
          float len = 0.55 * abs(dir);
          float dx = (P.x - lx) * sign(dir);
          float spread = 0.006 + dx * 0.09;
          if (dx > 0.0 && dx < len && abs(P.y - ly) < spread) {
            float a = (1.0 - dx / len) * 0.55 * uNight;
            if (bd < a) { col = mix(col, vec3(1.0, 0.95, 0.75), 0.5); }
          }
          float face = max(0.0, sin(ang)) * (1.0 - smoothstep(0.0, 0.35, abs(dir)));
          if (length(P - vec2(lx, ly)) < (2.0 + 5.0 * face) * onePx && bd < 0.6 + face) {
            col = vec3(1.0, 0.95, 0.75);
          }
        }
      }

      if (hit) {
        col = lc;
        // atmospheric haze + dithered mist hugging the horizon
        float far = B.w;
        col = mix(col, uMistCol, uHaze * far);
        // mist hugging the horizon, in a few hard bands
        float m = uMist * far * exp(-max(0.0, P.y - uHorizon + 0.015) / 0.07);
        m = floor(m * 5.0 + bd * 0.999) / 5.0;
        col = mix(col, uMistCol, m * 0.8);
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky() {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uHorizon: { value: 0.18 },
    uZenith: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizonCol: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, -1, 0.03) },
    uSunCol: { value: new THREE.Color() },
    uSunVis: { value: 0 },
    uMoon: { value: new THREE.Vector3(0, -1, 0.025) },
    uMoonVis: { value: 0 },
    uMoonPhase: { value: 0.45 },
    uStars: { value: 0 },
    uCover: { value: 0.3 },
    uCloudLit: { value: new THREE.Color() },
    uCloudMid: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uCloudTime: { value: 0 },
    uFlash: { value: 0 },
    uNight: { value: 0 },
    uMist: { value: 0 },
    uMistCol: { value: new THREE.Color() },
    uHaze: { value: 0 },
    uLayerType: { value: new Array(MAX_LAYERS).fill(0) },
    uLayerA: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector4()) },
    uLayerB: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector4()) },
    uLayerCol: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Color()) },
    uLayerCol2: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Color()) },
    uLayerCol3: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Color()) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, uniforms };
}
