// Drop-in songs from Standard MIDI Files.
//
// readMidi() is a small SMF reader (format 0/1, running status, tempo and
// time-signature meta events). arrangeMidi() turns any MIDI into a Birdsongs
// "rendition": it finds the melody, guesses one chord per bar from everything
// else, slows it down, moves it into the plinky octave and leaves breathing
// room after phrases. The result is a regular score string for parseSong().

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function readMidi(buffer) {
  const dv = new DataView(buffer);
  const tag = (p) => String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
  if (buffer.byteLength < 14 || tag(0) !== 'MThd') throw new Error('Not a MIDI file');
  const ntrks = dv.getUint16(10);
  let division = dv.getUint16(12);
  if (division & 0x8000) division = 480; // SMPTE timing: rare, approximate
  let pos = 8 + dv.getUint32(4);
  let tempo = 500000;
  let timeSig = [4, 4];
  const tracks = [];

  const varLen = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = dv.getUint8(pos++);
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };

  for (let t = 0; t < ntrks && pos + 8 <= buffer.byteLength; t++) {
    if (tag(pos) !== 'MTrk') break;
    const len = dv.getUint32(pos + 4);
    pos += 8;
    const end = pos + len;
    let tick = 0;
    let status = 0;
    const open = new Map();
    const track = { name: '', notes: [] };
    while (pos < end) {
      tick += varLen();
      let b = dv.getUint8(pos);
      if (b & 0x80) {
        status = b;
        pos++;
      }
      if (status === 0xff) {
        const type = dv.getUint8(pos++);
        const l = varLen();
        if (type === 0x51 && l === 3 && tempo === 500000) tempo = (dv.getUint8(pos) << 16) | (dv.getUint8(pos + 1) << 8) | dv.getUint8(pos + 2);
        if (type === 0x58 && l >= 2 && tick === 0) timeSig = [dv.getUint8(pos), 2 ** dv.getUint8(pos + 1)];
        if (type === 0x03) track.name = new TextDecoder().decode(new Uint8Array(buffer, pos, l));
        pos += l;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        pos += varLen();
        continue;
      }
      const kind = status & 0xf0;
      const ch = status & 0x0f;
      const d1 = dv.getUint8(pos++);
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : dv.getUint8(pos++);
      const key = ch * 128 + d1;
      if (kind === 0x90 && d2 > 0) {
        if (open.has(key)) {
          const o = open.get(key);
          track.notes.push({ start: o.tick / division, end: tick / division, midi: d1, vel: o.vel, ch });
        }
        open.set(key, { tick, vel: d2 });
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const o = open.get(key);
        if (o) {
          track.notes.push({ start: o.tick / division, end: tick / division, midi: d1, vel: o.vel, ch });
          open.delete(key);
        }
      }
    }
    pos = end;
    track.notes.sort((a, b) => a.start - b.start || b.midi - a.midi);
    tracks.push(track);
  }
  return { bpm: 60000000 / tempo, timeSig, tracks };
}

// highest note wins; a lower note under a sounding melody note is accompaniment
function skyline(notes) {
  const out = [];
  for (const n of [...notes].sort((a, b) => a.start - b.start || b.midi - a.midi)) {
    const last = out[out.length - 1];
    if (last && n.start < last.end - 0.02) {
      if (n.midi > last.midi && n.start > last.start + 0.02) {
        last.end = n.start;
        out.push({ ...n });
      }
      continue;
    }
    out.push({ ...n });
  }
  return out;
}

