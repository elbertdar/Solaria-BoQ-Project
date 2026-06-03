// engine/schedule.js — day-offset planning model.
// The client thinks in "days after project start" and backtraces order dates by hand:
//   order day = needed day − material lead time
// This module does that automatically. The due (needed) day is the primary input;
// the order day is always derived. Reality (today / late / this week) is computed by
// converting the project start date into a "current day offset".

import { COMMITTED_STATUSES, RECEIVED_STATUSES } from '../theme.js';
import { prsForBoqItem, materialName } from './reconcile.js';

// ---- date helpers (local-midnight, TZ-safe) ----
export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return atMidnight(s);
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function atMidnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function todayLocal() { return atMidnight(new Date()); }
function diffDays(a, b) { return Math.round((atMidnight(a) - atMidnight(b)) / 86400000); }
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
const weekOf = (offset) => Math.floor(offset / 7);

// ---- lookups ----
export function leadTimeFor(db, materialId) {
  const m = db.materials.find((x) => x.id === materialId);
  return m && m.leadTimeDays != null ? m.leadTimeDays : null;
}
export function projectStart(db, projectId) {
  const p = db.projects.find((x) => x.id === projectId);
  return p && p.startDate ? parseDate(p.startDate) : null;
}
export function currentDayOffset(db, projectId, today = todayLocal()) {
  const start = projectStart(db, projectId);
  return start ? diffDays(today, start) : null;
}

const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);

// ---- core ----
export function scheduleForProject(db, projectId, today = todayLocal()) {
  const start = projectStart(db, projectId);
  const curOff = start ? diffDays(today, start) : 0;
  const curWeek = weekOf(curOff);
  const weekStartOff = curWeek * 7;
  const weekEndOff = weekStartOff + 6;
  const inWeek = (o) => o != null && o >= weekStartOff && o <= weekEndOff;

  const items = db.boqItems.filter((b) => b.projectId === projectId);

  const lines = items.map((b) => {
    const prs = prsForBoqItem(db, b.id);
    const committedQty = sum(prs.filter((p) => COMMITTED_STATUSES.includes(p.status)), (p) => p.quantity);
    const receivedQty = sum(prs.filter((p) => RECEIVED_STATUSES.includes(p.status)), (p) => p.quantity);
    const budget = b.quantity || 0;
    const fullyReceived = budget > 0 && receivedQty >= budget;
    const state = fullyReceived ? 'received' : committedQty > 0 ? 'awaiting' : 'to-order';

    const leadRaw = leadTimeFor(db, b.materialId);
    const lead = leadRaw == null ? 0 : leadRaw;
    const hasLead = leadRaw != null;
    const neededOffset = b.neededDayOffset != null ? b.neededDayOffset : null;
    const orderOffset = neededOffset != null ? neededOffset - lead : null;

    const neededDate = start && neededOffset != null ? addDays(start, neededOffset) : null;
    const orderDate = start && orderOffset != null ? addDays(start, orderOffset) : null;

    const orderDates = prs.map((p) => parseDate(p.orderDate)).filter(Boolean).sort((a, c) => a - c);
    const receiptDates = prs.filter((p) => RECEIVED_STATUSES.includes(p.status))
      .map((p) => parseDate(p.receiptDate)).filter(Boolean).sort((a, c) => a - c);
    const actualOrderDate = orderDates[0] || null;
    const actualReceiptDate = receiptDates[receiptDates.length - 1] || null;

    const orderOverdue = state === 'to-order' && orderOffset != null && orderOffset < curOff;
    const deliveryOverdue = state !== 'received' && neededOffset != null && neededOffset < curOff;
    const dueThisWeek = state !== 'received' && inWeek(neededOffset);
    const orderThisWeek = state === 'to-order' && orderOffset != null && (inWeek(orderOffset) || orderOffset < weekStartOff);
    const arrivingThisWeek = state === 'awaiting' && inWeek(neededOffset);
    const overBudget = committedQty > budget;
    const orderBeforeStart = state !== 'received' && orderOffset != null && orderOffset < 0;

    let nextMilestoneOffset = null, nextKind = null;
    if (state === 'to-order') { nextMilestoneOffset = orderOffset; nextKind = 'order'; }
    else if (state === 'awaiting') { nextMilestoneOffset = neededOffset; nextKind = 'deliver'; }

    let urgency = 5, tone = 'neutral';
    if (deliveryOverdue) { urgency = 0; tone = 'risk'; }
    else if (orderOverdue) { urgency = 1; tone = 'risk'; }
    else if (orderBeforeStart && state === 'to-order') { urgency = 1; tone = 'risk'; }
    else if (dueThisWeek && state === 'to-order') { urgency = 2; tone = 'amber'; }
    else if (orderThisWeek) { urgency = 2; tone = 'amber'; }
    else if (dueThisWeek || arrivingThisWeek) { urgency = 3; tone = 'amber'; }
    else if (state === 'awaiting') { urgency = 4; tone = 'info'; }
    else if (state === 'received') { urgency = 6; tone = 'ok'; }

    return {
      boqItem: b, materialName: materialName(db, b.materialId), unit: b.unit, mandorId: b.mandorId,
      budget, committedQty, receivedQty, overBudget, lead, hasLead,
      state, neededOffset, orderOffset, neededDate, orderDate, actualOrderDate, actualReceiptDate,
      orderOverdue, deliveryOverdue, dueThisWeek, orderThisWeek, arrivingThisWeek, orderBeforeStart,
      nextMilestoneOffset, nextKind, urgency, tone,
      orderWeek: orderOffset != null ? weekOf(orderOffset) : null,
      neededWeek: neededOffset != null ? weekOf(neededOffset) : null,
    };
  });

  lines.sort((a, b) =>
    a.urgency - b.urgency ||
    ((a.nextMilestoneOffset ?? Infinity) - (b.nextMilestoneOffset ?? Infinity)));

  // axis: offset-week window around the current week
  const before = 1, after = 6;
  const baseWeek = curWeek - before;
  const count = before + after + 1;
  const columns = [];
  for (let i = 0; i < count; i++) {
    const wk = baseWeek + i;
    columns.push({
      index: i, week: wk, isThisWeek: wk === curWeek, startOffset: wk * 7,
      label: wk >= 0 ? `Wk ${wk + 1}` : 'Pre',
      date: start ? addDays(start, wk * 7) : null,
    });
  }
  const axis = { baseWeek, count, columns, curWeek, curOff, weekStartOff, weekEndOff, start };
  return { axis, lines, today, start, curOff };
}

