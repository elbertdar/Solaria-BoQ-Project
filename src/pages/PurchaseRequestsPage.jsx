import { useState, Fragment, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { useStore, useProject, useCurrentPhase } from '../store/StoreContext.jsx';
import PhaseTabs from '../components/PhaseTabs.jsx';
import { prsForProject, materialName, isExtraPr, brandName, supplierName, picName } from '../engine/reconcile.js';
import { ProjectBar, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import { StatusHistory, StagedChangesBanner } from '../components/prShared.jsx';
import PrModal from '../components/PrModal.jsx';
import BulkPrPicker from '../components/BulkPrPicker.jsx';
import BulkPrModal from '../components/BulkPrModal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import { idr, fmtDate, num } from '../engine/format.js';
import { nextStatusId, activeStatuses, statusDef, advancePr, groupPrs } from '../engine/status.js';
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
  const [bulkPick, setBulkPick] = useState(false);   // step 1: pick BoQ lines
  const [bulkIds, setBulkIds] = useState(null);      // step 2: set store + qty for these ids
  const [receiveFor, setReceiveFor] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);
  const [open, setOpen] = useState(null);
  const [groupBy, setGroupBy] = useState('none'); // none | status | supplier
  const [manageStatuses, setManageStatuses] = useState(false);
  const [committing, setCommitting] = useState(false);

  const pending = (db.prStaged || []).filter((s) => s.projectId === currentProjectId);
  const stagedFor = (id) => pending.find((s) => s.prId === id);

  const filtered = prs.filter((p) => {
    if (statusFilter.length && !statusFilter.includes(p.status)) return false;
    if (supplierFilter.length && !supplierFilter.includes(p.supplierPrimaryId) && !supplierFilter.includes(p.supplierSecondaryId)) return false;
    if (q && !materialName(db, p.materialId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const advance = (p) => advancePr(db, p, { setPrStatus, stagePrStatus, onReceive: setReceiveFor });

  const statusOptions = activeStatuses(db).map((s) => ({ value: s.id, label: s.label }));

  const renderRow = (p) => {
    const isOpen = open === p.id;
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
          <td>{supplierName(db, p.supplierPrimaryId)}</td>
          <td>{p.supplierSecondaryId ? supplierName(db, p.supplierSecondaryId) : <span className="muted">—</span>}</td>
          <td>{picName(db, p.picId)}</td>
          <td>{fmtDate(p.orderDate)}</td>
          <td>{fmtDate(p.receiptDate)}</td>
          <td><CommentCell value={p.comment || ''} onSave={(c) => updatePr(p.id, { comment: c })} /></td>
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
              <StatusHistory pr={p} />
            </div>
          </td></tr>
        )}
      </Fragment>
    );
  };

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Purchase Requests</h1>
          <p className="sub">{project.name} · the realized counterpart to the BoQ — what’s actually been ordered</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setManageStatuses(true)}>Manage statuses</button>
          <button className="btn ghost" disabled={draft} onClick={() => setBulkPick(true)} title="Order several items from one store at once">Bulk order</button>
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
        <label className="field-inline" style={{ fontSize: 13 }}>Group
          <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ width: 'auto', padding: '7px 8px' }}>
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="supplier">Supplier (store)</option>
          </select>
        </label>
      </FilterBar>

      {draft && (
        <div className="banner draft">
          <b>{project.name}’s BoQ is still a draft.</b> Finalize it on the Bill of Quantities page to start raising purchase requests.
        </div>
      )}

      <StagedChangesBanner count={pending.length} detail="major changes staged, not yet committed."
        onDiscard={() => discardPrStaged(currentProjectId)} onCommit={() => setCommitting(true)} />

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
              {groupBy === 'none'
                ? filtered.map(renderRow)
                : groupPrs(db, filtered, groupBy).map((g) => (
                    <Fragment key={'grp-' + g.key}>
                      <tr className="group-row"><td colSpan={14}>{g.label} <span className="muted" style={{ fontWeight: 400 }}>· {g.count}</span></td></tr>
                      {g.rows.map(renderRow)}
                    </Fragment>
                  ))}
              {filtered.length === 0 && (
                <tr><td colSpan={14}><div className="empty">{prs.length === 0 ? 'No purchase requests yet. Raise one from a BoQ item.' : 'No PRs match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== undefined && <PrModal pr={modal} onClose={() => setModal(undefined)} />}
      {bulkPick && <BulkPrPicker projectId={currentProjectId} onClose={() => setBulkPick(false)}
        onNext={(ids) => { setBulkPick(false); setBulkIds(ids); }} />}
      {bulkIds && <BulkPrModal boqItemIds={bulkIds} projectId={currentProjectId} onClose={() => setBulkIds(null)} />}
      {manageStatuses && <ManageStatusesModal onClose={() => setManageStatuses(false)} />}
      {receiveFor && (
        <ReceiveModal title={`Mark received · ${materialName(db, receiveFor.materialId)}`} onClose={() => setReceiveFor(null)}
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
