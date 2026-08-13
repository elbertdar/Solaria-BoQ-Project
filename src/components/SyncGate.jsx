import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import BrandMark from './BrandMark.jsx';

// Shown only when the server backend is deployed and needs the access passphrase. Otherwise
// (local-only, or already synced) it just renders the app. "Use offline" opts out to
// browser-only storage on this device.
export default function SyncGate({ children }) {
  const { syncStatus, connectRemote, useOffline } = useStore();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (syncStatus !== 'needkey') return children;

  const submit = async () => {
    if (!key.trim() || busy) return;
    setBusy(true); setError('');
    const ok = await connectRemote(key.trim());
    setBusy(false);
    if (!ok) setError('That passphrase didn’t match. Try again.');
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand"><BrandMark size={34} /><span>Solaria Resto<small>Procurement · BoQ Control</small></span></div>
        <h1>Unlock your workspace</h1>
        <p>Your data is saved on the server. Enter your access passphrase to load and sync it on this device.</p>
        <input type="password" autoFocus value={key} placeholder="Access passphrase"
          onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        {error && <div className="gate-error">{error}</div>}
        <button className="btn primary" onClick={submit} disabled={busy || !key.trim()} style={{ width: '100%' }}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button className="btn ghost" onClick={useOffline} style={{ width: '100%' }}>Use offline on this device</button>
        <p className="gate-note">“Use offline” keeps working with data saved only in this browser — it won’t sync to the server.</p>
      </div>
    </div>
  );
}
