// Record Birdsongs videos with sound, straight from the app.
//
//   npm run dev                                   (in another terminal)
//   node scripts/record-video.mjs <name> [url]    (names: demo, rainy-dusk, seaside, snowfall)
//
// Video: Chrome's screencast frames (lossless PNG, ~60/s), re-timed to a
// constant 60 fps and piped into ffmpeg. Audio: the app's final mix, recorded
// in the page. Both are lined up by wall-clock timestamp. Writes media/*.mp4.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 60;
const [name = 'demo', URL_BASE = 'http://localhost:5173'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the videos
// samples: one scene at real time; the song starts from the top
const SAMPLES = {
  'rainy-dusk': { seconds: 120, scene: 'rainy-dusk', tod: 0.733, weather: 'drizzle', song: 'gymnopedie-1', next: 'pocket-full-of-rain' },
  seaside: { seconds: 120, scene: 'seaside', tod: 0.727, weather: 'fair', song: 'clair-de-lune', silhouette: true },
  snowfall: { seconds: 120, scene: 'snowfall', tod: 0.676, weather: 'snow', song: 'fur-elise', birds: 'cardinal' },
};

const CURSOR_CSS = `
  .rec-cursor { position: fixed; left: 50%; top: 110%; width: 22px; height: 30px; z-index: 99999; pointer-events: none;
    transition: left 1.1s cubic-bezier(.45,.05,.3,1), top 1.1s cubic-bezier(.45,.05,.3,1); filter: drop-shadow(2px 2px 0 rgba(0,0,0,.35)); }
  .rec-cursor svg { width: 100%; height: 100%; display: block; }
  .rec-cursor.press svg { transform: scale(.86); transform-origin: 0 0; }
  .rec-ring { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border: 3px solid #ffb86b; z-index: 99998;
    pointer-events: none; animation: rec-ring .5s steps(5) forwards; }
  @keyframes rec-ring { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }`;
const CURSOR_SVG = (() => {
  const rows = ['X..........', 'XX.........', 'XWX........', 'XWWX.......', 'XWWWX......', 'XWWWWX.....', 'XWWWWWX....', 'XWWWWWWX...',
    'XWWWWWWWX..', 'XWWWWWWWWX.', 'XWWWWWXXXXX', 'XWWXWWX....', 'XWX.XWWX...', 'XX..XWWX...', 'X....XWWX..', '.....XWWX..', '......XX...'];
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === 'X' ? '#0b0a14' : '#f1e7d0'}"/>`;
  }));
  return `<svg viewBox="0 0 11 17" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${r}</svg>`;
})();

// the demo: a calm tour of everything
async function demo(page, cue) {
  const at = async (sel, ms = 1300) => {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const c = document.querySelector('.rec-cursor');
      c.style.left = `${r.left + r.width * 0.55}px`;
      c.style.top = `${r.top + r.height * 0.55}px`;
    }, sel);
    await sleep(ms);
  };
  const click = async (sel, hold = 0) => {
    await at(sel);
    await page.evaluate((sel) => {
      const c = document.querySelector('.rec-cursor');
      c.classList.add('press');
      const ring = document.createElement('div');
      ring.className = 'rec-ring';
      ring.style.left = c.style.left;
      ring.style.top = c.style.top;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 600);
      setTimeout(() => c.classList.remove('press'), 140);
      document.querySelector(sel).click();
    }, sel);
    await sleep(hold);
  };
  const run = (fn, arg) => page.evaluate(fn, arg);

  await sleep(2500); // the title card over the rain
  await click('#start'); // music: Gymnopédie, birds start playing
  await cue('music');
  await sleep(15000);
  cue('panel');
  await click('#dock-toggle', 2500);
  await click('#t-silhouette', 7000); // silhouettes at sunset
  await click('#t-silhouette', 2500);
  cue('scenes');
  await click('#scene-next', 7500); // First Light
  await click('#scene-next', 2000); // Midnight Storm
  await run(() => { window.birdsongs.stage.fx.nextStrike = 0; });
  await sleep(4500);
  await run(() => { window.birdsongs.stage.fx.nextStrike = 0; });
  await sleep(3000);
  await click('#scene-next', 5000); // Snowfall
  cue('birds');
  await click('#bird-prev', 1800); // gulls
  await click('#bird-prev', 1800); // chickadees
  await click('#bird-prev', 7000); // cardinals in the snow
  await click('#bird-next', 1200);
  await click('#bird-next', 1200);
  await click('#bird-next', 2500); // back to all kinds
  await click('#scene-next', 6000); // Seaside
  await click('#t-silhouette', 8000);
  cue('shuffle');
  await click('#t-shuffle', 6500); // a new random staff
  await click('#reshuffle', 6500); // and another
  await click('#t-shuffle', 4500); // back to the seaside wires
  cue('song');
  await click('#skip', 13000); // next song (Little Wire Waltz)
  await click('#hide-ui', 1200);
  await page.evaluate(() => { document.querySelector('.rec-cursor').style.top = '115%'; });
  await sleep(9000);
}

