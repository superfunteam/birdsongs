// Render the share card (og.png), the install-sheet screenshots and the
// 96px scene icons used by the manifest shortcuts, straight from the app.
//
//   npm run dev                        (in another terminal)
//   npm run share-images [-- http://localhost:5173]
//
// Needs Google Chrome (set CHROME=/path/to/chrome if it lives elsewhere).
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.OUT || join(ROOT, 'public');
const URL = process.argv[2] || 'http://localhost:5173';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const only = process.env.ONLY; // e.g. ONLY=og to redo just the card

mkdirSync(join(PUB, 'screenshots'), { recursive: true });
mkdirSync(join(PUB, 'icons'), { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// open the app in a given moment; ui: keep the corner dock / song card visible
async function moment(page, { scene, tod, weather, birds = 'mixed', silhouette = false, ui = false, fill = 1 }) {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(
    ({ scene, tod, weather, birds, silhouette, ui, fill }) => {
      document.getElementById('intro')?.remove();
      if (!ui) document.head.insertAdjacentHTML('beforeend', '<style>.dock,.toast,.flash{display:none!important}</style>');
      const b = window.birdsongs;
      const st = b.stage;
      b.setScene(scene);
      b.setTime(tod);
      b.setWeather(weather);
      st.birdKind = birds;
      if (silhouette) st.setSilhouette(true);
      // a still moment: no new arrivals, wires nicely full
      b.conductor.cancelPending(performance.now() / 1000);
      b.conductor.play = null;
      st.flock.clear();
      st.flock.populate(Math.round(st.flock.targetPopulation() * fill), performance.now() / 1000, st.current.species);
    },
    { scene, tod, weather, birds, silhouette, ui, fill },
  );
  await wait(1800);
}

// a few little notes rising from birds, as if they'd just played
async function notes(page, count) {
  await page.evaluate((count) => {
    const st = window.birdsongs.stage;
    const birds = st.flock.birds.filter((b) => b.loadOn).sort(() => Math.random() - 0.5).slice(0, count);
    const now = performance.now() / 1000;
    birds.forEach((b, i) => st.flock.onNote(b, 'land', now - i * 0.25));
  }, count);
  await wait(450);
}

if (!only || only === 'og') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  const look = process.env.OG_LOOK ? JSON.parse(process.env.OG_LOOK) : { scene: 4, tod: 0.737, weather: 'fair', fill: 1.2 };
  await moment(page, look);
  await notes(page, 4);
  await page.evaluate(() => {
    document.head.insertAdjacentHTML(
      'beforeend',
      `<style>
        .og { position: fixed; left: 44px; bottom: 40px; padding: 18px 34px 22px; background: rgba(13,11,26,.86);
          box-shadow: 0 -3px 0 0 #2e2848, 0 3px 0 0 #2e2848, -3px 0 0 0 #2e2848, 3px 0 0 0 #2e2848, 0 9px 0 0 rgba(0,0,0,.35); }
        .og h1 { margin: 0; font: 700 104px/1 'Pixelify Sans', monospace; color: #f1e7d0; text-shadow: 4px 4px 0 #3b2f5c, 8px 8px 0 rgba(0,0,0,.35); }
        .og p { margin: 8px 0 0 4px; font: 500 38px/1 'Pixelify Sans', monospace; color: #ffb86b; letter-spacing: .02em; }
      </style>`,
    );
    const el = document.createElement('div');
    el.className = 'og';
    el.innerHTML = '<h1>birdsongs</h1><p>lo-fi radio</p>';
    document.body.appendChild(el);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(PUB, 'og.png') });
  console.log('og.png');
  await page.close();
}

if (!only || only === 'screenshots') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await moment(page, { scene: 0, tod: 0.745, weather: 'drizzle', ui: true });
  await page.evaluate(() => window.birdsongs.conductor.onSong(window.birdsongs.conductor.songs.find((s) => s.id === 'gymnopedie-1')));
  await notes(page, 3);
  await page.screenshot({ path: join(PUB, 'screenshots/wide.png') });
  await moment(page, { scene: 4, tod: 0.742, weather: 'fair', silhouette: true, ui: true });
  await page.evaluate(() => window.birdsongs.conductor.onSong(window.birdsongs.conductor.songs.find((s) => s.id === 'clair-de-lune')));
  await notes(page, 3);
  await page.screenshot({ path: join(PUB, 'screenshots/seaside.png') });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await moment(page, { scene: 3, tod: 0.62, weather: 'snow', birds: 'cardinal', ui: true });
  await page.evaluate(() => window.birdsongs.conductor.onSong(window.birdsongs.conductor.songs.find((s) => s.id === 'fur-elise')));
  await notes(page, 3);
  await page.screenshot({ path: join(PUB, 'screenshots/narrow.png') });
  console.log('screenshots/wide.png, seaside.png, narrow.png');
  await page.close();
}

if (!only || only === 'scenes') {
  // copy a 96x96 patch straight out of the low-res render: 1 art pixel = 1 pixel
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const looks = [
    ['rainy-dusk', 0, 0.74, 'fair'],
    ['first-light', 1, 0.262, 'clear'],
    ['midnight-storm', 2, 0.95, 'rain'],
    ['snowfall', 3, 0.62, 'flurries'],
    ['seaside', 4, 0.735, 'fair'],
  ];
  for (const [id, scene, tod, weather] of looks) {
    await moment(page, { scene, tod, weather, fill: 1.4 });
    const data = await page.evaluate(() => {
      const st = window.birdsongs.stage;
      const px = st.pixel;
      px.render(st.scene, st.camera);
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      // a patch with wires, birds and the horizon
      const sx = Math.round(px.width * 0.5 - 48);
      const sy = Math.round(px.height * 0.93 - 96);
      g.drawImage(px.canvas, sx, sy, 96, 96, 0, 0, 96, 96);
      return c.toDataURL('image/png').split(',')[1];
    });
    writeFileSync(join(PUB, `icons/scene-${id}.png`), Buffer.from(data, 'base64'));
  }
  console.log('icons/scene-*.png');
  await page.close();
}

await browser.close();
