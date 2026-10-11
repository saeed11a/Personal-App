# Integration review — `main` vs the tested workspace

**Status:** approved and applied on the working branch (`personal-oct-11`). The two reconciliation edits of §7
were applied with this change; §8 steps 1–3 are therefore done and step 4 (open the pull request
`personal-oct-11` → `main`) was requested next. Nothing was merged, force-pushed or deleted, and `main` was not
modified.

- **Base compared:** `origin/main` @ `71e407b` (*"Merge pull request #1 from saeed11a/base44/setup-879f1470"*)
- **Head compared:** working branch `personal-oct-11` @ `d2dae1b` (*"feat: add live sync, database center, staff permissions and ERP improvements"*, 269 files)
- **Branch state:** `personal-oct-11` is **1 commit ahead** of `origin/main` and **does not exist on GitHub yet**.

## 1. How the comparison was made (reproducible)

```bash
rm -f /tmp/idx
GIT_INDEX_FILE=/tmp/idx git read-tree origin/main
GIT_INDEX_FILE=/tmp/idx git add -A .
GIT_INDEX_FILE=/tmp/idx git diff --cached --name-status -M origin/main   # status, with rename detection
GIT_INDEX_FILE=/tmp/idx git diff --cached --numstat    -M origin/main   # per-file line counts
```

Working tree status at review time: **clean** (`d2dae1b` == working tree), so commit-to-commit and
commit-to-workspace comparisons are identical.

## 2. Counts — verified against the actual diff

| Change | Count | Note |
|---|---|---|
| Added (in workspace, absent from `main`) | **84** | confirmed |
| Modified (present on both, differing) | **67** | confirmed |
| Deleted (on `main`, absent from workspace) | **1** | `package-lock.json` — see §7 |
| Renamed | **0** | rename detection (`-M`) found none |
| Lines | **+13,079 / −10,461** | across the 152 changed files |
| Files on `main` / in workspace | 186 / 269 | |

**Safety finding — nothing unique to `main` is lost.** Every one of `main`'s 186 files is present in the
workspace: 118 are byte-identical, 67 differ, and only `package-lock.json` has no workspace counterpart.
There is no unrelated or third-party content on `main` that this integration would overwrite, and no file
would be deleted (the lockfile is regenerated rather than dropped — §7).

## 3. Added files (84)

### Root / docs / assets (17)
| File | Lines |
|---|---|
| `.env.base44-defaults` | +20 |
| `.env.example` | +31 |
| `docs/AUDIT.md` | +190 |
| `docs/PROGRESS.md` | +205 |
| `public/manifest.json` | +30 |
| `public/apple-touch-icon.png`, `public/hiker-logo.png`, `public/icon-192.png`, `public/icon-512.png` | binary |
| `resources/README.md` | +31 |
| `resources/icon.png`, `icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`, `splash-dark.png` | binary |
| `build/icon.png` | binary |

