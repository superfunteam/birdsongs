// Adult field marks, proportions, and representative dimensions from the
// Cornell Lab's All About Birds identification accounts (linked per species).
// Length and wingspan use midpoints of their published adult ranges; individuals
// vary. All models share a linear length scale: a 16 cm House Sparrow is 1.
// Plumage depicts adult males where sexes differ, in breeding plumage.
// Motion numbers are animation tuning, not measured biological rates. They
// express observed flight/perching character rather than a biomechanics model.
// Motion angles: positive perchPitch raises the bill; positive tailAngle lowers
// the tail. Times are seconds, duties are the flapping fraction of each cycle,
// headSpeed is a smoothing rate, and hopHeight is in the rig's local units.
// flight: 'bound' (flap then tuck), 'glide' (flap then sail), 'flap' (continuous).
export const SPECIES = {
  sparrow: {
    name: 'house sparrow', fullName: 'House Sparrow', scientificName: 'Passer domesticus',
    reference: 'https://www.allaboutbirds.org/guide/House_Sparrow/id',
    lengthCm: 16, wingspanCm: 22, scale: 16 / 16, flight: 'bound', flapHz: 12,
    back: '#826247', belly: '#c6c1b5', breast: '#b9b4a8', cap: '#827f79', face: '#6a4330',
    throat: '#252321', cheek: '#dedbd0', nape: '#80482e', wing: '#735137', wingbar: '#e8e2cf', tip: '#3f342d',
    tail: '#58493b', beak: '#292724', legs: '#967862', wingBars: 1,
    motion: {
      perchPitch: 0.28, tailAngle: 0.22, idlePace: 1.2, flapAmplitude: 1.02,
      flareTime: 0.28, settleTime: 0.28, launchTime: 0.13,
      boundPeriod: 0.56, boundDuty: 0.76, glidePeriod: 1.5, glideDuty: 0.8,
      headSpeed: 12, hopHeight: 0.055,
    },
  },
  swallow: {
    name: 'barn swallow', fullName: 'Barn Swallow', scientificName: 'Hirundo rustica',
    reference: 'https://www.allaboutbirds.org/guide/Barn_Swallow/id',
    // American subspecies: cinnamon belly and incomplete dark breast band.
    lengthCm: 17, wingspanCm: 30.5, scale: 17 / 16, flight: 'flap', flapHz: 7.5,
    slender: true, forked: true, wingLen: 1.35,
    back: '#243e52', belly: '#d5ad83', breast: '#c89363', cap: '#243e52', face: '#253b4b',
    throat: '#9c4c32', forehead: '#a35437', wing: '#293b49', tip: '#192b38',
    tail: '#223642', tailSpot: '#eae7d9', beak: '#202324', legs: '#3c3c38',
    motion: {
      perchPitch: 0.13, tailAngle: 0.10, idlePace: 0.9, flapAmplitude: 0.86,
      flareTime: 0.36, settleTime: 0.31, launchTime: 0.12,
      boundPeriod: 0.7, boundDuty: 0.9, glidePeriod: 2.4, glideDuty: 0.9,
      headSpeed: 11, hopHeight: 0.035,
    },
  },
  robin: {
    name: 'robin', fullName: 'American Robin', scientificName: 'Turdus migratorius',
    reference: 'https://www.allaboutbirds.org/guide/American_Robin/id',
    lengthCm: 24, wingspanCm: 35.5, scale: 24 / 16, flight: 'flap', flapHz: 7.5,
    back: '#66615a', belly: '#e8e3d7', breast: '#b85b35', cap: '#343431', face: '#3d3c37',
    throat: '#e5dfcf', throatStreak: '#3a3934', eyeRing: '#ece6d8',
    wing: '#56534f', tip: '#393936', tail: '#42423c', beak: '#d6b344', legs: '#806b57',
    motion: {
      perchPitch: 0.43, tailAngle: 0.23, idlePace: 0.86, flapAmplitude: 0.98,
      flareTime: 0.37, settleTime: 0.38, launchTime: 0.17,
      boundPeriod: 0.85, boundDuty: 0.85, glidePeriod: 2.1, glideDuty: 0.85,
      headSpeed: 9, hopHeight: 0.045,
    },
  },
  bluebird: {
    name: 'bluebird', fullName: 'Eastern Bluebird', scientificName: 'Sialia sialis',
    reference: 'https://www.allaboutbirds.org/guide/Eastern_Bluebird/id',
    lengthCm: 18.5, wingspanCm: 28.5, scale: 18.5 / 16, flight: 'flap', flapHz: 9,
    back: '#356aab', belly: '#e9e5d9', breast: '#af633b', cap: '#3b75b8', face: '#3a6ca2',
    throat: '#b36a42', wing: '#315985', tip: '#2a4260', tail: '#2d5b8d', beak: '#282b2a', legs: '#474742',
    motion: {
      perchPitch: 0.36, tailAngle: 0.22, idlePace: 0.92, flapAmplitude: 0.96,
      flareTime: 0.32, settleTime: 0.31, launchTime: 0.14,
      boundPeriod: 0.68, boundDuty: 0.85, glidePeriod: 1.8, glideDuty: 0.85,
      headSpeed: 10, hopHeight: 0.045,
    },
  },
  goldfinch: {
    name: 'goldfinch', fullName: 'American Goldfinch', scientificName: 'Spinus tristis',
    reference: 'https://www.allaboutbirds.org/guide/American_Goldfinch/id',
    lengthCm: 12, wingspanCm: 20.5, scale: 12 / 16, flight: 'bound', flapHz: 13,
    back: '#e6ca37', belly: '#ede07e', breast: '#edce38', cap: '#20221e', face: '#e9cd3f',
    throat: '#e9ce42', undertail: '#eee9d9', wing: '#282b28', wingbar: '#f0eddb', tip: '#1e211f',
    tail: '#272b28', beak: '#d9a576', legs: '#af8a69', wingBars: 2,
    motion: {
      perchPitch: 0.29, tailAngle: 0.20, idlePace: 1.3, flapAmplitude: 1.04,
      flareTime: 0.26, settleTime: 0.26, launchTime: 0.11,
      boundPeriod: 0.7, boundDuty: 0.56, glidePeriod: 1.4, glideDuty: 0.8,
      headSpeed: 13, hopHeight: 0.055,
    },
  },
  crow: {
    name: 'crow', fullName: 'American Crow', scientificName: 'Corvus brachyrhynchos',
    reference: 'https://www.allaboutbirds.org/guide/American_Crow/id',
    lengthCm: 46.5, wingspanCm: 92.5, scale: 46.5 / 16, flight: 'flap', flapHz: 4.2, wingLen: 1.15,
    back: '#272b2e', belly: '#24282a', breast: '#2b2f30', cap: '#202628', face: '#24292b',
    throat: '#272c2d', wing: '#242a2d', tip: '#191f21', tail: '#1e2427', beak: '#202526', legs: '#303332',
    motion: {
      perchPitch: 0.20, tailAngle: 0.10, idlePace: 0.66, flapAmplitude: 0.88,
      flareTime: 0.59, settleTime: 0.52, launchTime: 0.24,
      boundPeriod: 1.2, boundDuty: 0.95, glidePeriod: 3.1, glideDuty: 0.92,
      headSpeed: 7, hopHeight: 0.025,
    },
  },
  pigeon: {
    name: 'pigeon', fullName: 'Rock Pigeon', scientificName: 'Columba livia',
    reference: 'https://www.allaboutbirds.org/guide/Rock_Pigeon/id',
    // The familiar blue-bar plumage; urban pigeons also have many other morphs.
    lengthCm: 33, wingspanCm: 58.5, scale: 33 / 16, flight: 'flap', flapHz: 6.5,
    back: '#969ca1', belly: '#a3a6a6', breast: '#74717b', cap: '#717b83', face: '#758089',
    throat: '#4b7167', neckSheen: '#6d5973', wing: '#a1a7ab', wingbar: '#343b41', tip: '#4b535c',
    tail: '#777f85', tailBand: '#353d44', beak: '#434b4b', cere: '#dcdcd2', legs: '#b67472',
    iris: '#d59449', eyeRing: '#a9957e', wingBars: 2,
    motion: {
      perchPitch: 0.38, tailAngle: 0.16, idlePace: 0.82, flapAmplitude: 1.05,
      flareTime: 0.46, settleTime: 0.43, launchTime: 0.19,
      boundPeriod: 1, boundDuty: 0.95, glidePeriod: 2.3, glideDuty: 0.9,
      headSpeed: 9, hopHeight: 0.025,
    },
  },
  starling: {
    name: 'starling', fullName: 'European Starling', scientificName: 'Sturnus vulgaris',
    reference: 'https://www.allaboutbirds.org/guide/European_Starling/id',
    lengthCm: 21.5, wingspanCm: 35.5, scale: 21.5 / 16, flight: 'flap', flapHz: 9,
    back: '#35473d', belly: '#343d37', breast: '#3d3949', cap: '#34433d', face: '#313b36',
    throat: '#4b3d52', wing: '#3d4139', tip: '#292d29', tail: '#30372f', beak: '#d1b33d', legs: '#9e695f',
    // Sparse remaining feather tips in breeding plumage; winter birds are much spottier.
    speckle: '#b9b198', speckleDensity: 0.3,
    motion: {
      perchPitch: 0.26, tailAngle: 0.12, idlePace: 1.12, flapAmplitude: 0.88,
      flareTime: 0.32, settleTime: 0.32, launchTime: 0.14,
      boundPeriod: 0.8, boundDuty: 0.9, glidePeriod: 2.1, glideDuty: 0.9,
      headSpeed: 12, hopHeight: 0.038,
    },
  },
  cardinal: {
    name: 'cardinal', fullName: 'Northern Cardinal', scientificName: 'Cardinalis cardinalis',
    reference: 'https://www.allaboutbirds.org/guide/Northern_Cardinal/id',
    lengthCm: 22, wingspanCm: 28, scale: 22 / 16, flight: 'flap', flapHz: 9,
    crest: true, beakThick: 1.5,
    back: '#b43b36', belly: '#c7473f', breast: '#ca443b', cap: '#bd3933', face: '#bd3b34',
    throat: '#272422', mask: '#272422', wing: '#963d36', tip: '#76382f', tail: '#a13d34', beak: '#d97146', legs: '#927967',
    motion: {
      perchPitch: 0.37, tailAngle: 0.44, idlePace: 0.9, flapAmplitude: 1.03,
      flareTime: 0.33, settleTime: 0.35, launchTime: 0.15,
      boundPeriod: 0.8, boundDuty: 0.85, glidePeriod: 2, glideDuty: 0.9,
      headSpeed: 10, hopHeight: 0.045,
    },
  },
  chickadee: {
    name: 'chickadee', fullName: 'Black-capped Chickadee', scientificName: 'Poecile atricapillus',
    reference: 'https://www.allaboutbirds.org/guide/Black-capped_Chickadee/id',
    lengthCm: 13.5, wingspanCm: 18.5, scale: 13.5 / 16, flight: 'bound', flapHz: 14,
    back: '#8b908a', belly: '#e7e4d6', breast: '#e6e1d1', flank: '#cdb995', cap: '#252725', face: '#e9e9df',
    throat: '#282a26', cheek: '#f0eee5', wing: '#777d78', wingbar: '#d0d4cc', tip: '#515853',
    tail: '#626b64', beak: '#2b302c', legs: '#4b514b', wingBars: 0,
    motion: {
      perchPitch: 0.29, tailAngle: 0.24, idlePace: 1.45, flapAmplitude: 1.05,
      flareTime: 0.24, settleTime: 0.24, launchTime: 0.10,
      boundPeriod: 0.5, boundDuty: 0.69, glidePeriod: 1.3, glideDuty: 0.85,
      headSpeed: 14, hopHeight: 0.06,
    },
  },
  gull: {
    name: 'gull', fullName: 'Ring-billed Gull', scientificName: 'Larus delawarensis',
    reference: 'https://www.allaboutbirds.org/guide/Ring-billed_Gull/id',
    lengthCm: 48.5, wingspanCm: 111, scale: 48.5 / 16, flight: 'glide', flapHz: 3.3, wingLen: 1.5,
    back: '#aeb8bd', belly: '#efeee6', breast: '#f1f0e8', cap: '#f1f0e8', face: '#eeeee5',
    throat: '#f2f0e7', wing: '#aab5bb', tip: '#2c3234', primarySpot: '#f1efe6', tail: '#e6e9e3',
    beak: '#d4b94a', billBand: '#323532', legs: '#c3ae55', iris: '#d8ce87', eyeRing: '#bc7258',
    motion: {
      perchPitch: 0.11, tailAngle: 0.08, idlePace: 0.56, flapAmplitude: 0.76,
      flareTime: 0.65, settleTime: 0.57, launchTime: 0.25,
      boundPeriod: 1.3, boundDuty: 0.9, glidePeriod: 3.6, glideDuty: 0.42,
      headSpeed: 7, hopHeight: 0.02,
    },
  },
};
