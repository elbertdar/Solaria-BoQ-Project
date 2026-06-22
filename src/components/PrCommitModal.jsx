import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Modal from './Modal.jsx';
import { StatusPill } from './ui.jsx';
import { materialName, isExtraPr } from '../engine/reconcile.js';
import { fmtDate } from '../engine/format.js';

// Review & commit for staged PR status changes (the major, commitment-crossing ones).
// Per-change selection (granular) — commit a subset, leave the rest pending; per-row discard.
export default function PrCommitModal({ db, staged, onCommit, onDiscard, onClose }) {
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(() => new Set(staged.map((s) => s.id)));
  const toggle = (id) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = selected.size === staged.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(staged.map((s) => s.id)));

  return (
    <Modal title={`Review ${staged.length} status change${staged.length > 1 ? 's' : ''}`} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={selected.size === 0} onClick={() => onCommit([...selected], message)}>
          Commit {selected.size} change{selected.size === 1 ? '' : 's'}
        </button>
      </>}>
      <p className="help" style={{ marginTop: 0 }}>
        These cross a commitment boundary (into/out of Ordered or Received), so they wait here until you commit them.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <label className="toggle"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 'auto' }} /> Select all</label>
        <span className="muted" style={{ fontSize: 12.5 }}>{selected.size} of {staged.length} selected — unticked stay pending.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {staged.map((s) => {
          const pr = db.prs.find((p) => p.id === s.prId);
          if (!pr) return null;
          return (
            <label key={s.id} className="chip" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 'auto', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <b>{materialName(db, pr.materialId)}</b>
                  {isExtraPr(db, pr) && <span className="pill warn" style={{ fontSize: 11 }}>Extra</span>}
                  <span className="muted" style={{ fontSize: 12 }}>· {pr.quantity} {pr.unit}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                  <StatusPill status={s.from} /><ArrowRight size={13} className="muted" /><StatusPill status={s.to} />
                  {s.receiptDate && <span className="muted" style={{ fontSize: 12 }}>· received {fmtDate(s.receiptDate)}</span>}
                </div>
              </div>
              <button className="btn sm ghost" style={{ color: 'var(--risk)', flexShrink: 0 }}
                onClick={(e) => { e.preventDefault(); onDiscard(s.prId); }}>Discard</button>
            </label>
          );
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="lbl">Commit note <span className="muted">(optional)</span></label>
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. POs raised after quote approval" />
        <div className="help">Recorded on each PR's status history, attributed to {db.currentUser?.name}.</div>
      </div>
    </Modal>
  );
}
