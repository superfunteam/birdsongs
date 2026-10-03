// The whole radio without any page chrome: scene, birds, music, sound.
// The website (main.js) and the TV receiver (receiver.js) both run this.
import { PixelRenderer } from './render/pixel.js';
import { Stage, DAY_LENGTH } from './world/stage.js';
import { WEATHER } from './world/atmosphere.js';
import { SCENES } from './world/scenes.js';
import { AudioEngine } from './audio/engine.js';
import { Conductor } from './music/conductor.js';
import { SONGS, MIDI_SONGS } from './music/songs.js';
import { loadMidiSong, readMidi, arrangeMidi } from './music/midi.js';
import { SPECIES } from './world/species.js';

export const clock = () => performance.now() / 1000;

// bird picker: the scene's mix, or one kind everywhere
export const BIRDS = [
  { id: 'mixed', label: 'all kinds' },
  ...Object.entries(SPECIES).map(([id, sp]) => ({ id, label: sp.name.endsWith('ch') ? `${sp.name}es` : `${sp.name}s` })),
];

export const sceneIndex = (idOrIndex) => {
  if (typeof idOrIndex === 'number') return Math.max(0, Math.min(SCENES.length - 1, idOrIndex | 0));
  const i = SCENES.findIndex((sc) => sc.id === idOrIndex);
  if (i >= 0) return i;
  return /^\d+$/.test(String(idOrIndex)) ? Math.max(0, Math.min(SCENES.length - 1, +idOrIndex)) : 0;
};

// settings: { scene, bird, silhouette, shuffle, notes, music, sound, volume }
// hooks: { onSong(song), onSceneApplied(scene, index), onFrame(now) }
// options: { songId, maxFps }
export function createBirdsongs(canvas, settings, hooks = {}, options = {}) {
  const pixel = new PixelRenderer(canvas); // throws without WebGL
  const stage = new Stage(pixel);
  const audio = new AudioEngine();
  audio.musicOn = settings.music;
  audio.soundOn = settings.sound;
  audio.volume = settings.volume * settings.volume;

  if (!BIRDS.some((b) => b.id === settings.bird)) settings.bird = 'mixed';
  stage.birdKind = settings.bird;
  stage.shuffle = settings.shuffle;
  stage.pips.enabled = settings.notes;
  if (settings.silhouette) stage.setSilhouette(true);
  stage.setScene(sceneIndex(settings.scene), clock(), true);

  const conductor = new Conductor({
    songs: SONGS,
    flock: stage.flock,
    getScene: () => stage.current,
    audio,
    onSong: (song) => hooks.onSong?.(song),
  });
  conductor.start(clock(), options.songId);

  stage.onThunder = ({ near, delay }) => audio.thunder(near, delay);
  stage.onWiresChanged = () => conductor.resetForScene(clock());
  // shuffle mode: a fresh set of wires in the hush between songs
  conductor.onGap = () => stage.reshuffle(clock());
  stage.onSceneApplied = (scene) => {
    conductor.resetForScene(clock());
    settings.scene = stage.sceneIndex;
    hooks.onSceneApplied?.(scene, stage.sceneIndex);
  };

  // ---------------------------------------------------------------- render
  const minFrame = options.maxFps ? 1 / options.maxFps - 0.002 : 0;
  let last = clock();
  let lastDraw = 0;
  function frame() {
    const now = clock();
    if (now - lastDraw >= minFrame) {
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      lastDraw = now;
      stage.update(now, dt);
      hooks.onFrame?.(now);
      pixel.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- music clock
  // a timer, not rAF, so the music keeps going in a background tab
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
      audio.updateAmbience(now, { rain: w.rain, storm: w.storm, wind: w.wind, snow: w.snow, scene: stage.current });
    }
  }, 25);

  // ---------------------------------------------------------------- resize
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

  // ---------------------------------------------------------------- MIDI renditions
  for (const meta of MIDI_SONGS) {
    loadMidiSong(meta)
      .then((song) => conductor.addSong(song))
      .catch(() => console.info(`[birdsongs] "${meta.title}" skipped: no MIDI at ${meta.midi}`));
  }

  // ---------------------------------------------------------------- controls
  const app = {
    pixel,
    stage,
    audio,
    conductor,
    settings,
    async startAudio() {
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
    setMusic(on) {
      settings.music = on;
      audio.setMusic(on);
    },
    setSound(on) {
      settings.sound = on;
      audio.setSound(on);
    },
    setVolume(v) {
      settings.volume = v;
      audio.setVolume(v);
    },
    setNotes(on) {
      settings.notes = on;
      stage.pips.enabled = on;
      if (!on) stage.pips.clear();
    },
    setSilhouette(on) {
      settings.silhouette = on;
      stage.setSilhouette(on);
    },
    setShuffle(on) {
      settings.shuffle = on;
      stage.setShuffle(on, clock());
    },
    setBird(id) {
      settings.bird = id;
      stage.setBirdKind(id);
    },
    setScene(idOrIndex, immediate = false) {
      stage.setScene(sceneIndex(idOrIndex), clock(), immediate);
    },
    nextScene(delta) {
      stage.setScene(stage.sceneIndex + delta, clock());
    },
    skip() {
      conductor.skip(clock());
    },
    reshuffle() {
      stage.reshuffle(clock());
    },
    // start a particular song from the top (e.g. the one a phone was playing)
    playSong(id) {
      const i = conductor.songs.findIndex((s) => s.id === id);
      if (i < 0 || (conductor.song && conductor.song.id === id)) return false;
      const cut = conductor.cancelPending(clock());
      conductor.begin(i, Math.max(clock() + 1.2, cut + 0.5));
      return true;
    },
    // apply a full settings snapshot, changing only what differs
    apply(next) {
      if (next.scene != null && sceneIndex(next.scene) !== stage.sceneIndex) app.setScene(next.scene);
      if (next.bird != null && next.bird !== settings.bird) app.setBird(next.bird);
      if (next.silhouette != null && !!next.silhouette !== !!settings.silhouette) app.setSilhouette(!!next.silhouette);
      if (next.shuffle != null && !!next.shuffle !== !!settings.shuffle) app.setShuffle(!!next.shuffle);
      if (next.notes != null && !!next.notes !== !!settings.notes) app.setNotes(!!next.notes);
      if (next.music != null && !!next.music !== !!settings.music) app.setMusic(!!next.music);
      if (next.sound != null && !!next.sound !== !!settings.sound) app.setSound(!!next.sound);
      if (next.volume != null && next.volume !== settings.volume) app.setVolume(next.volume);
      if (next.song) app.playSong(next.song);
    },
    snapshot() {
      const song = conductor.song;
      return {
        scene: stage.current.id,
        bird: settings.bird,
        silhouette: !!settings.silhouette,
        shuffle: !!settings.shuffle,
        notes: !!settings.notes,
        music: !!settings.music,
        sound: !!settings.sound,
        volume: settings.volume,
        song: song ? { id: song.id, title: song.title, composer: song.composer, year: song.year } : null,
      };
    },
  };

  // handy for poking at things from the console
  window.birdsongs = {
    app,
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

  return app;
}
