import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { checkProspectivePr, materialName, boqForProject } from '../engine/reconcile.js';
import { PR_FLOW, PR_STATUS } from '../theme.js';
import { idr, today } from '../engine/format.js';

export default function PrModal({ pr = null, boqItem = null, onClose }) {
  const { db, currentProjectId, addPr, updatePr } = useStore();
  const editing = !!pr;

  // In create mode without a preselected BoQ item, let the user pick one.
  const projectBoq = boqForProject(db, currentProjectId);
  const initialBoqId = pr?.boqItemId || boqItem?.id || projectBoq[0]?.id || '';

  const [boqItemId, setBoqItemId] = useState(initialBoqId);
  const [quantity, setQuantity] = useState(pr?.quantity ?? '');
  const [unitCost, setUnitCost] = useState(pr?.unitCost ?? '');
  const [supplierPrimaryId, setSup1] = useState(pr?.supplierPrimaryId ?? '');
  const [supplierSecondaryId, setSup2] = useState(pr?.supplierSecondaryId ?? '');
  const [picId, setPic] = useState(pr?.picId ?? db.currentUser?.id ?? '');
  const [status, setStatus] = useState(pr?.status ?? 'draft');
  const [orderDate, setOrderDate] = useState(pr?.orderDate ?? '');
  const [receiptDate, setReceiptDate] = useState(pr?.receiptDate ?? '');
  const [error, setError] = useState('');
  const [ackOver, setAckOver] = useState(false);

  const selectedBoq = db.boqItems.find((b) => b.id === boqItemId);
  const matName = selectedBoq ? materialName(db, selectedBoq.materialId) : '—';
  const unit = selectedBoq?.unit || '';

  // Live reconciliation check as quantity changes (BR-7 / Feature 5.6).
  const check = useMemo(() => {
    if (!selectedBoq || quantity === '' ) return { ok: true };
    return checkProspectivePr(db, {
      boqItemId,
      quantity: Number(quantity),
      excludePrId: pr?.id,
    });
  }, [db, boqItemId, quantity, selectedBoq, pr]);

  const wouldExceed = check.wouldExceed;
  // Soft warning (Q-3 default): block save only until acknowledged.
  const blocked = wouldExceed && !ackOver;

  function save() {
    setError('');
    if (!selectedBoq) { setError('Select a BoQ item — a PR must link to one (BR-3).'); return; }
    if (quantity === '' || Number(quantity) <= 0) { setError('Enter a quantity.'); return; }
    if (status === 'received' && !receiptDate) { setError('Received PRs need a receipt date (BR-4).'); return; }

    const payload = {
      boqItemId, quantity, unitCost,
      supplierPrimaryId: supplierPrimaryId || null,
      supplierSecondaryId: supplierSecondaryId || null,
      picId: picId || null,
      status,
      orderDate: orderDate || null,
      receiptDate: receiptDate || null,
    };
    if (editing) updatePr(pr.id, payload);
    else addPr(payload);
    onClose();
  }

  const lineTotal = (Number(quantity) || 0) * (Number(unitCost) || 0);

  return (
    <Modal
      title={editing ? `Edit PR · ${matName}` : 'New Purchase Request'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={blocked}>
            {editing ? 'Save changes' : 'Create PR'}
          </button>
        </>
      }
    >
      <p className="help" style={{ marginTop: 0 }}>
        Layout mirrors the outgoing PO so contents can be copy-pasted (BR-5).
        Material and unit are inherited from the BoQ item and can't be retyped.
      </p>

      <div className="form-grid">
        <div className="full">
          <label className="lbl">Linked BoQ item <span className="req">*</span></label>
          {editing ? (
            <div className="readonly-val">{matName} — {selectedBoq?.description}</div>
          ) : (
            <select className="input" value={boqItemId} onChange={(e) => setBoqItemId(e.target.value)}>
              {projectBoq.map((b) => (
                <option key={b.id} value={b.id}>
                  {materialName(db, b.materialId)} — {b.description} ({b.quantity} {b.unit})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="lbl">Material (inherited)</label>
          <div className="readonly-val">{matName}</div>
        </div>
        <div>
          <label className="lbl">Unit (inherited)</label>
          <div className="readonly-val">{unit || '—'}</div>
        </div>

        <div>
          <label className="lbl">Quantity <span className="req">*</span></label>
          <input type="number" value={quantity} min="0"
            onChange={(e) => { setQuantity(e.target.value); setAckOver(false); }} />
        </div>
        <div>
          <label className="lbl">Unit cost (IDR)</label>
          <input type="number" value={unitCost} min="0" onChange={(e) => setUnitCost(e.target.value)} />
          <div className="help">Line total: {idr(lineTotal)}</div>
        </div>

        <div>
          <label className="lbl">Supplier 1</label>
          <select className="input" value={supplierPrimaryId} onChange={(e) => setSup1(e.target.value)}>
            <option value="">—</option>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Supplier 2 (comparison)</label>
          <select className="input" value={supplierSecondaryId} onChange={(e) => setSup2(e.target.value)}>
            <option value="">—</option>
            {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="lbl">Purchasing PIC</label>
          <select className="input" value={picId} onChange={(e) => setPic(e.target.value)}>
            <option value="">—</option>
            {db.users.filter((u) => u.role === 'Purchasing PIC').map((u) =>
              <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {PR_FLOW.map((s) => <option key={s} value={s}>{PR_STATUS[s].label}</option>)}
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label className="lbl">Order date {status === 'ordered' || status === 'received' ? '' : ''}</label>
          <input type="date" value={orderDate || ''} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Receipt date {status === 'received' && <span className="req">*</span>}</label>
          <input type="date" value={receiptDate || ''} max={today()}
            onChange={(e) => setReceiptDate(e.target.value)} />
        </div>
      </div>

      {wouldExceed && (
        <div className="inline-warn">
          <span>⚠</span>
          <div>
            <b>Over budget.</b> Committing {check.committedAfter} {check.unit} of {check.materialName} exceeds
            the BoQ budget of {check.budgetQty} {check.unit} by <b>{check.overBy} {check.unit}</b>.
            <label className="toggle" style={{ marginTop: 8, color: 'var(--risk)' }}>
              <input type="checkbox" checked={ackOver} onChange={(e) => setAckOver(e.target.checked)} />
              I understand and want to proceed anyway
            </label>
          </div>
        </div>
      )}

      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
