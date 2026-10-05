// Birdsongs on the TV: a Google Cast custom receiver. The Chromecast loads
// this page from the web and runs the whole radio itself; phones and laptops
// only send settings over a message channel, so they can disconnect and it
// keeps playing until someone stops casting.
import './polyfills.js';
import './style.css';
import './receiver.css';
import { createBirdsongs, sceneIndex } from './core.js';
import { DEFAULTS } from './ui/controls.js';
import { CAST_NAMESPACE } from './config.js';
import { startPresence } from './ui/presence.js';

const onCast = /CrKey/i.test(navigator.userAgent) && !!window.cast?.framework;
const params = new URLSearchParams(location.search);
const settings = { ...DEFAULTS, scene: sceneIndex(params.get('scene') || 0) };

const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(kicker, title, sub) {
  toastEl.innerHTML = '';
  for (const [cls, text] of [['kicker', kicker], ['t', title], ['s', sub || '']]) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    toastEl.appendChild(d);
  }
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 9000);
}

let context = null;
let app = null;
const diag = window.__diag || { errors: [] };

// tell every connected phone/laptop what's on now
function broadcast(msg) {
  if (!context) return;
  try {
    context.sendCustomMessage(CAST_NAMESPACE, undefined, msg || { type: 'status', ...app.snapshot() });
  } catch {
    // no senders right now
  }
}

function handle(msg) {
  if (!msg || typeof msg !== 'object' || !app) {
    if (msg?.type === 'hello' && diag.errors.length) broadcast({ type: 'diag', ...diag });
    return;
  }
  if (msg.type === 'state') app.apply(msg);
  else if (msg.type === 'skip') app.skip();
  else if (msg.type === 'reshuffle') app.reshuffle();
  setTimeout(() => broadcast(), 60);
}

// 1. say we're alive before anything heavy, so a later failure can't time out the cast
if (onCast) {
  try {
    const { CastReceiverContext, CastReceiverOptions, system } = window.cast.framework;
    context = CastReceiverContext.getInstance();
    context.addCustomMessageListener(CAST_NAMESPACE, (e) => handle(e.data));
    const options = new CastReceiverOptions();
    // there's no <video>, so tell the device not to close us for being "idle"
    options.disableIdleTimeout = true;
    options.customNamespaces = { [CAST_NAMESPACE]: system.MessageType.JSON };
    options.statusText = 'Birdsongs';
    context.start(options);
  } catch (err) {
    diag.errors.push(`cast: ${err?.message || err}`);
  }
}

// 2. the radio itself
let frames = 0;
try {
  app = createBirdsongs(
    document.getElementById('stage'),
    settings,
    {
      onSong: (song) => {
        toast('now playing', song.title, song.composer);
        broadcast();
      },
      onSceneApplied: (scene) => {
        toast('scene', scene.name, scene.blurb);
        broadcast();
      },
      onFrame: () => {
        frames++;
      },
    },
    { songId: params.get('song'), maxFps: onCast ? 30 : 0 },
  );
  window.__birdsongsBooted = true;
} catch (err) {
  diag.errors.push(`start: ${err?.stack || err?.message || err}`);
  window.__diagShow?.();
  broadcast({ type: 'diag', ...diag });
}

// 3. health for the diagnostics report (read back with `netlify blobs:list cast-logs`)
const health = () => {
  if (!app) return;
  const r = app.pixel.renderer;
  Object.assign(diag, {
    frames,
    art: [app.pixel.width, app.pixel.height, app.pixel.scale],
    webgl2Used: r.capabilities.isWebGL2,
    audioState: app.audio.ctx?.state || 'not created',
    sampleRate: app.audio.ctx?.sampleRate,
    song: app.conductor.song?.title,
    birds: app.stage.flock.birds.length,
  });
};
setInterval(health, 2000);

if (app && onCast) {
  // a receiver may make sound straight away
  app.startAudio().then(health);
} else if (app) {
  // opened in a normal browser to have a look: browsers want a click for sound
  document.body.classList.add('preview');
  window.addEventListener(
    'pointerdown',
    () => {
      document.body.classList.add('heard');
      app.startAudio();
    },
    { once: true },
  );
}
window.birdsongsReceiver = { handle, snapshot: () => app?.snapshot(), diag };

// the TV counts as a listener too
startPresence((n) => {
  document.getElementById('viewers').textContent = n == null ? '1' : String(n);
});
