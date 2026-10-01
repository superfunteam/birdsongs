// Plumage + proportions for every bird that can visit the wires.
// flight: 'bound' (flap-flap-tuck), 'glide' (flap then sail), 'flap' (steady)
export const SPECIES = {
  sparrow: {
    name: 'house sparrow', scale: 1.0, flight: 'bound', flapHz: 9,
    back: '#80603f', belly: '#c7bca9', breast: '#ad9f89', cap: '#6f6c6e', face: '#d3cbb8',
    throat: '#2b2420', cheek: '#d9d2c2', wing: '#704e31', wingbar: '#e6dccb', tip: '#4c3625',
    tail: '#5a4232', beak: '#3a3230', legs: '#7a5c48',
  },
  swallow: {
    name: 'barn swallow', scale: 0.95, flight: 'glide', flapHz: 7, slender: true, forked: true, wingLen: 1.35,
    back: '#24336a', belly: '#f1dcc0', breast: '#ead0a8', cap: '#24336a', face: '#b9542a',
    throat: '#b9542a', wing: '#1d2852', tip: '#151c3a', tail: '#1d2852', beak: '#141414', legs: '#2a2a2a',
  },
  robin: {
    name: 'robin', scale: 1.15, flight: 'flap', flapHz: 7,
    back: '#5e5a54', belly: '#ebe1d2', breast: '#db6a2c', cap: '#34312e', face: '#34312e',
    throat: '#db6a2c', wing: '#504c47', tip: '#3a3733', tail: '#3a3733', beak: '#e0a43a', legs: '#8a6a50',
  },
  bluebird: {
    name: 'bluebird', scale: 1.0, flight: 'flap', flapHz: 8,
    back: '#4277dc', belly: '#efe9df', breast: '#dc8a4a', cap: '#4277dc', face: '#4277dc',
    throat: '#dc8a4a', wing: '#3a6bd0', tip: '#264c9f', tail: '#3a6bd0', beak: '#222222', legs: '#2a2a2a',
  },
  goldfinch: {
    name: 'goldfinch', scale: 0.82, flight: 'bound', flapHz: 10,
    back: '#f2cf22', belly: '#f6e27a', breast: '#f2cf22', cap: '#171717', face: '#f2cf22',
    throat: '#f2cf22', wing: '#1d1d1d', wingbar: '#f4f0e0', tip: '#111111', tail: '#1d1d1d', beak: '#f0a27a', legs: '#c09a80',
  },
  crow: {
    name: 'crow', scale: 1.6, flight: 'flap', flapHz: 4.2, wingLen: 1.15,
    back: '#1d1d26', belly: '#22222c', breast: '#24242f', cap: '#1a1a22', face: '#1d1d26',
    throat: '#1d1d26', wing: '#1a1a24', tip: '#121218', tail: '#16161e', beak: '#141418', legs: '#141418',
  },
  pigeon: {
    name: 'pigeon', scale: 1.35, flight: 'flap', flapHz: 6,
    back: '#8d93a0', belly: '#9ca2ad', breast: '#7f7a90', cap: '#6f7586', face: '#6f7586',
    throat: '#4f8a78', wing: '#9ba2ae', wingbar: '#3d424c', tip: '#474c57', tail: '#5b606c', beak: '#3a3a40', legs: '#c0605a',
  },
  starling: {
    name: 'starling', scale: 1.05, flight: 'flap', flapHz: 8,
    back: '#2c2f42', belly: '#33354e', breast: '#3a3e5c', cap: '#28324e', face: '#2c2f42',
    throat: '#3d3666', wing: '#2c2f42', tip: '#1b1d29', tail: '#202231', beak: '#e5c040', legs: '#a0605a',
    speckle: '#d8d4e8',
  },
  cardinal: {
    name: 'cardinal', scale: 1.1, flight: 'flap', flapHz: 8, crest: true, beakThick: 1.5,
    back: '#b9232b', belly: '#d03b37', breast: '#d43c34', cap: '#c9272d', face: '#161012',
    throat: '#161012', mask: '#161012', wing: '#9b1e25', tip: '#7b171d', tail: '#9b1e25', beak: '#f08a3a', legs: '#a06a5a',
  },
  chickadee: {
    name: 'chickadee', scale: 0.85, flight: 'bound', flapHz: 10,
    back: '#8b908b', belly: '#e9e1cd', breast: '#f0e8d7', cap: '#161616', face: '#f4f4f0',
    throat: '#161616', cheek: '#f6f6f2', wing: '#6f7470', wingbar: '#d8dcd6', tip: '#4f5450', tail: '#5f6460', beak: '#1a1a1a', legs: '#3a3a3a',
  },
  gull: {
    name: 'gull', scale: 1.6, flight: 'glide', flapHz: 3.4, wingLen: 1.5,
    back: '#b8c0c9', belly: '#f4f6f8', breast: '#f4f6f8', cap: '#f4f6f8', face: '#f4f6f8',
    throat: '#f4f6f8', wing: '#a9b3bd', tip: '#22252a', tail: '#f0f2f4', beak: '#f0c020', legs: '#e0a070',
  },
};
