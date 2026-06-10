import { useState } from 'react';
import { materialName, prsForBoqItem, BOQ_FIELDS } from '../engine/reconcile.js';
import { idr, num } from '../engine/format.js';
import Modal from './Modal.jsx';
import { fmtVal } from './boqShared.jsx';

export default function CommitModal({ db, staged, projectId, onCommit, onClose }) {
  const [message, setMessage] = useState('');
  const byId = Object.fromEntries(db.boqItems.map((b) => [b.id, b]));
  const fieldMap = Object.fromEntries(BOQ_FIELDS.map((f) => [f.key, f]));
  const adds = staged.filter((s) => s.type === 'add');
  const mods = staged.filter((s) => s.type === 'modify');
  const dels = staged.filter((s) => s.type === 'delete');

  return (
    <Modal title={`Commit ${staged.length} change${staged.length > 1 ? 's' : ''}`} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onCommit(message)}>Commit changes</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mods.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Modified ({mods.length})</div>
            {mods.map((s) => { const b = byId[s.boqItemId]; return (
              <div key={s.boqItemId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b>{materialName(db, b?.materialId)}</b>
                <div style={{ marginTop: 4, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.keys(s.patch).filter((k) => fieldMap[k]).map((k) => (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span className="muted" style={{ minWidth: 112 }}>{fieldMap[k].label}</span>
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtVal(db, fieldMap[k].kind, b?.[k])}</span>
                      <span>→</span>
                      <b>{fmtVal(db, fieldMap[k].kind, s.patch[k])}</b>
                    </div>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}
        {adds.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Added ({adds.length})</div>
            {adds.map((s) => (
              <div key={s.tempId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b>{materialName(db, s.fields.materialId)}</b>
                <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                  {num(s.fields.quantity)} {s.fields.unit} · {idr(s.fields.expectedUnitCost)} · needed day {s.fields.neededDayOffset ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}
        {dels.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Removed ({dels.length})</div>
            {dels.map((s) => { const b = byId[s.boqItemId]; const prs = prsForBoqItem(db, s.boqItemId); return (
              <div key={s.boqItemId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b style={{ textDecoration: 'line-through' }}>{materialName(db, b?.materialId)}</b>
                {prs.length > 0 && (s.deletePrs
                  ? <span style={{ marginLeft: 8, color: 'var(--risk)', fontSize: 13 }}>⚠ also removes {prs.length} linked PR{prs.length > 1 ? 's' : ''}</span>
                  : <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{prs.length} linked PR{prs.length > 1 ? 's' : ''} kept as extra</span>)}
              </div>
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
