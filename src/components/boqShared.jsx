import { idr } from '../engine/format.js';
import { materialName } from '../engine/reconcile.js';

// Days from project start to a date (whole days). Shared by BoQ rows + the item modal.
export const dnum = (start, date) => (start && date ? Math.round((date - start) / 86400000) : null);

// Render a BoQ field value by kind (shared by the commit modal + history view).
export function fmtVal(db, kind, v) {
  if (v == null || v === '') return <span className="muted">—</span>;
  if (kind === 'material') return materialName(db, v);
  if (kind === 'mandor') return db.mandors.find((m) => m.id === v)?.name || 'Unassigned';
  if (kind === 'money') return idr(v);
  if (kind === 'day') return `Day ${v}`;
  return String(v);
}