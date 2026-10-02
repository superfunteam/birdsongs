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
| Birds | `src/world/bird.js`, `species.js` | Procedural low-poly 3D rigs: body, head, beak, crest, two-segment wings, forked or fan tail, legs. Plumage comes from per-face vertex colours with toon shading. Every pose is computed from time: approach, landing flare, settle, idle (look, preen, flick, fluff, stretch, hop-turn, shuffle), crouch, take-off. |
| Wires | `src/world/powerlines.js` | Catenary spans between detailed poles. Perched birds weigh their span down, and every landing or take-off plucks the wire so it visibly rings. |
| Music → birds | `src/music/conductor.js` | Plans the score 3.8 s ahead so a landing bird can start its flight early and touch down exactly on the beat. It also keeps the bird population near a target. |
| Songs | `src/music/songs.js` | Public-domain melodies and two originals (see below). |
| Sound | `src/audio/engine.js` | All synthesised: music box, celesta, kalimba, felt-piano plunk and Rhodes voices, a tape wow/flutter, saturation and reverb chain, vinyl crackle, rain layers, gusting wind, waves, thunder, and the occasional soft wing flap. |
| Viewer count | `netlify/functions/presence.mjs` | Each tab sends a heartbeat every 25 s. Heartbeats go into 30-second buckets in Netlify Blobs, and anyone seen in the last one or two buckets counts as listening. |

### Songs

Five public-domain pieces: Für Elise (arranged very slow, with breaths at phrase ends, on a felt-piano "plunk"), Gymnopédie No. 1, Canon in D, Brahms' Lullaby and Clair de lune. Plus two originals written by Claude for this project: **Little Wire Waltz** (music box) and **Pocket Full of Rain** (kalimba).

### Songs from MIDI (licensed songs)

Songs you have the rights to can be added as MIDI files, so nobody has to retype a score. List the song in `MIDI_SONGS` in `src/music/songs.js`, then drop the file at its path under `public/`. "Worried Shoes" (Daniel Johnston) is already listed, waiting for `public/songs/worried-shoes.mid`.

At load time `src/music/midi.js` arranges the file into a Birdsongs rendition:

1. It finds the melody: the highest, most single-line track, reduced to its top voice.
2. It works out where the downbeats are and guesses one chord per bar from the accompaniment.
3. It slows the tune down (`tempoScale`), moves it into the music-box octave (`center`), and adds a breath after each phrase (`breath`).

A file that's missing is skipped quietly.

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

`M` music · `S` sounds · `T` notes · `O` silhouette · `B` / `shift+B` birds · `W` shuffle wires · `R` new wires · `←/→` scene · `N` next song · `H` hide the UI · `F` fullscreen

### Debugging

`window.birdsongs` exposes `stage`, `conductor`, `audio`, `setScene(i)`, `setTime(0..1)` and `setWeather('storm')`.
