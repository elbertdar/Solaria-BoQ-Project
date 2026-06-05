import { useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { prsForProject, materialName, isExtraPr } from '../engine/reconcile.js';
import { ProjectBar, StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import Modal from '../components/Modal.jsx';
import { idr, fmtDate, num, today } from '../engine/format.js';
import { PR_FLOW, PR_STATUS } from '../theme.js';

export default function PurchaseRequestsPage() {
  const { db, currentProjectId, setPrStatus } = useStore();
  const project = useProject();
  const draft = project?.boqStatus !== 'working';
  const prs = [...prsForProject(db, currentProjectId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [modal, setModal] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [receiveFor, setReceiveFor] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || '—';
  const picName = (id) => db.users.find((u) => u.id === id)?.name || '—';

  const filtered = prs.filter((p) => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (supplierFilter && p.supplierPrimaryId !== supplierFilter && p.supplierSecondaryId !== supplierFilter) return false;
    if (q && !materialName(db, p.materialId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function advance(p) {
    const i = PR_FLOW.indexOf(p.status);
    if (i < 0 || i >= PR_FLOW.length - 1) return;
    const next = PR_FLOW[i + 1];
    if (next === 'received') { setReceiveFor(p); return; }   // needs receipt date
    setPrStatus(p.id, next);
  }

  const statusOptions = [...PR_FLOW.map((s) => ({ value: s, label: PR_STATUS[s].label })), { value: 'cancelled', label: 'Cancelled' }];

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Purchase Requests</h1>
          <p className="sub">{project.name} · the realized counterpart to the BoQ — what’s actually been ordered</p>
        </div>
        <button className="btn primary" disabled={draft} onClick={() => setModal(null)}>+ New PR</button>
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
          <table className="table">
            <thead>
              <tr>
                <th>Material</th><th>Status</th>
                <th className="num">Qty</th><th>Unit</th><th className="num">Unit cost</th><th className="num">Line total</th>
                <th>Sup 1 / Sup 2</th><th>PIC</th><th>Order</th><th>Receipt</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="mat-link">{materialName(db, p.materialId)}{isExtraPr(db, p) && <span className="pill" style={{ background: '#FEF3C7', color: '#92660C', border: '1px solid #FDE68A', marginLeft: 6, fontSize: 11 }}>Extra</span>}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td className="num">{num(p.quantity)}</td>
                  <td>{p.unit}</td>
                  <td className="num">{idr(p.unitCost)}</td>
                  <td className="num">{idr(p.quantity * (p.unitCost || 0))}</td>
                  <td>
                    {supplierName(p.supplierPrimaryId)}
                    {p.supplierSecondaryId && <span className="muted"> / {supplierName(p.supplierSecondaryId)}</span>}
                  </td>
                  <td>{picName(p.picId)}</td>
                  <td>{fmtDate(p.orderDate)}</td>
                  <td>{fmtDate(p.receiptDate)}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setModal(p)}>Edit</button>{' '}
                    {!['received', 'cancelled'].includes(p.status) && (
                      <button className="btn sm" onClick={() => advance(p)}>Advance</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11}><div className="empty">{prs.length === 0 ? 'No purchase requests yet. Raise one from a BoQ item.' : 'No PRs match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== undefined && <PrModal pr={modal} onClose={() => setModal(undefined)} />}
      {receiveFor && (
        <ReceiveModal pr={receiveFor} onClose={() => setReceiveFor(null)}
          onConfirm={(date) => { setPrStatus(receiveFor.id, 'received', date); setReceiveFor(null); }} />
      )}
    </>
  );
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
