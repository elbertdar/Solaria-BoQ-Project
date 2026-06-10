import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { projectTotals } from '../engine/reconcile.js';
import { scheduleForProject, todayLocal } from '../engine/schedule.js';
import { idr, fmtDate } from '../engine/format.js';
import NewProjectModal from '../components/NewProjectModal.jsx';
import Modal from '../components/Modal.jsx';
import { FilterBar, FilterSearch, FilterSelect, Pill } from '../components/ui.jsx';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'upcoming', label: 'Upcoming' },
];

const pill = (txt, kind) => {
  const c = kind === 'risk' ? ['#E11D48', '#FEF2F4'] : kind === 'ok' ? ['#16A34A', '#F0FDF4'] : ['#64748B', '#F1F5F9'];
  return <Pill fg={c[0]} bg={c[1]}>{txt}</Pill>;
};

export default function ProjectCataloguePage() {
  const { db, setCurrentProjectId, addProject, softDeleteProject, currentProjectId } = useStore();
  const nav = useNavigate();
  const today = useMemo(() => todayLocal(), []);
  const [tab, setTab] = useState('active');
  const [newProject, setNewProject] = useState(false);
  const [delFor, setDelFor] = useState(null);
  const [q, setQ] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [overFilter, setOverFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const rows = useMemo(() => db.projects.map((p) => {
    const totals = projectTotals(db, p.id);
    const { lines, start, curOff } = scheduleForProject(db, p.id, today);
    const neededDates = lines.map((l) => l.neededDate).filter(Boolean);
    const estFinish = neededDates.length ? new Date(Math.max(...neededDates.map((d) => d.getTime()))) : null;
    const received = lines.filter((l) => l.state === 'received').length;
    const attention = lines.filter((l) => l.orderOverdue || l.deliveryOverdue).length;
    return { p, totals, start, curOff, estFinish, items: lines.length, received, attention };
  }), [db, today]);

  const open = (id) => { setCurrentProjectId(id); nav('/overview'); };

  const filteredRows = rows.filter(({ p, totals, attention }) => {
    if (projectFilter && p.id !== projectFilter) return false;
    if (overFilter === 'over' && !(totals.materialsOver > 0)) return false;
    if (statusFilter === 'attention' && !(attention > 0)) return false;
    if (statusFilter === 'ontrack' && attention > 0) return false;
    if (q) {
      const hay = (p.name + ' ' + (p.code || '') + ' ' + (p.location || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Project Catalogue</h1>
          <p className="sub">Every build in one place — budget, commitment, timeline, and risk at a glance.</p>
        </div>
        <button className="btn primary" onClick={() => setNewProject(true)}>+ New project</button>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}{t.key === 'active' ? ` (${rows.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <>
          <FilterBar shown={filteredRows.length} total={rows.length} unit="projects">
            <FilterSearch value={q} onChange={setQ} placeholder="Search name, code, location…" />
            <FilterSelect value={projectFilter} onChange={setProjectFilter} allLabel="All projects" width={200}
              options={db.projects.map((p) => ({ value: p.id, label: p.code || p.name }))} />
            <FilterSelect value={overFilter} onChange={setOverFilter} allLabel="Any budget" width={160}
              options={[{ value: 'over', label: 'Over budget only' }]} />
            <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="Any status" width={170}
              options={[{ value: 'attention', label: 'Needs attention' }, { value: 'ontrack', label: 'On track' }]} />
          </FilterBar>
          <ActiveTable rows={filteredRows} onOpen={open} onDelete={setDelFor} />
        </>
      )}

      {tab === 'completed' && (
        <div className="card"><div className="empty" style={{ padding: '52px 24px', lineHeight: 1.6 }}>
          <b>No completed projects yet.</b><br />
          The completion workflow isn’t defined yet. Once we decide how a build gets marked done,
          finished projects will archive here as a searchable record — handy for estimating the next store from a comparable one.
        </div></div>
      )}

      {tab === 'upcoming' && (
        <div className="card"><div className="empty" style={{ padding: '52px 24px', lineHeight: 1.6 }}>
          <b>No upcoming projects yet.</b><br />
          This will hold builds that are planned but not started — useful for pipeline visibility and resource planning ahead of kickoff.
        </div></div>
      )}

      {newProject && <NewProjectModal onClose={() => setNewProject(false)}
        onCreate={(vals) => { const id = addProject(vals); setNewProject(false); setCurrentProjectId(id); nav('/boq'); }} />}

      {delFor && <DeleteProject project={delFor} db={db} onClose={() => setDelFor(null)}
        onConfirm={() => {
          const id = delFor.id;
          if (currentProjectId === id) setCurrentProjectId(db.projects.find((p) => p.id !== id)?.id);
          softDeleteProject(id);
          setDelFor(null);
        }} />}
    </>
  );
}

function DeleteProject({ project, db, onClose, onConfirm }) {
  const boq = db.boqItems.filter((b) => b.projectId === project.id).length;
  const boqIds = new Set(db.boqItems.filter((b) => b.projectId === project.id).map((b) => b.id));
  const prs = db.prs.filter((p) => p.projectId === project.id || (p.boqItemId && boqIds.has(p.boqItemId))).length;
  const hasData = boq > 0 || prs > 0;
  const code = project.code || project.name;
  const [confirmText, setConfirmText] = useState('');
  const ready = !hasData || confirmText.trim() === code;
  return (
    <Modal title={`Delete project · ${code}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={!ready} onClick={onConfirm}>Move to Trash</button>
      </>}>
      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        This moves <b>{project.name}</b> and everything under it to Trash — <b>{boq} BoQ line{boq === 1 ? '' : 's'}</b> and <b>{prs} purchase request{prs === 1 ? '' : 's'}</b>. It can be restored as a whole for 7 days.
      </p>
      {hasData && (
        <>
          <label className="lbl">Type <b>{code}</b> to confirm</label>
          <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={code} autoFocus />
          <p className="help" style={{ marginBottom: 0 }}>This project has data, so we ask you to type its code — guards against an accidental delete.</p>
        </>
      )}
    </Modal>
  );
}

function ActiveTable({ rows, onOpen, onDelete }) {
  if (rows.length === 0) {
    return <div className="card"><div className="empty">No projects match these filters.</div></div>;
  }
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Timeline</th>
              <th className="num">Budgeted cost</th>
              <th className="num">Committed</th>
              <th className="num">Over budget</th>
              <th className="num">Delivered</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, totals, start, curOff, estFinish, items, received, attention }) => {
              const pct = totals.budgetCost > 0 ? Math.round((totals.committedCost / totals.budgetCost) * 100) : 0;
              const overSpend = totals.committedCost > totals.budgetCost;
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{p.code ? p.code + ' · ' : ''}{p.location}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {start ? fmtDate(start) : '—'} <span className="muted">→</span> {estFinish ? fmtDate(estFinish) : '—'}
                    <div className="muted" style={{ fontSize: 12 }}>{curOff != null ? `currently day ${curOff}` : 'no start date'}</div>
                  </td>
                  <td className="num">{idr(totals.budgetCost)}</td>
                  <td className="num">
                    {idr(totals.committedCost)}
                    <div style={{ fontSize: 12, color: overSpend ? 'var(--risk)' : 'var(--muted, #94A3B8)' }}>{pct}% of budget</div>
                  </td>
                  <td className="num">
                    {totals.materialsOver > 0 ? pill(`${totals.materialsOver} material${totals.materialsOver > 1 ? 's' : ''}`, 'risk') : <span className="muted">none</span>}
                  </td>
                  <td className="num">
                    {received}/{items}
                    <div className="muted" style={{ fontSize: 12 }}>received</div>
                  </td>
                  <td>{p.boqStatus !== 'working'
                    ? <span className="pill gray">Draft</span>
                    : attention > 0 ? pill(`⚠ ${attention} to act on`, 'risk') : pill('On track', 'ok')}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => onDelete(p)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
