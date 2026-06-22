import { NavLink } from 'react-router-dom';
import {
  CalendarDays, Building2, ClipboardList, LayoutDashboard, CalendarClock,
  ListChecks, ShoppingCart, Scale, Truck, Package, Layers, HardHat, Users, Trash2,
} from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import { projectWarnings } from '../engine/reconcile.js';
import { scheduleForProject, scheduleCounts, portfolioWorklist } from '../engine/schedule.js';

const GROUPS = [
  {
    label: 'Portfolio',
    items: [
      { to: '/', ico: CalendarDays, label: 'This Week', end: true, badgeKey: 'portfolio' },
      { to: '/projects', ico: Building2, label: 'Projects' },
      { to: '/all-purchase-requests', ico: ClipboardList, label: 'All Purchase Requests' },
    ],
  },
  {
    label: 'Project',
    items: [
      { to: '/overview', ico: LayoutDashboard, label: 'Overview' },
      { to: '/schedule', ico: CalendarClock, label: 'Schedule', badgeKey: 'sched' },
      { to: '/boq', ico: ListChecks, label: 'Bill of Quantities' },
      { to: '/purchase-requests', ico: ShoppingCart, label: 'Purchase Requests' },
      { to: '/reconciliation', ico: Scale, label: 'Balance', badgeKey: 'warn' },
    ],
  },
  {
    label: 'Library',
    items: [
      { to: '/suppliers', ico: Truck, label: 'Suppliers' },
      { to: '/catalogue', ico: Package, label: 'Material Catalogue' },
      { to: '/material-types', ico: Layers, label: 'Material Types' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/mandors', ico: HardHat, label: 'Mandors' },
      { to: '/users', ico: Users, label: 'Team' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/trash', ico: Trash2, label: 'Trash', badgeKey: 'trash' },
    ],
  },
];

export default function Sidebar() {
  const { db, currentProjectId, setCurrentProjectId } = useStore();
  const warnCount = projectWarnings(db, currentProjectId).length;
  const sched = scheduleCounts(scheduleForProject(db, currentProjectId).lines);
  const overdueCount = sched.overdueOrder + sched.overdueDeliver;
  const wl = portfolioWorklist(db);
  const portfolioCount = wl.counts.overdueToOrder + wl.counts.lateDelivery;
  const trashCount = (db.trash || []).length;

  const project = db.projects.find((p) => p.id === currentProjectId) || db.projects[0];

  const badgeFor = (key) => (key === 'portfolio' ? portfolioCount : key === 'sched' ? overdueCount : key === 'warn' ? warnCount : 0);

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
            {g.label === 'Project' && (
              <div style={{ padding: '0 10px 8px' }}>
                {db.projects.length === 0 ? (
                  <div className="muted" style={{ fontSize: 11 }}>No project yet</div>
                ) : (
                  <select className="sb-proj-select" value={project?.id || ''} title={project?.code || ''}
                    onChange={(e) => setCurrentProjectId(e.target.value)}>
                    {db.projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {g.items.map((it) => {
              const isTrash = it.badgeKey === 'trash';
              const n = isTrash ? trashCount : badgeFor(it.badgeKey);
              const Icon = it.ico;
              return (
                <NavLink key={it.to} to={it.to} end={it.end}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                  <span className="ico"><Icon size={16} strokeWidth={1.75} /></span>
                  <span>{it.label}</span>
                  {n > 0 && <span className={'badge' + (isTrash ? '' : ' risk')}>{n}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-pilot">
        <b>Pilot version.</b> Your data is saved only in this browser on this device. Don’t enter anything you can’t afford to re-enter.
      </div>

      <div className="sb-user">
        <div className="avatar">{initials(db.currentUser?.name)}</div>
        <div className="who">
          {db.currentUser ? (
            <>
              <b>{db.currentUser.name}</b>
              <span>{db.currentUser.role}</span>
            </>
          ) : (
            <>
              <b>No user yet</b>
              <span>Add your team to begin</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
