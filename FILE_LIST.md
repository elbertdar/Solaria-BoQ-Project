# Solaria BoQ — File List

The source of truth for what files exist and where. **Updated every time we change something.**

- **Last updated:** 5 Jun 2026
- **Latest build:** Status section mover + name-first project labels everywhere

---

## ⚠ Latest build (2 minor changes)

**1 · Move statuses between sections.** Each unlocked status in the Manage statuses modal now has a
section dropdown (Before ordering / After ordering / Closed) — so an existing status can be moved into
the Ordered→Received zone (or out of it). Moving an in-use status changes how its PRs count against
budget immediately (that's the point); the store already guarded phase changes (`received` stays
exclusive, locked rows can't move) and re-sorts on every change.

**2 · Name-first project labels.** Per client preference, the project NAME now leads everywhere the
code used to: This Week worklist links, the sidebar's current-project label, Portfolio Gantt row labels
(ellipsized, full name + code in the tooltip), and the catalogue's project filter. The code stays as a
secondary hint (tooltips / parentheses) — except the delete-project type-to-confirm, which deliberately
keeps the short code as the thing you type.

**Storage unchanged — v10.** **Verified:** compile + clean-room installer extraction.

**Changed:** `components/ManageStatusesModal.jsx`, `components/Sidebar.jsx`, `components/PortfolioGantt.jsx`,
`pages/DashboardPage.jsx`, `pages/ProjectCataloguePage.jsx`, `index.css`

---

## Previous build (customizable PR statuses)

PR statuses are now db records (`db.prStatuses`) instead of a hardcoded enum. **Manage statuses**
button on the PR page header opens the editor.

**Locked:** `Ordered` and `Received` — the engines key real semantics off them (entering Ordered
commits cost/qty against budget + stamps orderDate; Received is the only status that may carry a
receiptDate, BR-4). They can be **recolored** but not renamed, moved out of place, or removed.

**Everything else is the user's:** add, rename (click the pill), recolor (7 swatches incl. new
purple/teal), reorder (↑↓), remove. Statuses live in **phases**, which is what the engines read:
- *Before ordering* (Draft, Requested, Quoted…) — not counted against budget
- *After ordering — committed* (Ordered + customs like "Shipped") — counts as committed
- *Received* (locked terminal)
- *Closed — not counted* (Cancelled + customs like "Rejected") — excluded everywhere, out of the flow

So a custom "Shipped" between Ordered and Received **stays committed**, and a custom "Rejected"
is excluded like Cancelled. The Advance button walks the custom flow (tooltip shows the next step)
and still routes through the receipt-date modal into Received.

**No dead ends — "delete" = retire:** the definition is kept (status history and trashed PRs render
with the right label/colour forever), it just leaves all pickers and the flow. Retiring an in-use
status requires choosing a destination for its PRs (reassignment is history-logged; `Received` is
refused as a bulk target — BR-4). Retired statuses are listed in the modal and can be **restored**.
normalize() re-inserts/repairs the locked pair if data is ever tampered, so the flow can never break.

Migration: existing v10 data is backfilled with the six defaults on load — behavior is byte-identical
until you customize. `engine/status.js` is the new single source (theme.js enums removed); semantic
literals across engines/pages swapped for phase checks (`isCommitted/isReceived/isVoid`), incl.
Dashboard/Schedule "receive" quick-actions now finding any committed-not-received PR.

**Storage unchanged — v10.** **Verified:** compile + 27-check harness (defaults parity, custom
committed/void participation, retire/reassign guards, normalize repair) + clean-room extraction.
Installer now embeds **40 files** (new: `engine/status.js`, `components/ManageStatusesModal.jsx`).

**Changed:** `theme.js`, `data/seed.js`, `store/StoreContext.jsx`, `engine/reconcile.js`,
`engine/schedule.js`, `components/ui.jsx`, `components/PrModal.jsx`, `pages/PurchaseRequestsPage.jsx`,
`pages/DashboardPage.jsx`, `pages/SchedulePage.jsx`, `pages/ReconciliationPage.jsx`, `index.css`

---

## Previous build (inline create everywhere — unified ComboBox)

You no longer have to leave a form to add a record. Every pick-a-record dropdown is now one consistent
control — **ComboBox** (`components/ComboBox.jsx`, built last session as groundwork, now shipped + wired):
type to search, ↑ ↓ Enter to navigate, and a **➕ Add …** row creates the record inline and selects it.

