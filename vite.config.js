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

export default defineConfig({
  plugins: [devPresence],
  build: {
    chunkSizeWarningLimit: 800,
  },
});
