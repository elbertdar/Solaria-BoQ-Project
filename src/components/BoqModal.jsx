import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { materialName, prsForBoqItem } from '../engine/reconcile.js';
import { suggestMaterials, resolveMaterial } from '../engine/match.js';
import { leadTimeFor, projectStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { fmtDate } from '../engine/format.js';
import Modal from './Modal.jsx';
import { dnum } from './boqShared.jsx';

export default function BoqModal({ item, onClose }) {
  const { db, currentProjectId, addMaterial, addMandor, stageBoqAdd, stageBoqModify, editStagedAdd, stageBoqDelete, unstageBoq } = useStore();
  const editing = !!item;
  const isAdd = !!item?.__isAdd;
  const linkedPrs = (editing && !isAdd) ? prsForBoqItem(db, item.id) : [];
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteLinkedPrs, setDeleteLinkedPrs] = useState(false);
  const start = projectStart(db, currentProjectId);

  const existingMat = item ? db.materials.find((m) => m.id === item.materialId) : null;
  const [materialId, setMaterialId] = useState(item?.materialId ?? '');
  const [matQuery, setMatQuery] = useState(existingMat?.canonicalName ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [quantity, setQuantity] = useState(item?.quantity ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [expectedUnitCost, setCost] = useState(item?.expectedUnitCost ?? '');
  const [neededDayOffset, setNeeded] = useState(item?.neededDayOffset ?? '');
  const [leadOverride, setLeadOverride] = useState(item?.leadTimeDays ?? '');
  const [budgetBasis, setBudgetBasis] = useState(item?.budgetBasis ?? 'quantity');
  const [allowanceAmount, setAllowanceAmount] = useState(item?.allowanceAmount ?? '');
  const allowance = budgetBasis === 'allowance';
  const [mandorId, setMandor] = useState(item?.mandorId ?? db.mandors[0]?.id ?? '');
  const [addingMandor, setAddingMandor] = useState(false);
  const [newMandor, setNewMandor] = useState('');
  const [error, setError] = useState('');
  const [touchedMat, setTouchedMat] = useState(false);

  const suggestions = useMemo(() => {
    if (materialId || !touchedMat) return [];
    return suggestMaterials(db.materials, matQuery);
  }, [db.materials, matQuery, materialId, touchedMat]);
  const exactResolve = useMemo(() => resolveMaterial(db.materials, matQuery), [db.materials, matQuery]);
  const noMatch = touchedMat && !materialId && matQuery.trim().length >= 2 && suggestions.length === 0 && !exactResolve;

  const matLead = materialId ? leadTimeFor(db, materialId) : null;
  const lead = leadOverride !== '' ? Number(leadOverride) : matLead;
  const neededNum = neededDayOffset === '' ? null : Number(neededDayOffset);
  const neededDate = (start && neededNum != null) ? addDays(start, neededNum) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const orderDay = dnum(start, orderDate);

  function pickMaterial(m) {
    setMaterialId(m.id); setMatQuery(m.canonicalName);
    if (!unit) setUnit(m.defaultUnit);
    if (expectedUnitCost === '' && m.estUnitCost != null) setCost(m.estUnitCost);
    if (!description.trim()) setDescription(m.canonicalName);
    setTouchedMat(false);
  }
  function createNewMaterial() {
    const id = addMaterial({ canonicalName: matQuery.trim(), defaultUnit: unit || 'pcs', materialTypeId: db.materialTypes[0]?.id, leadTimeDays: 7 });
    setMaterialId(id); if (!unit) setUnit('pcs'); if (!description.trim()) setDescription(matQuery.trim()); setTouchedMat(false);
  }
  function confirmNewMandor() {
    if (!newMandor.trim()) return;
    const id = addMandor(newMandor.trim());
    setMandor(id); setNewMandor(''); setAddingMandor(false);
  }

  function save() {
    setError('');
    let mid = materialId;
    if (!mid && exactResolve) mid = exactResolve.id;
    if (!mid) { setError('Pick an existing material or create a new canonical entry — BoQ items can’t use free-text names (BR-1).'); return; }
    if (!unit) { setError('Set a unit.'); return; }
    if (!allowance) {
      if (quantity === '' || Number(quantity) <= 0) { setError('Enter a quantity.'); return; }
      if (neededDayOffset === '' || Number(neededDayOffset) < 0) { setError('Enter the needed day (days after project start, 0 or more).'); return; }
    }

    const patch = {
      projectId: currentProjectId, materialId: mid, description: description.trim() || (db.materials.find((x) => x.id === mid)?.canonicalName ?? ''),
      mandorId, unit, budgetBasis,
      quantity: allowance ? 0 : Number(quantity),
      expectedUnitCost: allowance ? 0 : (Number(expectedUnitCost) || 0),
      allowanceAmount: allowance ? (Number(allowanceAmount) || 0) : 0,
      neededDayOffset: allowance ? null : Number(neededDayOffset),
      leadTimeDays: allowance ? null : (leadOverride === '' ? null : Number(leadOverride)),
    };
    if (editing) {
      if (isAdd) editStagedAdd(currentProjectId, item.id, patch);
      else stageBoqModify(currentProjectId, item.id, patch);
    } else {
      stageBoqAdd(currentProjectId, patch);
    }
    onClose();
  }

  return (
    <Modal title={editing ? (isAdd ? 'Edit new row' : 'Edit BoQ item') : 'Add BoQ item'} onClose={onClose} wide
      footer={editing ? (
        confirmingDelete ? (
          <>
            <span style={{ marginRight: 'auto', color: 'var(--risk)', fontSize: 13, display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
              <span>{isAdd ? 'Discard this new row?' : 'Stage this line for removal?'}</span>
              {!isAdd && linkedPrs.length > 0 && (
                <label className="toggle" style={{ color: 'var(--ink)', fontWeight: 400 }}>
                  <input type="checkbox" checked={deleteLinkedPrs} onChange={(e) => setDeleteLinkedPrs(e.target.checked)} />
                  Also delete its {linkedPrs.length} linked PR{linkedPrs.length > 1 ? 's' : ''} (otherwise kept as extra)
                </label>
              )}
            </span>
            <button className="btn ghost" onClick={() => setConfirmingDelete(false)}>Keep</button>
            <button className="btn danger" onClick={() => {
              if (isAdd) unstageBoq(currentProjectId, { tempId: item.id });
              else stageBoqDelete(currentProjectId, item.id, { deletePrs: deleteLinkedPrs });
              onClose();
            }}>{isAdd ? 'Discard row' : 'Stage removal'}</button>
          </>
        ) : (
          <>
            <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--risk)' }} onClick={() => setConfirmingDelete(true)}>{isAdd ? 'Discard…' : 'Delete…'}</button>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}>Save changes</button>
          </>
        )
      ) : (
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Add item</button>
        </>
      )}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Material <span className="req">*</span></label>
          <input type="text" value={matQuery} placeholder="Type a material name, e.g. Gypsum Aplus…"
            onChange={(e) => { setMatQuery(e.target.value); setMaterialId(''); setTouchedMat(true); }} />
          {materialId && (
            <div className="help" style={{ color: 'var(--ok)' }}>
              ✓ {materialName(db, materialId)}{matLead != null ? ` · material lead time ${matLead} days` : ' · no lead time set (Catalogue)'}
            </div>
          )}
          {!materialId && suggestions.length > 0 && (
            <div className="suggest">
              {suggestions.map((s) => (
                <div className="suggest-item" key={s.material.id} onClick={() => pickMaterial(s.material)}>
                  <span><b>{s.material.canonicalName}</b>
                    {s.matchedOn !== s.material.canonicalName && <span className="muted"> · alias “{s.matchedOn}”</span>}
                  </span>
                  <span className="score">{Math.round(s.score * 100)}% match</span>
                </div>
              ))}
            </div>
          )}
          {noMatch && (
            <div className="suggest">
              <div className="suggest-item" onClick={createNewMaterial}>
                <span>+ Create “{matQuery.trim()}” as a new canonical material</span>
              </div>
            </div>
          )}
        </div>

        <div className="full">
          <label className="lbl">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Defaults to the material name — add spec notes if needed (Ket.)" />
        </div>

        <div className="full">
          <label className="lbl">Budget basis</label>
          <div className="seg">
            <button type="button" className={!allowance ? 'active' : ''} onClick={() => setBudgetBasis('quantity')}>By quantity</button>
            <button type="button" className={allowance ? 'active' : ''} onClick={() => setBudgetBasis('allowance')}>Allowance (lump sum)</button>
          </div>
          {allowance && <div className="help">Tracked by spend against a lump sum — no quantity target, and kept off the order timeline. Use for consumables you reorder (nails, sealant, sandpaper…).</div>}
        </div>

        {!allowance && (
          <div>
            <label className="lbl">Quantity <span className="req">*</span></label>
            <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        )}
        <div>
          <label className="lbl">Unit <span className="req">*</span></label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lembar, m2, sak…" />
        </div>

        {allowance ? (
          <div>
            <label className="lbl">Allowance (IDR)</label>
            <input type="number" min="0" value={allowanceAmount} onChange={(e) => setAllowanceAmount(e.target.value)} placeholder="e.g. 5000000" />
            <div className="help">Leave 0 for an untracked bucket (just keeps the spend visible).</div>
          </div>
        ) : (
          <div>
            <label className="lbl">Expected unit cost (IDR)</label>
            <input type="number" min="0" value={expectedUnitCost} onChange={(e) => setCost(e.target.value)} />
          </div>
        )}
        <div>
          <label className="lbl">Mandor</label>
          {!addingMandor ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="input" value={mandorId} onChange={(e) => setMandor(e.target.value)}>
                {db.mandors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="btn ghost" type="button" onClick={() => setAddingMandor(true)} title="Add mandor">＋</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={newMandor} autoFocus placeholder="New mandor name"
                onChange={(e) => setNewMandor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmNewMandor()} />
              <button className="btn" type="button" onClick={confirmNewMandor}>Add</button>
              <button className="btn ghost" type="button" onClick={() => { setAddingMandor(false); setNewMandor(''); }}>✕</button>
            </div>
          )}
        </div>

        {!allowance && (
          <div>
            <label className="lbl">Needed — days after start <span className="req">*</span></label>
            <input type="number" min="0" value={neededDayOffset} onChange={(e) => setNeeded(e.target.value)} placeholder="e.g. 45" />
          </div>
        )}
        {!allowance && (
          <div>
            <label className="lbl">Custom lead time (days)</label>
            <input type="number" min="0" value={leadOverride} onChange={(e) => setLeadOverride(e.target.value)}
              placeholder={matLead != null ? `${matLead} (material default)` : 'optional'} />
            <div className="help">Blank = use the material’s default. Set to override for this line only.</div>
          </div>
        )}

        {!allowance && (
          <div className="full">
            <div className="help" style={{ marginTop: 2 }}>
              {orderDay != null ? (
                <span style={orderDate && start && orderDate < start ? { color: 'var(--risk)' } : {}}>
                  → <b>Order by day {orderDay}</b> · {lead}d lead{leadOverride !== '' ? ' (custom)' : ''}, business days
                  {start && <> · needed ≈ {fmtDate(neededDate)}, order ≈ {fmtDate(orderDate)}</>}
                  {orderDate && start && orderDate < start && <> — ⚠ order falls before project start; shorten lead or push the needed day.</>}
                </span>
              ) : (
                <span className="muted">
                  {materialId && lead == null
                    ? 'No lead time yet — set a custom one above or add it to the material in the Catalogue.'
                    : 'Order day is computed from the needed day minus the lead time, counted in business days.'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}