-- HIKER+ Shoes Factory ERP — 0001 core schema
--
-- Additive and idempotent: safe to re-run. Creates the business tables that mirror
-- the existing Base44 entities (identical table/column naming, so the app's data
-- layer can be moved over module by module without reshaping records), plus the
-- identity, permission, PIN and audit tables the ERP needs.
--
-- Applied against an EMPTY Supabase project (verified: 0 tables, 0 users), so this
-- creates nothing over existing data. See 0001_core_schema.rollback.sql.
--
-- Ordering note: the Base44 side stays authoritative until each module is migrated;
-- this schema is written to be a faithful target, not a replacement on its own.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Keeps updated_date truthful without relying on the client.
create or replace function public.touch_updated_date() returns trigger
language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity: profiles (1:1 with auth.users), permissions, audit log
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- Five-digit PIN: only a server-side salted hash is ever stored. Never plaintext.
  pin_hash text,
  pin_failed_attempts integer not null default 0,
  pin_locked_until timestamptz,
  pin_updated_at timestamptz,
  last_login_at timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- '<module>:<action>', e.g. 'invoices:view'. A '<module>:*' grant covers the module.
  permission text not null,
  granted boolean not null default true,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  module text,
  entity text,
  entity_id text,
  details jsonb,
  success boolean not null default true,
  created_date timestamptz not null default now()
);

create index if not exists audit_logs_created_date_idx on public.audit_logs (created_date desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists user_permissions_user_idx on public.user_permissions (user_id);

-- True when the caller is an active administrator. SECURITY DEFINER so policy
-- checks never recurse into profiles' own RLS.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

-- Deny by default: a missing grant is a denial.
create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.user_permissions up
      where up.user_id = auth.uid()
        and up.granted
        and (
          up.permission = p_permission
          or up.permission = split_part(p_permission, ':', 1) || ':*'
        )
    );
$$;

-- Never logs PINs, passwords, tokens or keys — only what happened.
create or replace function public.log_audit(
  p_action text,
  p_module text default null,
  p_entity text default null,
  p_entity_id text default null,
  p_details jsonb default null,
  p_success boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, actor_email, action, module, entity, entity_id, details, success)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    p_action, p_module, p_entity, p_entity_id, p_details, p_success
  );
end $$;

-- PIN verification: server-side only, salted hash, rate-limited with lockout.
-- The browser never decides whether a PIN is correct.
create or replace function public.verify_pin(p_pin text) returns boolean
-- pgcrypto's crypt()/gen_salt() live in the `extensions` schema on Supabase, so it
-- has to be on the search_path or the hash comparison cannot be resolved.
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 15;
  v_profile public.profiles;
  v_ok boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if v_profile.id is null or v_profile.status <> 'active' then
    perform public.log_audit('pin_verify', 'auth', 'profiles', null, null, false);
    return false;
  end if;

  if v_profile.pin_locked_until is not null and v_profile.pin_locked_until > now() then
    perform public.log_audit('pin_locked', 'auth', 'profiles', v_profile.id::text, null, false);
    return false;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{5}$' then
    return false;
  end if;

  v_ok := v_profile.pin_hash is not null and crypt(p_pin, v_profile.pin_hash) = v_profile.pin_hash;

  if v_ok then
    update public.profiles
       set pin_failed_attempts = 0, pin_locked_until = null
     where id = v_profile.id;
    perform public.log_audit('pin_verify', 'auth', 'profiles', v_profile.id::text, null, true);
    return true;
  end if;

  update public.profiles
     set pin_failed_attempts = v_profile.pin_failed_attempts + 1,
         pin_locked_until = case
           when v_profile.pin_failed_attempts + 1 >= v_max_attempts
             then now() + (v_lock_minutes || ' minutes')::interval
           else v_profile.pin_locked_until
         end
   where id = v_profile.id;

  perform public.log_audit('pin_verify', 'auth', 'profiles', v_profile.id::text, null, false);
  return false;
end $$;

