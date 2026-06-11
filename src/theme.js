// theme.js — semantic tokens for JS-side styling decisions.
// Discipline carried over from SiteWize: one source of truth, color = meaning.
// Values are the light enterprise palette from requirements §9.

export const COLORS = {
  ink: '#0F172A',
  inkSoft: '#64748B',
  inkFaint: '#94A3B8',
  risk: '#E11D48',
  ok: '#16A34A',
  info: '#0891B2',
  pending: '#F59E0B',
};

// PR statuses moved to engine/status.js (customizable, stored in db.prStatuses).

// Schedule/agenda status → bar & dot colour (shared by Schedule + Dashboard timelines).
// Single source so the two surfaces can't drift apart (they were identical literals).
export const TONE = { overdue: '#E11D48', late: '#8B5CF6', orderNow: '#EAB308', awaiting: '#0EA5E9', done: '#16A34A', neutral: '#94A3B8' };
