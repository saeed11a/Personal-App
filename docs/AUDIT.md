# HIKER+ Shoes Factory ERP — Phase 1 Audit

Audit of the incoming source (`NEW-FINAL-BASE-App-exe.zip`, the `App-exe` branch export) plus the
current state of this working repository. Written before any application code was changed.

## 1. What was actually delivered

The git repository contained **only two files**: `NEW-FINAL-BASE-App-exe.zip` and a one-line
`README.md`. There was no application source tree on any branch. The audit therefore starts from the
ZIP, which has been laid out at the repository root as the working source tree.

| Item | Finding |
| --- | --- |
| Repo remote in this workspace | `github.com/saeed11a/Personal-App` — **not** `saeed11a/NEW-FINAL-BASE` |
| Branches present | `main`, `personal-oct-11` (working branch). No `App-exe`, no `scratch-supabase-apk-exe` |
| Source in repo before this audit | Only the ZIP + stub README |
| Source inside the ZIP | Full Base44 app export, 208 entries (React frontend + entity/function backend definitions) |

## 2. Architecture and source structure

**Framework (verified from `package.json`, not assumed):** React 18.2 + Vite 8 + TypeScript/JSX,
Tailwind 3.4 + shadcn/ui (Radix), `react-router-dom` 6, `@tanstack/react-query` 5,
`react-hook-form` + `zod`, Recharts, `jspdf`/`html2canvas` for exports.

- `src/` — frontend: 27 pages, 34 app components, 47 shadcn/ui primitives, 11 domain forms,
  7 report components, 14 `src/lib` helpers.
- `base44/entities/*.jsonc` — 14 entity schema definitions (the current "database").
- `functions/*/entry.ts` + `src/functions/*.js` — 6 server-side functions with thin frontend wrappers.
- `base44/shared/stockOps.ts` — shared server-side stock movement logic.
- `.github/workflows/` — `android-apk.yml`, `windows-exe.yml`.
- `capacitor.config.json` — `appId com.hiker.factoryerp`, `appName "HIKER Factory ERP"`, `webDir dist`.

**Backend:** hosted Base44 (entities + functions + auth). There is **no self-contained backend in
this repo**, and therefore no backend available inside this sandbox.

## 3. Current authentication and data flow

- `src/lib/AuthContext.jsx` calls `base44.app.getPublicSettings()`, then `base44.auth.me()`; token read
  from `localStorage` (`base44_access_token`) via `src/lib/app-params.js`.
- `src/components/ProtectedRoute.jsx` gates every route on `isAuthenticated`; `src/App.jsx` wraps all
  ERP routes in it and redirects to `/login`.
- Login/Register/Forgot/Reset pages all call `base44.auth.*`; Google OAuth via `loginWithProvider`.
- Data access is direct-from-browser through the SDK. Measured coupling:

| Surface | Count |
| --- | --- |
| Files importing `src/api/base44Client.js` | 40 |
| `base44.entities.*` calls, across 13 entities | 67 |
| `base44.auth.*` calls | 17 |
| `base44.functions.invoke` (behind `src/lib/invoke.js`) | 1 wrapper → 6 functions |
| `base44.app.getPublicSettings` | 1 |

Entity → module map is dense: `RawStock`, `ReadyShoes`, `Articles`, `Production`, `Purchases`,
`Invoices`/`InvoiceNew`, `Sales`, `Customers`, `Suppliers`, `Payments`, `Roznamcha`, `Kharcha`,
`RecycleBin` and all 7 report components read or write through the SDK directly.

## 4. Existing schema (as declared in `base44/entities/*.jsonc`)

- `Article` — code, name, category, sizes, colors, upper_type, sole_type, unit_cost, selling_price, notes, status, is_deleted, deleted_date
- `Customer`, `Supplier` — name, phone, address, opening_balance, status, is_deleted, deleted_date (+ city / product_details)
- `Invoice` — invoice_number, customer_*, invoice_date/time, total_cartons, total_pairs, subtotal, discount, total, received, balance, payment_method, status, is_deleted, deleted_date
- `InvoiceLine` — invoice_id/number, article_*, carton_type, pairs_per_carton, cartons, pairs, price_per_pair, line_total
- `Payment` — party_type, party_id, party_name, direction, amount, payment_date, method, reference
- `ProductionEntry` — article_*, production_date, line, shift, operator, input_bags, pairs_per_bag, uppers_used_pairs, carton_type, output_cartons, output_pairs
- `Purchase` — supplier_*, item_name, article_code, category, unit, pack_type, pairs_per_pack, quantity, total_pairs, unit_price, amount
- `RawStock` — category, item_name, article_*, pack_type, pairs_per_pack, quantity, unit, total_pairs, price, amount, supplier_name, custom_json
- `RawCategory` — name, slug, unit_label, uses_pairs, fields, sort_order
- `ReadyShoe` — article_*, batch_label, carton_type, pairs_per_carton, cartons, pairs, source, entry_date
- `Roznamcha` — entry_date, direction, source, party_*, description, category, amount, method, reference
- `Settings` — company_name, tagline, currency, address, phone, email, invoice_prefix, low_stock_threshold, default_pairs_per_bag/carton, opening_cash, footer_note
- `User` — role (`admin` | `user`) only

