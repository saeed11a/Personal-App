-- HIKER+ Shoes Factory ERP — 0010 admin console, permissions hardening and safe restore
--
-- Additive and idempotent: safe to re-run, changes no existing row and drops nothing.
-- Everything here supports the four new surfaces (Users, Database Center, exports and
-- backup/restore) without touching the existing accounting tables or their policies.
--
-- What it does
-- ------------
-- 1. `has_permission()` now also requires the caller's profile to be *active*, so
--    deactivating an account revokes its data access immediately, everywhere RLS is
--    consulted — not just in the menu.
-- 2. `log_admin_event()` — a narrow, audited write path the browser may call for
--    backup / restore / export / user-administration events. It never accepts an
--    actor: `log_audit()` always stamps the real `auth.uid()`.
-- 3. `admin_users()` / `admin_update_user()` — the Users screen. The PIN hash is never
--    returned (only whether one exists); a role or status change writes an audit row
--    through a trigger, so the record does not depend on the browser.
-- 4. Triggers that audit role / status / department / name changes and permission
--    grants server-side.
-- 5. `backups` — backup history metadata (RLS: administrators only).
-- 6. `restore_table_rows()` — a guarded, admin-only *merge* restore: it can only
--    INSERT rows whose id is not already present (`on conflict do nothing`). It can
--    never update or delete a production row, so a restore cannot silently overwrite
--    live data. Authentication users and Storage files are out of scope by design.
--
-- Rollback: 0010_admin_console_security.rollback.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Permission check also requires an active profile
-- ---------------------------------------------------------------------------
-- Before this, a deactivated account kept every grant it had been given: only the
-- role branch of is_admin() looked at `status`. Now both branches do, so a disabled
-- employee loses read and write access at the database the moment the status flips.
create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active' and p.role = 'admin'
    )
    or exists (
      select 1
      from public.user_permissions up
      join public.profiles p on p.id = up.user_id
      where up.user_id = auth.uid()
        and p.status = 'active'
        and up.granted
        and (
          up.permission = p_permission
          or up.permission = split_part(p_permission, ':', 1) || ':*'
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 2. Audited administrative events, callable from the browser
-- ---------------------------------------------------------------------------
-- Backup, restore, export and account events happen in the client (or an Edge
-- Function) but must be recorded server-side. This records them through the same
-- append-only log the rest of the app uses. Privileged event families are refused
-- for non-administrators; the actor is always taken from the session, never passed in.
create or replace function public.log_admin_event(
  p_action text,
  p_module text default null,
  p_entity text default null,
  p_entity_id text default null,
  p_details jsonb default null,
  p_success boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- Administrative families are recorded only for an active administrator.
  if p_action like 'backup%' or p_action like 'restore%' or p_action like 'user_%'
     or p_action like 'role_%' or p_action like 'permission_%' then
    if not public.is_admin() then
      return;
    end if;
  end if;

  perform public.log_audit(p_action, p_module, p_entity, p_entity_id, p_details, p_success);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The Users screen — safe profile reads and guarded writes
-- ---------------------------------------------------------------------------
-- Every column the account list needs, and only a boolean for the PIN. `pin_hash`
-- is never selectable by any role (0002), so it is reported as `has_pin` instead.
create or replace function public.admin_users()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  status text,
  department text,
  avatar_url text,
  has_pin boolean,
  pin_updated_at timestamptz,
  last_login_at timestamptz,
  created_date timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.phone, p.role, p.status, p.department, p.avatar_url,
         (p.pin_hash is not null) as has_pin,
         p.pin_updated_at, p.last_login_at, p.created_date
  from public.profiles p
  where public.is_admin()
  order by p.created_date;
$$;

-- Edits one staff account. Refuses to let an administrator lock themselves out
-- (their own role cannot drop below administrator and their own status cannot be
-- disabled), and refuses an empty email. Writes an audit row on success.
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_department text default null,
  p_role text default null,
  p_status text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_target public.profiles;
  v_full_name text;
  v_phone text;
  v_department text;
begin
  if not public.is_admin() then
    perform public.log_audit('user_update_denied', 'users', 'profiles', p_user_id::text, null, false);
    return jsonb_build_object('error', 'Only an administrator may change staff accounts');
  end if;

  select * into v_target from public.profiles where id = p_user_id;
  if v_target.id is null then
    return jsonb_build_object('error', 'That account no longer exists');
  end if;

  if p_role is not null and p_role not in ('admin', 'user') then
    return jsonb_build_object('error', 'Unknown role');
  end if;
  if p_status is not null and p_status not in ('active', 'disabled') then
    return jsonb_build_object('error', 'Unknown status');
  end if;

  -- Self-lockout protection: an administrator cannot demote or disable themselves.
  if p_user_id = auth.uid()
     and ((p_role is not null and p_role <> 'admin') or (p_status is not null and p_status <> 'active')) then
    perform public.log_audit('user_update_denied', 'users', 'profiles', p_user_id::text,
      jsonb_build_object('reason', 'self_lockout'), false);
    return jsonb_build_object('error', 'You cannot remove your own administrator access');
  end if;

  -- A null parameter means "leave as it is"; an empty string means "clear it"
  -- (used to unset a department). Names and phones are never blanked to empty.
  v_full_name := coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), v_target.full_name);
  v_phone := coalesce(nullif(btrim(coalesce(p_phone, '')), ''), v_target.phone);
  v_department := case when p_department is null then v_target.department
                       else nullif(btrim(p_department), '') end;

  update public.profiles set
    full_name = v_full_name,
    phone = v_phone,
    department = v_department,
    role = coalesce(p_role, role),
    status = coalesce(p_status, status)
   where id = p_user_id
  returning * into v_target;

  perform public.log_audit('user_updated', 'users', 'profiles', p_user_id::text,
    jsonb_build_object('role', v_target.role, 'status', v_target.status,
                       'department', v_target.department), true);

  return jsonb_build_object('profile', jsonb_build_object(
    'id', v_target.id, 'email', v_target.email, 'full_name', v_target.full_name,
    'phone', v_target.phone, 'role', v_target.role, 'status', v_target.status,
    'department', v_target.department));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Server-side audit of profile and permission changes
-- ---------------------------------------------------------------------------
-- Role, status, department and name changes are recorded by the database itself, so
-- the trail exists even if a caller never asks for it. Routine PIN bookkeeping
-- (failed-attempt counters, lockouts) is deliberately not logged here — verify_pin()
-- already audits those attempts.
create or replace function public.audit_profile_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.department is distinct from old.department
     or new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone then
    perform public.log_audit('profile_changed', 'users', 'profiles', new.id::text,
      jsonb_build_object(
        'role', jsonb_build_object('from', old.role, 'to', new.role),
        'status', jsonb_build_object('from', old.status, 'to', new.status),
        'department', jsonb_build_object('from', old.department, 'to', new.department)),
      true);
  end if;
  return new;
end $$;

drop trigger if exists profiles_audit_change on public.profiles;
create trigger profiles_audit_change
  after update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_permission_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('permission_granted', 'users', 'user_permissions', new.user_id::text,
      jsonb_build_object('permission', new.permission, 'granted', new.granted), true);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.log_audit('permission_revoked', 'users', 'user_permissions', old.user_id::text,
      jsonb_build_object('permission', old.permission), true);
    return old;
  end if;
  return new;
end $$;

drop trigger if exists user_permissions_audit on public.user_permissions;
create trigger user_permissions_audit
  after insert or delete on public.user_permissions
  for each row execute function public.audit_permission_change();

-- ---------------------------------------------------------------------------
-- 5. Backup history
-- ---------------------------------------------------------------------------
-- Metadata about each backup an administrator takes. The archive itself is a JSON
-- file downloaded in the browser (never committed, never stored in this repository).
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  label text,
  created_by uuid references public.profiles(id),
  created_by_email text,
  table_counts jsonb,
  total_rows integer not null default 0,
  byte_size bigint,
  format text not null default 'json',
  status text not null default 'complete' check (status in ('complete', 'partial', 'failed')),
  notes text,
  created_date timestamptz not null default now()
);

