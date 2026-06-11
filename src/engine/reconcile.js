// engine/reconcile.js — the reason the system exists.
// "Selalu check Balance BoQ vs Purchase!!"  (requirements §1, BR-6/BR-7)
//
// All pure functions over the db object. Recomputed on every render from
// source records, so the balance is always live — never stored, never stale.

import { isCommitted, isReceived, isVoid } from './status.js';

const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);

export function materialName(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId);
  return m ? m.canonicalName : '(unknown)';
}
export function materialUnit(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId);
  return m ? m.defaultUnit : '';
}

export function brandsForMaterial(db, materialId) {
  return (db.brands || []).filter((b) => b.materialId === materialId);
}
export function brandName(db, brandId) {
  if (!brandId) return '';
  const b = (db.brands || []).find((x) => x.id === brandId);
  return b ? b.name : '(unknown brand)';
}
// Group a row's PRs by brand → [{ brandId, name, qty, cost }], for the Balance breakdown.
export function brandBreakdown(db, prs) {
  const by = new Map();
  for (const p of prs) {
    const key = p.brandId || '__none';
    if (!by.has(key)) by.set(key, { brandId: p.brandId || null, name: p.brandId ? brandName(db, p.brandId) : 'Unspecified', qty: 0, cost: 0 });
    const e = by.get(key);
    e.qty += p.quantity || 0;
    e.cost += (p.quantity || 0) * (p.unitCost || 0);
  }
  return [...by.values()].sort((a, b) => b.qty - a.qty);
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
  return db.prs.filter((p) => p.boqItemId === boqItemId && !isVoid(db, p.status));
}
export function boqItemHasPr(db, boqItemId) {
  return db.prs.some((p) => p.boqItemId === boqItemId && !isVoid(db, p.status));
}
// Quantity still left to order on a BoQ line = budget − already-committed (ordered + received).
// Used to pre-fill a new PR's quantity. Never negative.
export function remainingQty(db, boqItemId) {
  const b = db.boqItems.find((x) => x.id === boqItemId);
  if (!b) return 0;
  const committed = prsForBoqItem(db, boqItemId)
    .filter((p) => isCommitted(db, p.status))
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
  if (b?.budgetBasis === 'allowance') {
    return prs.some((p) => isCommitted(db, p.status)) ? 'ordered' : 'none';
  }
  const budget = b?.quantity || 0;
  const received = prs
    .filter((p) => isReceived(db, p.status))
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

  const qtyOf = (prs) => sum(prs, (p) => p.quantity);
  const costOf = (prs) => sum(prs, (p) => p.quantity * (p.unitCost || 0));

  // One row builder for all three kinds:
  //   'quantity'  — committed qty vs budgeted qty (the default)
  //   'allowance' — committed spend vs a lump-sum budget (qty is meaningless)
  //   'extra'     — unbudgeted purchase (no BoQ line); 0 minus what was spent
  const mkRow = (mid, kind, bItems, pItems) => {
    const allowance = kind === 'allowance';
    const isExtra = kind === 'extra';
    const committed = pItems.filter((p) => isCommitted(db, p.status));
    const received = pItems.filter((p) => isReceived(db, p.status));

    const budgetQty = (allowance || isExtra) ? 0 : sum(bItems, (b) => b.quantity);
    const committedQty = qtyOf(committed);
    const receivedQty = qtyOf(received);
    const budgetCost = isExtra ? 0
      : allowance ? sum(bItems, (b) => b.allowanceAmount || 0)
      : sum(bItems, (b) => b.quantity * (b.expectedUnitCost || 0));
    // Actual cost is recognized at commit time (committed = ordered + received), not at receipt.
    const actualCost = costOf(committed);

    return {
      key: isExtra ? mid + '::extra' : mid,
      kind, extra: isExtra, allowance,
      materialId: mid, materialName: materialName(db, mid),
      unit: bItems[0]?.unit || pItems[0]?.unit || materialUnit(db, mid),
      budgetQty, committedQty, receivedQty,
      balanceQty: receivedQty - budgetQty,
      committedBalanceQty: committedQty - budgetQty,
      budgetCost, actualCost, costDelta: actualCost - budgetCost,
      // Over-budget basis: quantity rows on committed qty, allowance rows on committed spend,
      // extra rows never (they carry their own indicator).
      isOverCommitted: allowance ? actualCost > budgetCost : (!isExtra && committedQty > budgetQty),
      isOver: allowance ? actualCost > budgetCost : (!isExtra && receivedQty > budgetQty),
      boqItems: bItems, prs: pItems,
    };
  };

  // Plan rows: one per BoQ material (counting only LINKED PRs). A material whose lines include an
  // allowance line is reconciled by cost, not quantity.
  const planRows = [...new Set(boq.map((b) => b.materialId))].map((mid) => {
    const bItems = boq.filter((b) => b.materialId === mid);
    const kind = bItems.some((b) => b.budgetBasis === 'allowance') ? 'allowance' : 'quantity';
    return mkRow(mid, kind, bItems, linked.filter((p) => p.materialId === mid));
  });
  // Extra rows: materials that appear only via extra (unlinked) PRs.
  const extraRows = [...new Set(extra.map((p) => p.materialId))].map((mid) =>
    mkRow(mid, 'extra', [], extra.filter((p) => p.materialId === mid)));

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
      && isCommitted(db, p.status),
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
    committedCost: sum(prs.filter((p) => isCommitted(db, p.status)),
      (p) => p.quantity * (p.unitCost || 0)),
    actualCost: sum(rows, (r) => r.actualCost),
    materialsOver: rows.filter((r) => r.isOverCommitted).length,
    openPrs: prs.filter((p) => !isReceived(db, p.status) && !isVoid(db, p.status)).length,
    totalPrs: prs.filter((p) => !isVoid(db, p.status)).length,
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
  { key: 'allowanceAmount', label: 'Allowance', kind: 'money' },
  { key: 'budgetBasis', label: 'Budget basis', kind: 'text' },
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
