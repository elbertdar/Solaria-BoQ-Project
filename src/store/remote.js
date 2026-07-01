// Remote persistence seam — talks to the Worker's /api/state endpoint (KV-backed).
//
// The whole db is stored as one JSON blob (mirrors the localStorage model). Everything is
// best-effort: if the backend isn't deployed or is unreachable, callers fall back to
// localStorage and the app works exactly as before. The passphrase is kept in localStorage
// on this device only and sent as a header; the server checks it against its APP_KEY secret.

const API = '/api/state';
const KEY_STORE = 'solaria_app_key';

export const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
export const setKey = (k) => { try { localStorage.setItem(KEY_STORE, k); } catch { /* quota */ } };
export const clearKey = () => { try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ } };

// { status: 'ok', data } | { status: 'unauthorized' } | { status: 'unavailable' }
export async function loadRemote() {
  const key = getKey();
  try {
    const res = await fetch(API, { headers: key ? { 'x-app-key': key } : {} });
    if (res.status === 401) return { status: 'unauthorized' };
    if (!res.ok) return { status: 'unavailable' };
    // No Worker deployed → the SPA fallback returns index.html, not JSON.
    if (!(res.headers.get('content-type') || '').includes('application/json')) return { status: 'unavailable' };
    const body = await res.json();
    return { status: 'ok', data: body.data ?? null };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function saveRemote(db) {
  const key = getKey();
  if (!key) return false;
  try {
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'x-app-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(db),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Fire-and-forget save that survives tab close (used on beforeunload to flush pending edits).
export function flushRemote(db) {
  const key = getKey();
  if (!key) return;
  try {
    fetch(API, {
      method: 'PUT', keepalive: true,
      headers: { 'x-app-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(db),
    });
  } catch { /* best effort */ }
}
