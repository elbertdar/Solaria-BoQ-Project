// engine/schedule.js — day-offset planning, business-day backtrace, portfolio worklist.
//
// Model: project has startDate; material has leadTimeDays (default); a BoQ line has a
// neededDayOffset (calendar days after start) and may override lead time per line.
//   needed date  = start + neededDayOffset (calendar)
//   order date   = needed date − lead, counted in BUSINESS days (Mon–Fri)   ← the backtrace
// Reality (today / late / this week) compares those dates to today.
//
// Each line resolves to one state and lands in exactly one action bucket on the dashboard:
//   to-order + order date in this Mon–Fri              → "Order this week" (routine)
//   to-order + order date already passed               → "Overdue — order now"
//   ordered  + expected arrival passed (not received)  → "Chase supplier" (late delivery)
//   to-order + order date in next Mon–Fri              → "Heads-up: next week"
// Snoozed late deliveries are hidden until their snooze expires.

import { COMMITTED_STATUSES, RECEIVED_STATUSES } from '../theme.js';
import { prsForBoqItem, materialName } from './reconcile.js';

// ---- date helpers ----
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
export function toISO(d) { return d ? atMidnight(d).toISOString().slice(0, 10) : null; }
function isWeekend(d) { const x = d.getDay(); return x === 0 || x === 6; }

// add/subtract working days (skip Sat/Sun). n may be negative.
export function addBusinessDays(date, n) {
  const d = new Date(date);
  const step = n >= 0 ? 1 : -1;
  let rem = Math.abs(n);
  while (rem > 0) { d.setDate(d.getDate() + step); if (!isWeekend(d)) rem--; }
  return d;
}

// Mon–Fri bounds for this week and next week, relative to `today`.
function weekBounds(today) {
  const mon0 = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monThis = addDays(today, -mon0);
  return { monThis, friThis: addDays(monThis, 4), monNext: addDays(monThis, 7), friNext: addDays(monThis, 11) };
}

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

// ---- the heart: one self-contained line per BoQ item ----
export function computeLine(db, b, today = todayLocal()) {
  const prs = prsForBoqItem(db, b.id);
  const committedQty = sum(prs.filter((p) => COMMITTED_STATUSES.includes(p.status)), (p) => p.quantity);
  const receivedQty = sum(prs.filter((p) => RECEIVED_STATUSES.includes(p.status)), (p) => p.quantity);
  const budget = b.quantity || 0;
  const fullyReceived = budget > 0 && receivedQty >= budget;
  const state = fullyReceived ? 'received' : committedQty > 0 ? 'awaiting' : 'to-order';

  const start = projectStart(db, b.projectId);
  const matLead = leadTimeFor(db, b.materialId);
  const leadOverride = b.leadTimeDays != null ? b.leadTimeDays : null;
  const lead = leadOverride != null ? leadOverride : (matLead != null ? matLead : 0);
  const hasLead = leadOverride != null || matLead != null;
  const leadSource = leadOverride != null ? 'line' : (matLead != null ? 'material' : 'none');

  const neededOffset = b.neededDayOffset != null ? b.neededDayOffset : null;
  const neededDate = start && neededOffset != null ? addDays(start, neededOffset) : null;
  const orderDate = neededDate ? addBusinessDays(neededDate, -lead) : null;
  const orderOffset = start && orderDate ? diffDays(orderDate, start) : null;

  const orderDates = prs.map((p) => parseDate(p.orderDate)).filter(Boolean).sort((a, c) => a - c);
  const receiptDates = prs.filter((p) => RECEIVED_STATUSES.includes(p.status))
    .map((p) => parseDate(p.receiptDate)).filter(Boolean).sort((a, c) => a - c);
  const actualOrderDate = orderDates[0] || null;
  const actualReceiptDate = receiptDates[receiptDates.length - 1] || null;

  const promisedDate = parseDate(b.promisedDate);
  const snoozedUntil = parseDate(b.snoozedUntil);
  const snoozedActive = !!(snoozedUntil && snoozedUntil > today);
  const effectiveArrival = promisedDate || neededDate;

  const { monThis, friThis, monNext, friNext } = weekBounds(today);
  const inRange = (d, a, z) => d && d >= a && d <= z;

  const orderOverdue = state === 'to-order' && !!orderDate && orderDate < today;
  const deliveryOverdue = state === 'awaiting' && !!effectiveArrival && effectiveArrival < today && !snoozedActive;
  const orderBeforeStart = state !== 'received' && !!orderDate && !!start && orderDate < start;
  const orderThisWeek = state === 'to-order' && inRange(orderDate, monThis, friThis) && !(orderDate < today);
  const orderNextWeek = state === 'to-order' && inRange(orderDate, monNext, friNext);
  const dueThisWeek = state !== 'received' && inRange(neededDate, monThis, friThis);
  const overBudget = committedQty > budget;
  const lateDays = (state === 'awaiting' && effectiveArrival && effectiveArrival < today) ? diffDays(today, effectiveArrival) : 0;

  let nextMilestoneDate = null, nextKind = null;
  if (state === 'to-order') { nextMilestoneDate = orderDate; nextKind = 'order'; }
  else if (state === 'awaiting') { nextMilestoneDate = effectiveArrival; nextKind = 'deliver'; }

  let urgency = 5, tone = 'neutral';
  if (state === 'received') { urgency = 6; tone = 'done'; }
  else if (orderOverdue) { urgency = 0; tone = 'overdue'; }        // late order → red
  else if (deliveryOverdue) { urgency = 1; tone = 'late'; }        // late delivery → orange
  else if (orderBeforeStart && state === 'to-order') { urgency = 1; tone = 'overdue'; }
  else if (state === 'awaiting') { urgency = 4; tone = 'awaiting'; } // ordered & waiting → blue
  else if (orderThisWeek || dueThisWeek) { urgency = 2; tone = 'orderNow'; } // routine → yellow
  else { urgency = 5; tone = 'neutral'; }

  return {
    boqItem: b, projectId: b.projectId, materialName: materialName(db, b.materialId), unit: b.unit, mandorId: b.mandorId,
    budget, committedQty, receivedQty, overBudget, lead, hasLead, leadSource,
    state, neededOffset, orderOffset, neededDate, orderDate, promisedDate, snoozedUntil, snoozedActive, effectiveArrival, lateDays,
    actualOrderDate, actualReceiptDate,
    orderOverdue, deliveryOverdue, orderBeforeStart, orderThisWeek, orderNextWeek, dueThisWeek,
    nextMilestoneDate, nextKind, urgency, tone,
  };
}

