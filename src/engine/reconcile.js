// engine/reconcile.js — the reason the system exists.
// "Selalu check Balance BoQ vs Purchase!!"  (requirements §1, BR-6/BR-7)
//
// All pure functions over the db object. Recomputed on every render from
// source records, so the balance is always live — never stored, never stale.

import { isCommitted, isReceived, isVoid, statusDef } from './status.js';

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

// Phase scope: phaseId null / '__all' = whole project; a specific id narrows to that phase.
const allPhases = (phaseId) => !phaseId || phaseId === '__all';
export function boqForProject(db, projectId, phaseId = null) {
  return db.boqItems.filter((b) => b.projectId === projectId && (allPhases(phaseId) || b.phaseId === phaseId));
}
export function prsForProject(db, projectId, phaseId = null) {
  const ids = new Set(boqForProject(db, projectId, phaseId).map((b) => b.id));
  if (allPhases(phaseId)) {
    return db.prs.filter((p) => p.projectId === projectId || (p.boqItemId && ids.has(p.boqItemId)));
  }
  // a PR belongs to a phase via its BoQ line; extras (no line) via their own phaseId
  return db.prs.filter((p) => (p.boqItemId ? ids.has(p.boqItemId) : (p.projectId === projectId && p.phaseId === phaseId)));
}
// A PR is "extra" (not in the BoQ plan) when it has no BoQ line — either created standalone
// or its line was deleted and the PR kept.
export function isExtraPr(db, pr) {
  return !pr.boqItemId || !db.boqItems.some((b) => b.id === pr.boqItemId);
}
export function prsForBoqItem(db, boqItemId) {
  return db.prs.filter((p) => p.boqItemId === boqItemId && !isVoid(db, p.status));
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
export function summarizeProject(db, projectId, phaseId = null) {
  const boq = boqForProject(db, projectId, phaseId);
  const all = prsForProject(db, projectId, phaseId);
  const extra = all.filter((p) => isExtraPr(db, p));
  const boqMaterials = new Set(boq.map((b) => b.materialId));

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
      // hasExtra: an extra (unbudgeted) PR was folded into this budgeted material's row.
      hasExtra: pItems.some((p) => isExtraPr(db, p)),
      boqItems: bItems, prs: pItems,
    };
  };

  // Plan rows: one per BoQ material, counting ALL its PRs — including extra (unlinked) PRs for a
  // material that IS budgeted, so the unplanned spend reconciles against that material's budget.
  // Such rows carry hasExtra and still show the "Extra" indicator.
  const planRows = [...boqMaterials].map((mid) => {
    const bItems = boq.filter((b) => b.materialId === mid);
    const kind = bItems.some((b) => b.budgetBasis === 'allowance') ? 'allowance' : 'quantity';
    return mkRow(mid, kind, bItems, all.filter((p) => p.materialId === mid));
  });
  // Extra rows: only materials with NO BoQ line at all (nothing budgeted to fold into).
  const orphanExtra = extra.filter((p) => !boqMaterials.has(p.materialId));
  const extraRows = [...new Set(orphanExtra.map((p) => p.materialId))].map((mid) =>
    mkRow(mid, 'extra', [], orphanExtra.filter((p) => p.materialId === mid)));

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

// ---- Project completion: archive snapshot + downloadable report columns ----

// A frozen record captured when a project is marked complete. Totals for the archive table,
// plus a per-material breakdown that later powers cross-project analytics (e.g. "we always
// over-order gypsum" = committedQty consistently above budgetQty across completed projects).
export function completionSnapshot(db, projectId) {
  const rows = summarizeProject(db, projectId);
  const t = projectTotals(db, projectId);
  return {
    budgetCost: t.budgetCost,
    committedCost: t.committedCost,
    actualCost: t.actualCost,
    materialsOver: t.materialsOver,
    lineCount: boqForProject(db, projectId).length,
    prCount: t.totalPrs,
    materials: rows.map((r) => ({
      materialId: r.materialId, name: r.materialName, unit: r.unit, kind: r.kind,
      budgetQty: r.budgetQty, committedQty: r.committedQty, receivedQty: r.receivedQty,
      overBy: r.extra ? 0 : r.committedQty - r.budgetQty, // + = over-ordered, − = under
      budgetCost: r.budgetCost, actualCost: r.actualCost,
    })),
  };
}

const nOrBlank = (v) => (v == null || v === '' ? '' : String(v));

