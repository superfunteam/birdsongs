import * as THREE from 'three';

// Rain: GPU-animated line streaks (1 art-pixel wide by construction).
const RAIN_VERT = /* glsl */ `
  attribute vec4 aDrop;   // x, phase, z, rand
  attribute float aEnd;   // 0 = head, 1 = tail
  uniform float uTime;
  uniform float uIntensity;
  uniform float uTop;
  uniform float uBottom;
  uniform float uSpeed;
  uniform float uLen;
  uniform float uSlant;
  uniform float uSpanX;
  varying float vA;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    float h = uTop - uBottom;
    float speed = uSpeed * (0.85 + 0.3 * fract(aDrop.w * 13.7));
    float travel = mod(aDrop.y * h + uTime * speed, h);
    float y = uTop - travel;
    float x = aDrop.x + uSlant * travel;
    x = mod(x + uSpanX, 2.0 * uSpanX) - uSpanX;
    vec3 dir = normalize(vec3(uSlant, -1.0, 0.0));
    vec3 p = vec3(x, y, aDrop.z) - dir * uLen * aEnd * (0.7 + 0.6 * fract(aDrop.w * 7.1));
    if (aDrop.w > uIntensity) p.y = -1000.0;
    vA = 0.55 + 0.45 * fract(aDrop.w * 3.3);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const RAIN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vA);
    #include <fog_fragment>
  }
`;

const SNOW_VERT = /* glsl */ `
  attribute vec4 aFlake;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uTop;
  uniform float uBottom;
  uniform float uSpanX;
  uniform float uWind;
  varying float vA;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    float h = uTop - uBottom;
    float speed = 0.7 + 0.8 * fract(aFlake.w * 11.3);
    float travel = mod(aFlake.y * h + uTime * speed, h);
    float y = uTop - travel;
    float x = aFlake.x + sin(uTime * (0.6 + fract(aFlake.w * 5.0)) + aFlake.w * 40.0) * 0.35 + uWind * travel * 0.4;
    x = mod(x + uSpanX, 2.0 * uSpanX) - uSpanX;
    vec3 p = vec3(x, y, aFlake.z);
    if (aFlake.w > uIntensity) p.y = -1000.0;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aFlake.z > 6.0 ? 2.0 : 1.0;
    vA = 0.6 + 0.4 * fract(aFlake.w * 9.1);
    #include <fog_vertex>
  }
`;
const SNOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(uColor, vA);
    #include <fog_fragment>
  }
