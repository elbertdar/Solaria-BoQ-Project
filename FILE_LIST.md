# Solaria BoQ — File List

The source of truth for what files exist and where. **Updated every time we change something.**

- **Last updated:** 2 Jun 2026
- **Latest build:** Day-offset planning (lead times + needed-day input, order day auto-derived)
- **Run:** `npm run dev` from the project root · details + assumptions in `README.md`
- **Total app files:** 22 under `src/` + `README.md`

---

## ⚠ Files touched in the latest build (Day-offset planning)

If your local copy is missing any of these, the schedule math will be wrong or the app breaks.
Schema changed, so the storage key is now **v3** (auto-reseeds on first load).

**Changed (6) — no new files:**
- `src/engine/schedule.js` — reworked around day-offsets, lead time, project start
- `src/data/seed.js` — adds project `startDate`, material `leadTimeDays`, BoQ `neededDayOffset`; `meta.version: 3`
- `src/store/StoreContext.jsx` — storage key → `v3`; adds `updateProject`
- `src/pages/BoqPage.jsx` — needed-day input + derived order-day helper; day-offset columns
- `src/pages/CataloguePage.jsx` — lead-time column + add/edit material modal
- `src/pages/SchedulePage.jsx` — project-start control, weeks-after-start axis, lead-time bar

---

## Full tree

### Root
| File | Purpose |
|---|---|
| `README.md` | Run steps, baked-in decisions, wired-vs-deferred |
| `solaria-boq-files.mjs` | One-shot installer (writes the whole `src/` tree). Helper, not part of the app. |

### `src/` — entry & theme
| File | Purpose |
|---|---|
| `src/main.jsx` | React entry point; mounts `App`, imports `index.css` |
| `src/App.jsx` | Router + two-pane shell; route table for all 7 surfaces |
| `src/index.css` | All styles + design tokens (light enterprise palette) |
| `src/theme.js` | Semantic tokens, PR lifecycle (`PR_FLOW`), committed/received status sets |

### `src/data/`
| File | Purpose |
|---|---|
| `src/data/seed.js` | Initial dataset: 1 project, catalogue, suppliers, BoQ, PRs (seeds localStorage) |

### `src/store/`
| File | Purpose |
|---|---|
| `src/store/StoreContext.jsx` | `db` + localStorage (key `solaria_boq_db_v5`) + all CRUD actions: +`addProject`, `addMandor`, `deletePr` (undo), `importData` (the import seam). The future Supabase seam. |

### `src/engine/` — pure logic
| File | Purpose |
|---|---|
| `src/engine/format.js` | IDR + date formatting |
| `src/engine/match.js` | Fuzzy material matching (Dice coefficient) for the catalogue |
| `src/engine/reconcile.js` | Balance core: budget vs committed vs received, over-qty warnings |
| `src/engine/schedule.js` | Schedule core: day-offsets, **business-day** order-day backtrace, per-line lead override, promised/snooze fields, late flags, day-granular axis, agenda, and the **portfolio worklist** (cross-project buckets) |

### `src/components/`
| File | Purpose |
|---|---|
| `src/components/Sidebar.jsx` | Left nav in three sections — **Portfolio** (This Week), **Project** (Overview/Schedule/BoQ/PRs/Balance), **Library** (Suppliers + Material Catalogue, the shared master data); portfolio/Schedule/Balance badges; user profile |
| `src/components/ui.jsx` | `KpiCard`, `AlertBanner`, `StatusPill`, `OverPill`, and the **searchable `ProjectBar`** (Excel-style filter popover: type-to-filter, grouped by health Needs-attention/On-track/Done, "All projects → dashboard", single-select switch) |
| `src/components/Modal.jsx` | Reusable modal shell (overlay, Esc to close) |
| `src/components/PrModal.jsx` | Create/edit Purchase Request; live over-qty warning |
| `src/components/ReceiveModal.jsx` | Receipt-date prompt before marking a PR received (BR-4) |

### `src/pages/` — the surfaces
| File | Route | Purpose |
|---|---|---|
| `src/pages/DashboardPage.jsx` | `/` | **Portfolio "This Week":** cross-project action lists (Overdue — order now / Order this week / Chase supplier / Heads-up next week), one-tap Mark-ordered with undo, late-delivery resolutions (Received / Push date / Snooze), health KPIs, + New project |
| `src/pages/Overview.jsx` | `/overview` | Per-project KPIs, over-qty alert banners, recent activity |
| `src/pages/ReconciliationPage.jsx` | `/reconciliation` | Balance: per-material qty + cost, drill-down |
| `src/pages/SchedulePage.jsx` | `/schedule` | **Day-granular** timeline + agenda; to-order / needed / arriving |
| `src/pages/BoqPage.jsx` | `/boq` | BoQ items, mandor grouping, fuzzy material picker, **per-line lead override**, inline add-mandor |
| `src/pages/PurchaseRequestsPage.jsx` | `/purchase-requests` | PR list, create/edit, status advance |
| `src/pages/SuppliersPage.jsx` | `/suppliers` | Supplier registry, filter, multi-select for quotes |
| `src/pages/CataloguePage.jsx` | `/catalogue` | Canonical materials + aliases + **estimated unit cost** + lead times (admin) |

