import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { checkProspectivePr, materialName, boqForProject, remainingQty } from '../engine/reconcile.js';
import { PR_FLOW, PR_STATUS } from '../theme.js';
import { idr, today } from '../engine/format.js';

export default function PrModal({ pr = null, boqItem = null, onClose }) {
  const { db, currentProjectId, addPr, updatePr, deletePr } = useStore();
  const editing = !!pr;
  const raising = !editing && !!boqItem;
  const editingExtra = editing && !db.boqItems.some((b) => b.id === pr.boqItemId); // editing a PR with no live line

  const projectBoq = boqForProject(db, currentProjectId);
  const initialBoqId = editingExtra ? '__extra' : (pr?.boqItemId || boqItem?.id || '');
  const initialBoqItem = db.boqItems.find((b) => b.id === initialBoqId);

  const [boqItemId, setBoqItemId] = useState(initialBoqId);
  const [extraMatId, setExtraMatId] = useState(editingExtra ? pr.materialId : '');
  const [extraUnit, setExtraUnit] = useState(editingExtra ? (pr.unit || '') : '');
  const [quantity, setQuantity] = useState(
    editing ? (pr.quantity ?? '') : (raising && initialBoqItem?.budgetBasis !== 'allowance' ? String(remainingQty(db, initialBoqId)) : ''));
  const [unitCost, setUnitCost] = useState(
    editing ? (pr.unitCost ?? '') : (raising ? (initialBoqItem?.expectedUnitCost ?? '') : ''));
  const [supplierPrimaryId, setSup1] = useState(pr?.supplierPrimaryId ?? '');
  const [supplierSecondaryId, setSup2] = useState(pr?.supplierSecondaryId ?? '');
  const [picId, setPic] = useState(pr?.picId ?? db.currentUser?.id ?? '');
  const [status, setStatus] = useState(pr?.status ?? 'draft');
  const [orderDate, setOrderDate] = useState(editing ? (pr.orderDate ?? '') : (raising ? today() : ''));
  const [receiptDate, setReceiptDate] = useState(editing ? (pr.receiptDate ?? '') : (raising ? today() : ''));
  const [error, setError] = useState('');
  const [ackOver, setAckOver] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const extra = boqItemId === '__extra';
  const selectedBoq = extra ? null : db.boqItems.find((b) => b.id === boqItemId);
  const effMatId = extra ? extraMatId : selectedBoq?.materialId;
  const effUnit = extra ? extraUnit : (selectedBoq?.unit || '');
  const matName = effMatId ? materialName(db, effMatId) : '—';
  const unit = effUnit;

  // Recommend suppliers whose category tags match the material's type (BR-style nicety).
  const matTypeId = effMatId ? db.materials.find((m) => m.id === effMatId)?.materialTypeId : null;
  const recTypeLabel = matTypeId ? (db.materialTypes.find((t) => t.id === matTypeId)?.name || '') : '';
  const recommendedSuppliers = matTypeId ? db.suppliers.filter((s) => (s.materialTypeIds || []).includes(matTypeId)) : [];
  const recIds = new Set(recommendedSuppliers.map((s) => s.id));
  const otherSuppliers = db.suppliers.filter((s) => !recIds.has(s.id));

  // Live reconciliation check as quantity changes (BR-7 / Feature 5.6).
  const check = useMemo(() => {
    if (!selectedBoq || quantity === '' || selectedBoq.budgetBasis === 'allowance') return { ok: true };
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
    if (!extra && !selectedBoq) { setError('Select a BoQ item, or choose “No BoQ line (extra purchase)” for an unplanned order.'); return; }
    if (extra && !effMatId) { setError('Pick a material for this extra purchase.'); return; }
    if (extra && !effUnit) { setError('Set a unit.'); return; }
    if (quantity === '' || Number(quantity) <= 0) { setError('Enter a quantity.'); return; }
    if (status === 'received' && !receiptDate) { setError('Received PRs need a receipt date (BR-4).'); return; }

    const payload = {
      boqItemId: extra ? null : boqItemId,
      projectId: currentProjectId,
      materialId: effMatId,
      unit: effUnit,
      quantity, unitCost,
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
          {editing && (confirmingDelete ? (
            <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13 }}>Delete this PR permanently?</span>
              <button className="btn sm danger" onClick={() => { deletePr(pr.id); onClose(); }}>Confirm delete</button>
              <button className="btn sm ghost" onClick={() => setConfirmingDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn sm ghost" style={{ marginRight: 'auto', color: 'var(--risk)' }}
              onClick={() => setConfirmingDelete(true)}>Delete…</button>
          ))}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={blocked}>
            {editing ? 'Save changes' : 'Create PR'}
          </button>
        </>
      }
    >
      <p className="help" style={{ marginTop: 0 }}>
        Layout mirrors the outgoing PO so contents can be copy-pasted (BR-5).
        Material and unit are inherited from the BoQ item, or entered directly for an extra purchase.
      </p>

      <div className="form-grid">
        <div className="full">
          <label className="lbl">BoQ item</label>
          {editing ? (
            <div className="readonly-val">{extra ? 'Extra — no BoQ line' : `${matName} — ${selectedBoq?.description || ''}`}</div>
          ) : (
            <select className="input" value={boqItemId} onChange={(e) => {
              const id = e.target.value;
              setBoqItemId(id);
              setAckOver(false);
              if (raising && id && id !== '__extra') {   // Raise PR auto-fills qty + cost from the line
                const nb = db.boqItems.find((b) => b.id === id);
                setQuantity(nb?.budgetBasis === 'allowance' ? '' : String(remainingQty(db, id)));
                setUnitCost(nb?.budgetBasis === 'allowance' ? '' : (nb?.expectedUnitCost ?? ''));
              }
            }}>
              <option value="">Select a BoQ item…</option>
              {projectBoq.map((b) => (
                <option key={b.id} value={b.id}>
                  {materialName(db, b.materialId)} — {b.description} ({b.quantity} {b.unit})
                </option>
              ))}
              <option value="__extra">— No BoQ line (extra purchase) —</option>
            </select>
          )}
          {extra && <div className="help" style={{ color: '#92660C' }}>Extra purchase — not in the BoQ plan. Shows as “Extra” in the PR list and Balance.</div>}
        </div>

        <div>
          <label className="lbl">Material{extra ? <span className="req"> *</span> : ' (inherited)'}</label>
          {extra ? (
            <select className="input" value={extraMatId} onChange={(e) => {
              const mid = e.target.value; setExtraMatId(mid);
              const m = db.materials.find((x) => x.id === mid);
              if (m && !extraUnit) setExtraUnit(m.defaultUnit);
            }}>
              <option value="">Select a material…</option>
              {db.materials.map((m) => <option key={m.id} value={m.id}>{m.canonicalName}</option>)}
            </select>
          ) : (
            <div className="readonly-val">{matName}</div>
          )}
        </div>
        <div>
          <label className="lbl">Unit{extra ? <span className="req"> *</span> : ' (inherited)'}</label>
          {extra ? (
            <input type="text" value={extraUnit} onChange={(e) => setExtraUnit(e.target.value)} placeholder="lembar, m2, sak…" />
          ) : (
            <div className="readonly-val">{unit || '—'}</div>
          )}
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
            <SupplierOptions recommended={recommendedSuppliers} others={otherSuppliers} typeLabel={recTypeLabel} />
          </select>
          {recommendedSuppliers.length > 0 && (
            <div className="help">★ Recommended = suppliers tagged for {recTypeLabel}</div>
          )}
        </div>
        <div>
          <label className="lbl">Supplier 2 (comparison)</label>
          <select className="input" value={supplierSecondaryId} onChange={(e) => setSup2(e.target.value)}>
            <SupplierOptions recommended={recommendedSuppliers} others={otherSuppliers} typeLabel={recTypeLabel} />
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

// Supplier <select> options with a "Recommended" group (category tag matches the material)
// floated to the top, then everyone else. Falls back to a flat list when nothing matches.
function SupplierOptions({ recommended, others, typeLabel }) {
  return (
    <>
      <option value="">—</option>
      {recommended.length > 0 ? (
        <>
          <optgroup label={`★ Recommended${typeLabel ? ` · ${typeLabel}` : ''}`}>
            {recommended.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          <optgroup label="Other suppliers">
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        </>
      ) : (
        others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
      )}
    </>
  );
}
