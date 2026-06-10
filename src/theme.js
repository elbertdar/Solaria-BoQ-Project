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

// PR lifecycle → pill class (see index.css .pill.*). Q-6 default lifecycle.
export const PR_STATUS = {
  draft:     { label: 'Draft',     pill: 'gray'  },
  requested: { label: 'Requested', pill: 'info'  },
  quoted:    { label: 'Quoted',    pill: 'info'  },
  ordered:   { label: 'Ordered',   pill: 'amber' },
  received:  { label: 'Received',  pill: 'ok'    },
  cancelled: { label: 'Cancelled', pill: 'gray'  },
};

// Allowed forward transitions (kept liberal for the MVP; tighten once Q-6 is settled).
export const PR_FLOW = ['draft', 'requested', 'quoted', 'ordered', 'received'];

// Quantities counted as "committed" against budget (drives the over-qty warning).
// Receipt is the stricter "realized" set used for the headline balance.
export const COMMITTED_STATUSES = ['ordered', 'received'];
export const RECEIVED_STATUSES = ['received'];

// Schedule/agenda status → bar & dot colour (shared by Schedule + Dashboard timelines).
// Single source so the two surfaces can't drift apart (they were identical literals).
export const TONE = { overdue: '#E11D48', late: '#8B5CF6', orderNow: '#EAB308', awaiting: '#0EA5E9', done: '#16A34A', neutral: '#94A3B8' };
