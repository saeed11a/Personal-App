# Supabase migrations

Additive, idempotent SQL for the existing Supabase project (`heqxvqgztkaixtgezbcw`).
Every file is safe to re-run.

> **State:** the project had **no tables and no users** when this work started (verified
> read-only). `0001_core_schema.sql` was applied on top of that empty project, so nothing
> existing was overwritten. The Base44 backend is still the live source of truth for the
> app's records — this schema is the migration target, not a replacement by itself.

## Apply

The database tool runs through compose because the managed secrets file quotes values
containing special characters, and compose parses that correctly (a bare `docker run
--env-file` does not — the connection string arrives with quotes attached and psql
silently falls back to a local socket).

```bash
# forward
docker compose -f docker-compose.base44.yml run --rm dbadmin \
  sh -c 'psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f /sql/migrations/0001_core_schema.sql'

# read-only inspection
docker compose -f docker-compose.base44.yml run --rm dbadmin \
  sh -c 'psql "$SUPABASE_DB_URL" -Atc "select tablename from pg_tables where schemaname = current_schema() order by 1"'
```

The same file can be pasted into the Supabase SQL editor if a connection string is not
available.

## 0002 — administrator bootstrap + PIN status (`0002_admin_bootstrap.sql`)

Applied. Adds, additively and idempotently:

- `pin_status()` — everything the unlock screen may know: whether a PIN exists and until when the account is
  locked out. Never exposes `pin_hash`.
- Column privileges on `profiles`, so the salted PIN hash cannot be read through the API even by its owner.
- `verify_pin()` / `set_pin()` execute rights moved off `anon` and `PUBLIC` (Supabase grants new functions to
  `anon` explicitly, so revoking from `PUBLIC` alone is not enough).
- `bootstrap_admin(p_email)` — one-time promotion of an existing, confirmed auth user.

Accounts are created in **Supabase Auth** (dashboard "Add user", or invite) — no password passes through this
repository. Then promote the owner:

```bash
docker compose -f docker-compose.base44.yml run --rm dbadmin \
  sh -c 'psql "$SUPABASE_DB_URL" -Atc "select public.bootstrap_admin('"'"'owner@example.com'"'"')"'
```

Returns `done`, `user_not_found` (no confirmed auth user yet), `already_bootstrapped` (an administrator already
exists — nothing is changed) or `invalid_email`. It is not callable from the app.

## 0003 — staff departments (`0003_staff_departments.sql`)

Applied. Adds the fixed `department` column to `profiles` (check constraint + index), then re-issues the column-level
SELECT grant from 0002 with `department` included — without that re-grant the browser cannot read the new column. The
department → access-level defaults themselves live in the app (`src/lib/permissions.js`), not in the database.

## 0004 — self-service PIN setup and change (`0004_pin_self_service.sql`)

Applied. Adds `setup_pin(p_pin)` — the signed-in administrator's own first-time PIN, refused with `already_set` once a
PIN exists — and `change_pin(p_current, p_new)`, which checks the current PIN and counts a wrong one towards the same
five-attempt / 15-minute lockout as `verify_pin()`. Both hash with `gen_salt('bf', 10)` inside the database, and no
caller ever sees a hash. Issuing *someone else's* PIN stays with `set_pin()` (0001).

## 0005 — PIN helpers: correct search_path (`0005_pin_helpers_search_path.sql`)

Applied. Repairs a defect in 0001/0004: those functions were declared `set search_path = public` only, but pgcrypto's
`crypt()`/`gen_salt()` live in Supabase's `extensions` schema, so setting a PIN failed at run time with
`function gen_salt(unknown, integer) does not exist`. The migration issues
`ALTER FUNCTION … SET search_path = public, extensions` for `verify_pin`, `set_pin`, `setup_pin` and `change_pin`; 0001
and 0004 carry the corrected declaration as well, so a fresh apply is right from the start. If that error ever
reappears, check the function's `search_path` first.

## Rollback

`0001_core_schema.rollback.sql` drops everything the forward migration created, **including
data**. Read its header before running it.

## What 0001 creates

- Business tables mirroring the Base44 entities with identical names, so records can be
  moved over without reshaping: `articles`, `raw_categories`, `raw_stocks`, `ready_shoes`,
  `production_entries`, `purchases`, `customers`, `suppliers`, `invoices`, `invoice_lines`,
  `payments`, `roznamcha`, `settings`.
- Identity and security: `profiles` (1:1 with `auth.users`, role, status, salted PIN hash,
  attempt counter, lockout), `user_permissions` (`<module>:<action>` grants), `audit_logs`
  (append-only).
- Deny-by-default RLS on every table. Administrators pass through `is_admin()`; staff need an
  explicit grant through `has_permission('<module>:<action>')`. Anonymous access is revoked.
- Server-side `verify_pin()` (salted hash comparison, 5 failed attempts then a 15-minute
  lockout, audit entry per attempt) and `set_pin()` (administrator-only).
- Money and quantity columns are unbounded `numeric`, so imported values are never rounded.

## Not yet in place

- The initial administrator row (Phase 5) — a separate, idempotent provisioning step.
- The app still reads and writes through Base44; no module has been switched to Supabase yet.
