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

Data persists to `localStorage` (key `solaria_boq_db_v2`) and is seeded on first load.
To wipe and re-seed, clear that key in devtools, or call `resetDb()` from the store.

> **Upgrading from an earlier copy:** the storage key moved from `v1` to `v2` so the
> schedule-friendly seed dates load. Your first run will reseed and discard any demo
> edits made against the old key — expected at this stage.

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
- **Q-9 multi-project** → catalogue + suppliers shared; BoQ + PRs project-scoped.
- **Warning basis** → fires on **committed** quantity (ordered + received) so over-ordering trips
  it before delivery; the headline balance uses the **received** basis. See `reconcile.js`.

## Wired vs deferred

**Wired:** all six MVP features — catalogue with fuzzy match (5.1), BoQ with mandor grouping +
audit (5.2), supplier registry with filter + multi-select (5.3), PR management with inherited
material/unit + Sup1/Sup2 + lifecycle (5.4), live reconciliation with drill-down (5.5),
over-qty warnings at project level + submission time (5.6). Business rules BR-1…BR-8 enforced at
the store/modal layer. **Plus a Schedule tab** (`/schedule`): each BoQ line is plotted on a weekly
timeline as a state — *to-order → ordered/awaiting → received* — with two distinct late flags
(order-overdue vs. delivery-overdue), three this-week counts (to order / needed / arriving) that
double as filters, and a vertical Agenda view for phones. Engine is `engine/schedule.js`;
"received" means received qty ≥ budget, expected-receipt = planned delivery date, week starts
Monday over a −1…+6 window. All tunable in that file.

**Deferred:** Supabase + auth (localStorage stands in), Excel import (the spec never asked for it
— biggest thing to reconfirm with the client), and everything in spec §10 (approval workflows,
partial deliveries, BoQ versioning, attachments, stock in/out, multi-currency).
