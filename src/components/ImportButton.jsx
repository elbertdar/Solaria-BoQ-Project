import { useState } from 'react';
import { Upload } from 'lucide-react';
import ImportModal from './ImportModal.jsx';

// Drop-in "Import CSV" button + its modal. `entity` is one of materials | suppliers |
// projects | boq; `context` passes page state the importer needs (e.g. currentProjectId for BoQ).
export default function ImportButton({ entity, context, label = 'Import CSV' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Upload size={14} /> {label}
      </button>
      {open && <ImportModal entity={entity} context={context} onClose={() => setOpen(false)} />}
    </>
  );
}
