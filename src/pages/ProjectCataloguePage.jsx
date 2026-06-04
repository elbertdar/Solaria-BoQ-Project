import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { projectTotals } from '../engine/reconcile.js';
import { scheduleForProject, todayLocal } from '../engine/schedule.js';
import { idr, fmtDate } from '../engine/format.js';
import NewProjectModal from '../components/NewProjectModal.jsx';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'upcoming', label: 'Upcoming' },
];

const pill = (txt, kind) => {
  const c = kind === 'risk' ? ['#E11D48', '#FEF2F4'] : kind === 'ok' ? ['#16A34A', '#F0FDF4'] : ['#64748B', '#F1F5F9'];
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: c[0], background: c[1], whiteSpace: 'nowrap' }}>{txt}</span>;
};

export default function ProjectCataloguePage() {
  const { db, setCurrentProjectId, addProject } = useStore();
  const nav = useNavigate();
  const today = todayLocal();
  const [tab, setTab] = useState('active');
  const [newProject, setNewProject] = useState(false);

  const rows = db.projects.map((p) => {
    const totals = projectTotals(db, p.id);
    const { lines, start, curOff } = scheduleForProject(db, p.id, today);
    const neededDates = lines.map((l) => l.neededDate).filter(Boolean);
    const estFinish = neededDates.length ? new Date(Math.max(...neededDates.map((d) => d.getTime()))) : null;
    const received = lines.filter((l) => l.state === 'received').length;
    const attention = lines.filter((l) => l.orderOverdue || l.deliveryOverdue).length;
    return { p, totals, start, curOff, estFinish, items: lines.length, received, attention };
  });

  const open = (id) => { setCurrentProjectId(id); nav('/overview'); };

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

      {tab === 'active' && <ActiveTable rows={rows} onOpen={open} />}

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
    </>
  );
}

function ActiveTable({ rows, onOpen }) {
  if (rows.length === 0) {
    return <div className="card"><div className="empty">No active projects. Create one from This Week.</div></div>;
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
                  <td>{attention > 0 ? pill(`⚠ ${attention} to act on`, 'risk') : pill('On track', 'ok')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
