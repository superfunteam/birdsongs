# birdsongs

A lofi pixel-art radio. Birds land on and leave the power lines, and each landing and each take-off plays one note of a song you know. The wires are the staff: low notes go to the low wires, and new birds land wherever an invisible playhead is as it sweeps across the screen. There's weather too: rain, thunderstorms, snow, mist and waves. Time of day drifts slowly, so you get sunrises and sunsets.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (viewer count is mocked as 1)
```

To exercise the real viewer-count function locally:

```bash
netlify dev
```

## Deploy (Netlify)

`netlify.toml` already holds the configuration: the build runs `npm run build`, publishes `dist/`, and serves functions from `netlify/functions/`. Connect the repo in the Netlify UI, or run `netlify deploy --prod`. The viewer count uses Netlify Blobs, which works on Netlify without any extra setup.

## How it works

| Piece | File | Notes |
| --- | --- | --- |
| Pixel pipeline | `src/render/pixel.js` | Renders at a low resolution: about 96k art pixels, with an integer device-pixel scale. A post pass adds a lofi grade, a gentle Bayer dither, colour quantisation and the dissolve used for scene changes. |
| Sky + landscape | `src/render/sky.js` | One full-screen shader evaluated per art pixel. It draws banded dithered skies, sun, moon and stars, two cloud decks, and up to five silhouette layers (hills, mountains, city with lit windows, pines, trees, sea with glitter, a headland with a lighthouse). |
| Birds | `src/world/bird-rig.js`, `bird-anatomy.js`, `bird-wings.js`, `bird.js`, `species.js` | Species-specific 3D anatomy, field marks, feathered wings and tails, and gripping feet. Adult length sets the shared size scale; representative wingspan sets each open wing. Time-based flight, landing, perching and take-off remain synchronized with the score. |
| Wires | `src/world/powerlines.js` | Catenary spans between detailed poles. Perched birds weigh their span down, and every landing or take-off plucks the wire so it visibly rings. |
| Music → birds | `src/music/conductor.js` | Plans the score 3.8 s ahead so a landing bird can start its flight early and touch down exactly on the beat. It also keeps the bird population near a target. |
| Songs | `src/music/songs.js` | Public-domain melodies and two originals (see below). |
| Sound | `src/audio/engine.js` | All synthesised: music box, celesta, kalimba, felt-piano plunk and Rhodes voices, a tape wow/flutter, saturation and reverb chain, vinyl crackle, rain layers, gusting wind, waves, thunder, and the occasional soft wing flap. |
| Viewer count | `netlify/functions/presence.mjs` | Each tab sends a heartbeat every 25 s. Heartbeats go into 30-second buckets in Netlify Blobs, and anyone seen in the last one or two buckets counts as listening. |

### Bird anatomy and motion

All eleven birds use representative adult lengths and wingspans from the [Cornell Lab identification guides](https://www.allaboutbirds.org/guide/). Each entry in `src/world/species.js` links its source. The models depict House Sparrow, Barn Swallow, American Robin, Eastern Bluebird, American Goldfinch, American Crow, Rock Pigeon, European Starling, Northern Cardinal, Black-capped Chickadee, and Ring-billed Gull. Where plumage differs, these are adult males in breeding plumage. Dimensions represent typical adults; real individuals vary.

The models use a continuous, skinned surface from breast through neck and skull. Species profiles were sculpted using real adult photographs from the Cornell Lab / Macaulay Library; exact reference links are recorded in `scripts/bird-reference-sources.tsv`. Bills have species-specific cross sections, eyes sit flush in the skull, and folded wings use overlapping coverts and flight feathers. Smooth lighting replaces the former toon material, leaving the pixel pass to supply the lofi appearance. These are illustrative models, not anatomical scans.

The rig normalizes bill-to-tail length before applying the common scale, so long-tailed species and broad-winged species keep their own proportions. The tallest perched bird determines a shared wire-clearance limit. Crows and gulls have room reserved for their full size; changing the bird selection or resizing repacks the perches. Movement is an illustrative approximation: quick songbird scans and bounds, pigeon steps and head thrusts, deliberate crow strokes, and long gull glides. Landing and departure still happen on the exact musical beat.

Run `npm test` for geometry, wing symmetry, perch spacing, resizing and all eleven motion lifecycles. With the dev server running, open `/scripts/bird-study.html` for the development-only anatomy comparison, individual photographs beside the models, flight and landing checks. Reference photographs load from Cornell and are not bundled in the production build.

### Songs

Five public-domain pieces: Für Elise (arranged very slow, with breaths at phrase ends, on a felt-piano "plunk"), Gymnopédie No. 1, Canon in D, Brahms' Lullaby and Clair de lune. Plus two originals written by Claude for this project: **Little Wire Waltz** (music box) and **Pocket Full of Rain** (kalimba). And **Worried Shoes** (Daniel Johnston, used with permission), arranged from MIDI on kalimba.

### Songs from MIDI (licensed songs)

Songs you have the rights to can be added as MIDI files, so nobody has to retype a score. List the song in `MIDI_SONGS` in `src/music/songs.js`, then drop the file at its path under `public/`. "Worried Shoes" (Daniel Johnston, in the Karen O and the Kids version) is in, as a MIDI rendition.

At load time `src/music/midi.js` arranges the file into a Birdsongs rendition:

1. It finds the melody: the highest, most single-line track, reduced to its top voice.
2. It works out where the downbeats are and guesses one chord per bar from the accompaniment.
3. It slows the tune down (`tempoScale`), moves it into the music-box octave (`center`), and adds a breath after each phrase (`breath`).

A file that's missing is skipped quietly.

Only have a recording? Run `scripts/audio-to-midi.sh --separate song.mp3 public/songs/song-name.mid`. It installs its tools on first use:

- Meta's Demucs splits the vocals from the backing.
- Spotify's Basic Pitch transcribes each part.
- The output is a 2-track MIDI: track 0 is the sung melody, track 1 the backing.

Mark the song's entry `fromAudio: true, track: 0`. The arranger then cleans up the transcription before arranging it:

- drops stray detections outside the vocal range and overtone ghosts
- fixes octave slips
- folds re-triggered held notes back together
- takes the chords from the backing only

"Worried Shoes" was made this way. Keep source recordings in `songs/` at the project root: that folder is gitignored, so they never get published.

To try a MIDI without deploying it, run this in the console: `birdsongs.addMidi(await (await fetch(url)).arrayBuffer(), { title: '…' })`.

### Settings

The bird button in the corner opens the panel:

- **Music** and **sounds** (weather and wing flaps) toggles, plus volume.
- **Notes**: a tiny pixel ♪ rises from each bird the moment it plays.
- **Silhouette**: birds, poles and wires go solid black against the sky.
- **Shuffle**: a fresh random set of wires and poles (3–6 wires, 1–3 poles, slopes and slack vary), re-dealt in the quiet between songs. **New wires** reshuffles on demand.
- **Scene** and **birds** pickers: the birds picker chooses the scene's own mix or a single kind everywhere.

Settings are remembered per browser.

### Adding a song

Add an entry to `src/music/songs.js`. The score format (see `src/music/parse.js`):

```
E5:2      a note: name + octave, then a duration in sixteenths (2 = eighth, 4 = quarter, 12 = dotted half)
D#5:1     spell every accidental explicitly
r:4       a rest
[Am]      chord change starting at the next note or rest (drives the soft accompaniment)
|         bar line, for readability
```

Stick to public-domain melodies (or ones you have rights to). Most well-known film scores and modern songs are still under copyright. Bars don't have to add up, so you can stretch notes and add rests for breathing room.

### Keys

`M` music · `S` sounds · `T` notes · `O` silhouette · `B` / `shift+B` birds · `W` shuffle wires · `R` new wires · `←/→` scene · `N` next song · `H` open/close the panel · `F` fullscreen. The corner button is always visible.

### Debugging

`window.birdsongs` exposes `stage`, `conductor`, `audio`, `setScene(i)`, `setTime(0..1)` and `setWeather('storm')`.
