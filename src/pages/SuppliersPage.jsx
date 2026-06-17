import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from '../components/Modal.jsx';
import { FilterBar, FilterSearch, FilterSelect } from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';

export default function SuppliersPage() {
  const { db, addSupplier } = useStore();
  const [typeFilter, setTypeFilter] = useState([]);
  const [locationFilter, setLocationFilter] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [adding, setAdding] = useState(false);

  const typeName = (id) => db.materialTypes.find((t) => t.id === id)?.name || id;
  const locations = useMemo(() => [...new Set(db.suppliers.map((s) => s.location).filter(Boolean))].sort(), [db.suppliers]);

  const rows = useMemo(() => db.suppliers.filter((s) => {
    if (typeFilter.length && !typeFilter.some((t) => s.materialTypeIds.includes(t))) return false;
    if (locationFilter.length && !locationFilter.includes(s.location)) return false;
    if (q) {
      const hay = (s.name + ' ' + s.location).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [db.suppliers, typeFilter, locationFilter, q]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Supplier Registry</h1>
          <p className="sub">Who to request quotes from — filterable by material type and location</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportButton table="suppliers" rows={rows} columns={[
            { header: 'Supplier', value: (s) => s.name },
            { header: 'Material types', value: (s) => s.materialTypeIds.map(typeName).join('; ') },
            { header: 'Location', value: (s) => s.location },
            { header: 'Phone', value: (s) => s.contact?.phone },
            { header: 'Email', value: (s) => s.contact?.email },
            { header: 'Address', value: (s) => s.contact?.address },
            { header: 'ID', value: (s) => s.id },
          ]} />
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add supplier</button>
        </div>
      </div>

      <FilterBar shown={rows.length} total={db.suppliers.length} unit="suppliers">
        <FilterSearch value={q} onChange={setQ} placeholder="Search name or location…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} allLabel="All material types" width={190}
          options={db.materialTypes.map((t) => ({ value: t.id, label: t.name }))} />
        <FilterSelect value={locationFilter} onChange={setLocationFilter} allLabel="All locations" width={170}
          options={locations.map((l) => ({ value: l, label: l }))} />
        {selected.size > 0 && <span className="pill info">{selected.size} selected for quotes</span>}
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Supplier</th><th>Material types</th><th>Location</th><th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td><b>{s.name}</b></td>
                  <td>{s.materialTypeIds.map((t) => <span className="chip" key={t}>{typeName(t)}</span>)}</td>
                  <td>{s.location}</td>
                  <td className="muted">{s.contact?.phone}<br />{s.contact?.email}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5}><div className="empty">No suppliers match this filter.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <AddSupplier onClose={() => setAdding(false)} onAdd={addSupplier} types={db.materialTypes} />}
    </>
  );
}

function AddSupplier({ onClose, onAdd, types }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [typeIds, setTypeIds] = useState(new Set());
  const [error, setError] = useState('');

  function toggleType(id) {
    setTypeIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function save() {
    if (!name.trim()) { setError('Supplier name is required.'); return; }
    onAdd({ name: name.trim(), location: location.trim(), materialTypeIds: [...typeIds], contact: { phone, email, address: '' } });
    onClose();
  }

  return (
    <Modal title="Add supplier" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Add supplier</button>
      </>}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Name <span className="req">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Phone</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="full">
          <label className="lbl">Email</label>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="full">
          <label className="lbl">Material types supplied</label>
          <div>
            {types.map((t) => (
              <label key={t.id} className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={typeIds.has(t.id)} onChange={() => toggleType(t.id)}
                  style={{ marginRight: 6, width: 'auto' }} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
