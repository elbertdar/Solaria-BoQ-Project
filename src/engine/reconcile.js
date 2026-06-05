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
  return db.prs.filter((p) => p.projectId === projectId || (p.boqItemId && ids.has(p.boqItemId)));
}
// A PR is "extra" (not in the BoQ plan) when it has no BoQ line — either created standalone
// or its line was deleted and the PR kept.
export function isExtraPr(db, pr) {
  return !pr.boqItemId || !db.boqItems.some((b) => b.id === pr.boqItemId);
}
export function prsForBoqItem(db, boqItemId) {
  return db.prs.filter((p) => p.boqItemId === boqItemId && p.status !== 'cancelled');
}
export function boqItemHasPr(db, boqItemId) {
  return db.prs.some((p) => p.boqItemId === boqItemId && p.status !== 'cancelled');
}
// Quantity still left to order on a BoQ line = budget − already-committed (ordered + received).
// Used to pre-fill a new PR's quantity. Never negative.
export function remainingQty(db, boqItemId) {
  const b = db.boqItems.find((x) => x.id === boqItemId);
  if (!b) return 0;
  const committed = prsForBoqItem(db, boqItemId)
    .filter((p) => COMMITTED_STATUSES.includes(p.status))
    .reduce((t, p) => t + (p.quantity || 0), 0);
  return Math.max(0, (b.quantity || 0) - committed);
}

// Fulfilment status of a BoQ line, derived from its (non-cancelled) PRs:
//   'none'     — nothing ordered yet
//   'ordered'  — an order exists but the line isn't fully received
//   'complete' — received quantity covers the budgeted quantity (order fulfilled)
export function boqLineStatus(db, boqItemId) {
  const prs = prsForBoqItem(db, boqItemId);
  if (prs.length === 0) return 'none';
  const b = db.boqItems.find((x) => x.id === boqItemId);
  const budget = b?.quantity || 0;
  const received = prs
    .filter((p) => RECEIVED_STATUSES.includes(p.status))
    .reduce((t, p) => t + (p.quantity || 0), 0);
  if (budget > 0 && received >= budget) return 'complete';
  return 'ordered';
}

// One reconciliation row per canonical material that appears in this project.
export function summarizeProject(db, projectId) {
  const boq = boqForProject(db, projectId);
  const all = prsForProject(db, projectId);
  const linked = all.filter((p) => !isExtraPr(db, p));
  const extra = all.filter((p) => isExtraPr(db, p));

  const mkRow = (mid, bItems, pItems, isExtra) => {
    const committed = pItems.filter((p) => COMMITTED_STATUSES.includes(p.status));
    const received = pItems.filter((p) => RECEIVED_STATUSES.includes(p.status));
    const budgetQty = sum(bItems, (b) => b.quantity);
    const committedQty = sum(committed, (p) => p.quantity);
    const receivedQty = sum(received, (p) => p.quantity);
    const budgetCost = sum(bItems, (b) => b.quantity * (b.expectedUnitCost || 0));
    // Actual cost is recognized at commit time (committed = ordered + received), not at receipt.
    const actualCost = sum(committed, (p) => p.quantity * (p.unitCost || 0));
    return {
      key: isExtra ? mid + '::extra' : mid,
      materialId: mid,
      materialName: materialName(db, mid),
      unit: bItems[0]?.unit || pItems[0]?.unit || materialUnit(db, mid),
      extra: isExtra,
      budgetQty, committedQty, receivedQty,
      balanceQty: receivedQty - budgetQty,
      committedBalanceQty: committedQty - budgetQty,
      budgetCost, actualCost, costDelta: actualCost - budgetCost,
      // "Over budget" applies only to planned materials; extra rows carry their own indicator.
      isOver: !isExtra && receivedQty > budgetQty,
      isOverCommitted: !isExtra && committedQty > budgetQty,
      boqItems: bItems,
      prs: pItems,
    };
  };

  // Plan rows: one per BoQ material, counting only its LINKED PRs (avoids double-counting extras).
  const planRows = [...new Set(boq.map((b) => b.materialId))].map((mid) =>
    mkRow(mid, boq.filter((b) => b.materialId === mid), linked.filter((p) => p.materialId === mid), false));
  // Extra rows: one per material that appears only via extra PRs (not in the plan).
  const extraRows = [...new Set(extra.map((p) => p.materialId))].map((mid) =>
    mkRow(mid, [], extra.filter((p) => p.materialId === mid), true));

  planRows.sort((a, b) => Number(b.isOverCommitted) - Number(a.isOverCommitted) || b.budgetCost - a.budgetCost);
  extraRows.sort((a, b) => b.actualCost - a.actualCost);
  return [...planRows, ...extraRows]; // plan first, extras listed after
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

// ---- Phase 2: working-phase staged edits + commit history ----
export const BOQ_FIELDS = [
  { key: 'materialId', label: 'Material', kind: 'material' },
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'mandorId', label: 'Mandor', kind: 'mandor' },
  { key: 'quantity', label: 'Qty', kind: 'num' },
  { key: 'unit', label: 'Unit', kind: 'text' },
  { key: 'expectedUnitCost', label: 'Exp. unit cost', kind: 'money' },
  { key: 'neededDayOffset', label: 'Needed day', kind: 'day' },
  { key: 'leadTimeDays', label: 'Lead override', kind: 'num' },
];

export function stagedForProject(db, projectId) {
  return (db.boqStaged || []).filter((s) => s.projectId === projectId);
}
export function stagedCount(db, projectId) {
  return stagedForProject(db, projectId).length;
}

// Committed BoQ rows with any staged changes overlaid, for the working table.
export function boqDisplayRows(db, projectId) {
  const staged = stagedForProject(db, projectId);
  const modifyOf = (id) => staged.find((s) => s.type === 'modify' && s.boqItemId === id);
  const deleteOf = (id) => staged.find((s) => s.type === 'delete' && s.boqItemId === id);
  const committed = boqForProject(db, projectId).map((b) => {
    if (deleteOf(b.id)) return { key: b.id, id: b.id, status: 'deleted', fields: b, base: b, changedKeys: [], ref: { type: 'delete', boqItemId: b.id } };
    const mod = modifyOf(b.id);
    if (mod) return { key: b.id, id: b.id, status: 'modified', fields: { ...b, ...mod.patch }, base: b, changedKeys: Object.keys(mod.patch), ref: { type: 'modify', boqItemId: b.id } };
    return { key: b.id, id: b.id, status: 'unchanged', fields: b, base: b, changedKeys: [], ref: null };
  });
  const added = staged.filter((s) => s.type === 'add').map((s) => ({
    key: s.tempId, id: s.tempId, status: 'added', fields: { ...s.fields, id: s.tempId, projectId }, base: null, changedKeys: [], ref: { tempId: s.tempId }, isStagedAdd: true,
  }));
  return [...committed, ...added];
}

// Field-level old→new diff for one committed change (commit modal + history view).
export function changeFields(change) {
  const map = Object.fromEntries(BOQ_FIELDS.map((f) => [f.key, f]));
  const keys = change.type === 'delete' ? Object.keys(change.before || {}) : Object.keys(change.after || {});
  return keys.filter((k) => map[k]).map((k) => ({
    ...map[k],
    before: change.before ? change.before[k] : null,
    after: change.after ? change.after[k] : null,
  }));
}
