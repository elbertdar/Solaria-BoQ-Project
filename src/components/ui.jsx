import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { PR_STATUS } from '../theme.js';
import { computeLine, todayLocal } from '../engine/schedule.js';

export function KpiCard({ label, value, tone = '', sub, subTone = '', onClick }) {
  const clickable = typeof onClick === 'function';
  return (
    <div className={'kpi' + (clickable ? ' clickable' : '')} onClick={onClick}
      role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className={'value ' + tone}>{value}</div>
      {sub != null && <div className={'sub ' + subTone}>{sub}{clickable ? ' →' : ''}</div>}
    </div>
  );
}

export function AlertBanner({ tone = 'risk', title, children, action }) {
  return (
    <div className={'banner ' + tone}>
      <span className="dot" />
      <span className="txt"><b>{title}</b>{children ? ' — ' : ''}{children}</span>
      {action}
    </div>
  );
}

export function StatusPill({ status }) {
  const s = PR_STATUS[status] || { label: status, pill: 'gray' };
  return <span className={'pill ' + s.pill}><span className="pdot" style={pdot(s.pill)} />{s.label}</span>;
}

export function OverPill({ over }) {
  return over
    ? <span className="pill risk">Over budget</span>
    : <span className="pill ok">Within budget</span>;
}

function pdot(pill) {
  const map = { gray: '#94A3B8', info: '#0891B2', amber: '#F59E0B', ok: '#16A34A', risk: '#E11D48' };
  return { background: map[pill] || '#94A3B8' };
}

const PB = {
  ink: '#0F172A', muted: '#64748B', faint: '#94A3B8', border: '#E5E7EB',
  risk: '#E11D48', riskBg: '#FEF2F4', ok: '#16A34A', hover: '#F7F8FA', sel: '#F1F5F9',
};

const HEALTH = {
  attention: { label: 'Needs attention', dot: PB.risk, order: 0 },
  ontrack: { label: 'On track', dot: '#0EA5E9', order: 1 },
  done: { label: 'Done', dot: PB.ok, order: 2 },
};

function projectHealth(db, projectId, today) {
  const items = db.boqItems.filter((b) => b.projectId === projectId);
  if (items.length === 0) return { key: 'ontrack', attention: 0, open: 0, total: 0 };
  let attention = 0, open = 0;
  for (const b of items) {
    const l = computeLine(db, b, today);
    if (l.state !== 'received') open++;
    if (l.orderOverdue || l.deliveryOverdue) attention++;
  }
  const key = open === 0 ? 'done' : attention > 0 ? 'attention' : 'ontrack';
  return { key, attention, open, total: items.length };
}

const fmtProject = (p) => (p?.code ? `${p.name} (${p.code})` : p?.name || 'Untitled');

export function ProjectBar({ children }) {
  const { db, currentProjectId, setCurrentProjectId } = useStore();
  const nav = useNavigate();
  const today = todayLocal();
  const proj = db.projects.find((p) => p.id === currentProjectId);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const decorated = useMemo(() => db.projects.map((p) => ({
    p, health: projectHealth(db, p.id, today), label: fmtProject(p),
  })), [db, today]);

  const term = q.trim().toLowerCase();
  const matches = decorated.filter(({ p }) =>
    !term || p.name.toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term));

  const groups = useMemo(() => {
    const m = new Map();
    for (const d of matches) { if (!m.has(d.health.key)) m.set(d.health.key, []); m.get(d.health.key).push(d); }
    return [...m.entries()]
      .sort((a, b) => HEALTH[a[0]].order - HEALTH[b[0]].order)
      .map(([key, rows]) => ({ key, rows: rows.sort((a, b) => b.health.attention - a.health.attention || a.p.name.localeCompare(b.p.name)) }));
  }, [matches]);

  const pick = (id) => { setCurrentProjectId(id); setOpen(false); setQ(''); };
  const goAll = () => { setOpen(false); setQ(''); nav('/'); };

  return (
    <div className="proj-bar" ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', font: 'inherit',
        background: '#fff', border: '1px solid ' + (open ? PB.ink : PB.border), borderRadius: 9,
        padding: '8px 12px', minWidth: 280, textAlign: 'left',
        boxShadow: open ? 'inset 0 0 0 1px ' + PB.ink : 'none',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: PB.faint }}>Project</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <b style={{ color: PB.ink }}>{proj?.name || 'Select…'}</b>
          {proj?.code && <span style={{ color: PB.muted }}> ({proj.code})</span>}
        </span>
        <span style={{ color: PB.faint, fontSize: 11 }}>▾</span>
      </button>
      <span className="meta" style={{ color: PB.faint, fontSize: 12.5, marginLeft: 10 }}>{proj?.location}</span>
      <div className="spacer" style={{ flex: 1 }} />
      {children}

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 360, maxWidth: '90vw',
          background: '#fff', border: '1px solid ' + PB.border, borderRadius: 11,
          boxShadow: '0 12px 32px rgba(15,23,42,0.16)', overflow: 'hidden',
        }}>
          <div style={{ padding: 9, borderBottom: '1px solid ' + PB.border }}>
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter projects by name or code…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid ' + PB.border, borderRadius: 7, font: 'inherit', fontSize: 13 }} />
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <Row onClick={goAll} icon="◧" title="All projects" sub="portfolio · This Week dashboard" accent />

            {groups.length === 0 && <div style={{ padding: '16px', color: PB.faint, fontSize: 13, textAlign: 'center' }}>No projects match “{q}”.</div>}

            {groups.map(({ key, rows }) => (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: PB.muted }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: HEALTH[key].dot }} />
                  {HEALTH[key].label}<span style={{ color: PB.faint, fontWeight: 600 }}>· {rows.length}</span>
                </div>
                {rows.map(({ p, health, label }) => {
                  const cur = p.id === currentProjectId;
                  return (
                    <div key={p.id} onClick={() => pick(p.id)} title={label}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', cursor: 'pointer', background: cur ? PB.sel : 'transparent' }}
                      onMouseEnter={(e) => { if (!cur) e.currentTarget.style.background = PB.hover; }}
                      onMouseLeave={(e) => { if (!cur) e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ width: 14, color: PB.ok, fontWeight: 700 }}>{cur ? '✓' : ''}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: cur ? 700 : 500, color: PB.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}{p.code && <span style={{ color: PB.muted, fontWeight: 400 }}> ({p.code})</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: PB.faint }}>{health.total} items · {health.open} open</div>
                      </div>
                      {health.attention > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: PB.risk, background: PB.riskBg, borderRadius: 999, padding: '1px 8px' }}>{health.attention}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ onClick, icon, title, sub, accent }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', cursor: 'pointer', borderBottom: '1px solid ' + PB.border, background: accent ? '#FBFCFE' : 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = PB.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = accent ? '#FBFCFE' : 'transparent'; }}>
      <span style={{ width: 14, color: PB.faint }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: PB.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: PB.faint }}>{sub}</div>
      </div>
      <span style={{ color: PB.faint, fontSize: 12 }}>→</span>
    </div>
  );
}
