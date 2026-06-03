import { useStore } from '../store/StoreContext.jsx';
import { PR_STATUS } from '../theme.js';

export function KpiCard({ label, value, tone = '', sub, subTone = '' }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={'value ' + tone}>{value}</div>
      {sub != null && <div className={'sub ' + subTone}>{sub}</div>}
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

export function ProjectBar({ children }) {
  const { db, currentProjectId, setCurrentProjectId } = useStore();
  const proj = db.projects.find((p) => p.id === currentProjectId);
  return (
    <div className="proj-bar">
      <select value={currentProjectId} onChange={(e) => setCurrentProjectId(e.target.value)}>
        {db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <span className="meta">{proj?.code} · {proj?.location}</span>
      <div className="spacer" style={{ flex: 1 }} />
      {children}
    </div>
  );
}