-- Setting a PIN is an administrator action (staff issue/reset). The PIN is hashed
-- here, server-side; it is never stored or compared in plaintext.
create or replace function public.set_pin(p_user_id uuid, p_pin text) returns boolean
-- `extensions` carries pgcrypto's crypt()/gen_salt() on Supabase.
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    perform public.log_audit('pin_set_denied', 'users', 'profiles', p_user_id::text, null, false);
    return false;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{5}$' then
    return false;
  end if;

  update public.profiles
     set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
         pin_failed_attempts = 0,
         pin_locked_until = null,
         pin_updated_at = now()
   where id = p_user_id;

  if not found then
    return false;
  end if;

  perform public.log_audit('pin_reset', 'users', 'profiles', p_user_id::text, null, true);
  return true;
end $$;

revoke all on function public.verify_pin(text) from anon;
revoke all on function public.set_pin(uuid, text) from anon;

-- ---------------------------------------------------------------------------
-- Business tables — same table/column names as the existing entities
-- ---------------------------------------------------------------------------

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text,
  category text,
  sizes jsonb,
  colors jsonb,
  upper_type text,
  sole_type text,
  unit_cost numeric,
  selling_price numeric,
  notes text,
  status text default 'active',
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.raw_categories (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  description text,
  unit_label text,
  uses_pairs boolean default false,
  fields jsonb,
  sort_order integer,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.raw_stocks (
  id uuid primary key default gen_random_uuid(),
  category text,
  item_name text,
  article_code text,
  article_id uuid,
  pack_type text,
  pairs_per_pack numeric,
  quantity numeric,
  unit text,
  total_pairs numeric,
  price numeric,
  amount numeric,
  supplier_name text,
  purchase_date date,
  custom_json jsonb,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.ready_shoes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid,
  article_code text,
  article_name text,
  batch_label text,
  carton_type text,
  pairs_per_carton numeric,
  cartons numeric,
  pairs numeric,
  source text,
  entry_date date,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.production_entries (
  id uuid primary key default gen_random_uuid(),
  article_id uuid,
  article_code text,
  article_name text,
  production_date date,
  line text,
  shift text,
  operator text,
  input_bags numeric,
  pairs_per_bag numeric,
  uppers_used_pairs numeric,
  carton_type text,
  pairs_per_carton numeric,
  output_cartons numeric,
  output_pairs numeric,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid,
  supplier_name text,
  item_name text,
  article_code text,
  category text,
  unit text,
  pack_type text,
  pairs_per_pack numeric,
  quantity numeric,
  total_pairs numeric,
  unit_price numeric,
  amount numeric,
  purchase_date date,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  address text,
  city text,
  opening_balance numeric default 0,
  notes text,
  status text default 'active',
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  address text,
  product_details text,
  opening_balance numeric default 0,
  notes text,
  status text default 'active',
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_address text,
  invoice_date date,
  invoice_time text,
  total_cartons numeric,
  total_pairs numeric,
  subtotal numeric,
  discount numeric,
  total numeric,
  received numeric,
  balance numeric,
  payment_method text,
  status text,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid,
  invoice_number text,
  customer_id uuid,
  customer_name text,
  invoice_date date,
  article_id uuid,
  article_code text,
  article_name text,
  carton_type text,
  pairs_per_carton numeric,
  cartons numeric,
  pairs numeric,
  price_per_pair numeric,
  line_total numeric,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  party_type text,
  party_id uuid,
  party_name text,
  direction text,
  amount numeric,
  payment_date date,
  method text,
  reference text,
  notes text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.roznamcha (
  id uuid primary key default gen_random_uuid(),
  entry_date date,
  direction text,
  source text,
  party_type text,
  party_id uuid,
  party_name text,
  description text,
  category text,
  amount numeric,
  method text,
  reference text,
  is_deleted boolean not null default false,
  deleted_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  tagline text,
  currency text,
  currency_symbol text,
  address text,
  phone text,
  email text,
  invoice_prefix text,
  low_stock_threshold integer,
  default_pairs_per_bag integer,
  default_pairs_per_carton integer,
  opening_cash numeric,
  footer_note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Query paths actually used by the app (party ledgers, per-article lookups,
-- invoice drill-downs, soft-delete filters, date-range reports).
create index if not exists articles_code_idx on public.articles (code);
create index if not exists raw_stocks_article_code_idx on public.raw_stocks (article_code);
create index if not exists raw_stocks_category_idx on public.raw_stocks (category);
create index if not exists raw_stocks_purchase_date_idx on public.raw_stocks (purchase_date);
create index if not exists ready_shoes_article_code_idx on public.ready_shoes (article_code);
create index if not exists production_entries_article_code_idx on public.production_entries (article_code);
create index if not exists production_entries_date_idx on public.production_entries (production_date);
create index if not exists purchases_supplier_id_idx on public.purchases (supplier_id);
create index if not exists purchases_date_idx on public.purchases (purchase_date);
create index if not exists invoices_number_idx on public.invoices (invoice_number);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_date_idx on public.invoices (invoice_date);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);
create index if not exists invoice_lines_article_code_idx on public.invoice_lines (article_code);
create index if not exists payments_party_idx on public.payments (party_type, party_id);
create index if not exists payments_date_idx on public.payments (payment_date);
create index if not exists roznamcha_date_idx on public.roznamcha (entry_date);
create index if not exists roznamcha_party_idx on public.roznamcha (party_type, party_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — deny by default, enforced in the database
-- ---------------------------------------------------------------------------

-- Business tables: every action maps to a module permission. Administrators pass
-- every check through is_admin(); a missing grant is a denial.
do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('raw_categories',    'raw_stock'),
      ('raw_stocks',        'raw_stock'),
      ('ready_shoes',       'ready_shoes'),
      ('articles',          'articles'),
      ('production_entries','production'),
      ('purchases',         'purchase'),
      ('invoices',          'invoices'),
      ('invoice_lines',     'invoices'),
      ('customers',         'customers'),
      ('suppliers',         'suppliers'),
      ('payments',          'payments'),
      ('roznamcha',         'roznamcha'),
      ('settings',          'settings')
    ) as t(tbl, module)
  loop
    execute format('alter table public.%I enable row level security', m.tbl);
    execute format('revoke all on public.%I from anon', m.tbl);

    execute format('drop policy if exists %I on public.%I', m.tbl || '_select', m.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_permission(%L))',
      m.tbl || '_select', m.tbl, m.module || ':view');

    execute format('drop policy if exists %I on public.%I', m.tbl || '_insert', m.tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(%L))',
      m.tbl || '_insert', m.tbl, m.module || ':add');

    execute format('drop policy if exists %I on public.%I', m.tbl || '_update', m.tbl);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))',
      m.tbl || '_update', m.tbl, m.module || ':edit', m.module || ':edit');

    execute format('drop policy if exists %I on public.%I', m.tbl || '_delete', m.tbl);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_permission(%L))',
      m.tbl || '_delete', m.tbl, m.module || ':delete');
  end loop;
