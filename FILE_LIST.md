# Solaria BoQ — File List

The source of truth for what files exist and where. **Updated every time we change something.**

- **Last updated:** 2 Jun 2026
- **Latest build:** Schedule tab (timeline hardened — renders without depending on index.css)
- **Run:** `npm run dev` from the project root · details + assumptions in `README.md`
- **Total app files:** 22 under `src/` + `README.md`

---

## ⚠ Files touched in the latest build (Schedule tab)

If your local copy is missing any of these, the app breaks or the tab misbehaves.

**New (3):**
- `src/engine/schedule.js`
- `src/pages/SchedulePage.jsx`
- `src/components/ReceiveModal.jsx`

**Changed (5):**
- `src/App.jsx` — added `/schedule` route + import
- `src/components/Sidebar.jsx` — added Schedule nav item + overdue badge (imports `schedule.js`)
- `src/index.css` — added timeline / agenda / chip styles
- `src/data/seed.js` — schedule-friendly dates; `meta.version: 2`
- `src/store/StoreContext.jsx` — storage key bumped `v1` → `v2`

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
| `src/store/StoreContext.jsx` | `db` + localStorage + all CRUD actions (the future Supabase seam) |

### `src/engine/` — pure logic
| File | Purpose |
|---|---|
| `src/engine/format.js` | IDR + date formatting |
| `src/engine/match.js` | Fuzzy material matching (Dice coefficient) for the catalogue |
| `src/engine/reconcile.js` | Balance core: budget vs committed vs received, over-qty warnings |
| `src/engine/schedule.js` | Schedule core: per-line state, late flags, this-week counts, week axis, agenda buckets |

### `src/components/`
| File | Purpose |
|---|---|
| `src/components/Sidebar.jsx` | Left nav: grouped links, Balance + Schedule badges, user profile |
| `src/components/ui.jsx` | `KpiCard`, `AlertBanner`, `StatusPill`, `OverPill`, `ProjectBar` |
| `src/components/Modal.jsx` | Reusable modal shell (overlay, Esc to close) |
| `src/components/PrModal.jsx` | Create/edit Purchase Request; live over-qty warning |
| `src/components/ReceiveModal.jsx` | Receipt-date prompt before marking a PR received (BR-4) |

### `src/pages/` — the 7 surfaces
| File | Route | Purpose |
|---|---|---|
| `src/pages/Overview.jsx` | `/` | KPIs, over-qty alert banners, recent activity |
| `src/pages/ReconciliationPage.jsx` | `/reconciliation` | Balance: per-material qty + cost, drill-down |
| `src/pages/SchedulePage.jsx` | `/schedule` | Weekly timeline + agenda; to-order / needed / arriving |
| `src/pages/BoqPage.jsx` | `/boq` | BoQ items, mandor grouping, fuzzy material picker |
| `src/pages/PurchaseRequestsPage.jsx` | `/purchase-requests` | PR list, create/edit, status advance |
| `src/pages/SuppliersPage.jsx` | `/suppliers` | Supplier registry, filter, multi-select for quotes |
| `src/pages/CataloguePage.jsx` | `/catalogue` | Canonical materials + aliases (admin) |

---

## Changelog
- **2 Jun 2026 — Timeline hardened.** `pages/SchedulePage.jsx` now carries its layout (grid, bars, markers, colors) as inline styles so the graph renders even if `index.css` is stale or browser-cached. No other files changed.
- **2 Jun 2026 — Schedule tab.** Added `engine/schedule.js`, `pages/SchedulePage.jsx`, `components/ReceiveModal.jsx`; changed `App.jsx`, `Sidebar.jsx`, `index.css`, `seed.js`, `StoreContext.jsx` (seed → v2).
- **2 Jun 2026 — Initial MVP.** Catalogue, BoQ, Suppliers, Purchase Requests, Balance reconciliation, over-qty warnings. 17 source files + README.
