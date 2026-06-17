import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { suggestMaterials } from '../engine/match.js';
import { idr } from '../engine/format.js';
import Modal from '../components/Modal.jsx';
import NumberInput from '../components/NumberInput.jsx';
import ComboBox from '../components/ComboBox.jsx';
import { FilterBar, FilterSearch, FilterSelect, DeleteConfirm } from '../components/ui.jsx';

export default function CataloguePage() {
  const { db, addMaterial, updateMaterial, addAlias, removeAlias, addBrand, deleteBrand, softDeleteMaterial } = useStore();
  const [adding, setAdding] = useState(false);
  const [editMat, setEditMat] = useState(null);
  const [aliasFor, setAliasFor] = useState(null);
  const [brandFor, setBrandFor] = useState(null);
  const [delFor, setDelFor] = useState(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState([]);

  const typeName = (id) => db.materialTypes.find((t) => t.id === id)?.name || id;

  const filtered = db.materials.filter((m) => {
    if (typeFilter.length && !typeFilter.includes(m.materialTypeId)) return false;
    if (q) {
      const hay = (m.canonicalName + ' ' + (m.aliases || []).join(' ')).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Material Catalogue</h1>
          <p className="sub">Canonical names, aliases, and delivery lead times. The normalization + timing layer the rest of the app relies on.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add canonical material</button>
      </div>

      <FilterBar shown={filtered.length} total={db.materials.length} unit="materials">
        <FilterSearch value={q} onChange={setQ} placeholder="Search name or alias…" />
        <FilterSelect value={typeFilter} onChange={setTypeFilter} allLabel="All material types" width={200}
          options={db.materialTypes.map((t) => ({ value: t.id, label: t.name }))} />
      </FilterBar>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr><th>Canonical name</th><th>Type</th><th>Brands</th><th>Default unit</th><th className="num">Est. unit cost</th><th className="num">Lead time</th><th>Aliases</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.canonicalName}</b></td>
                  <td className="muted">{typeName(m.materialTypeId)}</td>
                  <td>
                    {(() => {
                      const bs = db.brands.filter((b) => b.materialId === m.id);
                      return bs.length === 0
                        ? <span className="muted">—</span>
                        : bs.map((b) => (
                          <span className="chip alias" key={b.id}>
                            {b.name}
                            <span style={{ cursor: 'pointer', marginLeft: 6, opacity: .6 }} onClick={() => deleteBrand(b.id)}>×</span>
                          </span>
                        ));
                    })()}
                  </td>
                  <td>{m.defaultUnit}</td>
                  <td className="num">{m.estUnitCost != null ? idr(m.estUnitCost) : <span className="muted">—</span>}</td>
                  <td className="num">
                    {m.leadTimeDays != null ? `${m.leadTimeDays} days` : <span className="muted">— not set</span>}
                  </td>
                  <td>
                    {m.aliases.length === 0 && <span className="muted">—</span>}
                    {m.aliases.map((a) => (
                      <span className="chip alias" key={a}>
                        {a}
                        <span style={{ cursor: 'pointer', marginLeft: 6, opacity: .6 }} onClick={() => removeAlias(m.id, a)}>×</span>
                      </span>
                    ))}
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost" onClick={() => setEditMat(m)}>Edit</button>{' '}
                    <button className="btn sm ghost" onClick={() => setAliasFor(m)}>+ Alias</button>{' '}
                    <button className="btn sm ghost" onClick={() => setBrandFor(m)}>+ Brand</button>{' '}
                    <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => setDelFor(m)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="empty">{db.materials.length === 0 ? 'No materials yet.' : 'No materials match these filters.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <MaterialModal title="Add canonical material" onClose={() => setAdding(false)}
        onSave={(vals) => { addMaterial(vals); setAdding(false); }} types={db.materialTypes} materials={db.materials} />}
      {editMat && <MaterialModal title={`Edit ${editMat.canonicalName}`} material={editMat} onClose={() => setEditMat(null)}
        onSave={(vals) => { updateMaterial(editMat.id, vals); setEditMat(null); }} types={db.materialTypes} materials={db.materials} />}
      {aliasFor && <AddAlias material={aliasFor} onClose={() => setAliasFor(null)}
        onAdd={(a) => { addAlias(aliasFor.id, a); setAliasFor(null); }} />}
      {brandFor && <ManageBrands material={brandFor} brands={db.brands.filter((b) => b.materialId === brandFor.id)}
        onClose={() => setBrandFor(null)} onAdd={(name) => addBrand({ materialId: brandFor.id, name })} onDelete={deleteBrand} />}
      {delFor && <DeleteMaterial material={delFor} db={db} onClose={() => setDelFor(null)}
        onConfirm={() => { softDeleteMaterial(delFor.id); setDelFor(null); }} />}
    </>
  );
}

function DeleteMaterial({ material, db, onClose, onConfirm }) {
  const boq = db.boqItems.filter((b) => b.materialId === material.id).length;
  const prs = db.prs.filter((p) => p.materialId === material.id).length;
  const brands = db.brands.filter((b) => b.materialId === material.id).length;
  const blocked = boq > 0 || prs > 0;
  return (
    <DeleteConfirm title={`Delete · ${material.canonicalName}`} blocked={blocked} onClose={onClose} onConfirm={onConfirm}
      blockedMsg={<>
        <b>{material.canonicalName}</b> is in use — it can’t be deleted while it’s referenced by{' '}
        {boq > 0 && <b>{boq} BoQ line{boq === 1 ? '' : 's'}</b>}{boq > 0 && prs > 0 ? ' and ' : ''}
        {prs > 0 && <b>{prs} purchase request{prs === 1 ? '' : 's'}</b>}. Remove or repoint those first.
      </>}
      confirmMsg={<>Delete <b>{material.canonicalName}</b>{brands > 0 ? <> and its <b>{brands} brand{brands === 1 ? '' : 's'}</b></> : ''}? It’s unused, and can be restored from Trash for 7 days.</>} />
  );
}

function ManageBrands({ material, brands, onClose, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const add = () => { const n = name.trim(); if (n) { onAdd(n); setName(''); } };
  return (
    <Modal title={`Brands · ${material.canonicalName}`} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <p className="help" style={{ marginTop: 0 }}>
        Variants of <b>{material.canonicalName}</b> you actually buy (e.g. Jayaboard, Knauf). Pick one per purchase request — the project total still rolls up across all brands.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 14px' }}>
        {brands.length === 0 && <span className="muted">No brands yet.</span>}
        {brands.map((b) => (
          <span className="chip alias" key={b.id}>
            {b.name}
            <span style={{ cursor: 'pointer', marginLeft: 6, opacity: .6 }} onClick={() => onDelete(b.id)}>×</span>
          </span>
        ))}
      </div>
      <label className="lbl">Add a brand</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" value={name} autoFocus placeholder="e.g. Jayaboard"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn" onClick={add}>Add</button>
      </div>
    </Modal>
  );
}

function MaterialModal({ title, material, onClose, onSave, types, materials }) {
  const { addMaterialType } = useStore();
  const editing = !!material;
  const [name, setName] = useState(material?.canonicalName ?? '');
  const [unit, setUnit] = useState(material?.defaultUnit ?? '');
  const [typeId, setTypeId] = useState(material?.materialTypeId ?? types[0]?.id ?? '');
  const [estCost, setEstCost] = useState(material?.estUnitCost ?? '');
  const [lead, setLead] = useState(material?.leadTimeDays ?? '');
  const [error, setError] = useState('');

  const dupes = (!editing && name.trim().length >= 2) ? suggestMaterials(materials, name, 3, 0.5) : [];

  function save() {
    if (!name.trim()) { setError('Canonical name is required.'); return; }
    if (!unit.trim()) { setError('Default unit is required.'); return; }
    const vals = {
      canonicalName: name.trim(), defaultUnit: unit.trim(), materialTypeId: typeId,
      estUnitCost: estCost === '' ? null : Number(estCost),
      leadTimeDays: lead === '' ? null : Number(lead),
    };
    onSave(vals);
  }

  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{editing ? 'Save changes' : 'Add material'}</button>
      </>}>
      <div className="form-grid">
        <div className="full">
          <label className="lbl">Canonical name <span className="req">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gypsum" />
          {dupes.length > 0 && (
            <div className="inline-warn" style={{ background: 'var(--pending-bg)', borderColor: '#FCE3B0', color: 'var(--pending)' }}>
              <span>⚠</span><div>Possible duplicate of: {dupes.map((d) => d.material.canonicalName).join(', ')}. Consider an alias instead.</div>
            </div>
          )}
        </div>
        <div>
          <label className="lbl">Default unit <span className="req">*</span></label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lembar, m2…" />
        </div>
        <div>
          <label className="lbl">Material type</label>
          <ComboBox value={typeId} onPick={setTypeId} placeholder="Search or add a type…"
            options={types.map((t) => ({ id: t.id, label: t.name }))}
            onCreate={(q) => addMaterialType({ name: q.trim() })}
            createLabel={(q) => `➕ Add type “${q}”`} />
        </div>
        <div>
          <label className="lbl">Estimated unit cost (IDR)</label>
          <NumberInput value={estCost} onChange={setEstCost} placeholder="e.g. 65,000" />
          <div className="help">Default cost used to pre-fill a BoQ line when this material is chosen.</div>
        </div>
        <div>
          <label className="lbl">Delivery lead time (days)</label>
          <input type="number" min="0" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="e.g. 14" />
          <div className="help">Time to arrive after ordering. Drives the auto-computed order day on BoQ lines.</div>
        </div>
      </div>
      {error && <div className="inline-warn"><span>•</span><div>{error}</div></div>}
    </Modal>
  );
}

function AddAlias({ material, onClose, onAdd }) {
  const [alias, setAlias] = useState('');
  return (
    <Modal title={`Add alias to ${material.canonicalName}`} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => alias.trim() && onAdd(alias.trim())}>Add alias</button>
      </>}>
      <p className="help" style={{ marginTop: 0 }}>
        Variant strings that should resolve to <b>{material.canonicalName}</b> — e.g. “{material.canonicalName} Aplus”.
      </p>
      <label className="lbl">Alias</label>
      <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} autoFocus />
    </Modal>
  );
}
