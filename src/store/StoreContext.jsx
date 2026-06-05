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
  if (Array.isArray(d.projects)) for (const p of d.projects) if (!p.boqStatus) p.boqStatus = 'draft';
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
const BOQ_FIELD_KEYS = ['materialId', 'description', 'mandorId', 'quantity', 'unit', 'expectedUnitCost', 'neededDayOffset', 'leadTimeDays'];
const pickFields = (o, keys) => { const r = {}; for (const k of keys) r[k] = o?.[k] ?? null; return r; };

let _uid = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(_uid++).toString(36)}`;

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [currentProjectId, setCurrentProjectId] = useState(() => load().projects[0]?.id);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* quota */ }
  }, [db]);

  // ---- Catalogue (Feature 5.1) ----
  const addMaterial = useCallback((m) => {
    const id = uid('mat');
    setDb((d) => ({ ...d, materials: [...d.materials, { id, aliases: [], ...m }] }));
    return id;
  }, []);
  const updateMaterial = useCallback((id, patch) => {
    setDb((d) => ({ ...d, materials: d.materials.map((m) => m.id === id ? { ...m, ...patch } : m) }));
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

  const stageBoqDelete = useCallback((projectId, boqItemId) => {
    setDb((d) => {
      const others = d.boqStaged.filter((s) => !(s.projectId === projectId && s.boqItemId === boqItemId && (s.type === 'modify' || s.type === 'delete')));
      return { ...d, boqStaged: [...others, { projectId, type: 'delete', boqItemId }] };
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
          prs = prs.filter((p) => p.boqItemId !== sg.boqItemId);
          changes.push({ type: 'delete', boqItemId: sg.boqItemId, before: pickFields(base || {}, BOQ_FIELD_KEYS) });
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
  const addSupplier = useCallback((s) => {
    const id = uid('s');
    setDb((d) => ({ ...d, suppliers: [...d.suppliers, { id, materialTypeIds: [], ...s }] }));
    return id;
  }, []);

  // ---- Material types (source of truth for every type dropdown / filter) ----
  const addMaterialType = useCallback((t) => {
    const id = uid('mt');
    setDb((d) => ({ ...d, materialTypes: [...d.materialTypes, { id, description: '', ...t }] }));
    return id;
  }, []);
  const updateMaterialType = useCallback((id, patch) => {
    setDb((d) => ({ ...d, materialTypes: d.materialTypes.map((t) => t.id === id ? { ...t, ...patch } : t) }));
  }, []);

  // ---- Projects & mandors ----
  const addProject = useCallback((p) => {
    const id = uid('p');
    setDb((d) => ({ ...d, projects: [...d.projects, { id, client: 'Solaria F&B', location: '', ...p }] }));
    return id;
  }, []);
  const updateProject = useCallback((id, patch) => {
    setDb((d) => ({ ...d, projects: d.projects.map((p) => p.id === id ? { ...p, ...patch } : p) }));
  }, []);
  const addMandor = useCallback((name) => {
    const id = uid('m');
    setDb((d) => ({ ...d, mandors: [...d.mandors, { id, name }] }));
    return id;
  }, []);
  const updateMandor = useCallback((id, patch) => {
    setDb((d) => ({ ...d, mandors: d.mandors.map((m) => m.id === id ? { ...m, ...patch } : m) }));
  }, []);
  const deleteMandor = useCallback((id) => {
    setDb((d) => ({ ...d, mandors: d.mandors.filter((m) => m.id !== id) }));
  }, []);

  // ---- Team / users (staff records the app references; not login accounts) ----
  const addUser = useCallback((u) => {
    const id = uid('u');
    setDb((d) => ({ ...d, users: [...d.users, { id, role: 'Purchasing PIC', ...u }] }));
    return id;
  }, []);
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
      const boqItem = d.boqItems.find((b) => b.id === pr.boqItemId);
      if (!boqItem) return d; // BR-3 guard
      const rec = {
        id,
        boqItemId: pr.boqItemId,
        materialId: boqItem.materialId,   // inherited
        unit: boqItem.unit,               // inherited
        quantity: Number(pr.quantity) || 0,
        supplierPrimaryId: pr.supplierPrimaryId || null,
        supplierSecondaryId: pr.supplierSecondaryId || null,
        picId: pr.picId || null,
        unitCost: Number(pr.unitCost) || 0,
        status: pr.status || 'draft',
        orderDate: pr.orderDate || null,
        receiptDate: pr.receiptDate || null,
        createdAt: nowISO(),
      };
      return { ...d, prs: [...d.prs, rec] };
    });
    return id;
  }, []);

  const updatePr = useCallback((id, patch) => {
    setDb((d) => ({
      ...d,
      prs: d.prs.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (next.quantity != null) next.quantity = Number(next.quantity) || 0;
        if (next.unitCost != null) next.unitCost = Number(next.unitCost) || 0;
        return next;
      }),
    }));
  }, []);

  // BR-4: received requires a receipt date. Returns {ok,error}.
  const setPrStatus = useCallback((id, status, receiptDate) => {
    let result = { ok: true };
    setDb((d) => ({
      ...d,
      prs: d.prs.map((p) => {
        if (p.id !== id) return p;
        if (status === 'received' && !(receiptDate || p.receiptDate)) {
          result = { ok: false, error: 'A receipt date is required to mark a PR received.' };
          return p;
        }
        return {
          ...p,
          status,
          receiptDate: status === 'received' ? (receiptDate || p.receiptDate) : p.receiptDate,
          orderDate: (status === 'ordered' && !p.orderDate) ? (new Date().toISOString().slice(0, 10)) : p.orderDate,
        };
      }),
    }));
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
    addMaterialType, updateMaterialType,
    addProject, updateProject, addMandor, updateMandor, deleteMandor,
    addUser, updateUser, deleteUser,
    addPr, updatePr, setPrStatus, deletePr,
    importData,
    resetDb,
  }), [db, currentProjectId, addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, patchBoqItem, deleteBoqItem, finalizeBoq,
    stageBoqModify, stageBoqAdd, editStagedAdd, stageBoqDelete, unstageBoq, discardBoqStaged, commitBoqStaged, addSupplier, addMaterialType, updateMaterialType, addProject, updateProject, addMandor, updateMandor, deleteMandor,
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
