import { useState, useRef, useEffect, useMemo } from 'react';

// Unified "pick an existing record or create a new one" combobox.
// Replaces the app's scattered patterns (plain <select>, select→expand-to-input,
// and the bespoke typeaheads) with one consistent control. In-flow dropdown,
// styled with the existing .suggest classes; keyboard navigable (↑ ↓ Enter Esc).
//
// Props
//   value          selected id ('' = nothing selected)
//   onPick(id)     select an existing id (or '' to clear). May run guarded side effects.
//   options        [{ id, label, sublabel?, group?, score? }] — the choosable set
//                  (ignored when `provider` is supplied)
//   onCreate(name) optional → create a record from typed text, return its new id.
//                  When present, a "➕ Add …" row appears for novel text; ComboBox
//                  then calls onPick(newId) so the freshly created record is selected.
//   createLabel(q) optional label for the create row (default: ➕ Add “q”)
//   provider(q)    optional → return Option[] for a query (e.g. fuzzy match). Overrides
//                  substring filtering; return [] for empty q to avoid "browse all".
//   resolveId(q)   optional → id of an exact existing match for q, else null. Used to
//                  auto-select on blur and to hide the create row. Default: exact label.
//   onTextChange(s) optional → reports the visible text on every change (typing, pick,
//                  clear, create). Lets owners resolve typed-but-unpicked text at save time.
//   style          optional style for the wrapper (e.g. minWidth in table cells)
//   placeholder, disabled, noneLabel, autoFocus
export default function ComboBox({
  value, onPick, options = [], onCreate, createLabel, provider, resolveId,
  onTextChange, style, placeholder, disabled, noneLabel, autoFocus,
}) {
  const selected = options.find((o) => o.id === value) || null;
  const [query, setQuery] = useState(selected ? selected.label : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const picked = useRef(false); // guards the blur auto-resolve right after an explicit choice

  // Keep the visible text in sync with the selected option whenever we're not editing.
  // If value is set but the option isn't in the list yet (just created), keep the text.
  useEffect(() => {
    if (open) return;
    if (!value) { setQuery(''); return; }
    if (selected) setQuery(selected.label);
  }, [value, selected, open]);

  const q = query.trim();
  const ql = q.toLowerCase();

  const list = useMemo(() => {
    if (provider) return provider(q);
    if (!ql) return options;
    return options.filter((o) => o.label.toLowerCase().includes(ql));
  }, [provider, q, ql, options]);

  const resolve = resolveId || ((s) => {
    const m = options.find((o) => o.label.toLowerCase() === s.toLowerCase());
    return m ? m.id : null;
  });
  const showCreate = !!onCreate && q.length > 0 && !resolve(q);

  // Assemble display rows (none + grouped options + create); track which are navigable.
  const rows = [];
  if (noneLabel && !provider) rows.push({ kind: 'none' });
  let lastGroup = null;
  list.forEach((o) => {
    if (o.group && o.group !== lastGroup) { rows.push({ kind: 'group', label: o.group }); lastGroup = o.group; }
    rows.push({ kind: 'option', o });
  });
  if (showCreate) rows.push({ kind: 'create' });
  const navRows = rows.filter((r) => r.kind === 'option' || r.kind === 'create');

  function doPick(o) { picked.current = true; setQuery(o.label); setOpen(false); setHi(-1); onTextChange?.(o.label); onPick(o.id); }
  function doClear() { picked.current = true; setQuery(''); setOpen(false); setHi(-1); onTextChange?.(''); onPick(''); }
  function doCreate() {
    picked.current = true; setOpen(false); setHi(-1);
    const id = onCreate(q);
    if (id) { setQuery(q); onTextChange?.(q); onPick(id); }
  }
  function activate(r) { if (r.kind === 'option') doPick(r.o); else if (r.kind === 'create') doCreate(); }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, navRows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      if (!open) return;
      if (hi >= 0 && navRows[hi]) { e.preventDefault(); activate(navRows[hi]); }
      else if (list.length >= 1) { e.preventDefault(); doPick(list[0]); }
      else if (showCreate) { e.preventDefault(); doCreate(); }
    } else if (e.key === 'Escape') { setOpen(false); setHi(-1); }
  }

  function onBlur() {
    setOpen(false);
    if (picked.current) { picked.current = false; return; }
    if (!value && q) { const id = resolve(q); if (id) onPick(id); } // exact text typed, then clicked away
  }

  const showDropdown = open && !disabled && rows.length > 0;
  let ni = -1;

  return (
    <div className="combo" style={style}>
      <input type="text" className="input" value={query} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus}
        onChange={(e) => { const v = e.target.value; setQuery(v); setOpen(true); setHi(-1); onTextChange?.(v); if (value) onPick(''); }}
        onFocus={() => setOpen(true)} onBlur={onBlur} onKeyDown={onKey} />
      {showDropdown && (
        <div className="suggest">
          {rows.map((r, i) => {
            if (r.kind === 'none') return (
              <div className="suggest-item none" key="none" onMouseDown={doClear}><span>— {noneLabel} —</span></div>
            );
            if (r.kind === 'group') return <div className="suggest-group" key={'g' + i}>{r.label}</div>;
            ni++; const idx = ni; const active = idx === hi;
            if (r.kind === 'create') return (
              <div className={'suggest-item create' + (active ? ' active' : '')} key="create"
                onMouseDown={doCreate} onMouseEnter={() => setHi(idx)}>
                <span>{createLabel ? createLabel(q) : `➕ Add “${q}”`}</span>
              </div>
            );
            const o = r.o;
            return (
              <div className={'suggest-item' + (active ? ' active' : '')} key={o.id}
                onMouseDown={() => doPick(o)} onMouseEnter={() => setHi(idx)}>
                <span>{o.label}{o.sublabel && <span className="muted"> · {o.sublabel}</span>}</span>
                {o.score != null && <span className="score">{o.score}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
