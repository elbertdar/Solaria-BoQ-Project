import { useState, useMemo, Fragment } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import { materialName, isExtraPr, brandName } from '../engine/reconcile.js';
import { StatusPill, FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import { idr, fmtDate, num } from '../engine/format.js';
import { nextStatusId, activeStatuses, statusDef, isCommitted, isReceived, isMajorTransition, groupPrs } from '../engine/status.js';
import PrCommitModal from '../components/PrCommitModal.jsx';

// Portfolio-wide PR view: every purchase request across every project in one table,
// with cross-project filters (project, status, PIC, mandor, supplier). Mandor isn't on
// the PR — it lives on the linked BoQ item — so it's resolved PR → boqItem → mandorId.
// Creation stays per-project (needs BoQ context); this page is for monitoring + acting:
// edit, advance, receive. Editing sets the current project first so PrModal has context.
export default function AllPurchaseRequestsPage() {
  const { db, setCurrentProjectId, setPrStatus, stagePrStatus, unstagePr, discardPrStaged, commitPrStaged } = useStore();

  const [modal, setModal] = useState(undefined);     // undefined=closed, obj=edit
  const [receiveFor, setReceiveFor] = useState(null);
  const [open, setOpen] = useState(null);
  const [groupBy, setGroupBy] = useState('none'); // none | status | supplier
  const [committing, setCommitting] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);

  const pending = db.prStaged || [];               // portfolio-wide pending status changes
  const stagedFor = (id) => pending.find((s) => s.prId === id);
  const [q, setQ] = useState('');
  const [projectFilter, setProjectFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const [picFilter, setPicFilter] = useState([]);
  const [mandorFilter, setMandorFilter] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState([]);

  const projName = (id) => db.projects.find((p) => p.id === id)?.name || '— no project —';
  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || '—';
  const picName = (id) => db.users.find((u) => u.id === id)?.name || '—';
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';

  // Rows: all live PRs (trash is a separate collection), newest first, with resolved context.
  // BoQ lines are looked up via a Map — a .find per PR is O(prs × boqItems) portfolio-wide.
  const rows = useMemo(() => {
    const boqById = new Map(db.boqItems.map((b) => [b.id, b]));
    return db.prs
      .map((p) => ({ p, mandorId: (p.boqItemId && boqById.get(p.boqItemId)?.mandorId) || '' }))
      .sort((a, b) => new Date(b.p.createdAt) - new Date(a.p.createdAt));
  }, [db.prs, db.boqItems]);

  // Everything except the supplier filter — reused so the supplier preset cards can show
  // PR counts/value within the current (non-supplier) context. Memoized so downstream
  // memos (tally) key off a stable reference instead of a fresh array every render.
  const baseRows = useMemo(() => {
    const ql = q.toLowerCase();
    return rows.filter(({ p, mandorId }) => {
      if (projectFilter.length && !projectFilter.includes(p.projectId)) return false;
      if (statusFilter.length && !statusFilter.includes(p.status)) return false;
      if (picFilter.length && !picFilter.includes(p.picId || '')) return false;
      if (mandorFilter.length && !mandorFilter.includes(mandorId)) return false;
      if (q) {
        const proj = db.projects.find((x) => x.id === p.projectId)?.name || '';
        const hay = `${materialName(db, p.materialId)} ${proj} ${p.comment || ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, projectFilter, statusFilter, picFilter, mandorFilter, q, db]);
  const filtered = useMemo(() => (supplierFilter.length
    ? baseRows.filter(({ p }) => supplierFilter.includes(p.supplierPrimaryId) || supplierFilter.includes(p.supplierSecondaryId))
    : baseRows), [baseRows, supplierFilter]);

  // Filter option lists. PIC / mandor are built from what's actually present (incl. an
  // "Unassigned" bucket when relevant) so the lists stay relevant, not cluttered.
  const projectOptions = db.projects.map((p) => ({ value: p.id, label: p.name }));
  const statusOptions = activeStatuses(db).map((s) => ({ value: s.id, label: s.label }));
  const supplierOptions = db.suppliers.map((s) => ({ value: s.id, label: s.name }));
  const picOptions = useMemo(() => {
    const ids = new Set(rows.map((r) => r.p.picId || ''));
    const opts = db.users.filter((u) => ids.has(u.id)).map((u) => ({ value: u.id, label: u.name }));
    if (ids.has('')) opts.push({ value: '', label: 'Unassigned' });
    return opts;
  }, [rows, db.users]);
  const mandorOptions = useMemo(() => {
    const ids = new Set(rows.map((r) => r.mandorId));
    const opts = db.mandors.filter((m) => ids.has(m.id)).map((m) => ({ value: m.id, label: m.name }));
    if (ids.has('')) opts.push({ value: '', label: 'Unassigned' });
    return opts;
  }, [rows, db.mandors]);

  // Supplier preset cards — aggregate over the non-supplier-filtered set, sorted by spend.
  // A PR with both primary + secondary counts toward both suppliers (both are "involved").
  const supplierStats = useMemo(() => {
    const m = new Map();
    for (const { p } of baseRows) {
      for (const sid of [p.supplierPrimaryId, p.supplierSecondaryId]) {
        if (!sid) continue;
        const e = m.get(sid) || { id: sid, count: 0, value: 0 };
        e.count++; e.value += (p.quantity || 0) * (p.unitCost || 0);
        m.set(sid, e);
      }
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [baseRows]);
  const toggleSupplier = (sid) => setSupplierFilter(supplierFilter.includes(sid) ? supplierFilter.filter((x) => x !== sid) : [...supplierFilter, sid]);

  // Status presets behind the KPI tiles. "Open commitments" = committed-not-received phase;
  // "Received" = received phase. Click sets the status filter to that set; click again clears.
  const committedOpenIds = activeStatuses(db).filter((s) => s.phase === 'committed').map((s) => s.id);
  const receivedIds = activeStatuses(db).filter((s) => s.phase === 'received').map((s) => s.id);
  const isPreset = (ids) => ids.length > 0 && statusFilter.length === ids.length && ids.every((id) => statusFilter.includes(id));
  const togglePreset = (ids) => setStatusFilter(isPreset(ids) ? [] : ids);

  // Headline tallies across the filtered set.
  const tally = useMemo(() => {
    let committed = 0, received = 0, value = 0;
    for (const { p } of filtered) {
      if (isReceived(db, p.status)) received++;
      else if (isCommitted(db, p.status)) committed++;
      value += (p.quantity || 0) * (p.unitCost || 0);
    }
    return { committed, received, value };
  }, [filtered, db.prStatuses]);

  function editPr(p) { setCurrentProjectId(p.projectId); setModal(p); }
  function advance(p) {
    const next = nextStatusId(db, p.status);
    if (!next) return;
    if (!isMajorTransition(db, p.status, next)) { setPrStatus(p.id, next); return; } // routine bump → instant
    if (next === 'received') { setReceiveFor(p); return; }   // collect receipt date, then stage
    stagePrStatus(p.id, next);                                // major → stage for review & commit
  }

  const renderRow = ({ p, mandorId }) => {
    const isOpen = open === p.id;
    const hist = p.statusHistory || [];
    const next = nextStatusId(db, p.status);
    const stg = stagedFor(p.id);
    return (
      <Fragment key={p.id}>
        <tr>
          <td className="num clickable" style={{ cursor: 'pointer', color: 'var(--muted, #94A3B8)' }} onClick={() => setOpen(isOpen ? null : p.id)} title="Status history">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
          <td style={{ fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={projName(p.projectId)}>{projName(p.projectId)}</td>
          <td className="mat-link">{materialName(db, p.materialId)}{isExtraPr(db, p) && <span className="pill warn" style={{ marginLeft: 6 }}>Extra</span>}{p.brandId && <div className="muted" style={{ fontSize: 11 }}>{brandName(db, p.brandId)}</div>}</td>
          <td>
            <StatusPill status={p.status} />
            {stg && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <ArrowRight size={12} className="muted" /><StatusPill status={stg.to} /><span className="muted" style={{ fontSize: 11 }}>pending</span>
            </span>}
          </td>
          <td className="num">{num(p.quantity)} <span className="muted" style={{ fontSize: 11 }}>{p.unit}</span></td>
          <td className="num">{idr(p.unitCost)}</td>
          <td className="num">{idr(p.quantity * (p.unitCost || 0))}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{mandorId ? mandorName(mandorId) : <span className="muted">—</span>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{picName(p.picId)}</td>
          <td>{supplierName(p.supplierPrimaryId)}{p.supplierSecondaryId && <div className="muted" style={{ fontSize: 11 }}>{supplierName(p.supplierSecondaryId)}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.orderDate)}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.receiptDate)}</td>
          <td className="num" style={{ whiteSpace: 'nowrap' }}>
            <button className="btn sm ghost" onClick={() => editPr(p)}>Edit</button>{' '}
            {stg ? (
              <button className="btn sm ghost" onClick={() => unstagePr(p.id)} title="Cancel the pending status change">Undo pending</button>
            ) : next && <button className="btn sm" onClick={() => advance(p)} title={`→ ${statusDef(db, next).label}`}>Advance</button>}
          </td>
        </tr>
        {isOpen && (
          <tr><td colSpan={13} style={{ background: '#F8FAFC' }}>
            <div style={{ padding: '8px 10px 10px' }}>
              <div className="lbl" style={{ marginBottom: 6 }}>Status history{p.comment ? ' · note' : ''}</div>
              {p.comment && <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--ink-soft)' }}>“{p.comment}”</div>}
              {hist.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...hist].reverse().map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                      <span className="muted" style={{ minWidth: 152, whiteSpace: 'nowrap' }}>
                        {fmtDate(h.at)} · {new Date(h.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {h.from ? <><StatusPill status={h.from} /><ArrowRight size={13} className="muted" /></> : <span className="muted">created as</span>}
                      <StatusPill status={h.to} />
                      <span className="muted">· by {h.by?.name || '—'}</span>
                      {h.note && <span className="muted" style={{ fontStyle: 'italic' }}>· “{h.note}”</span>}
                    </div>
                  ))}
                </div>
              ) : <div className="muted" style={{ fontSize: 13 }}>No status changes recorded yet.</div>}
            </div>
          </td></tr>
        )}
      </Fragment>
    );
  };

  return (
    <>
      <div className="page-head">
        <h1>All Purchase Requests</h1>
        <p className="sub">Every purchase request across all projects · {db.prs.length} total. Raise new PRs from a project’s BoQ.</p>
      </div>

      {pending.length > 0 && (
        <div className="banner" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: 10, padding: '9px 14px', marginBottom: 14, fontSize: 13.3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>{pending.length} pending status change{pending.length > 1 ? 's' : ''}</b>
          <span style={{ opacity: 0.85 }}>— major changes staged across projects, not yet committed.</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {discardArmed ? (
              <>
                <span style={{ color: 'var(--risk)' }}>Discard all?</span>
                <button className="btn sm danger" onClick={() => { discardPrStaged(); setDiscardArmed(false); }}>Confirm discard</button>
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <Kpi label="Open commitments" value={tally.committed} active={isPreset(committedOpenIds)}
          hint={isPreset(committedOpenIds) ? 'filtering · click to clear' : 'ordered, not yet received'}
          onClick={committedOpenIds.length ? () => togglePreset(committedOpenIds) : undefined} />
        <Kpi label="Received" value={tally.received} active={isPreset(receivedIds)}
          hint={isPreset(receivedIds) ? 'filtering · click to clear' : 'goods in'}
          onClick={receivedIds.length ? () => togglePreset(receivedIds) : undefined} />
        <Kpi label="Value shown" value={idr(tally.value)} hint="qty × unit cost (filtered)" />
      </div>

      {supplierStats.length > 0 && (
        <div style={{ margin: '0 0 16px' }}>
          <div className="lbl" style={{ marginBottom: 7 }}>Filter by supplier{supplierFilter.length ? ` · ${supplierFilter.length} selected` : ''}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {supplierStats.slice(0, 8).map((s) => (
              <SupplierChip key={s.id} name={supplierName(s.id)} count={s.count} value={idr(s.value)}
                active={supplierFilter.includes(s.id)} onClick={() => toggleSupplier(s.id)} />
            ))}
            {supplierStats.length > 8 && <span className="muted" style={{ fontSize: 12 }}>+{supplierStats.length - 8} more in the dropdown</span>}
            {supplierFilter.length > 0 && <button className="btn sm ghost" onClick={() => setSupplierFilter([])}>Clear</button>}
          </div>
        </div>
      )}

      <FilterBar shown={filtered.length} total={rows.length} unit="PRs">
        <FilterSearch value={q} onChange={setQ} placeholder="Search material, project, note…" width={240} />
        <FilterSelect value={projectFilter} onChange={setProjectFilter} allLabel="All projects" width={180} options={projectOptions} />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} allLabel="All statuses" options={statusOptions} />
        <FilterSelect value={picFilter} onChange={setPicFilter} allLabel="All PICs" width={170} options={picOptions} />
        <FilterSelect value={mandorFilter} onChange={setMandorFilter} allLabel="All mandors" width={170} options={mandorOptions} />
        <FilterSelect value={supplierFilter} onChange={setSupplierFilter} allLabel="All suppliers" width={180} options={supplierOptions} />
        <label className="field-inline" style={{ fontSize: 13 }}>Group
          <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ width: 'auto', padding: '7px 8px' }}>
            <option value="none">None</option>
            <option value="status">Status</option>
            <option value="supplier">Supplier (store)</option>
          </select>
        </label>
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table compact">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Project</th><th>Material</th><th>Status</th>
                <th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Line total</th>
                <th>Mandor</th><th>PIC</th><th>Supplier</th><th>Order</th><th>Receipt</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groupBy === 'none'
                ? filtered.map(renderRow)
                : groupPrs(db, filtered, groupBy, (it) => it.p).map((g) => (
                    <Fragment key={'grp-' + g.key}>
                      <tr className="group-row"><td colSpan={13}>{g.label} <span className="muted" style={{ fontWeight: 400 }}>· {g.count}</span></td></tr>
                      {g.rows.map(renderRow)}
                    </Fragment>
                  ))}
              {filtered.length === 0 && (
                <tr><td colSpan={13}><div className="empty">{rows.length === 0 ? 'No purchase requests anywhere yet. Raise one from a project’s BoQ.' : 'No PRs match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== undefined && <PrModal pr={modal} onClose={() => setModal(undefined)} />}
      {receiveFor && (
        <ReceiveModal title={`Mark received · ${materialName(db, receiveFor.materialId)}`}
          onClose={() => setReceiveFor(null)}
          onConfirm={(date) => { stagePrStatus(receiveFor.id, 'received', date); setReceiveFor(null); }} />
      )}
      {committing && pending.length > 0 && (
        <PrCommitModal db={db} staged={pending}
          onCommit={(ids, msg) => { commitPrStaged(ids, msg); setCommitting(false); }}
          onDiscard={(prId) => unstagePr(prId)}
          onClose={() => setCommitting(false)} />
      )}
    </>
  );
}

function Kpi({ label, value, hint, onClick, active }) {
  const clickable = typeof onClick === 'function';
  return (
    <div onClick={onClick} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{ flex: '1 1 160px', minWidth: 150, border: '1px solid ' + (active ? 'var(--info)' : 'var(--border)'),
        borderRadius: 10, padding: '10px 14px', background: active ? 'var(--info-bg)' : 'var(--surface)',
        cursor: clickable ? 'pointer' : 'default' }}>
      <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, margin: '2px 0', color: active ? 'var(--info)' : 'var(--ink)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{hint}</div>
    </div>
  );
}

function SupplierChip({ name, count, value, active, onClick }) {
  return (
    <button type="button" onClick={onClick} title={active ? 'Click to remove from filter' : 'Click to filter to this supplier'}
      style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', borderRadius: 10, padding: '8px 12px', minWidth: 130,
        border: '1px solid ' + (active ? 'var(--info)' : 'var(--border)'), background: active ? 'var(--info-bg)' : 'var(--surface)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: active ? 'var(--info)' : 'var(--ink)' }}>{name}</div>
      <div className="muted" style={{ fontSize: 11 }}>{count} PR{count === 1 ? '' : 's'} · {value}</div>
    </button>
  );
}
