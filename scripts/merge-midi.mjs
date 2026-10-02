// Combine a melody MIDI and an accompaniment MIDI (e.g. Basic Pitch output of
// separated vocal and backing stems) into one file: track 0 = melody,
// track 1 = accompaniment. Times are kept in seconds-equivalent ticks.
//   node scripts/merge-midi.mjs vocals.mid accomp.mid out.mid
import { readFileSync, writeFileSync } from 'node:fs';
import { readMidi } from '../src/music/midi.js';

const [melPath, accPath, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: node scripts/merge-midi.mjs melody.mid accompaniment.mid out.mid');
  process.exit(1);
}
const load = (p) => {
  const b = readFileSync(p);
  return readMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const mel = load(melPath);
const acc = load(accPath);
const DIV = 480;
const vlq = (n) => {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
};
function track(notes, name, ch, bpm, withTempo) {
  const evs = [];
  for (const n of notes) {
    evs.push([Math.round(n.start * DIV), [0x90 | ch, n.midi, n.vel]]);
    evs.push([Math.round(n.end * DIV), [0x80 | ch, n.midi, 0]]);
  }
  evs.sort((a, b) => a[0] - b[0] || (a[1][0] & 0xf0) - (b[1][0] & 0xf0));
  const bytes = [0, 0xff, 0x03, name.length, ...Buffer.from(name)];
  if (withTempo) {
    const t = Math.round(60000000 / bpm);
    bytes.push(0, 0xff, 0x51, 3, (t >> 16) & 255, (t >> 8) & 255, t & 255);
  }
  let last = 0;
  for (const [t, ev] of evs) {
    bytes.push(...vlq(t - last), ...ev);
    last = t;
  }
  bytes.push(0, 0xff, 0x2f, 0);
  return [...Buffer.from('MTrk'), ...[24, 16, 8, 0].map((sh) => (bytes.length >> sh) & 0xff), ...bytes];
}
const hdr = [...Buffer.from('MThd'), 0, 0, 0, 6, 0, 1, 0, 2, (DIV >> 8) & 255, DIV & 255];
const melNotes = mel.tracks.flatMap((t) => t.notes);
const accNotes = acc.tracks.flatMap((t) => t.notes);
writeFileSync(outPath, Buffer.from([...hdr, ...track(melNotes, 'melody', 0, mel.bpm, true), ...track(accNotes, 'accompaniment', 1, mel.bpm, false)]));
console.log(`wrote ${outPath}: ${melNotes.length} melody notes, ${accNotes.length} accompaniment notes`);
