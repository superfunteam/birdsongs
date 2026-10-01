// Melodies are public domain. Score format: see src/music/parse.js
//
// Transcription notes
// - Durations are in sixteenth-note units (1 = 16th, 4 = quarter, 12 = dotted half).
// - Notes that are tied across a bar line in the original are written as the
//   note inside its own bar followed by rests in the next bar(s). The rests
//   carry the chord changes that happen underneath the held note, and every
//   bar still sums to a full measure. (All four instruments ring and decay
//   naturally, so the note still "hangs" over those rests.)
//
// Sources cross-checked:
// - Für Elise: musicaviva / Frank Nordberg two-voice ABC (abcnotation.com, tune 4347)
//   + a second simplified ABC (englishtap.co.uk).
// - Gymnopédie No. 1: Colin Hume's ABC (colinhume.com, tune 564) + the
//   pianoletternotes.blogspot.com letter-note transcription. They agree note for note.
// - Canon in D: Mutopia "Canon per 3 Violini e Basso" LilyPond source (violin I)
//   + Colin Hume's "Pachelbel's Canon" ABC + Wikipedia's score excerpt.
// - Brahms' Lullaby: Mutopia "Wiegenlied" Op. 49 No. 4 LilyPond source (Indiana Univ.
//   scan) + trillian.mit.edu Wiegenlied ABC. Transposed from E-flat to F major.
// - Clair de lune: Mutopia LilyPond source of the 1905 Fromont edition (bars 1-14).

