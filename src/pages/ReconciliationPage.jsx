import { useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { summarizeProject } from '../engine/reconcile.js';
import { ProjectBar, AlertBanner, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import { idr, num, fmtDate } from '../engine/format.js';

export default function ReconciliationPage() {
  const { db, currentProjectId } = useStore();
  const project = useProject();
  const rows = summarizeProject(db, currentProjectId);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [overFilter, setOverFilter] = useState('');

  const overCount = rows.filter((r) => r.isOverCommitted).length;
  const matType = (mid) => db.materials.find((m) => m.id === mid)?.materialTypeId;
  const filtered = rows.filter((r) => {
    if (typeFilter && matType(r.materialId) !== typeFilter) return false;
    if (overFilter === 'over' && !r.isOverCommitted) return false;
    if (q && !r.materialName.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <h1>Balance · BoQ vs Purchase</h1>
        <p className="sub">{project.name} · live reconciliation, recomputed from source records</p>
      </div>

      <FilterBar shown={filtered.length} total={rows.length} unit="materials">
        <ProjectBar embedded />
        <FilterSearch value={q} onChange={setQ} placeholder="Search material…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} allLabel="All types"
          options={db.materialTypes.map((t) => ({ value: t.id, label: t.name }))} />
        <FilterSelect value={overFilter} onChange={setOverFilter} allLabel="All materials" width={170}
          options={[{ value: 'over', label: 'Over budget only' }]} />
      </FilterBar>

      {overCount > 0 && (
        <AlertBanner tone="risk" title={`${overCount} material${overCount > 1 ? 's' : ''} over budget`}>
          committed quantity exceeds the BoQ plan. Expand the flagged rows to see the contributing orders.
        </AlertBanner>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Budget qty</th>
                <th className="num">Committed</th>
                <th className="num">Received</th>
                <th className="num">Balance</th>
                <th className="num">Budget cost</th>
                <th className="num">Actual cost</th>
                <th className="num">Δ Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = open === r.materialId;
                return (
                  <RowGroup key={r.materialId} r={r} isOpen={isOpen}
                    onToggle={() => setOpen(isOpen ? null : r.materialId)} db={db} />
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9}><div className="empty">{rows.length === 0 ? 'No materials on this project yet.' : 'No materials match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="help">
        Balance = received − budget (positive means over). The over-budget flag fires on
        <em> committed</em> quantity (ordered + received), so over-ordering is caught before delivery.
      </p>
    </>
  );
}

function RowGroup({ r, isOpen, onToggle, db }) {
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td className="mat-link">{r.materialName}</td>
        <td className="num">{num(r.budgetQty)} {r.unit}</td>
        <td className="num">{num(r.committedQty)}</td>
        <td className="num">{num(r.receivedQty)}</td>
        <td className={'num ' + (r.balanceQty > 0 ? 'val-risk' : r.balanceQty < 0 ? '' : '')}>
          {r.balanceQty > 0 ? '+' : ''}{num(r.balanceQty)}
          {r.isOverCommitted && <span className="pill risk" style={{ marginLeft: 8 }}>over</span>}
        </td>
        <td className="num">{idr(r.budgetCost)}</td>
        <td className="num">{idr(r.actualCost)}</td>
        <td className={'num ' + (r.costDelta > 0 ? 'val-risk' : r.costDelta < 0 ? 'val-ok' : '')}>
          {r.costDelta > 0 ? '+' : ''}{idr(r.costDelta)}
        </td>
        <td className="num muted">{isOpen ? '▾' : '▸'}</td>
      </tr>
      {isOpen && (
        <tr className="drill">
          <td colSpan={9}>
            <div className="drill-inner">
              <h4>BoQ entries (plan)</h4>
              <table className="table">
                <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Expected unit cost</th><th>Purchase by</th></tr></thead>
                <tbody>
                  {r.boqItems.map((b) => (
                    <tr key={b.id}>
                      <td>{b.description}</td>
                      <td className="num">{num(b.quantity)} {b.unit}</td>
                      <td className="num">{idr(b.expectedUnitCost)}</td>
                      <td>{fmtDate(b.schedulePurchaseDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>Purchase requests (actual)</h4>
              {r.prs.length === 0 ? (
                <p className="help" style={{ paddingLeft: 0 }}>No PRs raised for this material yet.</p>
              ) : (
                <table className="table">
                  <thead><tr><th>Status</th><th className="num">Qty</th><th className="num">Unit cost</th><th>Supplier</th><th>Receipt</th></tr></thead>
                  <tbody>
                    {r.prs.map((p) => (
                      <tr key={p.id}>
                        <td><StatusPill status={p.status} /></td>
                        <td className="num">{num(p.quantity)} {p.unit}</td>
                        <td className="num">{idr(p.unitCost)}</td>
                        <td>{db.suppliers.find((s) => s.id === p.supplierPrimaryId)?.name || '—'}</td>
                        <td>{fmtDate(p.receiptDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
