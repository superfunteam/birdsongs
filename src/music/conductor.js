import { parseSong } from './parse.js';
import { SPECIES } from '../world/species.js';
import { BIRD_RADIUS } from '../world/bird.js';

// The conductor reads the score a few seconds ahead and turns every note into
// a bird event: either a landing (bird must touch the wire exactly on the
// beat, so it starts flying in seconds earlier) or a take-off.
//
// Wires are the staff: pitch picks the wire (low notes, low wires).
// Time picks the spot: an invisible playhead sweeps the wires left → right
// like reading a bar of music, and new birds land where it is.

const PLAN_AHEAD = 3.8; // seconds of score planned ahead (max approach flight)
const SONG_GAP = 5; // seconds of quiet between songs
const FIRST_DELAY = 2.6;

export class Conductor {
  constructor({ songs, flock, getScene, audio, onSong }) {
    this.songs = songs.map(parseSong);
    this.flock = flock;
    this.getScene = getScene;
    this.audio = audio;
    this.onSong = onSong;
    this.queue = [];
    this.order = this.shuffled();
    this.orderPos = 0;
    this.play = null;
    this.announced = null;
    this.onGap = null; // fires in the quiet between two songs
    this.gapAt = null;
  }

  // add a song after start-up (MIDI renditions load asynchronously);
  // it plays next so you hear it straight away
  addSong(song) {
    const parsed = parseSong(song);
    if (!parsed.noteCount) throw new Error('No notes');
    this.songs.push(parsed);
    this.order.splice(this.orderPos + 1, 0, this.songs.length - 1);
    return parsed;
  }

  shuffled() {
    const idx = this.songs.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }

  get song() {
    return this.play ? this.songs[this.play.songIndex] : null;
  }

  // songId (optional): open with this song, e.g. from a shared link
  start(now, songId) {
    const i = songId ? this.songs.findIndex((s) => s.id === songId) : -1;
    if (i >= 0) this.order = [i, ...this.order.filter((x) => x !== i)];
    this.begin(this.order[0], now + FIRST_DELAY);
  }

  begin(songIndex, at) {
    const song = this.songs[songIndex];
    this.play = {
      songIndex,
      startTime: at,
      loop: 0,
      eventIdx: 0,
      pageUnits: this.pageUnitsFor(song),
    };
    this.announced = null;
  }

  nextSong(at) {
    this.orderPos++;
    if (this.orderPos >= this.order.length) {
      const last = this.order[this.order.length - 1];
      this.order = this.shuffled();
      if (this.order[0] === last && this.order.length > 1) this.order.push(this.order.shift());
      this.orderPos = 0;
    }
    this.begin(this.order[this.orderPos], at);
  }

  // how much music fits across the wires before the playhead wraps
  pageUnitsFor(song) {
    const v = this.flock.view;
    const usable = Math.max(6, v.xMax - v.xMin - 1.2);
    const notesPerUnit = song.events.length / song.lengthUnits;
    const want = usable / (v.birdScale * this.flock.meanSpeciesScale() * 1.25);
    const bars = Math.max(1, Math.round(want / notesPerUnit / song.barUnits));
    return bars * song.barUnits;
  }

  relayout() {
    if (this.play) this.play.pageUnits = this.pageUnitsFor(this.song);
  }

  playheadX(units, page) {
    const v = this.flock.view;
    const f = (units % page) / page;
    const margin = 0.8;
    return v.xMin + margin + f * (v.xMax - v.xMin - margin * 2);
  }

  wireFor(song, midi) {
    const n = this.flock.view.wires;
    if (midi == null) return 0;
    const span = Math.max(1, song.hi - song.lo);
    return Math.max(0, Math.min(n - 1, Math.round(((midi - song.lo) / span) * (n - 1))));
  }

  // The latest note already handed to Web Audio. Anything after it can still
  // be taken back; anything before it is going to sound.
  sentHorizon(now) {
    let t = now + 0.06;
    for (const e of this.queue) if (e.sent && e.time > t) t = e.time;
    return t;
  }

  // forget notes that haven't sounded yet; birds still on their way turn back
  cancelPending(now) {
    const cut = this.sentHorizon(now);
    this.queue = this.queue.filter((e) => e.sent || e.time <= cut);
    this.flock.abortFrom(cut, now);
    return cut;
  }

  // start the current song over (used when the listener first presses play)
  restart(now) {
    const cut = this.cancelPending(now);
    this.begin(this.play ? this.play.songIndex : this.order[0], Math.max(now + 1.4, cut + 0.5));
  }

  skip(now) {
    const cut = this.cancelPending(now);
    const at = Math.max(now + 1.6, cut + 0.5);
    // near the end of a song the next one is already lined up: start it, don't skip it
    if (this.play && now < this.play.startTime) this.begin(this.play.songIndex, at);
    else this.nextSong(at);
    this.gapAt = now;
  }

