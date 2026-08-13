import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { fmtDate } from '../engine/format.js';
import { FilterBar, FilterSearch, FilterSelect, Pill } from '../components/ui.jsx';
import { toast } from '../components/ToastHost.jsx';

const ENTITY = {
  pr: { label: 'Purchase request', color: ['#0369A1', '#EFF6FF'] },
  boqItem: { label: 'BoQ line', color: ['#0F766E', '#E6FAF7'] },
  phase: { label: 'Phase', color: ['#92660C', '#FFFBEB'] },
  material: { label: 'Material', color: ['#6D28D9', '#F5F3FF'] },
  materialType: { label: 'Material type', color: ['#A16207', '#FEFCE8'] },
  project: { label: 'Project', color: ['#BE123C', '#FEF2F4'] },
};

function daysLeft(deletedAt) {
  const ms = new Date(deletedAt).getTime() + 7 * 86400000 - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export default function TrashPage() {
  const { db, restoreTrash, purgeTrash } = useStore();
  const [q, setQ] = useState('');
  const [entityFilter, setEntityFilter] = useState([]);
  const [confirmPurge, setConfirmPurge] = useState(null);

  const entries = [...(db.trash || [])].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  const filtered = entries.filter((e) => {
    if (entityFilter.length && !entityFilter.includes(e.entity)) return false;
    if (q && !e.summary.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <h1>Trash</h1>
        <p className="sub">Deleted items are kept here for 7 days, then permanently removed. Restore anything before it expires — linked rows (a project's BoQ &amp; PRs, a material's brands) come back together.</p>
      </div>

      <FilterBar shown={filtered.length} total={entries.length} unit="items">
        <FilterSearch value={q} onChange={setQ} placeholder="Search deleted items…" />
        <FilterSelect value={entityFilter} onChange={setEntityFilter} allLabel="All types" width={180}
          options={Object.entries(ENTITY).map(([k, v]) => ({ value: k, label: v.label }))} />
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead><tr><th>Item</th><th>Type</th><th>Deleted</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {filtered.map((e) => {
                const meta = ENTITY[e.entity] || { label: e.entity, color: ['#64748B', '#F1F5F9'] };
                const left = daysLeft(e.deletedAt);
                return (
                  <tr key={e.id}>
                    <td>
                      <b>{e.summary}</b>
                      {e.count > 1 && <div className="muted" style={{ fontSize: 12 }}>{e.count} records restored together (incl. linked rows)</div>}
                    </td>
                    <td><Pill fg={meta.color[0]} bg={meta.color[1]}>{meta.label}</Pill></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.deletedAt)}</td>
                    <td style={{ whiteSpace: 'nowrap', color: left <= 1 ? 'var(--risk)' : 'var(--muted, #94A3B8)', fontWeight: left <= 1 ? 600 : 400 }}>{left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {confirmPurge === e.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: 12 }}>Delete forever?</span>
                          <button className="btn sm danger" onClick={() => { purgeTrash(e.id); toast.success(`“${e.summary}” permanently deleted`); setConfirmPurge(null); }}>Yes</button>
                          <button className="btn sm ghost" onClick={() => setConfirmPurge(null)}>No</button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button className="btn sm" onClick={() => { restoreTrash(e.id); toast.success(`“${e.summary}” restored`); }}>Restore</button>
                          <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => setConfirmPurge(e.id)}>Delete forever</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5}><div className="empty">{entries.length === 0 ? 'Trash is empty. Deleted items appear here for 7 days.' : 'No items match.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
