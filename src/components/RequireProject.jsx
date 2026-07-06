import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Archive } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import { fmtDate } from '../engine/format.js';
import NewProjectModal from './NewProjectModal.jsx';
import { EmptyState } from './ui.jsx';

// Guard for the project-scoped pages (Overview, Schedule, BoQ, Purchase Requests, Balance).
// They all assume a current project; on a fresh/empty install there is none, so instead of
// rendering — and crashing on project.name — we show a single onboarding state that lets the
// user create their first project right here. For a COMPLETED project the pages stay
// browsable (the archive is the point) but get a persistent notice so nobody edits an
// archived project without realizing it.
export default function RequireProject({ children }) {
  const { db, currentProjectId, addProject, setCurrentProjectId } = useStore();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  if (db.projects.length > 0) {
    const project = db.projects.find((p) => p.id === currentProjectId) || db.projects[0];
    return (
      <>
        {project?.completedAt && (
          <div className="banner" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.3 }}>
            <Archive size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{project.name} was completed {fmtDate(project.completedAt)}</b> — this is its archived record. Changes made here alter the history.</span>
            <Link to="/projects" style={{ fontWeight: 600, color: 'inherit', whiteSpace: 'nowrap' }}>Manage on Projects →</Link>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>No project yet</h1>
        <p className="sub">This page works on a single project — create one to begin.</p>
      </div>
      <EmptyState
        icon={Building2}
        title="Create your first project"
        message="A project holds its bill of quantities, schedule, and purchase requests. Add one to start planning and ordering."
        action={<button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>}
      />
      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreate={(vals) => { const id = addProject(vals); setCreating(false); setCurrentProjectId(id); nav('/boq'); }}
        />
      )}
    </>
  );
}
