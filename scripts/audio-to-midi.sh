#!/usr/bin/env bash
# Turn a recording you have the rights to into a MIDI file the app can arrange.
#
#   scripts/audio-to-midi.sh path/to/song.mp3 public/songs/song-name.mid
#
# Uses Spotify's Basic Pitch (https://github.com/spotify/basic-pitch) with its
# ONNX model, installed once into ~/.cache/birdsongs-basic-pitch. Then list the
# song in MIDI_SONGS (src/music/songs.js) with `fromAudio: true`.
set -euo pipefail
in="${1:?usage: $0 input-audio output.mid}"
out="${2:?usage: $0 input-audio output.mid}"
venv="${HOME}/.cache/birdsongs-basic-pitch"
py="$(command -v python3.12 || command -v python3.11 || command -v python3.10 || true)"
[ -n "$py" ] || { echo "Basic Pitch needs Python 3.10-3.12" >&2; exit 1; }
if [ ! -x "$venv/bin/basic-pitch" ]; then
  "$py" -m venv "$venv"
  "$venv/bin/pip" install -q --upgrade pip
  # its TensorFlow pin doesn't install on newer Pythons; the ONNX model needs none of it
  "$venv/bin/pip" install -q --no-deps basic-pitch==0.4.0
  "$venv/bin/pip" install -q onnxruntime librosa mir_eval pretty_midi resampy scipy scikit-learn "numpy<2.3" typing_extensions
fi
tmp="$(mktemp -d)"
"$venv/bin/basic-pitch" "$tmp" "$in" 2>&1 | grep -v -E "WARNING|^$" || true
mkdir -p "$(dirname "$out")"
mv "$tmp"/*_basic_pitch.mid "$out"
rm -rf "$tmp"
echo "wrote $out"