export function scheduleCounts(lines) {
  return {
    toOrder: lines.filter((l) => l.orderThisWeek).length,
    needed: lines.filter((l) => l.dueThisWeek).length,
    arriving: lines.filter((l) => l.arrivingThisWeek).length,
    overdueOrder: lines.filter((l) => l.orderOverdue).length,
    overdueDeliver: lines.filter((l) => l.deliveryOverdue).length,
  };
}

export function matchesFilter(line, filter) {
  if (!filter) return true;
  if (filter === 'order') return line.orderThisWeek;
  if (filter === 'needed') return line.dueThisWeek;
  if (filter === 'arriving') return line.arrivingThisWeek;
  return true;
}

// Vertical agenda grouping, on the day-offset basis.
export function agendaBuckets(lines, axis) {
  const { weekStartOff } = axis;
  const nextWeekStart = weekStartOff + 7;
  const followingStart = weekStartOff + 14;
  const buckets = { overdue: [], thisWeek: [], nextWeek: [], later: [], done: [] };
  for (const l of lines) {
    if (l.state === 'received') { buckets.done.push(l); continue; }
    if (l.orderOverdue || l.deliveryOverdue) { buckets.overdue.push(l); continue; }
    const m = l.nextMilestoneOffset;
    if (m == null) { buckets.later.push(l); continue; }
    if (m < nextWeekStart) buckets.thisWeek.push(l);
    else if (m < followingStart) buckets.nextWeek.push(l);
    else buckets.later.push(l);
  }
  return buckets;
}