// engine/status.js — customizable PR statuses (single source of truth).
//
// Statuses are db records (db.prStatuses) instead of a hardcoded enum, so the user
// can add / rename / recolor / reorder / retire them. Two are LOCKED because the
// engines key real semantics off them:
//   · 'ordered'  — entering it commits cost/qty against the budget and stamps orderDate
//   · 'received' — the only status that may carry a receiptDate (BR-4)
//
// Every status has a PHASE, which is what the engines actually read:
//   pre        before ordering — not counted against budget (Draft, Requested, Quoted…)
//   committed  ordered or later, goods not yet in — counts as committed (Ordered + customs like “Shipped”)
//   received   goods in — locked to the single 'received' status
//   void       closed without purchase — never counted (Cancelled…)
//
// "Delete" = RETIRE, never destroy: the definition stays (so status history and any
// trashed PRs keep rendering with the right label/colour forever), it just disappears
// from pickers and the flow. Retired statuses can be restored. Live PRs are reassigned
// at retire time, so there are no dead ends.

const PHASE_RANK = { pre: 0, committed: 1, received: 2, void: 3 };

export const PHASE_LABEL = {
  pre: 'Before ordering',
  committed: 'After ordering — committed',
  received: 'Received',
  void: 'Closed — not counted',
};

// Pill colour palette (keys map to .pill.* classes in index.css).
export const STATUS_PILLS = ['gray', 'info', 'teal', 'amber', 'purple', 'ok', 'risk'];
// Dot colour per pill key — single source for the little status dots (StatusPill,
// ManageStatusesModal swatches). Was duplicated as two identical literals.
export const PILL_DOT = { gray: '#94A3B8', info: '#0891B2', teal: '#0D9488', amber: '#F59E0B', purple: '#8B5CF6', ok: '#16A34A', risk: '#E11D48' };

export const DEFAULT_PR_STATUSES = [
  { id: 'draft',     label: 'Draft',     pill: 'gray',  phase: 'pre' },
  { id: 'requested', label: 'Requested', pill: 'info',  phase: 'pre' },
  { id: 'quoted',    label: 'Quoted',    pill: 'info',  phase: 'pre' },
  { id: 'ordered',   label: 'Ordered',   pill: 'amber', phase: 'committed', locked: true },
  { id: 'received',  label: 'Received',  pill: 'ok',    phase: 'received',  locked: true },
  { id: 'cancelled', label: 'Cancelled', pill: 'gray',  phase: 'void' },
];

// Stable sort by phase rank — keeps user order within a phase, guarantees the
// pipeline always reads pre… → ordered → committed customs → received.
export const sortStatuses = (list) =>
  [...list].sort((a, b) => (PHASE_RANK[a.phase] ?? 0) - (PHASE_RANK[b.phase] ?? 0));

export const allStatuses = (db) =>
  (Array.isArray(db.prStatuses) && db.prStatuses.length ? db.prStatuses : DEFAULT_PR_STATUSES);

export const activeStatuses = (db) => allStatuses(db).filter((s) => !s.retired);

// Lookup that never fails — unknown ids render as a gray pill with the raw id.
export const statusDef = (db, id) =>
  allStatuses(db).find((s) => s.id === id) || { id, label: id || '—', pill: 'gray', phase: 'pre', missing: true };

// Engine semantics — phase-driven, so custom statuses participate correctly.
export const isCommitted = (db, id) => {
  const ph = statusDef(db, id).phase;
  return ph === 'committed' || ph === 'received';
};
export const isReceived = (db, id) => statusDef(db, id).phase === 'received';
export const isVoid = (db, id) => statusDef(db, id).phase === 'void';

// A "major" status change crosses a commitment boundary — advancing INTO Ordered/Received,
// or reversing back OUT of them. These route through review & commit; routine pre-order
// bumps (Draft→Requested→Quoted) stay instant.
export const isMajorTransition = (db, from, to) =>
  from !== to && (isCommitted(db, from) !== isCommitted(db, to) || isReceived(db, from) !== isReceived(db, to));

// The forward pipeline (everything except void/closed), in display order.
const flowStatuses = (db) => activeStatuses(db).filter((s) => s.phase !== 'void');

export const nextStatusId = (db, currentId) => {
  const flow = flowStatuses(db);
  const i = flow.findIndex((s) => s.id === currentId);
  if (i < 0 || i >= flow.length - 1) return null;
  return flow[i + 1].id;
};

export const defaultStatusId = (db) => flowStatuses(db)[0]?.id || 'ordered';

// One "Advance" policy for every PR table: routine pre-order bumps apply instantly; major
// (commitment-crossing) transitions stage for review & commit; entering Received first
// collects a receipt date via the page's modal (onReceive).
export function advancePr(db, p, { setPrStatus, stagePrStatus, onReceive }) {
  const next = nextStatusId(db, p.status);
  if (!next) return;
  if (!isMajorTransition(db, p.status, next)) { setPrStatus(p.id, next); return; }
  if (next === 'received') { onReceive(p); return; }
  stagePrStatus(p.id, next);
}

// Group a list of PRs for the table view. mode: 'status' | 'supplier'. Returns ordered
// [{ key, label, count, rows }] — status groups in pipeline order; supplier groups A→Z with
// "No supplier" last, so each supplier group maps to that store's receipt (nota toko).
export function groupPrs(db, items, mode, prOf = (x) => x) {
  const m = new Map();
  if (mode === 'status') {
    const order = activeStatuses(db).map((s) => s.id);
    for (const it of items) { const k = prOf(it).status; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
    return [...m.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([k, rows]) => ({ key: k, label: statusDef(db, k).label, count: rows.length, rows }));
  }
  for (const it of items) { const k = prOf(it).supplierPrimaryId || '__none'; if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return [...m.entries()]
    .map(([k, rows]) => ({ key: k, label: k === '__none' ? 'No supplier' : (db.suppliers.find((s) => s.id === k)?.name || '—'), count: rows.length, rows }))
    .sort((a, b) => (a.key === '__none' ? 1 : b.key === '__none' ? -1 : a.label.localeCompare(b.label)));
}
