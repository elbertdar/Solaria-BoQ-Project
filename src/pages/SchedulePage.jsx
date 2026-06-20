import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { ChevronDown, ChevronRight, X, Circle, Diamond } from 'lucide-react';
import { TONE } from '../theme.js';
import { isCommitted, isReceived, statusDef } from '../engine/status.js';
import { useStore, useProject } from '../store/StoreContext.jsx';
import PhaseTabs from '../components/PhaseTabs.jsx';
import { ProjectBar } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import {
  scheduleForProject, scheduleCounts, matchesFilter, agendaBuckets, dayColOf, todayLocal,
} from '../engine/schedule.js';
import { fmtDate, num } from '../engine/format.js';

const BORDER = '#E5E7EB';
const WEEKEND = 'rgba(100,116,139,0.07)';
const TODAYBG = 'rgba(245,158,11,0.14)';

const BUCKETS = [
  { key: 'overdue', label: 'Overdue', sub: 'not ordered — order now', color: '#E11D48' },
  { key: 'orderNow', label: 'Order this week', sub: 'routine', color: '#EAB308' },
  { key: 'late', label: 'Late delivery', sub: 'ordered — delivery overdue, chase supplier', color: '#8B5CF6' },
  { key: 'lateArrival', label: 'Late order', sub: 'ordered late — will arrive after the planned date', color: '#8B5CF6' },
  { key: 'thisWeek', label: 'Arriving this week', sub: 'ordered & on track', color: '#0EA5E9' },
  { key: 'nextWeek', label: 'Next week', color: '#94A3B8' },
  { key: 'later', label: 'Later', color: '#94A3B8' },
  { key: 'done', label: 'Complete', color: '#16A34A' },
];
const dayLabel = (o) => (o == null ? '—' : `Day ${o}`);

export default function SchedulePage() {
  const { db, currentProjectId, currentPhaseId, setPrStatus, updateProject } = useStore();
  const project = useProject();
  const today = useMemo(() => todayLocal(), []);
  const { lines, start, curOff, dayAxis } = useMemo(() => scheduleForProject(db, currentProjectId, today, currentPhaseId), [db, currentProjectId, currentPhaseId, today]);
  const counts = useMemo(() => scheduleCounts(lines), [lines]);

  const [filter, setFilter] = useState(null);
  const [view, setView] = useState('timeline');
  const [prFor, setPrFor] = useState(null);
  const [editPr, setEditPr] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);

  const supplierName = (id) => db.suppliers.find((s) => s.id === id)?.name || null;
  const MiniStatus = ({ status }) => {
    const s = statusDef(db, status);
    return <span className={'pill ' + (s.pill || 'gray')} style={{ fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap' }}>{s.label}</span>;
  };
  const batchCtx = { supplierName, MiniStatus, onReceive: (pr, line) => setReceiveFor({ pr, line }), onEdit: (pr) => setEditPr(pr) };

  const visible = lines.filter((l) => matchesFilter(l, filter));
  const toggleFilter = (f) => setFilter((cur) => (cur === f ? null : f));

  const orderedPrFor = (line) => db.prs.find((p) => p.boqItemId === line.boqItem.id && isCommitted(db, p.status) && !isReceived(db, p.status));
  function ActionButton({ line }) {
    if (line.state === 'received') return <span className="muted" style={{ fontSize: 12 }}>received</span>;
    const ordered = orderedPrFor(line);
    if (ordered) return <button className="btn sm" onClick={() => setReceiveFor({ pr: ordered, line })}>Receive</button>;
    return <button className="btn sm" onClick={() => setPrFor(line.boqItem)}>Raise PR</button>;
  }

  return (
    <>
      <div className="page-head">
        <h1>Schedule</h1>
        <p className="sub">{project.name} · day-by-day · order days auto-computed from lead times (business days)</p>
      </div>

      <ProjectBar />
      <PhaseTabs />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 18px', fontSize: 13, color: '#64748B' }}>
        <span>Project start</span>
        <input type="date" value={start ? start.toISOString().slice(0, 10) : ''}
          onChange={(e) => updateProject(currentProjectId, { startDate: e.target.value || null })} style={{ width: 170 }} />
        {start ? <span className="pill gray">Today is day {curOff}</span>
          : <span style={{ color: TONE.overdue }}>set a start date to place items on the calendar</span>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip active={filter === 'order'} onClick={() => toggleFilter('order')} n={counts.toOrder} label="To order this week"
          extra={counts.overdueOrder > 0 ? <span style={{ color: TONE.overdue, fontWeight: 600 }}>{counts.overdueOrder} overdue</span> : 'on track'} />
        <Chip active={filter === 'needed'} onClick={() => toggleFilter('needed')} n={counts.needed} label="Needed this week" extra="delivery due this week" />
        <Chip active={filter === 'arriving'} onClick={() => toggleFilter('arriving')} n={counts.arriving} label="Arriving this week"
          extra={counts.overdueDeliver > 0 ? <span style={{ color: TONE.late, fontWeight: 600 }}>{counts.overdueDeliver} late</span> : 'expected receipts'} />
      </div>

      <div className="toolbar">
        {filter && <button className="btn sm ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setFilter(null)}>Clear filter <X size={13} /></button>}
        <div className="spacer" style={{ flex: 1 }} />
        <div className="seg">
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
          <button className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Agenda</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card"><div className="empty">{lines.length === 0 ? 'No BoQ items on this project yet.' : 'Nothing matches this filter.'}</div></div>
      ) : view === 'timeline' ? (
        <Timeline dayAxis={dayAxis} lines={visible} db={db} ActionButton={ActionButton} batch={batchCtx} />
      ) : (
        <Agenda lines={visible} today={today} db={db} ActionButton={ActionButton} batch={batchCtx} />
      )}

      <Legend />

      {prFor && <PrModal boqItem={prFor} onClose={() => setPrFor(null)} />}
      {editPr && <PrModal pr={editPr} onClose={() => setEditPr(null)} />}
      {receiveFor && (
        <ReceiveModal title={`Mark received · ${receiveFor.line.materialName}`} onClose={() => setReceiveFor(null)}
          onConfirm={(date) => { setPrStatus(receiveFor.pr.id, 'received', date); setReceiveFor(null); }} />
      )}
    </>
  );
}

function Chip({ n, label, extra, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 160, textAlign: 'left', cursor: 'pointer', background: '#fff',
      border: '1px solid ' + (active ? '#0F172A' : BORDER), boxShadow: active ? 'inset 0 0 0 1px #0F172A' : 'none',
      borderRadius: 10, padding: '14px 16px', fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: '#0F172A' }}>{n}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginTop: 7 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>{extra}</div>
    </button>
  );
}

