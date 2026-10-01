// Tiny score format (see songs.js):
//   E5:2      note E5 lasting 2 sixteenths (an eighth)
//   D#5:1     accidentals are explicit on every note (# or b)
//   r:4       quarter rest
//   [Am]      chord change starting at the next note/rest
//   |         bar line (readability only)

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  let pc = LETTER[m[1].toUpperCase()];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

const QUALITIES = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
};

function pitchClass(sym) {
  const m = /^([A-G])(#|b)?/.exec(sym);
  if (!m) return null;
  let pc = LETTER[m[1]];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return { pc: (pc + 12) % 12, len: m[0].length };
}

// Returns MIDI notes for a soft voicing: one bass note (octave 2) + chord
// tones packed into E3..G4.
export function parseChord(symbol) {
  const [main, slash] = symbol.split('/');
  const root = pitchClass(main);
  if (!root) throw new Error(`Bad chord "${symbol}"`);
  const quality = main.slice(root.len);
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown chord quality "${quality}" in "${symbol}"`);
  const bassPc = slash ? pitchClass(slash)?.pc ?? root.pc : root.pc;
  const bass = 36 + bassPc + (bassPc < 4 ? 12 : 0); // E2..D#3
  const tones = intervals.map((iv) => {
    let n = 48 + ((root.pc + iv) % 12);
    while (n < 52) n += 12;
    while (n > 67) n -= 12;
    return n;
  });
  tones.sort((a, b) => a - b);
  return { symbol, bass, tones: [...new Set(tones)] };
}

export function parseSong(song) {
  const tokens = song.score.split(/\s+/).filter(Boolean);
  const events = [];
  let pos = 0;
  let pendingChord = null;
  let lo = Infinity;
  let hi = -Infinity;
  let bar = 0;

  for (const tok of tokens) {
    if (tok === '|') {
      bar++;
      continue;
    }
    if (tok.startsWith('[')) {
      pendingChord = parseChord(tok.replace(/[[\]]/g, ''));
      continue;
    }
    const [name, durStr] = tok.split(':');
    const dur = parseFloat(durStr);
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`Bad duration in "${tok}" (${song.id})`);
    if (name === 'r' || name === 'R') {
      if (pendingChord) events.push({ start: pos, dur, midi: null, chord: pendingChord, bar });
    } else {
      const midi = noteToMidi(name) + (song.transpose || 0);
      lo = Math.min(lo, midi);
      hi = Math.max(hi, midi);
      events.push({ start: pos, dur, midi, chord: pendingChord, bar });
    }
    pendingChord = null;
    pos += dur;
  }

  const [num, den] = (song.timeSig || '4/4').split('/').map(Number);
  const barUnits = num * (16 / den);
  const unitSec = 60 / song.bpm / 4;
  const noteCount = events.filter((e) => e.midi != null).length;

  return {
    ...song,
    events,
    lengthUnits: pos,
    barUnits,
    unitSec,
    lo,
    hi,
    noteCount,
    duration: pos * unitSec,
  };
}
