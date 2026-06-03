// store/StoreContext.jsx — single in-memory db, persisted to localStorage.
// Backend (Supabase) is deferred; this layer is the seam we'll swap later.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { seed } from '../data/seed.js';
import { nowISO } from '../engine/format.js';

const KEY = 'solaria_boq_db_v2';
const StoreCtx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to seed */ }
  return structuredClone(seed);
}

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

  // ---- Suppliers (Feature 5.3) ----
  const addSupplier = useCallback((s) => {
    const id = uid('s');
    setDb((d) => ({ ...d, suppliers: [...d.suppliers, { id, materialTypeIds: [], ...s }] }));
    return id;
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

  const resetDb = useCallback(() => {
    const fresh = structuredClone(seed);
    setDb(fresh);
    setCurrentProjectId(fresh.projects[0]?.id);
  }, []);

  const value = useMemo(() => ({
    db, currentProjectId, setCurrentProjectId,
    addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem,
    addSupplier,
    addPr, updatePr, setPrStatus,
    resetDb,
  }), [db, currentProjectId, addMaterial, updateMaterial, addAlias, removeAlias,
    addBoqItem, updateBoqItem, addSupplier, addPr, updatePr, setPrStatus, resetDb]);

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
