import { useState, Fragment, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { useStore, useProject, useCurrentPhase } from '../store/StoreContext.jsx';
import PhaseTabs from '../components/PhaseTabs.jsx';
import { prsForProject, materialName, isExtraPr, brandName } from '../engine/reconcile.js';
import { ProjectBar, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import Modal from '../components/Modal.jsx';
import { idr, fmtDate, num, today } from '../engine/format.js';
import { nextStatusId, activeStatuses, statusDef, isMajorTransition } from '../engine/status.js';
import ManageStatusesModal from '../components/ManageStatusesModal.jsx';
import PrCommitModal from '../components/PrCommitModal.jsx';

export default function PurchaseRequestsPage() {
  const { db, currentProjectId, currentPhaseId, setPrStatus, updatePr,
    stagePrStatus, unstagePr, discardPrStaged, commitPrStaged } = useStore();
  const project = useProject();
  const phase = useCurrentPhase();
  const phases = (db.phases || []).filter((p) => p.projectId === currentProjectId);
  const draft = phase ? phase.boqStatus !== 'working' : !phases.some((p) => p.boqStatus === 'working');
  const prs = [...prsForProject(db, currentProjectId, currentPhaseId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [modal, setModal] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [receiveFor, setReceiveFor] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);
  const [open, setOpen] = useState(null);
  const [manageStatuses, setManageStatuses] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);

  const pending = (db.prStaged || []).filter((s) => s.projectId === currentProjectId);
  const stagedFor = (id) => pending.find((s) => s.prId === id);

  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || '—';
  const picName = (id) => db.users.find((u) => u.id === id)?.name || '—';

  const filtered = prs.filter((p) => {
    if (statusFilter.length && !statusFilter.includes(p.status)) return false;
    if (supplierFilter.length && !supplierFilter.includes(p.supplierPrimaryId) && !supplierFilter.includes(p.supplierSecondaryId)) return false;
    if (q && !materialName(db, p.materialId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function advance(p) {
    const next = nextStatusId(db, p.status);
    if (!next) return;
    if (!isMajorTransition(db, p.status, next)) { setPrStatus(p.id, next); return; } // routine bump → instant
    if (next === 'received') { setReceiveFor(p); return; }   // collect receipt date, then stage
    stagePrStatus(p.id, next);                                // major → stage for review & commit
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

      <PhaseTabs />

      <FilterBar shown={filtered.length} total={prs.length} unit="PRs">
        <ProjectBar embedded />
        <FilterSearch value={q} onChange={setQ} placeholder="Search material…" />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="All statuses" options={statusOptions} />
        <FilterSelect value={supplierFilter} onChange={setSupplierFilter} allLabel="All suppliers" width={200}
          options={db.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      </FilterBar>

      {draft && (
        <div className="banner draft">
          <b>{project.name}’s BoQ is still a draft.</b> Finalize it on the Bill of Quantities page to start raising purchase requests.
        </div>
      )}

      {pending.length > 0 && (
        <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>{pending.length} pending status change{pending.length > 1 ? 's' : ''}</b>
          <span style={{ opacity: 0.85 }}>— major changes staged, not yet committed.</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {discardArmed ? (
              <>
                <span style={{ color: 'var(--risk)' }}>Discard all?</span>
                <button className="btn sm danger" onClick={() => { discardPrStaged(currentProjectId); setDiscardArmed(false); }}>Confirm discard</button>
                <button className="btn sm ghost" onClick={() => setDiscardArmed(false)}>Keep</button>
              </>
            ) : (
              <>
                <button className="btn sm ghost" onClick={() => setDiscardArmed(true)}>Discard</button>
                <button className="btn sm primary" onClick={() => setCommitting(true)}>Review &amp; commit</button>
              </>
            )}
          </span>
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
                const stg = stagedFor(p.id);
                return (
                <Fragment key={p.id}>
                <tr>
                  <td className="num clickable" style={{ cursor: 'pointer', color: 'var(--muted, #94A3B8)' }} onClick={() => setOpen(isOpen ? null : p.id)} title="Status history">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                  <td className="mat-link">{materialName(db, p.materialId)}{isExtraPr(db, p) && <span className="pill warn" style={{ marginLeft: 6 }}>Extra</span>}{p.brandId && <div className="muted" style={{ fontSize: 11 }}>{brandName(db, p.brandId)}</div>}</td>
                  <td>
                    <StatusPill status={p.status} />
                    {stg && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <ArrowRight size={12} className="muted" /><StatusPill status={stg.to} /><span className="muted" style={{ fontSize: 11 }}>pending</span>
                    </span>}
                  </td>
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
                    {stg ? (
                      <button className="btn sm ghost" onClick={() => unstagePr(p.id)} title="Cancel the pending status change">Undo pending</button>
                    ) : nextStatusId(db, p.status) && (
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
                              {h.from ? <><StatusPill status={h.from} /><ArrowRight size={13} className="muted" /></> : <span className="muted">created as</span>}
                              <StatusPill status={h.to} />
                              <span className="muted">· by {h.by?.name || '—'}</span>
                              {h.note && <span className="muted" style={{ fontStyle: 'italic' }}>· “{h.note}”</span>}
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
          onConfirm={(date) => { stagePrStatus(receiveFor.id, 'received', date); setReceiveFor(null); }} />
      )}
      {committing && pending.length > 0 && (
        <PrCommitModal db={db} staged={pending}
          onCommit={(ids, msg) => { commitPrStaged(ids, msg); setCommitting(false); }}
          onDiscard={(prId) => unstagePr(prId)}
          onClose={() => setCommitting(false)} />
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
        <button className="btn primary" onClick={() => date && onConfirm(date)} disabled={!date}>Stage receipt</button>
      </>}>
      <p className="help" style={{ marginTop: 0 }}>A PR can’t be marked received without a receipt date (BR-4). Marking received is a major change — it’s staged for review &amp; commit.</p>
      <label className="lbl">Receipt date <span className="req">*</span></label>
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
}
