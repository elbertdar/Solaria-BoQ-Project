import { useState } from 'react';
import { useStore } from '../store/StoreContext.jsx';
import { suggestMaterials } from '../engine/match.js';
import { idr } from '../engine/format.js';
import Modal from '../components/Modal.jsx';

export default function CataloguePage() {
  const { db, addMaterial, updateMaterial, addAlias, removeAlias } = useStore();
  const [adding, setAdding] = useState(false);
  const [editMat, setEditMat] = useState(null);
  const [aliasFor, setAliasFor] = useState(null);

  const typeName = (id) => db.materialTypes.find((t) => t.id === id)?.name || id;

  return (
    <>
      <div className="page-head">
        <h1>Material Catalogue</h1>
        <p className="sub">Canonical names, aliases, and delivery lead times. The normalization + timing layer the rest of the app relies on.</p>
      </div>

      <div className="toolbar">
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add canonical material</button>
      </div>

      <div className="card">
        <div className="card-body flush">
          <table className="table">
            <thead>
              <tr><th>Canonical name</th><th>Type</th><th>Default unit</th><th className="num">Est. unit cost</th><th className="num">Lead time</th><th>Aliases</th><th></th></tr>
            </thead>
            <tbody>
              {db.materials.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.canonicalName}</b></td>
                  <td className="muted">{typeName(m.materialTypeId)}</td>
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
                    <button className="btn sm ghost" onClick={() => setAliasFor(m)}>+ Alias</button>
                  </td>
                </tr>
              ))}
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
    </>
  );
}

function MaterialModal({ title, material, onClose, onSave, types, materials }) {
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
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Estimated unit cost (IDR)</label>
          <input type="number" min="0" value={estCost} onChange={(e) => setEstCost(e.target.value)} placeholder="e.g. 65000" />
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
