import { useMemo, useState } from 'react';
import { useStore, useProject, useProjectPhases } from '../store/StoreContext.jsx';
import { boqForProject, materialName, remainingQty, boqLineStatus } from '../engine/reconcile.js';
import { FilterBar, FilterSearch, ProjectBar } from '../components/ui.jsx';
import BulkPrModal from '../components/BulkPrModal.jsx';
import { idr, num } from '../engine/format.js';

// Project-wide bulk PR: one screen listing every orderable (working-phase) BoQ line across
// all phases, with checkboxes → raise them together through the shared BulkPrModal.
export default function BulkPrPage() {
  const { db, currentProjectId } = useStore();
  const project = useProject();
  const phases = useProjectPhases();
  const workingPhases = phases.filter((ph) => ph.boqStatus === 'working');

  const lines = useMemo(() => {
    const out = [];
    for (const ph of workingPhases) for (const b of boqForProject(db, currentProjectId, ph.id)) out.push({ b, phase: ph });
    return out;
  }, [db, currentProjectId, workingPhases]);

  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const norm = q.trim().toLowerCase();
  const shown = lines.filter(({ b }) => !norm || (materialName(db, b.materialId) + ' ' + (b.description || '')).toLowerCase().includes(norm));
  const shownIds = shown.map(({ b }) => b.id);
  const allSel = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const someSel = shownIds.some((id) => selected.has(id));

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allSel) shownIds.forEach((id) => n.delete(id)); else shownIds.forEach((id) => n.add(id)); return n; });
  const clear = () => setSelected(new Set());

  return (
    <>
      <div className="page-head">
        <h1>Bulk Purchase Requests</h1>
        <p className="sub">{project.name} · order several items from one store at once — tick the lines, pick the store, done</p>
      </div>

      {workingPhases.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty">No working phases yet. Finalize a BoQ phase to start ordering against its lines.</div></div></div>
      ) : (
        <>
          <FilterBar shown={shown.length} total={lines.length} unit="lines">
            <ProjectBar embedded />
            <FilterSearch value={q} onChange={setQ} placeholder="Search material or description…" />
          </FilterBar>

          <div className="card">
            <div className="card-body flush">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}><input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel && !allSel; }} onChange={toggleAll} title="Select all shown" /></th>
                    <th>Material</th><th>Description</th><th>Phase</th>
                    <th className="num">Budget qty</th><th className="num">Remaining</th>
                    <th className="num">Exp. unit cost</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ b, phase }) => {
                    const allow = b.budgetBasis === 'allowance';
                    const rem = remainingQty(db, b.id);
                    const ls = boqLineStatus(db, b.id);
                    const sel = selected.has(b.id);
                    return (
                      <tr key={b.id} className="clickable" onClick={() => toggle(b.id)} style={sel ? { background: '#EFF6FF' } : undefined}>
                        <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => toggle(b.id)} /></td>
                        <td className="mat-link"><b>{materialName(db, b.materialId)}</b>{allow && <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>}</td>
                        <td>{b.description}</td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{phase.name}</td>
                        <td className="num">{allow ? <span className="muted">—</span> : num(b.quantity)} {!allow && <span className="muted" style={{ fontSize: 11 }}>{b.unit}</span>}</td>
                        <td className="num">{allow ? <span className="muted">—</span> : num(rem)}</td>
                        <td className="num">{idr(b.expectedUnitCost)}</td>
                        <td>{ls === 'complete'
                          ? <span className="pill" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #D1FAE5' }}>Complete</span>
                          : ls === 'ordered' ? <span className="pill info">Ordered</span> : <span className="pill gray">Not ordered</span>}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan={8}><div className="empty">{lines.length === 0 ? 'No orderable lines yet.' : 'No lines match your search.'}</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span><b>{selected.size}</b> line{selected.size > 1 ? 's' : ''} selected</span>
          <button className="btn sm ghost" onClick={clear}>Clear</button>
          <button className="btn sm primary" onClick={() => setBulkOpen(true)}>Raise PRs</button>
        </div>
      )}
      {bulkOpen && <BulkPrModal boqItemIds={[...selected]} projectId={currentProjectId} onClose={() => { setBulkOpen(false); clear(); }} />}
    </>
  );
}
