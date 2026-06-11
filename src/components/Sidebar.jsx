import { NavLink } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { projectWarnings } from '../engine/reconcile.js';
import { scheduleForProject, scheduleCounts, portfolioWorklist } from '../engine/schedule.js';

const GROUPS = [
  {
    label: 'Portfolio',
    items: [
      { to: '/', ico: '◧', label: 'This Week', end: true, badgeKey: 'portfolio' },
      { to: '/projects', ico: '▦', label: 'Projects' },
    ],
  },
  {
    label: 'Project',
    items: [
      { to: '/overview', ico: '◳', label: 'Overview' },
      { to: '/schedule', ico: '◷', label: 'Schedule', badgeKey: 'sched' },
      { to: '/boq', ico: '☰', label: 'Bill of Quantities' },
      { to: '/purchase-requests', ico: '⛁', label: 'Purchase Requests' },
      { to: '/reconciliation', ico: '⇄', label: 'Balance', badgeKey: 'warn' },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/suppliers', ico: '⌂', label: 'Suppliers' },
      { to: '/catalogue', ico: '✦', label: 'Material Catalogue' },
      { to: '/material-types', ico: '⊞', label: 'Material Types' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/mandors', ico: '⚑', label: 'Mandors' },
      { to: '/users', ico: '◎', label: 'Team' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/trash', ico: '🗑', label: 'Trash', badgeKey: 'trash' },
    ],
  },
];

export default function Sidebar() {
  const { db, currentProjectId } = useStore();
  const warnCount = projectWarnings(db, currentProjectId).length;
  const sched = scheduleCounts(scheduleForProject(db, currentProjectId).lines);
  const overdueCount = sched.overdueOrder + sched.overdueDeliver;
  const wl = portfolioWorklist(db);
  const portfolioCount = wl.counts.overdueToOrder + wl.counts.lateDelivery;
  const trashCount = (db.trash || []).length;

  const project = db.projects.find((p) => p.id === currentProjectId) || db.projects[0];

  const badgeFor = (key) => (key === 'portfolio' ? portfolioCount : key === 'sched' ? overdueCount : key === 'warn' ? warnCount : 0);
  const countFor = (key) => (key === 'trash' ? trashCount : badgeFor(key));

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="mark">S</div>
        <div className="name">Solaria<small>Procurement · BoQ Control</small></div>
      </div>

      <nav className="sb-nav">
        {GROUPS.map((g) => (
          <div className="sb-group" key={g.label}>
            <div className="sb-group-label">{g.label}</div>
            {g.label === 'Project' && project && (
              <div className="muted" title={project.code || ''} style={{ fontSize: 11, padding: '0 10px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
            )}
            {g.items.map((it) => {
              const isTrash = it.badgeKey === 'trash';
              const n = isTrash ? trashCount : badgeFor(it.badgeKey);
              return (
                <NavLink key={it.to} to={it.to} end={it.end}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                  <span className="ico">{it.ico}</span>
                  <span>{it.label}</span>
                  {n > 0 && <span className={'badge' + (isTrash ? '' : ' risk')}>{n}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-user">
        <div className="avatar">{initials(db.currentUser?.name)}</div>
        <div className="who">
          <b>{db.currentUser?.name}</b>
          <span>{db.currentUser?.role}</span>
        </div>
      </div>
    </aside>
  );
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