  // the scene changed and its birds are gone: keep every planned note, but
  // give the ones still far enough ahead new birds in the new scene
  resetForScene(now) {
    this.relayout();
    for (const e of this.queue) {
      if (e.sent) continue;
      e.bird = null;
      e.kind = null;
      e.flap = null;
      if (e.time > now + 0.3) this.assignBird(e, now);
    }
  }

  tick(now, audioAhead) {
    if (!this.play) return;
    // plan
    for (let guard = 0; guard < 64; guard++) {
      const song = this.song;
      const p = this.play;
      if (p.eventIdx >= song.events.length) {
        p.loop++;
        p.eventIdx = 0;
        if (p.loop >= (song.repeat || 1)) {
          const end = p.startTime + p.loop * song.duration;
          this.gapAt = end + 0.8;
          this.nextSong(end + SONG_GAP);
          continue;
        }
      }
      const ev = song.events[p.eventIdx];
      const loopStart = p.startTime + p.loop * song.duration;
      const time = loopStart + ev.start * song.unitSec;
      if (time > now + PLAN_AHEAD) break;
      p.eventIdx++;
      if (time < now - 0.05) continue; // fell behind (e.g. background tab)
      this.planEvent(song, ev, time, p.loop * song.lengthUnits + ev.start, now);
    }

    if (this.gapAt != null && now >= this.gapAt) {
      this.gapAt = null;
      this.onGap?.();
    }

    // announce the song when its first note actually plays
    const p = this.play;
    if (p && this.announced !== p.songIndex + ':' + p.startTime && now >= p.startTime - 0.5) {
      this.announced = p.songIndex + ':' + p.startTime;
      this.onSong?.(this.song);
    }

    // hand near-future notes to the audio engine
    for (const e of this.queue) {
      if (e.sent) continue;
      if (e.time > now + audioAhead) continue;
      e.sent = true;
      if (e.time >= now - 0.04) this.audio.playEvent(e, e.time - now);
    }
    this.queue = this.queue.filter((e) => !e.sent || e.time > now - 2);
  }

  planEvent(song, ev, time, absUnits, now) {
    const e = {
      time,
      song,
      absUnits,
      midi: ev.midi,
      chord: ev.chord,
      downbeat: ev.start % song.barUnits === 0,
      instrument: song.instrument,
      vel: 0.7,
      pan: 0,
      kind: null,
      bird: null,
      flap: null,
      sent: false,
    };
    this.assignBird(e, now);
    this.queue.push(e);
  }

  // decide which bird plays this note: one leaving the wire, or one arriving
  assignBird(e, now) {
    const flock = this.flock;
    const v = flock.view;
    const song = e.song;
    const time = e.time;
    const scene = this.getScene();
    const wire = this.wireFor(song, e.midi);
    const page = this.play && song === this.song ? this.play.pageUnits : this.pageUnitsFor(song);
    const px = this.playheadX(e.absUnits, page);
    const pitchNorm = e.midi == null ? 0 : (e.midi - song.lo) / Math.max(1, song.hi - song.lo);

    const target = flock.targetPopulation();
    const pop = flock.population(time);
    let wantDepart;
    if (pop < target * 0.45) wantDepart = false;
    else if (pop >= target) wantDepart = Math.random() < 0.85;
    else wantDepart = Math.random() < 0.5 * (pop / target);

    let kind = null;
    let bird = null;
    if (wantDepart) {
      bird = flock.departCandidate(wire, px, time);
      if (bird) {
        flock.depart(bird, time);
        kind = 'depart';
      }
    }
    if (!kind) {
      const speciesId = flock.pickSpecies(scene.species, pitchNorm);
      const r = BIRD_RADIUS * SPECIES[speciesId].scale * v.birdScale;
      const x = flock.landingX(wire, px, time, r);
      if (x != null) {
        bird = flock.land({ wire, x, time, now, speciesId });
        kind = 'land';
      } else {
        bird = flock.departCandidate(wire, px, time);
        if (bird) {
          flock.depart(bird, time);
          kind = 'depart';
        }
      }
    }

    const sizeLoud = bird ? Math.pow(bird.sp.scale, 0.25) : 1;
    e.vel = Math.min(1, (0.62 + (e.downbeat ? 0.12 : 0) + Math.random() * 0.1) * sizeLoud);
    const x = bird ? bird.x : px;
    e.pan = Math.max(-0.75, Math.min(0.75, (x / ((v.xMax - v.xMin) / 2)) * 0.7));
    e.kind = kind;
    e.bird = bird;

    // the occasional wing flutter, never every time
    e.flap = null;
    if (bird && kind === 'depart' && Math.random() < 0.3) e.flap = { offset: 0.0, size: bird.sp.scale };
    else if (bird && kind === 'land' && Math.random() < 0.2) e.flap = { offset: -0.15, size: bird.sp.scale };
  }
}
