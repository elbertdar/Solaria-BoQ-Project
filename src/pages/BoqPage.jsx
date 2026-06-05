import { useMemo, useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { boqForProject, boqLineStatus, materialName } from '../engine/reconcile.js';
import { suggestMaterials, resolveMaterial } from '../engine/match.js';
import { leadTimeFor, projectStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { ProjectBar, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import PrModal from '../components/PrModal.jsx';
import { idr, fmtDate, num } from '../engine/format.js';

const dnum = (start, date) => (start && date ? Math.round((date - start) / 86400000) : null);

export default function BoqPage() {
  const { db, currentProjectId, patchBoqItem, addBoqItem, deleteBoqItem, finalizeBoq } = useStore();
  const project = useProject();
  const draft = project?.boqStatus !== 'working';
  const items = boqForProject(db, currentProjectId);
  const start = projectStart(db, currentProjectId);

  const [grouped, setGrouped] = useState(true);
  const [editItem, setEditItem] = useState(undefined);
  const [prFor, setPrFor] = useState(null);
  const [q, setQ] = useState('');
  const [mandorFilter, setMandorFilter] = useState('');
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);

  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  const filtered = items.filter((b) => {
    if (mandorFilter && (b.mandorId || '') !== mandorFilter) return false;
    if (q) {
      const hay = (materialName(db, b.materialId) + ' ' + (b.description || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const groups = useMemo(() => {
    if (!grouped) return [{ key: '__all', label: null, rows: filtered }];
    const map = new Map();
    for (const it of filtered) {
      const k = it.mandorId || '__none';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map.entries()].map(([k, rows]) => ({ key: k, label: mandorName(k), rows }));
  }, [filtered, grouped, db.mandors]);

  if (draft) {
    return (
      <>
        <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1>Bill of Quantities</h1>
            <p className="sub">{project.name} · Draft — shape the plan like a spreadsheet, then finalize</p>
          </div>
          <button className="btn primary" onClick={() => setConfirmingFinalize(true)}>Finalize BoQ</button>
        </div>

        <FilterBar shown={filtered.length} total={items.length} unit="items">
          <ProjectBar embedded />
          <FilterSearch value={q} onChange={setQ} placeholder="Search material or description…" />
        </FilterBar>

        <div className="banner" style={{ background: '#FFFBEB', border: '1px solid #FDE9C8', color: '#92660C', borderRadius: 10, padding: '11px 14px', marginBottom: 14, fontSize: 13.3 }}>
          <b>Draft.</b> Add, edit, and delete rows freely — changes apply as you type. Finalize to lock this as the project’s BoQ and begin raising purchase orders. Ordering stays disabled until then.
        </div>

        <div className="card">
          <div className="card-body flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th><th>Description</th><th>Mandor</th>
                  <th className="num">Qty</th><th>Unit</th><th className="num">Exp. unit cost</th>
                  <th className="num">Needed (day)</th><th className="num">Order by</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <DraftRow key={b.id} b={b} db={db} start={start} onPatch={patchBoqItem} onDelete={deleteBoqItem} />
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9}><div className="empty">{items.length === 0 ? 'Empty BoQ — add the first row.' : 'No rows match your search.'}</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => addBoqItem({ projectId: currentProjectId, materialId: '', description: '', quantity: 0, unit: '', expectedUnitCost: 0, neededDayOffset: 0, mandorId: '' })}>+ Add row</button>
        </div>

        {confirmingFinalize && (
          <Modal title="Finalize BoQ" onClose={() => setConfirmingFinalize(false)}
            footer={<>
              <button className="btn ghost" onClick={() => setConfirmingFinalize(false)}>Cancel</button>
              <button className="btn primary" onClick={() => { finalizeBoq(currentProjectId); setConfirmingFinalize(false); }}>Finalize</button>
            </>}>
            <p style={{ marginTop: 0 }}>Lock <b>{project.name}</b>’s BoQ as the working plan?</p>
            <p className="help" style={{ marginBottom: 0 }}>After finalizing, editing becomes deliberate (via the Edit button) and you can start raising purchase orders against these lines. You can’t return to draft.</p>
          </Modal>
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Bill of Quantities</h1>
          <p className="sub">{project.name} · the material plan — quantity, mandor, and needed day (order day is auto-computed)</p>
        </div>
        <button className="btn primary" onClick={() => setEditItem(null)}>+ Add BoQ item</button>
      </div>

      <FilterBar shown={filtered.length} total={items.length} unit="items">
        <ProjectBar embedded />
        <FilterSearch value={q} onChange={setQ} placeholder="Search material or description…" />
        <FilterSelect value={mandorFilter} onChange={setMandorFilter} allLabel="All mandors"
          options={db.mandors.map((m) => ({ value: m.id, label: m.name }))} />
        <label className="toggle" style={{ whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by mandor
        </label>
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th><th>Description</th>
                <th className="num">Qty</th><th>Unit</th><th className="num">Exp. unit cost</th>
                <th className="num">Needed</th><th className="num">Order by</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Group key={g.key} g={g} db={db} grouped={grouped} start={start}
                  onEdit={setEditItem} onRaisePr={setPrFor} />
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9}><div className="empty">{items.length === 0 ? 'No BoQ items yet. Add the first line item to begin.' : 'No items match these filters.'}</div></td></tr>
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
        <tr className="group-row"><td colSpan={9}>Mandor · {g.label} ({g.rows.length})</td></tr>
      )}
      {g.rows.map((b) => {
        const status = boqLineStatus(db, b.id);
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
            <td className="num">{num(b.quantity)}</td>
            <td>{b.unit}</td>
            <td className="num">{idr(b.expectedUnitCost)}</td>
            <td className="num">
              {needed != null ? <>Day {needed}{neededDate && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(neededDate)}</div>}</> : '—'}
            </td>
            <td className="num">
              {orderDay != null
                ? <>Day {orderDay}<div className="muted" style={{ fontSize: 11 }}>{lead}d lead{b.leadTimeDays != null ? '*' : ''}</div></>
                : <span className="muted">set lead time</span>}
            </td>
            <td>
              {status === 'complete'
                ? <span className="pill" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #D1FAE5' }}>Complete</span>
                : status === 'ordered'
                  ? <span className="pill info">Ordered</span>
                  : <span className="pill gray">Not ordered</span>}
            </td>
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
    if (expectedUnitCost === '' && m.estUnitCost != null) setCost(m.estUnitCost);
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

const CELL = { width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 7, font: 'inherit', fontSize: 13 };

function DraftRow({ b, db, start, onPatch, onDelete }) {
  const lead = b.leadTimeDays != null ? b.leadTimeDays : leadTimeFor(db, b.materialId);
  const neededDate = (start && b.neededDayOffset != null) ? addDays(start, b.neededDayOffset) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const orderDay = dnum(start, orderDate);
  const numOrNull = (v) => (v === '' ? null : Number(v));
  return (
    <tr>
      <td>
        <select className="input" style={{ minWidth: 150 }} value={b.materialId || ''} onChange={(e) => {
          const mid = e.target.value;
          const m = db.materials.find((x) => x.id === mid);
          onPatch(b.id, { materialId: mid, ...(m ? { unit: m.defaultUnit, expectedUnitCost: m.estUnitCost } : {}) });
        }}>
          <option value="">— select —</option>
          {db.materials.map((m) => <option key={m.id} value={m.id}>{m.canonicalName}</option>)}
        </select>
      </td>
      <td><input style={CELL} value={b.description || ''} placeholder="description"
        onChange={(e) => onPatch(b.id, { description: e.target.value })} /></td>
      <td>
        <select className="input" style={{ minWidth: 120 }} value={b.mandorId || ''} onChange={(e) => onPatch(b.id, { mandorId: e.target.value })}>
          <option value="">Unassigned</option>
          {db.mandors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </td>
      <td className="num"><input type="number" style={{ ...CELL, width: 72, textAlign: 'right' }} value={b.quantity ?? ''}
        onChange={(e) => onPatch(b.id, { quantity: numOrNull(e.target.value) ?? 0 })} /></td>
      <td><input style={{ ...CELL, width: 84 }} value={b.unit || ''} placeholder="unit"
        onChange={(e) => onPatch(b.id, { unit: e.target.value })} /></td>
      <td className="num"><input type="number" style={{ ...CELL, width: 112, textAlign: 'right' }} value={b.expectedUnitCost ?? ''}
        onChange={(e) => onPatch(b.id, { expectedUnitCost: numOrNull(e.target.value) ?? 0 })} /></td>
      <td className="num"><input type="number" style={{ ...CELL, width: 72, textAlign: 'right' }} value={b.neededDayOffset ?? ''}
        onChange={(e) => onPatch(b.id, { neededDayOffset: numOrNull(e.target.value) })} /></td>
      <td className="num">{orderDay != null ? <>Day {orderDay}</> : <span className="muted">—</span>}</td>
      <td className="num"><button className="btn sm ghost" style={{ color: 'var(--risk)' }} title="Delete row" onClick={() => onDelete(b.id)}>✕</button></td>
    </tr>
  );
}
