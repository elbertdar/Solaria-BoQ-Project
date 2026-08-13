import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { TriangleAlert, ArrowRight, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import { projectTotals, boqForProject, prsForProject, summarizeProject, prExportColumns, balanceExportColumns } from '../engine/reconcile.js';
import { exportColumns } from '../engine/dataImport.js';
import { toCsv, downloadCsv } from '../engine/csv.js';
import { scheduleForProject, todayLocal } from '../engine/schedule.js';
import { idr, fmtDate, num } from '../engine/format.js';
import NewProjectModal from '../components/NewProjectModal.jsx';
import { toast } from '../components/ToastHost.jsx';
import DataToolbar from '../components/DataToolbar.jsx';
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
  const { db, setCurrentProjectId, addProject, updateProject, completeProject, reopenProject, addProjectType, deleteProjectType, softDeleteProject, currentProjectId } = useStore();
  const nav = useNavigate();
  const today = useMemo(() => todayLocal(), []);
  const [tab, setTab] = useState('active');
  const [newProject, setNewProject] = useState(false);
  const [manageTypes, setManageTypes] = useState(false);
  const [delFor, setDelFor] = useState(null);
  const [completeFor, setCompleteFor] = useState(null);
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
    return { p, totals, start, curOff, estFinish, items: lines.length, received, attention, working, completed: !!p.completedAt };
  }), [db, today]);

  const activeRows = rows.filter((r) => !r.completed);
  const completedRows = rows.filter((r) => r.completed);
  const open = (id) => { setCurrentProjectId(id); nav('/overview'); };

  const filteredRows = activeRows.filter(({ p, totals, attention }) => {
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
          <DataToolbar entity="projects" rows={db.projects} />
          <button className="btn primary" onClick={() => setNewProject(true)}>+ New project</button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {TABS.map((t) => {
          const cnt = t.key === 'active' ? activeRows.length : t.key === 'completed' ? completedRows.length : 0;
          return (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}{cnt ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>

      {tab === 'active' && (
        <>
          <FilterBar shown={filteredRows.length} total={activeRows.length} unit="projects">
            <FilterSearch value={q} onChange={setQ} placeholder="Search name, code, location…" />
            <FilterSelect value={projectFilter} onChange={setProjectFilter} allLabel="All projects" width={200}
              options={db.projects.map((p) => ({ value: p.id, label: p.name }))} />
            <FilterSelect value={overFilter} onChange={setOverFilter} allLabel="Any budget" width={160}
              options={[{ value: 'over', label: 'Over budget only' }]} />
            <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="Any status" width={170}
              options={[{ value: 'attention', label: 'Needs attention' }, { value: 'ontrack', label: 'On track' }]} />
          </FilterBar>
          <ActiveTable rows={filteredRows} onOpen={open} onDelete={setDelFor} onComplete={setCompleteFor}
            types={db.projectTypes || []} onUpdate={updateProject} onAddType={addProjectType} />
        </>
      )}

      {tab === 'completed' && (
        completedRows.length === 0 ? (
          <div className="card"><div className="empty" style={{ padding: '52px 24px', lineHeight: 1.6 }}>
            <b>No completed projects yet.</b><br />
            Mark a project complete from its row on the Active tab — it archives here with its BoQ, PRs, and balance kept as a downloadable record.
          </div></div>
        ) : (
          <>
            <OrderingPatterns completedRows={completedRows} />
            <CompletedTable rows={completedRows} db={db} onOpen={open} onReopen={reopenProject} />
          </>
        )
      )}

      {tab === 'upcoming' && (
        <div className="card"><div className="empty" style={{ padding: '52px 24px', lineHeight: 1.6 }}>
          <b>No upcoming projects yet.</b><br />
          This will hold builds that are planned but not started — useful for pipeline visibility and resource planning ahead of kickoff.
        </div></div>
      )}

      {newProject && <NewProjectModal onClose={() => setNewProject(false)}
        onCreate={(vals) => { const id = addProject(vals); setNewProject(false); setCurrentProjectId(id); toast.success(`Project “${vals.name}” created`); nav('/boq'); }} />}

      {manageTypes && <ManageTypes db={db} onClose={() => setManageTypes(false)} onDelete={deleteProjectType} />}

      {delFor && <DeleteProject project={delFor} db={db} onClose={() => setDelFor(null)}
        onConfirm={() => {
          const id = delFor.id;
          if (currentProjectId === id) setCurrentProjectId(db.projects.find((p) => p.id !== id)?.id);
          softDeleteProject(id);
          toast.success(`Project “${delFor.name}” moved to Trash`);
          setDelFor(null);
        }} />}

      {completeFor && <CompleteProject project={completeFor} db={db} onClose={() => setCompleteFor(null)}
        onConfirm={() => { completeProject(completeFor.id); toast.success(`Project “${completeFor.name}” marked completed`); setCompleteFor(null); }} />}
    </>
  );
}

// Trigger a CSV download of one of a project's tables (report — export-only).
function downloadReport(db, project, kind) {
  let rows, cols, name;
  if (kind === 'boq') { rows = boqForProject(db, project.id); cols = exportColumns(db, 'boq'); name = 'boq'; }
  else if (kind === 'prs') { rows = prsForProject(db, project.id); cols = prExportColumns(db); name = 'purchase-requests'; }
  else { rows = summarizeProject(db, project.id); cols = balanceExportColumns(); name = 'balance'; }
  const slug = (project.code || project.name).replace(/[^\w-]+/g, '-');
  downloadCsv(`solaria-${slug}-${name}.csv`, toCsv(rows, cols));
}

// Confirm dialog for completing a project — shows what gets archived. Not gated on delivery;
// finishing under budget (or with lines never ordered) is fine and expected.
function CompleteProject({ project, db, onClose, onConfirm }) {
  const t = projectTotals(db, project.id);
  const boqCount = boqForProject(db, project.id).length;
  const variance = t.budgetCost - t.actualCost;
  return (
    <Modal title={`Complete project · ${project.code || project.name}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={onConfirm}>Mark complete</button>
      </>}>
      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        Archive <b>{project.name}</b> to the Completed tab. Its <b>{boqCount} BoQ line{boqCount === 1 ? '' : 's'}</b>,
        purchase requests, and balance are kept as a downloadable record, and a snapshot of the numbers is frozen for reporting.
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '4px 0 6px' }}>
        <div><div className="lbl" style={{ marginBottom: 2 }}>Budget</div><b>{idr(t.budgetCost)}</b></div>
        <div><div className="lbl" style={{ marginBottom: 2 }}>Actual (committed)</div><b>{idr(t.actualCost)}</b></div>
        <div><div className="lbl" style={{ marginBottom: 2 }}>{variance >= 0 ? 'Under budget' : 'Over budget'}</div>
          <b style={{ color: variance >= 0 ? 'var(--ok)' : 'var(--risk)' }}>{idr(Math.abs(variance))}</b></div>
      </div>
      <p className="help" style={{ marginBottom: 0 }}>Finishing under budget is good — you don’t have to receive everything. You can reopen it later from the Completed tab.</p>
    </Modal>
  );
}

// Cross-project ordering patterns from the completion snapshots — surfaces materials that are
// systematically over-ordered ("we always over-order gypsum"). Foundation for deeper analytics.
function OrderingPatterns({ completedRows }) {
  const agg = new Map();
  for (const { p } of completedRows) {
    for (const m of (p.completion?.materials || [])) {
      if (m.kind !== 'quantity') continue; // skip allowance/extra — no meaningful qty budget
      if (!agg.has(m.name)) agg.set(m.name, { name: m.name, unit: m.unit, projects: 0, overCount: 0, totalOver: 0, budgetQty: 0, committedQty: 0 });
      const e = agg.get(m.name);
      e.projects++; e.budgetQty += m.budgetQty; e.committedQty += m.committedQty; e.totalOver += m.overBy;
      if (m.overBy > 0) e.overCount++;
    }
  }
  const patterns = [...agg.values()].filter((e) => e.projects >= 2 && e.totalOver > 0).sort((a, b) => b.totalOver - a.totalOver);
  if (patterns.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h2>Ordering patterns</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>· across {completedRows.length} completed project{completedRows.length === 1 ? '' : 's'} — materials committed above the plan</span>
      </div>
      <div className="card-body">
        {patterns.slice(0, 6).map((e) => (
          <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', flexWrap: 'wrap' }}>
            <b style={{ minWidth: 150 }}>{e.name}</b>
            <span className="pill warn">over-ordered in {e.overCount}/{e.projects}</span>
            <span className="muted" style={{ fontSize: 13 }}>+{num(e.totalOver)} {e.unit} total · committed {num(e.committedQty)} vs budget {num(e.budgetQty)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Completed-project archive: name, region, budget, actual cost + a drop-down (expand) with
// downloads and the frozen per-material breakdown.
function CompletedTable({ rows, db, onOpen, onReopen }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table compact">
          <thead><tr>
            <th>Project</th><th>Region</th><th className="num">Budget</th><th className="num">Actual cost</th><th className="num">Variance</th><th>Completed</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map(({ p }) => {
              const c = p.completion || {};
              const variance = (c.budgetCost || 0) - (c.actualCost || 0); // + = under budget (good)
              const isOpen = open === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className="clickable" onClick={() => setOpen(isOpen ? null : p.id)}>
                    <td><b>{p.name}</b>{p.code && <div className="muted" style={{ fontSize: 12 }}>{p.code}</div>}</td>
                    <td>{p.location || <span className="muted">—</span>}</td>
                    <td className="num">{idr(c.budgetCost || 0)}</td>
                    <td className="num">{idr(c.actualCost || 0)}</td>
                    <td className="num" style={{ color: variance < 0 ? 'var(--risk)' : 'var(--ok)', fontWeight: 600 }}>
                      {variance >= 0 ? 'under ' : 'over '}{idr(Math.abs(variance))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.completedAt)}</td>
                    <td className="num muted">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                  </tr>
                  {isOpen && (
                    <tr className="drill"><td colSpan={7}>
                      <div className="drill-inner">
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                          <span className="muted" style={{ fontSize: 12.5 }}>Download archive:</span>
                          <button className="btn sm ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => downloadReport(db, p, 'boq')}><Download size={13} /> BoQ</button>
                          <button className="btn sm ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => downloadReport(db, p, 'prs')}><Download size={13} /> Purchase requests</button>
                          <button className="btn sm ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => downloadReport(db, p, 'balance')}><Download size={13} /> Balance</button>
                          <div style={{ flex: 1 }} />
                          <button className="btn sm ghost" onClick={() => onOpen(p.id)}>Open</button>
                          <button className="btn sm ghost" onClick={() => onReopen(p.id)}>Reopen</button>
                        </div>
                        <h4>Material breakdown <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(frozen at completion)</span></h4>
                        {(c.materials || []).length === 0 ? (
                          <p className="help" style={{ paddingLeft: 0 }}>No materials recorded.</p>
                        ) : (
                          <table className="table">
                            <thead><tr><th>Material</th><th className="num">Budget qty</th><th className="num">Committed</th><th className="num">Over / under</th><th className="num">Budget cost</th><th className="num">Actual cost</th></tr></thead>
                            <tbody>
                              {c.materials.map((m) => {
                                const q = m.kind === 'quantity';
                                return (
                                  <tr key={m.materialId + m.kind}>
                                    <td>{m.name}{m.kind === 'extra' && <span className="pill warn" style={{ marginLeft: 6, fontSize: 10 }}>Extra</span>}{m.kind === 'allowance' && <span className="pill info" style={{ marginLeft: 6, fontSize: 10 }}>Allowance</span>}</td>
                                    <td className="num">{q ? num(m.budgetQty) : '—'}</td>
                                    <td className="num">{num(m.committedQty)}</td>
                                    <td className="num" style={{ color: q && m.overBy > 0 ? 'var(--risk)' : q && m.overBy < 0 ? 'var(--ok)' : undefined }}>{q ? (m.overBy > 0 ? '+' : '') + num(m.overBy) : '—'}</td>
                                    <td className="num">{idr(m.budgetCost)}</td>
                                    <td className="num">{idr(m.actualCost)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
        <option value="__new">+ New type…</option>
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

function ActiveTable({ rows, onOpen, onDelete, onComplete, types, onUpdate, onAddType }) {
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
                    <span style={{ whiteSpace: 'nowrap' }}>{start ? fmtDate(start) : '—'}</span> <ArrowRight size={12} className="muted" /> <span style={{ whiteSpace: 'nowrap' }}>{estFinish ? fmtDate(estFinish) : '—'}</span>
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
                    : attention > 0 ? pill(<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TriangleAlert size={12} /> {attention} to act on</span>, 'risk') : pill('On track', 'ok')}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm ghost" onClick={() => onComplete(p)} title="Archive this project as complete">Complete</button>{' '}
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
