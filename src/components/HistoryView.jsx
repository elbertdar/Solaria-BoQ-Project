import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { materialName, changeFields } from '../engine/reconcile.js';
import { idr, num, fmtDate } from '../engine/format.js';
import { fmtVal } from './boqShared.jsx';

export default function HistoryView({ edits, db }) {
  const [open, setOpen] = useState(null);
  if (edits.length === 0) {
    return <div className="card"><div className="card-body"><div className="empty">No edits committed yet. Changes you stage and commit will appear here.</div></div></div>;
  }
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table">
          <thead><tr><th>When</th><th>By</th><th>Summary</th><th className="num">Changes</th><th></th></tr></thead>
          <tbody>
            {edits.map((e) => {
              const isOpen = open === e.id;
              const counts = { add: 0, modify: 0, delete: 0 };
              for (const c of e.changes) counts[c.type]++;
              const summary = [counts.add && `${counts.add} added`, counts.modify && `${counts.modify} modified`, counts.delete && `${counts.delete} removed`].filter(Boolean).join(' · ');
              return (
                <Fragment key={e.id}>
                  <tr className="clickable" onClick={() => setOpen(isOpen ? null : e.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(new Date(e.at))}<div className="muted" style={{ fontSize: 11 }}>{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></td>
                    <td>{e.author?.name || '—'}</td>
                    <td>{e.message ? e.message : <span className="muted">{summary || 'No message'}</span>}</td>
                    <td className="num">{e.changes.length}</td>
                    <td className="num">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={5} style={{ background: '#F8FAFC' }}>
                      <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {e.message && <div className="muted" style={{ fontSize: 12 }}>{summary}</div>}
                        {e.changes.map((c, i) => (
                          <div key={i} style={{ fontSize: 13 }}>
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
                          </div>
                        ))}
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
