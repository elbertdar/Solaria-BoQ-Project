import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { KpiCard } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import { portfolioWorklist, todayLocal, addDays, toISO } from '../engine/schedule.js';
import { fmtDate, today as todayISO } from '../engine/format.js';

const TONE = { risk: '#E11D48', amber: '#F59E0B', info: '#0EA5E9', ok: '#16A34A', neutral: '#94A3B8' };
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

  const openProject = (projectId, route = '/boq') => { setCurrentProjectId(projectId); nav(route); };

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

      {/* the three action lists */}
      <Bucket
        title="Overdue — order now" tone="risk"
        empty="Nothing overdue to order. 👍"
        rows={wl.overdueToOrder} doneRows={doneFor('overdue')} onUndo={undo}
        renderWhen={(l) => <span style={{ color: TONE.risk, fontWeight: 600 }}>{Math.max(1, Math.round((today - l.orderDate) / 86400000))}d overdue · was due {fmtDate(l.orderDate)}</span>}
        action={(l) => <button className="btn sm" onClick={() => markOrdered(l, 'overdue')}>Mark ordered</button>}
        onOpen={openProject} db={db}
      />

      <Bucket
        title="Order this week" tone="amber"
        empty="Nothing to order this week — you’re clear."
        rows={wl.orderThisWeek} doneRows={doneFor('week')} onUndo={undo}
        renderWhen={(l) => <span>Order by {fmtDate(l.orderDate)} · {l.lead}d lead</span>}
        action={(l) => <button className="btn sm" onClick={() => markOrdered(l, 'week')}>Mark ordered</button>}
        onOpen={openProject} db={db}
      />

      <Bucket
        title="Chase supplier" tone="risk" subtitle="ordered, but delivery is overdue"
        empty="No late deliveries to chase."
        rows={wl.lateDelivery} onUndo={undo}
        renderWhen={(l) => <span style={{ color: TONE.risk, fontWeight: 600 }}>{l.lateDays}d late · expected {fmtDate(l.effectiveArrival)}{supplierName(orderedPrFor(l)?.supplierPrimaryId) ? ` · ${supplierName(orderedPrFor(l).supplierPrimaryId)}` : ''}</span>}
        action={(l) => (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button className="btn sm" onClick={() => setReceiveFor(l)}>Received</button>
            <button className="btn sm ghost" onClick={() => setPushFor(l)}>Push date</button>
            <button className="btn sm ghost" onClick={() => setSnoozeFor(l)}>Snooze</button>
          </span>
        )}
        onOpen={openProject} db={db}
      />

      {/* heads-up */}
      {wl.orderNextWeek.length > 0 && (
        <Bucket
          title="Heads-up: next week" tone="info" subtitle="coming up — no action needed yet"
          rows={wl.orderNextWeek} muted onUndo={undo}
          renderWhen={(l) => <span className="muted">Order by {fmtDate(l.orderDate)}</span>}
          action={() => null} onOpen={openProject} db={db}
        />
      )}

      {/* health metrics, subordinate */}
      <div className="kpi-grid" style={{ marginTop: 22 }}>
        <KpiCard label="Active projects" value={wl.health.activeProjects} />
        <KpiCard label="Materials over budget" value={wl.health.overBudget} tone={wl.health.overBudget ? 'risk' : 'ok'}
          sub={wl.health.overBudget ? 'across all projects' : 'all within budget'} subTone={wl.health.overBudget ? 'risk' : 'ok'} />
        <KpiCard label="Open POs" value={wl.health.openPos} sub="ordered, awaiting delivery" />
        <KpiCard label="Snoozed" value={wl.health.snoozed} sub="late items you’re tracking" />
      </div>

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
                  <span style={{ marginLeft: 8, color: TONE.ok, fontWeight: 600 }}>✓ ordered</span>
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

function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  function save() {
    if (!name.trim()) { setError('Project name is required.'); return; }
    if (!startDate) { setError('Start date is required — the schedule counts days from it.'); return; }
    onCreate({ name: name.trim(), startDate, code: code.trim() });
  }
  return (
    <Modal title="New project" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Create project</button></>}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Project name <span className="req">*</span></label>
          <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Solaria — Mall Taman Anggrek" />
        </div>
        <div>
          <label className="lbl">Start date <span className="req">*</span></label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <div className="help">All needed/order days count from this.</div>
        </div>
        <div>
          <label className="lbl">Code (optional)</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SOL-TA-26" />
        </div>
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
