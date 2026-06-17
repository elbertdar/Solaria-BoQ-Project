import { useState, useMemo, useEffect, useRef } from 'react';
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
  const { db, setCurrentProjectId, addProject, updateProject, addProjectType, deleteProjectType, softDeleteProject, currentProjectId } = useStore();
  const nav = useNavigate();
  const today = useMemo(() => todayLocal(), []);
  const [tab, setTab] = useState('active');
  const [newProject, setNewProject] = useState(false);
  const [manageTypes, setManageTypes] = useState(false);
  const [delFor, setDelFor] = useState(null);
  const [q, setQ] = useState('');
  const [projectFilter, setProjectFilter] = useState([]);
  const [overFilter, setOverFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);

  const rows = useMemo(() => db.projects.map((p) => {
    const totals = projectTotals(db, p.id);
    const { lines, start, curOff } = scheduleForProject(db, p.id, today);
    const neededDates = lines.map((l) => l.neededDate).filter(Boolean);
    const estFinish = neededDates.length ? new Date(Math.max(...neededDates.map((d) => d.getTime()))) : null;
    const received = lines.filter((l) => l.state === 'received').length;
    const attention = lines.filter((l) => l.orderOverdue || l.deliveryOverdue).length;
    const working = (db.phases || []).some((ph) => ph.projectId === p.id && ph.boqStatus === 'working');
    return { p, totals, start, curOff, estFinish, items: lines.length, received, attention, working };
  }), [db, today]);

  const open = (id) => { setCurrentProjectId(id); nav('/overview'); };

  const filteredRows = rows.filter(({ p, totals, attention }) => {
    if (projectFilter.length && !projectFilter.includes(p.id)) return false;
    if (overFilter.includes('over') && !(totals.materialsOver > 0)) return false;
    if (statusFilter.length && !statusFilter.some((v) => (v === 'attention' ? attention > 0 : attention === 0))) return false;
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setManageTypes(true)}>Manage types</button>
          <button className="btn primary" onClick={() => setNewProject(true)}>+ New project</button>
        </div>
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
              options={db.projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={overFilter} onChange={setOverFilter} allLabel="Any budget" width={160}
              options={[{ value: 'over', label: 'Over budget only' }]} />
            <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="Any status" width={170}
              options={[{ value: 'attention', label: 'Needs attention' }, { value: 'ontrack', label: 'On track' }]} />
          </FilterBar>
          <ActiveTable rows={filteredRows} onOpen={open} onDelete={setDelFor}
            types={db.projectTypes || []} onUpdate={updateProject} onAddType={addProjectType} />
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

      {manageTypes && <ManageTypes db={db} onClose={() => setManageTypes(false)} onDelete={deleteProjectType} />}

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

function RegionCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const cancel = useRef(false);
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  const start = () => { cancel.current = false; setDraft(value || ''); setEditing(true); };
  const finish = () => { setEditing(false); if (cancel.current) { cancel.current = false; return; } if (draft.trim() !== (value || '')) onSave(draft.trim()); };
  if (editing) {
    return <input autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)} onBlur={finish}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); } }}
      placeholder="Region…" style={{ width: 130, boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: '4px 6px', border: '1px solid #CBD5E1', borderRadius: 6 }} />;
  }
  return value
    ? <span onClick={start} title="Click to edit" style={{ cursor: 'text' }}>{value}</span>
    : <button className="btn sm ghost" onClick={start} style={{ fontSize: 11, padding: '2px 6px', color: 'var(--muted, #94A3B8)' }}>+ region</button>;
}

function TypeCell({ value, types, onSave, onAddType }) {
  const [mode, setMode] = useState('view'); // view | select | new
  const [newName, setNewName] = useState('');
  const goingNew = useRef(false);
  const cancel = useRef(false);
  const name = (types.find((t) => t.id === value) || {}).name || '';
  if (mode === 'select') {
    return (
      <select autoFocus className="input" style={{ minWidth: 130, fontSize: 13 }} value={value || ''}
        onChange={(e) => { const v = e.target.value; if (v === '__new') { goingNew.current = true; setNewName(''); setMode('new'); } else { onSave(v || null); setMode('view'); } }}
        onBlur={() => { if (goingNew.current) { goingNew.current = false; return; } setMode('view'); }}>
        <option value="">— None —</option>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="__new">➕ New type…</option>
      </select>
    );
  }
  if (mode === 'new') {
    const commit = () => { setMode('view'); if (cancel.current) { cancel.current = false; return; } const n = newName.trim(); if (n) { const id = onAddType(n); onSave(id); } };
    return <input autoFocus value={newName}
      onChange={(e) => setNewName(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); } }}
      placeholder="New type name…" style={{ width: 140, boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: '4px 6px', border: '1px solid #CBD5E1', borderRadius: 6 }} />;
  }
  return name
    ? <span onClick={() => setMode('select')} title="Click to change" style={{ cursor: 'pointer' }}>{name}</span>
    : <button className="btn sm ghost" onClick={() => setMode('select')} style={{ fontSize: 11, padding: '2px 6px', color: 'var(--muted, #94A3B8)' }}>+ type</button>;
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

function ManageTypes({ db, onClose, onDelete }) {
  const types = db.projectTypes || [];
  const usage = (id) => db.projects.filter((p) => p.projectTypeId === id).length;
  return (
    <Modal title="Project types" onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Done</button>}>
      {types.length === 0 ? (
        <div className="empty">No project types yet. Add one from a project's Type cell or the New project dialog.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {types.map((t) => {
            const n = usage(t.id);
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div>
                  <b>{t.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{n === 0 ? 'Not used by any project' : `Used by ${n} project${n === 1 ? '' : 's'}`}</div>
                </div>
                <button className="btn sm ghost" style={{ color: 'var(--risk)' }}
                  onClick={() => onDelete(t.id)}
                  title={n > 0 ? `Removes the type from ${n} project${n === 1 ? '' : 's'}` : 'Delete this type'}>
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="help" style={{ marginBottom: 0, marginTop: 12 }}>Deleting a type never deletes a project — any project using it simply loses its type label.</p>
    </Modal>
  );
}

function ActiveTable({ rows, onOpen, onDelete, types, onUpdate, onAddType }) {
  if (rows.length === 0) {
    return <div className="card"><div className="empty">No projects match these filters.</div></div>;
  }
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table compact">
          <thead>
            <tr>
              <th>Project</th>
              <th>Type</th>
              <th>Region</th>
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
            {rows.map(({ p, totals, start, curOff, estFinish, items, received, attention, working }) => {
              const pct = totals.budgetCost > 0 ? Math.round((totals.committedCost / totals.budgetCost) * 100) : 0;
              const overSpend = totals.committedCost > totals.budgetCost;
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
                  <td>
                    <b>{p.name}</b>
                    {p.code && <div className="muted" style={{ fontSize: 12 }}>{p.code}</div>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <TypeCell value={p.projectTypeId} types={types} onSave={(v) => onUpdate(p.id, { projectTypeId: v })} onAddType={(n) => onAddType({ name: n })} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RegionCell value={p.location} onSave={(v) => onUpdate(p.id, { location: v })} />
                  </td>
                  <td>
                    <span style={{ whiteSpace: 'nowrap' }}>{start ? fmtDate(start) : '—'}</span> <span className="muted">→</span> <span style={{ whiteSpace: 'nowrap' }}>{estFinish ? fmtDate(estFinish) : '—'}</span>
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
                  <td>{!working
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