function pickMelodyTrack(tracks) {
  const usable = tracks.filter((t) => t.notes.filter((n) => n.ch !== 9).length >= 8);
  if (!usable.length) return null;
  const most = Math.max(...usable.map((t) => t.notes.length));
  let best = null;
  let bestScore = -Infinity;
  for (const t of usable) {
    const notes = t.notes.filter((n) => n.ch !== 9);
    if (notes.length < most * 0.25) continue;
    const mean = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
    const mono = skyline(notes).length / notes.length; // 1 = already a single line
    const score = mean + mono * 14;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

// Where do the downbeats fall? Files with a pickup often start the tune
// mid-bar, so find the bar offset where the accompaniment changes most.
function barPhase(notes, bar) {
  let best = 0;
  let bestScore = -1;
  for (let p = 0; p < bar - 1e-6; p += 0.5) {
    let score = 0;
    for (const n of notes) {
      const r = (((n.start - p) % bar) + bar) % bar;
      if (r < 0.06 || bar - r < 0.06) score += Math.min(4, n.end - n.start);
    }
    if (score > bestScore + 1e-6) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

const TEMPLATES = [
  ['', [0, 4, 7]],
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
  ['m7', [0, 3, 7, 10]],
  ['dim', [0, 3, 6]],
  ['sus4', [0, 5, 7]],
];

function guessChord(weights, bassPc) {
  let best = null;
  let bestScore = 0.35;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  for (let root = 0; root < 12; root++) {
    for (const [q, ivs] of TEMPLATES) {
      const pcs = new Set(ivs.map((i) => (root + i) % 12));
      let inside = 0;
      for (let pc = 0; pc < 12; pc++) if (pcs.has(pc)) inside += weights[pc];
      let score = (inside - (total - inside) * 0.6) / total;
      if (bassPc === root) score += 0.12;
      score -= (ivs.length - 3) * 0.04; // prefer plain triads
      if (score > bestScore) {
        bestScore = score;
        best = NAMES[root] + q;
      }
    }
  }
  return best;
}

const fmt = (u) => String(Math.max(0.25, Math.round(u * 4) / 4));
const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

// opts: { track, tempoScale, bpm, breath, maxBars, center }
export function arrangeMidi(midi, opts = {}) {
  const tracks = midi.tracks.map((t) => ({ ...t, notes: t.notes.filter((n) => n.ch !== 9 && n.end > n.start) }));
  const melTrack = opts.track != null ? tracks[opts.track] : pickMelodyTrack(tracks);
  if (!melTrack || !melTrack.notes.length) throw new Error('No melody found in MIDI');
  let melody = skyline(melTrack.notes);
  const melSet = new Set(melody.map((n) => `${n.start.toFixed(3)}:${n.midi}`));
  const accomp = tracks.flatMap((t) => t.notes).filter((n) => !melSet.has(`${n.start.toFixed(3)}:${n.midi}`));

  const [num, den] = midi.timeSig;
  const bar = num * (4 / den); // in quarter-note beats
  const first = melody[0].start;
  const phase = barPhase(accomp.length ? accomp : melody, bar);
  const origin = phase + Math.floor((first - phase) / bar) * bar;
  const maxBars = opts.maxBars || 64;
  const cutoff = origin + maxBars * bar;
  melody = melody.filter((n) => n.start < cutoff);

  // land the tune in the music-box sweet spot
  const pitches = melody.map((n) => n.midi).sort((a, b) => a - b);
  const median = pitches[Math.floor(pitches.length / 2)];
  const shift = Math.round(((opts.center || 72) - median) / 12) * 12;

  // one chord per bar from everything that isn't the melody
  const chords = [];
  for (let b = origin; b < Math.min(cutoff, melody[melody.length - 1].end + bar); b += bar) {
    const w = new Array(12).fill(0);
    let low = Infinity;
    const src = accomp.length ? accomp : melody;
    for (const n of src) {
      const ov = Math.min(n.end, b + bar) - Math.max(n.start, b);
      if (ov <= 0) continue;
      w[n.midi % 12] += ov;
      if (n.midi < low) low = n.midi;
    }
    chords.push(guessChord(w, Number.isFinite(low) ? low % 12 : null));
  }

  // walk the tune and write tokens (durations in sixteenths)
  const toks = [];
  let t = origin;
  let lastChord = null;
  let barIdx = -1;
  const markChord = (at) => {
    const i = Math.floor((at - origin) / bar + 1e-6);
    if (i === barIdx) return;
    barIdx = i;
    const c = chords[i];
    if (c && c !== lastChord) {
      toks.push(`[${c}]`);
      lastChord = c;
    }
  };
  const rest = (from, to) => {
    // split rests at bar lines so chord changes still land on the downbeat
    let a = from;
    while (to - a > 1e-3) {
      const nextBar = origin + (Math.floor((a - origin) / bar + 1e-6) + 1) * bar;
      const b = Math.min(to, nextBar);
      markChord(a);
      toks.push(`r:${fmt((b - a) * 4)}`);
      a = b;
    }
  };
  const breath = opts.breath ?? 3;
  melody.forEach((n, i) => {
    if (n.start > t + 1e-3) rest(t, n.start);
    markChord(n.start);
    const next = melody[i + 1];
    const end = next ? Math.min(n.end, next.start) : n.end;
    const len = Math.max(0.25, end - n.start);
    toks.push(`${noteName(n.midi + shift)}:${fmt(len * 4)}`);
    t = n.start + len;
    // after a phrase (a held note or a real gap) let it hang a little longer
    const gap = next ? next.start - end : 4;
    if (breath && (gap >= 0.9 || len >= 2)) toks.push(`r:${fmt(breath)}`);
  });
  toks.push('r:8');

  return {
    score: toks.join(' '),
    bpm: opts.bpm || Math.max(30, Math.round(midi.bpm * (opts.tempoScale || 0.6))),
    timeSig: `${num}/${den}`,
  };
}

export async function loadMidiSong(meta) {
  const res = await fetch(meta.midi, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status}`);
  const midi = readMidi(await res.arrayBuffer());
  return { ...meta, ...arrangeMidi(midi, meta) };
}
