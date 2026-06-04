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
| `src/components/Sidebar.jsx` | Left nav in three sections — **Portfolio** (This Week, Projects), **Project** (Overview/Schedule/BoQ/PRs/Balance), **Library** (Suppliers + Material Catalogue, the shared master data); portfolio/Schedule/Balance badges; user profile |
| `src/components/ui.jsx` | `KpiCard`, `AlertBanner`, `StatusPill`, `OverPill`, the searchable `ProjectBar` (now with an `embedded` mode), and the reusable **`FilterBar` / `FilterSearch` / `FilterSelect`** primitives (Excel-style filter popover: type-to-filter, grouped by health Needs-attention/On-track/Done, "All projects → dashboard", single-select switch) |
| `src/components/NewProjectModal.jsx` | Shared "New project" dialog (name + start date required, code optional) used by This Week and the Project Catalogue |
| `src/components/Modal.jsx` | Reusable modal shell (overlay, Esc to close) |
| `src/components/PrModal.jsx` | Create/edit Purchase Request; live over-qty warning |
| `src/components/ReceiveModal.jsx` | Receipt-date prompt before marking a PR received (BR-4) |

### `src/pages/` — the surfaces
| File | Route | Purpose |
|---|---|---|
| `src/pages/ProjectCataloguePage.jsx` | `/projects` | **Project Catalogue hub** — Active (wired: budget/committed/over-budget/timeline/progress/status table) · Completed · Upcoming (placeholders) |
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
- **3 Jun 2026 — Split nav: Library vs People.** Mandors and Team moved out of Library into a new **People** group, so Library is now purely the procurement catalog (Suppliers, Material Catalogue, Material Types) and People holds the human directory (Mandors, Team). Sidebar-only change — no routes, data, or storage change.
- **3 Jun 2026 — Mandors + Team pages (NEW).** Two new Library screens. **Mandors** (`/mandors`): site crew-lead registry (name) with a "BoQ lines assigned" count, add/edit, and a delete that's blocked while the mandor is still on any BoQ line. **Team** (`/users`): staff records (name + role: Estimator / Project Manager / Purchasing PIC) with search + role filter, an "On PRs (as PIC)" count, a "you" badge for the signed-in user, add/edit, and a delete blocked while the user is a PR's PIC or is the signed-in user. Editing a user keeps `currentUser` in sync. Added store actions `updateMandor`, `deleteMandor`, `addUser`, `updateUser`, `deleteUser`; registered routes and sidebar links. No data shape change — no reseed (still v9).
- **3 Jun 2026 — Delete PR (edit mode, guarded).** The Edit PR modal now has a delete control, kept hard to misclick: a small, de-emphasized red "Delete…" button pinned to the far-left of the footer (opposite Save), which doesn't delete on click — it reveals an inline "Delete this PR permanently?" confirm with a red **Confirm delete** and a **Keep** escape. Two deliberate clicks, and the destructive button never sits next to Save. Create mode is unaffected. UI-only, no storage change.
- **3 Jun 2026 — New PR no longer pre-fills (Raise PR still does).** PrModal now distinguishes its two entry points: **Raise PR** (from a BoQ row, passes the line) keeps pre-filling quantity / unit cost / dates from that line; **New PR** (from the Purchase Requests page) opens blank with the BoQ-item picker unselected ("Select a BoQ item…") and fills nothing — picking a line in New PR no longer auto-populates qty or cost. UI-only, no storage change.
- **3 Jun 2026 — Material Types catalogue (NEW + reseed → v9).** New **Library → Material Types** page: a `Type · Description` table that is now the source of truth for every type dropdown and filter (Catalogue, Suppliers, Balance, etc. already read `db.materialTypes`). Search bar + "+ Add type" + per-row Edit, via a name/description modal with duplicate-name guard. Added a `description` field to material types in the seed and `addMaterialType` / `updateMaterialType` store actions; registered route `/material-types` and the sidebar link. A subtle "N materials" usage hint sits next to each type name. **Storage key bumped to `solaria_boq_db_v9`, so this reseeds** (descriptions are new).
- **3 Jun 2026 — Overview KPI cards linked.** All four KPIs on the per-project Overview are now clickable (matching This Week): **Budgeted cost → Bill of Quantities**, **Committed → Purchase Requests**, **Materials over budget → Balance**, **Open PRs → Purchase Requests**. UI-only, no storage change.
- **3 Jun 2026 — Actual cost recognized at commit.** Balance "Actual cost" now sums **committed** PRs (ordered + received) at their PR unit cost, instead of received-only — so the instant an order is placed it counts as actual spend and Δ Cost reflects the budget impact at order time. One-line change in `summarizeProject`; `projectTotals.actualCost` (Overview / Project Catalogue) follows since it derives from these rows. Footnote reworded. No data or storage change.
- **3 Jun 2026 — Split Qty / Unit in detailed tables.** Quantities were rendered glued to their unit ("180 lembar" in one cell); the data already stored them separately, so this is display hygiene. Added a dedicated **Unit** column to **BoQ** (after Qty), **Purchase Requests** (after Qty), and **Balance** (one Unit column after Material, covering Budget/Committed/Received/Balance), plus both Balance drill-down sub-tables. colSpans adjusted (BoQ 8→9, PR 10→11, Balance 9→10). Left durations ("7d lead") and ratios ("5/12 delivered") as-is, and didn't touch summaries/overviews. No data or storage change.
- **3 Jun 2026 — Removed the Balance "over" pill.** The per-row `over` pill (committed-basis) collided with the Balance number (received-basis), e.g. a row reading "−30" beside "over". Dropped the pill; the signed Balance number (red when positive) carries it. Over-budget banner reworded — no longer points to a per-row flag; over-committed materials still sort to the top. UI-only, no storage change.
- **3 Jun 2026 — Late → violet.** Yellow (order now) and orange (late) read too similarly in practice, so **Late / late delivery is now violet** (`#8B5CF6`; tag text `#7C3AED`) — distinct from yellow, and a "pay attention, no rush" tone that fits an already-placed order. Applied to Schedule timeline bars/markers/Milestone/LineTags/Legend, Agenda 'Late' bucket, and the This Week "Late — chase supplier" list. Full palette: order now = yellow, ordered & waiting = blue, overdue = red, late = violet, received = green, neutral = grey. UI-only, no storage change.
- **3 Jun 2026 — Per-state colour palette aligned across all surfaces.** One `tone` per line now flows from the engine to every view, so Overdue and Late are no longer both red. Palette: **Order now (routine) = yellow** (`#EAB308`), **Ordered & waiting / on track = blue** (`#0EA5E9`), **Overdue / late order = red** (`#E11D48`), **Late / late delivery = orange** (`#F59E0B`), Received = green, neutral = grey. Updated `computeLine` tones (overdue / late / orderNow / awaiting / done / neutral); Schedule timeline bars + markers + Milestone + LineTags + Legend; Agenda bucket headers (yellow / red / orange / blue) with row dots reflecting per-line state; This Week (Dashboard) buckets recoloured and "Chase supplier" → **"Late — chase supplier"** (orange). UI-only, no storage change.
- **3 Jun 2026 — Agenda re-grouped + Overdue/Late split.** Established global vocabulary: **Overdue** = late *order*, **Late** = late *delivery*. Schedule → Agenda now leads with **Order this week (routine)**, then **Overdue**, then **Late** (previously merged), then Arriving this week / Next week / Later / Done. Distinct bucket colors: routine = calm blue (`#0EA5E9`), Overdue = red (`#E11D48`), Late = amber (`#F59E0B`), arriving = teal, neutral = gray, done = green; the bucket color drives both the header and row dots. Timeline `LineTags` relabelled to **Overdue** (red) / **Late** (amber). Engine `agendaBuckets` reworked. UI-only, no storage change.
- **3 Jun 2026 — Search-left + installer renamed.** Moved the search box to the leftmost slot on Catalogue, Suppliers, and Project Catalogue (BoQ / PR / Balance keep project-first → search → filters). Installer file renamed to **`sbf.mjs`** (was `solaria-boq-files.mjs`). UI-only, no storage change.
- **3 Jun 2026 — Unified filter/search bar.** New reusable `FilterBar` + `FilterSearch` + `FilterSelect` (in `ui.jsx`) with a "Showing X of Y" count, applied to every detailed-table page. **BoQ / PR / Balance**: project picker first (the `ProjectBar` now has an `embedded` mode), then search, then column filters — BoQ adds a **mandor** filter (+ kept Group-by-mandor toggle); PR adds **status** + **supplier**; Balance adds **material type** + **over-budget-only**. **Catalogue**: material-type filter then search. **Suppliers**: added a **location** filter (alongside type + search). **Project Catalogue (Active)**: project select + search + over-budget-only + status (needs-attention / on-track). Primary "+ Add" buttons moved to each page header. UI-only, no storage change.
- **3 Jun 2026 — New-project button on Catalogue + shared modal.** Added a **+ New project** button to the Project Catalogue. Extracted the New-Project dialog into a shared `components/NewProjectModal.jsx` now used by both This Week and the Catalogue (no duplication). Creating from either spot lands you on the new project's BoQ. UI-only, no storage change.
- **3 Jun 2026 — Project Catalogue.** New portfolio page `pages/ProjectCataloguePage.jsx` at `/projects` (Sidebar → Portfolio → Projects). Three tabs — **Active** (wired) shows a table of every project: name/code/location, **timeline** (start → derived est. finish = latest needed-day, plus current day), **budgeted cost**, **committed cost** (% of budget, red if over), **materials over budget**, **delivery progress** (received/total), and a **status** flag (⚠ N to act on / On track). Rows open the project's Overview. **Completed** + **Upcoming** are placeholders (completion workflow undecided). Reuses `projectTotals` + `scheduleForProject`; UI-only, no storage change. Est. finish is derived (no finish-date field yet).
- **3 Jun 2026 — Dashboard layout + KPI links.** On *This Week*, the health KPIs moved to the **top**, and **Order this week** is now the first action list (then Overdue, Chase supplier, Heads-up). KPIs are now clickable where it helps: **Materials over budget → Balance** and **Open POs → Purchase Requests**, each jumping to a project that actually has the item (`KpiCard` gained an optional `onClick`). UI-only, no storage change.
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
