import { useNavigate } from 'react-router-dom';
import { useStore, useProject, useCurrentPhase } from '../store/StoreContext.jsx';
import PhaseTabs from '../components/PhaseTabs.jsx';
import { projectTotals, projectWarnings, prsForProject, materialName } from '../engine/reconcile.js';
import { KpiCard, AlertBanner, StatusPill, ProjectBar } from '../components/ui.jsx';
import { idrShort, idr, fmtDate } from '../engine/format.js';

export default function Overview() {
  const { db, currentProjectId, currentPhaseId } = useStore();
  const project = useProject();
  const phase = useCurrentPhase();
  // 'draft' banner: a specific phase that isn't finalized, or (all phases) none finalized.
  const phases = (db.phases || []).filter((p) => p.projectId === currentProjectId);
  const draft = phase ? phase.boqStatus !== 'working' : !phases.some((p) => p.boqStatus === 'working');
  const nav = useNavigate();

  const t = projectTotals(db, currentProjectId, currentPhaseId);
  const overCommitted = t.committedCost > t.budgetCost; // committed spend has exceeded the BoQ budget
  const warnings = projectWarnings(db, currentProjectId);
  const recent = [...prsForProject(db, currentProjectId, currentPhaseId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  return (
    <>
      <div className="page-head">
        <h1>{project.name}</h1>
        <p className="sub">Procurement control · balance of plan (BoQ) against actual orders (PR)</p>
      </div>

      <ProjectBar />
      <PhaseTabs />

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

      {draft && (
        <div className="banner draft">
          <span><b>Draft BoQ.</b> This project’s plan isn’t finalized — ordering and reconciliation begin once you finalize it.</span>
          <button className="btn sm" onClick={() => nav('/boq')} style={{ marginLeft: 'auto' }}>Open BoQ</button>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="Budgeted cost" value={idrShort(t.budgetCost)} sub="from BoQ line items"
          onClick={() => nav('/boq')} />
        <KpiCard label="Committed" value={idrShort(t.committedCost)} tone={overCommitted ? 'risk' : 'info'}
          sub={overCommitted ? 'over budget · ordered + received' : 'ordered + received'} subTone={overCommitted ? 'risk' : ''}
          onClick={() => nav('/purchase-requests')} />
        <KpiCard label="Extra spend" value={idrShort(t.extraCost)} tone={t.extraCost > 0 ? 'risk' : ''}
          sub="unbudgeted — PRs not in the BoQ" subTone={t.extraCost > 0 ? 'risk' : ''}
          onClick={() => nav('/reconciliation')} />
        <KpiCard label="Materials over budget" value={t.materialsOver} tone={t.materialsOver ? 'risk' : 'ok'}
          sub={t.materialsOver ? 'needs attention' : 'all within budget'} subTone={t.materialsOver ? 'risk' : 'ok'}
          onClick={() => nav('/reconciliation')} />
        <KpiCard label="Open PRs" value={t.openPrs} sub={`${t.totalPrs} total this project`}
          onClick={() => nav('/purchase-requests')} />
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
