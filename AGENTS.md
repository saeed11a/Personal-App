# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

## Base44 sandbox run notes

- Run the app with `docker compose -f docker-compose.base44.yml up -d` (dev server from the bind-mounted source on host port 3000). Details in `docker-compose.base44.yml`.
- A **package-lock.json is committed** (lockfileVersion 3). The export originally shipped without one, so the sandbox used `npm install --no-package-lock` and created nothing; that flag has been dropped. The container still runs `npm install` on every start — with the lockfile present it resolves from those pinned versions — because `npm ci` would wipe `node_modules` in the volume on each restart. The workflows still use `npm install`; switching them to `npm ci` is optional and would make APK/EXE builds reproducible.
- There is **no local `.env`** and the repo carries no `VITE_BASE44_APP_ID` / `VITE_BASE44_APP_BASE_URL`. Without a linked Base44 app there is no backend in the sandbox: the UI renders, `getPublicSettings()` and every entity/auth call fail, and the router falls back to the login screen. That is the expected state, not a regression — the Supabase migration is what removes this dependency. The client now detects it (`isBase44Configured` in `src/api/base44Client.js`) and skips those calls, so a fresh load shows the login screen with **no** failed requests or console errors. Do not "fix" the login screen back into calling Base44 in the sandbox.
- **Settings read/write follow the backend switch.** `src/lib/settingsApi.js` sends them to Base44 while `VITE_AUTH_BACKEND=base44` (the shipped builds) and to Supabase's `public.settings` — same columns, created by `0001` — when it is `supabase`. Before that split, every screen showing the company name, currency or packing defaults logged `Base44Error: 404` in the sandbox (`useSettings` had no backend branch). One row is created on the first save. **The other modules have not been cut over**: the dashboard stats, raw stock, articles, invoices, forms, reports and the recycle bin still call `base44.entities.*` directly, so they 404 — visibly on the dashboard as failed requests plus a console error — once you are past the PIN gate. That is the remaining module-by-module cutover, not a regression from the settings change.
- Checks run through the container: `docker compose -f docker-compose.base44.yml exec -T web npm run lint` (also `npm run typecheck`, `npm run build`).
- `.github/workflows/windows-exe.yml` is **broken**: it requires `electron/` and `electron-builder.yml`, and neither exists in this repo, so it always fails at "7. Verify Electron Configuration". Building that desktop shell is still outstanding.
- The build workflows read `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from repository **variables** (`vars.*`, not `secrets.*`) — set them in GitHub repo settings or APK/EXE builds ship without Supabase config.
- Full audit, blockers and phase plan: `docs/AUDIT.md`; per-phase status in `docs/PROGRESS.md`.
- **Database work goes through compose**, not `docker run`: the platform's managed secrets file quotes values that contain special characters, and `docker run --env-file` does **not** strip those quotes, so a connection string arrives as `"postgresql://…"` and psql silently falls back to a local socket. Compose parses it correctly. Use the `dbadmin` service (profile `tools`) — see `supabase/migrations/README.md`.
- The Supabase project `heqxvqgztkaixtgezbcw` already has the `0001_core_schema.sql` applied (16 tables, RLS on all, 61 policies, anonymous access revoked). It mirrors the Base44 entity/column names on purpose.
- `npx supabase`, the Base44 CLI and any Android/Java toolchain are **not** installed in this sandbox; APK/EXE builds happen on GitHub runners only.

## Auth backend and the PIN unlock

- `VITE_AUTH_BACKEND` picks the backend that signs users in: `'base44'` (default — what the shipped APK/EXE use) or `'supabase'`. `.env.base44-defaults` sets `supabase` for the sandbox, so the preview runs Supabase Auth and the five-digit PIN flow; nothing switches by accident. The branch lives in `src/lib/authMode.js`, `src/lib/authApi.js` and `AuthContext`.
- With `supabase`, signing in is a client-side transition (`AuthContext` subscribes to `supabase.auth.onAuthStateChange`), not a full page reload — the reload was a Base44 SDK artifact. The Base44 path keeps its reload.
- The PIN screens are `/unlock` (enter the PIN), `/setup-pin` (first time: choose five digits, then confirm them) and
  `/change-pin` (the current PIN is required). They share `src/components/PinKeypad.jsx`.
- `ProtectedRoute` sends a signed-in account with no PIN to `/setup-pin` (administrator) or `/pin-not-issued` (anyone
  else), and to `/unlock` only once a PIN exists — a PIN-less account never reaches the app, and `/unlock` itself
  bounces to `/setup-pin` when there is no PIN to check. "No PIN" is therefore never a silent bypass.
- Server-side entry points: `setup_pin()` (own account, first time only, administrators only — returns `already_set`
  once a PIN exists), `change_pin()` (own account, checks the current PIN; a wrong one counts towards the same
  five-attempt / 15-minute lockout as `verify_pin()`), `set_pin()` (an administrator issuing *someone else's*). The
  browser may call those plus `pin_status()`/`verify_pin()`; all are revoked from `anon`, and no role can select
  `pin_hash`.
- **`search_path` trap, worth remembering:** pgcrypto's `crypt()`/`gen_salt()` live in the `extensions` schema on
  Supabase, so every PIN function must be declared `set search_path = public, extensions`. Without it, setting a PIN
  fails at run time with `function gen_salt(unknown, integer) does not exist` — and `verify_pin()` hides the fault,
  because it short-circuits before hashing when `pin_hash` is null. `0005` repaired the functions that had this.
- The administrator has set their own five-digit PIN, so a fresh load lands on `/unlock` (the `/setup-pin` bounce only
  happens while no PIN exists). Never set, reset or read a PIN for them (no SQL, no `setup_pin` call, no default
  value): they enter it themselves. Because a PIN is unknown to the agent, code behind `/unlock` is only verifiable
  when the preview pane is unlocked — the platform replays the pane's session storage, which includes the
  `hiker_pin_unlocked` flag, so an unlocked pane can be driven straight into the app (verified: `/settings` renders).
- `/unlock` needs a real session, so it cannot be checked by simply opening the route. The preview browser replays the
  preview pane's storage on **every fresh load**, which discards a session created in a previous call — drive sign-in
  and the keypad inside one `preview_execute_code` script. Also do not drive `logout` from the preview: it revokes the
  shared Supabase refresh token and signs the user out of their own pane.
- `0002` is applied and the administrator profile (`hikerplusshoes@gmail.com`) exists. Do not re-run the bootstrap
  expecting changes: it returns `already_bootstrapped`.

## Staff & access (roles, departments, permissions)

- The permissions interface is the "Staff & access" section at the bottom of `/settings` (`src/components/staff/`). It
  renders only for `role = 'admin'` **and** `VITE_AUTH_BACKEND=supabase`, because `profiles` / `user_permissions` only
  exist in Supabase — with the Base44 backend the section is hidden rather than throwing RLS errors.
- `department` (0003: fixed factory list) and `role` are written straight to `profiles` through the existing
  `profiles_admin_update` policy. Access levels become `<module>:<action>` rows in `user_permissions`, the same grants
  `has_permission()` and the RLS policies already enforce — so the screen is enforcing, not just hiding menu items.
  An administrator cannot change their own role from the screen (deliberate: it would lock them out of it).
- The module list, the three access presets (No access / View only / Full access) and the per-department defaults live
  in `src/lib/permissions.js`. Editing a preset there changes what that preset writes; nothing is hard-coded in the
  database.
- Staff *accounts* are still created in Supabase Auth (dashboard "Add user"/invite): there is no in-app invite flow, and
  the section shows an empty-state note when no other profiles exist.

## Labour, payments and the accounting rules (0006, applied)

- `supabase/migrations/0006_labour_and_accounting.sql` is **applied**. It is purely additive: the Labour module
  (`labour_categories` seeded with Upper / Last Process, Machine / Sole, Finishing, plus `labours`,
  `labour_category_links`, `labour_rates`, `labour_production`, `labour_earnings`, `labour_stage_moves`), manual
  categories (`manual_categories`), and the posting functions. Rollback: `0006_labour_and_accounting.rollback.sql`.
- **One authoritative money path.** `public.post_payment(jsonb)` writes the `payments` row and its *single*
  `roznamcha` entry in one transaction, decides the direction itself (customer = in, supplier/labour = out, manual =
  the category's direction), refuses an account that does not exist in the table its type names, flags an
  over-payment as an advance, and returns the existing rows when the same `idempotency_key` is posted again.
  `public.reverse_payment(uuid, text)` posts a linked opposite entry and marks the original reversed — nothing is
  deleted (a partial unique index on `reversal_of` makes a double reversal impossible). `labour_earned()`,
  `labour_paid()`, `labour_rate_on()` and `labour_balances()` are the read side.
- **Kharcha is the expense side of the same cash book (0012, applied).** The Kharcha screen, the dashboard
  "Kharcha" card and the Kharcha report all read `roznamcha` rows with `source = 'kharcha'`. `post_payment()` now
  tags a manual posting by the direction of its category — an expense (out) is written as `source = 'kharcha'`, a
  manual receipt (in) as `'other_income'` — so an expense recorded from the Payments menu ("Other / Manual" →
  the seeded `Kharcha` category, or any expense category an administrator adds in Settings) leaves the cash book
  and appears in Kharcha in the same transaction. Existing rows keep the source they were posted with, and the
  roznamcha policies still accept all of (`kharcha`, `other_income`, `opening`, `manual`) for staff's own manual
  entries. Rollback: `0012_kharcha_ledger_link.rollback.sql`.
- **Labour quantities are server-side too.** `record_labour_production` rejects negative pairs and an identical
  entry (unique index on labour + stage + article + date + reference), `complete_labour_production` earns
  completed pairs × the rate effective on the completion date and snapshots that rate (so a later rate change never
  rewrites history, and a retry earns nothing twice — `labour_earnings.completion_key` is unique), and
  `transfer_labour_stage` moves *pending* pairs to the next stage without earning anything again. `pairs_pending`
  is a generated column, so it can never go negative.
- **RLS tightened on the financial tables.** Direct inserts/updates/deletes on `payments` are now administrator-only;
  staff must post through `post_payment`/`reverse_payment`, which check the module permission themselves. On
  `roznamcha`, staff may still keep their own manual entries (`kharcha`, `other_income`, `opening`, `manual`) but
  cannot edit or delete an entry a module produced — those are corrected with a reversal. A "view only" account
  therefore cannot post money even if it calls the API directly (verified: `42501`).
- Frontend: `src/lib/accounting.js` (postings + reads + manual categories) and `src/lib/labour.js`. The unified
  payment screen is `src/components/forms/PaymentForm.jsx` (Customer / Supplier / Labour / Other); `src/pages/Payments.jsx`
  and `src/pages/Roznamcha.jsx` now read and write Supabase. Manual categories are managed in Settings
  (`src/components/settings/ManualCategories.jsx`, administrators only). The Labour screen is `src/pages/Labour.jsx`
  with its dialogs in `src/components/labour/LabourDialogs.jsx` (`/labour`, module `labour`).
- **Menu/route gating:** `src/lib/usePermissions.js` + `src/components/RequirePermission.jsx`; the sidebar filters by
  module. This only mirrors what the database already enforces (RLS + the functions) — it is not the security
  boundary. The hook returns everything allowed when Supabase is not the backend, so the Base44 builds keep their
  previous behaviour.
- **Testing the backend without leaving data behind:** run the statements inside a transaction that is rolled back,
  acting as a real account: `select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role',
  'authenticated')::text, true); set local role authenticated;` then wrap statements in a `pg_temp.attempt(sql)`
  helper to see whether RLS admits them. Demote the admin to `user` with a view-only grant inside a *savepoint* to
  test the denials, then `rollback to savepoint`.
- **Data layer:** every screen reads and writes through `src/lib/entities.js`, which keeps the Base44 entity call
  shapes (`filter` / `create` / `update` / `delete` / `aggregate`) and sends them to Base44 while
  `VITE_AUTH_BACKEND=base44`, or to the matching Supabase table while it is `supabase`. The earlier note that the
  dashboard, stock, articles, invoices, customers, suppliers and reports "still call `base44.entities.*` directly"
  no longer describes the code. Not every one of those modules has been re-verified on Supabase since the cutover —
  check the screen you touch rather than trusting the routing alone.

## Top bar, account menu, avatars and printing (0008)

- **The top bar** (`src/components/layout/TopBar.jsx`) carries the HIKER+ wordmark, `LiveClock`, `ConnectionStatus`,
  `ThemeToggle` and `ProfileMenu`. It is `no-print`. At the 360px phone width the bar is width-tight: the HIKER+
  badge is hidden below `sm`, the clock's icon below `sm` and its date below `lg` — the label LIVE is kept at every
  width. Measure `header` children before adding anything else to it.
- **`LiveClock`** formats in `Asia/Karachi` (`src/lib/datetime.js`) whatever the device timezone is, and ticks once
  a second.
- **`useBackendStatus`** (`src/lib/useBackendStatus.js`) is the only thing that may call the connection LIVE: it
  makes a real request to the configured backend (Supabase: `profiles.select('id').limit(1)` — the one read every
  signed-in account is allowed by RLS; Base44: `app.getPublicSettings()`), at most once a minute and again when the
  tab becomes visible. Green LIVE = a recent success, amber SYNCING = a check or React Query request in flight, red
  OFFLINE = nothing verified recently. `navigator.onLine` is never used as evidence of a connection.
- **The account menu** (`src/components/layout/ProfileMenu.jsx`) shows name, email, role and department and offers
  Change PIN (→ `/change-pin`, or `/setup-pin` when the account has no PIN), Change profile picture, Switch user and
  Sign out. "Switch user" and "Sign out" both call `logout()` — this app has one identity mode, so both end the
  session and return to the login screen; neither swaps a displayed name. Every action is self-service only: the
  PIN functions are bound to `auth.uid()` and `set_own_avatar()` writes only the caller's row. Issuing or resetting
  *someone else's* PIN stays an administrator action in Staff & access.
- **Avatars (0008, applied).** `profiles.avatar_url`; `public.set_own_avatar(text)` (SECURITY DEFINER, self-only —
  a self-update RLS policy could not be used because RLS cannot restrict columns, and a policy wide enough for a
  picture would also allow a self-service role/status/PIN change); and the public-read `avatars` Storage bucket
  whose policies confine writes to `<user id>/…`. `src/lib/profileApi.js` uploads to `avatars/<user id>/avatar.<ext>`
  and saves the public URL with a `?v=` stamp. `AuthContext` carries `department` and `avatar_url` and exposes
  `refreshProfile()` so a new picture shows without a reload.
- **Printing.** `src/components/invoice/InvoicePrintView.jsx` holds the printable invoice (the invoice number,
  customer, lines, totals, payments and balance all come from the stored invoice, line rows and settings — nothing
  is templated). `InvoiceDetailDialog` adds `printing-invoice` to `<html>` while it is open, and the print rules in
  `src/index.css` hide `#root` so the printed page is the invoice alone. Default paper is A4; add `.print-receipt`
  to the print view's root to switch to the named `receipt` page (80mm). The `print:` utilities on the dialog
  unclip it (`max-h-[92vh] overflow-y-auto` would otherwise cut the printout at one screen). The layout is still
  the original one, re-cut for paper — a visual redesign is pending a reference image.
