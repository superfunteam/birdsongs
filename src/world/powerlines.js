import * as THREE from 'three';

// Wires are the staff. Each one is a chain of sagging spans between poles.
// Perched birds weigh their span down (string Green's function) and every
// landing / take-off plucks it so the line visibly rings with the note.

const ramp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });

const MATS = {
  wood: toon('#5d4433'),
  woodDark: toon('#463326'),
  metal: toon('#6c7178'),
  can: toon('#8a9097'),
  glass: toon('#7fa39a'),
  ceramic: toon('#cfcac0'),
  black: toon('#1c1c20'),
};
for (const m of Object.values(MATS)) m.userData.base = m.color.clone();

export function setPoleSilhouette(on, color) {
  for (const m of Object.values(MATS)) m.color.copy(on ? color : m.userData.base);
}

let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

const PLUCK_HZ = 2.1;
const PLUCK_DECAY = 1.6;
const LOAD_K = 0.11;

export class PowerLines {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.wires = [];
    this.poles = [];
    this.lampLights = [];
    this.lineMat = new THREE.LineBasicMaterial({ color: '#141418', fog: true });
    this.thickMat = new THREE.LineBasicMaterial({ color: '#101014', fog: true });
  }

  clear() {
    for (const child of [...this.group.children]) {
      child.removeFromParent();
      child.traverse?.((o) => o.geometry?.dispose?.());
    }
    this.wires = [];
    this.poles = [];
    this.lampLights = [];
  }

  // layout: { poleXs:[...visible + offscreen], heights:[...], sag, xMin, xMax, pxWorld, poleOpts }
  build(layout) {
    this.clear();
    this.layout = layout;
    const xs = [...layout.poleXs].sort((a, b) => a - b);
    this.poleXs = xs;
    this.spans = [];
    for (let i = 0; i < xs.length - 1; i++) this.spans.push({ a: xs[i], b: xs[i + 1] });

    layout.heights.forEach((h, i) => {
      const wire = {
        index: i,
        attach: h,
        sag: layout.sag * (0.9 + 0.2 * ((i * 37) % 5) / 5),
        loads: new Map(),
        plucks: [],
        thick: i === 0 && layout.thickBottom,
      };
      const n = Math.ceil((xs[xs.length - 1] - xs[0]) / 0.1) + 1;
      wire.xs = new Float32Array(n);
      for (let k = 0; k < n; k++) wire.xs[k] = xs[0] + ((xs[xs.length - 1] - xs[0]) * k) / (n - 1);
      const geo = new THREE.BufferGeometry();
      wire.positions = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(wire.positions, 3));
      wire.line = new THREE.Line(geo, wire.thick ? this.thickMat : this.lineMat);
      wire.line.frustumCulled = false;
      this.group.add(wire.line);
      if (wire.thick) {
        const geo2 = new THREE.BufferGeometry();
        wire.positions2 = new Float32Array(n * 3);
        geo2.setAttribute('position', new THREE.BufferAttribute(wire.positions2, 3));
        wire.line2 = new THREE.Line(geo2, this.thickMat);
        wire.line2.frustumCulled = false;
        this.group.add(wire.line2);
      }
      this.wires.push(wire);
    });

    for (const x of xs) {
      const opts = layout.poleOpts?.get(x) || {};
      const lift = this.lift(x);
      const pole = this.buildPole(x, layout.heights.map((h) => h + lift), opts);
      this.group.add(pole);
      this.poles.push(pole);
    }
    this.time = 0;
    this.update(0, 0, 0);
  }

  buildPole(x, heights, opts) {
    const g = new THREE.Group();
    g.position.set(x, 0, -0.2);
    const top = heights[heights.length - 1];
    const poleTop = top + 0.55;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, poleTop, 7), MATS.wood);
    shaft.position.y = poleTop / 2;
    g.add(shaft);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.12, 7), MATS.woodDark);
    cap.position.y = poleTop + 0.06;
    g.add(cap);

    // crossarm runs toward the camera (perpendicular to the wires)
    const armY = top - 0.17;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 1.9), MATS.woodDark);
    arm.position.set(0, armY, 0.1);
    g.add(arm);
    for (const s of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.035), MATS.metal);
      brace.position.set(0, armY - 0.25, 0.1 + s * 0.28);
      brace.rotation.x = s * 0.75;
      g.add(brace);
    }
    // pin insulators on the arm; the middle one carries the top staff wire
    for (const z of [-0.7, 0.2, 0.9]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.14, 6), MATS.glass);
      ins.position.set(0, armY + 0.12, z);
      g.add(ins);
    }

    // secondary rack: spool insulators stacked down the front of the pole
    const rackWires = heights.slice(1, -1);
    if (rackWires.length) {
      const lo = rackWires[0] - 0.15;
      const hi = rackWires[rackWires.length - 1] + 0.15;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.06, hi - lo, 0.05), MATS.metal);
      rack.position.set(0, (lo + hi) / 2, 0.14);
      g.add(rack);
      for (const h of rackWires) {
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), MATS.ceramic);
        spool.rotation.x = Math.PI / 2;
        spool.position.set(0, h, 0.2);
        g.add(spool);
      }
    }
    // bottom cable clamp
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), MATS.black);
    clamp.position.set(0, heights[0] + 0.02, 0.17);
    g.add(clamp);

    if (opts.transformer && heights.length > 2) {
      const ty = (heights[heights.length - 1] + heights[heights.length - 2]) / 2 - 0.05;
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.62, 8), MATS.can);
      can.position.set(0, ty, -0.36);
      g.add(can);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 8), MATS.metal);
      lid.position.set(0, ty + 0.33, -0.36);
      g.add(lid);
      for (const dx of [-0.1, 0.1]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.14, 5), MATS.ceramic);
        b.position.set(dx, ty + 0.42, -0.36);
        g.add(b);
      }
    }

    if (opts.lamp) {
      const ly = heights[0] - 1.25;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), MATS.metal);
      armL.position.set(0.5 * opts.lampDir, ly, 0.12);
      armL.rotation.z = -0.12 * opts.lampDir;
      g.add(armL);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.18), MATS.black);
      head.position.set(1.05 * opts.lampDir, ly - 0.08, 0.12);
      g.add(head);
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.04, 0.12),
        new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false }),
      );
      bulb.position.set(1.05 * opts.lampDir, ly - 0.13, 0.12);
      g.add(bulb);
      const light = new THREE.PointLight('#ffc27a', 0, 5.5, 1.8);
      light.position.set(1.05 * opts.lampDir, ly - 0.35, 0.4);
      g.add(light);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffc98a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      halo.scale.setScalar(2.6);
      halo.position.set(1.05 * opts.lampDir, ly - 0.2, 0.3);
      g.add(halo);
      this.lampLights.push({ light, bulb, halo, worldX: x + 1.05 * opts.lampDir, y: ly });
    }
    return g;
  }

  span(x) {
    for (let i = 0; i < this.spans.length; i++) {
      const s = this.spans[i];
      if (x >= s.a && x <= s.b) return { i, a: s.a, b: s.b, u: (x - s.a) / (s.b - s.a) };
    }
    return null;
  }

  // poles can stand higher or lower (shuffled layouts), tilting their spans
  lift(x) {
    return this.layout.poleLift?.get(x) || 0;
  }

  baseY(w, x) {
    const wire = this.wires[w];
    const s = this.span(x);
    if (!s) return wire.attach;
    const len = s.b - s.a;
    const la = this.lift(s.a);
    const lb = this.lift(s.b);
    return wire.attach + la + (lb - la) * s.u - wire.sag * (len / this.layout.refSpan) * 4 * s.u * (1 - s.u);
  }

  // full displaced height at x
  y(w, x) {
    return this.baseY(w, x) + this.offset(w, x, this.span(x));
  }

  // slope of the resting wire (for tilting things that sit on it)
  slope(w, x) {
    return (this.y(w, x + 0.05) - this.y(w, x - 0.05)) / 0.1;
  }

  offset(w, x, s) {
    if (!s) return 0;
    const wire = this.wires[w];
    const len = s.b - s.a;
    const u = s.u;
    let d = 0;
    for (const load of wire.loads.values()) {
      if (load.span !== s.i) continue;
      const ub = load.u;
      const g = u < ub ? u * (1 - ub) : ub * (1 - u);
      d -= LOAD_K * load.m * load.k * g * len * 0.25;
    }
    const t = this.time;
    for (const p of wire.plucks) {
      if (p.span !== s.i) continue;
      const age = t - p.t0;
      if (age < 0) continue;
      const env = Math.exp(-age * PLUCK_DECAY);
      d +=
        p.amp * env *
        (Math.sin(Math.PI * u) * Math.sin(Math.PI * p.u) * Math.sin(age * Math.PI * 2 * PLUCK_HZ) +
          0.6 * Math.sin(2 * Math.PI * u) * Math.sin(2 * Math.PI * p.u) * Math.sin(age * Math.PI * 2 * PLUCK_HZ * 2.1));
    }
    // a slow sway in the wind
    d += this.wind * 0.05 * Math.sin(Math.PI * u) * Math.sin(t * 0.8 + w * 0.9 + s.i * 1.7) * (len / this.layout.refSpan);
    return d;
  }

  setLoad(id, w, x, m) {
    const s = this.span(x);
    const wire = this.wires[w];
    if (!s || !wire) return;
    const prev = wire.loads.get(id);
    wire.loads.set(id, { span: s.i, u: s.u, m, k: prev ? prev.k : 0, target: 1 });
  }

  removeLoad(id, w) {
    const load = this.wires[w]?.loads.get(id);
    if (load) load.target = 0;
  }

  pluck(w, x, amp) {
    const s = this.span(x);
    const wire = this.wires[w];
    if (!s || !wire) return;
    wire.plucks.push({ span: s.i, u: s.u, t0: this.time, amp });
    if (wire.plucks.length > 12) wire.plucks.shift();
  }

  update(time, dt, wind) {
    this.time = time;
    this.wind = wind;
    const px = this.layout.pxWorld;
    for (const wire of this.wires) {
      // ease loads in/out so the wire dips smoothly
      for (const [id, load] of wire.loads) {
        load.k += (load.target - load.k) * (1 - Math.exp(-dt * 14));
        if (load.target === 0 && load.k < 0.01) wire.loads.delete(id);
      }
      wire.plucks = wire.plucks.filter((p) => time - p.t0 < 4);
      const pos = wire.positions;
      for (let k = 0; k < wire.xs.length; k++) {
        const x = wire.xs[k];
        const y = this.y(wire.index, x);
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = 0;
        if (wire.positions2) {
          wire.positions2[k * 3] = x;
          wire.positions2[k * 3 + 1] = y - px;
          wire.positions2[k * 3 + 2] = 0;
        }
      }
      wire.line.geometry.attributes.position.needsUpdate = true;
      if (wire.line2) wire.line2.geometry.attributes.position.needsUpdate = true;
    }
  }

  setColors(lineColor, lampsOn) {
    this.lineMat.color.copy(lineColor);
    this.thickMat.color.copy(lineColor).multiplyScalar(0.8);
    for (const l of this.lampLights) {
      l.light.intensity = lampsOn * 4.5;
      l.bulb.material.color.set(lampsOn > 0.2 ? '#ffe2a8' : '#59544c');
      l.halo.material.opacity = lampsOn * 0.55;
    }
  }
}
