// engine/reconcile.js — the reason the system exists.
// "Selalu check Balance BoQ vs Purchase!!"  (requirements §1, BR-6/BR-7)
//
// All pure functions over the db object. Recomputed on every render from
// source records, so the balance is always live — never stored, never stale.

import { COMMITTED_STATUSES, RECEIVED_STATUSES } from '../theme.js';

const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);

export function materialName(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId);
  return m ? m.canonicalName : '(unknown)';
}
export function materialUnit(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId);
  return m ? m.defaultUnit : '';
}

export function boqForProject(db, projectId) {
  return db.boqItems.filter((b) => b.projectId === projectId);
}
export function prsForProject(db, projectId) {
  const ids = new Set(boqForProject(db, projectId).map((b) => b.id));
  return db.prs.filter((p) => ids.has(p.boqItemId));
}
export function prsForBoqItem(db, boqItemId) {
  return db.prs.filter((p) => p.boqItemId === boqItemId && p.status !== 'cancelled');
}
export function boqItemHasPr(db, boqItemId) {
  return db.prs.some((p) => p.boqItemId === boqItemId && p.status !== 'cancelled');
}

// One reconciliation row per canonical material that appears in this project.
export function summarizeProject(db, projectId) {
  const boq = boqForProject(db, projectId);
  const prs = prsForProject(db, projectId);

  const materialIds = new Set([
    ...boq.map((b) => b.materialId),
    ...prs.map((p) => p.materialId),
  ]);

  const rows = [...materialIds].map((mid) => {
    const bItems = boq.filter((b) => b.materialId === mid);
    const pItems = prs.filter((p) => p.materialId === mid);

    const committed = pItems.filter((p) => COMMITTED_STATUSES.includes(p.status));
    const received = pItems.filter((p) => RECEIVED_STATUSES.includes(p.status));

    const budgetQty = sum(bItems, (b) => b.quantity);
    const committedQty = sum(committed, (p) => p.quantity);
    const receivedQty = sum(received, (p) => p.quantity);

    const budgetCost = sum(bItems, (b) => b.quantity * (b.expectedUnitCost || 0));
    const actualCost = sum(received, (p) => p.quantity * (p.unitCost || 0));

    const balanceQty = receivedQty - budgetQty;          // + = over (received basis)
    const committedBalanceQty = committedQty - budgetQty; // + = over (commitment basis)
    const costDelta = actualCost - budgetCost;

    return {
      materialId: mid,
      materialName: materialName(db, mid),
      unit: bItems[0]?.unit || materialUnit(db, mid),
      budgetQty, committedQty, receivedQty,
      balanceQty, committedBalanceQty,
      budgetCost, actualCost, costDelta,
      isOver: receivedQty > budgetQty,
      isOverCommitted: committedQty > budgetQty,
      boqItems: bItems,
      prs: pItems,
    };
  });

  rows.sort((a, b) => Number(b.isOverCommitted) - Number(a.isOverCommitted)
    || b.budgetCost - a.budgetCost);
  return rows;
}

// Project-level over-quantity warnings (BR-7). Fires on the commitment basis so
// over-ordering is caught at PO time, not only at receipt. (See Q-3 / Q-7 notes.)
export function projectWarnings(db, projectId) {
  return summarizeProject(db, projectId)
    .filter((r) => r.isOverCommitted)
    .map((r) => ({
      materialId: r.materialId,
      materialName: r.materialName,
      unit: r.unit,
      budgetQty: r.budgetQty,
      committedQty: r.committedQty,
      overBy: r.committedQty - r.budgetQty,
    }));
}

// Submission-time check (Feature 5.6): if this PR's quantity is added/changed,
// would the material exceed its BoQ budget? Used live inside the PR modal.
export function checkProspectivePr(db, { boqItemId, quantity, excludePrId }) {
  const boqItem = db.boqItems.find((b) => b.id === boqItemId);
  if (!boqItem) return { ok: true };
  const projectId = boqItem.projectId;
  const materialId = boqItem.materialId;

  const budgetQty = sum(
    boqForProject(db, projectId).filter((b) => b.materialId === materialId),
    (b) => b.quantity,
  );

  const others = prsForProject(db, projectId).filter(
    (p) => p.materialId === materialId
      && p.id !== excludePrId
      && COMMITTED_STATUSES.includes(p.status),
  );
  const committedOther = sum(others, (p) => p.quantity);
  const committedAfter = committedOther + (Number(quantity) || 0);

  return {
    ok: committedAfter <= budgetQty,
    wouldExceed: committedAfter > budgetQty,
    budgetQty,
    committedAfter,
    overBy: Math.max(0, committedAfter - budgetQty),
    materialName: materialName(db, materialId),
    unit: boqItem.unit,
  };
}

// Rolled-up project totals for the overview KPIs.
export function projectTotals(db, projectId) {
  const rows = summarizeProject(db, projectId);
  const prs = prsForProject(db, projectId);
  return {
    budgetCost: sum(rows, (r) => r.budgetCost),
    committedCost: sum(prs.filter((p) => COMMITTED_STATUSES.includes(p.status)),
      (p) => p.quantity * (p.unitCost || 0)),
    actualCost: sum(rows, (r) => r.actualCost),
    materialsOver: rows.filter((r) => r.isOverCommitted).length,
    openPrs: prs.filter((p) => !['received', 'cancelled'].includes(p.status)).length,
    totalPrs: prs.filter((p) => p.status !== 'cancelled').length,
  };
}