- **Testing note:** a picture upload leaves a real object in the `avatars` bucket. Direct SQL deletion from
  `storage.objects` is blocked (`storage.protect_delete()`); remove the object through the Storage API, then clear
  `profiles.avatar_url`. `delete from storage.objects …` will always fail.

## Live sync, Database Center, Users and the admin console (0010, 0011)

- **`0010_admin_console_security.sql` and `0011_sync_probe.sql` are applied.** 0010 hardens `has_permission()` so it
  also requires `profiles.status = 'active'` (deactivating an account now revokes its data access everywhere RLS is
  consulted), adds the audited `log_admin_event()`, `admin_users()` (reports `has_pin` — never the hash),
  `admin_update_user()` (self-lockout protected), triggers that audit role/status/department/permission changes, the
  `backups` history table, and `restore_table_rows()`. 0011 adds `sync_probe(since)`, which is deliberately SECURITY
  **INVOKER** so every per-table change count is filtered by the caller's own RLS.
- **A restore can only INSERT.** `restore_table_rows()` runs
  `insert … select * from jsonb_populate_recordset(…) on conflict (id) do nothing` against an allow-list of business
  tables. It can never update or delete a production row. Auth users, Storage files and project config are outside a
  data backup by design.
- **Offline outbox.** `src/lib/syncQueue.js` keeps failed *plain entity* writes in `localStorage` and replays them in
  order. `src/lib/entities.js` mints the row `id` with `crypto.randomUUID()` before the first attempt, so a replayed
  create hits the primary key (23505) and is treated as already applied instead of duplicating. **The multi-row RPC
  paths (`post_payment`, `create_invoice`, `record_production`, `save_raw_stock`, `save_ready_stock`,
  `record_purchase`) are deliberately NOT queued** — they are not keyed idempotently and a blind replay could post a
  second transaction. Those forms still require a connection and show the error inline.
