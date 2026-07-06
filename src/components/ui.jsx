import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, ChevronDown, Check, ArrowRight, LayoutGrid, X } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from './Modal.jsx';
import { statusDef, PILL_DOT } from '../engine/status.js';
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
      {sub != null && <div className={'sub ' + subTone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{sub}{clickable && <ArrowRight size={12} />}</div>}
    </div>
  );
}

// Full-card empty / onboarding state: a centered icon, heading, one line of guidance,
// and an optional call-to-action. Used for first-run screens (no projects yet) and any
// page whose collection is empty. `icon` is a Lucide icon component.
export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{Icon && <Icon size={26} strokeWidth={1.5} />}</div>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {action && <div className="empty-state-action">{action}</div>}
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
  const { db } = useStore();
  const s = statusDef(db, status);
  return <span className={'pill ' + (s.pill || 'gray')}><span className="pdot" style={pdot(s.pill)} />{s.label}</span>;
}

// Inline coloured pill for ad-hoc fg/bg pairs (entity badges, project status) where the
// .pill.* CSS classes don't fit. One definition instead of the same style object in five files.
export function Pill({ children, fg, bg, title }) {
  return <span title={title} style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: fg, background: bg, whiteSpace: 'nowrap' }}>{children}</span>;
}

// Shared delete-confirmation shell. `blocked` swaps the body + footer (Close-only) so callers
// only supply their entity-specific ref counts and copy. Used by material/type deletes.
export function DeleteConfirm({ title, blocked, blockedMsg, confirmMsg, confirmLabel = 'Move to Trash', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={blocked
        ? <button className="btn" onClick={onClose}>Close</button>
        : <>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
          </>}>
      <p style={{ margin: 0, lineHeight: 1.6 }}>{blocked ? blockedMsg : confirmMsg}</p>
    </Modal>
  );
}

function pdot(pill) {
  return { background: PILL_DOT[pill] || PILL_DOT.gray };
}

// Fulfilment pill for a BoQ line ('complete' | 'ordered' | 'none') — was an inline
// ternary with a magic green hex triple in three different tables.
export function BoqLineStatusPill({ status }) {
  if (status === 'complete') return <span className="pill ok" style={{ border: '1px solid #D1FAE5' }}>Complete</span>;
  if (status === 'ordered') return <span className="pill info">Ordered</span>;
  return <span className="pill gray">Not ordered</span>;
}

// Select-all checkbox with the DOM-only indeterminate state wired up.
export function TriStateCheckbox({ checked, indeterminate, onChange, title }) {
  return (
    <input type="checkbox" checked={checked} title={title} onChange={onChange}
      ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; }} />
  );
}

const PB = {
  ink: '#0F172A', muted: '#64748B', faint: '#94A3B8', border: 'var(--border)',
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

export function ProjectBar({ children, embedded }) {
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
    <div className={embedded ? '' : 'proj-bar'} ref={wrapRef} style={{ position: 'relative', ...(embedded ? { display: 'inline-block' } : {}) }}>
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
        <ChevronDown size={14} style={{ color: PB.faint, flexShrink: 0 }} />
      </button>
      {!embedded && <span className="meta" style={{ color: PB.faint, fontSize: 12.5, marginLeft: 10 }}>{proj?.location}</span>}
      {!embedded && <div className="spacer" style={{ flex: 1 }} />}
      {!embedded && children}

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
            <Row onClick={goAll} icon={<LayoutGrid size={15} />} title="All projects" sub="portfolio · This Week dashboard" accent />

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
                      <span style={{ width: 14, color: PB.ok, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{cur && <Check size={14} strokeWidth={2.5} />}</span>
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
      <span style={{ width: 14, color: PB.faint, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: PB.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: PB.faint }}>{sub}</div>
      </div>
      <ArrowRight size={14} style={{ color: PB.faint, flexShrink: 0 }} />
    </div>
  );
}

// ---- Reusable filter/search bar for detailed-table pages ----
// Lays out controls (in the order given) on the left and a "Showing X of Y" count on the right.
export function FilterBar({ children, shown, total, unit = 'rows' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 16px' }}>
      {children}
      <div style={{ flex: 1, minWidth: 8 }} />
      {total != null && (
        <span style={{ fontSize: 12.5, color: '#94A3B8', whiteSpace: 'nowrap' }}>
          Showing {shown} of {total} {unit}
        </span>
      )}
    </div>
  );
}

export function FilterSearch({ value, onChange, placeholder = 'Search…', width = 260 }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width, maxWidth: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 9, font: 'inherit', fontSize: 13.5 }} />
  );
}

// options: [{ value, label }]; allLabel renders the default "" option (e.g. "All statuses").
export function FilterSelect({ value = [], onChange, options, allLabel = 'All', width = 170 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const sel = Array.isArray(value) ? value : (value ? [value] : []);   // tolerate legacy string
  const selSet = new Set(sel);
  const toggle = (v) => onChange(selSet.has(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  const labelFor = (v) => options.find((o) => o.value === v)?.label ?? v;
  const text = sel.length === 0 ? allLabel : sel.length === 1 ? labelFor(sel[0]) : `${sel.length} selected`;

  return (
    <div ref={ref} style={{ position: 'relative', width }}>
      <button type="button" className="input" onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: sel.length ? 'var(--ink)' : 'var(--muted)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        {sel.length > 0 && (
          <span role="button" title="Clear" onClick={(e) => { e.stopPropagation(); onChange([]); }}
            style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', padding: '0 2px' }}><X size={14} /></span>
        )}
        <ChevronDown size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div className="filter-pop">
          <div className="filter-pop-item" onClick={() => onChange([])}
            style={{ fontWeight: sel.length ? 400 : 600, color: sel.length ? 'var(--muted)' : 'var(--ink)' }}>
            {allLabel}
          </div>
          {options.map((o) => (
            <label key={o.value} className="filter-pop-item">
              <input type="checkbox" checked={selSet.has(o.value)} onChange={() => toggle(o.value)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
            </label>
          ))}
          {options.length === 0 && <div className="filter-pop-item" style={{ color: 'var(--muted)' }}>No options</div>}
        </div>
      )}
    </div>
  );
}
