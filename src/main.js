import './style.css';
import { PixelRenderer } from './render/pixel.js';
import { Stage, DAY_LENGTH } from './world/stage.js';
import { WEATHER } from './world/atmosphere.js';
import { SCENES } from './world/scenes.js';
import { AudioEngine } from './audio/engine.js';
import { Conductor } from './music/conductor.js';
import { SONGS, MIDI_SONGS } from './music/songs.js';
import { loadMidiSong, readMidi, arrangeMidi } from './music/midi.js';
import { SPECIES } from './world/species.js';
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

// bird picker: the scene's mix, or one kind everywhere
const BIRDS = [
  { id: 'mixed', label: 'all kinds' },
  ...Object.entries(SPECIES).map(([id, sp]) => ({ id, label: sp.name.endsWith('ch') ? `${sp.name}es` : `${sp.name}s` })),
];
if (!BIRDS.some((b) => b.id === settings.bird)) settings.bird = 'mixed';
stage.birdKind = settings.bird;
stage.shuffle = settings.shuffle;
stage.pips.enabled = settings.notes;
if (settings.silhouette) stage.setSilhouette(true);

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
stage.onWiresChanged = () => conductor.resetForScene(clock());
// shuffle mode: a fresh set of wires in the hush between songs
conductor.onGap = () => stage.reshuffle(clock());
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
  birds: BIRDS,
  onToggle: (key, on) => {
    if (key === 'music') audio.setMusic(on);
    else if (key === 'sound') audio.setSound(on);
    else if (key === 'notes') {
      stage.pips.enabled = on;
      if (!on) stage.pips.clear();
    } else if (key === 'silhouette') stage.setSilhouette(on);
    else if (key === 'shuffle') stage.setShuffle(on, clock());
  },
  onVolume: (v) => audio.setVolume(v),
  onScene: (delta) => stage.setScene(stage.sceneIndex + delta, clock()),
  onBird: (id) => stage.setBirdKind(id),
  onSkip: () => conductor.skip(clock()),
  onReshuffle: () => stage.reshuffle(clock()),
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

// ------------------------------------------------------------------ MIDI renditions
for (const meta of MIDI_SONGS) {
  loadMidiSong(meta)
    .then((song) => conductor.addSong(song))
    .catch(() => console.info(`[birdsongs] "${meta.title}" skipped: no MIDI at ${meta.midi}`));
}

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
  // try a MIDI rendition without deploying it: birdsongs.addMidi(arrayBuffer, { title, ... })
  addMidi: (buffer, meta = {}) => {
    const song = conductor.addSong({ id: `midi-${Date.now()}`, title: 'MIDI test', composer: '', year: '', instrument: 'kalimba', repeat: 1, ...meta, ...arrangeMidi(readMidi(buffer), meta) });
    conductor.skip(clock());
    return { title: song.title, notes: song.noteCount, seconds: Math.round(song.duration), bpm: song.bpm };
  },
  setWeather: (name) => {
    const a = stage.atmo;
    a.state = name;
    a.w = { ...WEATHER[name] };
    a.target = { ...WEATHER[name] };
    a.nextChange = clock() + 600;
  },
};