- **`SyncProvider` / `useSync()`** (`src/lib/SyncContext.jsx`) is the single source of truth for the top-bar
  indicator and the panel. Green needs BOTH a verified backend and an empty outbox with no failures — internet alone
  never turns it green. It does one reconciliation pass on load, probes every 45 s, syncs on `online`/focus, and
  retries failures with exponential backoff. `ConnectionStatus` is a button; `SyncPanel` is the dialog.
- **Database Center** (`/database-center`, module `database_center`) has a live explorer, Excel/CSV/PDF export, and
  an administrator-only Backup & Restore tab (module `backup`). Reads go straight to the tables through PostgREST,
  so RLS is the boundary; no SQL is accepted from the browser; `profiles`, `user_permissions` and `audit_logs` are
  not in `EXPLORER_TABLES`, and a `HIDDEN_COLUMNS` list drops `pin_hash`/`idempotency_key` even if a table has them.
  `src/lib/xlsx.js` writes a real .xlsx by hand (ZIP + CRC-32, stored entries) — no spreadsheet dependency was added.
- **Users** (`/users`, module `users`) lists accounts via `admin_users()`, edits through `admin_update_user()`, and
  issues PINs through `set_pin()`. Creating an account needs the service_role key, so it is the only action that goes
  to the **`admin-users` Edge Function** (`supabase/functions/admin-users/index.ts`), which re-checks the caller is an
  active administrator. It is deployed — the Management API path that works is
  `POST /v1/projects/<ref>/functions/deploy?slug=admin-users` with a `metadata` part and a `file` part (plain
  `POST /functions` answers "Cannot read properties of undefined (reading 'toString')"). Redeploy after editing it;
  the access token lives in `/run/base44/app.env` as `SUPABASE_ACCESS_TOKEN` and must never be printed.
