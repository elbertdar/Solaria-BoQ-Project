import { useState } from 'react';
import { useStore, useProject } from '../store/StoreContext.jsx';
import { ProjectBar } from '../components/ui.jsx';
import PrModal from '../components/PrModal.jsx';
import ReceiveModal from '../components/ReceiveModal.jsx';
import {
  scheduleForProject, scheduleCounts, matchesFilter, agendaBuckets, dayColOf, todayLocal,
} from '../engine/schedule.js';
import { fmtDate } from '../engine/format.js';

const TONE = { risk: '#E11D48', amber: '#F59E0B', info: '#0EA5E9', ok: '#16A34A', neutral: '#94A3B8' };
const BORDER = '#E5E7EB';
const WEEKEND = 'rgba(100,116,139,0.07)';
const TODAYBG = 'rgba(245,158,11,0.14)';

const BUCKETS = [
  { key: 'overdue', label: 'Overdue' }, { key: 'thisWeek', label: 'This week' },
  { key: 'nextWeek', label: 'Next week' }, { key: 'later', label: 'Later' }, { key: 'done', label: 'Done' },
];
const dayLabel = (o) => (o == null ? '—' : `Day ${o}`);

export default function SchedulePage() {
  const { db, currentProjectId, setPrStatus, updateProject } = useStore();
  const project = useProject();
  const today = todayLocal();
  const { lines, start, curOff, dayAxis } = scheduleForProject(db, currentProjectId, today);
  const counts = scheduleCounts(lines);

  const [filter, setFilter] = useState(null);
  const [view, setView] = useState('timeline');
  const [prFor, setPrFor] = useState(null);
  const [receiveFor, setReceiveFor] = useState(null);

  const visible = lines.filter((l) => matchesFilter(l, filter));
  const toggleFilter = (f) => setFilter((cur) => (cur === f ? null : f));

  const orderedPrFor = (line) => db.prs.find((p) => p.boqItemId === line.boqItem.id && p.status === 'ordered');
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 18px', fontSize: 13, color: '#64748B' }}>
        <span>Project start</span>
        <input type="date" value={start ? start.toISOString().slice(0, 10) : ''}
          onChange={(e) => updateProject(currentProjectId, { startDate: e.target.value || null })} style={{ width: 170 }} />
        {start ? <span className="pill gray">Today is day {curOff}</span>
          : <span style={{ color: TONE.risk }}>set a start date to place items on the calendar</span>}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip active={filter === 'order'} onClick={() => toggleFilter('order')} n={counts.toOrder} label="To order this week"
          extra={counts.overdueOrder > 0 ? <span style={{ color: TONE.risk, fontWeight: 600 }}>{counts.overdueOrder} overdue</span> : 'on track'} />
        <Chip active={filter === 'needed'} onClick={() => toggleFilter('needed')} n={counts.needed} label="Needed this week" extra="delivery due this week" />
        <Chip active={filter === 'arriving'} onClick={() => toggleFilter('arriving')} n={counts.arriving} label="Arriving this week"
          extra={counts.overdueDeliver > 0 ? <span style={{ color: TONE.risk, fontWeight: 600 }}>{counts.overdueDeliver} late</span> : 'expected receipts'} />
      </div>

      <div className="toolbar">
        {filter && <button className="btn sm ghost" onClick={() => setFilter(null)}>Clear filter ✕</button>}
        <div className="spacer" style={{ flex: 1 }} />
        <div className="seg">
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>Timeline</button>
          <button className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Agenda</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card"><div className="empty">{lines.length === 0 ? 'No BoQ items on this project yet.' : 'Nothing matches this filter.'}</div></div>
      ) : view === 'timeline' ? (
        <Timeline dayAxis={dayAxis} lines={visible} db={db} ActionButton={ActionButton} />
      ) : (
        <Agenda lines={visible} today={today} db={db} ActionButton={ActionButton} />
      )}

      <Legend />

      {prFor && <PrModal boqItem={prFor} onClose={() => setPrFor(null)} />}
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
function Timeline({ dayAxis, lines, db, ActionButton }) {
  const N = dayAxis.span;
  const cols = `200px repeat(${N}, minmax(22px, 1fr))`;
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';
  const weekendCols = dayAxis.columns.filter((c) => c.isWeekend).map((c) => c.index);
  const todayCol = dayAxis.columns.findIndex((c) => c.isToday);

  const groups = [];
  const seen = new Map();
  for (const l of lines) {
    const k = l.mandorId || '__none';
    if (!seen.has(k)) { seen.set(k, { key: k, label: mandorName(k), rows: [] }); groups.push(seen.get(k)); }
    seen.get(k).rows.push(l);
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid ' + BORDER, borderRadius: 10, background: '#fff' }}>
      <div style={{ minWidth: 200 + N * 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'stretch', borderBottom: '1px solid ' + BORDER }}>
          <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#94A3B8', borderRight: '1px solid ' + BORDER }}>Material</div>
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

        {groups.map((g) => (
          <div key={g.key}>
            <div style={{
              padding: '6px 12px', background: '#FBFBFC', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B',
              borderTop: '1px solid ' + BORDER, borderBottom: '1px solid ' + BORDER,
            }}>Mandor · {g.label}</div>
            {g.rows.map((l) => (
              <Row key={l.boqItem.id} l={l} N={N} cols={cols} baseDay={dayAxis.baseDay}
                weekendCols={weekendCols} todayCol={todayCol} ActionButton={ActionButton} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ l, N, cols, baseDay, weekendCols, todayCol, ActionButton }) {
  const ow = dayColOf(l.orderDate, baseDay, N);
  const dw = dayColOf(l.neededDate, baseDay, N);
  const present = [ow, dw].filter((x) => x != null);
  const lo = present.length ? Math.min(...present) : null;
  const hi = present.length ? Math.max(...present) : null;
  const color = TONE[l.tone];

  const tip = [
    l.orderOffset != null ? `Order by day ${l.orderOffset}` : null,
    l.neededOffset != null ? `Needed day ${l.neededOffset}` : null,
    l.hasLead ? `Lead ${l.lead}d${l.leadSource === 'line' ? ' (custom)' : ''}` : 'No lead time',
    l.orderDate ? `order ≈ ${fmtDate(l.orderDate)}` : null,
    l.neededDate ? `needed ≈ ${fmtDate(l.neededDate)}` : null,
    l.actualReceiptDate ? `received ${fmtDate(l.actualReceiptDate)}` : null,
  ].filter(Boolean).join('  ·  ');

  const mk = { gridRow: 1, alignSelf: 'center', justifySelf: 'center', zIndex: 3, width: 12, height: 12, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(15,23,42,0.2)' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 46, borderBottom: '1px solid ' + BORDER }} title={tip}>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5, borderRight: '1px solid ' + BORDER, zIndex: 4, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <span>{l.materialName}</span><ActionButton line={l} />
        </div>
        <LineTags l={l} />
      </div>

      {weekendCols.map((ci) => <span key={'w' + ci} style={{ gridColumn: 2 + ci, gridRow: 1, alignSelf: 'stretch', background: WEEKEND, zIndex: 0 }} />)}
      {todayCol >= 0 && <span style={{ gridColumn: 2 + todayCol, gridRow: 1, alignSelf: 'stretch', background: TODAYBG, zIndex: 0 }} />}

      {lo != null && <span style={{ gridColumn: `${2 + lo} / ${2 + hi + 1}`, gridRow: 1, alignSelf: 'center', height: 7, borderRadius: 999, margin: '0 3px', background: color, zIndex: 1 }} />}
      {ow != null && <span style={{ ...mk, gridColumn: 2 + ow, borderRadius: '50%', background: color }} />}
      {dw != null && <span style={{ ...mk, gridColumn: 2 + dw, borderRadius: 3, transform: 'rotate(45deg)', background: color }} />}
    </div>
  );
}

function LineTags({ l }) {
  const tags = [];
  if (l.deliveryOverdue) tags.push(['Late delivery', TONE.risk, '#FEF2F4']);
  if (l.orderOverdue) tags.push(['Order overdue', TONE.risk, '#FEF2F4']);
  if (l.orderBeforeStart && !l.orderOverdue) tags.push(['Order before start', TONE.risk, '#FEF2F4']);
  if (l.dueThisWeek && l.state === 'to-order' && !l.orderOverdue) tags.push(['Needed this wk', '#B45309', '#FFFBEB']);
  if (l.overBudget) tags.push(['Over budget', TONE.risk, '#FEF2F4']);
  if (l.snoozedActive) tags.push(['Snoozed', '#64748B', '#F1F5F9']);
  if (!l.hasLead) tags.push(['No lead time', '#B45309', '#FFFBEB']);
  if (l.state === 'received') tags.push(['Received', '#15803D', '#F0FDF4']);
  if (!tags.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {tags.map(([t, fg, bg]) => <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.03em', color: fg, background: bg }}>{t}</span>)}
    </div>
  );
}

// ---------- Agenda ----------
function Agenda({ lines, today, db, ActionButton }) {
  const buckets = agendaBuckets(lines, today);
  const mandorName = (id) => db.mandors.find((m) => m.id === id)?.name || 'Unassigned';
  return (
    <>
      {BUCKETS.map(({ key, label }) => {
        const rows = buckets[key];
        if (!rows.length) return null;
        return (
          <div className="card" key={key}>
            <div className="card-head"><h2>{label}</h2><div className="spacer" style={{ flex: 1 }} /><span className="pill gray">{rows.length}</span></div>
            <div className="card-body flush">
              {rows.map((l) => (
                <div key={l.boqItem.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid ' + BORDER }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: TONE[l.tone] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{l.materialName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{mandorName(l.mandorId)} · {l.budget} {l.unit} planned</div>
                  </div>
                  <Milestone l={l} /><ActionButton line={l} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Milestone({ l }) {
  const risk = { color: TONE.risk, fontWeight: 600 };
  const base = { fontSize: 13, color: '#64748B', whiteSpace: 'nowrap' };
  if (l.state === 'received') return <span style={base}>Received {fmtDate(l.actualReceiptDate)}</span>;
  if (l.state === 'to-order') return <span style={{ ...base, ...(l.orderOverdue || l.orderBeforeStart ? risk : {}) }}>Order by {dayLabel(l.orderOffset)}</span>;
  return <span style={{ ...base, ...(l.deliveryOverdue ? risk : {}) }}>Needed {dayLabel(l.neededOffset)}</span>;
}

function Legend() {
  const items = [['Late', TONE.risk], ['Due this week', TONE.amber], ['Ordered', TONE.info], ['Upcoming', TONE.neutral], ['Received', TONE.ok]];
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#64748B', margin: '12px 2px 0' }}>
      {items.map(([t, c]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />{t}</span>)}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}><span style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(15,23,42,.3)', background: '#94A3B8' }} /> order day</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(15,23,42,.3)', background: '#94A3B8', transform: 'rotate(45deg)' }} /> needed day</span>
      <span style={{ color: '#94A3B8' }}>· weekends shaded · bar = lead time</span>
    </div>
  );
}
