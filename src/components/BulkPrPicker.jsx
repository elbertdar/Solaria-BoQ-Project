import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { boqForProject, materialName, remainingQty, boqLineStatus } from '../engine/reconcile.js';
import { BoqLineStatusPill, TriStateCheckbox } from './ui.jsx';
import { idr, num } from '../engine/format.js';

// Step 1 of bulk ordering from the PR page: pick which orderable (working-phase) BoQ lines
// you're buying. Hands the selected ids to BulkPrModal, where the store + quantities are set.
export default function BulkPrPicker({ projectId, onClose, onNext }) {
  const { db } = useStore();
  const phases = (db.phases || []).filter((p) => p.projectId === projectId);
  const workingPhases = phases.filter((ph) => ph.boqStatus === 'working');

  const lines = useMemo(() => {
    const out = [];
    for (const ph of workingPhases) for (const b of boqForProject(db, projectId, ph.id)) out.push({ b, phase: ph });
    return out;
  }, [db, projectId, workingPhases]);

  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const norm = q.trim().toLowerCase();
  const shown = lines
    .filter(({ b }) => !norm || (materialName(db, b.materialId) + ' ' + (b.description || '')).toLowerCase().includes(norm))
    .map(({ b, phase }) => ({ b, phase, rem: remainingQty(db, b.id), ls: boqLineStatus(db, b.id) }));
  // Select-all skips fully-received lines (remaining = 0 would just block the batch) —
  // they stay visible (dimmed) and individually tickable for a deliberate re-order.
  const selectableIds = shown.filter((x) => x.ls !== 'complete').map((x) => x.b.id);
  const allSel = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSel = selectableIds.some((id) => selected.has(id));

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allSel) selectableIds.forEach((id) => n.delete(id)); else selectableIds.forEach((id) => n.add(id)); return n; });

  return (
    <Modal
      title="Bulk order — pick the items"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>{selected.size} selected</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={selected.size === 0} onClick={() => onNext([...selected])}>Continue</button>
        </>
      }
    >
      <p className="help" style={{ marginTop: 0 }}>Tick everything you're buying this run — next you'll pick the store and confirm quantities.</p>
      <div style={{ marginBottom: 10 }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search material or description…" style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>

      {workingPhases.length === 0 ? (
        <div className="empty">No working phases yet. Finalize a BoQ phase to start ordering against its lines.</div>
      ) : (
        <div className="card-body flush" style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 34 }}><TriStateCheckbox checked={allSel} indeterminate={someSel} onChange={toggleAll} title="Select all shown" /></th>
                <th>Material</th><th>Description</th><th>Phase</th>
                <th className="num">Budget qty</th><th className="num">Remaining</th>
                <th className="num">Exp. unit cost</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ b, phase, rem, ls }) => {
                const allow = b.budgetBasis === 'allowance';
                const sel = selected.has(b.id);
                return (
                  <tr key={b.id} className="clickable" onClick={() => toggle(b.id)}
                    title={ls === 'complete' ? 'Fully received — tick only for a deliberate re-order' : undefined}
                    style={sel ? { background: '#EFF6FF' } : ls === 'complete' ? { opacity: 0.55 } : undefined}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => toggle(b.id)} /></td>
                    <td className="mat-link"><b>{materialName(db, b.materialId)}</b>{allow && <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>}</td>
                    <td>{b.description}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{phase.name}</td>
                    <td className="num">{allow ? <span className="muted">—</span> : num(b.quantity)} {!allow && <span className="muted" style={{ fontSize: 11 }}>{b.unit}</span>}</td>
                    <td className="num">{allow ? <span className="muted">—</span> : num(rem)}</td>
                    <td className="num">{idr(b.expectedUnitCost)}</td>
                    <td><BoqLineStatusPill status={ls} /></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={8}><div className="empty">{lines.length === 0 ? 'No orderable lines yet.' : 'No lines match your search.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
