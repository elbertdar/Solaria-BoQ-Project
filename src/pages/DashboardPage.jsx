import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { KpiCard } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import NewProjectModal from '../components/NewProjectModal.jsx';
import { portfolioWorklist, todayLocal, addDays, toISO, computeLine, portfolioGantt } from '../engine/schedule.js';
import { fmtDate, today as todayISO } from '../engine/format.js';
import PortfolioGantt from '../components/PortfolioGantt.jsx';

const TONE = { overdue: '#E11D48', late: '#8B5CF6', orderNow: '#EAB308', awaiting: '#0EA5E9', done: '#16A34A', neutral: '#94A3B8' };
const BORDER = '#E5E7EB';

export default function DashboardPage() {
  const { db, setCurrentProjectId, addPr, deletePr, setPrStatus, updateBoqItem, addProject } = useStore();
  const nav = useNavigate();
  const today = todayLocal();
  const wl = portfolioWorklist(db, today);

  const [done, setDone] = useState([]);        // session-only check-off for "Mark ordered"
  const [receiveFor, setReceiveFor] = useState(null);
  const [pushFor, setPushFor] = useState(null);
  const [snoozeFor, setSnoozeFor] = useState(null);
  const [newProject, setNewProject] = useState(false);
  const [view, setView] = useState('worklist');
  const gantt = portfolioGantt(db, today);

  const openProject = (projectId, route = '/boq') => { setCurrentProjectId(projectId); nav(route); };

  // KPI link targets: jump to a project that actually has the thing.
  const overBudgetLine = db.boqItems.map((b) => computeLine(db, b, today)).find((l) => l.overBudget);
  const openPo = db.prs.find((p) => p.status === 'ordered');
  const openPoProjectId = openPo ? db.boqItems.find((b) => b.id === openPo.boqItemId)?.projectId : null;

  function markOrdered(line, bucket) {
    const prId = addPr({ boqItemId: line.boqItem.id, quantity: line.budget, status: 'ordered', orderDate: todayISO() });
    setDone((d) => [...d, { id: line.boqItem.id, prId, bucket, project: line.project, materialName: line.materialName }]);
  }
  function undo(entry) { deletePr(entry.prId); setDone((d) => d.filter((x) => x !== entry)); }

  const orderedPrFor = (line) => db.prs.find((p) => p.boqItemId === line.boqItem.id && p.status === 'ordered');
  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name;
  const doneFor = (bucket) => done.filter((d) => d.bucket === bucket);

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>This week</h1>
          <p className="sub">Across all projects · what to order, what’s overdue, and what to chase — {fmtDate(today)}</p>
        </div>
        <button className="btn primary" onClick={() => setNewProject(true)}>+ New project</button>
      </div>

      {/* health snapshot, up top */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="Active projects" value={wl.health.activeProjects} />
        <KpiCard label="Materials over budget" value={wl.health.overBudget}
          tone={wl.health.overBudget ? 'risk' : 'ok'}
          sub={wl.health.overBudget ? 'view in Balance' : 'all within budget'}
          subTone={wl.health.overBudget ? 'risk' : 'ok'}
          onClick={overBudgetLine ? () => { setCurrentProjectId(overBudgetLine.projectId); nav('/reconciliation'); } : undefined} />
        <KpiCard label="Open POs" value={wl.health.openPos}
          sub={wl.health.openPos ? 'view in Purchase Requests' : 'ordered, awaiting delivery'}
          onClick={openPoProjectId ? () => { setCurrentProjectId(openPoProjectId); nav('/purchase-requests'); } : undefined} />
        <KpiCard label="Snoozed" value={wl.health.snoozed} sub="late items you’re tracking" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <div className="seg">
          <button className={view === 'worklist' ? 'active' : ''} onClick={() => setView('worklist')}>Worklist</button>
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
        </div>
      </div>

      {view === 'timeline' && (
        <div className="card">
          <div className="card-head">
            <h2>Project timeline</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>· procurement window per project, grouped by region — first order → last delivery</span>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="pill gray">{gantt.count || 0}</span>
          </div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <PortfolioGantt gantt={gantt} onOpen={(id) => openProject(id, '/overview')} />
          </div>
        </div>
      )}

      {view === 'worklist' && (<>
      {/* action lists */}
      <Bucket
        title="Order this week" tone="orderNow"
        empty="Nothing to order this week — you’re clear."
        rows={wl.orderThisWeek} doneRows={doneFor('week')} onUndo={undo}
        renderWhen={(l) => <span>Order by {fmtDate(l.orderDate)} · {l.lead}d lead</span>}
        action={(l) => <button className="btn sm" onClick={() => markOrdered(l, 'week')}>Mark ordered</button>}
        onOpen={openProject} db={db}
      />

      <Bucket
        title="Overdue — order now" tone="overdue"
        empty="Nothing overdue to order. 👍"
        rows={wl.overdueToOrder} doneRows={doneFor('overdue')} onUndo={undo}
        renderWhen={(l) => <span style={{ color: TONE.overdue, fontWeight: 600 }}>{Math.max(1, Math.round((today - l.orderDate) / 86400000))}d overdue · was due {fmtDate(l.orderDate)}</span>}
        action={(l) => <button className="btn sm" onClick={() => markOrdered(l, 'overdue')}>Mark ordered</button>}
        onOpen={openProject} db={db}
      />

      <Bucket
        title="Late delivery — chase supplier" tone="late" subtitle="ordered, but delivery is overdue"
        empty="No late deliveries to chase."
        rows={wl.lateDelivery} onUndo={undo}
        renderWhen={(l) => <span style={{ color: TONE.late, fontWeight: 600 }}>{l.lateDays}d late · expected {fmtDate(l.effectiveArrival)}{supplierName(orderedPrFor(l)?.supplierPrimaryId) ? ` · ${supplierName(orderedPrFor(l).supplierPrimaryId)}` : ''}</span>}
        action={(l) => (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button className="btn sm" onClick={() => setReceiveFor(l)}>Received</button>
            <button className="btn sm ghost" onClick={() => setPushFor(l)}>Push date</button>
            <button className="btn sm ghost" onClick={() => setSnoozeFor(l)}>Snooze</button>
          </span>
        )}
        onOpen={openProject} db={db}
      />

      {wl.lateArrival.length > 0 && (
        <Bucket
          title="Late order — ordered late" tone="late" subtitle="will arrive after the planned date — re-plan or expedite"
          rows={wl.lateArrival} onUndo={undo}
          renderWhen={(l) => <span style={{ color: TONE.late, fontWeight: 600 }}>+{l.slipDays}d vs plan · expected {fmtDate(l.effectiveArrival)}{supplierName(orderedPrFor(l)?.supplierPrimaryId) ? ` · ${supplierName(orderedPrFor(l).supplierPrimaryId)}` : ''}</span>}
          action={(l) => (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button className="btn sm" onClick={() => setReceiveFor(l)}>Received</button>
              <button className="btn sm ghost" onClick={() => setPushFor(l)}>Push date</button>
            </span>
          )}
          onOpen={openProject} db={db}
        />
      )}

      {/* heads-up */}
      {wl.orderNextWeek.length > 0 && (
        <Bucket
          title="Heads-up: next week" tone="neutral" subtitle="coming up — no action needed yet"
          rows={wl.orderNextWeek} muted onUndo={undo}
          renderWhen={(l) => <span className="muted">Order by {fmtDate(l.orderDate)}</span>}
          action={() => null} onOpen={openProject} db={db}
        />
      )}
      </>)}

      {receiveFor && (
        <ReceiveModal title={`Mark received · ${receiveFor.materialName}`} onClose={() => setReceiveFor(null)}
          onConfirm={(date) => { const pr = orderedPrFor(receiveFor); if (pr) setPrStatus(pr.id, 'received', date); setReceiveFor(null); }} />
      )}
      {pushFor && (
        <PushDateModal line={pushFor} onClose={() => setPushFor(null)}
          onConfirm={(date) => { updateBoqItem(pushFor.boqItem.id, { promisedDate: date }, 'pushed expected delivery date'); setPushFor(null); }} />
      )}
      {snoozeFor && (
        <SnoozeModal line={snoozeFor} today={today} onClose={() => setSnoozeFor(null)}
          onConfirm={(days) => { updateBoqItem(snoozeFor.boqItem.id, { snoozedUntil: toISO(addDays(today, days)) }, `snoozed ${days}d`); setSnoozeFor(null); }} />
      )}
      {newProject && <NewProjectModal onClose={() => setNewProject(false)}
        onCreate={(vals) => { const id = addProject(vals); setNewProject(false); setCurrentProjectId(id); nav('/boq'); }} />}
    </>
  );
}

