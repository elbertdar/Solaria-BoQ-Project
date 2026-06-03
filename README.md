# Solaria BoQ

Construction procurement control. Keeps the **BoQ (the plan)** and **Purchase Requests
(the actual orders)** in continuous reconciliation, and warns when realized quantity
diverges from budget. Built from the v0.1 requirements spec.

> "Selalu check Balance BoQ vs Purchase!!"

## Running it

This is a Vite + React (JSX) app. From the project root:

```bash
npm install          # if you haven't already
npm install react-router-dom xlsx   # runtime deps (xlsx is reserved for later import work)
npm run dev
```

Data persists to `localStorage` (key `solaria_boq_db_v3`) and is seeded on first load.
To wipe and re-seed, clear that key in devtools, or call `resetDb()` from the store.

> **Upgrading from an earlier copy:** the storage key advances when the data shape
> changes (now `v3`, for the day-offset planning model). Your first run reseeds and
> discards any demo edits made against an older key — expected at this stage.

## File placement

All app code lives under `src/`. **Three files replace the Vite defaults** — overwrite them
entirely:

| Replaces Vite default | |
|---|---|
| `src/main.jsx` | entry point (the default imports `App.css`, which is now unused — safe to delete) |
| `src/App.jsx` | router + two-pane shell |
| `src/index.css` | design tokens + all styles |

Everything else is new:

```
src/
  theme.js                     semantic tokens, PR lifecycle, committed/received status sets
  data/seed.js                 initial dataset (1 project, catalogue, suppliers, BoQ, PRs)
  store/StoreContext.jsx       db + localStorage + all CRUD actions (the Supabase seam)
  engine/
    format.js                  IDR + date formatting
    match.js                   fuzzy material matching (Dice coefficient)
    reconcile.js               THE core — budget vs committed vs received, warnings
  components/
    Sidebar.jsx  ui.jsx  Modal.jsx  PrModal.jsx
  pages/
    Overview.jsx  ReconciliationPage.jsx  BoqPage.jsx
    PurchaseRequestsPage.jsx  SuppliersPage.jsx  CataloguePage.jsx
```

`src/assets/react.svg` and `src/App.css` from the Vite template are unused.

## Decisions baked in (all reversible)

The spec's §11 open questions had to be answered to make it runnable. Current defaults:

- **Q-1 schedule** → specific dates (purchase + delivery), not weekly buckets.
- **Q-3 over-qty warning** → **soft**: warns loudly at PR entry and at project level, but lets
  you proceed after ticking acknowledge. Flip to hard-block in `PrModal.jsx` (disable save when
  `wouldExceed`).
- **Q-6 PR lifecycle** → draft → requested → quoted → ordered → received → cancelled
  (`theme.js` → `PR_FLOW`).
- **Q-7 budgeted unit cost** → lives on the **BoQ item** (`expectedUnitCost`), so budget cost
  exists before any PR.
- **Q-9 multi-project** → catalogue + suppliers shared; BoQ + PRs project-scoped. The **landing
  screen is a cross-project worklist** (`/`), not a single project — the PM runs ~10–15 builds.
- **Warning basis** → fires on **committed** quantity (ordered + received) so over-ordering trips
  it before delivery; the headline balance uses the **received** basis. See `reconcile.js`.
- **Order-day backtrace** → counted in **business days** (Mon–Fri); holidays ignored for now, with
  a per-order manual override available via "Push date" / per-line lead override.
- **Dashboard buckets** (renamed from the client's working terms): *forgot to order* → **"Overdue
  — order now"**, routine → **"Order this week"**, late supplier → **"Chase supplier"**, plus a
  read-only **"Heads-up: next week."** Order buckets key off the **order-by date** (the date the PO
  must go out), not the needed date. Late deliveries resolve via **Received / Push date / Snooze**;
  there is deliberately **no permanent "ignore"** (a silently-dropped late delivery is what bites on
  site). Snooze options 2 / 5 / 7 days.

## Wired vs deferred

**Wired:** all six MVP features — catalogue with fuzzy match (5.1), BoQ with mandor grouping +
audit (5.2), supplier registry with filter + multi-select (5.3), PR management with inherited
material/unit + Sup1/Sup2 + lifecycle (5.4), live reconciliation with drill-down (5.5),
over-qty warnings at project level + submission time (5.6). Business rules BR-1…BR-8 enforced at
the store/modal layer.

**Portfolio dashboard (`/`, the new home):** a cross-project "This Week" worklist. Three action
lists — **Overdue — order now**, **Order this week**, **Chase supplier** — plus **Heads-up: next
week** and subordinate health KPIs (active projects, materials over budget, open POs, snoozed).
One-tap **Mark ordered** raises a PO and checks the row off with a session **Undo** (gone on
refresh). Late deliveries resolve in place: **Received** (it arrived), **Push date** (new supplier
ETA → `promisedDate`), **Snooze** (`snoozedUntil`). **New project** modal: name + start date
required, code optional. Rows link straight into their project's BoQ.

**Day-offset planning model:** each project has a start date, each material a delivery **lead time
(days)**, each BoQ line a single **needed-day** (days after start) and optional **per-line lead
override**. The **order day is derived** as `needed − lead`, counted in **business days** — the
backtrace the client did by hand. The Schedule tab (`/schedule`) plots each line on a
**day-granular** 42-day axis (weekends shaded, today highlighted, bar length = lead time), with
two late flags (order-overdue vs. delivery-overdue), three this-week counts that double as filters,
and a vertical Agenda for phones. Engine is `engine/schedule.js` (`computeLine` is the per-line
heart; `portfolioWorklist` powers the dashboard).

**Import seam:** `StoreContext.importData(payload, { merge })` replaces or merges any top-level
collection (`materials`, `boqItems`, `prs`, …) from an external source. Pages never read storage
directly, so wiring a **manual paste/upload** or an **automatic backend fetch** later touches only
this one function. No import UI yet — the seam is in place.

**Deferred:** Supabase + auth (localStorage stands in), Excel import UI (the spec never asked for
it — biggest thing to reconfirm with the client; the `importData` seam is ready for it),
**build-type templates** (clone a previous store + shift dates — high-value, discussed, not yet
built), phases/stages, holiday calendar, supplier-specific lead times, and everything in spec §10
(approval workflows, partial deliveries, BoQ versioning, attachments, stock in/out, multi-currency).
