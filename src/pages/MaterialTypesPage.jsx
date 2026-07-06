import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from '../components/Modal.jsx';
import { FilterBar, FilterSearch, DeleteConfirm } from '../components/ui.jsx';

export default function MaterialTypesPage() {
  const { db, addMaterialType, updateMaterialType, softDeleteMaterialType } = useStore();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [delFor, setDelFor] = useState(null);
  const [q, setQ] = useState('');

  const usageCount = (typeId) => db.materials.filter((m) => m.materialTypeId === typeId).length;

  const filtered = db.materialTypes.filter((t) => {
    if (!q) return true;
    return (t.name + ' ' + (t.description || '')).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Material Types</h1>
          <p className="sub">The category list every material, supplier, and filter draws from — edit here and it updates everywhere.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(null)}>+ Add type</button>
      </div>

      <FilterBar shown={filtered.length} total={db.materialTypes.length} unit="types">
        <FilterSearch value={q} onChange={setQ} placeholder="Search type or description…" />
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead><tr><th>Material type</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {filtered.map((t) => {
                const used = usageCount(t.id);
                return (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>
                      {t.name}
                      <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                        {used} material{used === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className={t.description ? '' : 'muted'}>{t.description || '—'}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm ghost" onClick={() => setEditing(t)}>Edit</button>{' '}
                      <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => setDelFor(t)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={3}><div className="empty">{db.materialTypes.length === 0 ? 'No material types yet. Add the first one.' : 'No types match your search.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <TypeModal
          type={editing}
          existing={db.materialTypes}
          onClose={() => setEditing(undefined)}
          onSave={(data) => {
            if (editing) updateMaterialType(editing.id, data);
            else addMaterialType(data);
            setEditing(undefined);
          }}
        />
      )}
      {delFor && <DeleteType type={delFor} db={db} onClose={() => setDelFor(null)}
        onConfirm={() => { softDeleteMaterialType(delFor.id); setDelFor(null); }} />}
    </>
  );
}

function DeleteType({ type, db, onClose, onConfirm }) {
  const mats = db.materials.filter((m) => m.materialTypeId === type.id).length;
  const sups = db.suppliers.filter((s) => (s.materialTypeIds || []).includes(type.id)).length;
  const blocked = mats > 0 || sups > 0;
  return (
    <DeleteConfirm title={`Delete · ${type.name}`} blocked={blocked} onClose={onClose} onConfirm={onConfirm}
      blockedMsg={<>
        <b>{type.name}</b> is in use — it can’t be deleted while{' '}
        {mats > 0 && <b>{mats} material{mats === 1 ? '' : 's'}</b>}{mats > 0 && sups > 0 ? ' and ' : ''}
        {sups > 0 && <b>{sups} supplier{sups === 1 ? '' : 's'}</b>} reference it. Reassign those first.
      </>}
      confirmMsg={<>Delete <b>{type.name}</b>? It’s unused, and can be restored from Trash for 7 days.</>} />
  );
}

function TypeModal({ type, existing, onClose, onSave }) {
  const [name, setName] = useState(type?.name || '');
  const [description, setDescription] = useState(type?.description || '');
  const trimmed = name.trim();
  const dup = !!trimmed && existing.some((t) => t.id !== type?.id && t.name.toLowerCase() === trimmed.toLowerCase());
  const canSave = !!trimmed && !dup;

  return (
    <Modal
      title={type ? `Edit · ${type.name}` : 'Add material type'}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!canSave}
          onClick={() => onSave({ name: trimmed, description: description.trim() })}>
          {type ? 'Save changes' : 'Add type'}
        </button>
      </>}
    >
      <label className="lbl">Material type <span className="req">*</span></label>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Roofing" autoFocus />
      {dup && <p className="inline-warn">A type with this name already exists.</p>}

      <label className="lbl" style={{ marginTop: 14 }}>Description</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
        placeholder="What materials fall under this category?" />
      <p className="help" style={{ marginBottom: 0 }}>Used by materials, suppliers, and the type filters across the app.</p>
    </Modal>
  );
}
