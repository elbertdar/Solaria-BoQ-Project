// store/StoreContext.jsx — single in-memory db, persisted to localStorage.
// Backend (Supabase) is deferred; this layer is the seam we'll swap later.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { seed } from '../data/seed.js';
import { nowISO } from '../engine/format.js';

const KEY = 'solaria_boq_db_v10';
const StoreCtx = createContext(null);

function normalize(d) {
  if (!Array.isArray(d.boqStaged)) d.boqStaged = [];
  if (!Array.isArray(d.boqEdits)) d.boqEdits = [];
  if (!Array.isArray(d.brands)) d.brands = [];
  if (!Array.isArray(d.trash)) d.trash = [];
  if (!Array.isArray(d.projectTypes)) d.projectTypes = [];
  // Deletion becomes permanent after 7 days: drop expired trash on load.
  { const cutoff = Date.now() - 7 * 86400000; d.trash = d.trash.filter((t) => t && t.deletedAt && new Date(t.deletedAt).getTime() > cutoff); }
  if (Array.isArray(d.projects)) for (const p of d.projects) if (!p.boqStatus) p.boqStatus = 'draft';
  if (Array.isArray(d.boqItems)) for (const b of d.boqItems) {
    if (!b.budgetBasis) b.budgetBasis = 'quantity';
    if (b.allowanceAmount == null) b.allowanceAmount = 0;
  }
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
  const [currentProjectId, setCurrentProjectId] = useState(() => load().projects[0]?.id);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* quota */ }
  }, [db]);

  // ---- Catalogue (Feature 5.1) ----
  // ---- Collection CRUD via factory (aliased to the original names; value/deps unchanged) ----
  const materialCrud = useMemo(() => makeCrud(setDb, 'materials', 'mat', { aliases: [] }), []);
  const addMaterial = materialCrud.add, updateMaterial = materialCrud.update;
  const supplierCrud = useMemo(() => makeCrud(setDb, 'suppliers', 's', { materialTypeIds: [] }), []);
  const addSupplier = supplierCrud.add;
  const brandCrud = useMemo(() => makeCrud(setDb, 'brands', 'br'), []);
  const addBrand = brandCrud.add, updateBrand = brandCrud.update;
  const typeCrud = useMemo(() => makeCrud(setDb, 'materialTypes', 'mt', { description: '' }), []);
  const addMaterialType = typeCrud.add, updateMaterialType = typeCrud.update;
  const projectCrud = useMemo(() => makeCrud(setDb, 'projects', 'p', { client: 'Solaria F&B', location: '' }), []);
  const addProject = projectCrud.add, updateProject = projectCrud.update;
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
  const addMandor = useMemo(() => (name) => mandorCrud.add({ name }), []);
  const updateMandor = mandorCrud.update, deleteMandor = mandorCrud.remove;
  const userCrud = useMemo(() => makeCrud(setDb, 'users', 'u', { role: 'Purchasing PIC' }), []);
  const addUser = userCrud.add;

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
  const deleteBoqItem = useCallback((id) => {
    setDb((d) => ({
      ...d,
      boqItems: d.boqItems.filter((b) => b.id !== id),
      prs: d.prs.filter((pr) => pr.boqItemId !== id), // drop any orders tied to the removed line
    }));
  }, []);
  // Finalize a project's BoQ: draft → working (one-way). Enables deliberate edits + ordering.
  const finalizeBoq = useCallback((projectId) => {
    setDb((d) => ({ ...d, projects: d.projects.map((pj) => pj.id === projectId ? { ...pj, boqStatus: 'working' } : pj) }));
  }, []);

  // ---- Phase 2: staged BoQ edits (working phase) + commit to append-only history ----
  const stageBoqModify = useCallback((projectId, boqItemId, patch) => {
    setDb((d) => {
      const base = d.boqItems.find((b) => b.id === boqItemId);
      if (!base) return d;
      const existing = d.boqStaged.find((s) => s.projectId === projectId && s.type === 'modify' && s.boqItemId === boqItemId);
      const merged = { ...(existing?.patch || {}), ...patch };
      const net = {};
      for (const k of Object.keys(merged)) if ((base[k] ?? null) !== (merged[k] ?? null)) net[k] = merged[k];
      const others = d.boqStaged.filter((s) => !(s.projectId === projectId && s.type === 'modify' && s.boqItemId === boqItemId));
      const deleted = d.boqStaged.some((s) => s.projectId === projectId && s.type === 'delete' && s.boqItemId === boqItemId);
      if (deleted || Object.keys(net).length === 0) return { ...d, boqStaged: others };
      return { ...d, boqStaged: [...others, { projectId, type: 'modify', boqItemId, patch: net }] };
    });
  }, []);

  const stageBoqAdd = useCallback((projectId, fields) => {
    const tempId = uid('stg');
    setDb((d) => ({ ...d, boqStaged: [...d.boqStaged, { projectId, type: 'add', tempId, fields: pickFields(fields, BOQ_FIELD_KEYS) }] }));
    return tempId;
  }, []);

  const editStagedAdd = useCallback((projectId, tempId, patch) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.map((s) =>
      (s.projectId === projectId && s.type === 'add' && s.tempId === tempId) ? { ...s, fields: { ...s.fields, ...patch } } : s) }));
  }, []);

  const stageBoqDelete = useCallback((projectId, boqItemId, { deletePrs = false } = {}) => {
    setDb((d) => {
      const others = d.boqStaged.filter((s) => !(s.projectId === projectId && s.boqItemId === boqItemId && (s.type === 'modify' || s.type === 'delete')));
      return { ...d, boqStaged: [...others, { projectId, type: 'delete', boqItemId, deletePrs }] };
    });
  }, []);

  const unstageBoq = useCallback((projectId, ref) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.filter((s) => {
      if (s.projectId !== projectId) return true;
      if (ref.tempId) return s.tempId !== ref.tempId;
      return !(s.type === ref.type && s.boqItemId === ref.boqItemId);
    }) }));
  }, []);

  const discardBoqStaged = useCallback((projectId) => {
    setDb((d) => ({ ...d, boqStaged: d.boqStaged.filter((s) => s.projectId !== projectId) }));
  }, []);

  const commitBoqStaged = useCallback((projectId, message) => {
    setDb((d) => {
      const staged = d.boqStaged.filter((s) => s.projectId === projectId);
      if (staged.length === 0) return d;
      const byId = Object.fromEntries(d.boqItems.map((b) => [b.id, b]));
      const changes = [];
      let boqItems = [...d.boqItems];
      let prs = d.prs;
      for (const sg of staged) {
        if (sg.type === 'add') {
          const id = uid('b');
          const fields = pickFields(sg.fields, BOQ_FIELD_KEYS);
          boqItems = [...boqItems, { id, projectId, ...fields, audit: [{ at: nowISO(), change: 'added' }] }];
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
            prs = prs.filter((p) => p.boqItemId !== sg.boqItemId);     // remove its orders too
          } else {
            prs = prs.map((p) => p.boqItemId === sg.boqItemId
              ? { ...p, boqItemId: null, projectId: p.projectId || projectId }  // keep, now extra
              : p);
          }
          changes.push({ type: 'delete', boqItemId: sg.boqItemId, before: pickFields(base || {}, BOQ_FIELD_KEYS), keptPrs: !sg.deletePrs });
        }
      }
      const entry = {
        id: uid('edit'), projectId, at: nowISO(),
        author: { id: d.currentUser?.id, name: d.currentUser?.name },
        message: (message || '').trim(), changes,
      };
      return { ...d, boqItems, prs, boqStaged: d.boqStaged.filter((s) => s.projectId !== projectId), boqEdits: [...d.boqEdits, entry] };
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
      return { ...d, prs: d.prs.filter((p) => p.id !== id), trash: [trashEntry('pr', summary, { prs: [pr] }), ...(d.trash || [])] };
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
      const summary = `Project · ${proj.code || proj.name}${proj.code ? ` — ${proj.name}` : ''}`;
      return {
        ...d,
        projects: d.projects.filter((x) => x.id !== id),
        boqItems: d.boqItems.filter((b) => b.projectId !== id),
        prs: d.prs.filter((pr) => !prIds.has(pr.id)),
        boqStaged: (d.boqStaged || []).filter((sg) => sg.projectId !== id),
        boqEdits: (d.boqEdits || []).filter((e) => e.projectId !== id),
        trash: [trashEntry('project', summary, { projects: [proj], boqItems, prs, boqStaged, boqEdits }), ...(d.trash || [])],
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
      const status = pr.status || 'draft';
      const rec = {
        id,
        projectId,
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
            orderDate: (status === 'ordered' && !p.orderDate) ? (new Date().toISOString().slice(0, 10)) : p.orderDate,
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
    setDb((d) => ({ ...d, prs: d.prs.filter((p) => p.id !== id) }));
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

  const resetDb = useCallback(() => {
    const fresh = structuredClone(seed);
    setDb(fresh);
    setCurrentProjectId(fresh.projects[0]?.id);
  }, []);

  const value = useMemo(() => ({
    db, currentProjectId, setCurrentProjectId,
    addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, patchBoqItem, deleteBoqItem, finalizeBoq,
    stageBoqModify, stageBoqAdd, editStagedAdd, stageBoqDelete, unstageBoq, discardBoqStaged, commitBoqStaged,
    addSupplier,
    addBrand, updateBrand, deleteBrand,
    softDeletePr, softDeleteMaterial, softDeleteMaterialType, softDeleteProject, restoreTrash, purgeTrash,
    addMaterialType, updateMaterialType,
    addProject, updateProject, addProjectType, deleteProjectType, addMandor, updateMandor, deleteMandor,
    addUser, updateUser, deleteUser,
    addPr, updatePr, setPrStatus, deletePr,
    importData,
    resetDb,
  }), [db, currentProjectId, addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, patchBoqItem, deleteBoqItem, finalizeBoq,
    stageBoqModify, stageBoqAdd, editStagedAdd, stageBoqDelete, unstageBoq, discardBoqStaged, commitBoqStaged, addSupplier, addBrand, updateBrand, deleteBrand, softDeletePr, softDeleteMaterial, softDeleteMaterialType, softDeleteProject, restoreTrash, purgeTrash, addMaterialType, updateMaterialType, addProject, updateProject, addProjectType, deleteProjectType, addMandor, updateMandor, deleteMandor,
    addUser, updateUser, deleteUser,
    addPr, updatePr, setPrStatus, deletePr, importData, resetDb]);

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
