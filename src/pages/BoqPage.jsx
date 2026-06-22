import { useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore, useProject, useProjectPhases } from '../store/StoreContext.jsx';
import { boqForProject, boqLineStatus, materialName, boqDisplayRows, stagedForProject } from '../engine/reconcile.js';
import { groupIdentical } from '../components/boqShared.jsx';
import { leadTimeFor, projectStart, phaseStart, addDays, addBusinessDays } from '../engine/schedule.js';
import { FilterBar, FilterSearch, FilterSelect, ProjectBar } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import PrModal from '../components/PrModal.jsx';
import NumberInput from '../components/NumberInput.jsx';
import ComboBox from '../components/ComboBox.jsx';
import { idr, fmtDate, num } from '../engine/format.js';
import BoqModal from '../components/BoqModal.jsx';
import CommitModal from '../components/CommitModal.jsx';
import HistoryView from '../components/HistoryView.jsx';
import ManagePhasesModal from '../components/ManagePhasesModal.jsx';
import DataToolbar from '../components/DataToolbar.jsx';

const plannedOf = (b) => b.budgetBasis === 'allowance' ? (b.allowanceAmount || 0) : (b.quantity || 0) * (b.expectedUnitCost || 0);

// The BoQ is drafted in phases, all on this one page: each phase is its own editable block
// (draft spreadsheet, or staged working table once finalized), with "+ Add phase" at the
// bottom and "Manage phases" (rename / reorder / delete) in the header. One filter bar spans
// every block.
export default function BoqPage() {
  const { db, currentProjectId, patchBoqItem, addBoqItem, softDeleteBoqItem, finalizePhase,
    unstageBoq, discardBoqStaged, commitBoqStaged, addPhase, setPhaseStart } = useStore();
  const project = useProject();
  const phases = useProjectPhases();
  const start = projectStart(db, currentProjectId);
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  const [q, setQ] = useState('');
  const [mandorFilter, setMandorFilter] = useState([]);
  const [grouped, setGrouped] = useState(true);

  const [boqModal, setBoqModal] = useState(null);        // { item, phaseId } | null
  const [prFor, setPrFor] = useState(null);
  const [committingPhase, setCommittingPhase] = useState(null);
  const [finalizingPhase, setFinalizingPhase] = useState(null);
  const [managePhases, setManagePhases] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');

  const addPhaseNow = () => { const n = newPhaseName.trim(); if (!n) return; addPhase(currentProjectId, n); setNewPhaseName(''); };

  const norm = q.trim().toLowerCase();
  const matchF = (f) => (!mandorFilter.length || mandorFilter.includes(f.mandorId || ''))
    && (!norm || (materialName(db, f.materialId) + ' ' + (f.description || '')).toLowerCase().includes(norm));

  // page-wide counts across every phase (committed + staged display rows)
  const allRows = phases.flatMap((ph) => boqDisplayRows(db, currentProjectId, ph.id));
  const shownCount = allRows.filter((r) => matchF(r.fields)).length;

  const committingStaged = committingPhase ? stagedForProject(db, currentProjectId, committingPhase) : [];
  const finalizing = finalizingPhase ? phases.find((p) => p.id === finalizingPhase) : null;

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Bill of Quantities</h1>
          <p className="sub">{project.name} · drafted in phases — edit each below, finalize when ready</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <DataToolbar entity="boq" rows={boqForProject(db, currentProjectId)} context={{ currentProjectId }} />
          <button className="btn ghost" onClick={() => setManagePhases(true)}>Manage phases</button>
        </div>
      </div>

      <FilterBar shown={shownCount} total={allRows.length} unit="items">
        <ProjectBar embedded />
        <FilterSearch value={q} onChange={setQ} placeholder="Search material or description…" />
        <FilterSelect value={mandorFilter} onChange={setMandorFilter} allLabel="All mandors"
          options={db.mandors.map((m) => ({ value: m.id, label: m.name }))} />
        <label className="toggle" style={{ whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          Group by mandor
        </label>
      </FilterBar>

      {phases.map((ph, i) => (
        <PhaseBlock key={ph.id} phase={ph} db={db} start={start} isFirst={i === 0} onSetStart={(date) => setPhaseStart(ph.id, date)} matchF={matchF} grouped={grouped} mandorName={mandorName}
          onPatch={patchBoqItem} onAddItem={addBoqItem} onDeleteItem={softDeleteBoqItem}
          onEdit={(item) => setBoqModal({ item, phaseId: ph.id })}
          onAdd={() => setBoqModal({ item: null, phaseId: ph.id })}
          onRaisePr={(item) => setPrFor(item)}
          onUndo={(ref) => unstageBoq(ph.id, ref)}
          onDiscard={() => discardBoqStaged(ph.id)}
          onCommit={() => setCommittingPhase(ph.id)}
          onFinalize={() => setFinalizingPhase(ph.id)} />
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 30, maxWidth: 440 }}>
        <input className="input" value={newPhaseName} placeholder="New phase name — e.g. Interior fit-out" style={{ flex: 1 }}
          onChange={(e) => setNewPhaseName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPhaseNow(); }} />
        <button className="btn primary" onClick={addPhaseNow} disabled={!newPhaseName.trim()}>+ Add phase</button>
      </div>

      {boqModal && <BoqModal item={boqModal.item} phaseId={boqModal.phaseId} onClose={() => setBoqModal(null)} />}
      {prFor && <PrModal boqItem={prFor} onClose={() => setPrFor(null)} />}
      {committingPhase && <CommitModal db={db} staged={committingStaged} projectId={currentProjectId}
        onCommit={(msg, keys) => { commitBoqStaged(committingPhase, msg, keys); setCommittingPhase(null); }}
        onClose={() => setCommittingPhase(null)} />}
      {managePhases && <ManagePhasesModal onClose={() => setManagePhases(false)} />}
      {finalizing && (
        <Modal title="Finalize phase" onClose={() => setFinalizingPhase(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setFinalizingPhase(null)}>Cancel</button>
            <button className="btn primary" onClick={() => { finalizePhase(finalizing.id); setFinalizingPhase(null); }}>Finalize</button>
          </>}>
          <p style={{ marginTop: 0 }}>Lock <b>{project.name} &middot; {finalizing.name}</b> as a working plan?</p>
          <p className="help" style={{ marginBottom: 0 }}>After finalizing, edits to this phase are staged then committed, and you can raise purchase orders against its lines. You can&rsquo;t return it to draft.</p>
        </Modal>
      )}
    </>
  );
}

// One phase, fully editable inline. Draft → live spreadsheet; Working → committed + staged table.
function PhaseBlock({ phase, db, start, isFirst, onSetStart, matchF, grouped, mandorName, onPatch, onAddItem, onDeleteItem, onEdit, onAdd, onRaisePr, onUndo, onDiscard, onCommit, onFinalize }) {
  const draft = phase.boqStatus !== 'working';
  const [showHistory, setShowHistory] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [highlightIds, setHighlightIds] = useState(null); // rows changed by the selected edit-history entry
  const pid = phase.projectId;
  const anchor = phaseStart(db, phase.id) || start;   // day-0 for this phase's items (phase start if set)
  const projStartStr = db.projects.find((p) => p.id === pid)?.startDate || '';

  const allItems = boqForProject(db, pid, phase.id);
  const planned = allItems.reduce((s, b) => s + plannedOf(b), 0);

  const head = (
    <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className="pdot" style={{ width: 8, height: 8, borderRadius: '50%', background: draft ? 'var(--muted)' : 'var(--ok)' }} />
      <h2 style={{ margin: 0 }}>{phase.name}</h2>
      <span className={'pill ' + (draft ? 'gray' : 'ok')}>{draft ? 'Draft' : 'Working'}</span>
      <span className="muted" style={{ fontSize: 12.5 }}>{allItems.length} item{allItems.length === 1 ? '' : 's'} &middot; {idr(planned)} planned</span>
      {!isFirst && (
        <span className="field-inline" style={{ fontSize: 12.5 }} title="This phase begins on this date — its needed/order days count from here. Blank = the project start.">
          <span className="muted">Starts</span>
          <input type="date" value={phase.startDate || ''} min={projStartStr || undefined}
            onChange={(e) => onSetStart(e.target.value)} style={{ width: 150, padding: '4px 8px', fontSize: 12.5 }} />
          {!phase.startDate && <span className="muted">= project start</span>}
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {draft
          ? <button className="btn sm primary" disabled={allItems.length === 0} onClick={onFinalize} title={allItems.length === 0 ? 'Add at least one item first' : 'Finalize this phase'}>Finalize phase</button>
          : <button className="btn sm primary" onClick={onAdd}>+ Add item</button>}
      </span>
    </div>
  );

  if (draft) {
    const items = allItems.filter((b) => matchF(b));
    const groups = groupIdentical(items);
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        {head}
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
              {groups.map((g) => g.items.length > 1
                ? <DraftGroup key={g.key} items={g.items} db={db} start={anchor} mandorName={mandorName} onPatch={onPatch} onDelete={onDeleteItem} />
                : <DraftRow key={g.items[0].id} b={g.items[0]} db={db} start={anchor} onPatch={onPatch} onDelete={onDeleteItem} />)}
              {items.length === 0 && (
                <tr><td colSpan={9}><div className="empty">{allItems.length === 0 ? 'Empty phase — add the first row.' : 'No rows match your search.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
          <button className="btn" onClick={() => onAddItem({ projectId: pid, phaseId: phase.id, budgetBasis: 'quantity', materialId: '', description: '', quantity: 0, unit: '', expectedUnitCost: 0, neededDayOffset: 0, mandorId: '' })}>+ Add row</button>
          <button className="btn ghost" onClick={() => onAddItem({ projectId: pid, phaseId: phase.id, budgetBasis: 'allowance', materialId: '', description: '', quantity: 0, unit: '', expectedUnitCost: 0, allowanceAmount: 0, neededDayOffset: null, mandorId: '' })}>+ Add allowance</button>
        </div>
      </div>
    );
  }

  // working phase
  const staged = stagedForProject(db, pid, phase.id);
  const rows = boqDisplayRows(db, pid, phase.id).filter((r) => matchF(r.fields));
  const groups = grouped
    ? (() => { const m = new Map(); for (const r of rows) { const k = r.fields.mandorId || '__none'; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m.entries()].map(([k, rs]) => ({ key: k, label: mandorName(k), rows: rs })); })()
    : [{ key: '__all', label: null, rows }];
  const phaseEdits = (db.boqEdits || []).filter((e) => e.phaseId === phase.id).slice().reverse();

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {head}
      {staged.length > 0 && (
        <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '9px 14px', margin: '0 14px 12px', fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>{staged.length} uncommitted change{staged.length > 1 ? 's' : ''}</b>
          <span style={{ opacity: 0.85 }}>— staged, not yet committed.</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {discardArmed ? (
              <>
                <span style={{ color: 'var(--risk)' }}>Discard all?</span>
                <button className="btn sm danger" onClick={() => { onDiscard(); setDiscardArmed(false); }}>Confirm discard</button>
                <button className="btn sm ghost" onClick={() => setDiscardArmed(false)}>Keep</button>
              </>
            ) : (
              <>
                <button className="btn sm ghost" onClick={() => setDiscardArmed(true)}>Discard</button>
                <button className="btn sm primary" onClick={onCommit}>Review &amp; commit</button>
              </>
            )}
          </span>
        </div>
      )}
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
              <Group key={g.key} g={g} db={db} grouped={grouped} start={anchor} highlightIds={highlightIds}
                onEdit={(r) => onEdit({ ...r.fields, __ref: r.ref, __isAdd: !!r.isStagedAdd })}
                onRaisePr={(r) => onRaisePr(db.boqItems.find((b) => b.id === r.id))}
                onUndo={(r) => onUndo(r.ref)} />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9}><div className="empty">{allItems.length === 0 && staged.length === 0 ? 'No items yet. Use “+ Add item”.' : 'No items match these filters.'}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {phaseEdits.length > 0 && (
        <div style={{ padding: '8px 14px 12px' }}>
          <button className="btn sm ghost" onClick={() => { setShowHistory((v) => !v); setHighlightIds(null); }}>{showHistory ? 'Hide' : 'Show'} edit history ({phaseEdits.length})</button>
          {showHistory && <div style={{ marginTop: 10 }}><HistoryView edits={phaseEdits} db={db} onSelectEdit={setHighlightIds} /></div>}
        </div>
      )}
    </div>
  );
}


function Group({ g, db, grouped, start, highlightIds, onEdit, onRaisePr, onUndo }) {
  // Cluster identical lines. Only collapse a group when every member is unchanged (committed) —
  // staged add/modify/delete rows always render individually so their state stays visible.
  const subgroups = groupIdentical(g.rows, (r) => r.fields);
  return (
    <>
      {grouped && g.label && (
        <tr className="group-row"><td colSpan={9}>Mandor · {g.label} ({g.rows.length})</td></tr>
      )}
      {subgroups.map((sg) => {
        const collapsible = sg.items.length > 1 && sg.items.every((r) => r.status === 'unchanged');
        if (collapsible) return <WorkingGroup key={sg.key} rows={sg.items} db={db} start={start} highlightIds={highlightIds} onEdit={onEdit} onRaisePr={onRaisePr} onUndo={onUndo} />;
        return sg.items.map((r) => <Row key={r.key} r={r} db={db} start={start} highlighted={!!highlightIds?.includes(r.id)} onEdit={onEdit} onRaisePr={onRaisePr} onUndo={onUndo} />);
      })}
    </>
  );
}

// Combined summary row for a run of identical working-phase lines — summed quantity, an
// "N entries" badge, and a rolled-up status. Expand to the individual lines (edit / raise PR).
function WorkingGroup({ rows, db, start, highlightIds, onEdit, onRaisePr, onUndo }) {
  const [open, setOpen] = useState(false);
  const containsHighlight = rows.some((r) => highlightIds?.includes(r.id));
  const isOpen = open || containsHighlight; // auto-expand when a contained row is the changed one
  const f = rows[0].fields;
  const allow = f.budgetBasis === 'allowance';
  const totalQty = rows.reduce((s, r) => s + (Number(r.fields.quantity) || 0), 0);
  const totalAllow = rows.reduce((s, r) => s + (Number(r.fields.allowanceAmount) || 0), 0);
  const lead = f.leadTimeDays != null ? f.leadTimeDays : leadTimeFor(db, f.materialId);
  const neededDate = (start && f.neededDayOffset != null) ? addDays(start, f.neededDayOffset) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const statuses = rows.map((r) => boqLineStatus(db, r.id));
  const rollup = statuses.every((s) => s === 'complete') ? 'complete'
    : statuses.some((s) => s === 'ordered' || s === 'complete') ? 'ordered' : 'none';
  const dash = <span className="muted">—</span>;
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} style={containsHighlight ? HILITE : { background: '#F1F5F9' }} title="Identical lines — expand to edit each">
        <td className="mat-link"><b>{materialName(db, f.materialId)}</b> <span className="pill gray" style={{ fontSize: 11, marginLeft: 6 }}>{rows.length} entries</span>{allow && <span className="pill info" style={{ marginLeft: 6, fontSize: 11 }}>Allowance</span>}</td>
        <td>{f.description}</td>
        <td className="num">{allow ? dash : num(totalQty)}</td>
        <td>{f.unit}</td>
        <td className="num">{allow ? idr(totalAllow) : idr(f.expectedUnitCost)}</td>
        <td className="num">{allow ? dash : (f.neededDayOffset != null ? `Day ${f.neededDayOffset}` : dash)}</td>
        <td className="num">{allow ? dash : orderDate ? fmtDate(orderDate) : dash}</td>
        <td>{rollup === 'complete'
          ? <span className="pill" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #D1FAE5' }}>Complete</span>
          : rollup === 'ordered' ? <span className="pill info">Ordered</span> : <span className="pill gray">Not ordered</span>}</td>
        <td className="num muted">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
      </tr>
      {isOpen && rows.map((r) => <Row key={r.key} r={r} db={db} start={start} highlighted={!!highlightIds?.includes(r.id)} onEdit={onEdit} onRaisePr={onRaisePr} onUndo={onUndo} grouped />)}
    </>
  );
}

// Same idea for the draft (inline-editable) table — expand to the editable rows.
function DraftGroup({ items, db, start, mandorName, onPatch, onDelete }) {
  const [open, setOpen] = useState(false);
  const f = items[0];
  const allow = f.budgetBasis === 'allowance';
  const totalQty = items.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
  const totalAllow = items.reduce((s, b) => s + (Number(b.allowanceAmount) || 0), 0);
  const lead = f.leadTimeDays != null ? f.leadTimeDays : leadTimeFor(db, f.materialId);
  const neededDate = (start && f.neededDayOffset != null) ? addDays(start, f.neededDayOffset) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const dash = <span className="muted">—</span>;
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} style={{ background: '#F1F5F9' }} title="Identical lines — expand to edit each">
        <td>{allow && <span className="pill info" style={{ fontSize: 10, marginRight: 6 }}>Allowance</span>}<b>{materialName(db, f.materialId)}</b> <span className="pill gray" style={{ fontSize: 11, marginLeft: 6 }}>{items.length} entries</span></td>
        <td>{f.description}</td>
        <td>{mandorName(f.mandorId)}</td>
        <td className="num">{allow ? dash : num(totalQty)}</td>
        <td>{f.unit}</td>
        <td className="num">{allow ? idr(totalAllow) : idr(f.expectedUnitCost)}</td>
        <td className="num">{allow ? dash : (f.neededDayOffset != null ? `Day ${f.neededDayOffset}` : dash)}</td>
        <td className="num">{allow ? dash : orderDate ? fmtDate(orderDate) : dash}</td>
        <td className="num muted">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
      </tr>
      {open && items.map((b) => <DraftRow key={b.id} b={b} db={db} start={start} onPatch={onPatch} onDelete={onDelete} grouped />)}
    </>
  );
}

