import { useMemo, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { materialName, remainingQty, checkProspectivePr, newSupplier } from '../engine/reconcile.js';
import { activeStatuses, defaultStatusId, isCommitted } from '../engine/status.js';
import { StatusSelect } from './prShared.jsx';
import { idr, today } from '../engine/format.js';
import NumberInput from './NumberInput.jsx';
import ComboBox from './ComboBox.jsx';

// Raise many PRs at once against selected BoQ lines. Built for the client's real workflow —
// "sometimes when I order, I order multiple things from the store at once": pick ONE store,
// tick the items, and place them all as one order. One PR per line (the data model is
// 1 PR = 1 material line), so the store / PIC / status / order date are shared across the
// batch while each line keeps its own quantity + unit cost.
export default function BulkPrModal({ boqItemIds, projectId, onClose }) {
  const { db, addPr, addSupplier, addUser } = useStore();

  // Resolve selected ids → real, in-project lines (dedupe, drop anything stale).
  const lines = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const id of boqItemIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = db.boqItems.find((x) => x.id === id && x.projectId === projectId);
      if (b) out.push(b);
    }
    return out;
  }, [boqItemIds, db.boqItems, projectId]);

  // Per-line editable state, keyed by BoQ id: { qty, unitCost, drop }.
  const [rows, setRows] = useState(() => {
    const m = {};
    for (const b of lines) {
      const allow = b.budgetBasis === 'allowance';
      m[b.id] = { qty: allow ? '' : String(remainingQty(db, b.id)), unitCost: allow ? '' : (b.expectedUnitCost ?? ''), drop: false };
    }
    return m;
  });
  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  // Shared header applied to every PR in the batch.
  const [supplierPrimaryId, setSup1] = useState('');
  const [picId, setPic] = useState(db.currentUser?.id ?? '');
  // This is an "I'm placing an order" flow, so default to Ordered (the committed phase) — not Draft.
  const orderedStatusId = activeStatuses(db).find((s) => s.phase === 'committed')?.id;
  const [status, setStatus] = useState(orderedStatusId || defaultStatusId(db));
  const [orderDate, setOrderDate] = useState(today());
  const [receiptDate, setReceiptDate] = useState(today());
  const [comment, setComment] = useState('');
  const [ackOver, setAckOver] = useState(false);
  const [error, setError] = useState('');

  const active = lines.filter((b) => !rows[b.id]?.drop);
  const committing = isCommitted(db, status);

  // Over-budget only matters once a line actually commits (ordered / received).
  const overIds = useMemo(() => {
    const s = new Set();
    for (const b of active) {
      if (b.budgetBasis === 'allowance') continue;
      const q = Number(rows[b.id]?.qty);
      if (!q) continue;
      if (checkProspectivePr(db, { boqItemId: b.id, quantity: q }).wouldExceed) s.add(b.id);
    }
    return s;
  }, [active, rows, db]);
  const blocked = committing && overIds.size > 0 && !ackOver;

  const supplierOptions = db.suppliers.map((s) => ({ id: s.id, label: s.name }));
  const picOptions = db.users.filter((u) => u.role === 'Purchasing PIC').map((u) => ({ id: u.id, label: u.name }));

  const grandTotal = active.reduce((s, b) => s + (Number(rows[b.id]?.qty) || 0) * (Number(rows[b.id]?.unitCost) || 0), 0);

  function create() {
    setError('');
    if (active.length === 0) { setError('No lines selected — nothing to raise.'); return; }
    const bad = active.filter((b) => { const q = Number(rows[b.id]?.qty); return !q || q <= 0; });
    if (bad.length) { setError(`${bad.length} line${bad.length > 1 ? 's' : ''} need a quantity greater than 0.`); return; }
    if (status === 'received' && !receiptDate) { setError('Received PRs need a receipt date.'); return; }
    for (const b of active) {
      addPr({
        boqItemId: b.id,
        projectId,
        phaseId: b.phaseId,
        quantity: rows[b.id].qty,
        unitCost: rows[b.id].unitCost,
        supplierPrimaryId: supplierPrimaryId || null,
        supplierSecondaryId: null,
        picId: picId || null,
        status,
        orderDate: orderDate || null,
        receiptDate: status === 'received' ? (receiptDate || null) : null,
        comment: comment.trim(),
      });
    }
    onClose();
  }

  return (
    <Modal
      title={`Raise ${active.length} Purchase Request${active.length === 1 ? '' : 's'}`}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>Batch total: <b>{idr(grandTotal)}</b></span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={create} disabled={blocked || active.length === 0}>
            Create {active.length} PR{active.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <p className="help" style={{ marginTop: 0 }}>
        Everything in this batch is ordered from <b>one store</b> — set it once. Quantity and unit cost
        stay editable per line below.
      </p>

      <div className="form-grid">
        <div className="full">
          <label className="lbl">Store</label>
          <ComboBox value={supplierPrimaryId} onPick={setSup1} options={supplierOptions}
            onCreate={(q) => addSupplier(newSupplier(q))}
            createLabel={(q) => `Add store “${q}”`} noneLabel="No store" placeholder="Which store is this order from?" />
        </div>
        <div>
          <label className="lbl">Purchasing PIC</label>
          <ComboBox value={picId} onPick={setPic} options={picOptions}
            onCreate={(q) => addUser({ name: q.trim() })} createLabel={(q) => `Add PIC “${q}”`}
            noneLabel="None" placeholder="Search team…" />
        </div>
        <div>
          <label className="lbl">Status</label>
          <StatusSelect value={status} onChange={(v) => { setStatus(v); if (v === 'received' && !receiptDate) setReceiptDate(today()); }} />
        </div>
        <div>
          <label className="lbl">Order date</label>
          <input type="date" value={orderDate || ''} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        {status === 'received' && (
          <div>
            <label className="lbl">Receipt date <span className="req">*</span></label>
            <input type="date" value={receiptDate || ''} max={today()} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
        )}
        <div className="full">
          <label className="lbl">Comment <span className="muted">(optional — added to each PR)</span></label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Note applied to every PR in this batch…" />
        </div>
      </div>

      <div className="lbl" style={{ margin: '14px 0 6px' }}>Lines ({active.length})</div>
      <div className="card-body flush" style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Material</th><th>Description</th>
              <th className="num" style={{ width: 96 }}>Qty</th><th>Unit</th>
              <th className="num" style={{ width: 130 }}>Unit cost</th>
              <th className="num" style={{ width: 120 }}>Line total</th>
              <th style={{ width: 34 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((b) => {
              const st = rows[b.id];
              if (!st || st.drop) return null;
              const allow = b.budgetBasis === 'allowance';
              const lineTotal = (Number(st.qty) || 0) * (Number(st.unitCost) || 0);
              const over = overIds.has(b.id);
              return (
                <tr key={b.id}>
                  <td className="mat-link"><b>{materialName(db, b.materialId)}</b>{allow && <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>}{over && <TriangleAlert size={13} style={{ color: 'var(--risk)', marginLeft: 6, verticalAlign: '-2px' }} title="Over the BoQ budget for this material" />}</td>
                  <td>{b.description}</td>
                  <td className="num"><NumberInput allowDecimal className="cell-input" style={{ width: 84 }} value={st.qty} onChange={(v) => { setRow(b.id, { qty: v }); setAckOver(false); }} /></td>
                  <td>{b.unit}</td>
                  <td className="num"><NumberInput className="cell-input" style={{ width: 118 }} value={st.unitCost} onChange={(v) => setRow(b.id, { unitCost: v })} /></td>
                  <td className="num">{idr(lineTotal)}</td>
                  <td className="num"><button className="btn sm ghost" title="Remove from batch" style={{ color: 'var(--risk)' }} onClick={() => setRow(b.id, { drop: true })}><X size={14} /></button></td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={7}><div className="empty">Every line was removed from the batch.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {committing && overIds.size > 0 && (
        <div className="inline-warn" style={{ marginTop: 12 }}>
          <TriangleAlert size={15} style={{ flexShrink: 0 }} />
          <div>
            <b>{overIds.size} line{overIds.size > 1 ? 's' : ''} over budget.</b> Committing at these quantities exceeds the BoQ budget for those materials.
            <label className="toggle" style={{ marginTop: 8, color: 'var(--risk)' }}>
              <input type="checkbox" checked={ackOver} onChange={(e) => setAckOver(e.target.checked)} />
              I understand and want to proceed anyway
            </label>
          </div>
        </div>
      )}
      {error && <div className="inline-warn" style={{ marginTop: 12 }}><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
