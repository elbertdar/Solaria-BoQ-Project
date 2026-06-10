import { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { checkProspectivePr, materialName, boqForProject, remainingQty, brandsForMaterial } from '../engine/reconcile.js';
import { PR_FLOW, PR_STATUS } from '../theme.js';
import { idr, today } from '../engine/format.js';
import NumberInput from './NumberInput.jsx';
import ComboBox from './ComboBox.jsx';

export default function PrModal({ pr = null, boqItem = null, onClose }) {
  const { db, currentProjectId, addPr, updatePr, softDeletePr, addBrand, addSupplier, addMaterial, addUser } = useStore();
  const editing = !!pr;
  const raising = !editing && !!boqItem;
  const editingExtra = editing && !db.boqItems.some((b) => b.id === pr.boqItemId); // editing a PR with no live line

  const projectBoq = boqForProject(db, currentProjectId);
  const initialBoqId = editingExtra ? '__extra' : (pr?.boqItemId || boqItem?.id || '');
  const initialBoqItem = db.boqItems.find((b) => b.id === initialBoqId);

  const [boqItemId, setBoqItemId] = useState(initialBoqId);
  const [extraMatId, setExtraMatId] = useState(editingExtra ? pr.materialId : '');
  const [extraUnit, setExtraUnit] = useState(editingExtra ? (pr.unit || '') : '');
  const [brandId, setBrandId] = useState(pr?.brandId ?? '');
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
  const [comment, setComment] = useState(pr?.comment ?? '');
  const [error, setError] = useState('');
  const [ackOver, setAckOver] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const extra = boqItemId === '__extra';
  const selectedBoq = extra ? null : db.boqItems.find((b) => b.id === boqItemId);
  const effMatId = extra ? extraMatId : selectedBoq?.materialId;
  const effUnit = extra ? extraUnit : (selectedBoq?.unit || '');
  const matName = effMatId ? materialName(db, effMatId) : '—';
  const unit = effUnit;
  const matBrands = effMatId ? brandsForMaterial(db, effMatId) : [];

  // Recommend suppliers whose category tags match the material's type (BR-style nicety).
  const matTypeId = effMatId ? db.materials.find((m) => m.id === effMatId)?.materialTypeId : null;
  const recTypeLabel = matTypeId ? (db.materialTypes.find((t) => t.id === matTypeId)?.name || '') : '';
  const recommendedSuppliers = matTypeId ? db.suppliers.filter((s) => (s.materialTypeIds || []).includes(matTypeId)) : [];
  const recIds = new Set(recommendedSuppliers.map((s) => s.id));
  const otherSuppliers = db.suppliers.filter((s) => !recIds.has(s.id));

  // Unified ComboBox option lists. New suppliers created here are auto-tagged with the
  // material's category, so they show under ★ Recommended for this material next time.
  const supplierOptions = [
    ...recommendedSuppliers.map((s) => ({ id: s.id, label: s.name, group: `★ Recommended${recTypeLabel ? ` · ${recTypeLabel}` : ''}` })),
    ...otherSuppliers.map((s) => ({ id: s.id, label: s.name, group: recommendedSuppliers.length ? 'Other suppliers' : undefined })),
  ];
  const createSupplier = (q) => addSupplier({
    name: q.trim(), location: '',
    materialTypeIds: matTypeId ? [matTypeId] : [],
    contact: { phone: '', email: '', address: '' },
  });
  const picOptions = db.users.filter((u) => u.role === 'Purchasing PIC').map((u) => ({ id: u.id, label: u.name }));

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
      brandId: brandId || null,
      quantity, unitCost,
      supplierPrimaryId: supplierPrimaryId || null,
      supplierSecondaryId: supplierSecondaryId || null,
      picId: picId || null,
      status,
      orderDate: orderDate || null,
      receiptDate: status === 'received' ? (receiptDate || null) : null,
      comment: comment.trim(),
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
              <span className="muted" style={{ fontSize: 13 }}>Move this PR to Trash? (restorable for 7 days)</span>
              <button className="btn sm danger" onClick={() => { softDeletePr(pr.id); onClose(); }}>Move to Trash</button>
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
              setBrandId('');
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
            <ComboBox value={extraMatId} placeholder="Search or create a material…"
              options={db.materials.map((m) => ({ id: m.id, label: m.canonicalName, sublabel: m.defaultUnit }))}
              onPick={(mid) => {
                setExtraMatId(mid); setBrandId('');
                const m = db.materials.find((x) => x.id === mid);
                if (m && !extraUnit) setExtraUnit(m.defaultUnit);
              }}
              onCreate={(q) => {
                const id = addMaterial({ canonicalName: q.trim(), defaultUnit: extraUnit || 'pcs', materialTypeId: db.materialTypes[0]?.id, leadTimeDays: 7 });
                if (!extraUnit) setExtraUnit('pcs');
                setBrandId('');
                return id;
              }}
              createLabel={(q) => `➕ Create material “${q}”`} />
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
          <label className="lbl">Brand</label>
          <ComboBox value={brandId} disabled={!effMatId} noneLabel="Unspecified" placeholder="Search or add a brand…"
            options={matBrands.map((b) => ({ id: b.id, label: b.name }))}
            onPick={setBrandId}
            onCreate={(q) => addBrand({ materialId: effMatId, name: q.trim() })}
            createLabel={(q) => `➕ Add brand “${q}”`} />
          {!effMatId && <div className="help">Pick a material first to choose a brand.</div>}
        </div>

        <div>
          <label className="lbl">Quantity <span className="req">*</span></label>
          <NumberInput allowDecimal value={quantity}
            onChange={(v) => { setQuantity(v); setAckOver(false); }} />
        </div>
        <div>
          <label className="lbl">Unit cost (IDR)</label>
          <NumberInput value={unitCost} onChange={setUnitCost} />
          <div className="help">Line total: {idr(lineTotal)}</div>
        </div>

        <div>
          <label className="lbl">Comment <span className="muted">(optional)</span></label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="Note for this PR…"
            style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13.5, lineHeight: 1.4, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 9, resize: 'vertical' }} />
        </div>

        <div>
          <label className="lbl">Supplier 1</label>
          <ComboBox value={supplierPrimaryId} onPick={setSup1} options={supplierOptions}
            onCreate={createSupplier} createLabel={(q) => `➕ Add supplier “${q}”`}
            noneLabel="None" placeholder="Search or add a supplier…" />
          {recommendedSuppliers.length > 0 ? (
            <div className="help">★ Recommended = suppliers tagged for {recTypeLabel}</div>
          ) : (matTypeId && <div className="help">New suppliers added here get tagged for {recTypeLabel}.</div>)}
        </div>
        <div>
          <label className="lbl">Supplier 2 (comparison)</label>
          <ComboBox value={supplierSecondaryId} onPick={setSup2} options={supplierOptions}
            onCreate={createSupplier} createLabel={(q) => `➕ Add supplier “${q}”`}
            noneLabel="None" placeholder="Search or add a supplier…" />
        </div>

        <div>
          <label className="lbl">Purchasing PIC</label>
          <ComboBox value={picId} onPick={setPic} options={picOptions}
            onCreate={(q) => addUser({ name: q.trim() })} createLabel={(q) => `➕ Add PIC “${q}”`}
            noneLabel="None" placeholder="Search team…" />
        </div>
        <div>
          <label className="lbl">Status</label>
          <select className="input" value={status} onChange={(e) => { const v = e.target.value; setStatus(v); if (v === 'received' && !receiptDate) setReceiptDate(today()); }}>
            {PR_FLOW.map((s) => <option key={s} value={s}>{PR_STATUS[s].label}</option>)}
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label className="lbl">Order date {status === 'ordered' || status === 'received' ? '' : ''}</label>
          <input type="date" value={orderDate || ''} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        {status === 'received' && (
          <div>
            <label className="lbl">Receipt date <span className="req">*</span></label>
            <input type="date" value={receiptDate || ''} max={today()}
              onChange={(e) => setReceiptDate(e.target.value)} />
            <div className="help">Recorded only once the goods are received.</div>
          </div>
        )}
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
