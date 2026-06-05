import { useMemo, useState, Fragment } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { boqForProject, boqLineStatus, materialName, boqDisplayRows, stagedForProject, changeFields, prsForBoqItem, BOQ_FIELDS } from '../engine/reconcile.js';
import { suggestMaterials, resolveMaterial } from '../engine/match.js';
import { leadTimeFor, projectStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { ProjectBar, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import PrModal from '../components/PrModal.jsx';
import { idr, fmtDate, num } from '../engine/format.js';

const dnum = (start, date) => (start && date ? Math.round((date - start) / 86400000) : null);

export default function BoqPage() {
  const { db, currentProjectId, patchBoqItem, addBoqItem, deleteBoqItem, finalizeBoq,
    unstageBoq, discardBoqStaged, commitBoqStaged } = useStore();
  const project = useProject();
  const draft = project?.boqStatus !== 'working';
  const items = boqForProject(db, currentProjectId);
  const start = projectStart(db, currentProjectId);
  const staged = stagedForProject(db, currentProjectId);
  const projectEdits = (db.boqEdits || []).filter((e) => e.projectId === currentProjectId).slice().reverse();

  const [grouped, setGrouped] = useState(true);
  const [editItem, setEditItem] = useState(undefined);
  const [prFor, setPrFor] = useState(null);
  const [q, setQ] = useState('');
  const [mandorFilter, setMandorFilter] = useState('');
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);

  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  const filtered = items.filter((b) => {
    if (mandorFilter && (b.mandorId || '') !== mandorFilter) return false;
    if (q) {
      const hay = (materialName(db, b.materialId) + ' ' + (b.description || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Working view rows come from the staged-overlay display set (committed + pending changes).
  const work = useMemo(() => {
    const rows = boqDisplayRows(db, currentProjectId).filter((r) => {
      if (mandorFilter && (r.fields.mandorId || '') !== mandorFilter) return false;
      if (q) {
        const hay = (materialName(db, r.fields.materialId) + ' ' + (r.fields.description || '')).toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    if (!grouped) return { rows, groups: [{ key: '__all', label: null, rows }] };
    const map = new Map();
    for (const r of rows) { const k = r.fields.mandorId || '__none'; if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
    return { rows, groups: [...map.entries()].map(([k, rs]) => ({ key: k, label: mandorName(k), rows: rs })) };
  }, [db.boqItems, db.boqStaged, db.materials, db.mandors, currentProjectId, q, mandorFilter, grouped]);

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
          <p className="sub">{project.name} · the material plan — edits are staged, then committed together</p>
        </div>
        {!showHistory && <button className="btn primary" onClick={() => setEditItem(null)}>+ Add BoQ item</button>}
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={!showHistory ? 'active' : ''} onClick={() => setShowHistory(false)}>Items</button>
        <button className={showHistory ? 'active' : ''} onClick={() => setShowHistory(true)}>Edit history{projectEdits.length ? ` (${projectEdits.length})` : ''}</button>
      </div>

      {showHistory ? (
        <HistoryView edits={projectEdits} db={db} />
      ) : (
        <>
          <FilterBar shown={work.rows.length} total={boqDisplayRows(db, currentProjectId).length} unit="items">
            <ProjectBar embedded />
            <FilterSearch value={q} onChange={setQ} placeholder="Search material or description…" />
            <FilterSelect value={mandorFilter} onChange={setMandorFilter} allLabel="All mandors"
              options={db.mandors.map((m) => ({ value: m.id, label: m.name }))} />
            <label className="toggle" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
              Group by mandor
            </label>
          </FilterBar>

          {staged.length > 0 && (
            <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <b>{staged.length} uncommitted change{staged.length > 1 ? 's' : ''}</b>
              <span style={{ opacity: 0.85 }}>— staged on the plan, not yet committed.</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                {discardArmed ? (
                  <>
                    <span style={{ color: 'var(--risk)' }}>Discard all?</span>
                    <button className="btn sm danger" onClick={() => { discardBoqStaged(currentProjectId); setDiscardArmed(false); }}>Confirm discard</button>
                    <button className="btn sm ghost" onClick={() => setDiscardArmed(false)}>Keep</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm ghost" onClick={() => setDiscardArmed(true)}>Discard</button>
                    <button className="btn sm primary" onClick={() => setCommitting(true)}>Review &amp; commit</button>
                  </>
                )}
              </span>
            </div>
          )}

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
                  {work.groups.map((g) => (
                    <Group key={g.key} g={g} db={db} grouped={grouped} start={start}
                      onEdit={(r) => setEditItem({ ...r.fields, __ref: r.ref, __isAdd: !!r.isStagedAdd })}
                      onRaisePr={(r) => setPrFor(db.boqItems.find((b) => b.id === r.id))}
                      onUndo={(r) => unstageBoq(currentProjectId, r.ref)} />
                  ))}
                  {work.rows.length === 0 && (
                    <tr><td colSpan={9}><div className="empty">{items.length === 0 && staged.length === 0 ? 'No BoQ items yet. Add the first line item to begin.' : 'No items match these filters.'}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editItem !== undefined && <BoqModal item={editItem} onClose={() => setEditItem(undefined)} />}
      {prFor && <PrModal boqItem={prFor} onClose={() => setPrFor(null)} />}
      {committing && <CommitModal db={db} staged={staged} projectId={currentProjectId}
        onCommit={(msg) => { commitBoqStaged(currentProjectId, msg); setCommitting(false); }}
        onClose={() => setCommitting(false)} />}
    </>
  );
}

function Group({ g, db, grouped, start, onEdit, onRaisePr, onUndo }) {
  return (
    <>
      {grouped && g.label && (
        <tr className="group-row"><td colSpan={9}>Mandor · {g.label} ({g.rows.length})</td></tr>
      )}
      {g.rows.map((r) => <Row key={r.key} r={r} db={db} start={start} onEdit={onEdit} onRaisePr={onRaisePr} onUndo={onUndo} />)}
    </>
  );
}

const TINT = { background: '#FFFBEB' }; // changed-cell highlight

function Row({ r, db, start, onEdit, onRaisePr, onUndo }) {
  const f = r.fields, base = r.base;
  const deleted = r.status === 'deleted';
  const changed = (k) => r.status === 'modified' && r.changedKeys.includes(k);
  const lead = f.leadTimeDays != null ? f.leadTimeDays : leadTimeFor(db, f.materialId);
  const needed = f.neededDayOffset;
  const neededDate = (start && needed != null) ? addDays(start, needed) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const orderDay = dnum(start, orderDate);
  const rowStyle = r.status === 'added' ? { background: '#F0FDF4' } : deleted ? { opacity: 0.55 } : undefined;
  const strike = deleted ? { textDecoration: 'line-through' } : undefined;
  const wasNum = (k, prev) => changed(k) && base && (base[k] ?? null) !== (f[k] ?? null)
    ? <div className="muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{prev}</div> : null;
  const tag = r.status === 'added' ? <span className="pill" style={{ background: '#ECFDF5', color: '#15803D', border: '1px solid #D1FAE5', marginRight: 6, fontSize: 11 }}>New</span>
    : r.status === 'modified' ? <span className="pill" style={{ background: '#FEF3C7', color: '#92660C', border: '1px solid #FDE68A', marginRight: 6, fontSize: 11 }}>Edited</span>
      : deleted ? <span className="pill" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', marginRight: 6, fontSize: 11 }}>Removing</span>
        : null;

  return (
    <tr style={rowStyle}>
      <td className="mat-link"><span style={strike}>{tag}{materialName(db, f.materialId)}</span></td>
      <td style={{ ...(changed('description') ? TINT : {}), ...strike }}>{f.description}</td>
      <td className="num" style={changed('quantity') ? TINT : undefined}><span style={strike}>{num(f.quantity)}</span>{wasNum('quantity', base?.quantity)}</td>
      <td style={{ ...(changed('unit') ? TINT : {}), ...strike }}>{f.unit}</td>
      <td className="num" style={changed('expectedUnitCost') ? TINT : undefined}><span style={strike}>{idr(f.expectedUnitCost)}</span>{changed('expectedUnitCost') && base ? <div className="muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{idr(base.expectedUnitCost)}</div> : null}</td>
      <td className="num" style={changed('neededDayOffset') ? TINT : undefined}>
        <span style={strike}>{needed != null ? <>Day {needed}{neededDate && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(neededDate)}</div>}</> : '—'}</span>
        {wasNum('neededDayOffset', base?.neededDayOffset)}
      </td>
      <td className="num" style={strike}>
        {orderDay != null
          ? <>Day {orderDay}<div className="muted" style={{ fontSize: 11 }}>{lead}d lead{f.leadTimeDays != null ? '*' : ''}</div></>
          : <span className="muted">set lead time</span>}
      </td>
      <td>
        {(r.status === 'added' || deleted)
          ? <span className="muted" style={{ fontSize: 12 }}>—</span>
          : boqLineStatus(db, r.id) === 'complete'
            ? <span className="pill" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #D1FAE5' }}>Complete</span>
            : boqLineStatus(db, r.id) === 'ordered'
              ? <span className="pill info">Ordered</span>
              : <span className="pill gray">Not ordered</span>}
      </td>
      <td className="num" style={{ whiteSpace: 'nowrap' }}>
        {deleted ? (
          <button className="btn sm ghost" onClick={() => onUndo(r)}>Undo</button>
        ) : r.status === 'added' ? (
          <>
            <button className="btn sm ghost" onClick={() => onEdit(r)}>Edit</button>{' '}
            <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => onUndo(r)}>Remove</button>
          </>
        ) : (
          <>
            <button className="btn sm ghost" onClick={() => onEdit(r)}>Edit</button>{' '}
            <button className="btn sm" onClick={() => onRaisePr(r)}>Raise PR</button>
          </>
        )}
      </td>
    </tr>
  );
}

function BoqModal({ item, onClose }) {
  const { db, currentProjectId, addMaterial, addMandor, stageBoqAdd, stageBoqModify, editStagedAdd, stageBoqDelete, unstageBoq } = useStore();
  const editing = !!item;
  const isAdd = !!item?.__isAdd;
  const linkedPrs = (editing && !isAdd) ? prsForBoqItem(db, item.id) : [];
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
            <span style={{ marginRight: 'auto', color: 'var(--risk)', fontSize: 13 }}>
              {isAdd ? 'Discard this new row?' : linkedPrs.length ? `Remove this line and its ${linkedPrs.length} linked PR${linkedPrs.length > 1 ? 's' : ''}?` : 'Stage this line for removal?'}
            </span>
            <button className="btn ghost" onClick={() => setConfirmingDelete(false)}>Keep</button>
            <button className="btn danger" onClick={() => {
              if (isAdd) unstageBoq(currentProjectId, { tempId: item.id });
              else stageBoqDelete(currentProjectId, item.id);
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

// Render a BoQ field value by kind (shared by the commit modal + history view).
function fmtVal(db, kind, v) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (kind === 'material') return materialName(db, v);
  if (kind === 'mandor') return db.mandors.find((m) => m.id === v)?.name || 'Unassigned';
  if (kind === 'money') return idr(v);
  if (kind === 'day') return `Day ${v}`;
  return String(v);
}

function CommitModal({ db, staged, projectId, onCommit, onClose }) {
  const [message, setMessage] = useState('');
  const byId = Object.fromEntries(db.boqItems.map((b) => [b.id, b]));
  const fieldMap = Object.fromEntries(BOQ_FIELDS.map((f) => [f.key, f]));
  const adds = staged.filter((s) => s.type === 'add');
  const mods = staged.filter((s) => s.type === 'modify');
  const dels = staged.filter((s) => s.type === 'delete');

  return (
    <Modal title={`Commit ${staged.length} change${staged.length > 1 ? 's' : ''}`} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onCommit(message)}>Commit changes</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mods.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Modified ({mods.length})</div>
            {mods.map((s) => { const b = byId[s.boqItemId]; return (
              <div key={s.boqItemId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b>{materialName(db, b?.materialId)}</b>
                <div style={{ marginTop: 4, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.keys(s.patch).filter((k) => fieldMap[k]).map((k) => (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <span className="muted" style={{ minWidth: 112 }}>{fieldMap[k].label}</span>
                      <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtVal(db, fieldMap[k].kind, b?.[k])}</span>
                      <span>→</span>
                      <b>{fmtVal(db, fieldMap[k].kind, s.patch[k])}</b>
                    </div>
                  ))}
                </div>
              </div>
            ); })}
          </div>
        )}
        {adds.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Added ({adds.length})</div>
            {adds.map((s) => (
              <div key={s.tempId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b>{materialName(db, s.fields.materialId)}</b>
                <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                  {num(s.fields.quantity)} {s.fields.unit} · {idr(s.fields.expectedUnitCost)} · needed day {s.fields.neededDayOffset ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}
        {dels.length > 0 && (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Removed ({dels.length})</div>
            {dels.map((s) => { const b = byId[s.boqItemId]; const prs = prsForBoqItem(db, s.boqItemId); return (
              <div key={s.boqItemId} className="chip" style={{ display: 'block', padding: '8px 10px', marginBottom: 6 }}>
                <b style={{ textDecoration: 'line-through' }}>{materialName(db, b?.materialId)}</b>
                {prs.length > 0 && <span style={{ marginLeft: 8, color: 'var(--risk)', fontSize: 13 }}>⚠ also removes {prs.length} linked PR{prs.length > 1 ? 's' : ''}</span>}
              </div>
            ); })}
          </div>
        )}
        <div>
          <label className="lbl">Commit message <span className="muted">(optional)</span></label>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Revised quantities after site survey" />
          <div className="help">Saved to the edit history, attributed to {db.currentUser?.name}.</div>
        </div>
      </div>
    </Modal>
  );
}

function HistoryView({ edits, db }) {
  const [open, setOpen] = useState(null);
  if (edits.length === 0) {
    return <div className="card"><div className="card-body"><div className="empty">No edits committed yet. Changes you stage and commit will appear here.</div></div></div>;
  }
  return (
    <div className="card">
      <div className="card-body flush">
        <table className="table">
          <thead><tr><th>When</th><th>By</th><th>Summary</th><th className="num">Changes</th><th></th></tr></thead>
          <tbody>
            {edits.map((e) => {
              const isOpen = open === e.id;
              const counts = { add: 0, modify: 0, delete: 0 };
              for (const c of e.changes) counts[c.type]++;
              const summary = [counts.add && `${counts.add} added`, counts.modify && `${counts.modify} modified`, counts.delete && `${counts.delete} removed`].filter(Boolean).join(' · ');
              return (
                <Fragment key={e.id}>
                  <tr className="clickable" onClick={() => setOpen(isOpen ? null : e.id)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(new Date(e.at))}<div className="muted" style={{ fontSize: 11 }}>{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></td>
                    <td>{e.author?.name || '—'}</td>
                    <td>{e.message ? e.message : <span className="muted">{summary || 'No message'}</span>}</td>
                    <td className="num">{e.changes.length}</td>
                    <td className="num">{isOpen ? '▾' : '▸'}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={5} style={{ background: '#F8FAFC' }}>
                      <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {e.message && <div className="muted" style={{ fontSize: 12 }}>{summary}</div>}
                        {e.changes.map((c, i) => (
                          <div key={i} style={{ fontSize: 13 }}>
                            <span className="pill" style={{ marginRight: 8, fontSize: 11, ...(c.type === 'add' ? { background: '#ECFDF5', color: '#15803D' } : c.type === 'delete' ? { background: '#FEF2F2', color: '#B91C1C' } : { background: '#FEF3C7', color: '#92660C' }) }}>{c.type}</span>
                            <b>{materialName(db, (c.after || c.before)?.materialId)}</b>
                            {c.type === 'modify' && (
                              <span style={{ marginLeft: 8 }}>
                                {changeFields(c).map((f) => (
                                  <span key={f.key} style={{ marginRight: 10 }}>
                                    {f.label}: <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{fmtVal(db, f.kind, f.before)}</span> → <b>{fmtVal(db, f.kind, f.after)}</b>
                                  </span>
                                ))}
                              </span>
                            )}
                            {c.type === 'add' && <span className="muted" style={{ marginLeft: 8 }}>{num(c.after.quantity)} {c.after.unit} · {idr(c.after.expectedUnitCost)}</span>}
                          </div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
