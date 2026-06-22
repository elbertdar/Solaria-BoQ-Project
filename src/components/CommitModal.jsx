import { useState } from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { materialName, prsForBoqItem, BOQ_FIELDS } from '../engine/reconcile.js';
import { idr, num } from '../engine/format.js';
import { stagedKey } from '../store/StoreContext.jsx';
import Modal from './Modal.jsx';
import { fmtVal } from './boqShared.jsx';

export default function CommitModal({ db, staged, onCommit, onClose }) {
  const [message, setMessage] = useState('');
  // Per-change selection — commit a chosen subset, leave the rest staged. All selected by default.
  const [selected, setSelected] = useState(() => new Set(staged.map(stagedKey)));
  const toggle = (k) => setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allSelected = selected.size === staged.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(staged.map(stagedKey)));

  const byId = Object.fromEntries(db.boqItems.map((b) => [b.id, b]));
  const fieldMap = Object.fromEntries(BOQ_FIELDS.map((f) => [f.key, f]));
  const adds = staged.filter((s) => s.type === 'add');
  const mods = staged.filter((s) => s.type === 'modify');
  const dels = staged.filter((s) => s.type === 'delete');

  const Check = ({ k }) => (
    <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} style={{ marginTop: 3, width: 'auto', flexShrink: 0 }} />
  );

  return (
    <Modal title={`Review ${staged.length} change${staged.length > 1 ? 's' : ''}`} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={selected.size === 0} onClick={() => onCommit(message, [...selected])}>
          Commit {selected.size} change{selected.size === 1 ? '' : 's'}
        </button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <label className="toggle"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 'auto' }} /> Select all</label>
        <span className="muted" style={{ fontSize: 12.5 }}>{selected.size} of {staged.length} selected — unticked changes stay staged.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mods.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Modified ({mods.length})</div>
            {mods.map((s) => { const b = byId[s.boqItemId]; const k = stagedKey(s); return (
              <label key={k} className="chip" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                <Check k={k} />
                <div style={{ flex: 1 }}>
                  <b>{materialName(db, b?.materialId)}</b>
                  <div style={{ marginTop: 4, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {Object.keys(s.patch).filter((key) => fieldMap[key]).map((key) => (
                      <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span className="muted" style={{ minWidth: 112 }}>{fieldMap[key].label}</span>
                        <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtVal(db, fieldMap[key].kind, b?.[key])}</span>
                        <ArrowRight size={13} className="muted" style={{ alignSelf: 'center' }} />
                        <b>{fmtVal(db, fieldMap[key].kind, s.patch[key])}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </label>
            ); })}
          </div>
        )}
        {adds.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Added ({adds.length})</div>
            {adds.map((s) => { const k = stagedKey(s); return (
              <label key={k} className="chip" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                <Check k={k} />
                <div style={{ flex: 1 }}>
                  <b>{materialName(db, s.fields.materialId)}</b>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                    {num(s.fields.quantity)} {s.fields.unit} · {idr(s.fields.expectedUnitCost)} · needed day {s.fields.neededDayOffset ?? '—'}
                  </span>
                </div>
              </label>
            ); })}
          </div>
        )}
        {dels.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Removed ({dels.length})</div>
            {dels.map((s) => { const b = byId[s.boqItemId]; const prs = prsForBoqItem(db, s.boqItemId); const k = stagedKey(s); return (
              <label key={k} className="chip" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                <Check k={k} />
                <div style={{ flex: 1 }}>
                  <b style={{ textDecoration: 'line-through' }}>{materialName(db, b?.materialId)}</b>
                  {prs.length > 0 && (s.deletePrs
                    ? <span style={{ marginLeft: 8, color: 'var(--risk)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}><TriangleAlert size={13} /> also removes {prs.length} linked PR{prs.length > 1 ? 's' : ''}</span>
                    : <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{prs.length} linked PR{prs.length > 1 ? 's' : ''} kept as extra</span>)}
                </div>
              </label>
            ); })}
          </div>
        )}
        <div>
          <label className="lbl">Commit message <span className="muted">(optional)</span></label>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Revised quantities after site survey" />
          <div className="help">Saved to the edit history, attributed to {db.currentUser?.name}.</div>
        </div>
      </div>
    </Modal>
  );
}
