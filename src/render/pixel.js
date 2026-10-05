import * as THREE from 'three';

// Pixel art wants the colours we write to be the colours we see.
THREE.ColorManagement.enabled = false;

// Roughly how many "art pixels" the whole screen should have. The actual
// size per pixel is always an integer number of device pixels so the grid
// stays perfectly crisp.
const PIXEL_BUDGET = 96000;

const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uLevels;
  uniform float uDither;
  uniform float uFade;
  uniform vec3 uFadeColor;
  uniform vec3 uLift;
  uniform float uVignette;
  uniform float uSaturation;
  varying vec2 vUv;

  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

  void main() {
    vec2 p = floor(gl_FragCoord.xy);
    vec3 c = texture2D(tDiffuse, vUv).rgb;

    // lofi grade: lifted, tinted blacks and a touch of desaturation
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSaturation);
    c = uLift + c * (1.0 - uLift);

    // soft vignette (gets dithered below, so it stays pixel-y)
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.15);
    c *= 1.0 - dot(q, q) * uVignette;

    // ordered-dither colour quantisation (gentle: the sky does its own banding)
    float d = (bayer8(p) - 0.5) * uDither;
    c = floor(c * uLevels + d + 0.5) / uLevels;

    // dissolve transition
    if (bayer8(p + vec2(3.0, 5.0)) < uFade) c = uFadeColor;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export class PixelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);

    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      // plain 8-bit: every GPU can render into it (half-float needs an
      // extension many TV chips lack), and the post pass quantises anyway
      type: THREE.UnsignedByteType,
    });

    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(4, 4) },
      uLevels: { value: 26 },
      uDither: { value: 0.6 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color('#0b0a14') },
      uLift: { value: new THREE.Color('#120f22') },
      uVignette: { value: 0.42 },
      uSaturation: { value: 0.92 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.width = 4;
    this.height = 4;
    this.scale = 1;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dw = vw * dpr;
    const dh = vh * dpr;
    let scale = Math.max(2, Math.round(Math.sqrt((dw * dh) / PIXEL_BUDGET)));
    // narrow (portrait) screens still need enough pixels across for the birds
    scale = Math.max(2, Math.min(scale, Math.floor(dw / 270)));
    const w = Math.ceil(dw / scale);
    const h = Math.ceil(dh / scale);
    this.scale = scale;
    this.cssPixel = scale / dpr;
    // browser zoom changes dpr and CSS size together, so the CSS size must be
    // refreshed even when the art-pixel grid itself is unchanged
    this.canvas.style.width = `${(w * scale) / dpr}px`;
    this.canvas.style.height = `${(h * scale) / dpr}px`;
    document.documentElement.style.setProperty('--px', `${this.cssPixel}px`);
    if (w === this.width && h === this.height) return false;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
    return true;
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }
}
