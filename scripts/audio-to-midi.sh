#!/usr/bin/env bash
# Turn a recording you have the rights to into a MIDI file the app can arrange.
#
#   scripts/audio-to-midi.sh [--separate] path/to/song.mp3 public/songs/song-name.mid
#
# Uses Spotify's Basic Pitch (https://github.com/spotify/basic-pitch, ONNX model).
# With --separate, Meta's Demucs (https://github.com/facebookresearch/demucs)
# first splits the vocals from the backing, and the result is a 2-track MIDI:
# track 0 = the sung melody, track 1 = the accompaniment (for chords). Use that
# for full mixes; list the song in MIDI_SONGS with `fromAudio: true, track: 0`.
# Tools install once into ~/.cache/birdsongs-*.
set -euo pipefail
separate=0
if [ "${1:-}" = "--separate" ]; then separate=1; shift; fi
in="${1:?usage: $0 [--separate] input-audio output.mid}"
out="${2:?usage: $0 [--separate] input-audio output.mid}"
here="$(cd "$(dirname "$0")" && pwd)"
py="$(command -v python3.12 || command -v python3.11 || command -v python3.10 || true)"
[ -n "$py" ] || { echo "needs Python 3.10-3.12" >&2; exit 1; }

bp="${HOME}/.cache/birdsongs-basic-pitch"
if [ ! -x "$bp/bin/basic-pitch" ]; then
  "$py" -m venv "$bp"
  "$bp/bin/pip" install -q --upgrade pip
  # its TensorFlow pin doesn't install on newer Pythons; the ONNX model needs none of it
  "$bp/bin/pip" install -q --no-deps basic-pitch==0.4.0
  "$bp/bin/pip" install -q onnxruntime librosa mir_eval pretty_midi resampy scipy scikit-learn "numpy<2.3" typing_extensions
fi
transcribe() { # audio → midi
  local tmp; tmp="$(mktemp -d)"
  "$bp/bin/basic-pitch" "$tmp" "$1" 2>&1 | grep -v -E "WARNING|^$" || true
  mv "$tmp"/*_basic_pitch.mid "$2"
  rm -rf "$tmp"
}

mkdir -p "$(dirname "$out")"
if [ "$separate" = 0 ]; then
  transcribe "$in" "$out"
else
  dm="${HOME}/.cache/birdsongs-demucs"
  if [ ! -x "$dm/bin/demucs" ]; then
    "$py" -m venv "$dm"
    "$dm/bin/pip" install -q --upgrade pip
    "$dm/bin/pip" install -q demucs soundfile
  fi
  work="$(mktemp -d)"
  # (Apple's GPU backend lacks one of Demucs' layers, so run it on the CPU)
  "$dm/bin/demucs" --two-stems=vocals -n htdemucs -d cpu -o "$work" "$in" 2>&1 | grep -v -E "%\||^$" || true
  stems="$(dirname "$(find "$work" -name vocals.wav | head -1)")"
  transcribe "$stems/vocals.wav" "$work/vocals.mid"
  transcribe "$stems/no_vocals.wav" "$work/backing.mid"
  node "$here/merge-midi.mjs" "$work/vocals.mid" "$work/backing.mid" "$out"
  rm -rf "$work"
fi
echo "wrote $out"
