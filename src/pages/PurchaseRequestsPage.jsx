import { useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { prsForProject, materialName } from '../engine/reconcile.js';
import { ProjectBar, StatusPill } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import Modal from '../components/Modal.jsx';
import { idr, fmtDate, num, today } from '../engine/format.js';
import { PR_FLOW } from '../theme.js';

export default function PurchaseRequestsPage() {
  const { db, currentProjectId, setPrStatus } = useStore();
  const project = useProject();
  const prs = [...prsForProject(db, currentProjectId)]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const [modal, setModal] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [receiveFor, setReceiveFor] = useState(null);

  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || '—';
  const picName = (id) => db.users.find((u) => u.id === id)?.name || '—';

  function advance(p) {
    const i = PR_FLOW.indexOf(p.status);
    if (i < 0 || i >= PR_FLOW.length - 1) return;
    const next = PR_FLOW[i + 1];
    if (next === 'received') { setReceiveFor(p); return; }   // needs receipt date
    setPrStatus(p.id, next);
  }

  return (
    <>
      <div className="page-head">
        <h1>Purchase Requests</h1>
        <p className="sub">{project.name} · the realized counterpart to the BoQ — what’s actually been ordered</p>
      </div>

      <ProjectBar />

      <div className="toolbar">
        <div className="spacer" />
        <button className="btn primary" onClick={() => setModal(null)}>+ New PR</button>
      </div>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th><th>Status</th>
                <th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Line total</th>
                <th>Sup 1 / Sup 2</th><th>PIC</th><th>Order</th><th>Receipt</th><th></th>
              </tr>
            </thead>
            <tbody>
              {prs.map((p) => (
                <tr key={p.id}>
                  <td className="mat-link">{materialName(db, p.materialId)}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td className="num">{num(p.quantity)} {p.unit}</td>
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
              {prs.length === 0 && (
                <tr><td colSpan={10}><div className="empty">No purchase requests yet. Raise one from a BoQ item.</div></td></tr>
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
