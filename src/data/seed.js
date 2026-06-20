// data/seed.js — the initial dataset written into localStorage on first run.
//
// This is the EMPTY state: a brand-new install starts with nothing in it. The only
// non-empty collection is `prStatuses`, which seeds the customizable PR pipeline — two
// of its statuses ('ordered' / 'received') are LOCKED because the engines key real
// commitment + receipt semantics off them (see engine/status.js). Everything else —
// projects, the catalogue, suppliers, people — is created by the user inside the app.
//
// `currentUser` is null until the first team member is added (the first person added
// becomes the signed-in actor — see addUser in the store), so audit trails have an author.

import { DEFAULT_PR_STATUSES } from '../engine/status.js';

export const seed = {
  meta: { version: 5 },

  currentUser: null,

  // People & org
  users: [],
  mandors: [],

  // Catalogue
  materialTypes: [],
  materials: [],
  brands: [],
  suppliers: [],

  // Projects & their plans
  projectTypes: [],
  projects: [],
  phases: [],
  boqItems: [],

  // Working-phase edits (uncommitted) + committed edit history (append-only)
  boqStaged: [],
  boqEdits: [],

  // Procurement
  prs: [],
  prStatuses: DEFAULT_PR_STATUSES.map((s) => ({ ...s })),

  // Soft-delete bin
  trash: [],
};
