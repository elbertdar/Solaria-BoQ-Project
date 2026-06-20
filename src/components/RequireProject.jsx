import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useStore } from '../store/StoreContext.jsx';
import NewProjectModal from './NewProjectModal.jsx';
import { EmptyState } from './ui.jsx';

// Guard for the project-scoped pages (Overview, Schedule, BoQ, Purchase Requests, Balance).
// They all assume a current project; on a fresh/empty install there is none, so instead of
// rendering — and crashing on project.name — we show a single onboarding state that lets the
// user create their first project right here.
export default function RequireProject({ children }) {
  const { db, addProject, setCurrentProjectId } = useStore();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  if (db.projects.length > 0) return children;

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
