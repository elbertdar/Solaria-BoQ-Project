// store/StoreContext.jsx — single in-memory db, persisted to localStorage, and (when the
// server backend is configured) synced to it via the remote seam below.

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { seed } from '../data/seed.js';
import { nowISO, today } from '../engine/format.js';
import { applyImport } from '../engine/dataImport.js';
import { completionSnapshot } from '../engine/reconcile.js';
import { DEFAULT_PR_STATUSES, sortStatuses, isCommitted, isReceived, defaultStatusId } from '../engine/status.js';
import { loadRemote, saveRemote, flushRemote, setKey, clearKey } from './remote.js';

const KEY = 'solaria_boq_db_v11';
const StoreCtx = createContext(null);

function normalize(d) {
  if (!Array.isArray(d.boqStaged)) d.boqStaged = [];
  if (!Array.isArray(d.boqEdits)) d.boqEdits = [];
  if (!Array.isArray(d.prStaged)) d.prStaged = [];
  if (!Array.isArray(d.brands)) d.brands = [];
  if (!Array.isArray(d.trash)) d.trash = [];
  if (!Array.isArray(d.projectTypes)) d.projectTypes = [];
  // Customizable PR statuses: backfill defaults for existing data; guarantee the two
  // locked semantic statuses always exist; keep the list in phase order.
  if (!Array.isArray(d.prStatuses) || d.prStatuses.length === 0) {
    d.prStatuses = DEFAULT_PR_STATUSES.map((s) => ({ ...s }));
  } else {
    for (const must of ['ordered', 'received']) {
      const have = d.prStatuses.find((s) => s.id === must);
      if (!have) d.prStatuses.push({ ...DEFAULT_PR_STATUSES.find((s) => s.id === must) });
      else { have.locked = true; have.retired = false; have.phase = must === 'received' ? 'received' : 'committed'; }
    }
    d.prStatuses = sortStatuses(d.prStatuses);
  }
  // Deletion becomes permanent after 7 days: drop expired trash on load.
  { const cutoff = Date.now() - 7 * 86400000; d.trash = d.trash.filter((t) => t && t.deletedAt && new Date(t.deletedAt).getTime() > cutoff); }
  if (Array.isArray(d.projects)) for (const p of d.projects) if (!p.boqStatus) p.boqStatus = 'draft';
  // Phases: every project gets at least one. Pre-phase data migrates to a single "Phase 1"
  // carrying the project's old boqStatus; all that project's BoQ items land in it.
  if (!Array.isArray(d.phases)) d.phases = [];
  if (Array.isArray(d.projects)) for (const p of d.projects) {
    if (!d.phases.some((ph) => ph.projectId === p.id)) {
      d.phases.push({ id: 'ph-' + p.id, projectId: p.id, name: 'Phase 1', order: 0, boqStatus: p.boqStatus || 'draft', createdAt: nowISO() });
    }
  }
  const firstPhaseOf = {};
  for (const p of (d.projects || [])) {
    firstPhaseOf[p.id] = d.phases.filter((x) => x.projectId === p.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0]?.id;
  }
  if (Array.isArray(d.boqItems)) for (const b of d.boqItems) {
    if (!b.budgetBasis) b.budgetBasis = 'quantity';
    if (b.allowanceAmount == null) b.allowanceAmount = 0;
    if (!b.phaseId) b.phaseId = firstPhaseOf[b.projectId];
  }
  const phaseOfItem = Object.fromEntries((d.boqItems || []).map((b) => [b.id, b.phaseId]));
  for (const s of (d.boqStaged || [])) if (!s.phaseId) s.phaseId = (s.boqItemId && phaseOfItem[s.boqItemId]) || firstPhaseOf[s.projectId];
  for (const e of (d.boqEdits || [])) if (!e.phaseId) e.phaseId = firstPhaseOf[e.projectId];
  if (Array.isArray(d.prs)) for (const p of d.prs) if (p.phaseId == null) p.phaseId = (p.boqItemId && phaseOfItem[p.boqItemId]) || null;
  if (Array.isArray(d.prs) && Array.isArray(d.boqItems)) {
    const projOf = Object.fromEntries(d.boqItems.map((b) => [b.id, b.projectId]));
    for (const p of d.prs) if (p.projectId == null && p.boqItemId) p.projectId = projOf[p.boqItemId] || null;
  }
  if (Array.isArray(d.prs)) for (const p of d.prs) {
    if (!Array.isArray(p.statusHistory)) {
      const at = p.createdAt || (p.orderDate ? new Date(p.orderDate).toISOString() : nowISO());
      p.statusHistory = [{ at, from: null, to: p.status, by: null }]; // pre-feature rows: actor unknown
    }
    if (p.comment == null) p.comment = '';
  }
  return d;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* fall through to seed */ }
  return normalize(structuredClone(seed));
}

// BoQ "definition" fields tracked in staged edits + the commit history diff.
const BOQ_FIELD_KEYS = ['materialId', 'description', 'mandorId', 'budgetBasis', 'quantity', 'unit', 'expectedUnitCost', 'allowanceAmount', 'neededDayOffset', 'leadTimeDays'];
const pickFields = (o, keys) => { const r = {}; for (const k of keys) r[k] = o?.[k] ?? null; return r; };
// Stable identity for one staged BoQ change — lets the commit modal commit a chosen subset.
export const stagedKey = (s) => (s.type === 'add' ? 'add:' + s.tempId : s.type + ':' + s.boqItemId);