### New Supabase data/sync layer (26)
| File | Lines | Purpose |
|---|---|---|
| `src/lib/entities.js` | +266 | entity-call router: same call shapes (`filter`/`create`/`update`/`delete`/`aggregate`) to Base44 or Supabase |
| `src/api/supabaseClient.js` | +26 | single Supabase client + `isSupabaseConfigured` |
| `src/lib/authMode.js` | +10 | explicit `VITE_AUTH_BACKEND` → `base44` (default) or `supabase` |
| `src/lib/authApi.js` | +57 | sign-in / sign-out / password reset / password update |
| `src/lib/pin.js` | +36 | `verifyPin` / `setupPin` / `changePin` / `getPinStatus` (RPCs only) |
| `src/lib/permissions.js` | +235 | roles, module list, access levels, department defaults, staff/permission reads + writes |
| `src/lib/usePermissions.js` | +77 | permission hook used by routes and the sidebar |
| `src/lib/syncQueue.js` | +210 | offline outbox: enqueue, replay, backoff, probe |
| `src/lib/SyncContext.jsx` | +237 | `SyncProvider` / `useSync`, single source of truth for the indicator |
| `src/lib/syncStates.js` | +27 | indicator states |
| `src/lib/useBackendStatus.js` | +104 | real request to the configured backend, ≤1/min |
| `src/lib/datetime.js` | +49 | `formatAppDate/Time/Stamp` (Asia/Karachi, ISO-string safe) |
| `src/lib/accounting.js` | +208 | `postPayment` / `reversePayment` / reads / manual categories |
| `src/lib/labour.js` | +252 | labour categories, rates, production, stage moves, statements |
| `src/lib/adminApi.js` | +84 | admin user list / update / PIN issuing / Edge Function account creation |
| `src/lib/profileApi.js` | +69 | avatar upload + `set_own_avatar` |
| `src/lib/settingsApi.js` | +46 | settings read/write, backend-aware |
| `src/lib/databaseCenter.js` | +150 | explorer tables, table shape, paging |
| `src/lib/backup.js` | +167 | collect / validate / restore / log backups |
| `src/lib/xlsx.js` | +202 | hand-written .xlsx (ZIP + CRC-32), no new dependency |
| `src/lib/pdfTable.js` | +109 | PDF table export |
| `src/lib/invoke.js`* | +23 | `callBackend` (Supabase RPC vs Base44 function) — *also modified, see §4* |

### New screens & components (41 + 4)
Pin flow: `src/pages/PinUnlock.jsx` (+133), `PinSetup.jsx` (+119), `PinChange.jsx` (+132),
`PinNotIssued.jsx` (+43), `src/components/PinKeypad.jsx` (+59).
Permissions/staff/users: `src/components/RequirePermission.jsx` (+38), `staff/PermissionsDialog.jsx` (+137),
`staff/StaffPermissions.jsx` (+146), `users/StaffDialogs.jsx` (+341), `src/pages/Users.jsx` (+208).
Sync/status: `layout/ConnectionStatus.jsx` (+50), `layout/SyncPanel.jsx` (+124), `layout/LiveClock.jsx` (+43).
Database Center: `src/pages/DatabaseCenter.jsx` (+73), `components/database/ExplorerPanel.jsx` (+266),
`components/database/BackupPanel.jsx` (+243).
Records & printing: `components/RecordDetailDialog.jsx` (+60), `components/PartyDetailDialog.jsx` (+191),
`components/invoice/InvoicePrintView.jsx` (+246), `components/settings/ManualCategories.jsx` (+163),
`components/profile/ProfilePictureDialog.jsx` (+140), `layout/ProfileMenu.jsx` (+101).
Labour: `src/pages/Labour.jsx` (+382), `components/labour/LabourDialogs.jsx` (+727).

### Supabase migrations and functions (22)
`0001_core_schema.sql` (+620) and rollback, `0002_admin_bootstrap.sql` (+114), `0003_staff_departments.sql` (+29),
`0004_pin_self_service.sql` (+124), `0005_pin_helpers_search_path.sql` (+24),
`0006_labour_and_accounting.sql` (+902) + rollback, `0007_stock_and_sales_writes.sql` (+728) + rollback,
`0008_profile_avatar.sql` (+109) + rollback, `0009_invoice_payment_details.sql` (+26) + rollback,
`0010_admin_console_security.sql` (+350) + rollback, `0011_sync_probe.sql` (+35) + rollback,
`0012_kharcha_ledger_link.sql` (+206) + rollback, `migrations/README.md` (+98),
`supabase/functions/admin-users/index.ts` (+153).

**Schema shape (grep of the migration files):** 25 `create table` statements → `profiles`, `user_permissions`,
`customers`, `suppliers`, `articles`, `raw_categories`, `raw_stocks`, `ready_shoes`, `production_entries`,
`invoices`, `invoice_lines`, `payments`, `roznamcha`, `settings`, `manual_categories`, `labour_categories`,
`labour_category_links`, `labours`, `labour_rates`, `labour_production`, `labour_earnings`, `labour_stage_moves`,
`audit_logs`, `backups`; **40 `create policy`**, **13 `enable row level security`** and **50 `revoke`**
statements; 37 functions in `public` (`post_payment`, `reverse_payment`, `create_invoice`, `record_production`,
`save_raw_stock`, `save_ready_stock`, `record_purchase`, `verify_pin`, `setup_pin`, `change_pin`, `set_pin`,
`pin_status`, `has_permission`, `is_admin`, `admin_users`, `admin_update_user`, `log_admin_event`,
`restore_table_rows`, `sync_probe`, `set_own_avatar`, …). Migrations are **additive** and each has a rollback
file.

