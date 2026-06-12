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

import { isCommitted, isReceived, isVoid } from './status.js';
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
  const committedQty = sum(prs.filter((p) => isCommitted(db, p.status)), (p) => p.quantity);
  const receivedQty = sum(prs.filter((p) => isReceived(db, p.status)), (p) => p.quantity);
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
  const receiptDates = prs.filter((p) => isReceived(db, p.status))
    .map((p) => parseDate(p.receiptDate)).filter(Boolean).sort((a, c) => a - c);
  const actualOrderDate = orderDates[0] || null;
  const actualReceiptDate = receiptDates[receiptDates.length - 1] || null;

  const promisedDate = parseDate(b.promisedDate);
  const snoozedUntil = parseDate(b.snoozedUntil);
  const snoozedActive = !!(snoozedUntil && snoozedUntil > today);

  // Per-PR breakdown — orders arrive in batches, so each PR gets its own expected
  // arrival (its actual order date + lead, business days) and its own state/tone.
  // A batch mirrors the line's late semantics: purple when its delivery is overdue OR
  // when it's forecast to land after the planned (needed) date.
  // Sorted: committed first by order date, then pre-order drafts, then void last.
  const prDetails = prs.map((p) => {
    const committed = isCommitted(db, p.status);
    const received = isReceived(db, p.status);
    const oDate = parseDate(p.orderDate);
    const rDate = parseDate(p.receiptDate);
    const expected = received ? rDate : (committed && oDate ? addBusinessDays(oDate, lead) : null);
    const overdueNow = committed && !received && !!expected && expected < today;
    const batchForecastLate = committed && !received && !!expected && !!neededDate && expected > neededDate;
    const late = overdueNow || batchForecastLate;
    const tone = received ? 'done' : late ? 'late' : committed ? 'awaiting' : 'neutral';
    return { pr: p, qty: p.quantity || 0, status: p.status, committed, received, orderDate: oDate, receiptDate: rDate, expected, overdueNow, forecastLate: batchForecastLate, late, tone };
  }).sort((a, c) => {
    const rank = (x) => (x.committed ? 0 : isVoid(db, x.status) ? 2 : 1);
    const r = rank(a) - rank(c);
    if (r) return r;
    const at = a.orderDate?.getTime() ?? Infinity, ct = c.orderDate?.getTime() ?? Infinity;
    return at - ct || String(a.pr.createdAt).localeCompare(String(c.pr.createdAt));
  });

  // Planned vs actual arrival. The plan is the needed date; but once ordered, the realistic
  // arrival is per-batch: each order lands at ITS order date + lead. The line's projected
  // arrival is the LATEST batch arrival, so the line bar encapsulates every batch.
  // Push-date (promisedDate) is the PM's manual override; receipt finalizes it.
  const plannedArrival = neededDate;
  const batchArrivals = prDetails
    .filter((d) => d.committed)
    .map((d) => (d.received ? d.receiptDate : d.expected))
    .filter(Boolean);
  const projectedArrival = batchArrivals.length
    ? new Date(Math.max(...batchArrivals.map((d) => d.getTime())))
    : (actualOrderDate ? addBusinessDays(actualOrderDate, lead) : null);
  const effectiveArrival = (state === 'received' ? actualReceiptDate : null)
    || promisedDate
    || (state === 'awaiting' ? (projectedArrival || neededDate) : neededDate);
  const slipDays = (effectiveArrival && plannedArrival) ? diffDays(effectiveArrival, plannedArrival) : 0;
  // "Late arrival" = ordered, projected to land AFTER the planned date (known the moment you order),
  // but not yet overdue. Escalates to deliveryOverdue once the expected date passes with no receipt.
  const forecastLate = state === 'awaiting' && !!effectiveArrival && !!plannedArrival && effectiveArrival > plannedArrival;

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
  else if (forecastLate) { urgency = 3; tone = 'late'; }           // ordered late → purple, same as late delivery
  else if (state === 'awaiting') { urgency = 4; tone = 'awaiting'; } // ordered & waiting → blue
  else if (orderThisWeek || dueThisWeek) { urgency = 2; tone = 'orderNow'; } // routine → yellow
  else { urgency = 5; tone = 'neutral'; }

  return {
    boqItem: b, projectId: b.projectId, materialName: materialName(db, b.materialId), unit: b.unit, mandorId: b.mandorId,
    budget, committedQty, receivedQty, overBudget, lead, hasLead, leadSource,
    state, neededOffset, orderOffset, neededDate, orderDate, promisedDate, snoozedUntil, snoozedActive, effectiveArrival, lateDays,
    plannedArrival, projectedArrival, slipDays, forecastLate,
    actualOrderDate, actualReceiptDate,
    orderOverdue, deliveryOverdue, orderBeforeStart, orderThisWeek, orderNextWeek, dueThisWeek,
    nextMilestoneDate, nextKind, urgency, tone,
    prDetails, prCount: prDetails.length,
  };
}

