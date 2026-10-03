import './style.css';
import { createBirdsongs, BIRDS, sceneIndex } from './core.js';
import { SCENES } from './world/scenes.js';
import { Controls, loadSettings } from './ui/controls.js';
import { startPresence } from './ui/presence.js';
import { LiveIcon } from './ui/live-icon.js';
import { setupInstall, setupShare } from './ui/install.js';
import { setupCast } from './ui/cast.js';

const settings = loadSettings();

// links can open a particular moment: ?scene=seaside&song=clair-de-lune&birds=gull&silhouette=1
const params = new URLSearchParams(location.search);
if (params.has('scene')) settings.scene = sceneIndex(params.get('scene'));
if (params.has('birds')) settings.bird = params.get('birds');
for (const key of ['silhouette', 'shuffle', 'notes']) if (params.has(key)) settings[key] = params.get(key) !== '0';
settings.scene = sceneIndex(settings.scene | 0);

let ui = null;
let cast = { connected: false, send: () => {} };
const liveIcon = new LiveIcon();

let app;
try {
  app = createBirdsongs(
    document.getElementById('stage'),
    settings,
    {
      // while casting, the panel shows what the TV is playing instead
      onSong: (song) => !cast.connected && ui?.showSong(song),
      onSceneApplied: (scene, index) => {
        ui?.setScene(index);
        ui?.showScene(scene);
      },
      onFrame: (now) => liveIcon.update(now, app.stage.atmo),
    },
    { songId: params.get('song') },
  );
} catch (err) {
  document.querySelector('.tagline').textContent = 'this little radio needs WebGL, and this browser has it switched off.';
  document.getElementById('start').style.display = 'none';
  throw err;
}

// every control acts here, and on the TV when casting
const tell = (msg) => cast.connected && cast.send(msg);
const castState = () => {
  const s = app.snapshot();
  return { ...s, song: s.song?.id };
};

ui = new Controls({
  settings,
  scenes: SCENES,
  birds: BIRDS,
  onStart: () => app.startAudio(),
  onToggle: (key, on) => {
    if (key === 'music') cast.connected ? (settings.music = on) : app.setMusic(on);
    else if (key === 'sound') cast.connected ? (settings.sound = on) : app.setSound(on);
    else if (key === 'notes') app.setNotes(on);
    else if (key === 'silhouette') app.setSilhouette(on);
    else if (key === 'shuffle') app.setShuffle(on);
    tell({ type: 'state', [key]: on });
  },
  onVolume: (v) => {
    if (cast.connected) settings.volume = v;
    else app.setVolume(v);
    tell({ type: 'state', volume: v });
  },
  onScene: (delta) => {
    const next = SCENES[(((app.stage.sceneIndex + delta) % SCENES.length) + SCENES.length) % SCENES.length];
    app.nextScene(delta);
    tell({ type: 'state', scene: next.id });
  },
  onBird: (id) => {
    app.setBird(id);
    tell({ type: 'state', bird: id });
  },
  onSkip: () => (cast.connected ? tell({ type: 'skip' }) : app.skip()),
  onReshuffle: () => {
    app.reshuffle();
    tell({ type: 'reshuffle' });
  },
});
ui.setScene(app.stage.sceneIndex);

if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('nexttrack', () => ui.handlers.onSkip());
  } catch {
    // unsupported action
  }
}

// ------------------------------------------------------------------ Google Cast
let tvSong = null;
cast = setupCast(document.getElementById('cast-wrap'), {
  getState: castState,
  onConnect: (name, resumed) => {
    // the TV makes the sound now; this page goes quiet and becomes the remote
    app.audio.setMusic(false);
    app.audio.setSound(false);
    document.body.classList.add('casting');
    ui.toast('casting', name, resumed ? 'back in control of the TV' : 'close this page anytime: it keeps playing on the TV');
  },
  onDisconnect: () => {
    document.body.classList.remove('casting');
    app.audio.setMusic(settings.music);
    app.audio.setSound(settings.sound);
    tvSong = null;
    if (app.conductor.song) ui.showSong(app.conductor.song);
  },
  onStatus: (msg) => {
    if (msg.type !== 'status') return;
    // mirror the TV here: scene, birds, modes (but keep this page silent)
    const { song, music, sound, volume, ...look } = msg;
    app.apply(look);
    Object.assign(settings, { music, sound, volume });
    ui.render();
    if (song && song.id !== tvSong) {
      tvSong = song.id;
      ui.showSong(song);
    }
  },
});

// ------------------------------------------------------------------ listeners
startPresence((n) => ui.setViewers(n));

// ------------------------------------------------------------------ install + share
const notify = { flash: (t) => ui.flash(t), toast: (k, t, sub) => ui.toast(k, t, sub) };
setupInstall(document.getElementById('install'), notify);
setupShare(document.getElementById('share'), {
  ...notify,
  link: () => {
    const q = new URLSearchParams({ scene: app.stage.current.id });
    if (app.conductor.song) q.set('song', app.conductor.song.id);
    if (settings.bird !== 'mixed') q.set('birds', settings.bird);
    if (settings.silhouette) q.set('silhouette', '1');
    const song = app.conductor.song ? `${app.conductor.song.title}, ` : '';
    return { url: `${location.origin}/?${q}`, text: `${song}played by birds on a wire 🐦♪` };
  },
});

// offline + installable (production only; dev keeps hot reload simple)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(`${location.origin}/assets/`) || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com'));
        reg.active?.postMessage({ type: 'precache', urls: [`${location.origin}/`, ...urls] });
      })
      .catch(() => {});
  });
}