## 4. Modified files (67) — what actually changed

Categories are derived from the changed lines of each file's diff (`+/-` = lines added/removed).

| File | +/- | Dominant change | Impact area |
|---|---|---|---|
| `package.json` | +1/−0 | adds `@supabase/supabase-js ^2.45.0`; no other dependency or script change | build |
| `index.html` | +2/−1 | Base44 logo favicon → local `hiker-logo.png` + apple-touch-icon | UI/asset |
| `.gitignore` | +11/−0 | un-ignores `.env.base44-defaults` / `.env.example`; adds `*.jks *.keystore *.p12 *.pem *.key service-account*.json` | secrets hygiene |
| `.env.base44-defaults`(new)/`.env.example`(new) | +20/+31 | documented names, placeholders only | secrets hygiene |
| `.base44/environment.json` | +20/−6 | secret list replaced: `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` | config |
| `docker-compose.base44.yml` | +50/−31 | dev-server runbook: bind mount, node_modules volume, startup install, healthcheck, `env_file` order, `dbadmin` tool service | build |
| `.github/workflows/android-apk.yml` | +26/−4 | branch triggers (`personal-oct-11`, `scratch-supabase-apk-exe`, `resources/**`), Supabase repo-variable verification (warns, not fails), Capacitor icon/splash generation from `resources/`, renumbered steps | APK build |
| `.github/workflows/windows-exe.yml` | +12/−1 | same branch triggers, Supabase variable warnings | EXE build |
| `AGENTS.md` | +213/−27 | project runbook rewritten for the Supabase architecture, PIN rules, lockfile convention, verification status | docs |
| `src/App.jsx` | +42/−23 | every ERP route wrapped in `<RequirePermission module=… action=…>`; new routes `/unlock`, `/setup-pin`, `/change-pin`, `/pin-not-issued`, `/labour`, `/database-center`, `/users`; `SyncProvider` | routing + permissions |
| `src/components/ProtectedRoute.jsx` | +27/−2 | signed-in-but-no-PIN → `/setup-pin` or `/pin-not-issued`; PIN not entered → `/unlock` (no silent bypass) | auth |
| `src/lib/AuthContext.jsx` | +215/−10 | Supabase session subscription (`onAuthStateChange`), profile columns incl. `department`/`avatar_url`, PIN status, self-service actions | auth |
| `src/lib/invoke.js` | +23/−0 | `invokeDatabaseFunction` (RPC) + `callBackend` switch | database access |
| `src/api/base44Client.js` | +6/−0 | `isBase44Configured` so unconfigured builds skip Base44 calls instead of 404-ing | database access |
| `src/lib/analytics.js` | +25/−19 | aggregates moved to `db.*` + `created_date`/time fields | database access |
| `src/lib/recycle.js` | +12/−5 | recycle-bin writes via `db`; adds Labour / Labour work entities | business logic |
| `src/lib/useSettings.js` | +14/−5 | settings through `settingsApi`, defaults survive a backend that cannot answer | business logic |
| `src/components/layout/Sidebar.jsx` | +49/−21 | menu filtered by the account's module permissions (new Labour, Users, Database Center entries) | permissions |
| `src/components/layout/TopBar.jsx` | +25/−43 | HIKER+ wordmark, `LiveClock`, `ConnectionStatus`, `ProfileMenu`; Base44-specific pieces removed | UI + permissions |
| `src/components/forms/PaymentForm.jsx` | +192/−87 | unified payment screen (Customer / Supplier / Labour / Other) → `postPayment`/`reversePayment`, manual expense categories | business logic (money) |
| `src/pages/Payments.jsx` | +147/−42 | payment register reads/writes Supabase via `accounting.js`, manual categories, reversal | business logic (money) |
| `src/pages/Roznamcha.jsx` | +110/−61 | cash-book screen on Supabase; module-produced rows not staff-editable | business logic (money) |
| `src/components/forms/RoznamchaForm.jsx` | +89/−56 | form writes through `accounting.js`; source tagging | business logic (money) |
| `src/pages/Kharcha.jsx` | +55/−33 | expenses read `roznamcha` rows with `source = 'kharcha'` | business logic (money) |
| `src/components/InvoiceDetailDialog.jsx` | +44/−90 | fetches the invoice **and its lines by id** so printing is accurate from any screen; print trigger | business logic + printing |
| `src/components/reports/ReportShell.jsx` | +28/−14 | shared report shell (totals, date filter, export) | reports |
| `src/pages/Reports.jsx` | +24/−15 | report wiring on the new data layer | reports |
| `src/pages/Settings.jsx` | +39/−0 | Staff & access section + manual categories (admin only, Supabase backend only) | permissions |
| `src/pages/Register.jsx` | +23/−0 | registration state on the Supabase backend | auth |
| `src/pages/ResetPassword.jsx` | +33/−3 | Supabase password reset/update | auth |
| `src/pages/Login.jsx` | +12/−4 | backend-aware sign-in | auth |
| `src/pages/ForgotPassword.jsx` | +2/−2 | reset request via `authApi` | auth |
| `src/index.css` | +53/−0 | print rules: hide `#root`, A4 default, `receipt` (80 mm) page | printing |
| `src/lib/PageNotFound.jsx` | +3/−14 | simplified 404 | UI |
| `src/components/DataTable.jsx` | +4/−2 | table affordances (View/Edit/Delete consistency) | UI |
| `src/components/KpiCard.jsx` | +10/−3 | KPI accent rules (money in/out) | UI |
| `src/components/PartyGrid.jsx` | +14/−5 | party grid detail view | UI |
| `src/components/RowActions.jsx` | +19/−2 | uniform View (eye) / Edit (pencil) / Delete (trash) actions | UI |
| `src/components/ui/dialog.jsx` | +2/−2 | dialog print/overflow behaviour | UI |
| `src/components/forms/ArticleForm.jsx` · `CategoryForm` · `CustomerForm` · `ExpenseForm` · `SupplierForm` | +3/−3 each | `base44.entities` → `db` | database access |
| `src/components/forms/PurchaseForm.jsx` | +2/−2 | `db` import | database access |
| `src/components/reports/Kharcha|Payment|Purchase|Roznamcha|Sales Report.jsx` | +2/−2 each | `db` import | database access |
| `src/lib/reportExport.js` | +2/−2 | `db` | database access |
| `src/pages/Articles.jsx` `Customers.jsx` `Invoices.jsx` `Production.jsx` `Purchases.jsx` `RawCategoryPage.jsx` `RawStock.jsx` `ReadyShoes.jsx` `Sales.jsx` `Suppliers.jsx` `InvoiceNew.jsx` | +2…+18 | `base44.entities` → `db` reads/writes | database access |
| `src/pages/RecycleBin.jsx` | +6/−1 | recycle-bin wiring | UI |
| `src/functions/createInvoice.js` `recordProduction.js` `recordPurchase.js` `saveRawStock.js` `saveReadyStock.js` | +4…+5 / −2 each | `invokeFunction` → `callBackend({ supabaseFunction, base44Function })` | backend invocation |

