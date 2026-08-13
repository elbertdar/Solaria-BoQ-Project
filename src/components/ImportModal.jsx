import { useMemo, useState } from 'react';
import { Upload, Download, Check, TriangleAlert, Info } from 'lucide-react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { parseCsv, downloadCsv } from '../engine/csv.js';
import { applyImport, importTemplate, IMPORT_SPECS } from '../engine/dataImport.js';
import { toast } from './ToastHost.jsx';

// Generic CSV importer for a single entity. Shows the column contract (required vs optional),
// offers a ready-made template, then live-previews a pasted/uploaded file — how many rows are
// ready, what will be skipped and why, and which lookup records get created — before committing.
export default function ImportModal({ entity, context = {}, onClose }) {
  const { db, importEntity } = useStore();
  const spec = IMPORT_SPECS[entity];
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');

  const parsed = useMemo(() => (text.trim() ? parseCsv(text) : null), [text]);
  // context is read-only here; including currentProjectId keeps the preview in sync for BoQ.
  const preview = useMemo(
    () => (parsed ? applyImport(db, entity, parsed, context).result : null),
    [parsed, db, entity, context.currentProjectId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
  };

  const doImport = () => {
    if (!parsed || !preview?.ready) return;
    importEntity(entity, parsed, context);
    toast.success(`Imported ${preview.ready} ${spec.label.toLowerCase()} row${preview.ready === 1 ? '' : 's'}`);
    onClose();
  };

  const createdSummary = preview && [
    [preview.created.materialTypes.length, 'material type'],
    [preview.created.mandors.length, 'mandor'],
    [preview.created.projectTypes.length, 'project type'],
    [preview.created.materials.length, 'material'],
  ].filter(([n]) => n > 0).map(([n, w]) => `${n} new ${w}${n === 1 ? '' : 's'}`);

  const skippedRows = preview ? preview.rows.filter((r) => r.status === 'skip') : [];

  return (
    <Modal title={`Import ${spec.label}`} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={doImport} disabled={!preview || preview.ready === 0}>
          {preview && preview.ready > 0 ? `Import ${preview.ready} row${preview.ready === 1 ? '' : 's'}` : 'Import'}
        </button>
      </>}>
      <p className="help" style={{ marginTop: 0 }}>
        Upload or paste a CSV. Columns match the table — headers are case-insensitive and can be in any order.
        Required columns must be present; leave out any optional column and it falls back to a default.
      </p>

      {/* Column contract */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {spec.columns.map((c, i) => (
          <div key={c.header} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px',
            borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
            <span style={{ fontWeight: 600, minWidth: 150 }}>{c.header}</span>
            <span className={'pill ' + (c.required ? 'warn' : 'gray')} style={{ flexShrink: 0 }}>
              {c.required ? 'Required' : 'Optional'}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>{c.hint || ''}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <label className="btn ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <Upload size={14} /> Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
        <button className="btn ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => downloadCsv(`solaria-${entity}-template.csv`, importTemplate(entity))}>
          <Download size={14} /> Download template
        </button>
        {fileName && <span className="muted" style={{ alignSelf: 'center', fontSize: 12.5 }}>{fileName}</span>}
      </div>

      <label className="lbl">…or paste CSV rows</label>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} rows={5}
        placeholder={spec.columns.map((c) => c.header).join(',')}
        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, resize: 'vertical' }} />

      {/* Live preview */}
      {preview && (
        <div style={{ marginTop: 14 }}>
          {preview.missingRequired.length > 0 && (
            <div className="inline-warn" style={{ marginBottom: 10 }}>
              <TriangleAlert size={15} style={{ flexShrink: 0 }} />
              <div>Missing required column{preview.missingRequired.length === 1 ? '' : 's'}: <b>{preview.missingRequired.join(', ')}</b>. Add {preview.missingRequired.length === 1 ? 'it' : 'them'} and re-upload.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: createdSummary.length || skippedRows.length ? 10 : 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: preview.ready ? 'var(--ok)' : 'var(--muted)' }}>
              <Check size={15} /> {preview.ready} of {preview.total} row{preview.total === 1 ? '' : 's'} ready
            </span>
            {preview.skipped > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--risk)', fontWeight: 600 }}>
                <TriangleAlert size={15} /> {preview.skipped} skipped
              </span>
            )}
          </div>

          {createdSummary.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
              <Info size={13} /> Will also create: {createdSummary.join(' · ')}
            </div>
          )}

          {preview.unknownHeaders.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Ignoring unrecognized column{preview.unknownHeaders.length === 1 ? '' : 's'}: {preview.unknownHeaders.join(', ')}
            </div>
          )}

          {skippedRows.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
              {skippedRows.slice(0, 50).map((r) => (
                <div key={r.n} style={{ display: 'flex', gap: 8, padding: '6px 11px', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                  <span className="muted" style={{ minWidth: 54, flexShrink: 0 }}>Row {r.n}</span>
                  <span style={{ minWidth: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <span style={{ color: 'var(--risk)' }}>{r.issues.join('; ')}</span>
                </div>
              ))}
              {skippedRows.length > 50 && <div className="muted" style={{ padding: '6px 11px', fontSize: 12 }}>…and {skippedRows.length - 50} more</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