// ---------- Day-granular timeline ----------
function Timeline({ dayAxis, lines, db, ActionButton, batch }) {
  const N = dayAxis.span;
  const cols = `200px repeat(${N}, minmax(22px, 1fr))`;
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';
  const weekendCols = dayAxis.columns.filter((c) => c.isWeekend).map((c) => c.index);
  const mondayCols = dayAxis.columns.filter((c) => c.isMonday).map((c) => c.index);
  const todayCol = dayAxis.columns.findIndex((c) => c.isToday);
  const [openIds, setOpenIds] = useState(() => new Set());
  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const toggleGroup = (k) => setClosedGroups((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // With the axis extending back over history, park the viewport so today sits ~40% in.
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todayCol < 0) return;
    const colW = Math.max(22, (el.scrollWidth - 200) / N);
    el.scrollLeft = Math.max(0, 200 + todayCol * colW - el.clientWidth * 0.4);
  }, [todayCol, N]);

  const groups = [];
  const seen = new Map();
  for (const l of lines) {
    const k = l.mandorId || '__none';
    if (!seen.has(k)) { seen.set(k, { key: k, label: mandorName(k), rows: [] }); groups.push(seen.get(k)); }
    seen.get(k).rows.push(l);
  }

  // Collapsed groups still inform: tone tallies shown in the band.
  const TALLY = [['overdue', 'overdue'], ['late', 'late'], ['orderNow', 'order now'], ['awaiting', 'awaiting'], ['done', 'done']];
  const tallies = (rows) => TALLY.map(([tone, lbl]) => [tone, lbl, rows.filter((r) => r.tone === tone).length]).filter(([, , n]) => n > 0);

  return (
    <div ref={scrollRef} style={{ overflowX: 'auto', border: '1px solid ' + BORDER, borderRadius: 10, background: '#fff' }}>
      <div style={{ minWidth: 200 + N * 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'stretch', borderBottom: '1px solid ' + BORDER }}>
          <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#94A3B8', borderRight: '1px solid ' + BORDER, position: 'sticky', left: 0, background: '#fff', zIndex: 6 }}>Material</div>
          {dayAxis.columns.map((c) => (
            <div key={c.index} style={{
              padding: '6px 0', textAlign: 'center', fontSize: 9.5, lineHeight: 1.2,
              color: c.isToday ? '#0F172A' : '#94A3B8', fontWeight: c.isToday ? 700 : 500,
              background: c.isToday ? TODAYBG : c.isWeekend ? WEEKEND : 'transparent',
              borderLeft: c.isMonday ? '1px solid ' + BORDER : 'none',
            }}>
              {c.isToday ? 'today' : c.isMonday ? fmtDate(c.date).replace(/ \d{4}$/, '') : ''}
            </div>
          ))}
        </div>

        {groups.map((g) => {
          const closed = closedGroups.has(g.key);
          const t = tallies(g.rows);
          return (
            <div key={g.key}>
              <div onClick={() => toggleGroup(g.key)} style={{
                padding: '6px 12px', background: '#FBFBFC', fontSize: 11, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B',
                borderTop: '1px solid ' + BORDER, borderBottom: '1px solid ' + BORDER, cursor: 'pointer',
              }} title={closed ? 'Expand group' : 'Collapse group'}>
                <span style={{ position: 'sticky', left: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>Mandor · {g.label}</span>
                  <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#94A3B8' }}>{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
                  {t.map(([tone, lbl, n]) => (
                    <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, textTransform: 'none', letterSpacing: 0, fontSize: 11, color: TONE[tone] }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE[tone] }} />{n} {lbl}
                    </span>
                  ))}
                </span>
              </div>
              {!closed && g.rows.map((l) => (
                <Row key={l.boqItem.id} l={l} N={N} cols={cols} baseDay={dayAxis.baseDay}
                  weekendCols={weekendCols} mondayCols={mondayCols} todayCol={todayCol} ActionButton={ActionButton}
                  open={openIds.has(l.boqItem.id)} onToggle={() => toggle(l.boqItem.id)} batch={batch} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ l, N, cols, baseDay, weekendCols, mondayCols, todayCol, ActionButton, open, onToggle, batch }) {
  const poc = dayColOf(l.orderDate, baseDay, N);   // planned order
  const pnc = dayColOf(l.neededDate, baseDay, N);  // planned delivery (needed)
  const ordered = l.state === 'awaiting' || l.state === 'received';
  const arrivalDate = l.state === 'received' ? l.actualReceiptDate : l.effectiveArrival;
  const aoc = ordered ? dayColOf(l.actualOrderDate, baseDay, N) : null;  // actual order
  const aec = ordered ? dayColOf(arrivalDate, baseDay, N) : null;        // actual / expected arrival
  const color = TONE[l.tone];
  const PLANNED = '#CBD5E1';
  const nPrs = l.prDetails.length;

  const tip = [
    l.orderOffset != null ? `Plan: order day ${l.orderOffset}` : null,
    l.neededOffset != null ? `needed day ${l.neededOffset}` : null,
    l.hasLead ? `lead ${l.lead}d${l.leadSource === 'line' ? ' (custom)' : ''}` : 'no lead time',
    l.actualOrderDate ? `first ordered ${fmtDate(l.actualOrderDate)}` : null,
    ordered && arrivalDate ? `${l.state === 'received' ? 'received' : 'expected'} ${fmtDate(arrivalDate)}` : null,
    (l.forecastLate && !l.deliveryOverdue) ? `+${l.slipDays}d vs plan` : null,
    l.promisedDate ? `supplier promised ${fmtDate(l.promisedDate)}` : null,
    nPrs > 1 ? `${nPrs} PRs — expand for batches` : null,
  ].filter(Boolean).join('  ·  ');

  const dot = { gridRow: 1, alignSelf: 'center', justifySelf: 'center', zIndex: 3, width: 12, height: 12, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(15,23,42,0.2)' };
  const colspan = (a, b) => `${2 + Math.min(a, b)} / ${2 + Math.max(a, b) + 1}`;

  return (
    <>
      <div className="sched-row" style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 46, borderBottom: open ? 'none' : '1px solid ' + BORDER }} title={tip}>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5, borderRight: '1px solid ' + BORDER, zIndex: 4, background: '#fff', position: 'sticky', left: 0, alignSelf: 'stretch', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <span onClick={nPrs > 0 ? onToggle : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, cursor: nPrs > 0 ? 'pointer' : 'default' }}
              title={nPrs > 0 ? 'Show individual orders' : undefined}>
              {nPrs > 0 && <span className="muted" style={{ display: 'inline-flex', flexShrink: 0 }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.materialName}</span>
            </span>
            <ActionButton line={l} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LineTags l={l} />
            {nPrs > 0 && (
              <span className="muted" style={{ fontSize: 10.5, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={onToggle}>
                {nPrs} PR{nPrs === 1 ? '' : 's'} · {num(l.receivedQty)}/{num(l.budget)} in
              </span>
            )}
          </div>
        </div>

        {mondayCols.map((ci) => <span key={'m' + ci} style={{ gridColumn: 2 + ci, gridRow: 1, alignSelf: 'stretch', borderLeft: '1px solid #EFF2F5', zIndex: 0 }} />)}
        {weekendCols.map((ci) => <span key={'w' + ci} style={{ gridColumn: 2 + ci, gridRow: 1, alignSelf: 'stretch', background: WEEKEND, zIndex: 0 }} />)}
        {todayCol >= 0 && <span style={{ gridColumn: 2 + todayCol, gridRow: 1, alignSelf: 'stretch', background: TODAYBG, zIndex: 0 }} />}

        {/* planned layer — faded baseline (order → needed) */}
        {poc != null && pnc != null && (
          <span style={{ gridColumn: colspan(poc, pnc), gridRow: 1, alignSelf: 'center', height: 6, borderRadius: 999, margin: '0 3px', background: PLANNED, opacity: 0.7, zIndex: 1 }} />
        )}
        {pnc != null && <span style={{ ...dot, gridColumn: 2 + pnc, borderRadius: 3, transform: 'rotate(45deg)', background: PLANNED, opacity: ordered ? 0.8 : 1 }} />}
        {poc != null && <span style={{ ...dot, gridColumn: 2 + poc, borderRadius: '50%', background: ordered ? PLANNED : color, opacity: ordered ? 0.8 : 1 }} />}

        {/* actual / expected layer — solid (actual order → expected/received) */}
        {aoc != null && aec != null && (
          <span style={{ gridColumn: colspan(aoc, aec), gridRow: 1, alignSelf: 'center', height: 8, borderRadius: 999, margin: '0 3px', background: color, zIndex: 2 }} />
        )}
        {aoc != null && <span style={{ ...dot, gridColumn: 2 + aoc, borderRadius: '50%', background: color }} />}
        {aec != null && <span style={{ ...dot, gridColumn: 2 + aec, borderRadius: 3, transform: 'rotate(45deg)', background: color }} />}
      </div>

      {open && l.prDetails.map((d, i) => (
        <BatchRow key={d.pr.id} d={d} l={l} N={N} cols={cols} baseDay={baseDay}
          weekendCols={weekendCols} mondayCols={mondayCols} todayCol={todayCol} batch={batch}
          last={i === l.prDetails.length - 1} />
      ))}
    </>
  );
}

// One sub-row per PR: its own order dot → expected/receipt diamond on the same day grid.
function BatchRow({ d, l, N, cols, baseDay, weekendCols, mondayCols, todayCol, batch, last }) {
  const oc = dayColOf(d.orderDate, baseDay, N);
  const ec = dayColOf(d.received ? d.receiptDate : d.expected, baseDay, N);
  const color = TONE[d.tone];
  const sup = batch.supplierName(d.pr.supplierPrimaryId);
  const dotS = { gridRow: 1, alignSelf: 'center', justifySelf: 'center', zIndex: 3, width: 9, height: 9, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(15,23,42,0.18)' };
  const colspan = (a, b) => `${2 + Math.min(a, b)} / ${2 + Math.max(a, b) + 1}`;
  const when = d.received ? `received ${fmtDate(d.receiptDate)}`
    : d.expected ? `${d.late ? 'late — expected' : 'expected'} ${fmtDate(d.expected)}`
    : d.orderDate ? `ordered ${fmtDate(d.orderDate)}` : 'not ordered yet';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 34, background: '#FAFBFC', borderBottom: last ? '1px solid ' + BORDER : '1px dashed #EDF0F3' }}
      title={`${num(d.qty)} ${l.unit}${sup ? ` · ${sup}` : ''} · ${when}`}>
      <div style={{ padding: '4px 10px 4px 27px', display: 'flex', alignItems: 'center', gap: 5, borderRight: '1px solid ' + BORDER, zIndex: 4, background: '#FAFBFC', minWidth: 0, overflow: 'hidden', position: 'sticky', left: 0, alignSelf: 'stretch' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{num(d.qty)} {l.unit}</span>
        <batch.MiniStatus status={d.status} />
        {d.committed && !d.received && (
          <button className="btn sm ghost" style={{ marginLeft: 'auto', fontSize: 10.5, padding: '1px 6px', flexShrink: 0 }}
            onClick={() => batch.onReceive(d.pr, l)}>Receive</button>
        )}
        {!d.committed && (
          <button className="btn sm ghost" style={{ marginLeft: 'auto', fontSize: 10.5, padding: '1px 6px', flexShrink: 0 }}
            onClick={() => batch.onEdit(d.pr)}>Edit</button>
        )}
      </div>
      {mondayCols.map((ci) => <span key={'m' + ci} style={{ gridColumn: 2 + ci, gridRow: 1, alignSelf: 'stretch', borderLeft: '1px solid #EFF2F5', zIndex: 0 }} />)}
      {weekendCols.map((ci) => <span key={'w' + ci} style={{ gridColumn: 2 + ci, gridRow: 1, alignSelf: 'stretch', background: WEEKEND, zIndex: 0 }} />)}
      {todayCol >= 0 && <span style={{ gridColumn: 2 + todayCol, gridRow: 1, alignSelf: 'stretch', background: TODAYBG, zIndex: 0 }} />}
      {oc != null && ec != null && (
        <span style={{ gridColumn: colspan(oc, ec), gridRow: 1, alignSelf: 'center', height: 5, borderRadius: 999, margin: '0 4px', background: color, opacity: 0.85, zIndex: 2 }} />
      )}
      {oc != null && <span style={{ ...dotS, gridColumn: 2 + oc, borderRadius: '50%', background: color }} />}
      {ec != null && <span style={{ ...dotS, gridColumn: 2 + ec, borderRadius: 2, transform: 'rotate(45deg)', background: color }} />}
    </div>
  );
}

// Exactly one tag per line — its scheduling status. (Over-budget lives on Balance, not here.)
function statusTag(l) {
  if (l.state === 'received') return { text: 'Complete', fg: '#15803D', bg: '#F0FDF4' };
  if (l.orderOverdue || (l.orderBeforeStart && l.state === 'to-order')) return { text: 'Overdue', fg: '#BE123C', bg: '#FEF2F4' };       // red — not ordered, past order-by
  if (l.deliveryOverdue) return { text: 'Late delivery', fg: '#6D28D9', bg: '#F5F3FF' };                                                 // purple — ordered, delivery overdue
  if (l.forecastLate) return { text: 'Late order', fg: '#6D28D9', bg: '#F5F3FF' };                                                        // purple — ordered late, will arrive late
  if (l.state === 'awaiting') return { text: 'On track', fg: '#0369A1', bg: '#EFF6FF' };                                                  // blue
  if (l.state === 'to-order' && !l.hasLead) return { text: 'No lead time', fg: '#475569', bg: '#F1F5F9' };                                // grey — can't schedule until set
  if (l.orderThisWeek || l.dueThisWeek) return { text: 'Order now', fg: '#A16207', bg: '#FEFCE8' };                                       // yellow
  return { text: 'Upcoming', fg: '#64748B', bg: '#F1F5F9' };                                                                              // grey
}

function LineTags({ l }) {
  const s = statusTag(l);
  return <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.03em', color: s.fg, background: s.bg }}>{s.text}</span>;
}

// ---------- Agenda ----------
function Agenda({ lines, today, db, ActionButton, batch }) {
  const buckets = agendaBuckets(lines, today);
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';
  const [openIds, setOpenIds] = useState(() => new Set());
  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <>
      {BUCKETS.map(({ key, label, sub, color }) => {
        const rows = buckets[key];
        if (!rows.length) return null;
        return (
          <div className="card" key={key}>
            <div className="card-head">
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, marginRight: 4 }} />
              <h2>{label}</h2>
              {sub && <span className="muted" style={{ fontSize: 12.5 }}>· {sub}</span>}
              <div className="spacer" style={{ flex: 1 }} /><span className="pill gray">{rows.length}</span>
            </div>
            <div className="card-body flush">
              {rows.map((l) => {
                const nPrs = l.prDetails.length;
                const open = openIds.has(l.boqItem.id);
                return (
                  <Fragment key={l.boqItem.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: open ? 'none' : '1px solid ' + BORDER }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: TONE[l.tone] }} />
                      <div style={{ flex: 1, minWidth: 0, cursor: nPrs > 0 ? 'pointer' : 'default' }}
                        onClick={nPrs > 0 ? () => toggle(l.boqItem.id) : undefined}
                        title={nPrs > 0 ? 'Show individual orders' : undefined}>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {nPrs > 0 && <span className="muted" style={{ display: 'inline-flex' }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>}
                          {l.materialName}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {mandorName(l.mandorId)} · {num(l.budget)} {l.unit} planned
                          {nPrs > 0 && <> · {nPrs} PR{nPrs === 1 ? '' : 's'} · {num(l.receivedQty)}/{num(l.budget)} in</>}
                        </div>
                      </div>
                      <Milestone l={l} /><ActionButton line={l} />
                    </div>
                    {open && (
                      <div style={{ padding: '2px 16px 10px 37px', background: '#FAFBFC', borderBottom: '1px solid ' + BORDER }}>
                        {l.prDetails.map((d) => {
                          const sup = batch.supplierName(d.pr.supplierPrimaryId);
                          const when = d.received ? `received ${fmtDate(d.receiptDate)}`
                            : d.expected ? <span style={d.late ? { color: TONE.late, fontWeight: 600 } : undefined}>{d.overdueNow ? 'late — expected ' : d.forecastLate ? 'late vs plan — expected ' : 'expected '}{fmtDate(d.expected)}</span>
                            : d.orderDate ? `ordered ${fmtDate(d.orderDate)}` : 'not ordered yet';
                          return (
                            <div key={d.pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 12.5, borderBottom: '1px dashed #EDF0F3' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: TONE[d.tone] }} />
                              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{num(d.qty)} {l.unit}</span>
                              <batch.MiniStatus status={d.status} />
                              <span className="muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sup ? `${sup} · ` : ''}{when}
                              </span>
                              <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                {d.committed && !d.received
                                  ? <button className="btn sm ghost" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => batch.onReceive(d.pr, l)}>Receive</button>
                                  : !d.committed
                                    ? <button className="btn sm ghost" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => batch.onEdit(d.pr)}>Edit</button>
                                    : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Milestone({ l }) {
  const overdue = { color: TONE.overdue, fontWeight: 600 };
  const late = { color: TONE.late, fontWeight: 600 };
  const base = { fontSize: 13, color: '#64748B', whiteSpace: 'nowrap' };
  if (l.state === 'received') return <span style={base}>Received {fmtDate(l.actualReceiptDate)}</span>;
  if (l.state === 'to-order') return <span style={{ ...base, ...(l.orderOverdue || l.orderBeforeStart ? overdue : {}) }}>Order by {dayLabel(l.orderOffset)}</span>;
  if (l.deliveryOverdue) return <span style={{ ...base, ...late }}>Late delivery · exp. {fmtDate(l.effectiveArrival)}</span>;
  if (l.forecastLate) return <span style={{ ...base, ...late }}>Late order · exp. {fmtDate(l.effectiveArrival)} (+{l.slipDays}d)</span>;
  return <span style={base}>Arriving ~{fmtDate(l.effectiveArrival)}</span>;
}

function Legend() {
  const items = [['Complete', TONE.done], ['On track', TONE.awaiting], ['Order now', TONE.orderNow], ['Overdue', TONE.overdue], ['Late delivery / Late order', TONE.late], ['Upcoming', TONE.neutral]];
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#64748B', margin: '12px 2px 0' }}>
      {items.map(([t, c]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{t}</span>)}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}><span style={{ width: 24, height: 6, borderRadius: 999, background: '#CBD5E1', opacity: 0.7 }} /> planned (faded)</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 24, height: 8, borderRadius: 999, background: '#0EA5E9' }} /> actual / expected (solid)</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#94A3B8' }}>· <Circle size={8} fill="currentColor" strokeWidth={0} /> order · <Diamond size={9} fill="currentColor" strokeWidth={0} /> delivery · weekends shaded</span>
    </div>
  );
}
