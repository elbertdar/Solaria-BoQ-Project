import { useMemo, useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { boqForProject, boqItemHasPr, materialName } from '../engine/reconcile.js';
import { suggestMaterials, resolveMaterial } from '../engine/match.js';
import { leadTimeFor, projectStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { ProjectBar } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import PrModal from '../components/PrModal.jsx';
import { idr, fmtDate, num } from '../engine/format.js';

const dnum = (start, date) => (start && date ? Math.round((date - start) / 86400000) : null);

export default function BoqPage() {
  const { db, currentProjectId } = useStore();
  const project = useProject();
  const items = boqForProject(db, currentProjectId);
  const start = projectStart(db, currentProjectId);

  const [grouped, setGrouped] = useState(true);
  const [editItem, setEditItem] = useState(undefined);
  const [prFor, setPrFor] = useState(null);

  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  const groups = useMemo(() => {
    if (!grouped) return [{ key: '__all', label: null, rows: items }];
    const map = new Map();
    for (const it of items) {
      const k = it.mandorId || '__none';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()].map(([k, rows]) => ({ key: k, label: mandorName(k), rows }));
  }, [items, grouped, db.mandors]);

  return (
    <>
      <div className="page-head">
        <h1>Bill of Quantities</h1>
        <p className="sub">{project.name} · the material plan — quantity, mandor, and needed day (order day is auto-computed)</p>
      </div>

      <ProjectBar />

      <div className="toolbar">
        <label className="toggle">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by mandor
        </label>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setEditItem(null)}>+ Add BoQ item</button>
      </div>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th><th>Description</th>
                <th className="num">Qty</th><th className="num">Exp. unit cost</th>
                <th className="num">Needed</th><th className="num">Order by</th><th>PR</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Group key={g.key} g={g} db={db} grouped={grouped} start={start}
                  onEdit={setEditItem} onRaisePr={setPrFor} />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8}><div className="empty">No BoQ items yet. Add the first line item to begin.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editItem !== undefined && <BoqModal item={editItem} onClose={() => setEditItem(undefined)} />}
      {prFor && <PrModal boqItem={prFor} onClose={() => setPrFor(null)} />}
    </>
  );
}

function Group({ g, db, grouped, start, onEdit, onRaisePr }) {
  return (
    <>
      {grouped && g.label && (
        <tr className="group-row"><td colSpan={8}>Mandor · {g.label} ({g.rows.length})</td></tr>
      )}
      {g.rows.map((b) => {
        const linked = boqItemHasPr(db, b.id);
        const matLead = leadTimeFor(db, b.materialId);
        const lead = b.leadTimeDays != null ? b.leadTimeDays : matLead;
        const needed = b.neededDayOffset;
        const neededDate = (start && needed != null) ? addDays(start, needed) : null;
        const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
        const orderDay = dnum(start, orderDate);
        return (
          <tr key={b.id}>
            <td className="mat-link">{materialName(db, b.materialId)}</td>
            <td>{b.description}</td>
            <td className="num">{num(b.quantity)} {b.unit}</td>
            <td className="num">{idr(b.expectedUnitCost)}</td>
            <td className="num">
              {needed != null ? <>Day {needed}{neededDate && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(neededDate)}</div>}</> : '—'}
            </td>
            <td className="num">
              {orderDay != null
                ? <>Day {orderDay}<div className="muted" style={{ fontSize: 11 }}>{lead}d lead{b.leadTimeDays != null ? '*' : ''}</div></>
                : <span className="muted">set lead time</span>}
            </td>
            <td className={linked ? 'linked-yes' : 'linked-no'}>{linked ? '● linked' : '○ none'}</td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>
              <button className="btn sm ghost" onClick={() => onEdit(b)}>Edit</button>{' '}
              <button className="btn sm" onClick={() => onRaisePr(b)}>Raise PR</button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function BoqModal({ item, onClose }) {
  const { db, currentProjectId, addBoqItem, updateBoqItem, addMaterial, addMandor } = useStore();
  const editing = !!item;
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
    setTouchedMat(false);
  }
  function createNewMaterial() {
    const id = addMaterial({ canonicalName: matQuery.trim(), defaultUnit: unit || 'pcs', materialTypeId: db.materialTypes[0]?.id, leadTimeDays: 7 });
    setMaterialId(id); if (!unit) setUnit('pcs'); setTouchedMat(false);
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
    if (!description.trim()) { setError('Add a short description.'); return; }
    if (quantity === '' || Number(quantity) <= 0) { setError('Enter a quantity.'); return; }
    if (!unit) { setError('Set a unit.'); return; }
    if (neededDayOffset === '' || Number(neededDayOffset) < 0) { setError('Enter the needed day (days after project start, 0 or more).'); return; }

    const patch = {
      projectId: currentProjectId, materialId: mid, description: description.trim(),
      quantity: Number(quantity), unit, expectedUnitCost: Number(expectedUnitCost) || 0,
      neededDayOffset: Number(neededDayOffset),
      leadTimeDays: leadOverride === '' ? null : Number(leadOverride),
      mandorId,
    };
    if (editing) updateBoqItem(item.id, patch, 'edited line item');
    else addBoqItem(patch);
    onClose();
  }

  return (
    <Modal title={editing ? 'Edit BoQ item' : 'Add BoQ item'} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{editing ? 'Save changes' : 'Add item'}</button>
      </>}>
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
          <label className="lbl">Description <span className="req">*</span></label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Free-text spec notes (Ket.)" />
        </div>

        <div>
          <label className="lbl">Quantity <span className="req">*</span></label>
          <input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Unit <span className="req">*</span></label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lembar, m2, sak…" />
        </div>

        <div>
          <label className="lbl">Expected unit cost (IDR)</label>
          <input type="number" min="0" value={expectedUnitCost} onChange={(e) => setCost(e.target.value)} />
        </div>
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

        <div>
          <label className="lbl">Needed — days after start <span className="req">*</span></label>
          <input type="number" min="0" value={neededDayOffset} onChange={(e) => setNeeded(e.target.value)} placeholder="e.g. 45" />
        </div>
        <div>
          <label className="lbl">Custom lead time (days)</label>
          <input type="number" min="0" value={leadOverride} onChange={(e) => setLeadOverride(e.target.value)}
            placeholder={matLead != null ? `${matLead} (material default)` : 'optional'} />
          <div className="help">Blank = use the material’s default. Set to override for this line only.</div>
        </div>

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
      </div>

      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
