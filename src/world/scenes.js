// Each scene: a place, a starting hour, a weather personality and a cast of birds.
// Layer heights are in screen-height units relative to the horizon line.
// col  = albedo lit by the sky's ambient light
// col2 / col3 = detail colours; *Mode 'emit' keeps them glowing at night
// haze = how much the layer fades into the horizon colour (far = 1)

export const SCENES = [
  {
    id: 'rainy-dusk',
    name: 'Rainy Dusk',
    blurb: 'city edge, streetlights coming on',
    start: 0.712,
    cityGlow: true,
    weather: { start: 'drizzle', weights: { cloudy: 2, drizzle: 3, rain: 3, storm: 1.2, fair: 0.7 } },
    layers: [
      { type: 'hills', base: 0.0, amp: 0.08, freq: 1.7, seed: 11, col: '#56607a', haze: 0.72 },
      { type: 'city', base: -0.01, amp: 0.15, freq: 30, seed: 4, col: '#30364a', col2: '#ffcf7a', col2Mode: 'emit', col3: '#9fd0ff', col3Mode: 'emit', haze: 0.32, b: [0.45, 0, 0, 0.75] },
      { type: 'trees', base: -0.035, amp: 0.075, freq: 13, seed: 7, col: '#26332f', col2: '#3a4b40', haze: 0.12, b: [0, 0, 0, 0.35] },
      { type: 'ground', base: -0.125, amp: 0.03, freq: 2, seed: 3, col: '#1f2427', col2: '#2f3833', haze: 0 },
    ],
    poles: [{ x: -0.42, transformer: true }, { x: 0.78, lamp: true, lampDir: -1 }],
    wires: 5,
    species: { sparrow: 3, starling: 2.5, pigeon: 2, swallow: 1, crow: 0.6 },
    ambience: { city: 1 },
  },
  {
    id: 'first-light',
    name: 'First Light',
    blurb: 'meadow at sunrise',
    start: 0.214,
    weather: { start: 'misty', weights: { misty: 2, clear: 2, fair: 3, cloudy: 1, drizzle: 0.7 } },
    layers: [
      { type: 'mountains', base: 0.0, amp: 0.17, freq: 2.0, seed: 21, col: '#717895', haze: 0.82, b: [0, 0, 0, 1] },
      { type: 'hills', base: -0.005, amp: 0.1, freq: 2.6, seed: 5, col: '#566f56', col2: '#7b9566', haze: 0.45, b: [1, 0, 0, 0.8] },
      { type: 'trees', base: -0.035, amp: 0.065, freq: 17, seed: 9, col: '#30483a', col2: '#56744a', haze: 0.16, b: [0, 0, 0, 0.5] },
      { type: 'ground', base: -0.1, amp: 0.035, freq: 1.5, seed: 2, col: '#3a4e30', col2: '#64824d', haze: 0 },
    ],
    poles: [{ x: -0.28 }, { x: 0.92 }],
    wires: 4,
    species: { bluebird: 3, robin: 2.5, swallow: 2.5, goldfinch: 2, sparrow: 1 },
    ambience: { meadow: 1 },
  },
  {
    id: 'midnight-storm',
    name: 'Midnight Storm',
    blurb: 'thunder over the valley',
    start: 0.93,
    weather: { start: 'storm', weights: { storm: 3, rain: 3, drizzle: 1.2, cloudy: 1 } },
    layers: [
      { type: 'mountains', base: 0.0, amp: 0.13, freq: 1.4, seed: 33, col: '#3c4360', haze: 0.7, b: [0, 0, 0, 1] },
      { type: 'city', base: -0.012, amp: 0.05, freq: 55, seed: 8, col: '#272b3c', col2: '#ffc46a', col2Mode: 'emit', col3: '#ff9a6a', col3Mode: 'emit', haze: 0.3, b: [0.3, 0, 0, 0.7] },
      { type: 'pines', base: -0.045, amp: 0.11, freq: 24, seed: 4, col: '#1b2426', haze: 0.1, b: [0, 0, 0, 0.3] },
      { type: 'ground', base: -0.13, amp: 0.025, freq: 2.2, seed: 9, col: '#161a1c', col2: '#232a28', haze: 0 },
    ],
    poles: [{ x: -0.55, lamp: true, lampDir: 1 }, { x: 0.46, transformer: true }],
    wires: 5,
    species: { crow: 3, starling: 2, pigeon: 1.5, sparrow: 1 },
    ambience: {},
  },
  {
    id: 'snowfall',
    name: 'Snowfall',
    blurb: 'quiet winter afternoon',
    start: 0.6,
    tint: { color: '#a8b8d8', amount: 0.14 },
    weather: { start: 'snow', weights: { snow: 3, flurries: 3, cloudy: 1.5, fair: 1 } },
    layers: [
      { type: 'mountains', base: 0.0, amp: 0.21, freq: 1.8, seed: 41, col: '#7e88a4', col2: '#e8edf6', haze: 0.62, b: [1, 0, 0, 1] },
      { type: 'pines', base: -0.015, amp: 0.12, freq: 19, seed: 12, col: '#2b3b3d', col2: '#e9eef6', haze: 0.28, b: [2, 0, 0, 0.6] },
      { type: 'ground', base: -0.08, amp: 0.025, freq: 1.2, seed: 6, col: '#dfe6ef', col2: '#c3cbd8', haze: 0.05 },
    ],
    poles: [{ x: -0.62 }, { x: 0.36, transformer: true }],
    wires: 5,
    species: { cardinal: 3, chickadee: 3, sparrow: 2, crow: 0.6 },
    ambience: { hush: 1 },
  },
  {
    id: 'seaside',
    name: 'Seaside',
    blurb: 'lighthouse at golden hour',
    start: 0.676,
    weather: { start: 'fair', weights: { fair: 3, clear: 2, cloudy: 1.5, drizzle: 1, misty: 1 } },
    layers: [
      { type: 'sea', base: 0.0, col: '#18324f', col2Mode: 'sky', col3Mode: 'skylight', haze: 0.15, b: [0, 0, 0, 0.6] },
      { type: 'headland', base: 0.0, amp: 0.075, freq: 7, seed: 3, col: '#3b4339', col2: '#f0ebe0', col3: '#c23b2f', haze: 0.3, b: [0, 0.4, 0, 0.5] },
      { type: 'ground', base: -0.14, amp: 0.03, freq: 2.4, seed: 5, col: '#6a5d42', col2: '#9a8a5a', haze: 0 },
    ],
    poles: [{ x: -0.72 }, { x: 0.22, lamp: true, lampDir: 1 }],
    wires: 4,
    species: { gull: 2, swallow: 3, starling: 1.5, sparrow: 1.5 },
    ambience: { waves: 1 },
  },
];
