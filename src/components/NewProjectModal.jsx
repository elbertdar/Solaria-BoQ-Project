import { useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { today as todayISO } from '../engine/format.js';

// Shared "New project" dialog. onCreate({ name, startDate, code, projectTypeId }) — caller does addProject + nav.
// Project type is a typeahead/combobox over the existing projectTypes "history" (spans all projects,
// completed included): browse on focus, filter as you type, pick an existing one or add a new one.
export default function NewProjectModal({ onClose, onCreate }) {
  const { db, addProjectType } = useStore();
  const types = db.projectTypes || [];
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [code, setCode] = useState('');
  const [typeQuery, setTypeQuery] = useState('');
  const [typeId, setTypeId] = useState(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [error, setError] = useState('');

  const q = typeQuery.trim().toLowerCase();
  const suggestions = q ? types.filter((t) => t.name.toLowerCase().includes(q)) : types;
  const exact = types.find((t) => t.name.toLowerCase() === q);

  const pick = (t) => { setTypeId(t.id); setTypeQuery(t.name); setTypeOpen(false); };

  function save() {
    if (!name.trim()) { setError('Project name is required.'); return; }
    if (!startDate) { setError('Start date is required — the schedule counts days from it.'); return; }
    let projectTypeId = typeId;
    const qq = typeQuery.trim();
    if (!projectTypeId && qq) {                                  // typed text, no pick → reuse by name or create
      const existing = types.find((t) => t.name.toLowerCase() === qq.toLowerCase());
      projectTypeId = existing ? existing.id : addProjectType({ name: qq });
    }
    onCreate({ name: name.trim(), startDate, code: code.trim(), projectTypeId: projectTypeId || null });
  }

  return (
    <Modal title="New project" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Create project</button></>}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Project name <span className="req">*</span></label>
          <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Solaria — Mall Taman Anggrek" />
        </div>
        <div>
          <label className="lbl">Start date <span className="req">*</span></label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <div className="help">All needed/order days count from this.</div>
        </div>
        <div>
          <label className="lbl">Code (optional)</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SOL-TA-26" />
        </div>
        <div className="full">
          <label className="lbl">Project type <span className="muted">(optional)</span></label>
          <input type="text" value={typeQuery} placeholder="Search or add a type — e.g. Mall, New store…"
            onChange={(e) => { setTypeQuery(e.target.value); setTypeId(null); setTypeOpen(true); }}
            onFocus={() => setTypeOpen(true)}
            onBlur={() => setTypeOpen(false)} />
          {typeOpen && (suggestions.length > 0 || (q && !exact)) && (
            <div className="suggest">
              {suggestions.map((t) => (
                <div className="suggest-item" key={t.id} onMouseDown={() => pick(t)}>
                  <span>{t.name}</span>
                </div>
              ))}
              {q && !exact && (
                <div className="suggest-item" onMouseDown={() => setTypeOpen(false)}>
                  <span>➕ Add “{typeQuery.trim()}” as a new type</span>
                </div>
              )}
            </div>
          )}
          {types.length > 0 && !typeOpen && <div className="help">Pick an existing type or type a new one — used types are remembered.</div>}
        </div>
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