- **Trap: `Intl.DateTimeFormat.format()` throws on an ISO string** (`RangeError: Invalid time value`). PostgREST
  returns timestamps as strings, so `formatAppDate/formatAppTime/formatAppStamp` in `src/lib/datetime.js` now coerce
  through a `toDate()` guard that returns `null` for anything unreadable. Before that fix, rendering a `last_login_at`
  or `created_date` string blanked the whole app (the Users screen) with no console error. Never call
  `dateFormat.format(value)` directly again.
- **Verification status (this branch):** the sync indicator + panel, the Database Center explorer (Articles and
  Invoices), the backup panel, and route/sidebar gating were exercised in the preview. The Users screen rendered
  blank; it was traced to the date-formatter bug above and fixed, but that fix was **not re-verified in the preview**
  (the turn's preview-call budget ran out). The create→recycle→purge flow through `entities.js` was **not** driven
  either — the outbox change is additive (only a network-failed write is queued), but it is unverified here.

## Repository, branch and secrets

- Remote: `https://github.com/saeed11a/Personal-App`. Work happens on the platform's working branch
  `personal-oct-11`; `main` is never committed to, force-pushed or reset by this work. The platform's own
  authenticated sync commits and pushes the working branch at the end of each turn — **do not run `git commit`,
  `git push` or `git checkout` yourself**, and do not try to switch branches.
- **The sandbox has no GitHub credentials.** `git push` (even `--dry-run`) fails with
  `could not read Username for 'https://github.com'`. A direct push is therefore impossible here, not merely
  disallowed: getting work into `main` goes through a pull request.
- **Nothing secret may be committed.** The repo carries no real credentials: `.env.base44-defaults` holds public
  Vite defaults with an empty key placeholder, and `.env.example` documents names only. `.gitignore` ignores
  `.env` / `.env.*` (un-ignoring just those two templates) plus `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `*.key`
  and `service-account*.json`. The real values live in the managed env file `/run/base44/app.env` — never print
  one, never copy one into the repo. A tree audit (`grep` for JWT-shaped strings and `postgresql://…@…` URLs)
  must stay empty before any sync.
- `node_modules/`, `dist/` and `.vite/` are gitignored build output; `base44/.app.jsonc` is the per-user app-id
  pointer and stays ignored too.
- Checks, all through the container: `npm run build` ✓ and `npm run lint` ✓. `npm run typecheck` is **not** a
  passing gate here — it reports ~1100 pre-existing JSX prop-type errors across the untyped `.jsx` components.
  There is no automated test runner in this repo.
