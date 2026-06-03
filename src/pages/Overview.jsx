import { useNavigate } from 'react-router-dom';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { projectTotals, projectWarnings, prsForProject, materialName } from '../engine/reconcile.js';
import { KpiCard, AlertBanner, StatusPill, ProjectBar } from '../components/ui.jsx';
import { idrShort, idr, fmtDate } from '../engine/format.js';

export default function Overview() {
  const { db, currentProjectId } = useStore();
  const project = useProject();
  const nav = useNavigate();

  const t = projectTotals(db, currentProjectId);
  const warnings = projectWarnings(db, currentProjectId);
  const recent = [...prsForProject(db, currentProjectId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  return (
    <>
      <div className="page-head">
        <h1>{project.name}</h1>
        <p className="sub">Procurement control · balance of plan (BoQ) against actual orders (PR)</p>
      </div>

      <ProjectBar />

      {warnings.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {warnings.map((w) => (
            <AlertBanner
              key={w.materialId}
              tone="risk"
              title={`${w.materialName} over budget`}
              action={<button className="btn sm" onClick={() => nav('/reconciliation')}>Review balance</button>}
            >
              ordered {w.committedQty} {w.unit} against a budget of {w.budgetQty} {w.unit}
              {' '}(+{w.overBy} {w.unit}).
            </AlertBanner>
          ))}
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="Budgeted cost" value={idrShort(t.budgetCost)} sub="from BoQ line items" />
        <KpiCard label="Committed" value={idrShort(t.committedCost)} tone="info" sub="ordered + received" subTone="" />
        <KpiCard label="Materials over budget" value={t.materialsOver} tone={t.materialsOver ? 'risk' : 'ok'}
          sub={t.materialsOver ? 'needs attention' : 'all within budget'} subTone={t.materialsOver ? 'risk' : 'ok'} />
        <KpiCard label="Open PRs" value={t.openPrs} sub={`${t.totalPrs} total this project`} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Recent procurement activity</h2>
          <div className="spacer" />
          <button className="btn sm" onClick={() => nav('/purchase-requests')}>All purchase requests</button>
        </div>
        <div className="card-body flush">
          {recent.length === 0 ? (
            <div className="empty">No purchase requests yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th><th>Status</th>
                  <th className="num">Qty</th><th className="num">Unit cost</th>
                  <th>Order date</th><th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td className="mat-link">{materialName(db, p.materialId)}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="num">{p.quantity} {p.unit}</td>
                    <td className="num">{idr(p.unitCost)}</td>
                    <td>{fmtDate(p.orderDate)}</td>
                    <td>{fmtDate(p.receiptDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