export const SONGS = [
  // ---------------------------------------------------------------------------
  // Für Elise: A (with repeat) - B (C major episode) - A
  {
    id: 'fur-elise',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven',
    year: 1810,
    bpm: 52,
    timeSig: '3/8',
    instrument: 'musicbox',
    repeat: 2,
    score: `
      E5:1 D#5:1 |
      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 G#4:1 B4:1 |
      [Am] C5:2 r:1 E4:1 E5:1 D#5:1 |
      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 C5:1 B4:1 |
      [Am] A4:2 r:2 E5:1 D#5:1 |

      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 G#4:1 B4:1 |
      [Am] C5:2 r:1 E4:1 E5:1 D#5:1 |
      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 C5:1 B4:1 |
      [Am] A4:2 r:1 B4:1 C5:1 D5:1 |

      [C] E5:3 G4:1 F5:1 E5:1 |
      [G] D5:3 F4:1 E5:1 D5:1 |
      [Am] C5:3 E4:1 D5:1 C5:1 |
      [E] B4:2 r:1 E4:1 E5:1 r:1 |
      r:1 E5:1 E6:1 D#5:1 E5:1 D#5:1 |
      E5:1 D#5:1 E5:1 D#5:1 E5:1 D#5:1 |

      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 G#4:1 B4:1 |
      [Am] C5:2 r:1 E4:1 E5:1 D#5:1 |
      E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 |
      [Am] A4:2 r:1 C4:1 E4:1 A4:1 |
      [E] B4:2 r:1 E4:1 C5:1 B4:1 |
      [Am] A4:6 |
      r:4 |
    `,
  },

  // ---------------------------------------------------------------------------
  // Gymnopédie No. 1: bars 1-39 (intro, both phrases, middle section, first ending)
  {
    id: 'gymnopedie-1',
    title: 'Gymnopédie No. 1',
    composer: 'Erik Satie',
    year: 1888,
    bpm: 66,
    timeSig: '3/4',
    instrument: 'rhodes',
    repeat: 1,
    score: `
      [Gmaj7] r:12 |
      [Dmaj7] r:12 |
      [Gmaj7] r:12 |
      [Dmaj7] r:12 |

      [Gmaj7] r:4 F#5:4 A5:4 |
      [Dmaj7] G5:4 F#5:4 C#5:4 |
      [Gmaj7] B4:4 C#5:4 D5:4 |
      [Dmaj7] A4:12 |
      [Gmaj7] F#4:12 |
      [Dmaj7] r:12 |
      [Gmaj7] r:12 |
      [Dmaj7] r:12 |

      [Gmaj7] r:4 F#5:4 A5:4 |
      [Dmaj7] G5:4 F#5:4 C#5:4 |
      [Gmaj7] B4:4 C#5:4 D5:4 |
      [Dmaj7] A4:12 |
      [F#m] C#5:12 |
      [Bm] F#5:12 |
      [Em] E4:12 |
      [Em7] r:12 |
      [Dm] r:12 |

      [Am] A4:4 B4:4 C5:4 |
      [Em7/D] E5:4 D5:4 B4:4 |
      D5:4 C5:4 B4:4 |
      [Am/D] D5:12 |
      [D7] r:8 D5:4 |
      [Dm7] E5:4 F5:4 G5:4 |
      [Am/D] A5:4 C5:4 D5:4 |
      [Em7/D] E5:4 D5:4 B4:4 |
      [Am/D] D5:12 |
      [D7] r:8 D5:4 |

      [Em] G5:12 |
      [F#m] F#5:12 |
      [Bm] B4:4 A4:4 B4:4 |
      [A/E] C#5:4 D5:4 E5:4 |
      [F#m7/E] C#5:4 D5:4 E5:4 |
      [Em7] F#4:12 |
      [Am7] C5:12 |
      [D] D5:12 |
    `,
  },

  // ---------------------------------------------------------------------------
  // Canon in D: violin I, written in doubled note values (one chord per half note).
  // Variations = original bars 3-4, 5-6, 7-8, 9-10, 15-16, 17-18 (the 16th/32nd
  // runs of bars 11-14 and 19-22 are skipped to keep it slow).
  {
    id: 'canon-in-d',
    title: 'Canon in D',
    composer: 'Johann Pachelbel',
    year: 1680,
    bpm: 68,
    timeSig: '4/4',
    instrument: 'celesta',
    repeat: 2,
    score: `
      [D] F#5:8 [A] E5:8 |
      [Bm] D5:8 [F#m] C#5:8 |
      [G] B4:8 [D] A4:8 |
      [G] B4:8 [A] C#5:8 |

      [D] D5:8 [A] C#5:8 |
      [Bm] B4:8 [F#m] A4:8 |
      [G] G4:8 [D] F#4:8 |
      [G] G4:8 [A] E4:8 |

      [D] D4:4 F#4:4 [A] A4:4 G4:4 |
      [Bm] F#4:4 D4:4 [F#m] F#4:4 E4:4 |
      [G] D4:4 B3:4 [D] D4:4 A4:4 |
      [G] G4:4 B4:4 [A] A4:4 G4:4 |

      [D] F#4:4 D4:4 [A] E4:4 C#5:4 |
      [Bm] D5:4 F#5:4 [F#m] A5:4 A4:4 |
      [G] B4:4 G4:4 [D] A4:4 F#4:4 |
      [G] D4:4 D5:4 [A] D5:6 C#5:2 |

      [D] F#4:4 F#5:4 [A] E5:8 |
      [Bm] r:4 D5:4 [F#m] F#5:8 |
      [G] B5:8 [D] A5:8 |
      [G] B5:8 [A] C#6:8 |

      [D] D6:4 D5:4 [A] C#5:8 |
      [Bm] r:4 B4:4 [F#m] D5:8 |
      [G] D5:12 [D] D5:4 |
      [G] D5:4 G5:4 [A] E5:4 A5:4 |

      [D] D5:16 |
    `,
  },

  // ---------------------------------------------------------------------------
  // Brahms' Lullaby (Wiegenlied, Op. 49 No. 4): complete melody, F major
  {
    id: 'brahms-lullaby',
    title: "Brahms' Lullaby",
    composer: 'Johannes Brahms',
    year: 1868,
    bpm: 58,
    timeSig: '3/4',
    instrument: 'musicbox',
    repeat: 3,
    score: `
      A4:2 A4:2 |
      [F] C5:6 A4:2 A4:4 |
      C5:4 r:4 A4:2 C5:2 |
      F5:4 E5:6 D5:2 |
      [C7] D5:4 C5:4 G4:2 A4:2 |
      Bb4:4 G4:4 G4:2 A4:2 |
      Bb4:4 r:4 G4:2 Bb4:2 |
      E5:2 D5:2 C5:4 E5:4 |
      [F] F5:4 r:4 F4:2 F4:2 |

      [Bb] F5:8 D5:2 Bb4:2 |
      [F] C5:8 A4:2 F4:2 |
      [C7] Bb4:4 C5:4 D5:4 |
      [F] C5:8 F4:2 F4:2 |
      [Bb] F5:8 D5:2 Bb4:2 |
      [F] C5:8 A4:2 F4:2 |
      [C7] Bb4:4 A4:4 G4:4 |
      [F] F4:12 |
      r:8 |
    `,
  },

  // ---------------------------------------------------------------------------
  // Clair de lune (Suite bergamasque): opening, bars 1-14, top line of the
  // right-hand thirds. Each "r:2" that opens a bar is the tied continuation of
  // the previous bar's last note.
  {
    id: 'clair-de-lune',
    title: 'Clair de lune',
    composer: 'Claude Debussy',
    year: 1905,
    bpm: 50,
    timeSig: '9/8',
    instrument: 'kalimba',
    repeat: 2,
    score: `
      [Db] r:2 Ab4:2 Ab5:8 F5:6 |
      [Cdim] r:2 Eb5:2 F5:2 Eb5:12 |
      [Bbm7] r:2 Db5:2 Eb5:2 Db5:3 F5:6 Db5:3 |
      [Ab7] r:2 C5:2 Db5:2 C5:12 |
      [Ebm7/Db] r:2 Bb4:2 C5:2 Bb4:2 Eb5:2 Bb4:2 [Ab7/C] Ab4:2 Bb4:2 Ab4:2 |
      [Ebm7/Bb] r:2 Gb4:2 Ab4:2 Gb4:6 [F7/A] F4:6 |
      [Bbm7/Ab] r:2 F4:2 Gb4:2 F4:2 Bb4:2 F4:2 [Gb6] Eb4:2 F4:2 Eb4:2 |
      [Bbm/F] r:2 Db4:2 Eb4:2 Db4:6 [Ab7] C4:6 |

      [Db] r:2 Ab3:2 Ab4:2 Ab5:6 F5:6 |
      [Gb] r:2 Eb5:2 F5:2 Eb5:12 |
      [Db/F] r:2 Db5:2 Eb5:2 Ab5:6 F5:6 |
      [Gb] r:2 Eb5:2 F5:2 Eb5:6 Db5:6 |
      [Db7/Ab] r:2 Db5:2 Eb5:2 Bb5:3 Ab5:6 F5:3 |
      [Bbsus4] F5:2 Eb5:2 F5:2 Eb5:3 [Bbm] Db5:6 Bb4:3 |
    `,
  },
];
