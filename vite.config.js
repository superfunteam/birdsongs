import { defineConfig } from 'vite';

// In `vite dev` there is no Netlify function, so answer the presence
// heartbeat locally (use `netlify dev` to exercise the real one).
const devPresence = {
  name: 'dev-presence',
  configureServer(server) {
    server.middlewares.use('/api/presence', (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ count: 1 }));
    });
  },
};

// Structured data for search/link previews, built from the real song list.
const jsonLd = {
  name: 'json-ld',
  async transformIndexHtml() {
    const { SONGS, MIDI_SONGS } = await import('./src/music/songs.js');
    const site = 'https://birdsongs.superfun.games/';
    const tracks = [...SONGS, ...MIDI_SONGS].map((s) => ({
      '@type': 'MusicRecording',
      name: s.title,
      recordingOf: { '@type': 'MusicComposition', name: s.title, composer: { '@type': 'Person', name: s.composer } },
    }));
    const data = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Birdsongs',
          url: site,
          image: `${site}og.png`,
          description: 'A lofi pixel-art radio. Every bird that lands on or leaves the power lines plays one note of a song you know.',
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires WebGL and the Web Audio API',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          author: { '@type': 'Organization', name: 'Superfun' },
        },
        { '@type': 'MusicPlaylist', name: 'Birdsongs', url: site, numTracks: tracks.length, track: tracks },
      ],
    };
    return [{ tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(data), injectTo: 'head' }];
  },
};

export default defineConfig({
  plugins: [devPresence, jsonLd],
  build: {
    chunkSizeWarningLimit: 800,
  },
});