const TINT = { background: '#FFFBEB' }; // changed-cell highlight
const HILITE = { background: '#FEF9C3', boxShadow: 'inset 0 0 0 2px #FACC15' }; // row picked from edit history

function Row({ r, db, start, onEdit, onRaisePr, onUndo, grouped, highlighted }) {
  const f = r.fields, base = r.base;
  const allow = f.budgetBasis === 'allowance';
  const deleted = r.status === 'deleted';
  const changed = (k) => r.status === 'modified' && r.changedKeys.includes(k);
  const lead = f.leadTimeDays != null ? f.leadTimeDays : leadTimeFor(db, f.materialId);
  const needed = f.neededDayOffset;
  const neededDate = (start && needed != null) ? addDays(start, needed) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const rowStyle = {
    ...(r.status === 'added' ? { background: '#F0FDF4' } : deleted ? { opacity: 0.55 } : {}),
    ...(grouped ? { background: '#FBFCFE', boxShadow: 'inset 3px 0 0 #E2E8F0' } : {}),
    ...(highlighted ? HILITE : {}),
  };
  const strike = deleted ? { textDecoration: 'line-through' } : undefined;
  const wasNum = (k, prev) => changed(k) && base && (base[k] ?? null) !== (f[k] ?? null)
    ? <div className="muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{prev}</div> : null;
  const tag = r.status === 'added' ? <span className="pill" style={{ background: '#ECFDF5', color: '#15803D', border: '1px solid #D1FAE5', marginRight: 6, fontSize: 11 }}>New</span>
    : r.status === 'modified' ? <span className="pill warn" style={{ marginRight: 6 }}>Edited</span>
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

function DraftRow({ b, db, start, onPatch, onDelete, grouped }) {
  const { addMaterial, addMandor } = useStore();
  const allow = b.budgetBasis === 'allowance';
  const lead = b.leadTimeDays != null ? b.leadTimeDays : leadTimeFor(db, b.materialId);
  const neededDate = (start && b.neededDayOffset != null) ? addDays(start, b.neededDayOffset) : null;
  const orderDate = (neededDate && lead != null) ? addBusinessDays(neededDate, -lead) : null;
  const numOrNull = (v) => (v === '' ? null : Number(v));
  const dash = <span className="muted">—</span>;
  return (
    <tr style={grouped ? { background: '#FBFCFE', boxShadow: 'inset 3px 0 0 #E2E8F0' } : undefined}>
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
          createLabel={(q) => `Create “${q}”`} />
      </td>
      <td><input style={CELL} value={b.description || ''} placeholder="description"
        onChange={(e) => onPatch(b.id, { description: e.target.value })} /></td>
      <td>
        <ComboBox value={b.mandorId || ''} style={{ minWidth: 120 }} placeholder="Mandor…" noneLabel="Unassigned"
          options={db.mandors.map((m) => ({ id: m.id, label: m.name }))}
          onPick={(mid) => onPatch(b.id, { mandorId: mid })}
          onCreate={(q) => { const id = addMandor(q.trim()); onPatch(b.id, { mandorId: id }); return id; }}
          createLabel={(q) => `Add “${q}”`} />
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
      <td className="num"><button className="btn sm ghost" style={{ color: 'var(--risk)' }} title="Delete row" onClick={() => onDelete(b.id)}><X size={14} /></button></td>
    </tr>
  );
}
