// Birdsongs on the TV: a Google Cast custom receiver. The Chromecast loads
// this page from the web and runs the whole radio itself; phones and laptops
// only send settings over a message channel, so they can disconnect and it
// keeps playing until someone stops casting.
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
// tell every connected phone/laptop what's on now
function broadcast() {
  if (!context) return;
  try {
    context.sendCustomMessage(CAST_NAMESPACE, undefined, { type: 'status', ...app.snapshot() });
  } catch {
    // no senders right now
  }
}

const app = createBirdsongs(
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
  },
  { songId: params.get('song'), maxFps: onCast ? 30 : 0 },
);

function handle(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'state') app.apply(msg);
  else if (msg.type === 'skip') app.skip();
  else if (msg.type === 'reshuffle') app.reshuffle();
  setTimeout(broadcast, 60);
}

if (onCast) {
  const { CastReceiverContext, CastReceiverOptions, system } = window.cast.framework;
  context = CastReceiverContext.getInstance();
  context.addCustomMessageListener(CAST_NAMESPACE, (e) => handle(e.data));
  const options = new CastReceiverOptions();
  // there's no <video>, so tell the device not to close us for being "idle"
  options.disableIdleTimeout = true;
  options.customNamespaces = { [CAST_NAMESPACE]: system.MessageType.JSON };
  options.statusText = 'Birdsongs';
  context.start(options);
  // a receiver may make sound straight away
  app.startAudio();
} else {
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
  window.birdsongsReceiver = { handle, snapshot: () => app.snapshot() };
}

// the TV counts as a listener too
startPresence((n) => {
  document.getElementById('viewers').textContent = n == null ? '1' : String(n);
});