// CSV columns for a project's Purchase Requests (report/download — export-only).
export function prExportColumns(db) {
  const sup = (id) => db.suppliers.find((s) => s.id === id)?.name || '';
  const pic = (id) => db.users.find((u) => u.id === id)?.name || '';
  return [
    { header: 'Material', value: (p) => materialName(db, p.materialId) },
    { header: 'Extra', value: (p) => (isExtraPr(db, p) ? 'yes' : '') },
    { header: 'Status', value: (p) => statusDef(db, p.status).label },
    { header: 'Qty', value: (p) => nOrBlank(p.quantity) },
    { header: 'Unit', value: (p) => p.unit },
    { header: 'Unit cost', value: (p) => nOrBlank(p.unitCost) },
    { header: 'Line total', value: (p) => nOrBlank((p.quantity || 0) * (p.unitCost || 0)) },
    { header: 'Brand', value: (p) => (p.brandId ? brandName(db, p.brandId) : '') },
    { header: 'Supplier 1', value: (p) => sup(p.supplierPrimaryId) },
    { header: 'Supplier 2', value: (p) => sup(p.supplierSecondaryId) },
    { header: 'PIC', value: (p) => pic(p.picId) },
    { header: 'Order date', value: (p) => p.orderDate || '' },
    { header: 'Receipt date', value: (p) => p.receiptDate || '' },
    { header: 'Comment', value: (p) => p.comment || '' },
  ];
}

// CSV columns for the Balance sheet (summarizeProject rows — export-only).
export function balanceExportColumns() {
  return [
    { header: 'Material', value: (r) => r.materialName },
    { header: 'Kind', value: (r) => (r.extra ? 'extra' : r.allowance ? 'allowance' : 'plan') },
    { header: 'Unit', value: (r) => r.unit },
    { header: 'Budget qty', value: (r) => nOrBlank(r.budgetQty) },
    { header: 'Committed qty', value: (r) => nOrBlank(r.committedQty) },
    { header: 'Received qty', value: (r) => nOrBlank(r.receivedQty) },
    { header: 'Balance qty', value: (r) => nOrBlank(r.receivedQty - r.budgetQty) },
    { header: 'Budget cost', value: (r) => nOrBlank(r.budgetCost) },
    { header: 'Actual cost', value: (r) => nOrBlank(r.actualCost) },
    { header: 'Cost balance', value: (r) => nOrBlank(r.budgetCost - r.actualCost) },
  ];
}

// Rolled-up project totals for the overview KPIs.
export function projectTotals(db, projectId, phaseId = null) {
  const rows = summarizeProject(db, projectId, phaseId);
  const prs = prsForProject(db, projectId, phaseId);
  return {
    budgetCost: sum(rows, (r) => r.budgetCost),
    committedCost: sum(prs.filter((p) => isCommitted(db, p.status)),
      (p) => p.quantity * (p.unitCost || 0)),
    // Committed spend on EXTRA purchases — PRs not tied to a BoQ line (unbudgeted).
    extraCost: sum(prs.filter((p) => isExtraPr(db, p) && isCommitted(db, p.status)),
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

export function stagedForProject(db, projectId, phaseId = null) {
  return (db.boqStaged || []).filter((s) => (!phaseId || phaseId === '__all') ? s.projectId === projectId : s.phaseId === phaseId);
}

// Committed BoQ rows with any staged changes overlaid, for the working table.
export function boqDisplayRows(db, projectId, phaseId = null) {
  const staged = stagedForProject(db, projectId, phaseId);
  const modifyOf = (id) => staged.find((s) => s.type === 'modify' && s.boqItemId === id);
  const deleteOf = (id) => staged.find((s) => s.type === 'delete' && s.boqItemId === id);
  const committed = boqForProject(db, projectId, phaseId).map((b) => {
    if (deleteOf(b.id)) return { key: b.id, id: b.id, status: 'deleted', fields: b, base: b, changedKeys: [], ref: { type: 'delete', boqItemId: b.id } };
    const mod = modifyOf(b.id);
    if (mod) return { key: b.id, id: b.id, status: 'modified', fields: { ...b, ...mod.patch }, base: b, changedKeys: Object.keys(mod.patch), ref: { type: 'modify', boqItemId: b.id } };
    return { key: b.id, id: b.id, status: 'unchanged', fields: b, base: b, changedKeys: [], ref: null };
  });
  const added = staged.filter((s) => s.type === 'add').map((s) => ({
    key: s.tempId, id: s.tempId, status: 'added', fields: { ...s.fields, id: s.tempId, projectId, phaseId: s.phaseId }, base: null, changedKeys: [], ref: { tempId: s.tempId }, isStagedAdd: true,
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