end $$;

-- profiles: you may read your own; administrators manage everyone. No user can
-- change their own role, status or PIN — those are administrator-only writes.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- user_permissions: administrators manage grants; a user may read their own.
alter table public.user_permissions enable row level security;
revoke all on public.user_permissions from anon;

drop policy if exists user_permissions_select on public.user_permissions;
create policy user_permissions_select on public.user_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_permissions_admin_insert on public.user_permissions;
create policy user_permissions_admin_insert on public.user_permissions
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists user_permissions_admin_update on public.user_permissions;
create policy user_permissions_admin_update on public.user_permissions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_permissions_admin_delete on public.user_permissions;
create policy user_permissions_admin_delete on public.user_permissions
  for delete to authenticated
  using (public.is_admin());

-- audit_logs: append-only. Administrators read; nobody edits or deletes them from
-- the client — writes go through log_audit(), which is SECURITY DEFINER.
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
revoke update, delete on public.audit_logs from authenticated;

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using (public.is_admin() or has_permission('users:audit') or has_permission('users:view'));

-- ---------------------------------------------------------------------------
-- updated_date triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'articles', 'raw_categories', 'raw_stocks', 'ready_shoes',
    'production_entries', 'purchases', 'customers', 'suppliers', 'invoices',
    'invoice_lines', 'payments', 'roznamcha', 'settings'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch_updated', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_date()',
      t || '_touch_updated', t);
  end loop;
end $$;

commit;
