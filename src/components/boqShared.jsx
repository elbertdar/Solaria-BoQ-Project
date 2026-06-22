import { idr } from '../engine/format.js';
import { materialName } from '../engine/reconcile.js';

// Days from project start to a date (whole days). Shared by BoQ rows + the item modal.
export const dnum = (start, date) => (start && date ? Math.round((date - start) / 86400000) : null);

// Two BoQ lines are "the same line added twice" when every defining field matches —
// everything except quantity / allowance amount, which get summed when we combine them.
export function boqIdentityKey(b) {
  return JSON.stringify([
    b.materialId ?? '', (b.description ?? '').trim().toLowerCase(), b.unit ?? '',
    b.budgetBasis ?? 'quantity', b.mandorId ?? '', b.expectedUnitCost ?? 0,
    b.neededDayOffset ?? null, b.leadTimeDays ?? null,
  ]);
}

// Group a list into runs of identical lines, preserving first-seen order. Blank rows (no
// material) are never grouped. `fieldsOf` extracts the comparable fields — draft passes the
// item itself; the working table passes a display row's `.fields`.
export function groupIdentical(items, fieldsOf = (x) => x) {
  const groups = [];
  const index = new Map();
  for (const it of items) {
    const f = fieldsOf(it);
    if (!f?.materialId) { groups.push({ key: 'solo:' + groups.length, items: [it] }); continue; }
    const key = boqIdentityKey(f);
    let g = index.get(key);
    if (!g) { g = { key, items: [] }; index.set(key, g); groups.push(g); }
    g.items.push(it);
  }
  return groups;
}

// Render a BoQ field value by kind (shared by the commit modal + history view).
export function fmtVal(db, kind, v) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (kind === 'material') return materialName(db, v);
  if (kind === 'mandor') return db.mandors.find((m) => m.id === v)?.name || 'Unassigned';
  if (kind === 'money') return idr(v);
  if (kind === 'day') return `Day ${v}`;
  return String(v);
}
