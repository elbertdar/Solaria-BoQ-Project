import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Modal from './Modal.jsx';
import { useStore, useProjectPhases } from '../store/StoreContext.jsx';

// Add / rename / reorder / delete phases for the current project. A project keeps ≥1 phase;
// deleting a phase with items warns and cascades its items + linked PRs.
export default function ManagePhasesModal({ onClose }) {
  const { db, currentProjectId, currentPhaseId, setCurrentPhaseId, addPhase, updatePhase, reorderPhase, deletePhase } = useStore();
  const phases = useProjectPhases();
  const [newName, setNewName] = useState('');
  const itemCount = (phaseId) => db.boqItems.filter((b) => b.phaseId === phaseId).length;

  const add = () => {
    const n = newName.trim(); if (!n) return;
    addPhase(currentProjectId, n);
    setNewName('');
  };
  const remove = (ph) => {
    const n = itemCount(ph.id);
    const msg = n > 0
      ? `Delete “${ph.name}”? Its ${n} BoQ item${n === 1 ? '' : 's'} and any linked purchase requests will be permanently removed.`
      : `Delete “${ph.name}”?`;
    if (!window.confirm(msg)) return;
    if (currentPhaseId === ph.id) setCurrentPhaseId('__all');
    deletePhase(ph.id);
  };

  return (
    <Modal title="Phases" onClose={onClose} footer={<button className="btn ghost" onClick={onClose}>Done</button>}>
      <p className="help" style={{ marginTop: 0 }}>Each phase drafts and finalizes its own BoQ independently — e.g. Foundation, then Interior. Phases can overlap in time. Every project keeps at least one phase.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {phases.map((ph, i) => {
          const n = itemCount(ph.id);
          return (
            <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span className="pdot" style={{ width: 8, height: 8, borderRadius: '50%', background: ph.boqStatus === 'working' ? 'var(--ok)' : 'var(--muted)', flexShrink: 0 }} />
              <input className="input" value={ph.name} onChange={(e) => updatePhase(ph.id, { name: e.target.value })}
                style={{ flex: 1, fontWeight: 600 }} />
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{n} item{n === 1 ? '' : 's'} · {ph.boqStatus === 'working' ? 'working' : 'draft'}</span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <button className="btn sm ghost" disabled={i === 0} onClick={() => reorderPhase(ph.id, -1)} title="Move up" style={{ padding: '2px 7px' }}><ChevronUp size={14} /></button>
                <button className="btn sm ghost" disabled={i === phases.length - 1} onClick={() => reorderPhase(ph.id, 1)} title="Move down" style={{ padding: '2px 7px' }}><ChevronDown size={14} /></button>
                <button className="btn sm ghost" disabled={phases.length <= 1} style={{ color: phases.length <= 1 ? undefined : 'var(--risk)' }}
                  title={phases.length <= 1 ? 'A project needs at least one phase' : 'Delete phase'} onClick={() => remove(ph)}>Delete</button>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <input className="input" value={newName} placeholder="New phase name — e.g. Interior fit-out" style={{ flex: 1 }}
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn primary" onClick={add} disabled={!newName.trim()}>Add phase</button>
      </div>
    </Modal>
  );
}