Every business entity carries soft-delete fields (`is_deleted`, `deleted_date`) — that is how
`RecycleBin` works, and it is why no destructive migration may ever run against these tables.

### Data-safety risks to respect

1. Money/quantity fields are plain numbers with **no database constraints**; integrity currently
   depends entirely on the 6 server-side functions. Any migration must reproduce those invariants.
2. Relationships are by **denormalised string keys** (`article_code`, `customer_name`, `invoice_number`)
   alongside ids, so re-keying rows during a migration would silently break historical records.
3. There is no `package-lock.json`, so builds are not reproducible today.
4. `Settings` has no user/permission fields and there is **no staff/user management UI** — Phase 7 is
   greenfield inside `Settings`, not a modification of an existing screen.

## 5. UI and behaviour that must stay untouched

HIKER+ branding (footprints mark, `bg-brand` sidebar), 268px sidebar with 6 groups and 18 links,
mobile sidebar overlay, top bar, KPI cards, `DataTable`/`TableShell`, `PartyGrid`/`PartyLedger`
("Kata" views), all 11 domain forms + `FormDialog`, `InvoiceLines`/`InvoiceDetailDialog`,
the 7 report components, `RecycleBin`, filters/search/date-range, export buttons (PDF/Excel/print),
`StatusPill`, `RowActions`, theme toggle, responsive rules. Plus every calculation in
`base44/shared/stockOps.ts` and the 6 functions: carton/bag conversions, `pairs_per_carton`,
historical rates, party balances, Roznamcha postings.

### Modules in the user's list that this source does **not** contain

`Labour Kata` (no page, component, entity or reference anywhere), `Database & Backup`, and
`Supplier Payments` as a separate screen (payments are served by `Payment.party_type` +
`/payments`). Nothing was removed by this audit — these are simply absent from the `App-exe`
export and need to be located before they can be preserved.

## 6. Build configuration findings

- `android-apk.yml`: checkout → Node 22 → Java 21 → requires `VITE_BASE44_APP_ID` /
  `VITE_BASE44_APP_BASE_URL` → `npm install` → `npx cap add android` → `cap sync` → `gradlew assembleDebug`
  → upload artifact. `android/` is not in the repo, so `cap add` is correct here, but the workflow
  only triggers on `main` and `App-exe`.
- `windows-exe.yml`: **broken**. Step 7 requires `electron-builder.yml` and `electron/`; neither
  exists in the repo, so the job always fails. The desktop shell still has to be written.
- Neither workflow passes Supabase variables; both need `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` repository *variables* once code depends on them.
- No `electron/`, no `android/`, no `public/`, no `package-lock.json`, no test framework, no CI for
  lint/build.

## 7. Staged implementation plan and test plan

Ordered so that nothing data-destructive happens before the replacement path is proven.

| Stage | Work | Gate before moving on |
| --- | --- | --- |
| 0 | **Done** — source in repo, sandbox run environment, Supabase client foundation | App serves on :3000, lint/build pass |
| 1 | Supabase publishable key + schema audit (read-only introspection of the existing project) | Table/column/PK/FK/RLS inventory recorded, row counts captured |
| 2 | Additive migration: Supabase tables mirroring the 14 entities + RLS, backfill from Base44, count/relationship reconciliation | Counts and sample relationships match before/after; rollback SQL recorded |
| 3 | Auth cutover: Supabase Auth login + PIN unlock (server-side salted PIN hash, rate limit, lockout), lock vs sign-out, route protection | Auth tests in Phase 14 all pass on web |
| 4 | One-time idempotent admin provisioning for `hikerplusshoes@gmail.com`, public signup disabled | Re-running setup creates no duplicate |
| 5 | Staff management + per-user menu/action permissions, enforced in DB/RLS, not just UI | Permission tests pass, including direct API calls |
| 6 | Audit logging + session policy | Logs contain no secrets |
| 7 | Module-by-module replacement of Base44 calls behind a compatibility layer | ERP regression tests pass per module |
| 8 | Android + Windows builds, offline/queue policy | Workflows green, artifacts exist, no privileged key in bundle |

