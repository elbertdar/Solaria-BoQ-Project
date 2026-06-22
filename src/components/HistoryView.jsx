import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { materialName, changeFields } from '../engine/reconcile.js';
import { idr, num, fmtDate } from '../engine/format.js';
import { fmtVal } from './boqShared.jsx';

// boqItem ids touched by an edit, for highlighting the changed rows — adds + modifies only
// (deletes leave no surviving row; phase-start changes aren't a row).
const changedRowIds = (e) => e.changes.filter((c) => c.type === 'add' || c.type === 'modify').map((c) => c.boqItemId);

// One change rendered inline (collapsed single-change row + the multi-change drill-down).
function ChangeLine({ c, db }) {
  if (c.type === 'phaseStart') {
    return (
      <span style={{ fontSize: 13 }}>
        <span className="pill warn" style={{ marginRight: 8, fontSize: 11 }}>phase start</span>
        <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{c.before ? fmtDate(c.before) : 'project start'}</span>{' '}
        <ArrowRight size={12} style={{ verticalAlign: '-2px' }} /> <b>{c.after ? fmtDate(c.after) : 'project start'}</b>
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13 }}>
      <span className="pill" style={{ marginRight: 8, fontSize: 11, ...(c.type === 'add' ? { background: '#ECFDF5', color: '#15803D' } : c.type === 'delete' ? { background: '#FEF2F2', color: '#B91C1C' } : { background: '#FEF3C7', color: '#92660C' }) }}>{c.type}</span>
      <b>{materialName(db, (c.after || c.before)?.materialId)}</b>
      {c.type === 'modify' && (
        <span style={{ marginLeft: 8 }}>
          {changeFields(c).map((f) => (
            <span key={f.key} style={{ marginRight: 10 }}>
              {f.label}: <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtVal(db, f.kind, f.before)}</span> <ArrowRight size={12} style={{ verticalAlign: '-2px' }} /> <b>{fmtVal(db, f.kind, f.after)}</b>
            </span>
          ))}
        </span>
      )}
      {c.type === 'add' && <span className="muted" style={{ marginLeft: 8 }}>{num(c.after.quantity)} {c.after.unit} · {idr(c.after.expectedUnitCost)}</span>}
    </span>
  );
}

// onSelectEdit(ids|null): the changed boqItem ids of the opened entry, so the parent can
// highlight those rows in the BoQ table (null when closed / when the entry only deletes).
export default function HistoryView({ edits, db, onSelectEdit }) {
  const [open, setOpen] = useState(null);
  if (edits.length === 0) {
    return <div className="card"><div className="card-body"><div className="empty">No edits committed yet. Changes you stage and commit will appear here.</div></div></div>;
  }
  const toggle = (e) => {
    const next = open === e.id ? null : e.id;
    setOpen(next);
    if (onSelectEdit) { const ids = next ? changedRowIds(e) : []; onSelectEdit(ids.length ? ids : null); }
  };
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table">
          <thead><tr><th>When</th><th>By</th><th>Summary</th><th className="num">Changes</th><th></th></tr></thead>
          <tbody>
            {edits.map((e) => {
              const isOpen = open === e.id;
              const single = e.changes.length === 1; // one change → lead with the change, comment on expand
              const counts = { add: 0, modify: 0, delete: 0, phaseStart: 0 };
              for (const c of e.changes) if (counts[c.type] != null) counts[c.type]++;
              const summary = [counts.add && `${counts.add} added`, counts.modify && `${counts.modify} modified`, counts.delete && `${counts.delete} removed`, counts.phaseStart && 'phase start changed'].filter(Boolean).join(' · ');
              return (
                <Fragment key={e.id}>
                  <tr className="clickable" onClick={() => toggle(e)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(new Date(e.at))}<div className="muted" style={{ fontSize: 11 }}>{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></td>
                    <td>{e.author?.name || '—'}</td>
                    <td>{single
                      ? <ChangeLine c={e.changes[0]} db={db} />
                      : (e.message ? e.message : <span className="muted">{summary || 'No message'}</span>)}</td>
                    <td className="num">{e.changes.length}</td>
                    <td className="num">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={5} style={{ background: '#F8FAFC' }}>
                      <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {single ? (
                          e.message
                            ? <div style={{ fontSize: 13 }}><span className="muted">Comment:</span> {e.message}</div>
                            : <div className="muted" style={{ fontSize: 12 }}>No comment recorded for this change.</div>
                        ) : (
                          <>
                            {e.message && <div className="muted" style={{ fontSize: 12 }}>{summary}</div>}
                            {e.changes.map((c, i) => <div key={i}><ChangeLine c={c} db={db} /></div>)}
                          </>
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
