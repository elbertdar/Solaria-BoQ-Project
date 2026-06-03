import { useState } from 'react';
import Modal from './Modal.jsx';
import { today } from '../engine/format.js';

export default function ReceiveModal({ title, onClose, onConfirm }) {
  const [date, setDate] = useState(today());
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!date} onClick={() => date && onConfirm(date)}>Confirm receipt</button>
      </>}
    >
      <p className="help" style={{ marginTop: 0 }}>A PR can’t be marked received without a receipt date (BR-4).</p>
      <label className="lbl">Receipt date <span className="req">*</span></label>
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
    </Modal>
  );
}
