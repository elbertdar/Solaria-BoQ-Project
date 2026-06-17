import { useState } from 'react';
import Modal from './Modal.jsx';
import { useStore, useProjectPhases } from '../store/StoreContext.jsx';
import ManagePhasesModal from './ManagePhasesModal.jsx';

// Phase scope bar shown on every project-specific page. Tabs set the global currentPhaseId
// ('__all' = whole project). A status dot marks each phase draft (grey) vs working (green).
// "Manage phases" opens add / rename / reorder / delete. Keeps ≥1 phase per project.
export default function PhaseTabs({ allowAll = true }) {
  const { currentPhaseId, setCurrentPhaseId } = useStore();
  const phases = useProjectPhases();
  const [manage, setManage] = useState(false);

  return (
    <div className="phase-tabs">
      <div className="phase-tabs-row">
        <span className="phase-tabs-cap">Phase</span>
        {allowAll && (
          <button className={'phase-tab' + (currentPhaseId === '__all' ? ' active' : '')} onClick={() => setCurrentPhaseId('__all')}>All phases</button>
        )}
        {phases.map((ph) => (
          <button key={ph.id} className={'phase-tab' + (currentPhaseId === ph.id ? ' active' : '')} onClick={() => setCurrentPhaseId(ph.id)} title={ph.boqStatus === 'working' ? 'Finalized — in procurement' : 'Draft'}>
            <span className="pdot" style={{ background: ph.boqStatus === 'working' ? 'var(--ok)' : 'var(--muted)' }} />
            {ph.name}
          </button>
        ))}
        <button className="btn sm ghost" style={{ marginLeft: 4 }} onClick={() => setManage(true)}>Manage phases</button>
      </div>
      {manage && <ManagePhasesModal onClose={() => setManage(false)} />}
    </div>
  );
}
