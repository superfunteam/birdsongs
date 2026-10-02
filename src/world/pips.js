import * as THREE from 'three';

// A tiny pixel ♪ that rises from a bird the moment it plays its note,
// so you can see which bird made which sound.
const GLYPH = [
  '..##..',
  '..#.#.',
  '..#..#',
  '..#...',
  '.##...',
  '###...',
  '.#....',
];

let texture = null;
function glyphTexture() {
  if (texture) return texture;
  const w = GLYPH[0].length;
  const h = GLYPH.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  GLYPH.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(x, y, 1, 1)));
  texture = new THREE.CanvasTexture(c);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const LIFE = 1.7;

export class NotePips {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.active = [];
    this.pool = [];
    this.enabled = true;
    this.color = new THREE.Color('#fff1cc');
  }

  spawn(pos, now, pxWorld, drift = 0) {
    if (!this.enabled) return;
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glyphTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false }),
      );
      s.renderOrder = 20;
      this.group.add(s);
    }
    s.visible = true;
    s.material.color.copy(this.color);
    s.scale.set(GLYPH[0].length * pxWorld, GLYPH.length * pxWorld, 1);
    s.userData = { born: now, x: pos.x, y: pos.y, z: pos.z, px: pxWorld, drift };
    this.active.push(s);
  }

  update(now) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      const d = s.userData;
      const t = (now - d.born) / LIFE;
      if (t >= 1 || t < 0) {
        s.visible = false;
        this.active.splice(i, 1);
        this.pool.push(s);
        continue;
      }
      // rise in whole art pixels so the glyph stays crisp
      const rise = Math.floor(t * 14) * d.px;
      const sway = Math.round(Math.sin(t * 6 + d.drift) * 1.2) * d.px;
      s.position.set(d.x + sway, d.y + rise, d.z + 0.5);
      s.material.opacity = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
    }
  }

  clear() {
    for (const s of this.active) {
      s.visible = false;
      this.pool.push(s);
    }
    this.active = [];
  }
}
