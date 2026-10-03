import ART from './icon-art.json';

// The tab icon and the browser's theme colour follow the sky: the same
// pixel bird as the app icon, but its sky is the scene's current gradient.

const hex = (c) => `#${c.getHexString()}`;
const lerp = (a, b, t) => a.clone().lerp(b, t);

// same procedural hills as scripts/make-icons.py
const hillTop = (x) => Math.round(27 + Math.sin(x * 0.42) * 1.3 + Math.sin(x * 0.19 + 1) * 0.9);

export class LiveIcon {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 32;
    this.ctx = this.canvas.getContext('2d');
    this.link = document.createElement('link');
    this.link.rel = 'icon';
    this.link.type = 'image/png';
    this.theme = document.querySelector('meta[name="theme-color"]');
    this.last = -Infinity;
    this.lastTheme = '';
  }

  update(now, atmo, force = false) {
    if (!force && now - this.last < 15) return;
    this.last = now;
    const { zen, mid, hor } = atmo;
    // nine sky bands from the zenith through the middle to the horizon glow
    const ramp = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      ramp.push(hex(t < 0.5 ? lerp(zen, mid, t * 2) : lerp(mid, hor, (t - 0.5) * 2)));
    }
    const art = ART.big;
    const g = this.ctx;
    const night = atmo.stars > 0.3;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        let ch = art.rows[y][x];
        if (ch === 'S' && !night) ch = '.';
        let col;
        if (ch !== '.') col = ART.colors[ch];
        else if (y >= hillTop(x)) col = '#1d1830';
        else if (y === art.wire) col = '#120f1f';
        else {
          let band = Math.min(8, Math.floor(y / 3));
          if (band > 0 && y % 3 === 0 && (x + y) % 2 === 0) band--;
          col = ramp[band];
        }
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    this.link.href = this.canvas.toDataURL('image/png');
    if (!this.link.isConnected) document.head.appendChild(this.link);
    const theme = hex(zen);
    if (this.theme && theme !== this.lastTheme) {
      this.theme.setAttribute('content', theme);
      this.lastTheme = theme;
    }
  }
}
