import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import Modal from '../components/Modal.jsx';
import ComboBox from '../components/ComboBox.jsx';
import { FilterBar, FilterSearch, FilterSelect, DeleteConfirm } from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ImportButton from '../components/ImportButton.jsx';

export default function SuppliersPage() {
  const { db, addSupplier, updateSupplier, deleteSupplier } = useStore();
  const [typeFilter, setTypeFilter] = useState([]);
  const [locationFilter, setLocationFilter] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [delFor, setDelFor] = useState(null);

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

  const usedOnPrs = (id) => db.prs.filter((p) => p.supplierPrimaryId === id || p.supplierSecondaryId === id).length;

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
          <ImportButton entity="suppliers" />
          <button className="btn primary" onClick={() => setEditing(null)}>+ Add supplier</button>
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
                <th>Supplier</th><th>Material types</th><th>Location</th><th>Contact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td><b>{s.name}</b></td>
                  <td>{s.materialTypeIds.length === 0
                    ? <span className="muted">—</span>
                    : s.materialTypeIds.map((t) => <span className="chip" key={t}>{typeName(t)}</span>)}</td>
                  <td>{s.location || <span className="muted">—</span>}</td>
                  <td className="muted">{s.contact?.phone}<br />{s.contact?.email}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setEditing(s)}>Edit</button>{' '}
                    <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => setDelFor(s)}>Delete</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6}><div className="empty">{db.suppliers.length === 0 ? 'No suppliers yet.' : 'No suppliers match this filter.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && (
        <SupplierModal
          supplier={editing}
          onClose={() => setEditing(undefined)}
          onSave={(vals) => { if (editing) updateSupplier(editing.id, vals); else addSupplier(vals); setEditing(undefined); }}
        />
      )}

      {delFor && (
        <DeleteConfirm
          title={`Delete · ${delFor.name}`}
          confirmLabel="Delete supplier"
          confirmMsg={<>
            Delete <b>{delFor.name}</b>?{' '}
            {usedOnPrs(delFor.id) > 0
              ? <>It’s named on <b>{usedOnPrs(delFor.id)} purchase request{usedOnPrs(delFor.id) === 1 ? '' : 's'}</b> — those keep their record but lose this supplier reference.</>
              : 'It isn’t referenced by any purchase requests.'}
          </>}
          onConfirm={() => { deleteSupplier(delFor.id); setDelFor(null); }}
          onClose={() => setDelFor(null)}
        />
      )}
    </>
  );
}

function SupplierModal({ supplier, onClose, onSave }) {
  const { db, addMaterialType } = useStore();
  const editing = !!supplier;
  const [name, setName] = useState(supplier?.name ?? '');
  const [location, setLocation] = useState(supplier?.location ?? '');
  const [phone, setPhone] = useState(supplier?.contact?.phone ?? '');
  const [email, setEmail] = useState(supplier?.contact?.email ?? '');
  const [address, setAddress] = useState(supplier?.contact?.address ?? '');
  const [typeIds, setTypeIds] = useState(() => [...(supplier?.materialTypeIds ?? [])]);
  const [error, setError] = useState('');

  const typeName = (id) => db.materialTypes.find((t) => t.id === id)?.name || id;
  // Only offer not-yet-added types in the dropdown; resolveId checks ALL types so typing an
  // existing name never offers a duplicate "create" row.
  const available = db.materialTypes.filter((t) => !typeIds.includes(t.id)).map((t) => ({ id: t.id, label: t.name }));
  const resolveType = (s) => db.materialTypes.find((t) => t.name.toLowerCase() === s.trim().toLowerCase())?.id || null;
  const addType = (id) => { if (id && !typeIds.includes(id)) setTypeIds((p) => [...p, id]); };
  const removeType = (id) => setTypeIds((p) => p.filter((x) => x !== id));

  function save() {
    if (!name.trim()) { setError('Supplier name is required.'); return; }
    onSave({
      name: name.trim(), location: location.trim(), materialTypeIds: typeIds,
      contact: { phone: phone.trim(), email: email.trim(), address: address.trim() },
    });
    onClose();
  }

  return (
    <Modal title={editing ? `Edit · ${supplier.name}` : 'Add supplier'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{editing ? 'Save changes' : 'Add supplier'}</button>
      </>}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Name <span className="req">*</span></label>
          <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Phone</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Email</label>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Address</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="full">
          <label className="lbl">Material types supplied</label>
          <ComboBox value="" options={available} placeholder="Search or add a material type…"
            onPick={addType} resolveId={resolveType}
            onCreate={(qq) => addMaterialType({ name: qq.trim() })}
            createLabel={(qq) => `Add type “${qq}”`} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {typeIds.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None yet — pick existing types or type a new one to add it.</span>}
            {typeIds.map((id) => (
              <span className="chip alias" key={id}>
                {typeName(id)}
                <span style={{ cursor: 'pointer', marginLeft: 6, opacity: 0.6 }} onClick={() => removeType(id)}>×</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}
