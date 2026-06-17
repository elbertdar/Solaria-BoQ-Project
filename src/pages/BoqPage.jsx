import { useMemo, useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { boqForProject, boqLineStatus, materialName, boqDisplayRows, stagedForProject } from '../engine/reconcile.js';
import { leadTimeFor, projectStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { ProjectBar, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import PrModal from '../components/PrModal.jsx';
import NumberInput from '../components/NumberInput.jsx';
import ComboBox from '../components/ComboBox.jsx';
import { idr, fmtDate, num } from '../engine/format.js';
import BoqModal from '../components/BoqModal.jsx';
import CommitModal from '../components/CommitModal.jsx';
import HistoryView from '../components/HistoryView.jsx';

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
  const [mandorFilter, setMandorFilter] = useState([]);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);

  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  const filtered = items.filter((b) => {
    if (mandorFilter.length && !mandorFilter.includes(b.mandorId || '')) return false;
    if (q) {
      const hay = (materialName(db, b.materialId) + ' ' + (b.description || '')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Working view rows come from the staged-overlay display set (committed + pending changes).
  const work = useMemo(() => {
    const rows = boqDisplayRows(db, currentProjectId).filter((r) => {
      if (mandorFilter.length && !mandorFilter.includes(r.fields.mandorId || '')) return false;
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

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => addBoqItem({ projectId: currentProjectId, budgetBasis: 'quantity', materialId: '', description: '', quantity: 0, unit: '', expectedUnitCost: 0, neededDayOffset: 0, mandorId: '' })}>+ Add row</button>
          <button className="btn ghost" onClick={() => addBoqItem({ projectId: currentProjectId, budgetBasis: 'allowance', materialId: '', description: '', quantity: 0, unit: '', expectedUnitCost: 0, allowanceAmount: 0, neededDayOffset: null, mandorId: '' })}>+ Add allowance</button>
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
  const allow = f.budgetBasis === 'allowance';
  const deleted = r.status === 'deleted';
  const changed = (k) => r.status === 'modified' && r.changedKeys.includes(k);
  const lead = f.leadTimeDays != null ? f.leadTimeDays : leadTimeFor(db, f.materialId);
  const needed = f.neededDayOffset;
  const neededDate = (start && needed != null) ? addDays(start, needed) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
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
      <td className="mat-link"><span style={strike}>{tag}{materialName(db, f.materialId)}{allow && <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>}</span></td>
      <td style={{ ...(changed('description') ? TINT : {}), ...strike }}>{f.description}</td>
      <td className="num" style={changed('quantity') ? TINT : undefined}>{allow ? <span className="muted">—</span> : <><span style={strike}>{num(f.quantity)}</span>{wasNum('quantity', base?.quantity)}</>}</td>
      <td style={{ ...(changed('unit') ? TINT : {}), ...strike }}>{f.unit}</td>
      <td className="num" style={changed('expectedUnitCost') || changed('allowanceAmount') ? TINT : undefined}>
        {allow
          ? <><span style={strike}>{idr(f.allowanceAmount)}</span><div className="muted" style={{ fontSize: 11 }}>allowance</div></>
          : <><span style={strike}>{idr(f.expectedUnitCost)}</span>{changed('expectedUnitCost') && base ? <div className="muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{idr(base.expectedUnitCost)}</div> : null}</>}
      </td>
      <td className="num" style={changed('neededDayOffset') ? TINT : undefined}>
        {allow ? <span className="muted">—</span> : <>
          <span style={strike}>{needed != null ? <>Day {needed}{neededDate && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(neededDate)}</div>}</> : '—'}</span>
          {wasNum('neededDayOffset', base?.neededDayOffset)}
        </>}
      </td>
      <td className="num" style={strike}>
        {allow ? <span className="muted">—</span> : orderDate
          ? <>{fmtDate(orderDate)}<div className="muted" style={{ fontSize: 11 }}>{lead}d lead{f.leadTimeDays != null ? '*' : ''}</div></>
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


const CELL = { width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 7, font: 'inherit', fontSize: 13 };

function DraftRow({ b, db, start, onPatch, onDelete }) {
  const { addMaterial, addMandor } = useStore();
  const allow = b.budgetBasis === 'allowance';
  const lead = b.leadTimeDays != null ? b.leadTimeDays : leadTimeFor(db, b.materialId);
  const neededDate = (start && b.neededDayOffset != null) ? addDays(start, b.neededDayOffset) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const numOrNull = (v) => (v === '' ? null : Number(v));
  const dash = <span className="muted">—</span>;
  return (
    <tr>
      <td>
        {allow && <div className="pill info" style={{ fontSize: 10, marginBottom: 4, display: 'inline-block' }}>Allowance</div>}
        <ComboBox value={b.materialId || ''} style={{ minWidth: 150 }} placeholder="Material…"
          options={db.materials.map((m) => ({ id: m.id, label: m.canonicalName }))}
          onPick={(mid) => {
            const m = db.materials.find((x) => x.id === mid);
            onPatch(b.id, { materialId: mid, ...(m ? { unit: m.defaultUnit, ...(b.description ? {} : { description: m.canonicalName }), ...(allow ? {} : { expectedUnitCost: m.estUnitCost }) } : {}) });
          }}
          onCreate={(q) => {
            const id = addMaterial({ canonicalName: q.trim(), defaultUnit: b.unit || 'pcs', materialTypeId: db.materialTypes[0]?.id, leadTimeDays: 7 });
            onPatch(b.id, { materialId: id, unit: b.unit || 'pcs', ...(b.description ? {} : { description: q.trim() }) });
            return id;
          }}
          createLabel={(q) => `➕ Create “${q}”`} />
      </td>
      <td><input style={CELL} value={b.description || ''} placeholder="description"
        onChange={(e) => onPatch(b.id, { description: e.target.value })} /></td>
      <td>
        <ComboBox value={b.mandorId || ''} style={{ minWidth: 120 }} placeholder="Mandor…" noneLabel="Unassigned"
          options={db.mandors.map((m) => ({ id: m.id, label: m.name }))}
          onPick={(mid) => onPatch(b.id, { mandorId: mid })}
          onCreate={(q) => { const id = addMandor(q.trim()); onPatch(b.id, { mandorId: id }); return id; }}
          createLabel={(q) => `➕ Add “${q}”`} />
      </td>
      <td className="num">{allow ? dash : <NumberInput allowDecimal style={{ ...CELL, width: 72, textAlign: 'right' }} value={b.quantity ?? ''}
        onChange={(v) => onPatch(b.id, { quantity: v === '' ? 0 : v })} />}</td>
      <td><input style={{ ...CELL, width: 84 }} value={b.unit || ''} placeholder="unit"
        onChange={(e) => onPatch(b.id, { unit: e.target.value })} /></td>
      <td className="num">{allow
        ? <NumberInput style={{ ...CELL, width: 112, textAlign: 'right' }} value={b.allowanceAmount ?? ''} placeholder="lump sum"
            onChange={(v) => onPatch(b.id, { allowanceAmount: v === '' ? 0 : v })} />
        : <NumberInput style={{ ...CELL, width: 112, textAlign: 'right' }} value={b.expectedUnitCost ?? ''}
            onChange={(v) => onPatch(b.id, { expectedUnitCost: v === '' ? 0 : v })} />}</td>
      <td className="num">{allow ? dash : <input type="number" style={{ ...CELL, width: 72, textAlign: 'right' }} value={b.neededDayOffset ?? ''}
        onChange={(e) => onPatch(b.id, { neededDayOffset: numOrNull(e.target.value) })} />}</td>
      <td className="num">{allow ? dash : orderDate ? <>{fmtDate(orderDate)}</> : <span className="muted">—</span>}</td>
      <td className="num"><button className="btn sm ghost" style={{ color: 'var(--risk)' }} title="Delete row" onClick={() => onDelete(b.id)}>✕</button></td>
    </tr>
  );
}