// ---------------------------------------------------------------- recording
async function record() {
  mkdirSync(OUT, { recursive: true });
  const sample = SAMPLES[name];
  if (!sample && name !== 'demo') throw new Error(`unknown video "${name}"`);
  const q = sample
    ? new URLSearchParams({ scene: sample.scene, song: sample.song, ...(sample.birds ? { birds: sample.birds } : {}), silhouette: sample.silhouette ? '1' : '0', shuffle: '0', notes: '1' })
    : new URLSearchParams({ scene: 'rainy-dusk', song: 'gymnopedie-1', birds: 'mixed', silhouette: '0', shuffle: '0', notes: '1' });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.clear());
  await page.goto(`${URL_BASE}/?${q}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const setup = sample || { tod: 0.735, weather: 'drizzle', next: 'little-wire-waltz' };
  await page.evaluate(({ tod, weather }) => {
    window.birdsongs.setTime(tod);
    window.birdsongs.setWeather(weather);
  }, setup);

  if (sample) {
    // clean frame: no dock, no cursor; keep the song card when it appears
    await page.addStyleTag({ content: '.dock,.intro{display:none!important} body.idle .toast.show{opacity:1}' });
    await page.evaluate(() => document.getElementById('start').click());
  } else {
    await page.addStyleTag({ content: `${CURSOR_CSS} body.idle .toast.show{opacity:1}` });
    await page.evaluate((svg) => document.body.insertAdjacentHTML('beforeend', `<div class="rec-cursor">${svg}</div>`), CURSOR_SVG);
  }

  // ---- audio: tap the final mix once the audio engine exists
  const audioPath = join(OUT, `.${name}.webm`);
  const audioFile = createWriteStream(audioPath);
  let audioStart = null;
  let audioLatency = 0;
  await page.exposeFunction('__recAudio', (b64) => audioFile.write(Buffer.from(b64, 'base64')));
  await page.exposeFunction('__recAudioStart', (epochMs, latency) => {
    audioStart = epochMs / 1000;
    audioLatency = latency;
  });
  const armAudio = () =>
    page.evaluate((next) => {
      const tryStart = () => {
        const a = window.birdsongs.audio;
        if (!a.output || a.ctx.state !== 'running') return setTimeout(tryStart, 20);
        const dest = a.ctx.createMediaStreamDestination();
        a.output.connect(dest);
        const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 });
        rec.ondataavailable = async (e) => {
          const buf = new Uint8Array(await e.data.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          window.__recAudio(btoa(s));
        };
        rec.onstart = () => window.__recAudioStart(Date.now(), a.ctx.outputLatency || a.ctx.baseLatency || 0);
        rec.start(1000);
        window.__rec = rec;
        window.__notes = [];
        const play = a.playEvent.bind(a);
        a.playEvent = (e, d) => {
          window.__notes.push(performance.timeOrigin / 1000 + e.time);
          return play(e, d);
        };
        // line up what plays after this song
        if (next) {
          const c = window.birdsongs.conductor;
          const i = c.songs.findIndex((s) => s.id === next);
          if (i >= 0) c.order.splice(c.orderPos + 1, 0, i);
        }
      };
      tryStart();
    }, setup.next || null);
  if (sample) await armAudio();

  // ---- video: screencast frames → constant 60 fps → ffmpeg
  const rawPath = join(OUT, `.${name}.video.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-pix_fmt', 'yuv420p', rawPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((r) => ff.on('close', r));
  const cdp = await page.createCDPSession();
  let t0 = null;
  let last = null;
  let written = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const ts = f.metadata.timestamp;
    if (t0 == null) t0 = ts;
    const due = Math.floor((ts - t0) * FPS);
    while (last && written < due) {
      ff.stdin.write(last);
      written++;
    }
    last = Buffer.from(f.data, 'base64');
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

  const started = Date.now();
  if (sample) {
    await sleep((Number(process.env.CLIP_SECONDS) || sample.seconds) * 1000);
  } else {
    // the demo arms audio right after "tap to listen"
    let armed = false;
    await demo(page, async (label) => {
      console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s  ${label}`);
      if (!armed) {
        armed = true;
        await armAudio();
      }
    });
  }
  await cdp.send('Page.stopScreencast');
  const end = Math.floor((Date.now() / 1000 - t0) * FPS);
  while (last && written < end) {
    ff.stdin.write(last);
    written++;
  }
  ff.stdin.end();
  const noteTimes = await page.evaluate(() => window.__notes || []);
  await page.evaluate(() => new Promise((r) => { window.__rec.onstop = () => setTimeout(r, 300); window.__rec.stop(); }));
  await ffDone;
  audioFile.end();
  await browser.close();

  // ---- mux: audio delayed by its start offset + the output latency the app compensates for
  const offset = audioStart - t0 + audioLatency;
  const final = join(OUT, `birdsongs-${name === 'demo' ? 'demo' : `sample-${name}`}.mp4`);
  await new Promise((resolve, reject) => {
    const mux = spawn('ffmpeg', ['-y', '-nostdin', '-loglevel', 'error', '-i', rawPath, '-itsoffset', offset.toFixed(3), '-i', audioPath,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-shortest', '-movflags', '+faststart', final], { stdio: ['ignore', 'inherit', 'inherit'] });
    mux.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
  rmSync(rawPath, { force: true });
  rmSync(audioPath, { force: true });
  if (process.env.NOTE_LOG) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.NOTE_LOG, JSON.stringify(noteTimes.map((t) => t - t0)));
  }
  console.log(`wrote ${final}  (${(written / FPS).toFixed(1)}s, audio offset ${offset.toFixed(3)}s)`);
}

await record();
