import { useState } from 'react';
import Modal from './Modal.jsx';
import { today as todayISO } from '../engine/format.js';

// Shared "New project" dialog. onCreate({ name, startDate, code }) — caller does addProject + navigation.
export default function NewProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  function save() {
    if (!name.trim()) { setError('Project name is required.'); return; }
    if (!startDate) { setError('Start date is required — the schedule counts days from it.'); return; }
    onCreate({ name: name.trim(), startDate, code: code.trim() });
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
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
