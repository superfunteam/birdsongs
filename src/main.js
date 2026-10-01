import './style.css';
import { PixelRenderer } from './render/pixel.js';
import { Stage, DAY_LENGTH } from './world/stage.js';
import { WEATHER } from './world/atmosphere.js';
import { SCENES } from './world/scenes.js';
import { AudioEngine } from './audio/engine.js';
import { Conductor } from './music/conductor.js';
import { SONGS } from './music/songs.js';
import { Controls, loadSettings } from './ui/controls.js';
import { startPresence } from './ui/presence.js';

const clock = () => performance.now() / 1000;

const settings = loadSettings();
settings.scene = Math.max(0, Math.min(SCENES.length - 1, settings.scene | 0));

const canvas = document.getElementById('stage');
let pixel;
try {
  pixel = new PixelRenderer(canvas);
} catch (err) {
  document.querySelector('.tagline').textContent = 'this little radio needs WebGL, and this browser has it switched off.';
  document.getElementById('start').style.display = 'none';
  throw err;
}
const stage = new Stage(pixel);
const audio = new AudioEngine();
audio.musicOn = settings.music;
audio.soundOn = settings.sound;
audio.volume = settings.volume * settings.volume;

let conductor = null;
let ui = null;

stage.setScene(settings.scene, clock(), true);

conductor = new Conductor({
  songs: SONGS,
  flock: stage.flock,
  getScene: () => stage.current,
  audio,
  onSong: (song) => ui?.showSong(song),
});
conductor.start(clock());

stage.onThunder = ({ near, delay }) => audio.thunder(near, delay);
stage.onSceneApplied = (scene) => {
  conductor?.resetForScene(clock());
  ui?.setScene(stage.sceneIndex);
  ui?.showScene(scene);
};

ui = new Controls({
  settings,
  scenes: SCENES,
  onStart: async () => {
    try {
      await audio.start();
      audio.setVolume(settings.volume);
      audio.setMusic(settings.music);
      audio.setSound(settings.sound);
    } catch (err) {
      console.warn('Audio could not start', err);
    }
    conductor.restart(clock());
  },
  onMusic: (on) => audio.setMusic(on),
  onSound: (on) => audio.setSound(on),
  onVolume: (v) => audio.setVolume(v),
  onScene: (delta) => stage.setScene(stage.sceneIndex + delta, clock()),
  onSkip: () => conductor.skip(clock()),
});
ui.setScene(stage.sceneIndex);

if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('nexttrack', () => conductor.skip(clock()));
  } catch {
    // unsupported action
  }
}

// ------------------------------------------------------------------ render
let last = clock();
function frame() {
  const now = clock();
  const dt = Math.min(0.1, Math.max(0, now - last));
  last = now;
  stage.update(now, dt);
  pixel.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ music clock
// Runs on a timer (not rAF) so the music keeps going in a background tab.
let lastAmb = 0;
let lastPrune = 0;
setInterval(() => {
  const now = clock();
  if (document.hidden && now - lastPrune > 1) {
    lastPrune = now;
    stage.flock.prune(now);
  }
  const latency = audio.ctx ? audio.ctx.outputLatency || audio.ctx.baseLatency || 0 : 0;
  conductor.tick(now + latency, document.hidden ? 1.5 : 0.22);
  if (audio.ctx && now - lastAmb > 0.1) {
    lastAmb = now;
    const w = stage.atmo.w;
    audio.updateAmbience(now, {
      rain: w.rain,
      storm: w.storm,
      wind: w.wind,
      snow: w.snow,
      night: stage.atmo.night,
      scene: stage.current,
    });
  }
}, 25);

// ------------------------------------------------------------------ resize
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (pixel.resize()) {
      stage.resize(clock());
      conductor.relayout();
    }
  }, 120);
});

// ------------------------------------------------------------------ listeners
startPresence((n) => ui.setViewers(n));

// handy for poking at things from the console
window.birdsongs = {
  stage,
  conductor,
  audio,
  setScene: (i) => stage.setScene(i, clock(), true),
  setTime: (tod) => {
    stage.sceneStart = clock() - ((((tod - stage.current.start) % 1) + 1) % 1) * DAY_LENGTH;
  },
  setWeather: (name) => {
    const a = stage.atmo;
    a.state = name;
    a.w = { ...WEATHER[name] };
    a.target = { ...WEATHER[name] };
    a.nextChange = clock() + 600;
  },
};