function Bucket({ title, subtitle, tone = 'neutral', rows, doneRows = [], empty, renderWhen, action, onOpen, onUndo, muted, db }) {
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || '';
  const hasContent = rows.length > 0 || doneRows.length > 0;
  return (
    <div className="card">
      <div className="card-head">
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE[tone], marginRight: 4 }} />
        <h2>{title}</h2>
        {subtitle && <span className="muted" style={{ fontSize: 12.5 }}>· {subtitle}</span>}
        <div className="spacer" style={{ flex: 1 }} />
        <span className="pill gray">{rows.length}</span>
      </div>
      <div className="card-body flush">
        {!hasContent ? (
          <div className="empty">{empty}</div>
        ) : (
          <>
            {rows.map((l) => (
              <div key={l.boqItem.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid ' + BORDER, opacity: muted ? 0.85 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {l.materialName} <span className="muted" style={{ fontWeight: 400 }}>· {l.budget} {l.unit}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#64748B' }}>
                    <a onClick={(e) => { e.preventDefault(); onOpen(l.projectId); }} style={{ cursor: 'pointer' }}>{l.project?.code || l.project?.name}</a>
                    {mandorName(l.mandorId) ? ` · ${mandorName(l.mandorId)}` : ''} · {renderWhen(l)}
                  </div>
                </div>
                {action(l)}
              </div>
            ))}
            {doneRows.map((entry) => (
              <div key={'done-' + entry.prId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid ' + BORDER, background: '#FCFCFD' }}>
                <div style={{ flex: 1, minWidth: 0, color: '#94A3B8' }}>
                  <span style={{ textDecoration: 'line-through' }}>{entry.materialName}</span>
                  <span style={{ marginLeft: 8, color: TONE.done, fontWeight: 600 }}>✓ ordered</span>
                </div>
                <button className="btn sm ghost" onClick={() => onUndo(entry)}>Undo</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PushDateModal({ line, onClose, onConfirm }) {
  const [date, setDate] = useState(line.effectiveArrival ? toISO(line.effectiveArrival) : todayISO());
  return (
    <Modal title={`New expected date · ${line.materialName}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!date} onClick={() => date && onConfirm(date)}>Update</button></>}>
      <p className="help" style={{ marginTop: 0 }}>After chasing the supplier, set the new promised delivery date. It drops off the chase list until that date passes.</p>
      <label className="lbl">Promised delivery date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
}

function SnoozeModal({ line, onClose, onConfirm }) {
  return (
    <Modal title={`Snooze · ${line.materialName}`} onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Cancel</button>}>
      <p className="help" style={{ marginTop: 0 }}>Hide from the chase list for a few days while you follow up. It’ll come back if it still hasn’t arrived.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {[2, 5, 7].map((d) => <button key={d} className="btn" onClick={() => onConfirm(d)}>{d} days</button>)}
      </div>
    </Modal>
  );
}