// ---- per-project schedule (timeline + agenda) ----
export function scheduleForProject(db, projectId, today = todayLocal()) {
  const items = db.boqItems.filter((b) => b.projectId === projectId && b.budgetBasis !== 'allowance');
  const lines = items.map((b) => computeLine(db, b, today));
  lines.sort((a, b) => a.urgency - b.urgency ||
    ((a.nextMilestoneDate?.getTime() ?? Infinity) - (b.nextMilestoneDate?.getTime() ?? Infinity)));

  const start = projectStart(db, projectId);
  const curOff = start ? diffDays(today, start) : null;

  // day-granular axis. Default window is one week back + five ahead, but it EXTENDS
  // backwards to cover real history (orders/receipts — so received lines keep their
  // ordered→received tail, capped at 60 days back) and forwards to the latest arrival
  // (total span capped at 110 days). dayColOf still clamps anything beyond the caps.
  let earliest = addDays(today, -7);
  let latest = addDays(today, 34);
  for (const l of lines) {
    const past = [l.actualOrderDate, l.orderDate, ...l.prDetails.map((d) => d.orderDate), ...l.prDetails.map((d) => d.receiptDate)];
    for (const d of past) if (d && d < earliest) earliest = d;
    const future = [l.effectiveArrival, l.neededDate, ...l.prDetails.map((d) => d.expected)];
    for (const d of future) if (d && d > latest) latest = d;
  }
  const histFloor = addDays(today, -60);
  const baseDay = addDays(earliest < histFloor ? histFloor : earliest, -2);
  const span = Math.max(42, Math.min(110, diffDays(latest, baseDay) + 4));
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
    .filter((b) => b.budgetBasis !== 'allowance')   // allowances reorder on cadence, not a single order-by date
    .map((b) => ({ ...computeLine(db, b, today), project: proj(b.projectId) }))
    .filter((l) => l.project && l.project.boqStatus === 'working'); // draft BoQs aren't in procurement yet

  const byOrder = (a, b) => (a.orderDate?.getTime() ?? Infinity) - (b.orderDate?.getTime() ?? Infinity);
  const byArrival = (a, b) => (a.effectiveArrival?.getTime() ?? Infinity) - (b.effectiveArrival?.getTime() ?? Infinity);

  const overdueToOrder = lines.filter((l) => l.orderOverdue).sort(byOrder);
  const orderThisWeek = lines.filter((l) => l.orderThisWeek).sort(byOrder);
  const lateDelivery = lines.filter((l) => l.deliveryOverdue).sort(byArrival);
  const lateArrival = lines.filter((l) => l.forecastLate && !l.deliveryOverdue).sort(byArrival);
  const orderNextWeek = lines.filter((l) => l.orderNextWeek).sort(byOrder);

  return {
    overdueToOrder, orderThisWeek, lateDelivery, lateArrival, orderNextWeek,
    counts: {
      overdueToOrder: overdueToOrder.length, orderThisWeek: orderThisWeek.length,
      lateDelivery: lateDelivery.length, lateArrival: lateArrival.length, orderNextWeek: orderNextWeek.length,
    },
    health: {
      activeProjects: db.projects.filter((p) => p.boqStatus === 'working').length,
      overBudget: lines.filter((l) => l.overBudget).length,
      openPos: db.prs.filter((p) => isCommitted(db, p.status) && !isReceived(db, p.status)).length,
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
    slipping: lines.filter((l) => l.forecastLate && !l.deliveryOverdue).length,
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
  const buckets = { orderNow: [], overdue: [], late: [], lateArrival: [], thisWeek: [], nextWeek: [], later: [], done: [] };
  for (const l of lines) {
    if (l.state === 'received') { buckets.done.push(l); continue; }
    if (l.orderOverdue) { buckets.overdue.push(l); continue; }       // late order
    if (l.deliveryOverdue) { buckets.late.push(l); continue; }       // late delivery (overdue)
    if (l.forecastLate) { buckets.lateArrival.push(l); continue; }   // ordered late → projected late
    if (l.orderThisWeek) { buckets.orderNow.push(l); continue; }     // routine
    const m = l.nextMilestoneDate;
    if (!m) { buckets.later.push(l); continue; }
    if (m <= friThis) buckets.thisWeek.push(l);
    else if (m < followingMon) buckets.nextWeek.push(l);
    else buckets.later.push(l);
  }
  return buckets;
}

// ---- portfolio Gantt: project procurement windows, grouped by region ----
// Each working project becomes a bar from its FIRST planned order date to its LAST
// planned order + lead time (i.e. the final planned delivery). Draft BoQs are excluded.
export function portfolioGantt(db, today = todayLocal()) {
  const projects = [];
  for (const p of db.projects.filter((x) => x.boqStatus === 'working')) {
    const { lines } = scheduleForProject(db, p.id, today);
    const orders = lines.map((l) => l.orderDate).filter(Boolean);
    const arrivals = lines.map((l) => l.neededDate).filter(Boolean);
    if (orders.length === 0 || arrivals.length === 0) continue; // no schedulable window → not shown
    const start = new Date(Math.min(...orders.map((d) => d.getTime())));
    const end = new Date(Math.max(...arrivals.map((d) => d.getTime())));
    projects.push({
      id: p.id, name: p.name, code: p.code || p.name,
      region: p.location || 'Unspecified',
      start, end,
      durationDays: Math.max(1, Math.round((end - start) / 86400000)),
      lineCount: lines.length,
      active: start <= today && today <= end,
    });
  }
  if (projects.length === 0) return { regions: [], min: null, max: null, today };

  const min = new Date(Math.min(...projects.map((p) => p.start.getTime())));
  const max = new Date(Math.max(...projects.map((p) => p.end.getTime())));
  const byRegion = new Map();
  for (const p of projects) {
    if (!byRegion.has(p.region)) byRegion.set(p.region, []);
    byRegion.get(p.region).push(p);
  }
  const regions = [...byRegion.entries()]
    .map(([region, projs]) => ({ region, projects: projs.sort((a, b) => a.start - b.start) }))
    .sort((a, b) => a.region.localeCompare(b.region));
  return { regions, min, max, today, count: projects.length };
}