Adopted in:
- **PR form** — **Supplier 1 / Supplier 2** (grouped: ★ Recommended first, searchable, creatable —
  the original ask), **Brand** (replaces the select→input toggle), **Material** for extra purchases
  (creatable; inherits the typed unit), **Purchasing PIC** (new PIC created inline, defaults to the
  Purchasing PIC role). Status stays a plain select (it's an enum, not a record).
- **BoQ item modal** — **Material** keeps its fuzzy matching + % scores + alias hits (same engine,
  now rendered through ComboBox; exact text still resolves at save time), **Mandor** (replaces the
  select + ＋ button).
- **BoQ draft rows** (the add-row table) — **Material** and **Mandor**, both creatable in place.
- **Material form** (Catalogue) — **Material type** creatable inline.
- **New Project** — project type now uses the shared ComboBox (typed-but-unpicked text is still
  honored on save: reuse by name, else create).

QoL beyond the ask:
- **New suppliers created from a PR are auto-tagged with the material's category**, so they appear
  under ★ Recommended for that category from then on.
- Every list is now searchable by typing — matters as suppliers/materials grow at 30–50 stores/yr.
- One keyboard model everywhere (↑ ↓ Enter Esc), one visual language (.suggest dropdown).

Left as-is, deliberately: catalogue **TypeCell** (click-to-edit table cell, different interaction; native
select stays), Suppliers page **category checkboxes** (multi-select tags), enum selects (PR status, user role).

**Storage unchanged — v10.** **Verified:** compile + 14-check harness (ComboBox row assembly, supplier
auto-tag payload, draft-row create flow) + clean-room installer extraction. Installer now embeds **38 files**
(ComboBox.jsx ships for the first time).

**Changed:** `index.css`, `components/ComboBox.jsx`, `components/PrModal.jsx`, `components/BoqModal.jsx`,
`components/NewProjectModal.jsx`, `pages/BoqPage.jsx`, `pages/CataloguePage.jsx`

---

## Previous build (3 fixes)

**1 · Delete a project type (easy).** New **Manage types** button in the catalogue header (next to "+ New
project") opens a modal listing every type with its usage count and a one-click **Delete**. Deleting is
non-destructive to projects — `deleteProjectType` removes the type and sets `projectTypeId: null` on any
project that referenced it (so those projects just lose their label; nothing is deleted). The store action
already existed; this build exposes it in the context value and adds the UI. (Verified with a 10-check
reducer harness incl. immutability.)

**2 · Split PR suppliers into two columns.** The combined "Sup 1 / Sup 2" column is now **Supplier 1** and
**Supplier 2** (em-dash when there's no secondary). colSpans bumped 13 → 14. To keep the look clean despite
the extra column, the PR table is now **`compact`** — the tighter 9px padding across 14 columns more than
offsets the new column, so the table is actually slightly narrower than before.

**3 · Center the PR comment cell.** Dropped the `vertical-align: top` override on the comment `<td>`, so the
"+ note" button (and comment text) now sit vertically centered like the rest of the row.

**Storage unchanged — v10.** **Verified:** compile + reducer harness + clean-room installer extraction.

**Changed:** `store/StoreContext.jsx`, `pages/ProjectCataloguePage.jsx`, `pages/PurchaseRequestsPage.jsx`

---

## Previous build (catalogue fits, take 2)

The earlier `overflow-x: auto` fix just moved the problem — on a tall table the horizontal scrollbar
lands at the very bottom, so the Delete column read as clipped with no obvious way to scroll to it.
The real fix is to make the 10-column table **fit** the container instead.

Two changes to the catalogue table (all columns + data kept):
- **Timeline** no longer forces one line — the two dates each stay intact (`nowrap`) but the cell can
  break between them. This removes the ~195px hard floor that single column was imposing; it still renders
  on one line when there's room, and only wraps when squeezed.
- The table is marked **`compact`** → cell padding 14px → 9px (≈100px back across 10 columns).

Together the table's minimum width drops well under `.main`'s 1180px, so it lays out without clipping or
a scrollbar. The global `.card-body.flush { overflow-x: auto }` stays as a graceful fallback for very narrow
windows (and the wide PR table), but the catalogue no longer triggers it.

**Storage unchanged — v10.** **Verified:** compile + clean-room installer extraction.

**Changed:** `index.css`, `pages/ProjectCataloguePage.jsx`

---

## Previous build (New Project type typeahead)

---

## ⚠ Latest build (New Project type typeahead)

The **New project** dialog now has a **Project type** field — a typeahead/combobox over the existing
`projectTypes` "history":

- **Browse** — focus the field to see all existing types.
- **Filter** — type "Ma" and it suggests "Mall" (case-insensitive substring match).
- **Add** — type a new name and pick "➕ Add … as a new type"; it's created on save (reused by name if it
  already exists, so no duplicates).
- **History spans completed projects** — suggestions come from the `projectTypes` collection, which isn't
  scoped to project status and is never pruned, so types used on completed (or deleted) projects still show.
- Optional — leave it blank and the project has no type.

Reuses the app's existing `.suggest` typeahead styling (same as the material picker). `NewProjectModal` now
resolves the chosen/typed type to a `projectTypeId` and passes it through `onCreate → addProject`; the two
callers (catalogue, dashboard) were already pass-through.

**Storage unchanged — v10.** **Verified:** 8-check harness (filter, browse, pick, reuse-by-name, create, empty, case-insensitive) + clean-room installer extraction.

**Changed:** `components/NewProjectModal.jsx`

---

## Previous build (Project type + region column)

---

## ⚠ Latest build (Project type + region column)

Two changes to the **Project Catalogue**, both done as inline-editable columns (no new admin page,
no create-modal changes — set them right in the table, on new or existing projects):

- **Project type** — projects gain a `projectTypeId` referencing a new user-customizable `projectTypes`
  collection. The **Type** column is click-to-edit: a dropdown of existing types plus "➕ New type…",
  which lets you create a type on the fly (genuinely customizable). Seeded with a few examples
  (New store / Renovation / Relocation / Kiosk) for fresh installs; existing data starts empty and you
  add your own. New action `addProjectType` (via the CRUD factory).
- **Region** — `location` is promoted out of the project-name sub-line into its own **Region** column
  (cleaner for future export), click-to-edit text. The project cell now shows just name + code.

Both cells save via `updateProject`; row-click navigation is preserved (the editable cells stop event
propagation). Columns sit right after Project: `Project | Type | Region | Timeline | …`.

**Storage unchanged — v10** (`normalize` adds `projectTypes: []`).
**Verified:** column/cell counts align, `addProjectType` returns the id for assignment, clean-room installer extraction.

**Changed:** `data/seed.js`, `store/StoreContext.jsx`, `pages/ProjectCataloguePage.jsx`

---

## Previous build (PR modal layout + comment)

---

## ⚠ Latest build (PR modal layout + comment)

The New/Edit PR modal had Supplier 1 and Supplier 2 sitting diagonally (`Unit cost | Supplier 1`
then `Supplier 2 | PIC`). Inserting the **Comment** field right after Unit cost bumps Supplier 1
down so the two suppliers now share a row:

```
Unit cost | Comment
Supplier 1 | Supplier 2      ← paired
Purchasing PIC | Status
Order date | (Receipt, when received)
```

- Same `comment` field as the table column — the modal textarea is added to the save payload, so
  it works on **both create and edit** (shared `PrModal`), and stays in sync with the table's inline edit.
- Minor: in the default (non-received) state the bottom row shows Order date with an empty slot beside it
  (odd field count); it fills in when a Receipt date appears.

**Storage unchanged — v10.** **Verified:** clean compile + clean-room installer extraction.

**Changed:** `components/PrModal.jsx`

---

## Previous build (PR comments)

---

## ⚠ Latest build (PR comments)

Each PR now has an optional free-text **comment**, shown as a column in Purchase Requests.

- **Readable inline** — the comment text renders right in the cell (no click/expand needed to read it).
- **Width-capped** — the cell is fixed at ~180px and the text *wraps* (row grows taller, not wider), so the table doesn't widen beyond that. Empty PRs show only a faint "+ note", keeping the column compact.
- **Click-to-edit** — click the text (or "+ note") → small textarea → **click away to save**, Esc to cancel. Clearing it removes the note.
- **Placement** — last column, before the action buttons.
- **No audit trail** for comments (unlike status changes) — they're freeform notes. Editing reuses `updatePr`, so status/receipt/history are untouched (verified: commenting a received PR keeps its receipt date and adds no history entry).

Data: PR gains a `comment` string (`addPr` seeds `''`; `normalize` backfills existing rows). **Storage unchanged — v10.**

**Verified:** comment-edit safety harness + clean-room installer extraction.

**Changed:** `store/StoreContext.jsx`, `pages/PurchaseRequestsPage.jsx`

---

## Previous build (PR status history & receipt gating)

---

## ⚠ Latest build (PR status history & receipt gating)

**Receipt date is now gated behind actual receipt.** The invariant `receiptDate ≠ null ⇔ status = 'received'`
is enforced in the store on every write path (`addPr`, `updatePr`, `setPrStatus`), so moving a PR to any
non-received status clears its receipt date and it can't be set ahead of time. The PR modal only shows the
receipt-date field when status is "received" (and prefills today on that switch).

**Every status change is logged.** Each PR carries `statusHistory: [{ at, from, to, by:{id,name} }]`.
The actor is a snapshot of the current user (name frozen at the time, so it survives renames/deletes) —
single-user today, but the shape is ready for multiple users. Both paths that change status log it:
`setPrStatus` (the Advance / receive actions) and `updatePr` (editing status in the PR modal). Creation
seeds one entry (`null → initial status`). Existing PRs are backfilled on load with a single
`null → current status` entry (actor unknown, shown as "—"), since pre-feature transitions weren't recorded.

**Expandable history row.** Each PR row in Purchase Requests has a ▸ chevron that expands to its status
timeline — when, `from → to` (status pills), and who. (Note: not added to the Overview/Balance drill-downs.)

**Verified:** 12-check reducer harness (seed on create, log on every transition, block received-without-date,
clear receipt when leaving received, no log when status unchanged, actor reflects the acting user) + clean-room
installer extraction. **Storage unchanged — v10** (`normalize` backfills `statusHistory`).

**Changed:** `store/StoreContext.jsx`, `components/PrModal.jsx`, `pages/PurchaseRequestsPage.jsx`

---

## Previous build (Number formatting)

---

## ⚠ Latest build (Number formatting)

Qty and price now show comma thousands separators (`Rp 1,000,000`, `1,000`) everywhere.

- **Tables:** `engine/format.js` — `idr()` and `num()` switched from `id-ID` (dots) to comma grouping (`en-US`), keeping the manual `Rp ` prefix and the `—`-for-null behaviour. Every table reads through these, so all displays update at once. (`idrShort` KPI form now reads `Rp 1.2 mly` with a dot decimal — consistent with comma grouping.)
- **Inputs:** new `src/components/NumberInput.jsx` — a `type="text"` field (browsers can't format `type="number"`) that shows commas live while typing and reports a clean `Number` (or `''`) upstream, so the data model stays numeric. Resyncs on external prefill without snapping mid-edit (e.g. won't collapse `1.` to `1`). Decimals capped at 2 dp; `inputMode` set for the right mobile keypad.
- **Wired into:** quantity (BoqModal, DraftRow, PrModal — decimals allowed) and price/cost/allowance (BoqModal cost+allowance, DraftRow cost+allowance, PrModal unit cost, Catalogue est cost). **Day-offset and lead-time stay plain `type="number"`** — small integers where the stepper is handy and grouping is pointless.
- Known minor: editing in the *middle* of a grouped number can jump the caret to the end (comma reflow); appending at the end is unaffected.

**Verified:** 20-check format/parse harness (grouping, decimal cap, mid-edit safety, round-trips) + a formatter-output harness + clean-room installer extraction. **Storage unchanged — v10.**

**New:** `src/components/NumberInput.jsx` · **Changed:** `engine/format.js`, `components/{BoqModal,PrModal}.jsx`, `pages/{BoqPage,CataloguePage}.jsx`

---

## Previous build (Refactor pass — batches 1–4)

---

## ⚠ Refactor pass — all four batches (behaviour-preserving — no UI/logic changes)

A cleanup sweep across the heaviest files. **Nothing the user sees changed**; verified by compile +
a CRUD-equivalence harness + the soft-delete round-trip + clean-room installer extraction.

**Batch 3 — `BoqPage` decomposition (724 → 338 lines):**
- Extracted `BoqModal` (257), `CommitModal` (76), `HistoryView` (62) into their own files under `src/components/`.
- New `src/components/boqShared.jsx` (15) holds the two cross-component helpers — `dnum` (BoQ rows + item modal) and `fmtVal` (commit modal + history view) — so the split introduces **no duplication**.
- `BoqPage` now contains only the page shell + `Group` + `Row` + `DraftRow`; six now-unused imports dropped.
- `Row` (read-only display) and `DraftRow` (live edit inputs) were left un-merged on purpose — they share almost no markup, so a shared cell component would be contrived.
- App-file count: 24 → **28** under `src/` (the split adds focused files; total LOC ≈ flat, per-file complexity way down).

**Batch 1 — cross-cutting dedup + dead code:** removed dead `OverPill`; `TONE` → `theme.js` (was duplicated in Schedule + Dashboard); new `Pill` + `DeleteConfirm` primitives in `ui.jsx` adopted by the duplicating sites. (`deletePr` kept — Dashboard "undo" hard-deletes legitimately.)

**Batch 2 — `StoreContext` CRUD factory (−28 lines):** module-scoped `makeCrud(setDb, key, prefix, defaults)` collapses 13 add/update/delete actions, each `useMemo([])`-stable and aliased to the original names (value + deps + call sites unchanged). Custom logic preserved: `addMandor`, `updateUser`/`deleteUser`, `deleteBrand`, soft-deletes.

**Batch 4 — efficiency (memoization):** `ReconciliationPage`, `SchedulePage`, `ProjectCataloguePage`, `DashboardPage` wrap expensive derivations in `useMemo` keyed on `[db, currentProjectId]` with a stabilised `today`. Typing in a filter no longer recomputes the whole reconciliation/schedule.

**Heaviest files now:** StoreContext 456, BoqPage 338, SchedulePage 295, PrModal 292 — far more balanced (was BoqPage 724 alone).

**Storage:** unchanged — still **v10**.

**New files:** `src/components/{BoqModal,CommitModal,HistoryView,boqShared}.jsx`
**Changed (refactor):** `theme.js`, `ui.jsx`, `StoreContext.jsx`, `BoqPage.jsx`, `pages/{Dashboard,Schedule,ProjectCatalogue,Reconciliation,Catalogue,MaterialTypes,Trash}Page.jsx`

---

## Previous build (Deletion workflow)

---

## ⚠ Files touched in the latest build (Deletion workflow)

A unified soft-delete system. Deleting **moves records to a `trash` collection** (it doesn't wipe
them) with a full payload + timestamp, so they can be **restored within 7 days**, after which they're
permanently purged on load. Because deleted records leave their collection, every page and the
reconcile/schedule engines keep seeing only live data — no query changes anywhere.

New **Trash** page (sidebar → System) lists everything deleted: type, when, days-until-expiry,
Restore, Delete-forever. Linked rows restore together (a project brings back its BoQ lines + PRs;
a material brings back its brands).

Deletable now, safeguards scaled to blast radius:
- **Purchase requests** — two-step "Move to Trash" in the PR editor.
- **Materials** (Catalogue) — *unused only*; blocked with a message if referenced by any BoQ line or PR. Cascades the material's brands.
- **Material types** — *unused only*; blocked if any material or supplier references it.
- **Projects** (Catalogue) — cascades BoQ + PRs + staged edits + history into one restorable entry. If the project has data you must **type its code**; empty projects just confirm. Deleting the active project repoints the current-project selection.

**Not changed:** **BoQ** line deletion keeps its existing flow (staged delete + Undo before commit, plus the committed edit-history log). **Balance** is computed. **Mandors/Team** still hard-delete (can fold into Trash later).

**Storage:** still **v10** — `normalize()` adds an empty `trash` array and purges >7-day entries on load.

**Changed (6) + 1 new file:**
- `src/store/StoreContext.jsx` — `trash` collection; soft-delete actions (PR/material/type/project, with cascade) + `restoreTrash`/`purgeTrash`; 7-day purge in `normalize`
- `src/pages/TrashPage.jsx` — **NEW** — recycle bin (restore / delete-forever)
- `src/App.jsx` — `/trash` route · `src/components/Sidebar.jsx` — System → Trash + count badge
- `src/components/PrModal.jsx` — delete → soft-delete ("Move to Trash")
- `src/pages/CataloguePage.jsx` / `MaterialTypesPage.jsx` — ref-checked delete
- `src/pages/ProjectCataloguePage.jsx` — project delete with type-to-confirm

---

## Previous build (Schedule status colours)

---

## ⚠ Files touched in the latest build (Schedule status colours)

De-bloated the schedule to a single status tag per line, six colours:
- **Green** Complete · **Blue** On track (ordered, on time) · **Yellow** Order now (routine)
- **Red** Overdue (not ordered, past order-by — action: order) · **Grey** Upcoming
- **Purple** = ordered but late — *two cases, same colour, distinguished by text*:
  **Late delivery** (delivery overdue, chase supplier) vs **Late order** (ordered late → will land after plan).

Each line now shows exactly ONE tag (its status). Removed the **Over budget** tag from the schedule
(that's Balance's job), plus the stacked Snoozed / Needed-this-week / Order-before-start tags.
The orange "Late arrival" colour from the previous build is gone — it's purple now.

Judgment calls (flag me to change): **Order before start** folds into red Overdue; **No lead time**
shows as a grey tag (a line can't be scheduled without it); **Snooze** is no longer a schedule tag
(it still suppresses items from the This-Week chase list). Planned bar stays faded grey (= Upcoming),
as agreed.

Pure display — no schema/engine-math change, still v10.

**Changed (3) — no new files:**
- `src/engine/schedule.js` — forecast-late now uses the purple `late` tone (distinguished by text, not colour)
- `src/pages/SchedulePage.jsx` — single `statusTag` per line, six-colour palette, agenda labels, milestone wording, legend
- `src/pages/DashboardPage.jsx` — late buckets both purple, renamed "Late delivery" / "Late order"

---

## Previous build (Planned vs actual arrival)

---

## ⚠ Files touched in the latest build (Planned vs actual arrival)

**The fix:** an ordered line no longer assumes it arrives on the planned date. Once ordered, expected
arrival = **actual order date + lead time** (a late order lands late). So late ordering now
propagates into a late delivery instead of snapping back to plan. Push-date still overrides; receipt
finalizes the actual date.

Three arrival concepts per line now: **planned** (needed date, never moves), **expected** (forecast
once ordered, or supplier's push-date), **actual** (receipt). New fields on `computeLine`:
`plannedArrival`, `projectedArrival`, `slipDays`, `forecastLate`.

New **"Late arrival"** state (orange), distinct from the existing **"Late"** (violet = delivery
overdue): *Late arrival* = ordered, projected to land after the planned date but not yet overdue;
it escalates to *Late* once the expected date passes with no receipt.

**Project Schedule timeline** now draws two layers per row: **planned (faded)** order→needed, and
**actual/expected (solid)** actual-order→expected. Order late and the solid bar starts later and
extends past the faded planned diamond — the slip is visible. Legend + Agenda + tags updated.

**This Week** gains a **"Late arrival — ordered late"** bucket (forecast slips not yet overdue),
separate from "Late — chase supplier".

**Deliberately NOT changed:** the portfolio Gantt still uses planned dates (no auto-rollback of
project length on slip — that's the PM's judgment). Per-PR supplier delivery date is a future
follow-up. Balance/reconciliation untouched. **No schema change — pure recomputation, still v10.**

**Changed (3) — no new files:**
- `src/engine/schedule.js` — `computeLine` expected-arrival logic + `plannedArrival`/`slipDays`/`forecastLate` + `lateArrival` tone; `portfolioWorklist`/`agendaBuckets`/`scheduleCounts` gain the late-arrival split
- `src/pages/SchedulePage.jsx` — faded-planned / solid-actual timeline, Late-arrival tone/tag/bucket, Milestone shows expected vs planned + slip, legend
- `src/pages/DashboardPage.jsx` — "Late arrival" worklist bucket + tone

---

## Previous build (Balance sign convention)

---

## ⚠ Files touched in the latest build (Balance sign convention)

The Balance column read like a *variance* (committed − budget), so under-budget rows showed as
**negative** even though the column is named "Balance" (which implies remaining). Extras used the
opposite direction. Now **every row uses one convention — budget − committed**:
- **Positive (green) = under budget / still to order.**  **Negative (red) = over.**
- "Δ Cost" is renamed **Cost balance** (budget − actual), same convention.
- **Extra** rows have a 0 budget, so they stay negative (0 − committed / 0 − actual): pure overspend.

Pure display/labelling change — no schema or engine math changed (still v10).

**Changed (1):** `src/pages/ReconciliationPage.jsx` — remaining-based Balance + Cost balance cells, header rename, footnote.

---

## Previous build (Portfolio timeline)
- **Latest build:** This Week → Worklist / Timeline toggle (portfolio Gantt by region)
- **Run:** `npm run dev` from the project root · details + assumptions in `README.md`
- **Total app files:** 23 under `src/` + `README.md`

---

## ⚠ Files touched in the latest build (Portfolio timeline)

**This Week** now has a **Worklist | Timeline** toggle (top-right, under the KPIs). Worklist is the
existing bucketed view (order now / overdue / late / next week). **Timeline** is a new portfolio
Gantt: one bar per project, **grouped by region** (the project's location).

A project's bar runs from its **first planned order date** to its **last planned order + lead time**
(i.e. the final planned delivery), computed from the schedule engine — needed-by day minus lead, in
business days. **Projects whose BoQ isn't confirmed (still draft) don't appear**, and neither do
projects with no schedulable lines (e.g. only allowance lines, which have no order-by date). Bars
are clickable → open the project's Overview. A red line marks today; each region gets its own hue.

No schema change — this is a pure read over existing data. **Storage stays v10.**

**Changed (3) + 1 new file:**
- `src/engine/schedule.js` — new `portfolioGantt(db, today)`: per-project window (min order → max delivery), grouped + sorted by region, draft/unschedulable excluded
- `src/components/PortfolioGantt.jsx` — **NEW** — month-axis Gantt, region groups, today marker, click-to-open
- `src/pages/DashboardPage.jsx` — Worklist/Timeline `.seg` toggle; renders the Gantt card
- `src/index.css` — `.pg-*` gantt styles

---

## Previous build (Brands)

Brands are variants of a material you actually buy (Gypsum → Jayaboard / Knauf / Aplus). They're
**separate from suppliers** (who you buy from) and **separate from the BoQ budget** (which stays
generic at the material level). A purchase records one brand; the project total still rolls up
across all brands of that material — so a line budgeted 100 sheets can arrive as 60 Jayaboard +
40 Knauf and still reconcile to 100.

Storage stays clean / first-normal-form — no lists in a cell:
- New `brands` collection: `{ id, materialId, name }`, **one row per brand**.
- PR gains a scalar `brandId` (nullable FK) — exactly like `supplierPrimaryId`.
- The "60 Jayaboard, 40 Knauf" view in Balance is **computed at render** (`brandBreakdown`),
  never stored. Maps straight onto the Supabase plan (a `brands` table + `brand_id` FK).

Where it shows:
- **Material Catalogue** — a Brands column + **+ Brand** per material to manage the list.
- **New/Edit PR** — a Brand dropdown filtered to the line's material, with inline "➕ Add a brand".
- **Balance** drill-down — a "By brand (committed)" line + a Brand column on the PR table.
- **Purchase Requests** — brand shown under the material name.

Cost variance comes for free: a pricier brand's higher PR unit cost simply shows as a positive
Δ Cost against the material's budget. (No per-brand price table — same scope cut as supplier pricing.)

**Storage:** still **v10** — `normalize()` adds an empty `brands` array on load; existing data is
untouched (no reseed). Deleting a brand nulls `brandId` on any PRs that used it (never orphaned).

**Changed (7) — no new files:**
- `src/engine/reconcile.js` — `brandsForMaterial`, `brandName`, `brandBreakdown`
- `src/store/StoreContext.jsx` — `brands` collection; `addBrand`/`updateBrand`/`deleteBrand` (delete unlinks PRs); `addPr` carries `brandId`; `normalize` backfill
- `src/data/seed.js` — demo brands for gypsum / cat / semen (fresh installs only)
- `src/pages/CataloguePage.jsx` — Brands column + manage-brands modal
- `src/components/PrModal.jsx` — brand picker filtered by material, inline add, resets on material change
- `src/pages/ReconciliationPage.jsx` — by-brand breakdown + Brand column in the drill-down
- `src/pages/PurchaseRequestsPage.jsx` — brand shown under the material

---

## Previous build (Allowance lines)

Consumables you reorder (nails, sealant, sandpaper…) where a fixed quantity is meaningless can now
be budgeted as an **allowance**: a lump-sum cost you track *spend* against, instead of a quantity.
Set it per line via a **Budget basis** toggle (By quantity | Allowance) in the BoQ modal, or the
**+ Add allowance** button in the draft grid.

Behaviour of an allowance line:
- Budgeted by a lump sum, not qty × rate. Balance reconciles **committed spend vs the allowance**;
  the quantity columns show "—". Over-budget fires when spend exceeds the allowance (leave the
  amount at 0 for an untracked bucket that just keeps spend visible).
- Never shows "Complete" (no qty target) — only Not ordered / Ordered.
- Kept **off the order timeline** (a reorder cadence is a separate axis, deferred) — so it won't
  appear on the Schedule or in This Week.
- PRs raised against it inherit the unit but don't prefill or police a quantity.

Also cleaned up `summarizeProject` into one kind-driven row builder (`quantity` | `allowance` |
`extra`) so the three Balance row types share one code path.

**Storage:** still **v10** — `budgetBasis`/`allowanceAmount` are backfilled by `normalize()` on load,
so existing data is preserved (no reseed, nothing wiped).

**Changed (7) — no new files:**
- `src/engine/reconcile.js` — kind-driven `summarizeProject`; allowance-aware `boqLineStatus`; `BOQ_FIELDS` gains Allowance + Budget basis
- `src/engine/schedule.js` — allowance lines excluded from `scheduleForProject` + `portfolioWorklist`
- `src/store/StoreContext.jsx` — `normalize()` backfills `budgetBasis`/`allowanceAmount`; `BOQ_FIELD_KEYS` carries both
- `src/pages/ReconciliationPage.jsx` — Balance rows render quantity / allowance / extra; Allowance pill; drill-down + footnote
- `src/pages/BoqPage.jsx` — working table + modal Budget-basis toggle/allowance field; draft grid "+ Add allowance" + allowance rows
- `src/components/PrModal.jsx` — allowance lines skip qty prefill + the over-budget check
- `FILE_LIST.md` — this entry

---

## Previous build (Day-offset planning)

Schema changed then, so the storage key moved to **v3** (auto-reseeded on first load at the time).

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
- **3 Jun 2026 — Extra rows show a cost deficit in Balance.** Since an extra purchase isn't budgeted, its Balance is now **0 − committed** and its Δ Cost is **0 − actual** — i.e. negative (a deficit against a zero budget), shown in amber. Budget qty/cost display as 0 (the basis for the subtraction) rather than “—”. Planned rows are unchanged (committed − budget; + = over).
- **3 Jun 2026 — Extra PRs (purchases outside the BoQ plan) + optional PR deletion on line removal.** A PR can now exist **without a BoQ line**: in the New PR dialog, pick *“— No BoQ line (extra purchase) —”* and enter the material + unit directly (instead of inheriting them from a line). Such PRs are **extra** — a computed state (no `boqItemId`, or its line was deleted) shown as an amber **Extra** pill in the PR list and on the Balance page. In **Balance**, extra purchases appear as their own rows (budget shown as “—”, amber not red), separate from the BoQ-plan rows: a plan row now counts only its **linked** PRs, so the planned committed-vs-budget stays honest and there's no double-counting when the same material is both planned and bought extra. Extra rows are excluded from the over-budget banner/KPI (they carry their own indicator). **Deleting a BoQ line** no longer force-deletes its PRs: the delete confirm offers a checkbox *“Also delete its N linked PRs (otherwise kept as extra)”* — unchecked, the line goes but its orders are unlinked and become extra; checked, they're removed. The commit summary states which. **Model:** every PR now carries an explicit `projectId` (extra PRs can't derive it from a line); `boqItemId` is optional. Backfilled for existing PRs via load-normalization — **no reseed** (still v10).
- **3 Jun 2026 — Phase 2: staged edits + commit + edit history (working BoQ).** In working mode, editing/adding/deleting a BoQ line now **stages** the change instead of applying it. The table overlays pending changes: edited rows highlight the changed cells (with the old value struck beneath) and carry an **Edited** tag, added rows are tinted green with a **New** tag, deleted rows are struck-through with a **Removing** tag and an **Undo**. A pending bar (**N uncommitted changes · Review & commit · Discard**) opens a **commit modal** showing every change as a row-level old→new summary (warning when a removal also drops linked PRs) plus an optional message; committing applies them atomically and writes one entry to `db.boqEdits`. An **Items / Edit history** toggle on the page shows commits newest-first, each expandable to its per-row diffs, attributed to the author. Engine adds `boqDisplayRows`, `changeFields`, `BOQ_FIELDS`; the modal's delete is guarded. Draft mode unchanged. No reseed (collections added via load-normalization) — still v10.
- **3 Jun 2026 — Balance column now committed − budget.** The Balance (Reconciliation) page's Balance column switched from received − budget to **committed − budget** (`committedBalanceQty`, already computed in the engine), so it matches the over-budget banner and the actual-cost-at-commit basis. Footnote updated. Display-only; no data/storage change (still v10).
- **3 Jun 2026 — Phase 1: draft vs working BoQ (NEW + reseed → v10).** Each project's BoQ now has a phase. **Draft:** the Bill of Quantities renders as an inline, spreadsheet-style grid — edit any cell live, "+ Add row", ✕ to delete — with no change ceremony (uses new `patchBoqItem`, no audit). **Finalize** (one-way, confirm dialog) flips draft → working via `finalizeBoq`. **Working:** the existing deliberate UI (modal edit, Status column, Raise PR). Ordering is blocked in draft everywhere: BoQ has no Raise PR/Status, the PR page disables "+ New PR" + shows a notice, and This Week + active-project count ignore draft projects. Project Catalogue shows a **Draft** status; Overview shows a draft banner with a shortcut to the BoQ. New store actions: `patchBoqItem`, `deleteBoqItem`, `finalizeBoq`. **Seed gutted: zero PRs, and every project starts as a draft** — finalize a BoQ and raise PRs to populate the live screens. Storage key → `solaria_boq_db_v10` (reseeds). Phase 2 (staged changes + commit + edit history) still to come.
- **3 Jun 2026 — BoQ line status (derived from PRs).** The BoQ’s "PR linked / none" indicator is now a three-stage **Status** column derived from the line’s non-cancelled PRs: **Not ordered** (no PR) → **Ordered** (a PR exists, not fully received) → **Complete** (received quantity covers the budgeted quantity). The BoQ stays the preserved plan; the status simply reflects PR progress, flipping to Complete when the order is fulfilled (received). New `boqLineStatus()` engine helper. No data or storage change.
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