// ---- per-project schedule (timeline + agenda) ----
export function scheduleForProject(db, projectId, today = todayLocal()) {
  const items = db.boqItems.filter((b) => b.projectId === projectId);
  const lines = items.map((b) => computeLine(db, b, today));
  lines.sort((a, b) => a.urgency - b.urgency ||
    ((a.nextMilestoneDate?.getTime() ?? Infinity) - (b.nextMilestoneDate?.getTime() ?? Infinity)));

  const start = projectStart(db, projectId);
  const curOff = start ? diffDays(today, start) : null;

  // day-granular axis: 42 days, starting one week before today
  const span = 42;
  const baseDay = addDays(today, -7);
  const columns = [];
  for (let i = 0; i < span; i++) {
    const d = addDays(baseDay, i);
    columns.push({ index: i, date: d, isWeekend: isWeekend(d), isToday: diffDays(d, today) === 0, isMonday: d.getDay() === 1 });
  }
  return { lines, start, curOff, today, dayAxis: { baseDay, span, columns } };
}

export function dayColOf(date, baseDay, span) {
  if (!date) return null;
  return Math.max(0, Math.min(span - 1, Math.round((atMidnight(date) - atMidnight(baseDay)) / 86400000)));
}

// ---- portfolio worklist (the dashboard) ----
export function portfolioWorklist(db, today = todayLocal()) {
  const proj = (id) => db.projects.find((p) => p.id === id);
  const lines = db.boqItems
    .map((b) => ({ ...computeLine(db, b, today), project: proj(b.projectId) }))
    .filter((l) => l.project && l.project.boqStatus === 'working'); // draft BoQs aren't in procurement yet

  const byOrder = (a, b) => (a.orderDate?.getTime() ?? Infinity) - (b.orderDate?.getTime() ?? Infinity);
  const byArrival = (a, b) => (a.effectiveArrival?.getTime() ?? Infinity) - (b.effectiveArrival?.getTime() ?? Infinity);

  const overdueToOrder = lines.filter((l) => l.orderOverdue).sort(byOrder);
  const orderThisWeek = lines.filter((l) => l.orderThisWeek).sort(byOrder);
  const lateDelivery = lines.filter((l) => l.deliveryOverdue).sort(byArrival);
  const orderNextWeek = lines.filter((l) => l.orderNextWeek).sort(byOrder);

  return {
    overdueToOrder, orderThisWeek, lateDelivery, orderNextWeek,
    counts: {
      overdueToOrder: overdueToOrder.length, orderThisWeek: orderThisWeek.length,
      lateDelivery: lateDelivery.length, orderNextWeek: orderNextWeek.length,
    },
    health: {
      activeProjects: db.projects.filter((p) => p.boqStatus === 'working').length,
      overBudget: lines.filter((l) => l.overBudget).length,
      openPos: db.prs.filter((p) => p.status === 'ordered').length,
      snoozed: lines.filter((l) => l.snoozedActive && l.state === 'awaiting').length,
    },
  };
}

// ---- per-project chips + agenda (Schedule tab) ----
export function scheduleCounts(lines) {
  return {
    toOrder: lines.filter((l) => l.orderThisWeek).length,
    needed: lines.filter((l) => l.dueThisWeek).length,
    arriving: lines.filter((l) => l.state === 'awaiting' && l.dueThisWeek).length,
    overdueOrder: lines.filter((l) => l.orderOverdue).length,
    overdueDeliver: lines.filter((l) => l.deliveryOverdue).length,
  };
}
export function matchesFilter(line, filter) {
  if (!filter) return true;
  if (filter === 'order') return line.orderThisWeek;
  if (filter === 'needed') return line.dueThisWeek;
  if (filter === 'arriving') return line.state === 'awaiting' && line.dueThisWeek;
  return true;
}
export function agendaBuckets(lines, today = todayLocal()) {
  const mon0 = (today.getDay() + 6) % 7;
  const monThis = addDays(today, -mon0);
  const friThis = addDays(monThis, 4);
  const followingMon = addDays(monThis, 14);
  // orderNow = routine to-order due this week; overdue = late ORDER; late = late DELIVERY.
  const buckets = { orderNow: [], overdue: [], late: [], thisWeek: [], nextWeek: [], later: [], done: [] };
  for (const l of lines) {
    if (l.state === 'received') { buckets.done.push(l); continue; }
    if (l.orderOverdue) { buckets.overdue.push(l); continue; }       // late order
    if (l.deliveryOverdue) { buckets.late.push(l); continue; }       // late delivery
    if (l.orderThisWeek) { buckets.orderNow.push(l); continue; }     // routine
    const m = l.nextMilestoneDate;
    if (!m) { buckets.later.push(l); continue; }
    if (m <= friThis) buckets.thisWeek.push(l);
    else if (m < followingMon) buckets.nextWeek.push(l);
    else buckets.later.push(l);
  }
  return buckets;
}
