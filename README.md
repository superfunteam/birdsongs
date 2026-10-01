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
| Songs | `src/music/songs.js` | Five public-domain melodies (see below). |
| Sound | `src/audio/engine.js` | All synthesised: music box, celesta, kalimba and Rhodes voices, a tape wow/flutter, saturation and reverb chain, vinyl crackle, rain layers, gusting wind, waves, crickets, thunder, and the occasional quiet wing flutter. |
| Viewer count | `netlify/functions/presence.mjs` | Each tab sends a heartbeat every 25 s. Heartbeats go into 30-second buckets in Netlify Blobs, and anyone seen in the last one or two buckets counts as listening. |

### Adding a song

Add an entry to `src/music/songs.js`. The score format (see `src/music/parse.js`):

```
E5:2      a note: name + octave, then a duration in sixteenths (2 = eighth, 4 = quarter, 12 = dotted half)
D#5:1     spell every accidental explicitly
r:4       a rest
[Am]      chord change starting at the next note or rest (drives the soft accompaniment)
|         bar line, for readability
```

Stick to public-domain melodies. Most well-known film scores are still under copyright.

### Keys

`M` music · `S` sounds · `←/→` scene · `N` next song · `H` hide the UI · `F` fullscreen

### Debugging

`window.birdsongs` exposes `stage`, `conductor`, `audio`, `setScene(i)`, `setTime(0..1)` and `setWeather('storm')`.
