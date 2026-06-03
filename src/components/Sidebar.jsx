import { NavLink } from 'react-router-dom';
import { useStore } from '../store/StoreContext.jsx';
import { projectWarnings } from '../engine/reconcile.js';
import { scheduleForProject, scheduleCounts } from '../engine/schedule.js';

const GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', ico: '◳', label: 'Project Overview', end: true },
      { to: '/reconciliation', ico: '⇄', label: 'Balance', badgeKey: 'warn' },
      { to: '/schedule', ico: '◷', label: 'Schedule', badgeKey: 'sched' },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { to: '/boq', ico: '☰', label: 'Bill of Quantities' },
      { to: '/purchase-requests', ico: '⛁', label: 'Purchase Requests' },
      { to: '/suppliers', ico: '⌂', label: 'Suppliers' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/catalogue', ico: '✦', label: 'Material Catalogue' },
    ],
  },
];

export default function Sidebar() {
  const { db, currentProjectId } = useStore();
  const warnCount = projectWarnings(db, currentProjectId).length;
  const sched = scheduleCounts(scheduleForProject(db, currentProjectId).lines);
  const overdueCount = sched.overdueOrder + sched.overdueDeliver;

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
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <span className="ico">{it.ico}</span>
                <span>{it.label}</span>
                {it.badgeKey === 'warn' && warnCount > 0 && (
                  <span className="badge risk">{warnCount}</span>
                )}
                {it.badgeKey === 'sched' && overdueCount > 0 && (
                  <span className="badge risk">{overdueCount}</span>
                )}
              </NavLink>
            ))}
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
