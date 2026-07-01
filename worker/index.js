// Cloudflare Worker: serves the static app AND a tiny state API backed by KV.
//
//   GET  /api/state  → { data: <the saved db, or null> }
//   PUT  /api/state  → stores the request body (the whole db JSON) under one key
//
// Access is gated by a shared passphrase: the client enters it once (stored in their
// browser) and it's sent as `x-app-key`; the Worker checks it against the APP_KEY secret
// server-side, so the passphrase itself is never shipped in the frontend bundle.
//
// Everything that isn't /api/* is handed to the static assets (with SPA fallback), so the
// React app and its client-side routes keep working exactly as before.

const KV_KEY = 'db'; // single workspace for the pilot

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/state') {
      if (!env.BOQ_KV) return json({ error: 'storage not configured' }, 503);

      // Auth — reject unless the passphrase matches the server-side secret.
      const provided = request.headers.get('x-app-key') || '';
      if (!env.APP_KEY || provided !== env.APP_KEY) return json({ error: 'unauthorized' }, 401);

      if (request.method === 'GET') {
        const stored = await env.BOQ_KV.get(KV_KEY);
        return json({ data: stored ? JSON.parse(stored) : null });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        try { JSON.parse(body); } catch { return json({ error: 'invalid json' }, 400); }
        await env.BOQ_KV.put(KV_KEY, body);
        return json({ ok: true });
      }
      return json({ error: 'method not allowed' }, 405);
    }

    // Not an API route → static asset / SPA fallback.
    return env.ASSETS.fetch(request);
  },
};