**Data-layer footprint after the change:** 27 files import `db` from `@/lib/entities`; only **2** files still
reference `base44.entities` — `src/lib/entities.js` (the router itself) and `src/lib/settingsApi.js` (its explicit
Base44 branch). No screen calls the Base44 SDK directly any more.

## 5. Behavioural impact, by area

- **Database access** — all reads/writes go through one router. With `VITE_AUTH_BACKEND=base44` (the shipped
  APK/EXE default) calls go to Base44 exactly as before; with `supabase` they hit the matching Supabase table.
  The module-by-module cutover is therefore a *runtime* switch, not a fork of the code.
- **Authentication** — Supabase Auth session + five-digit PIN gate (`/unlock`, `/setup-pin`, `/change-pin`,
  `/pin-not-issued`). PIN functions are server-side, bound to `auth.uid()`, revoked from `anon`; no role can
  select `pin_hash`. Signing in with Supabase is a client-side transition (no reload); the Base44 path keeps its
  reload.
- **Permissions** — routes carry `<module>:<action>` requirements, the sidebar filters on the same grants, and
  `has_permission()` additionally requires `profiles.status = 'active'`. The screen mirror is not the security
  boundary; RLS and the functions are.
- **Offline** — failed *plain entity* writes queue in `localStorage` and replay idempotently (client-minted UUID
  → duplicate PK treated as applied). Multi-row RPC paths (`post_payment`, `create_invoice`, `record_production`,
  `save_raw_stock`, `save_ready_stock`, `record_purchase`) are deliberately **not** queued.
