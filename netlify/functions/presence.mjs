import { getStore } from '@netlify/blobs';

// Concurrent listener count.
// Every open tab POSTs a heartbeat ({ id }) every ~25s. Heartbeats are written
// into 30-second buckets (`b/<bucket>/<id>`); anyone seen in the current or the
// previous bucket counts as listening. Old buckets are swept occasionally.

const WINDOW_MS = 30_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function sweep(store, bucket) {
  const { directories } = await store.list({ prefix: 'b/', directories: true });
  const stale = directories.filter((d) => Number(d.slice(2)) < bucket - 1);
  for (const dir of stale) {
    const { blobs } = await store.list({ prefix: `${dir}/` });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    // sendBeacon bodies can arrive as text
  }
  const id = String(body.id || '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 48);
  if (id.length < 6) return json({ error: 'bad id' }, 400);

  const store = getStore({ name: 'presence', consistency: 'strong' });
  const bucket = Math.floor(Date.now() / WINDOW_MS);

  if (body.leave) {
    await Promise.all([store.delete(`b/${bucket}/${id}`), store.delete(`b/${bucket - 1}/${id}`)]);
    return new Response(null, { status: 204 });
  }

  await store.set(`b/${bucket}/${id}`, '1');
  const [cur, prev] = await Promise.all([
    store.list({ prefix: `b/${bucket}/` }),
    store.list({ prefix: `b/${bucket - 1}/` }),
  ]);
  const ids = new Set();
  for (const { key } of [...cur.blobs, ...prev.blobs]) ids.add(key.slice(key.lastIndexOf('/') + 1));

  if (Math.random() < 0.08) {
    const job = sweep(store, bucket).catch(() => {});
    if (context?.waitUntil) context.waitUntil(job);
    else await job;
  }

  return json({ count: Math.max(1, ids.size) });
};

export const config = { path: '/api/presence' };
