import { useState } from 'react';
import { ChevronUp, ChevronDown, X, Lock } from 'lucide-react';
import Modal from './Modal.jsx';
import { useStore } from '../store/StoreContext.jsx';
import { allStatuses, STATUS_PILLS, PHASE_LABEL } from '../engine/status.js';

// Manage PR statuses — add / rename / recolor / reorder / retire / restore.
// 'Ordered' and 'Received' are locked (🔒): the engines key budget commitment and
// receipt semantics off them. Everything else is the user's to shape.
// Retiring an in-use status requires picking a destination for its PRs — no dead ends.

const DOT = { gray: '#94A3B8', info: '#0891B2', teal: '#0D9488', amber: '#F59E0B', purple: '#8B5CF6', ok: '#16A34A', risk: '#E11D48' };

export default function ManageStatusesModal({ onClose }) {
  const { db, addPrStatus, updatePrStatus, reorderPrStatus, retirePrStatus, restorePrStatus } = useStore();
  const statuses = allStatuses(db);
  const usage = (id) => db.prs.filter((p) => p.status === id).length;

  const sections = [
    { phase: 'pre', addable: true },
    { phase: 'committed', addable: true },
    { phase: 'received', addable: false },
    { phase: 'void', addable: true },
  ];

  return (
    <Modal title="PR statuses" onClose={onClose} wide
      footer={<button className="btn ghost" onClick={onClose}>Done</button>}>
      <p className="help" style={{ marginTop: 0 }}>
        Statuses before ordering don’t count against the budget; <b>Ordered</b> and everything after it
        count as committed. <b>Ordered</b> and <b>Received</b> are locked <Lock size={12} /> — the budget and receipt logic
        run on them — but you can still recolor them. Use the section dropdown on a status to move it
        between phases (e.g. into the Ordered→Received zone — its PRs start counting as committed the
        moment you do). Removing a status retires it (its history stays readable, and it can be restored below).
      </p>

      {sections.map(({ phase, addable }) => (
        <Section key={phase} phase={phase} addable={addable}
          rows={statuses.filter((s) => s.phase === phase && !s.retired)}
          usage={usage} db={db}
          onAdd={(label) => addPrStatus({ label, phase })}
          onUpdate={updatePrStatus} onReorder={reorderPrStatus} onRetire={retirePrStatus} />
      ))}

      <Retired rows={statuses.filter((s) => s.retired)} onRestore={restorePrStatus} />
    </Modal>
  );
}

function Section({ phase, addable, rows, usage, db, onAdd, onUpdate, onReorder, onRetire }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const commitAdd = () => { const n = newLabel.trim(); if (n) onAdd(n); setNewLabel(''); setAdding(false); };
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {PHASE_LABEL[phase]}
        {addable && !adding && (
          <button className="btn sm ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setAdding(true)}>＋ Add</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((s, i) => (
          <StatusRow key={s.id} s={s} used={usage(s.id)} db={db}
            first={i === 0} last={i === rows.length - 1}
            onUpdate={onUpdate} onReorder={onReorder} onRetire={onRetire} />
        ))}
        {rows.length === 0 && !adding && <div className="muted" style={{ fontSize: 12.5, padding: '2px 0' }}>None.</div>}
        {adding && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" autoFocus value={newLabel} placeholder="Status name…"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setNewLabel(''); } }} />
            <button className="btn sm" onClick={commitAdd}>Add</button>
            <button className="btn sm ghost" onClick={() => { setAdding(false); setNewLabel(''); }}><X size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusRow({ s, used, db, first, last, onUpdate, onReorder, onRetire }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.label);
  const [retiring, setRetiring] = useState(false);
  const [target, setTarget] = useState('');
  const commitLabel = () => { setEditing(false); const n = draft.trim(); if (n && n !== s.label) onUpdate(s.id, { label: n }); };

  // Reassign targets: every active status except this one and 'received' (BR-4: a bulk
  // move can't invent receipt dates).
  const targets = allStatuses(db).filter((x) => !x.retired && x.id !== s.id && x.id !== 'received');

  // Where this status can be moved to (locked rows stay put; 'received' is exclusive).
  const PHASES = [['pre', 'Before ordering'], ['committed', 'After ordering'], ['void', 'Closed']];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* colour swatches — always editable, locked or not */}
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {STATUS_PILLS.map((pill) => (
            <span key={pill} onClick={() => onUpdate(s.id, { pill })} title={pill}
              style={{ width: 13, height: 13, borderRadius: '50%', cursor: 'pointer', background: DOT[pill],
                outline: s.pill === pill ? '2px solid var(--ink)' : '1px solid var(--border)', outlineOffset: 1 }} />
          ))}
        </span>

        {/* label — inline editable unless locked */}
        {editing ? (
          <input type="text" autoFocus value={draft} style={{ width: 160, font: 'inherit', fontSize: 13, padding: '3px 6px' }}
            onChange={(e) => setDraft(e.target.value)} onBlur={commitLabel}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(s.label); setEditing(false); } }} />
        ) : (
          <span className={'pill ' + (s.pill || 'gray')} style={{ cursor: s.locked ? 'default' : 'text' }}
            title={s.locked ? 'Locked — budget/receipt logic runs on this status' : 'Click to rename'}
            onClick={() => { if (!s.locked) { setDraft(s.label); setEditing(true); } }}>
            {s.label}{s.locked && <Lock size={11} style={{ marginLeft: 4 }} />}
          </span>
        )}

        <span className="muted" style={{ fontSize: 12 }}>{used === 0 ? 'unused' : `${used} PR${used === 1 ? '' : 's'}`}</span>

        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {!s.locked && (
            <select className="input" value={s.phase} title="Move to another section"
              style={{ fontSize: 11.5, padding: '3px 6px', width: 'auto', color: 'var(--ink-soft)' }}
              onChange={(e) => onUpdate(s.id, { phase: e.target.value })}>
              {PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <button className="btn sm ghost" disabled={first} title="Move up" onClick={() => onReorder(s.id, -1)} style={{ padding: '2px 7px' }}><ChevronUp size={14} /></button>
          <button className="btn sm ghost" disabled={last} title="Move down" onClick={() => onReorder(s.id, 1)} style={{ padding: '2px 7px' }}><ChevronDown size={14} /></button>
          {!s.locked && !retiring && (
            <button className="btn sm ghost" style={{ color: 'var(--risk)' }} onClick={() => {
              if (used === 0) onRetire(s.id, null);
              else { setTarget(''); setRetiring(true); }
            }}>Remove</button>
          )}
        </span>
      </div>

      {retiring && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <span>Move its <b>{used} PR{used === 1 ? '' : 's'}</b> to</span>
          <select className="input" style={{ width: 170 }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— choose status —</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button className="btn sm danger" disabled={!target} onClick={() => { onRetire(s.id, target); setRetiring(false); }}>Remove status</button>
          <button className="btn sm ghost" onClick={() => setRetiring(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function Retired({ rows, onRestore }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="lbl">Retired</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {rows.map((s) => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={'pill ' + (s.pill || 'gray')} style={{ opacity: .65 }}>{s.label}</span>
            <button className="btn sm ghost" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => onRestore(s.id)}>Restore</button>
          </span>
        ))}
      </div>
      <p className="help" style={{ marginBottom: 0 }}>Retired statuses stay readable in PR history; restoring brings them back into the pickers.</p>
    </div>
  );
}