- **Business logic / money** — `post_payment` is the single posting path (payment + one roznamcha entry, one
  transaction); corrections by `reverse_payment`, never deletion; Kharcha = `roznamcha.source = 'kharcha'`, so an
  expense recorded in Payments appears in the cash book and Kharcha report atomically.
- **Labour** — per-earning snapshotted rates; production completions earn once (`completion_key` unique);
  stage transfers move pending pairs without earning again; `pairs_pending` is generated.
- **APK/EXE builds** — workflows gained branch triggers, Supabase variable warnings and Capacitor icon/splash
  generation from `resources/`; `capacitor.config.json` and `electron`-related files are **unchanged**.

## 6. Compatibility risks

| Risk | Assessment |
|---|---|
| Overwriting earlier `main` content | **None found.** All 186 `main` files exist in the workspace; 118 identical, 67 superseded by this work, 1 (lockfile) regenerated. |
| Business data | **Untouched.** Migrations are additive; pushing files does not apply them. The live Supabase project already has `0001`–`0012` applied, with their rollbacks available. |
| Branch triggers new CI runs | Pushing `personal-oct-11` will run both workflows. `windows-exe.yml` **still fails at "Verify Electron Configuration"** — it needs `electron/` and `electron-builder.yml`, which do not exist. **Pre-existing, not caused by this work.** |
| Supabase variables in CI | Workflows read `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from repository **variables**; unset → warning only, build ships without Supabase config. |
| Shipped APK/EXE behaviour | Unchanged: without `VITE_AUTH_BACKEND=supabase` the app runs on Base44 as before (`.env.base44-defaults` sets `supabase` for the sandbox only). |
| Module cutover re-verification | Recorded in `AGENTS.md`: sync indicator, Database Center explorer, backup panel and route/sidebar gating were exercised in the preview; the Users screen date-formatter fix and the create→recycle→purge flow were **not** re-verified. Treat per-screen Supabase checks as outstanding. |
| Secrets | Tree scan clean: no JWT-shaped strings, no password-bearing connection URL, no key/keystore material. `.env.base44-defaults` holds only a public project URL, the backend switch, and an **empty** publishable-key placeholder. |
| Lockfile convention | The repo deliberately had none (the export ships without one), so the container installs with `npm install --no-package-lock` and the workflows use `npm install`. See §7 for the reconciliation this change requires. |
| Feature parity of the rewritten screens | The 67 superseded files were reviewed through their diffs, including the heavy rewrites: `PaymentForm.jsx` (+192/−87), `Payments.jsx` (+147/−42), `Roznamcha.jsx` (+110/−61), `RoznamchaForm.jsx` (+89/−56), `InvoiceDetailDialog.jsx` (+44/−90), `Kharcha.jsx` (+55/−33). No feature present on `main` was found missing in the workspace versions, but this is a **diff-level** review — not a line-by-line feature-parity audit of every rewritten screen. Name a module if you want that done for it. |

## 7. `package-lock.json` — regenerated, not dropped

`main` carries a lockfile (lockfileVersion 3, `base44-app 0.0.0`, 638 packages, 65 deps + 18 devDeps) that the
workspace never had. It was **not deleted**: it was seeded from `main` and completed, so existing resolutions are
preserved.

```
git show origin/main:package-lock.json > package-lock.json   # 9,756 lines, main's resolutions
npm install --package-lock-only --no-audit --no-fund          # container: node v22.23.3 / npm 10.9.9
```

| Check | Result |
|---|---|
| lockfileVersion | 3 → 3 |
| package count | 638 → 647 |
| Unchanged versions | **637 of 638** |
| Added | 9 (`@supabase/supabase-js` + its 6 client subpackages, `@supabase/phoenix`, `iceberg-js`, nested `tailwindcss/…/jiti`) — all from `registry.npmjs.org`, all pulled in by `@supabase/*` itself |
| Removed | **0** |
| Root dependency block | identical + `@supabase/supabase-js` |
| `npm ci` (isolated copy, regenerated lockfile) | **exit 0 — 623 packages installed, `@supabase/supabase-js@2.117.3` present** |
| Remaining version drift | **1**: `node_modules/jiti` 1.21.7 → 2.7.0, with 1.21.7 nested under `tailwindcss` |

*Transparency note:* the first `npm ci` attempt reported `EUSAGE` (missing `@supabase/*` / mismatch on `jiti`).
That run copied the lockfile while the generator was still writing it — an artefact of the two commands racing,
not a lockfile defect. Re-run against the settled file, `npm ci` exits 0, as recorded above.

**Why the one drift happened:** `main`'s lockfile pinned top-level `jiti@1.21.7` although `nitro` requires
`jiti ^2.7.0` (an inconsistency npm had tolerated). Adding the new dependency made npm re-resolve that edge
correctly: 2.7.0 hoisted, 1.21.7 kept nested for `tailwindcss` (which requires `^1.21.7`). It is a transitive
dev-tool correction, not an upgrade of any declared dependency. No declared dependency changed version.

**Reconciliation (items 1–2 applied; item 3 still open):**

1. ~~`docker-compose.base44.yml` still passes `--no-package-lock` …~~ **Done:** the flag is dropped, so the startup
   install honours the committed lockfile, and the surrounding comment was updated.
2. ~~The stale `AGENTS.md` "no package-lock.json" note …~~ **Done:** it now records that a lockfile is committed.
3. Still open: workflows use `npm install`, which keeps working with a lockfile. Switching them to `npm ci` would
   make the APK/EXE builds reproducible — optional, and a deliberate choice.

**Why `--no-package-lock` was there at all:** the delivered export has no lockfile, so there was nothing to
install from and no reason to create one as a side effect of running the dev server. It was a sandbox
convenience, not a project requirement — the workflows never depended on it.

## 8. Recommended integration plan (pending your approval)

1. **Approve this review.** No further action until then; `main` stays untouched.
2. **Commit on the working branch only** — `personal-oct-11` — including the regenerated `package-lock.json`.
   Never a direct commit to `main`, never a force-push, never a reset.
3. **Apply the two reconciliation edits** (§7 items 1–2) in the same commit, or drop them if you prefer the
   sandbox to keep installing without the lockfile.
4. **Open a pull request `personal-oct-11` → `main`** and leave it for your review; no automatic merge.
5. **After merge, verify in this order:** the APK workflow on the pushed branch (with `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_PUBLISHABLE_KEY` repository variables set), then the per-screen Supabase checks that
   `AGENTS.md` still lists as outstanding, then the Users-screen date fix.

## 9. What this review did not verify

- No dynamic per-screen testing: this is a static diff review plus `npm ci`, `npm run build` ✓ (1.89 s) and
  `npm run lint` ✓ (0 errors; `--quiet`) run in the container, with the dev server answering HTTP 200.
- `npm run typecheck` remains a non-gate (~1,100 pre-existing JSX prop-type errors) and no test runner exists.
- The APK/EXE workflows were **not** executed here (no Android/Java toolchain in the sandbox); their behaviour
  above is read from the workflow files.
- Nothing was deployed or synchronised. The GitHub repository state was read, not written.