---

## Changelog
- **3 Jun 2026 — Recommended suppliers in PR.** In the Raise-PR modal, the Supplier 1 / Supplier 2 dropdowns now float a **★ Recommended** group to the top — suppliers whose category tags (`materialTypeIds`) match the linked material's type — with everyone else under "Other suppliers" (flat list if nothing matches). Reacts to the linked BoQ item. UI-only, no storage change. (`components/PrModal.jsx`)
- **3 Jun 2026 — PR pre-fill.** Raising a PR now pre-fills from the linked BoQ line: **quantity** = remaining-to-order (budget − already committed, never negative), **unit cost** = the line's expected cost (which traces to the material's catalogue est cost), and **order date** + **receipt date** default to today. All fields stay fully editable; switching the linked BoQ item in the create picker refills quantity + cost. Edit mode is untouched. New `remainingQty` helper in `reconcile.js`; logic-only, no storage change (still v8).
- **3 Jun 2026 — Material estimated cost.** Added a material-level `estUnitCost` in the Catalogue (new column + form field). It pre-fills a BoQ line's `expectedUnitCost` when that material is chosen (only if the field is still blank). Single source of truth for a material's default cost; per-supplier costs remain out of scope. Seed costs added for all 10 materials; storage → **v8** (reseeds), `meta.version` → 5. ERD: `estUnitCost` on MATERIAL.
- **3 Jun 2026 — Reverted the supplier↔material offerings experiment.** Per client preference, suppliers stay **broad providers of material categories** (`materialTypeIds`); lead time + cost remain on the material / BoQ as before. Removed the `supplierMaterials` join collection, the offering helpers, and the catalogue/suppliers UI for per-material offerings; `leadTimeFor` reads `material.leadTimeDays` again. Storage → **v7** (reseeds back to the category model).
- **3 Jun 2026 — Sidebar Library group.** Split the shared master data (Suppliers, Material Catalogue) out of the project-scoped nav into its own **Library** section, so the sidebar now reads Portfolio / Project / Library. Nav-only — no data or storage change. (`components/Sidebar.jsx`)
- **3 Jun 2026 — Searchable project picker + 12-project demo seed.** Rebuilt `ProjectBar` (in `components/ui.jsx`) from a plain `<select>` into an Excel-filter-style popover: a type-to-filter search, projects **grouped by derived health** (Needs attention / On track / Done) with per-project attention badges and open-item counts, an **"All projects → This Week"** row routing to the dashboard, "Name (CODE)" formatting, and single-select switching (click-outside / Esc to close). Single-select by design — the project-scoped pages act on one project; cross-project aggregation stays on the dashboard. Expanded the seed to **12 projects / 30 BoQ items / 10 PRs** (incl. two fully-received "Done" projects) so the picker's grouping/filtering is demonstrable at the client's real 10–15 scale; storage key bumped **v4 → v5** (reseeds), `meta.version` → 4.
- **3 Jun 2026 — Multi-project dashboard + business-day planning.** New `pages/DashboardPage.jsx` is now the landing screen (`/`): a cross-project "This Week" worklist with three action lists — **Overdue — order now**, **Order this week**, **Chase supplier** — plus a **Heads-up: next week** strip and subordinate health KPIs. One-tap **Mark ordered** (raises a PO) with session **undo**; late deliveries resolve via **Received / Push date / Snooze** (no permanent ignore). Order days now backtrace in **business days** (skip weekends, holidays ignored). Added per-line **lead-time override** and inline **add-mandor** on the BoQ; **New project** modal (name + start date required, code optional). Schedule timeline rebuilt **day-granular** (42-day axis, weekends shaded, today highlighted). New store actions `addProject`, `addMandor`, `deletePr`, and an `importData` seam for future manual/automatic imports. `engine/schedule.js` reworked (`computeLine`, `portfolioWorklist`, `dayColOf`); `Sidebar.jsx` split Portfolio/Project; `App.jsx` routes (Dashboard `/`, Overview `/overview`); storage → **v4** (reseeds). Verified: clean esbuild compile + worklist harness (3 overdue / 2 this-week / 1 late / 1 next-week).
- **2 Jun 2026 — Day-offset planning.** Switched scheduling to "days after project start": materials gained `leadTimeDays`, projects gained `startDate`, BoQ lines now take a single `neededDayOffset` and the order day is auto-derived (`needed − lead`). Reworked `engine/schedule.js`, `seed.js` (→ v3), `StoreContext.jsx` (+`updateProject`), `BoqPage.jsx`, `CataloguePage.jsx`, `SchedulePage.jsx`.
- **2 Jun 2026 — Timeline hardened.** `pages/SchedulePage.jsx` carries its layout as inline styles so the graph renders even if `index.css` is stale/cached.
- **2 Jun 2026 — Schedule tab.** Added `engine/schedule.js`, `pages/SchedulePage.jsx`, `components/ReceiveModal.jsx`; changed `App.jsx`, `Sidebar.jsx`, `index.css`, `seed.js`, `StoreContext.jsx`.
- **2 Jun 2026 — Initial MVP.** Catalogue, BoQ, Suppliers, Purchase Requests, Balance reconciliation, over-qty warnings. 17 source files + README.