**Test plan:** web build, lint, typecheck; auth suite (login, PIN, lockout, lock/sign-out, deep-link
blocking); permission suite (staff escalation attempts, direct API mutation attempts); ERP regression
suite (stock/production/sales/purchase/payments/balances + dashboard vs. detail totals, Recycle Bin
round-trip); bundle scan for privileged keys; APK/EXE artifact existence.

## 8. Hard blockers found during the audit

1. **Wrong repository / no branch control.** This workspace tracks `saeed11a/Personal-App`, not
   `saeed11a/NEW-FINAL-BASE`. Branch creation and pushing are controlled by the platform, which commits
   to the working branch `personal-oct-11`. I cannot create `scratch-supabase-apk-exe` or push to
   `main`, and I did not try.
2. **Supabase credentials missing.** Only the project URL is known. Without the publishable key the
   client cannot authenticate; without the service_role key or DB connection string the existing
   schema cannot be inspected, and no additive migration, RLS policy or administrator can be created.
3. **No backend in this sandbox.** The Base44 backend is a hosted service and this repo has no
   `VITE_BASE44_APP_ID`, so entity/auth calls cannot succeed here. The UI, routing and layout are fully
   verifiable; live data operations are not, until stage 2/3 land.
4. **APK/EXE builds cannot be verified here.** GitHub Actions runs on GitHub runners, not in this
   sandbox. Workflows can be authored and repaired, but "the APK/EXE works" cannot be claimed from here.

Phases 4–8 and 11–13 stay blocked on items 2–4. Nothing in this audit changed application behaviour,
touched Base44 data, or ran a destructive database operation.

## 9. Existing Supabase project — verified state (read-only)

Checked with the supplied keys, read-only: REST/OpenAPI and Auth admin endpoints only, no DDL, no writes,
no data read out of any table.

| Check | Result |
| --- | --- |
| Project reachable (`GET /auth/v1/settings` with the publishable key) | 200 |
| Tables exposed in `public` (`GET /rest/v1/` OpenAPI) | **0** |
| Probe `GET /rest/v1/customers` | 404 |
| Existing auth users (`GET /auth/v1/admin/users`) | **0** |
| `SUPABASE_SERVICE_ROLE_KEY` | valid, JWT role `service_role` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | valid `sb_publishable_…` key |
| `SUPABASE_DB_URL` (first value supplied) | **not a Postgres connection string** — it decoded to an `anon`-role JWT. Replaced; the corrected value is a valid Session-pooler URI and connects |

Both frontend values reach the app correctly unquoted (`https://heqxvqgz…`, `sb_publishable_7…`), so the
client configuration path works.

### Consequences for the plan

1. The existing Supabase project is **empty**: no schema, no rows, no users. Rule 7 ("never overwrite
   existing Supabase tables") is therefore satisfied trivially, and the additive-migration plan can run
   safely as soon as a DDL path exists. Nothing is at risk today because nothing is there.
2. No Supabase user exists, so the initial administrator has to be created from scratch (Phase 5) and the
   "administrator already exists" guard is a genuine no-op right now.
3. The ERP's real records (stock, invoices, parties, roznamcha, kata balances) live in the **hosted Base44
   backend**, not in Supabase. They must be exported from the live Base44 app before any cutover — the
   app already has export buttons on its report screens. That backend is not reachable from this sandbox
   (no app id, no Base44 session), so the export is a step only the account owner can perform.
4. **DDL access — resolved.** PostgREST rejects DDL, so migrations need either a real Postgres connection
   string or the Supabase Management API with a personal access token. Both are now in place (the first
   connection-string value was an `anon` JWT and has been replaced), and `supabase/migrations/0001_core_schema.sql`
   was applied through them. Apply/rollback commands: `supabase/migrations/README.md`.
   One caveat worth keeping: database commands must go through compose, because the managed secrets file
   quotes values containing special characters and only compose strips those quotes correctly — a bare
   `docker run --env-file` hands psql a quoted string and it silently connects nowhere.
