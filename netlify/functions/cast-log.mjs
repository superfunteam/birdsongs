import { getStore } from '@netlify/blobs';

// Diagnostics from the TV page (receiver.html): what device, what failed.
// Write-only from the web; read with `netlify blobs:list cast-logs`.
export default async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const text = (await req.text()).slice(0, 16000);
  try {
    JSON.parse(text);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const store = getStore('cast-logs');
  const key = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
  await store.set(key, text);
  return new Response(null, { status: 204 });
};

export const config = { path: '/api/cast-log' };
