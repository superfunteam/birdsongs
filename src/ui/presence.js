// Heartbeat to the Netlify function; reports how many people are listening.
const ENDPOINT = '/api/presence';
const BEAT_MS = 25_000;

function sessionId() {
  let id = null;
  try {
    id = sessionStorage.getItem('birdsongs:id');
  } catch {
    // storage blocked
  }
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^a-zA-Z0-9-]/g, '');
    try {
      sessionStorage.setItem('birdsongs:id', id);
    } catch {
      // fine, a fresh id per load
    }
  }
  return id;
}

export function startPresence(onCount) {
  const id = sessionId();
  const beat = async () => {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      onCount(typeof data.count === 'number' ? data.count : null);
    } catch {
      onCount(null);
    }
  };
  beat();
  setInterval(beat, BEAT_MS);
  window.addEventListener('pagehide', () => {
    try {
      navigator.sendBeacon?.(ENDPOINT, new Blob([JSON.stringify({ id, leave: true })], { type: 'application/json' }));
    } catch {
      // best effort
    }
  });
}