`;

export class WeatherFX {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // ---- rain
    const RAIN = 2600;
    const drop = new Float32Array(RAIN * 2 * 4);
    const end = new Float32Array(RAIN * 2);
    const pos = new Float32Array(RAIN * 2 * 3);
    for (let i = 0; i < RAIN; i++) {
      const x = (Math.random() * 2 - 1) * 40;
      const ph = Math.random();
      const z = -30 + Math.random() * 46;
      const r = Math.random();
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        drop.set([x, ph, z, r], j * 4);
        end[j] = k;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uTop: { value: 28 },
        uBottom: { value: -2 },
        uSpeed: { value: 26 },
        uLen: { value: 0.9 },
        uSlant: { value: 0.12 },
        uSpanX: { value: 40 },
        uColor: { value: new THREE.Color('#a9b8d6') },
        uOpacity: { value: 0.55 },
      },
    ]);
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.ShaderMaterial({
        uniforms: this.rainUniforms,
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;
    this.group.add(this.rain);

    // ---- snow
    const SNOW = 1800;
    const flake = new Float32Array(SNOW * 4);
    const spos = new Float32Array(SNOW * 3);
    for (let i = 0; i < SNOW; i++) {
      flake.set([(Math.random() * 2 - 1) * 40, Math.random(), -30 + Math.random() * 46, Math.random()], i * 4);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sg.setAttribute('aFlake', new THREE.BufferAttribute(flake, 4));
    this.snowUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uTop: { value: 26 },
        uBottom: { value: -2 },
        uSpanX: { value: 40 },
        uWind: { value: 0.2 },
        uColor: { value: new THREE.Color('#f2f4fa') },
      },
    ]);
    this.snow = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        uniforms: this.snowUniforms,
        vertexShader: SNOW_VERT,
        fragmentShader: SNOW_FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 10;
    this.group.add(this.snow);

    // ---- lightning
    this.boltMat = new THREE.LineBasicMaterial({ color: '#f4f0ff', transparent: true, opacity: 0, fog: false });
    this.bolt = null;
    this.strike = null;
    this.nextStrike = 0;
    this.flash = 0;
  }

  setBounds({ spanX, top }) {
    this.rainUniforms.uSpanX.value = spanX;
    this.snowUniforms.uSpanX.value = spanX;
    this.rainUniforms.uTop.value = top;
    this.snowUniforms.uTop.value = top;
  }

  makeBolt(x, topY, bottomY, z) {
    const pts = [];
    let px = x;
    let py = topY;
    pts.push(new THREE.Vector3(px, py, z));
    const branches = [];
    while (py > bottomY) {
      py -= 1.2 + Math.random() * 2.2;
      px += (Math.random() - 0.5) * 3.2;
      pts.push(new THREE.Vector3(px, py, z));
      if (Math.random() < 0.22) {
        const b = [new THREE.Vector3(px, py, z)];
        let bx = px;
        let by = py;
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
          by -= 1 + Math.random() * 1.8;
          bx += dir * (0.6 + Math.random() * 1.8);
          b.push(new THREE.Vector3(bx, by, z));
        }
        branches.push(b);
      }
    }
    const group = new THREE.Group();
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.boltMat));
    for (const b of branches) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(b), this.boltMat));
    return group;
  }

  // returns a strike event (for thunder) when one begins
  update(now, dt, { rain, snow, storm, wind }, bounds) {
    this.rainUniforms.uTime.value = now;
    this.snowUniforms.uTime.value = now;
    this.rainUniforms.uIntensity.value = rain;
    this.rainUniforms.uSlant.value = 0.08 + wind * 0.28;
    this.snowUniforms.uIntensity.value = snow;
    this.snowUniforms.uWind.value = 0.1 + wind * 0.6;
    this.rain.visible = rain > 0.01;
    this.snow.visible = snow > 0.01;

    let started = null;
    if (storm > 0.25 && now > this.nextStrike) {
      const near = Math.random();
      const visible = Math.random() < 0.6;
      this.strike = { start: now, near, visible, pattern: [0, 0.07, 0.13, 0.22 + Math.random() * 0.15] };
      if (this.bolt) {
        this.bolt.removeFromParent();
        this.bolt.traverse((o) => o.geometry?.dispose());
        this.bolt = null;
      }
      if (visible) {
        const z = -120 - Math.random() * 60;
        const span = bounds.spanX * (1 + (-z + 22) / 30);
        const x = (Math.random() * 2 - 1) * span * 0.45;
        this.bolt = this.makeBolt(x, bounds.top * 2.4 + 30, 0, z);
        this.group.add(this.bolt);
      }
      this.nextStrike = now + (8 + Math.random() * 22) / Math.max(storm, 0.3);
      started = { near, delay: 0.4 + (1 - near) * 3.5 };
    }

    let flash = 0;
    if (this.strike) {
      const t = now - this.strike.start;
      const [, b, c, d] = this.strike.pattern;
      if (t < 0.05) flash = 1;
      else if (t < b) flash = 0.15;
      else if (t < c) flash = 0.7;
      else if (t < d) flash = 0.2;
      else flash = Math.max(0, 0.45 * Math.exp(-(t - d) * 6));
      flash *= 0.55 + 0.45 * this.strike.near;
      if (this.bolt) this.boltMat.opacity = flash > 0.12 ? 1 : 0;
      if (t > 1.5) {
        this.strike = null;
        if (this.bolt) {
          this.bolt.removeFromParent();
          this.bolt.traverse((o) => o.geometry?.dispose());
          this.bolt = null;
        }
      }
    }
    this.flash = flash;
    return started;
  }

  setColors(rainColor, snowColor) {
    this.rainUniforms.uColor.value.copy(rainColor);
    this.snowUniforms.uColor.value.copy(snowColor);
  }
}