let _uid = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(_uid++).toString(36)}`;

// Generic collection CRUD — collapses the repeated add/update/delete trios. Module-scoped and
// fed the stable setDb, so each useMemo([]) wrapper below yields stable action identities.
const makeCrud = (setDb, key, prefix, defaults) => ({
  add: (obj) => { const id = uid(prefix); setDb((d) => ({ ...d, [key]: [...(d[key] || []), { id, ...(defaults || {}), ...obj }] })); return id; },
  update: (id, patch) => setDb((d) => ({ ...d, [key]: (d[key] || []).map((x) => x.id === id ? { ...x, ...patch } : x) })),
  remove: (id) => setDb((d) => ({ ...d, [key]: (d[key] || []).filter((x) => x.id !== id) })),
});

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [currentProjectId, setCurrentProjectIdRaw] = useState(() => load().projects[0]?.id);
  const [currentPhaseId, setCurrentPhaseId] = useState('__all');   // '__all' = whole project
  const setCurrentProjectId = useCallback((id) => { setCurrentProjectIdRaw(id); setCurrentPhaseId('__all'); }, []);

  // ---- Remote sync: server-backed persistence when the Worker backend is configured.
  // localStorage always stays the offline fallback, so the app works even with no backend.
  const [syncStatus, setSyncStatus] = useState('local'); // local | needkey | synced
  const dbRef = useRef(db);
  const saveTimer = useRef(null);
  const skipNextSave = useRef(false);
  useEffect(() => { dbRef.current = db; }, [db]); // keep latest db for async saves
  const adoptRemote = useCallback((data) => {
    skipNextSave.current = true;
    const nd = normalize(data);
    setDb(nd);
    setCurrentProjectId(nd.projects[0]?.id);
  }, [setCurrentProjectId]);

  // On mount: adopt server state if the backend is up. Empty server → seed it from this device.
  // Unauthorized → show the passphrase gate. Unreachable/absent → stay local-only.
  useEffect(() => {
    let cancelled = false;
    loadRemote().then((r) => {
      if (cancelled) return;
      if (r.status === 'ok') { if (r.data) adoptRemote(r.data); else saveRemote(dbRef.current); setSyncStatus('synced'); }
      else if (r.status === 'unauthorized') setSyncStatus('needkey');
    });
    return () => { cancelled = true; };
  }, [adoptRemote]);

  // Persist on every change: localStorage always; the server (debounced) once synced.
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota */ }
    if (syncStatus === 'synced') {
      if (skipNextSave.current) { skipNextSave.current = false; return; }
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveRemote(dbRef.current), 1200);
    }
  }, [db, syncStatus]);

  // Flush pending edits if the tab closes before the debounce fires.
  useEffect(() => {
    const onLeave = () => { if (syncStatus === 'synced') flushRemote(dbRef.current); };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [syncStatus]);

  // Gate action — validate the passphrase against the server, then adopt server state.
  const connectRemote = useCallback(async (key) => {
    setKey(key);
    const r = await loadRemote();
    if (r.status === 'ok') { if (r.data) adoptRemote(r.data); else saveRemote(dbRef.current); setSyncStatus('synced'); return true; }
    clearKey();
    return false;
  }, [adoptRemote]);
  const useOffline = useCallback(() => { clearKey(); setSyncStatus('local'); }, []);

  // ---- Catalogue (Feature 5.1) ----
  // ---- Collection CRUD via factory (aliased to the original names; value/deps unchanged) ----
  const materialCrud = useMemo(() => makeCrud(setDb, 'materials', 'mat', { aliases: [] }), []);
  const addMaterial = materialCrud.add, updateMaterial = materialCrud.update;
  const supplierCrud = useMemo(() => makeCrud(setDb, 'suppliers', 's', { materialTypeIds: [] }), []);
  const addSupplier = supplierCrud.add, updateSupplier = supplierCrud.update;
  // Delete a supplier: drop it and clear it off any PRs that named it (don't orphan refs).
  const deleteSupplier = useCallback((id) => {
    setDb((d) => ({
      ...d,
      suppliers: d.suppliers.filter((s) => s.id !== id),
      prs: d.prs.map((p) => {
        const patch = {};
        if (p.supplierPrimaryId === id) patch.supplierPrimaryId = null;
        if (p.supplierSecondaryId === id) patch.supplierSecondaryId = null;
        return Object.keys(patch).length ? { ...p, ...patch } : p;
      }),
    }));
  }, []);
  const brandCrud = useMemo(() => makeCrud(setDb, 'brands', 'br'), []);
  const addBrand = brandCrud.add, updateBrand = brandCrud.update;
  const typeCrud = useMemo(() => makeCrud(setDb, 'materialTypes', 'mt', { description: '' }), []);
  const addMaterialType = typeCrud.add, updateMaterialType = typeCrud.update;
  const projectCrud = useMemo(() => makeCrud(setDb, 'projects', 'p', { client: 'Solaria F&B', location: '' }), []);
  const addProject = projectCrud.add, updateProject = projectCrud.update;
  // Mark a project complete (manual — not gated on "all received"; under-budget is fine). Freezes
  // a completion snapshot (totals + per-material breakdown) as the archived record. Reversible.
  const completeProject = useCallback((id) => {
    setDb((d) => {
      const proj = d.projects.find((p) => p.id === id);
      if (!proj || proj.completedAt) return d;
      const completion = completionSnapshot(d, id);
      return { ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, completedAt: nowISO(), completion } : p)) };
    });
  }, []);
  const reopenProject = useCallback((id) => {
    setDb((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, completedAt: null, completion: null } : p)) }));
  }, []);
  const projectTypeCrud = useMemo(() => makeCrud(setDb, 'projectTypes', 'pt'), []);
  const addProjectType = projectTypeCrud.add;
  const deleteProjectType = useCallback((id) => {
    setDb((d) => ({
      ...d,
      projectTypes: d.projectTypes.filter((t) => t.id !== id),
      projects: d.projects.map((p) => (p.projectTypeId === id ? { ...p, projectTypeId: null } : p)),
    }));
  }, []);
  const mandorCrud = useMemo(() => makeCrud(setDb, 'mandors', 'm'), []);

  // ---- Customizable PR statuses ----------------------------------------------
  // 'ordered' / 'received' are locked: engines key commitment + receipt off them.
  // "Delete" = retire (hidden from pickers, definition kept so history/trash render
  // forever); live PRs are reassigned at retire time. Retired statuses can be restored.
  const addPrStatus = useCallback(({ label, pill = 'gray', phase = 'pre' }) => {
    const id = uid('ps');
    setDb((d) => ({
      ...d,
      prStatuses: sortStatuses([...d.prStatuses, { id, label: label.trim(), pill, phase: phase === 'received' ? 'pre' : phase }]),
    }));
    return id;
  }, []);
  const updatePrStatus = useCallback((id, patch) => {
    setDb((d) => ({
      ...d,
      prStatuses: sortStatuses(d.prStatuses.map((s) => {
        if (s.id !== id) return s;
        if (s.locked) {                       // locked: colour may change, semantics may not
          const { pill } = patch;
          return pill ? { ...s, pill } : s;
        }
        const next = { ...s, ...patch };
        if (next.phase === 'received') next.phase = s.phase;   // 'received' phase is exclusive
        if (typeof next.label === 'string') next.label = next.label.trim() || s.label;
        return next;
      })),
    }));
  }, []);
  const reorderPrStatus = useCallback((id, dir) => {           // ±1, within the same phase only
    setDb((d) => {
      const list = [...d.prStatuses];
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) return d;
      let j = i + dir;
      while (j >= 0 && j < list.length && list[j].retired && list[j].phase === list[i].phase) j += dir; // hop hidden rows
      if (j < 0 || j >= list.length || list[j].phase !== list[i].phase) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, prStatuses: list };
    });
  }, []);
  const retirePrStatus = useCallback((id, reassignToId) => {
    setDb((d) => {
      const s = d.prStatuses.find((x) => x.id === id);
      if (!s || s.locked) return d;
      const used = d.prs.some((p) => p.status === id);
      if (used && !reassignToId) return d;                     // UI always supplies a target when in use
      if (reassignToId === 'received') return d;               // BR-4: can't bulk-receive without receipt dates
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      return {
        ...d,
        prStatuses: d.prStatuses.map((x) => (x.id === id ? { ...x, retired: true } : x)),
        prs: d.prs.map((p) => (p.status === id ? {
          ...p,
          status: reassignToId,
          receiptDate: null,
          statusHistory: [...(p.statusHistory || []), { at: nowISO(), from: id, to: reassignToId, by: actor }],
        } : p)),
      };
    });
  }, []);
  const restorePrStatus = useCallback((id) => {
    setDb((d) => ({ ...d, prStatuses: sortStatuses(d.prStatuses.map((s) => (s.id === id ? { ...s, retired: false } : s))) }));
  }, []);
  const addMandor = useMemo(() => (name) => mandorCrud.add({ name }), []);
  const updateMandor = mandorCrud.update, deleteMandor = mandorCrud.remove;
  // First person added becomes the signed-in user (no auth layer yet), so audit
  // trails have an author from the very first action on a fresh install.
  const addUser = useCallback((obj) => {
    const id = uid('u');
    setDb((d) => {
      const user = { id, role: 'Purchasing PIC', ...obj };
      return {
        ...d,
        users: [...(d.users || []), user],
        currentUser: d.currentUser || { id, name: user.name, role: user.role },
      };
    });
    return id;
  }, []);

  const addAlias = useCallback((id, alias) => {
    setDb((d) => ({
      ...d,
      materials: d.materials.map((m) =>
        m.id === id && !m.aliases.includes(alias)
          ? { ...m, aliases: [...m.aliases, alias] } : m),
    }));
  }, []);
  const removeAlias = useCallback((id, alias) => {
    setDb((d) => ({
      ...d,
      materials: d.materials.map((m) =>
        m.id === id ? { ...m, aliases: m.aliases.filter((a) => a !== alias) } : m),
    }));
  }, []);

  // ---- BoQ (Feature 5.2) ----
  const addBoqItem = useCallback((item) => {
    const id = uid('b');
    setDb((d) => ({
      ...d,
      boqItems: [...d.boqItems, { id, audit: [{ at: nowISO(), change: 'created' }], ...item }],
    }));
    return id;
  }, []);
  const updateBoqItem = useCallback((id, patch, note) => {
    setDb((d) => ({
      ...d,
      boqItems: d.boqItems.map((b) => b.id === id
        ? { ...b, ...patch, audit: [...(b.audit || []), { at: nowISO(), change: note || 'edited' }] }
        : b),
    }));
  }, []);

  // Draft-phase edit: applies a patch with no audit entry (draft changes aren't tracked).
  const patchBoqItem = useCallback((id, patch) => {
    setDb((d) => ({ ...d, boqItems: d.boqItems.map((b) => b.id === id ? { ...b, ...patch } : b) }));
  }, []);
  // Finalize a phase's BoQ: draft → working (one-way). Each phase finalizes independently.
  const finalizePhase = useCallback((phaseId) => {
    setDb((d) => ({ ...d, phases: d.phases.map((ph) => ph.id === phaseId ? { ...ph, boqStatus: 'working' } : ph) }));
  }, []);

  // ---- staged BoQ edits (per phase) + commit to append-only history ----
  const projOfPhase = (d, phaseId) => d.phases.find((ph) => ph.id === phaseId)?.projectId || null;

  const stageBoqModify = useCallback((phaseId, boqItemId, patch) => {
    setDb((d) => {
      const base = d.boqItems.find((b) => b.id === boqItemId);
      if (!base) return d;
      const existing = d.boqStaged.find((s) => s.phaseId === phaseId && s.type === 'modify' && s.boqItemId === boqItemId);
      const merged = { ...(existing?.patch || {}), ...patch };
      const net = {};
      for (const k of Object.keys(merged)) if ((base[k] ?? null) !== (merged[k] ?? null)) net[k] = merged[k];
      const others = d.boqStaged.filter((s) => !(s.phaseId === phaseId && s.type === 'modify' && s.boqItemId === boqItemId));
      const deleted = d.boqStaged.some((s) => s.phaseId === phaseId && s.type === 'delete' && s.boqItemId === boqItemId);
      if (deleted || Object.keys(net).length === 0) return { ...d, boqStaged: others };
      return { ...d, boqStaged: [...others, { phaseId, projectId: projOfPhase(d, phaseId), type: 'modify', boqItemId, patch: net }] };
    });
  }, []);

  const stageBoqAdd = useCallback((phaseId, fields) => {
    const tempId = uid('stg');
    setDb((d) => ({ ...d, boqStaged: [...d.boqStaged, { phaseId, projectId: projOfPhase(d, phaseId), type: 'add', tempId, fields: pickFields(fields, BOQ_FIELD_KEYS) }] }));
    return tempId;
  }, []);

  const editStagedAdd = useCallback((phaseId, tempId, patch) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.map((s) =>
      (s.phaseId === phaseId && s.type === 'add' && s.tempId === tempId) ? { ...s, fields: { ...s.fields, ...patch } } : s) }));
  }, []);

  const stageBoqDelete = useCallback((phaseId, boqItemId, { deletePrs = false } = {}) => {
    setDb((d) => {
      const others = d.boqStaged.filter((s) => !(s.phaseId === phaseId && s.boqItemId === boqItemId && (s.type === 'modify' || s.type === 'delete')));
      return { ...d, boqStaged: [...others, { phaseId, projectId: projOfPhase(d, phaseId), type: 'delete', boqItemId, deletePrs }] };
    });
  }, []);

  const unstageBoq = useCallback((phaseId, ref) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.filter((s) => {
      if (s.phaseId !== phaseId) return true;
      if (ref.tempId) return s.tempId !== ref.tempId;
      return !(s.type === ref.type && s.boqItemId === ref.boqItemId);
    }) }));
  }, []);

  const discardBoqStaged = useCallback((phaseId) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.filter((s) => s.phaseId !== phaseId) }));
  }, []);

  // selectedKeys (optional): commit only these staged changes (by stagedKey), leaving the
  // rest staged. Null/omitted = commit everything staged in the phase.
  const commitBoqStaged = useCallback((phaseId, message, selectedKeys = null) => {
    setDb((d) => {
      const sel = selectedKeys ? new Set(selectedKeys) : null;
      const staged = d.boqStaged.filter((s) => s.phaseId === phaseId && (!sel || sel.has(stagedKey(s))));
      if (staged.length === 0) return d;
      const committedKeys = new Set(staged.map(stagedKey));
      const projectId = projOfPhase(d, phaseId);
      const byId = Object.fromEntries(d.boqItems.map((b) => [b.id, b]));
      const changes = [];
      let boqItems = [...d.boqItems];
      let prs = d.prs;
      for (const sg of staged) {
        if (sg.type === 'add') {
          const id = uid('b');
          const fields = pickFields(sg.fields, BOQ_FIELD_KEYS);
          boqItems = [...boqItems, { id, projectId, phaseId, ...fields, audit: [{ at: nowISO(), change: 'added' }] }];
          changes.push({ type: 'add', boqItemId: id, after: fields });
        } else if (sg.type === 'modify') {
          const base = byId[sg.boqItemId];
          if (!base) continue;
          const before = {}, after = {};
          for (const k of Object.keys(sg.patch)) { before[k] = base[k] ?? null; after[k] = sg.patch[k] ?? null; }
          boqItems = boqItems.map((b) => b.id === sg.boqItemId ? { ...b, ...sg.patch } : b);
          changes.push({ type: 'modify', boqItemId: sg.boqItemId, before, after });
        } else if (sg.type === 'delete') {
          const base = byId[sg.boqItemId];
          boqItems = boqItems.filter((b) => b.id !== sg.boqItemId);
          if (sg.deletePrs) {
            prs = prs.filter((p) => p.boqItemId !== sg.boqItemId);
          } else {
            prs = prs.map((p) => p.boqItemId === sg.boqItemId
              ? { ...p, boqItemId: null, projectId: p.projectId || projectId }
              : p);
          }
          changes.push({ type: 'delete', boqItemId: sg.boqItemId, before: pickFields(base || {}, BOQ_FIELD_KEYS), keptPrs: !sg.deletePrs });
        }
      }
      const entry = {
        id: uid('edit'), projectId, phaseId, at: nowISO(),
        author: { id: d.currentUser?.id, name: d.currentUser?.name },
        message: (message || '').trim(), changes,
      };
      return {
        ...d, boqItems, prs,
        boqStaged: d.boqStaged.filter((s) => !(s.phaseId === phaseId && committedKeys.has(stagedKey(s)))),
        boqEdits: [...d.boqEdits, entry],
      };
    });
  }, []);

  // ---- Phase CRUD ----
  const addPhase = useCallback((projectId, name) => {
    const id = uid('ph');
    setDb((d) => {
      const order = Math.max(-1, ...d.phases.filter((p) => p.projectId === projectId).map((p) => p.order ?? 0)) + 1;
      return { ...d, phases: [...d.phases, { id, projectId, name: (name || 'New phase').trim(), order, boqStatus: 'draft', createdAt: nowISO() }] };
    });
    return id;
  }, []);
  const updatePhase = useCallback((id, patch) => {
    setDb((d) => ({ ...d, phases: d.phases.map((p) => p.id === id ? { ...p, ...patch, name: patch.name != null ? (patch.name.trim() || p.name) : p.name } : p) }));
  }, []);
  // A phase's own start date (null = inherit the project start). Never earlier than the
  // project start. Free to change while drafting; once the phase is finalized (working),
  // each change is recorded in the phase's commit history so it's auditable.
  const setPhaseStart = useCallback((phaseId, date) => {
    setDb((d) => {
      const ph = d.phases.find((p) => p.id === phaseId);
      if (!ph) return d;
      const proj = d.projects.find((p) => p.id === ph.projectId);
      let next = date || null;
      if (next && proj?.startDate && next < proj.startDate) next = proj.startDate; // clamp to project start
      if ((ph.startDate || null) === next) return d; // no-op
      const phases = d.phases.map((p) => (p.id === phaseId ? { ...p, startDate: next } : p));
      if (ph.boqStatus !== 'working') return { ...d, phases }; // draft: untracked
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      const entry = {
        id: uid('edit'), projectId: ph.projectId, phaseId, at: nowISO(), author: actor, message: '',
        changes: [{ type: 'phaseStart', before: ph.startDate || null, after: next }],
      };
      return { ...d, phases, boqEdits: [...d.boqEdits, entry] };
    });
  }, []);
  const reorderPhase = useCallback((id, dir) => {
    setDb((d) => {
      const ph = d.phases.find((p) => p.id === id);
      if (!ph) return d;
      const sibs = d.phases.filter((p) => p.projectId === ph.projectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const i = sibs.findIndex((p) => p.id === id);
      const j = i + dir;
      if (j < 0 || j >= sibs.length) return d;
      const a = sibs[i], b = sibs[j];
      return { ...d, phases: d.phases.map((p) => p.id === a.id ? { ...p, order: b.order ?? 0 } : p.id === b.id ? { ...p, order: a.order ?? 0 } : p) };
    });
  }, []);
  // Delete a phase: blocked if it's the last one in a project. Cascades its BoQ items,
  // their PRs, and any staged/committed history (kept simple — hard delete, with UI confirm).
  const deletePhase = useCallback((id) => {
    setDb((d) => {
      const ph = d.phases.find((p) => p.id === id);
      if (!ph) return d;
      if (d.phases.filter((p) => p.projectId === ph.projectId).length <= 1) return d; // keep ≥1
      const itemIds = new Set(d.boqItems.filter((b) => b.phaseId === id).map((b) => b.id));
      return {
        ...d,
        phases: d.phases.filter((p) => p.id !== id),
        boqItems: d.boqItems.filter((b) => b.phaseId !== id),
        prs: d.prs.filter((p) => !(p.boqItemId && itemIds.has(p.boqItemId))),
        boqStaged: d.boqStaged.filter((s) => s.phaseId !== id),
      };
    });
  }, []);

  // ---- Suppliers (Feature 5.3) ----

  // ---- Brands (per-material; one row each — never a list jammed in a cell) ----
  const deleteBrand = useCallback((id) => {
    setDb((d) => ({
      ...d,
      brands: (d.brands || []).filter((b) => b.id !== id),
      prs: d.prs.map((p) => p.brandId === id ? { ...p, brandId: null } : p), // don't orphan PRs
    }));
  }, []);

  // ---- Soft delete / trash (move-out, not flag-in-place) ----
  // Deleted records LEAVE their collection and live in `trash` with a full payload, so every page
  // and the reconcile/schedule engines keep seeing only live data. Restore re-inserts; auto-purged at 7 days.
  const trashEntry = (entity, summary, records) => ({
    id: uid('trash'), entity, summary, deletedAt: nowISO(), records,
    count: Object.values(records).reduce((n, arr) => n + arr.length, 0),
  });

  const softDeletePr = useCallback((id) => {
    setDb((d) => {
      const pr = d.prs.find((p) => p.id === id);
      if (!pr) return d;
      const mat = d.materials.find((m) => m.id === pr.materialId);
      const summary = `PR · ${mat?.canonicalName || 'material'} · ${pr.quantity} ${pr.unit || ''}`.trim();
      return { ...d, prs: d.prs.filter((p) => p.id !== id), prStaged: (d.prStaged || []).filter((s) => s.prId !== id), trash: [trashEntry('pr', summary, { prs: [pr] }), ...(d.trash || [])] };
    });
  }, []);

  // Delete a BoQ line → Trash (restorable for 7 days). Any orders tied to the line go with it
  // so a restore brings the line and its PRs back together.
  const softDeleteBoqItem = useCallback((id) => {
    setDb((d) => {
      const item = d.boqItems.find((b) => b.id === id);
      if (!item) return d;
      const prs = d.prs.filter((p) => p.boqItemId === id);
      const matName = d.materials.find((m) => m.id === item.materialId)?.canonicalName || 'item';
      const summary = `BoQ line · ${matName}${item.description ? ` — ${item.description}` : ''}`;
      return {
        ...d,
        boqItems: d.boqItems.filter((b) => b.id !== id),
        prs: d.prs.filter((p) => p.boqItemId !== id),
        trash: [trashEntry('boqItem', summary, { boqItems: [item], prs }), ...(d.trash || [])],
      };
    });
  }, []);

  // Unused-only: callers (UI) block deletion when a material is referenced by live BoQ items / PRs.
  const softDeleteMaterial = useCallback((id) => {
    setDb((d) => {
      const mat = d.materials.find((m) => m.id === id);
      if (!mat) return d;
      const brands = (d.brands || []).filter((b) => b.materialId === id);
      return {
        ...d,
        materials: d.materials.filter((m) => m.id !== id),
        brands: (d.brands || []).filter((b) => b.materialId !== id),
        trash: [trashEntry('material', `Material · ${mat.canonicalName}`, { materials: [mat], brands }), ...(d.trash || [])],
      };
    });
  }, []);

  const softDeleteMaterialType = useCallback((id) => {
    setDb((d) => {
      const t = d.materialTypes.find((x) => x.id === id);
      if (!t) return d;
      return {
        ...d,
        materialTypes: d.materialTypes.filter((x) => x.id !== id),
        trash: [trashEntry('materialType', `Material type · ${t.name}`, { materialTypes: [t] }), ...(d.trash || [])],
      };
    });
  }, []);

  const softDeleteProject = useCallback((id) => {
    setDb((d) => {
      const proj = d.projects.find((x) => x.id === id);
      if (!proj) return d;
      const boqItems = d.boqItems.filter((b) => b.projectId === id);
      const boqIds = new Set(boqItems.map((b) => b.id));
      const prs = d.prs.filter((pr) => pr.projectId === id || (pr.boqItemId && boqIds.has(pr.boqItemId)));
      const prIds = new Set(prs.map((pr) => pr.id));
      const boqStaged = (d.boqStaged || []).filter((sg) => sg.projectId === id);
      const boqEdits = (d.boqEdits || []).filter((e) => e.projectId === id);
      const phases = (d.phases || []).filter((ph) => ph.projectId === id);
      const summary = `Project · ${proj.code || proj.name}${proj.code ? ` — ${proj.name}` : ''}`;
      return {
        ...d,
        projects: d.projects.filter((x) => x.id !== id),
        phases: (d.phases || []).filter((ph) => ph.projectId !== id),
        boqItems: d.boqItems.filter((b) => b.projectId !== id),
        prs: d.prs.filter((pr) => !prIds.has(pr.id)),
        boqStaged: (d.boqStaged || []).filter((sg) => sg.projectId !== id),
        boqEdits: (d.boqEdits || []).filter((e) => e.projectId !== id),
        trash: [trashEntry('project', summary, { projects: [proj], phases, boqItems, prs, boqStaged, boqEdits }), ...(d.trash || [])],
      };
    });
  }, []);

  const restoreTrash = useCallback((trashId) => {
    setDb((d) => {
      const entry = (d.trash || []).find((t) => t.id === trashId);
      if (!entry) return d;
      const next = { ...d };
      for (const [coll, recs] of Object.entries(entry.records)) next[coll] = [...(d[coll] || []), ...recs];
      next.trash = (d.trash || []).filter((t) => t.id !== trashId);
      return next;
    });
  }, []);

  const purgeTrash = useCallback((trashId) => {
    setDb((d) => ({ ...d, trash: (d.trash || []).filter((t) => t.id !== trashId) }));
  }, []);

  // ---- Material types (source of truth for every type dropdown / filter) ----

  // ---- Projects & mandors ----

  // ---- Team / users (staff records the app references; not login accounts) ----
  const updateUser = useCallback((id, patch) => {
    setDb((d) => ({
      ...d,
      users: d.users.map((u) => u.id === id ? { ...u, ...patch } : u),
      // keep the signed-in pointer in sync if it's the same person
      currentUser: d.currentUser && d.currentUser.id === id ? { ...d.currentUser, ...patch } : d.currentUser,
    }));
  }, []);
  const deleteUser = useCallback((id) => {
    setDb((d) => {
      if (d.currentUser && d.currentUser.id === id) return d; // never remove the signed-in user
      return { ...d, users: d.users.filter((u) => u.id !== id) };
    });
  }, []);

  // ---- Purchase Requests (Feature 5.4) ----
  // BR-3: a PR cannot exist without a linked BoQ item.
  // BR-1/BR-2: material + unit are inherited from that BoQ item, never re-typed.
  const addPr = useCallback((pr) => {
    const id = uid('pr');
    setDb((d) => {
      const boqItem = pr.boqItemId ? d.boqItems.find((b) => b.id === pr.boqItemId) : null;
      if (pr.boqItemId && !boqItem) return d;        // a linked PR must point to a real line
      const projectId = boqItem ? boqItem.projectId : pr.projectId;
      if (!projectId) return d;                       // every PR belongs to a project
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      const status = pr.status || defaultStatusId(d);
      const rec = {
        id,
        projectId,
        phaseId: boqItem ? boqItem.phaseId : (pr.phaseId && pr.phaseId !== '__all' ? pr.phaseId : null),
        boqItemId: pr.boqItemId || null,              // null = extra (not in the BoQ plan)
        brandId: pr.brandId || null,                  // which brand was actually bought (optional)
        materialId: boqItem ? boqItem.materialId : pr.materialId,  // inherited if linked, else explicit
        unit: boqItem ? boqItem.unit : (pr.unit || ''),
        quantity: Number(pr.quantity) || 0,
        supplierPrimaryId: pr.supplierPrimaryId || null,
        supplierSecondaryId: pr.supplierSecondaryId || null,
        picId: pr.picId || null,
        unitCost: Number(pr.unitCost) || 0,
        status,
        orderDate: pr.orderDate || null,
        receiptDate: status === 'received' ? (pr.receiptDate || null) : null, // no receipt date unless received
        comment: pr.comment || '',
        createdAt: nowISO(),
        statusHistory: [{ at: nowISO(), from: null, to: status, by: actor }],
      };
      return { ...d, prs: [...d.prs, rec] };
    });
    return id;
  }, []);

  const updatePr = useCallback((id, patch) => {
    setDb((d) => {
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      return {
        ...d,
        prs: d.prs.map((p) => {
          if (p.id !== id) return p;
          const next = { ...p, ...patch };
          if (next.quantity != null) next.quantity = Number(next.quantity) || 0;
          if (next.unitCost != null) next.unitCost = Number(next.unitCost) || 0;
          if (next.status !== 'received') next.receiptDate = null;   // receipt only when received
          const statusChanged = patch.status != null && patch.status !== p.status;
          next.statusHistory = statusChanged
            ? [...(p.statusHistory || []), { at: nowISO(), from: p.status, to: next.status, by: actor }]
            : (p.statusHistory || []);
          return next;
        }),
      };
    });
  }, []);

  // BR-4: received requires a receipt date. Returns {ok,error}.
  const setPrStatus = useCallback((id, status, receiptDate) => {
    let result = { ok: true };
    setDb((d) => {
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      return {
        ...d,
        prs: d.prs.map((p) => {
          if (p.id !== id) return p;
          if (status === 'received' && !(receiptDate || p.receiptDate)) {
            result = { ok: false, error: 'A receipt date is required to mark a PR received.' };
            return p;
          }
          const changed = status !== p.status;
          return {
            ...p,
            status,
            receiptDate: status === 'received' ? (receiptDate || p.receiptDate) : null, // clear unless received
            orderDate: (isCommitted(d, status) && !isCommitted(d, p.status) && !p.orderDate) ? today() : p.orderDate,
            statusHistory: changed
              ? [...(p.statusHistory || []), { at: nowISO(), from: p.status, to: status, by: actor }]
              : (p.statusHistory || []),
          };
        }),
      };
    });
    return result;
  }, []);

  const deletePr = useCallback((id) => {
    setDb((d) => ({ ...d, prs: d.prs.filter((p) => p.id !== id), prStaged: (d.prStaged || []).filter((s) => s.prId !== id) }));
  }, []);

  // ---- Staged PR status changes (review & commit, like the BoQ flow) ----
  // Only "major" transitions (crossing Ordered/Received) are staged; the UI applies the rest
  // instantly via setPrStatus. One pending change per PR; staging the current status clears it.
  const stagePrStatus = useCallback((prId, to, receiptDate = null) => {
    setDb((d) => {
      const pr = d.prs.find((p) => p.id === prId);
      if (!pr) return d;
      const others = (d.prStaged || []).filter((s) => s.prId !== prId);
      if (to === pr.status) return { ...d, prStaged: others }; // back to current = no pending change
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      const entry = {
        id: uid('prc'), prId, projectId: pr.projectId, from: pr.status, to,
        receiptDate: isReceived(d, to) ? (receiptDate || pr.receiptDate || null) : null,
        at: nowISO(), by: actor,
      };
      return { ...d, prStaged: [...others, entry] };
    });
  }, []);
  const unstagePr = useCallback((prId) => {
    setDb((d) => ({ ...d, prStaged: (d.prStaged || []).filter((s) => s.prId !== prId) }));
  }, []);
  const discardPrStaged = useCallback((projectId = null) => {
    setDb((d) => ({ ...d, prStaged: (d.prStaged || []).filter((s) => (projectId ? s.projectId !== projectId : false)) }));
  }, []);
  // Apply the selected staged changes (by stage id), recording each on the PR's status history
  // with the commit note. Unselected stays staged (granular). Mirrors setPrStatus semantics.
  const commitPrStaged = useCallback((stageIds, message) => {
    setDb((d) => {
      const ids = new Set(stageIds);
      const toApply = (d.prStaged || []).filter((s) => ids.has(s.id));
      if (toApply.length === 0) return d;
      const byPr = Object.fromEntries(toApply.map((s) => [s.prId, s]));
      const actor = d.currentUser ? { id: d.currentUser.id, name: d.currentUser.name } : null;
      const note = (message || '').trim() || null;
      const prs = d.prs.map((p) => {
        const s = byPr[p.id];
        if (!s || s.to === p.status) return p; // skip no-ops (status drifted to target already)
        return {
          ...p,
          status: s.to,
          receiptDate: isReceived(d, s.to) ? (s.receiptDate || p.receiptDate || null) : null,
          orderDate: (isCommitted(d, s.to) && !isCommitted(d, p.status) && !p.orderDate) ? today() : p.orderDate,
          statusHistory: [...(p.statusHistory || []), { at: nowISO(), from: p.status, to: s.to, by: actor, note }],
        };
      });
      return { ...d, prs, prStaged: (d.prStaged || []).filter((s) => !ids.has(s.id)) };
    });
  }, []);

  // Import seam — replace any of the top-level collections from an external source
  // (manual paste/upload, or a backend fetch later). Shape mirrors `seed`:
  //   { materials?, materialTypes?, suppliers?, projects?, mandors?, boqItems?, prs? }
  // Pages never read storage directly, so swapping the source touches only this layer.
  const importData = useCallback((payload, { merge = false } = {}) => {
    setDb((d) => {
      if (!merge) return { ...d, ...payload };
      const next = { ...d };
      for (const k of Object.keys(payload)) {
        next[k] = Array.isArray(d[k]) ? [...d[k], ...payload[k]] : payload[k];
      }
      return next;
    });
  }, []);

  // Bulk CSV import (materials / suppliers / projects / boq). The pure engine resolves and
  // creates foreign keys and returns the next db; we just commit it with real ids. `parsed`
  // is { headers, rows } from parseCsv; `context` carries e.g. the current project for BoQ.
  const importEntity = useCallback((entity, parsed, context = {}) => {
    setDb((d) => applyImport(d, entity, parsed, context, uid).db);
  }, []);

  const resetDb = useCallback(() => {
    const fresh = structuredClone(seed);
    setDb(fresh);
    setCurrentProjectId(fresh.projects[0]?.id);
  }, []);

  const value = useMemo(() => ({
    db, currentProjectId, setCurrentProjectId, currentPhaseId, setCurrentPhaseId,
    addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, patchBoqItem, softDeleteBoqItem, finalizePhase,
    addPhase, updatePhase, reorderPhase, deletePhase, setPhaseStart,
    stageBoqModify, stageBoqAdd, editStagedAdd, stageBoqDelete, unstageBoq, discardBoqStaged, commitBoqStaged,
    addSupplier, updateSupplier, deleteSupplier,
    addBrand, updateBrand, deleteBrand,
    softDeletePr, softDeleteMaterial, softDeleteMaterialType, softDeleteProject, restoreTrash, purgeTrash,
    addMaterialType, updateMaterialType,
    addProject, updateProject, completeProject, reopenProject, addProjectType, deleteProjectType, addMandor, updateMandor, deleteMandor,
    addPrStatus, updatePrStatus, reorderPrStatus, retirePrStatus, restorePrStatus,
    addUser, updateUser, deleteUser,
    addPr, updatePr, setPrStatus, deletePr,
    stagePrStatus, unstagePr, discardPrStaged, commitPrStaged,
    importData, importEntity,
    syncStatus, connectRemote, useOffline,
    resetDb,
  }), [db, currentProjectId, currentPhaseId, syncStatus, connectRemote, useOffline, addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, patchBoqItem, softDeleteBoqItem, finalizePhase,
    addPhase, updatePhase, reorderPhase, deletePhase, setPhaseStart,
    stageBoqModify, stageBoqAdd, editStagedAdd, stageBoqDelete, unstageBoq, discardBoqStaged, commitBoqStaged, addSupplier, updateSupplier, deleteSupplier, addBrand, updateBrand, deleteBrand, softDeletePr, softDeleteMaterial, softDeleteMaterialType, softDeleteProject, restoreTrash, purgeTrash, addMaterialType, updateMaterialType, addProject, updateProject, completeProject, reopenProject, addProjectType, deleteProjectType, addPrStatus, updatePrStatus, reorderPrStatus, retirePrStatus, restorePrStatus, addMandor, updateMandor, deleteMandor,
    addUser, updateUser, deleteUser,
    addPr, updatePr, setPrStatus, deletePr,
    stagePrStatus, unstagePr, discardPrStaged, commitPrStaged, importData, importEntity, resetDb]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// Convenience lookups.
export function useProject() {
  const { db, currentProjectId } = useStore();
  return db.projects.find((p) => p.id === currentProjectId) || db.projects[0];
}

// Phases of the current project, ordered. `currentPhaseId` may be '__all'.
export function useProjectPhases() {
  const { db, currentProjectId } = useStore();
  return (db.phases || []).filter((ph) => ph.projectId === currentProjectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function useCurrentPhase() {
  const { db, currentPhaseId } = useStore();
  if (!currentPhaseId || currentPhaseId === '__all') return null;
  return (db.phases || []).find((ph) => ph.id === currentPhaseId) || null;
}