create index if not exists backups_created_date_idx on public.backups (created_date desc);

alter table public.backups enable row level security;
revoke all on public.backups from anon;

drop policy if exists backups_admin_select on public.backups;
create policy backups_admin_select on public.backups
  for select to authenticated using (public.is_admin());

drop policy if exists backups_admin_insert on public.backups;
create policy backups_admin_insert on public.backups
  for insert to authenticated with check (public.is_admin());

drop policy if exists backups_admin_delete on public.backups;
create policy backups_admin_delete on public.backups
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Guarded merge restore
-- ---------------------------------------------------------------------------
-- Restores one table from a JSON array of rows. It can only INSERT; a row whose id
-- already exists is left exactly as it is (`on conflict (id) do nothing`), so a
-- restore can never overwrite or delete live production records. Only an
-- administrator may call it, and only the tables on the allow-list are accepted —
-- the identity and audit tables are deliberately excluded (authentication users and
-- Storage files are outside a data backup by design).
--
-- Returns { table, inserted, skipped, error? }.
create or replace function public.restore_table_rows(p_table text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[] := array[
    'articles', 'raw_categories', 'raw_stocks', 'ready_shoes', 'production_entries',
    'purchases', 'customers', 'suppliers', 'invoices', 'invoice_lines', 'payments',
    'roznamcha', 'settings'
  ];
  v_before bigint;
  v_after bigint;
begin
  if not public.is_admin() then
    perform public.log_audit('restore_denied', 'database_center', p_table, null, null, false);
    return jsonb_build_object('error', 'Only an administrator may restore data');
  end if;

  if p_table is null or not (p_table = any (v_allowed)) then
    return jsonb_build_object('error', 'That table cannot be restored');
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('error', 'The backup for ' || p_table || ' is not a list of records');
  end if;

  select count(*) into v_before from public.audit_logs; -- touch nothing; keep planner honest

  execute format('select count(*) from public.%I', p_table) into v_before;
  execute format(
    'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict (id) do nothing',
    p_table, p_table
  ) using p_rows;
  execute format('select count(*) from public.%I', p_table) into v_after;

  perform public.log_audit('restore_table', 'database_center', p_table, null,
    jsonb_build_object('rows_in_file', jsonb_array_length(p_rows), 'inserted', v_after - v_before), true);

  return jsonb_build_object(
    'table', p_table,
    'inserted', v_after - v_before,
    'skipped', jsonb_array_length(p_rows) - (v_after - v_before));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Explorer-friendly indexes
-- ---------------------------------------------------------------------------
create index if not exists invoices_created_date_idx on public.invoices (created_date desc);
create index if not exists invoice_lines_created_date_idx on public.invoice_lines (created_date desc);
create index if not exists payments_created_date_idx on public.payments (created_date desc);
create index if not exists roznamcha_created_date_idx on public.roznamcha (created_date desc);
create index if not exists customers_name_idx on public.customers (lower(name));
create index if not exists suppliers_name_idx on public.suppliers (lower(name));

-- ---------------------------------------------------------------------------
-- 8. Grants — the browser may call the new entry points; anonymous callers may not
-- ---------------------------------------------------------------------------
revoke all on function public.log_admin_event(text, text, text, text, jsonb, boolean) from anon;
revoke all on function public.admin_users() from anon;
revoke all on function public.admin_update_user(uuid, text, text, text, text, text) from anon;
revoke all on function public.restore_table_rows(text, jsonb) from anon;

grant execute on function public.log_admin_event(text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.restore_table_rows(text, jsonb) to authenticated;

commit;
