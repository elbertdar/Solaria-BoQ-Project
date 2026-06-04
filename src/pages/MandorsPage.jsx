import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from '../components/Modal.jsx';
import { FilterBar, FilterSearch } from '../components/ui.jsx';

export default function MandorsPage() {
  const { db, addMandor, updateMandor, deleteMandor } = useStore();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [q, setQ] = useState('');

  const usage = (id) => db.boqItems.filter((b) => b.mandorId === id).length;
  const filtered = db.mandors.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Mandors</h1>
          <p className="sub">Site crew leads — each BoQ line is assigned to a mandor, marking who on site needs the material.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>+ Add mandor</button>
      </div>

      <FilterBar shown={filtered.length} total={db.mandors.length} unit="mandors">
        <FilterSearch value={q} onChange={setQ} placeholder="Search mandor…" />
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead><tr><th>Mandor</th><th className="num">BoQ lines assigned</th><th></th></tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td className="num">{usage(m.id)}</td>
                  <td className="num"><button className="btn sm ghost" onClick={() => setEditing(m)}>Edit</button></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={3}><div className="empty">{db.mandors.length === 0 ? 'No mandors yet. Add the first one.' : 'No mandors match your search.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <MandorModal
          mandor={editing}
          usage={editing ? usage(editing.id) : 0}
          onClose={() => setEditing(undefined)}
          onSave={(name) => { if (editing) updateMandor(editing.id, { name }); else addMandor(name); setEditing(undefined); }}
          onDelete={() => { deleteMandor(editing.id); setEditing(undefined); }}
        />
      )}
    </>
  );
}

function MandorModal({ mandor, usage, onClose, onSave, onDelete }) {
  const [name, setName] = useState(mandor?.name || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editing = !!mandor;
  const trimmed = name.trim();
  const locked = usage > 0; // can't delete while still assigned to BoQ lines

  return (
    <Modal
      title={editing ? `Edit · ${mandor.name}` : 'Add mandor'}
      onClose={onClose}
      footer={<>
        {editing && (
          locked ? (
            <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5 }}>
              Assigned to {usage} BoQ line{usage === 1 ? '' : 's'} — reassign those before deleting
            </span>
          ) : confirmingDelete ? (
            <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13 }}>Delete this mandor?</span>
              <button className="btn sm danger" onClick={onDelete}>Confirm delete</button>
              <button className="btn sm ghost" onClick={() => setConfirmingDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn sm ghost" style={{ marginRight: 'auto', color: 'var(--risk)' }}
              onClick={() => setConfirmingDelete(true)}>Delete…</button>
          )
        )}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!trimmed} onClick={() => onSave(trimmed)}>
          {editing ? 'Save changes' : 'Add mandor'}
        </button>
      </>}
    >
      <label className="lbl">Mandor name <span className="req">*</span></label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pak Budi" autoFocus />
    </Modal>
  );
}
