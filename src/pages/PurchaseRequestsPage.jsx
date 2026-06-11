import { useState, Fragment, useEffect, useRef } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { prsForProject, materialName, isExtraPr, brandName } from '../engine/reconcile.js';
import { ProjectBar, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import Modal from '../components/Modal.jsx';
import { idr, fmtDate, num, today } from '../engine/format.js';
import { nextStatusId, activeStatuses, statusDef } from '../engine/status.js';
import ManageStatusesModal from '../components/ManageStatusesModal.jsx';

export default function PurchaseRequestsPage() {
  const { db, currentProjectId, setPrStatus, updatePr } = useStore();
  const project = useProject();
  const draft = project?.boqStatus !== 'working';
  const prs = [...prsForProject(db, currentProjectId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [modal, setModal] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [receiveFor, setReceiveFor] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [open, setOpen] = useState(null);
  const [manageStatuses, setManageStatuses] = useState(false);

  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || '—';
  const picName = (id) => db.users.find((u) => u.id === id)?.name || '—';

  const filtered = prs.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (supplierFilter && p.supplierPrimaryId !== supplierFilter && p.supplierSecondaryId !== supplierFilter) return false;
    if (q && !materialName(db, p.materialId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function advance(p) {
    const next = nextStatusId(db, p.status);
    if (!next) return;
    if (next === 'received') { setReceiveFor(p); return; }   // needs receipt date
    setPrStatus(p.id, next);
  }

  const statusOptions = activeStatuses(db).map((s) => ({ value: s.id, label: s.label }));

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Purchase Requests</h1>
          <p className="sub">{project.name} · the realized counterpart to the BoQ — what’s actually been ordered</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setManageStatuses(true)}>Manage statuses</button>
          <button className="btn primary" disabled={draft} onClick={() => setModal(null)}>+ New PR</button>
        </div>
      </div>

      <FilterBar shown={filtered.length} total={prs.length} unit="PRs">
        <ProjectBar embedded />
        <FilterSearch value={q} onChange={setQ} placeholder="Search material…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="All statuses" options={statusOptions} />
        <FilterSelect value={supplierFilter} onChange={setSupplierFilter} allLabel="All suppliers" width={200}
          options={db.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      </FilterBar>

      {draft && (
        <div className="banner" style={{ background: '#FFFBEB', border: '1px solid #FDE9C8', color: '#92660C', borderRadius: 10, padding: '11px 14px', marginBottom: 14, fontSize: 13.3 }}>
          <b>{project.name}’s BoQ is still a draft.</b> Finalize it on the Bill of Quantities page to start raising purchase requests.
        </div>
      )}

      <div className="card">
        <div className="card-body flush">
          <table className="table compact">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Material</th><th>Status</th>
                <th className="num">Qty</th><th>Unit</th><th className="num">Unit cost</th><th className="num">Line total</th>
                <th>Supplier 1</th><th>Supplier 2</th><th>PIC</th><th>Order</th><th>Receipt</th><th>Comment</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isOpen = open === p.id;
                const hist = p.statusHistory || [];
                return (
                <Fragment key={p.id}>
                <tr>
                  <td className="num clickable" style={{ cursor: 'pointer', color: 'var(--muted, #94A3B8)' }} onClick={() => setOpen(isOpen ? null : p.id)} title="Status history">{isOpen ? '▾' : '▸'}</td>
                  <td className="mat-link">{materialName(db, p.materialId)}{isExtraPr(db, p) && <span className="pill" style={{ background: '#FEF3C7', color: '#92660C', border: '1px solid #FDE68A', marginLeft: 6, fontSize: 11 }}>Extra</span>}{p.brandId && <div className="muted" style={{ fontSize: 11 }}>{brandName(db, p.brandId)}</div>}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td className="num">{num(p.quantity)}</td>
                  <td>{p.unit}</td>
                  <td className="num">{idr(p.unitCost)}</td>
                  <td className="num">{idr(p.quantity * (p.unitCost || 0))}</td>
                  <td>{supplierName(p.supplierPrimaryId)}</td>
                  <td>{p.supplierSecondaryId ? supplierName(p.supplierSecondaryId) : <span className="muted">—</span>}</td>
                  <td>{picName(p.picId)}</td>
                  <td>{fmtDate(p.orderDate)}</td>
                  <td>{fmtDate(p.receiptDate)}</td>
                  <td>
                    <CommentCell value={p.comment || ''} onSave={(c) => updatePr(p.id, { comment: c })} />
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setModal(p)}>Edit</button>{' '}
                    {nextStatusId(db, p.status) && (
                      <button className="btn sm" onClick={() => advance(p)} title={`→ ${statusDef(db, nextStatusId(db, p.status)).label}`}>Advance</button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr><td colSpan={14} style={{ background: '#F8FAFC' }}>
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div className="lbl" style={{ marginBottom: 6 }}>Status history</div>
                      {hist.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {[...hist].reverse().map((h, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                              <span className="muted" style={{ minWidth: 152, whiteSpace: 'nowrap' }}>
                                {fmtDate(h.at)} · {new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {h.from ? <><StatusPill status={h.from} /><span className="muted">→</span></> : <span className="muted">created as</span>}
                              <StatusPill status={h.to} />
                              <span className="muted">· by {h.by?.name || '—'}</span>
                            </div>
                          ))}
                        </div>
                      ) : <div className="muted" style={{ fontSize: 13 }}>No status changes recorded yet.</div>}
                    </div>
                  </td></tr>
                )}
                </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={14}><div className="empty">{prs.length === 0 ? 'No purchase requests yet. Raise one from a BoQ item.' : 'No PRs match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== undefined && <PrModal pr={modal} onClose={() => setModal(undefined)} />}
      {manageStatuses && <ManageStatusesModal onClose={() => setManageStatuses(false)} />}
      {receiveFor && (
        <ReceiveModal pr={receiveFor} onClose={() => setReceiveFor(null)}
          onConfirm={(date) => { setPrStatus(receiveFor.id, 'received', date); setReceiveFor(null); }} />
      )}
    </>
  );
}

function CommentCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancel = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const start = () => { cancel.current = false; setDraft(value); setEditing(true); };
  const finish = () => {
    setEditing(false);
    if (cancel.current) { cancel.current = false; return; }
    if (draft.trim() !== (value || '')) onSave(draft.trim());
  };

  if (editing) {
    return (
      <textarea autoFocus value={draft} rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => { if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur(); } }}
        placeholder="Add a note… (click away to save)"
        style={{ width: 180, boxSizing: 'border-box', font: 'inherit', fontSize: 12.5, lineHeight: 1.4, padding: '4px 6px', border: '1px solid #CBD5E1', borderRadius: 6, resize: 'vertical' }} />
    );
  }
  return value
    ? <div onClick={start} title="Click to edit" style={{ cursor: 'text', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: 180, fontSize: 12.5, lineHeight: 1.4 }}>{value}</div>
    : <button className="btn sm ghost" onClick={start} style={{ fontSize: 11, padding: '2px 6px', color: 'var(--muted, #94A3B8)' }}>+ note</button>;
}

function ReceiveModal({ pr, onClose, onConfirm }) {
  const { db } = useStore();
  const [date, setDate] = useState(today());
  return (
    <Modal title={`Mark received · ${materialName(db, pr.materialId)}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => date && onConfirm(date)} disabled={!date}>Confirm receipt</button>
      </>}>
      <p className="help" style={{ marginTop: 0 }}>A PR can’t be marked received without a receipt date (BR-4).</p>
      <label className="lbl">Receipt date <span className="req">*</span></label>
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
}
