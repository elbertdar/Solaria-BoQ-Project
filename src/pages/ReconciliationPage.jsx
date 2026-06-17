import { useState, useMemo } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { summarizeProject, brandName, brandBreakdown } from '../engine/reconcile.js';
import { ProjectBar, AlertBanner, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import { idr, num, fmtDate } from '../engine/format.js';
import { isCommitted } from '../engine/status.js';

export default function ReconciliationPage() {
  const { db, currentProjectId } = useStore();
  const project = useProject();
  const rows = useMemo(() => summarizeProject(db, currentProjectId), [db, currentProjectId]);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState([]);
  const [overFilter, setOverFilter] = useState([]);

  const overCount = rows.filter((r) => r.isOverCommitted).length;
  const matType = (mid) => db.materials.find((m) => m.id === mid)?.materialTypeId;
  const filtered = rows.filter((r) => {
    if (typeFilter.length && !typeFilter.includes(matType(r.materialId))) return false;
    if (overFilter.includes('over') && !r.isOverCommitted) return false;
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
          Committed quantity (ordered + received) exceeds the BoQ plan. Over-committed materials sort to the top — expand a row to see the contributing orders.
        </AlertBanner>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Unit</th>
                <th className="num">Budget qty</th>
                <th className="num">Committed</th>
                <th className="num">Received</th>
                <th className="num">Balance</th>
                <th className="num">Budget cost</th>
                <th className="num">Actual cost</th>
                <th className="num">Cost balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = open === r.key;
                return (
                  <RowGroup key={r.key} r={r} isOpen={isOpen}
                    onToggle={() => setOpen(isOpen ? null : r.key)} db={db} />
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10}><div className="empty">{rows.length === 0 ? 'No materials on this project yet.' : 'No materials match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="help">
        Balance is quantity-based: committed − budget (positive means over). <em>Actual cost</em> counts
        committed orders (ordered + received) at their PR unit cost — once an order is placed, its cost is
        treated as actual, so the budget impact (Δ Cost) appears at order time rather than after delivery.
        Balance is budget − committed and Cost balance is budget − actual: <b>positive (green) = still under budget / left to order</b>, <b>negative (red) = over</b>. Both fire the over-budget banner on committed quantity — or, for allowance lines, on committed spend — catching overruns before delivery.
        Rows tagged <b>Allowance</b> are budgeted by a lump sum rather than a quantity: they reconcile on cost (Actual vs Budget cost), with the quantity columns shown as “—”.
        Rows tagged <b>Extra</b> are purchases with no BoQ line (a standalone PR, or one kept from a deleted line) — nothing was budgeted for them, so they're always negative (0 − committed, 0 − actual): pure overspend.
      </p>
    </>
  );
}

function RowGroup({ r, isOpen, onToggle, db }) {
  const dash = <span className="muted">—</span>;
  const pill = r.extra
    ? <span className="pill" style={{ background: '#FEF3C7', color: '#92660C', border: '1px solid #FDE68A', marginLeft: 6, fontSize: 11 }}>Extra</span>
    : r.allowance
      ? <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>
      : null;
  // "Balance remaining" convention everywhere: budget − committed. + = under/left, − = over.
  // (Extras have budget 0, so they read as −committed / −actual: pure overspend.)
  const remQty = -r.committedBalanceQty;
  const remCost = -r.costDelta;
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td className="mat-link">{r.materialName}{pill}</td>
        <td>{r.unit}</td>
        <td className="num">{r.allowance ? dash : r.extra ? num(0) : num(r.budgetQty)}</td>
        <td className="num">{r.allowance ? dash : num(r.committedQty)}</td>
        <td className="num">{r.allowance ? dash : num(r.receivedQty)}</td>
        <td className={'num ' + (r.extra ? '' : (remQty < 0 ? 'val-risk' : remQty > 0 ? 'val-ok' : ''))} style={r.extra ? { color: '#92660C' } : undefined}>
          {r.allowance ? dash : (remQty > 0 ? '+' : '') + num(remQty)}
        </td>
        <td className="num">{r.extra ? idr(0) : idr(r.budgetCost)}</td>
        <td className="num">{idr(r.actualCost)}</td>
        <td className={'num ' + (r.extra ? '' : (remCost < 0 ? 'val-risk' : remCost > 0 ? 'val-ok' : ''))} style={r.extra ? { color: '#92660C' } : undefined}>
          {(remCost > 0 ? '+' : '') + idr(remCost)}
        </td>
        <td className="num muted">{isOpen ? '▾' : '▸'}</td>
      </tr>
      {isOpen && (
        <tr className="drill">
          <td colSpan={10}>
            <div className="drill-inner">
              {r.allowance ? (
                <>
                  <h4>Allowance (lump-sum budget)</h4>
                  <p className="help" style={{ paddingLeft: 0 }}>Budgeted {idr(r.budgetCost)} — tracked by spend, not quantity{r.boqItems.some((b) => b.description) ? '. ' + r.boqItems.map((b) => b.description).filter(Boolean).join('; ') : ''}.</p>
                </>
              ) : r.boqItems.length > 0 ? (
                <>
                  <h4>BoQ entries (plan)</h4>
                  <table className="table">
                    <thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Expected unit cost</th><th>Purchase by</th></tr></thead>
                    <tbody>
                      {r.boqItems.map((b) => (
                        <tr key={b.id}>
                          <td>{b.description}</td>
                          <td className="num">{num(b.quantity)}</td>
                          <td>{b.unit}</td>
                          <td className="num">{idr(b.expectedUnitCost)}</td>
                          <td>{fmtDate(b.schedulePurchaseDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="help" style={{ paddingLeft: 0 }}>Not in the BoQ plan — these are extra purchases, outside the budgeted scope.</p>
              )}

              <h4>Purchase requests (actual)</h4>
              {(() => {
                const bd = brandBreakdown(db, r.prs.filter((p) => isCommitted(db, p.status)));
                const show = bd.length > 1 || (bd.length === 1 && bd[0].brandId);
                if (!show) return null;
                return (
                  <p className="help" style={{ paddingLeft: 0, marginTop: 0 }}>
                    <b>By brand (committed):</b> {bd.map((e) => `${e.name} — ${num(e.qty)}${r.unit ? ' ' + r.unit : ''} (${idr(e.cost)})`).join(',  ')}
                  </p>
                );
              })()}
              {r.prs.length === 0 ? (
                <p className="help" style={{ paddingLeft: 0 }}>No PRs raised for this material yet.</p>
              ) : (
                <table className="table">
                  <thead><tr><th>Status</th><th className="num">Qty</th><th>Unit</th><th>Brand</th><th className="num">Unit cost</th><th>Supplier</th><th>Receipt</th></tr></thead>
                  <tbody>
                    {r.prs.map((p) => (
                      <tr key={p.id}>
                        <td><StatusPill status={p.status} /></td>
                        <td className="num">{num(p.quantity)}</td>
                        <td>{p.unit}</td>
                        <td>{p.brandId ? brandName(db, p.brandId) : <span className="muted">—</span>}</td>
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
